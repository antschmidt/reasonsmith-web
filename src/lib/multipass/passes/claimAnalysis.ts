/**
 * Pass 2: Parallel Claim Analysis
 *
 * Analyzes each claim individually using the appropriate model based on complexity.
 * Uses Promise.allSettled for resilient parallel execution.
 * Uses tool calling for guaranteed valid JSON output.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import {
	CLAIM_ANALYSIS_SYSTEM_PROMPT,
	buildClaimAnalysisUserMessage,
	buildClaimAnalysisSystemPromptWithContext,
	buildMinimalClaimUserMessage
} from '../prompts/claimAnalysis';
import type {
	ExtractedClaim,
	ClaimAnalysisResult,
	ClaimAnalysisRawResponse,
	MultiPassConfig,
	AnalysisContext,
	TokenUsage
} from '../types';

/**
 * Tool definition for structured claim analysis output
 */
const CLAIM_ANALYSIS_TOOL: Anthropic.Tool = {
	name: 'submit_analysis',
	description: 'Submit the analysis results for this claim',
	input_schema: {
		type: 'object' as const,
		properties: {
			validityScore: {
				type: 'number',
				description: 'Logical validity score (1-10)'
			},
			evidenceScore: {
				type: 'number',
				description: 'Evidence support score (1-10)'
			},
			fallacies: {
				type: 'array',
				items: { type: 'string' },
				description: 'List of logical fallacies identified (use standard names)'
			},
			fallacyExplanations: {
				type: 'object',
				additionalProperties: { type: 'string' },
				description: 'Explanations for each fallacy identified'
			},
			assumptions: {
				type: 'array',
				items: { type: 'string' },
				description: 'Assumptions that must be true for this claim to hold'
			},
			counterArguments: {
				type: 'array',
				items: { type: 'string' },
				description: 'Strongest objections to this claim'
			},
			improvements: {
				type: 'string',
				description: 'How this claim could be strengthened'
			}
		},
		required: [
			'validityScore',
			'evidenceScore',
			'fallacies',
			'fallacyExplanations',
			'assumptions',
			'counterArguments',
			'improvements'
		]
	}
};

/**
 * Get the appropriate model for a claim based on complexity and confidence
 */
export function getModelForClaim(claim: ExtractedClaim, config: MultiPassConfig): string {
	// If confidence is below threshold, escalate to more capable model
	if (claim.complexityConfidence < config.complexityConfidenceThreshold) {
		if (claim.complexity === 'simple') {
			logger.debug(
				`[Pass 2] Escalating claim ${claim.index} from simple to moderate (confidence: ${claim.complexityConfidence})`
			);
			return config.models.moderate;
		}
		if (claim.complexity === 'moderate') {
			logger.debug(
				`[Pass 2] Escalating claim ${claim.index} from moderate to complex (confidence: ${claim.complexityConfidence})`
			);
			return config.models.complex;
		}
	}

	return config.models[claim.complexity];
}

/**
 * Analyze a single claim using tool calling for guaranteed valid JSON
 */
