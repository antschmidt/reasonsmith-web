/**
 * Multi-Pass Analysis Orchestrator
 *
 * Coordinates the three-pass analysis pipeline:
 * Pass 1: Claim extraction + complexity classification (Haiku)
 * Pass 2: Individual claim analysis (Sonnet/Opus)
 * Pass 3: Synthesis into final evaluation (Sonnet)
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import { runExtractionPass } from './passes/extraction';
import { runClaimAnalysisPass, runClaimAnalysisPassWithProgress } from './passes/claimAnalysis';
import { runSynthesisPass } from './passes/synthesis';
import { calculateCost } from './utils/costEstimator';
import type {
	MultiPassResult,
	MultiPassConfig,
	AnalysisContext,
	PassSummary,
	MultiPassTokenUsage,
	TokenUsage
} from './types';
import { DEFAULT_RATE_LIMIT_CONFIG } from './types';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<MultiPassConfig> = {
	complexityConfidenceThreshold: 0.65,
	cacheTTL: '5m'
};

/**
 * Run the complete multi-pass analysis pipeline
 */
export async function runMultiPassAnalysis(
	content: string,
	context: AnalysisContext,
	config: Partial<MultiPassConfig>,
	anthropic?: Anthropic
): Promise<MultiPassResult> {
	const startTime = Date.now();
	logger.info('[MultiPass] Starting multi-pass analysis pipeline');

	// Initialize Anthropic client if not provided
	const client =
		anthropic ||
		new Anthropic({
			apiKey: process.env.ANTHROPIC_API_KEY
		});

	// Merge config with defaults
	const fullConfig: MultiPassConfig = {
		strategy: config.strategy || 'multi_academic',
		maxIndividualClaims: config.maxIndividualClaims ?? 15,
		isFeatured: config.isFeatured ?? false,
		models: config.models || {
			extraction: 'claude-haiku-4-5-20251001',
			simple: 'claude-sonnet-4-5-20250929',
			moderate: 'claude-sonnet-4-5-20250929',
			complex: 'claude-opus-4-5-20251101',
			synthesis: 'claude-sonnet-4-5-20250929'
		},
		complexityConfidenceThreshold:
			config.complexityConfidenceThreshold ?? DEFAULT_CONFIG.complexityConfidenceThreshold!,
		cacheTTL: config.cacheTTL ?? DEFAULT_CONFIG.cacheTTL!,
		rateLimiting: config.rateLimiting ?? DEFAULT_RATE_LIMIT_CONFIG
	};

	const passes: PassSummary[] = [];
	const usage: MultiPassTokenUsage = {
		pass1: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		pass2: [],
		pass3: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
	};

	try {
		// ========================================
		// Pass 1: Extraction
		// ========================================
		const pass1Start = Date.now();
		logger.info('[MultiPass] Running Pass 1: Extraction');

		const extraction = await runExtractionPass(content, context, fullConfig, client);

		usage.pass1 = extraction.usage;
		passes.push({
			passNumber: 1,
			passName: 'extraction',
			status: 'completed',
			duration: Date.now() - pass1Start,
			tokenUsage: extraction.usage
		});

		logger.info(
			`[MultiPass] Pass 1 complete: ${extraction.claims.length} claims extracted (${extraction.groupedCount} grouped)`
		);

		// ========================================
		// Pass 2: Claim Analysis
		// ========================================
		const pass2Start = Date.now();
		logger.info(`[MultiPass] Running Pass 2: Analyzing ${extraction.claims.length} claims`);

		const { results: claimAnalyses, totalUsage: pass2Usage } = await runClaimAnalysisPass(
			extraction.claims,
			content,
			context,
			fullConfig,
			client
		);

		// Store individual claim usages
		usage.pass2 = claimAnalyses.map((a) => ({
			inputTokens: a.inputTokens,
			outputTokens: a.outputTokens,
			totalTokens: a.inputTokens + a.outputTokens
		}));

		const completedCount = claimAnalyses.filter((a) => a.status === 'completed').length;
		const failedCount = claimAnalyses.filter((a) => a.status === 'failed').length;

		passes.push({
			passNumber: 2,
			passName: 'claim_analysis',
			status:
				failedCount === 0
					? 'completed'
					: failedCount === claimAnalyses.length
						? 'failed'
						: 'partial',
			duration: Date.now() - pass2Start,
			tokenUsage: pass2Usage
		});

		logger.info(`[MultiPass] Pass 2 complete: ${completedCount} succeeded, ${failedCount} failed`);

		// ========================================
		// Pass 3: Synthesis
		// ========================================
		const pass3Start = Date.now();
		logger.info('[MultiPass] Running Pass 3: Synthesis');

		const { result, usage: pass3Usage } = await runSynthesisPass(
			content,
			claimAnalyses,
			context,
			fullConfig,
			client
		);

		usage.pass3 = pass3Usage;
		passes.push({
			passNumber: 3,
			passName: 'synthesis',
			status: 'completed',
			duration: Date.now() - pass3Start,
			tokenUsage: pass3Usage
		});

		logger.info(`[MultiPass] Pass 3 complete: Final score ${result.good_faith_score}`);

		// ========================================
		// Calculate totals
		// ========================================
		usage.total = calculateTotalUsage(usage);
		const estimatedCost = calculateCost(usage, fullConfig.models);

		const totalDuration = Date.now() - startTime;
		logger.info(
			`[MultiPass] Pipeline complete in ${totalDuration}ms. ` +
				`Total tokens: ${usage.total.totalTokens}. Estimated cost: ${estimatedCost.toFixed(2)}¢`
		);

		return {
			result,
			strategy: fullConfig.strategy,
			passCount: 3,
			extraction,
			claimAnalyses,
			claimsTotal: extraction.totalCount,
			claimsAnalyzed: completedCount,
			claimsFailed: failedCount,
			usage,
			estimatedCost,
			passes,
			recommendSplit: extraction.tooManyClaims ? extraction.recommendSplit : undefined
		};
	} catch (error) {
		logger.error('[MultiPass] Pipeline failed:', error);
		throw error;
	}
}

