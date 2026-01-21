/**
 * Pass 2: Batched Claim Analysis with Rate Limiting
 *
 * Analyzes each claim individually using the appropriate model based on complexity.
 * Uses batched execution to respect API rate limits (30,000 input tokens/minute).
 * Uses tool calling for guaranteed valid JSON output.
 * Includes retry logic with exponential backoff for rate limit errors.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import {
	CLAIM_ANALYSIS_SYSTEM_PROMPT,
	buildClaimAnalysisUserMessage,
	buildClaimAnalysisSystemPromptWithContext,
	buildMinimalClaimUserMessage
} from '../prompts/claimAnalysis';
import {
	chunkArray,
	delay,
	isRateLimitError,
	getRetryAfterMs,
	calculateBackoff,
	formatDuration,
	estimateTotalTime
} from '../utils/rateLimiter';
import type {
	ExtractedClaim,
	ClaimAnalysisResult,
	ClaimAnalysisRawResponse,
	MultiPassConfig,
	AnalysisContext,
	TokenUsage
} from '../types';
import type { ProgressCallback } from '../streaming';

/** Batch progress callback for streaming updates */
export type BatchProgressCallback = (progress: {
	batchIndex: number;
	totalBatches: number;
	claimIndices: number[];
	results: ClaimAnalysisResult[];
	succeeded: number;
	failed: number;
}) => void;

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
 * Analyze a single claim with retry logic for rate limit errors
 */
async function analyzeClaimWithRetry(
	claim: ExtractedClaim,
	originalContent: string,
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic,
	useCachedContext: boolean
): Promise<ClaimAnalysisResult> {
	const maxRetries = config.rateLimiting?.maxRetries ?? 3;
	const baseBackoffMs = config.rateLimiting?.retryBackoffBaseMs ?? 20000;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await analyzeIndividualClaim(
				claim,
				originalContent,
				context,
				config,
				anthropic,
				useCachedContext
			);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Check if this is a rate limit error
			if (isRateLimitError(error)) {
				if (attempt < maxRetries) {
					// Get retry delay from headers or use exponential backoff
					const retryAfterMs = getRetryAfterMs(error);
					const backoffMs =
						retryAfterMs > 0 ? retryAfterMs : calculateBackoff(attempt, baseBackoffMs);

					logger.warn(
						`[Pass 2] Rate limit hit for claim ${claim.index}, ` +
							`retry ${attempt + 1}/${maxRetries} after ${formatDuration(backoffMs)}`
					);

					await delay(backoffMs);
					continue;
				}
			}

			// Non-rate-limit error or exhausted retries, return failed result
			break;
		}
	}

	// All retries exhausted or non-retryable error
	const model = getModelForClaim(claim, config);
	return {
		claimIndex: claim.index,
		claim,
		status: 'failed',
		error: lastError?.message || 'Unknown error after retries',
		modelUsed: model,
		inputTokens: 0,
		outputTokens: 0
	};
}