async function analyzeIndividualClaim(
	claim: ExtractedClaim,
	originalContent: string,
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic,
	useCachedContext: boolean = false
): Promise<ClaimAnalysisResult> {
	const startTime = Date.now();
	const model = getModelForClaim(claim, config);

	logger.debug(`[Pass 2] Analyzing claim ${claim.index} with ${model} (using tool calling)`);

	try {
		// Build request
		let systemPrompt: string;
		let userMessage: string;

		if (useCachedContext) {
			// Use cached system prompt with full context
			systemPrompt = buildClaimAnalysisSystemPromptWithContext(originalContent, context);
			userMessage = buildMinimalClaimUserMessage(claim);
		} else {
			// Include full context in user message
			systemPrompt = CLAIM_ANALYSIS_SYSTEM_PROMPT;
			userMessage = buildClaimAnalysisUserMessage(claim, originalContent, context);
		}

		const requestOptions: Parameters<typeof anthropic.messages.create>[0] = {
			model,
			max_tokens: 2048,
			temperature: 0.2,
			tools: [CLAIM_ANALYSIS_TOOL],
			tool_choice: { type: 'tool', name: 'submit_analysis' },
			messages: [
				{
					role: 'user',
					content: userMessage
				}
			]
		};

		// Apply caching if enabled and using cached context (note: extended TTL betas not compatible with tool calling)
		if (config.cacheTTL !== 'off' && useCachedContext) {
			requestOptions.system = [
				{
					type: 'text',
					text: systemPrompt,
					cache_control: { type: 'ephemeral' }
				}
			] as any;
		} else {
			requestOptions.system = systemPrompt;
		}

		const response = (await anthropic.messages.create(requestOptions)) as Anthropic.Message;

		// Extract token usage
		const inputTokens = response.usage.input_tokens;
		const outputTokens = response.usage.output_tokens;

		// Extract tool use response - guaranteed valid JSON
		const toolUseBlock = response.content.find(
			(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
		);

		if (!toolUseBlock) {
			throw new Error('No tool use response from model');
		}

		// Tool input is already parsed JSON
		const analysis = normalizeClaimAnalysisResponse(toolUseBlock.input as ClaimAnalysisRawResponse);

		logger.debug(`[Pass 2] Claim ${claim.index} analyzed in ${Date.now() - startTime}ms`);

		return {
			claimIndex: claim.index,
			claim,
			status: 'completed',
			validityScore: analysis.validityScore,
			evidenceScore: analysis.evidenceScore,
			fallacies: analysis.fallacies,
			fallacyExplanations: analysis.fallacyExplanations,
			assumptions: analysis.assumptions,
			counterArguments: analysis.counterArguments,
			improvements: analysis.improvements,
			modelUsed: model,
			inputTokens,
			outputTokens
		};
	} catch (error) {
		logger.error(`[Pass 2] Failed to analyze claim ${claim.index}:`, error);

		return {
			claimIndex: claim.index,
			claim,
			status: 'failed',
			error: error instanceof Error ? error.message : 'Unknown error',
			modelUsed: model,
			inputTokens: 0,
			outputTokens: 0
		};
	}
}

/**
 * Normalize the claim analysis response (already parsed from tool use)
 */
function normalizeClaimAnalysisResponse(input: any): ClaimAnalysisRawResponse {
	return {
		validityScore: clampScore(input.validityScore),
		evidenceScore: clampScore(input.evidenceScore),
		fallacies: Array.isArray(input.fallacies) ? input.fallacies : [],
		fallacyExplanations: input.fallacyExplanations || {},
		assumptions: Array.isArray(input.assumptions) ? input.assumptions : [],
		counterArguments: Array.isArray(input.counterArguments) ? input.counterArguments : [],
		improvements: input.improvements || ''
	};
}

/**
 * Clamp score to valid range (1-10)
 */
function clampScore(score: number | undefined): number {
	if (typeof score !== 'number') return 5;
	return Math.max(1, Math.min(10, Math.round(score)));
}

/**
 * Run Pass 2: Analyze all claims in parallel
 */
export async function runClaimAnalysisPass(
	claims: ExtractedClaim[],
	originalContent: string,
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic
): Promise<{
	results: ClaimAnalysisResult[];
	totalUsage: TokenUsage;
}> {
	const startTime = Date.now();
	logger.info(`[Pass 2] Starting parallel analysis of ${claims.length} claims`);

	// Determine if we should use cached context
	// Cache is more efficient when analyzing multiple claims
	const useCachedContext = config.cacheTTL !== 'off' && claims.length > 1;

	// Run all analyses in parallel
	const results = await Promise.allSettled(
		claims.map((claim) =>
			analyzeIndividualClaim(claim, originalContent, context, config, anthropic, useCachedContext)
		)
	);

	// Process results
	const claimResults: ClaimAnalysisResult[] = results.map((result, index) => {
		if (result.status === 'fulfilled') {
			return result.value;
		} else {
			// Promise rejected (shouldn't happen since we catch errors inside)
			return {
				claimIndex: claims[index].index,
				claim: claims[index],
				status: 'failed' as const,
				error: result.reason?.message || 'Promise rejected',
				modelUsed: getModelForClaim(claims[index], config),
				inputTokens: 0,
				outputTokens: 0
			};
		}
	});

	// Calculate total usage
	const totalUsage: TokenUsage = {
		inputTokens: claimResults.reduce((sum, r) => sum + r.inputTokens, 0),
		outputTokens: claimResults.reduce((sum, r) => sum + r.outputTokens, 0),
		totalTokens: claimResults.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0)
	};

	const completed = claimResults.filter((r) => r.status === 'completed').length;
	const failed = claimResults.filter((r) => r.status === 'failed').length;

	logger.info(
		`[Pass 2] Completed in ${Date.now() - startTime}ms: ${completed} succeeded, ${failed} failed`
	);

	return {
		results: claimResults,
		totalUsage
	};
}

/**
 * Retry failed claims
 */
export async function retryFailedClaims(
	failedResults: ClaimAnalysisResult[],
	originalContent: string,
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic
): Promise<ClaimAnalysisResult[]> {
	logger.info(`[Pass 2] Retrying ${failedResults.length} failed claims`);

	const results = await Promise.allSettled(
		failedResults.map((result) =>
			analyzeIndividualClaim(result.claim, originalContent, context, config, anthropic, false)
		)
	);

	return results.map((result, index) => {
		if (result.status === 'fulfilled') {
			return result.value;
		} else {
			return {
				...failedResults[index],
				error: `Retry failed: ${result.reason?.message || 'Unknown error'}`
			};
		}
	});
}