/**
 * Calculate total token usage across all passes
 */
function calculateTotalUsage(usage: MultiPassTokenUsage): TokenUsage {
	const pass2Total = usage.pass2.reduce(
		(acc, u) => ({
			inputTokens: acc.inputTokens + u.inputTokens,
			outputTokens: acc.outputTokens + u.outputTokens,
			totalTokens: acc.totalTokens + u.totalTokens
		}),
		{ inputTokens: 0, outputTokens: 0, totalTokens: 0 }
	);

	return {
		inputTokens: usage.pass1.inputTokens + pass2Total.inputTokens + usage.pass3.inputTokens,
		outputTokens: usage.pass1.outputTokens + pass2Total.outputTokens + usage.pass3.outputTokens,
		totalTokens: usage.pass1.totalTokens + pass2Total.totalTokens + usage.pass3.totalTokens,
		cacheCreationTokens:
			(usage.pass1.cacheCreationTokens || 0) + (usage.pass3.cacheCreationTokens || 0),
		cacheReadTokens: (usage.pass1.cacheReadTokens || 0) + (usage.pass3.cacheReadTokens || 0)
	};
}

/**
 * Determine if multi-pass analysis should be used
 */
export async function shouldUseMultiPass(
	content: string,
	writingStyle: string | undefined,
	showcaseContext: { title: string } | null | undefined,
	config?: { minClaimsForMultiPass?: number }
): Promise<{
	useMultiPass: boolean;
	strategy?: MultiPassConfig['strategy'];
	reason: string;
}> {
	const minClaims = config?.minClaimsForMultiPass ?? 4;

	// Featured content always uses multi-pass
	if (showcaseContext) {
		return {
			useMultiPass: true,
			strategy: 'multi_featured',
			reason: 'Featured content uses multi-pass analysis'
		};
	}

	// Academic posts with sufficient content
	if (writingStyle === 'academic') {
		// Quick heuristic for claim count
		const { quickClaimEstimate } = await import('./passes/extraction');
		const estimatedClaims = quickClaimEstimate(content);

		if (estimatedClaims >= minClaims) {
			return {
				useMultiPass: true,
				strategy: 'multi_academic',
				reason: `Academic post with ~${estimatedClaims} estimated claims (threshold: ${minClaims})`
			};
		}

		return {
			useMultiPass: false,
			reason: `Academic post with ~${estimatedClaims} estimated claims (below threshold of ${minClaims})`
		};
	}

	return {
		useMultiPass: false,
		reason: `Writing style "${writingStyle || 'unknown'}" does not qualify for multi-pass`
	};
}

