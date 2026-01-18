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
export async function runExtractionPass(
	content: string,
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic
): Promise<ExtractionResult> {
	const startTime = Date.now();
	logger.info('[Pass 1] Starting claim extraction with Haiku');

	try {
		const systemPrompt = buildExtractionSystemPromptWithExamples();
		const userMessage = buildExtractionUserMessage(content, {
			discussionTitle: context.discussion?.title,
			discussionDescription: context.discussion?.description
		});

		// Build request with optional caching
		const requestOptions: Parameters<typeof anthropic.messages.create>[0] = {
			model: config.models.extraction,
			max_tokens: 4096,
			temperature: 0.1, // Low temperature for consistent extraction
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

		// Parse response
		const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';

		if (!responseText) {
			throw new Error('Empty response from Haiku extraction');
		}

		const rawResult = parseExtractionResponse(responseText);
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
 * Parse the JSON response from Haiku
 */
function parseExtractionResponse(responseText: string): ExtractionRawResponse {
	// Handle potential markdown code blocks
	let jsonText = responseText.trim();

	if (jsonText.startsWith('```json')) {
		jsonText = jsonText.slice(7);
	} else if (jsonText.startsWith('```')) {
		jsonText = jsonText.slice(3);
	}

	if (jsonText.endsWith('```')) {
		jsonText = jsonText.slice(0, -3);
	}

	jsonText = jsonText.trim();

	// Helper to attempt parsing with optional repairs
	const tryParse = (text: string): any => JSON.parse(text);

	// Helper to repair common JSON issues from LLM output
	const repairJson = (text: string): string => {
		return (
			text
				// Fix unescaped control characters in strings
				.replace(/[\x00-\x1F\x7F]/g, (char) => {
					if (char === '\n') return '\\n';
					if (char === '\r') return '\\r';
					if (char === '\t') return '\\t';
					return '';
				})
				// Fix trailing commas before closing brackets
				.replace(/,\s*([}\]])/g, '$1')
				// Fix missing commas between array elements
				.replace(/"\s+"/g, '", "')
				// Fix missing commas between objects in arrays
				.replace(/}\s*\n\s*{/g, '},\n{')
				// Fix missing commas after strings before next property
				.replace(/"\s*\n\s*"/g, '",\n"')
		);
	};

	try {
		const parsed = tryParse(jsonText);

		// Validate required fields
		if (!Array.isArray(parsed.claims)) {
			throw new Error('Invalid extraction response: missing claims array');
		}

		return {
			claims: parsed.claims,
			totalCount: parsed.totalCount || parsed.claims.length,
			tooManyClaims: parsed.tooManyClaims || false,
			recommendSplit: parsed.recommendSplit || undefined
		};
	} catch (parseError) {
		// Try to repair and parse again
		try {
			const repaired = repairJson(jsonText);
			const parsed = tryParse(repaired);

			if (!Array.isArray(parsed.claims)) {
				throw new Error('Invalid extraction response: missing claims array');
			}

			logger.info('[Pass 1] Successfully parsed JSON after repair');
			return {
				claims: parsed.claims,
				totalCount: parsed.totalCount || parsed.claims.length,
				tooManyClaims: parsed.tooManyClaims || false,
				recommendSplit: parsed.recommendSplit || undefined
			};
		} catch (repairError) {
			// Log context around the error for debugging
			const posMatch =
				parseError instanceof Error ? parseError.message.match(/position (\d+)/) : null;
			if (posMatch) {
				const pos = parseInt(posMatch[1], 10);
				logger.error('[Pass 1] JSON error context:', {
					around: jsonText.substring(Math.max(0, pos - 100), pos + 100),
					position: pos
				});
			}
			logger.error('[Pass 1] Failed to parse extraction response:', responseText.substring(0, 500));
			throw new Error(`Failed to parse extraction response: ${parseError}`);
		}
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
