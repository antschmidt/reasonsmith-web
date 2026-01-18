/**
 * Pass 1: Claim Extraction + Complexity Classification
 *
 * Uses Haiku 4.5 for fast, cost-effective extraction.
 * Extracts all claims from content and classifies complexity for model routing.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import {
	buildExtractionSystemPromptWithExamples,
	buildExtractionUserMessage
} from '../prompts/extraction';
import type {
	ExtractedClaim,
	ExtractionResult,
	ExtractionRawResponse,
	MultiPassConfig,
	AnalysisContext,
	TokenUsage
} from '../types';

/**
 * Run Pass 1: Extract claims and classify complexity
 */
// Tool definition for structured claim extraction output
const EXTRACTION_TOOL: Anthropic.Tool = {
	name: 'submit_claims',
	description: 'Submit the extracted claims from the content analysis',
	input_schema: {
		type: 'object' as const,
		properties: {
			claims: {
				type: 'array',
				description: 'Array of extracted claims',
				items: {
					type: 'object',
					properties: {
						text: {
							type: 'string',
							description: 'The exact claim text (quote or close paraphrase)'
						},
						type: {
							type: 'string',
							enum: ['factual', 'interpretive', 'evaluative', 'prescriptive'],
							description: 'Type of claim'
						},
						explicit: {
							type: 'boolean',
							description: 'True if stated directly, false if implied/assumed'
						},
						complexity: {
							type: 'string',
							enum: ['simple', 'moderate', 'complex'],
							description: 'Complexity classification'
						},
						complexityConfidence: {
							type: 'number',
							description: 'Confidence in complexity rating (0.0-1.0)'
						},
						dependsOn: {
							type: 'array',
							items: { type: 'number' },
							description: 'Array of claim indices this claim depends on'
						}
					},
					required: ['text', 'type', 'explicit', 'complexity', 'complexityConfidence', 'dependsOn']
				}
			},
			totalCount: {
				type: 'number',
				description: 'Total number of claims extracted'
			},
			tooManyClaims: {
				type: 'boolean',
				description: 'True if content has more than 15 claims'
			},
			recommendSplit: {
				type: 'string',
				description: 'If too many claims, suggestion for how to split into multiple posts'
			}
		},
		required: ['claims', 'totalCount', 'tooManyClaims']
	}
};

export async function runExtractionPass(
	content: string,
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic
): Promise<ExtractionResult> {
	const startTime = Date.now();
	logger.info('[Pass 1] Starting claim extraction with Haiku (using tool calling)');

	try {
		const systemPrompt = buildExtractionSystemPromptWithExamples();
		const userMessage = buildExtractionUserMessage(content, {
			discussionTitle: context.discussion?.title,
			discussionDescription: context.discussion?.description
		});

		// Build request with tool calling for guaranteed valid JSON
		const requestOptions: Parameters<typeof anthropic.messages.create>[0] = {
			model: config.models.extraction,
			max_tokens: 4096,
			temperature: 0.1, // Low temperature for consistent extraction
			tools: [EXTRACTION_TOOL],
			tool_choice: { type: 'tool', name: 'submit_claims' },
			messages: [
				{
					role: 'user',
					content: userMessage
				}
			]
		};

		// Apply caching if enabled
		if (config.cacheTTL !== 'off') {
			requestOptions.system = [
				{
					type: 'text',
					text: systemPrompt,
					cache_control: { type: 'ephemeral', ttl: config.cacheTTL }
				}
			] as any;
			(requestOptions as any).betas = ['extended-cache-ttl-2025-04-11'];
		} else {
			requestOptions.system = systemPrompt;
		}

		const response = (await anthropic.messages.create(requestOptions)) as Anthropic.Message;

		// Extract token usage
		const usage: TokenUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
			totalTokens: response.usage.input_tokens + response.usage.output_tokens,
			cacheCreationTokens: (response.usage as any).cache_creation_input_tokens || 0,
			cacheReadTokens: (response.usage as any).cache_read_input_tokens || 0
		};

		// Extract tool use response - guaranteed valid JSON
		const toolUseBlock = response.content.find(
			(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
		);

		if (!toolUseBlock) {
			throw new Error('No tool use response from Haiku extraction');
		}

		// Tool input is already parsed JSON - no need for JSON.parse
		const rawResult = toolUseBlock.input as ExtractionRawResponse;

		// Validate required fields
		if (!Array.isArray(rawResult.claims)) {
			throw new Error('Invalid extraction response: missing claims array');
		}

		const result = processExtractionResult(rawResult, config);

		logger.info(
			`[Pass 1] Extracted ${result.totalCount} claims in ${Date.now() - startTime}ms (${usage.inputTokens} in, ${usage.outputTokens} out)`
		);

		return {
			...result,
			usage
		};
	} catch (error) {
		logger.error('[Pass 1] Extraction failed:', error);
		throw error;
	}
}