// ============================================================================
// Streaming Analysis with Progress Events
// ============================================================================

import type { ProgressCallback } from './streaming';
import { createProgressEvent } from './streaming';
import { chunkArray } from './utils/rateLimiter';
import { estimateTotalTime } from './utils/rateLimiter';

/**
 * Run multi-pass analysis with streaming progress updates
 *
 * Emits SSE-compatible progress events throughout the analysis pipeline.
 * Use this for long-running analyses where the client needs real-time updates.
 */
export async function runMultiPassAnalysisWithProgress(
	content: string,
	context: AnalysisContext,
	config: Partial<MultiPassConfig>,
	onProgress: ProgressCallback,
	options?: {
		showcaseItemId?: string;
		anthropic?: Anthropic;
	}
): Promise<MultiPassResult> {
	const startTime = Date.now();
	logger.info('[MultiPass] Starting streaming multi-pass analysis pipeline');

	// Emit started event
	onProgress(
		createProgressEvent('started', startTime, {
			showcaseItemId: options?.showcaseItemId
		})
	);

	// Initialize Anthropic client if not provided
	const client =
		options?.anthropic ||
		new Anthropic({
			apiKey: process.env.ANTHROPIC_API_KEY
		});

	// Merge config with defaults
	const fullConfig: MultiPassConfig = {
		strategy: config.strategy || 'multi_academic',
		maxIndividualClaims: config.maxIndividualClaims ?? 15,
		isFeatured: config.isFeatured ?? false,
		models: config.models || {
			extraction: 'claude-haiku-4-5-20251001',
			simple: 'claude-sonnet-4-5-20250929',
			moderate: 'claude-sonnet-4-5-20250929',
			complex: 'claude-opus-4-5-20251101',
			synthesis: 'claude-sonnet-4-5-20250929'
		},
		complexityConfidenceThreshold:
			config.complexityConfidenceThreshold ?? DEFAULT_CONFIG.complexityConfidenceThreshold!,
		cacheTTL: config.cacheTTL ?? DEFAULT_CONFIG.cacheTTL!,
		rateLimiting: config.rateLimiting ?? DEFAULT_RATE_LIMIT_CONFIG
	};

	const passes: PassSummary[] = [];
	const usage: MultiPassTokenUsage = {
		pass1: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		pass2: [],
		pass3: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
	};

	try {
		// ========================================
		// Pass 1: Extraction
		// ========================================
		const pass1Start = Date.now();
		onProgress(
			createProgressEvent('pass1_started', startTime, {
				message: 'Extracting claims from content...'
			})
		);

		const extraction = await runExtractionPass(content, context, fullConfig, client);

		usage.pass1 = extraction.usage;
		passes.push({
			passNumber: 1,
			passName: 'extraction',
			status: 'completed',
			duration: Date.now() - pass1Start,
			tokenUsage: extraction.usage
		});

		onProgress(
			createProgressEvent('pass1_complete', startTime, {
				claimsExtracted: extraction.claims.length,
				claims: extraction.claims,
				usage: extraction.usage
			})
		);

		logger.info(
			`[MultiPass] Pass 1 complete: ${extraction.claims.length} claims extracted (${extraction.groupedCount} grouped)`
		);

		// ========================================
		// Pass 2: Claim Analysis with batch progress
		// ========================================
		const pass2Start = Date.now();
		const batchSize = fullConfig.rateLimiting?.batchSize ?? 4;
		const batchDelayMs = fullConfig.rateLimiting?.batchDelayMs ?? 15000;
		const batches = chunkArray(extraction.claims, batchSize);
		const estimatedTimeMs = estimateTotalTime(
			extraction.claims.length,
			batchSize,
			batchDelayMs,
			3000
		);

		onProgress(
			createProgressEvent('pass2_started', startTime, {
				totalClaims: extraction.claims.length,
				totalBatches: batches.length,
				batchSize,
				estimatedTimeMs
			})
		);

		logger.info(`[MultiPass] Running Pass 2: Analyzing ${extraction.claims.length} claims`);

		const { results: claimAnalyses, totalUsage: pass2Usage } =
			await runClaimAnalysisPassWithProgress(
				extraction.claims,
				content,
				context,
				fullConfig,
				client,
				// Batch progress callback
				(batchProgress) => {
					onProgress(
						createProgressEvent('pass2_batch_complete', startTime, {
							batchIndex: batchProgress.batchIndex,
							totalBatches: batchProgress.totalBatches,
							succeeded: batchProgress.succeeded,
							failed: batchProgress.failed,
							results: batchProgress.results
						})
					);
				}
			);

		// Store individual claim usages
		usage.pass2 = claimAnalyses.map((a) => ({
			inputTokens: a.inputTokens,
			outputTokens: a.outputTokens,
			totalTokens: a.inputTokens + a.outputTokens
		}));

		const completedCount = claimAnalyses.filter((a) => a.status === 'completed').length;
		const failedCount = claimAnalyses.filter((a) => a.status === 'failed').length;

		passes.push({
			passNumber: 2,
			passName: 'claim_analysis',
			status:
				failedCount === 0
					? 'completed'
					: failedCount === claimAnalyses.length
						? 'failed'
						: 'partial',
			duration: Date.now() - pass2Start,
			tokenUsage: pass2Usage
		});

		onProgress(
			createProgressEvent('pass2_complete', startTime, {
				totalAnalyzed: completedCount,
				totalFailed: failedCount,
				results: claimAnalyses,
				usage: pass2Usage
			})
		);

		logger.info(`[MultiPass] Pass 2 complete: ${completedCount} succeeded, ${failedCount} failed`);

		// ========================================
		// Pass 3: Synthesis
		// ========================================
		const pass3Start = Date.now();
		onProgress(
			createProgressEvent('pass3_started', startTime, {
				message: 'Synthesizing final analysis...'
			})
		);

		logger.info('[MultiPass] Running Pass 3: Synthesis');

		const { result, usage: pass3Usage } = await runSynthesisPass(
			content,
			claimAnalyses,
			context,
			fullConfig,
			client
		);

		usage.pass3 = pass3Usage;
		passes.push({
			passNumber: 3,
			passName: 'synthesis',
			status: 'completed',
			duration: Date.now() - pass3Start,
			tokenUsage: pass3Usage
		});

		onProgress(
			createProgressEvent('pass3_complete', startTime, {
				usage: pass3Usage
			})
		);

		logger.info(`[MultiPass] Pass 3 complete: Final score ${result.good_faith_score}`);

		// ========================================
		// Calculate totals and emit completion
		// ========================================
		usage.total = calculateTotalUsage(usage);
		const estimatedCost = calculateCost(usage, fullConfig.models);

		const totalDuration = Date.now() - startTime;
		logger.info(
			`[MultiPass] Pipeline complete in ${totalDuration}ms. ` +
				`Total tokens: ${usage.total.totalTokens}. Estimated cost: ${estimatedCost.toFixed(2)}¢`
		);

		const finalResult: MultiPassResult = {
			result,
			strategy: fullConfig.strategy,
			passCount: 3,
			extraction,
			claimAnalyses,
			claimsTotal: extraction.totalCount,
			claimsAnalyzed: completedCount,
			claimsFailed: failedCount,
			usage,
			estimatedCost,
			passes,
			recommendSplit: extraction.tooManyClaims ? extraction.recommendSplit : undefined
		};

		onProgress(
			createProgressEvent('complete', startTime, {
				result: finalResult
			})
		);

		return finalResult;
	} catch (error) {
		logger.error('[MultiPass] Pipeline failed:', error);

		onProgress(
			createProgressEvent('error', startTime, {
				error: error instanceof Error ? error.message : 'Unknown error',
				phase: 'pass1' // We'll update this based on where the error occurred in future
			})
		);

		throw error;
	}
}