/**
 * Run Pass 2: Analyze all claims with batched execution to respect rate limits
 *
 * Uses batched parallel execution to stay within API rate limits (30,000 input tokens/minute).
 * Each batch processes a small number of claims in parallel, with delays between batches.
 * Includes retry logic with exponential backoff for any rate limit errors that still occur.
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
	const batchSize = config.rateLimiting?.batchSize ?? 4;
	const batchDelayMs = config.rateLimiting?.batchDelayMs ?? 15000;

	// Split claims into batches
	const batches = chunkArray(claims, batchSize);
	const estimatedTime = estimateTotalTime(claims.length, batchSize, batchDelayMs, 3000);

	logger.info(
		`[Pass 2] Starting batched analysis of ${claims.length} claims in ${batches.length} batches ` +
			`(batch size: ${batchSize}, delay: ${formatDuration(batchDelayMs)}, ` +
			`estimated time: ${formatDuration(estimatedTime)})`
	);

	// Determine if we should use cached context
	// Cache is more efficient when analyzing multiple claims
	const useCachedContext = config.cacheTTL !== 'off' && claims.length > 1;

	const allResults: ClaimAnalysisResult[] = [];

	// Process batches sequentially
	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];
		const batchStartTime = Date.now();

		logger.info(
			`[Pass 2] Processing batch ${batchIndex + 1}/${batches.length} ` +
				`(claims ${batch[0].index}-${batch[batch.length - 1].index})`
		);

		// Process claims within batch in parallel (with retry logic)
		const batchResults = await Promise.allSettled(
			batch.map((claim) =>
				analyzeClaimWithRetry(claim, originalContent, context, config, anthropic, useCachedContext)
			)
		);

		// Collect results from this batch
		const processedResults: ClaimAnalysisResult[] = batchResults.map((result, index) => {
			if (result.status === 'fulfilled') {
				return result.value;
			} else {
				// Promise rejected (shouldn't happen since we catch errors inside)
				return {
					claimIndex: batch[index].index,
					claim: batch[index],
					status: 'failed' as const,
					error: result.reason?.message || 'Promise rejected',
					modelUsed: getModelForClaim(batch[index], config),
					inputTokens: 0,
					outputTokens: 0
				};
			}
		});

		allResults.push(...processedResults);

		const batchCompleted = processedResults.filter((r) => r.status === 'completed').length;
		const batchFailed = processedResults.filter((r) => r.status === 'failed').length;

		logger.info(
			`[Pass 2] Batch ${batchIndex + 1} completed in ${Date.now() - batchStartTime}ms: ` +
				`${batchCompleted} succeeded, ${batchFailed} failed`
		);

		// Wait before processing next batch (except for the last batch)
		if (batchIndex < batches.length - 1) {
			logger.debug(`[Pass 2] Waiting ${formatDuration(batchDelayMs)} before next batch`);
			await delay(batchDelayMs);
		}
	}

	// Calculate total usage
	const totalUsage: TokenUsage = {
		inputTokens: allResults.reduce((sum, r) => sum + r.inputTokens, 0),
		outputTokens: allResults.reduce((sum, r) => sum + r.outputTokens, 0),
		totalTokens: allResults.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0)
	};

	const completed = allResults.filter((r) => r.status === 'completed').length;
	const failed = allResults.filter((r) => r.status === 'failed').length;
	const elapsed = Date.now() - startTime;

	logger.info(
		`[Pass 2] All batches completed in ${formatDuration(elapsed)}: ` +
			`${completed}/${claims.length} succeeded, ${failed} failed`
	);

	return {
		results: allResults,
		totalUsage
	};
}

/**
 * Retry failed claims with batched execution and retry logic
 */
export async function retryFailedClaims(
	failedResults: ClaimAnalysisResult[],
	originalContent: string,
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic
): Promise<ClaimAnalysisResult[]> {
	const batchSize = config.rateLimiting?.batchSize ?? 4;
	const batchDelayMs = config.rateLimiting?.batchDelayMs ?? 15000;

	logger.info(
		`[Pass 2] Retrying ${failedResults.length} failed claims ` +
			`(batch size: ${batchSize}, delay: ${formatDuration(batchDelayMs)})`
	);

	// Split into batches
	const batches = chunkArray(failedResults, batchSize);
	const allResults: ClaimAnalysisResult[] = [];

	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];

		logger.info(`[Pass 2] Retry batch ${batchIndex + 1}/${batches.length}`);

		// Process batch in parallel with retry logic
		const batchResults = await Promise.allSettled(
			batch.map((result) =>
				analyzeClaimWithRetry(result.claim, originalContent, context, config, anthropic, false)
			)
		);

		const processedResults = batchResults.map((result, index) => {
			if (result.status === 'fulfilled') {
				return result.value;
			} else {
				return {
					...batch[index],
					error: `Retry failed: ${result.reason?.message || 'Unknown error'}`
				};
			}
		});

		allResults.push(...processedResults);

		// Wait before next batch
		if (batchIndex < batches.length - 1) {
			await delay(batchDelayMs);
		}
	}

	const succeeded = allResults.filter((r) => r.status === 'completed').length;
	logger.info(`[Pass 2] Retry completed: ${succeeded}/${failedResults.length} now succeeded`);

	return allResults;
}