/**
 * Process raw extraction result into final format
 */
function processExtractionResult(
	raw: ExtractionRawResponse,
	config: MultiPassConfig
): Omit<ExtractionResult, 'usage'> {
	// Add indices to claims
	const claims: ExtractedClaim[] = raw.claims.map((claim, index) => ({
		index,
		text: claim.text,
		type: validateClaimType(claim.type),
		explicit: claim.explicit ?? true,
		complexity: validateComplexity(claim.complexity),
		complexityConfidence: Math.max(0, Math.min(1, claim.complexityConfidence || 0.5)),
		dependsOn: Array.isArray(claim.dependsOn) ? claim.dependsOn : []
	}));

	// Determine if we need to group claims (for non-featured)
	let groupedCount = 0;
	let processedClaims = claims;

	if (!config.isFeatured && claims.length > config.maxIndividualClaims) {
		// For academic posts, we'll analyze up to maxIndividualClaims individually
		// and note how many were grouped
		groupedCount = claims.length - config.maxIndividualClaims;

		// Sort by complexity (analyze complex ones first) and confidence (uncertain ones get priority)
		processedClaims = [...claims].sort((a, b) => {
			// Complex > Moderate > Simple
			const complexityOrder = { complex: 0, moderate: 1, simple: 2 };
			const complexityDiff = complexityOrder[a.complexity] - complexityOrder[b.complexity];
			if (complexityDiff !== 0) return complexityDiff;

			// Lower confidence gets priority (needs better model)
			return a.complexityConfidence - b.complexityConfidence;
		});

		// Take the most important claims
		processedClaims = processedClaims.slice(0, config.maxIndividualClaims);

		// Re-sort by original index for logical flow
		processedClaims.sort((a, b) => a.index - b.index);
	}

	return {
		claims: processedClaims,
		totalCount: raw.totalCount,
		groupedCount,
		tooManyClaims: raw.tooManyClaims || claims.length > 15,
		recommendSplit: raw.recommendSplit
	};
}

/**
 * Validate and normalize claim type
 */
function validateClaimType(type: string): ExtractedClaim['type'] {
	const validTypes = ['factual', 'interpretive', 'evaluative', 'prescriptive'] as const;
	if (validTypes.includes(type as any)) {
		return type as ExtractedClaim['type'];
	}
	// Default to interpretive if invalid
	return 'interpretive';
}

/**
 * Validate and normalize complexity level
 */
function validateComplexity(complexity: string): ExtractedClaim['complexity'] {
	const validLevels = ['simple', 'moderate', 'complex'] as const;
	if (validLevels.includes(complexity as any)) {
		return complexity as ExtractedClaim['complexity'];
	}
	// Default to moderate if invalid
	return 'moderate';
}

/**
 * Quick claim count estimation (for routing decision without full extraction)
 * Uses simple heuristics - not as accurate as full extraction
 */
export function quickClaimEstimate(content: string): number {
	// Count sentences that look like claims
	const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20);

	// Filter out obvious non-claims (questions, quotes)
	const potentialClaims = sentences.filter((s) => {
		const trimmed = s.trim();
		// Skip questions
		if (trimmed.endsWith('?')) return false;
		// Skip pure quotes (starts with quote mark)
		if (trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith('>')) return false;
		// Skip very short sentences
		if (trimmed.split(/\s+/).length < 5) return false;
		return true;
	});

	// Rough estimate: about 70% of sentences are actual claims
	return Math.ceil(potentialClaims.length * 0.7);
}