/**
 * Run Pass 2 with streaming progress updates
 *
 * Same as runClaimAnalysisPass but calls onBatchComplete after each batch finishes.
 * This allows the SSE endpoint to send progress updates to the client.
 */
export async function runClaimAnalysisPassWithProgress(
	claims: ExtractedClaim[],
	originalContent: string,
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic,
	onBatchComplete?: BatchProgressCallback
): Promise<{
	results: ClaimAnalysisResult[];
	totalUsage: TokenUsage;
	totalBatches: number;
	estimatedTimeMs: number;
}> {
	const startTime = Date.now();
	const batchSize = config.rateLimiting?.batchSize ?? 4;
	const batchDelayMs = config.rateLimiting?.batchDelayMs ?? 15000;

	// Split claims into batches
	const batches = chunkArray(claims, batchSize);
	const estimatedTimeMs = estimateTotalTime(claims.length, batchSize, batchDelayMs, 3000);

	logger.info(
		`[Pass 2] Starting batched analysis of ${claims.length} claims in ${batches.length} batches ` +
			`(batch size: ${batchSize}, delay: ${formatDuration(batchDelayMs)}, ` +
			`estimated time: ${formatDuration(estimatedTimeMs)})`
	);

	// Determine if we should use cached context
	const useCachedContext = config.cacheTTL !== 'off' && claims.length > 1;

	const allResults: ClaimAnalysisResult[] = [];

	// Process batches sequentially
	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];
		const batchStartTime = Date.now();

		logger.info(
			`[Pass 2] Processing batch ${batchIndex + 1}/${batches.length} ` +
				`(claims ${batch[0].index}-${batch[batch.length - 1].index})`
		);

		// Process claims within batch in parallel (with retry logic)
		const batchResults = await Promise.allSettled(
			batch.map((claim) =>
				analyzeClaimWithRetry(claim, originalContent, context, config, anthropic, useCachedContext)
			)
		);

		// Collect results from this batch
		const processedResults: ClaimAnalysisResult[] = batchResults.map((result, index) => {
			if (result.status === 'fulfilled') {
				return result.value;
			} else {
				return {
					claimIndex: batch[index].index,
					claim: batch[index],
					status: 'failed' as const,
					error: result.reason?.message || 'Promise rejected',
					modelUsed: getModelForClaim(batch[index], config),
					inputTokens: 0,
					outputTokens: 0
				};
			}
		});

		allResults.push(...processedResults);

		const batchCompleted = processedResults.filter((r) => r.status === 'completed').length;
		const batchFailed = processedResults.filter((r) => r.status === 'failed').length;

		logger.info(
			`[Pass 2] Batch ${batchIndex + 1} completed in ${Date.now() - batchStartTime}ms: ` +
				`${batchCompleted} succeeded, ${batchFailed} failed`
		);

		// Call progress callback if provided
		if (onBatchComplete) {
			onBatchComplete({
				batchIndex,
				totalBatches: batches.length,
				claimIndices: batch.map((c) => c.index),
				results: processedResults,
				succeeded: batchCompleted,
				failed: batchFailed
			});
		}

		// Wait before processing next batch (except for the last batch)
		if (batchIndex < batches.length - 1) {
			logger.debug(`[Pass 2] Waiting ${formatDuration(batchDelayMs)} before next batch`);
			await delay(batchDelayMs);
		}
	}

	// Calculate total usage
	const totalUsage: TokenUsage = {
		inputTokens: allResults.reduce((sum, r) => sum + r.inputTokens, 0),
		outputTokens: allResults.reduce((sum, r) => sum + r.outputTokens, 0),
		totalTokens: allResults.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0)
	};

	const completed = allResults.filter((r) => r.status === 'completed').length;
	const failed = allResults.filter((r) => r.status === 'failed').length;
	const elapsed = Date.now() - startTime;

	logger.info(
		`[Pass 2] All batches completed in ${formatDuration(elapsed)}: ` +
			`${completed}/${claims.length} succeeded, ${failed} failed`
	);

	return {
		results: allResults,
		totalUsage,
		totalBatches: batches.length,
		estimatedTimeMs
	};
}
