/**
 * Multi-Pass Analysis Module
 *
 * Exports the main orchestrator and types for multi-pass analysis.
 *
 * Three-pass architecture:
 * Pass 1: Claim extraction + complexity classification (Haiku)
 * Pass 2: Individual claim analysis (Sonnet/Opus based on complexity)
 * Pass 3: Synthesis into final evaluation (Sonnet)
 */

// Main orchestrator
export {
	runMultiPassAnalysis,
	runMultiPassAnalysisWithProgress,
	shouldUseMultiPass,
	shouldRouteToJobsWorker,
	estimateAnalysisTime
} from './orchestrator';

export type { JobsWorkerRoutingDecision } from './orchestrator';

// Individual passes (for testing/debugging)
export { runExtractionPass, quickClaimEstimate } from './passes/extraction';
export {
	runClaimAnalysisPass,
	runClaimAnalysisPassWithProgress,
	retryFailedClaims,
	getModelForClaim
} from './passes/claimAnalysis';
export { runSynthesisPass } from './passes/synthesis';

// Utilities
export { calculateCost, estimateCost, formatCost, isWithinBudget } from './utils/costEstimator';
export { routeClaimToModel, calculateRoutingStats, suggestBatchSize } from './utils/modelRouter';
export {
	buildCacheableSystemPrompt,
	buildCacheableUserMessage,
	suggestCacheTTL,
	estimateCacheSavings
} from './utils/cacheManager';

// Types
export type {
	// Core types
	ClaimComplexity,
	ClaimType,
	AnalysisStrategy,
	ClaimAnalysisStatus,

	// Pass 1 types
	ExtractedClaim,
	ExtractionResult,
	ExtractionRawResponse,

	// Pass 2 types
	ClaimAnalysisResult,
	ClaimAnalysisRawResponse,

	// Pass 3 types
	SynthesisInput,

	// Token/Usage types
	TokenUsage,
	MultiPassTokenUsage,

	// Config types
	MultiPassConfig,
	MultiPassModels,
	AnalysisContext,

	// Result types
	PassSummary,
	MultiPassResult,

	// API types
	MultiPassRequest,
	MultiPassResponse,

	// Database types
	ClaimAnalysisRow,
	ClaimAnalysisInsertInput,

	// Retry types
	RetryClaimsRequest,
	RetryClaimsResponse,

	// Session types (for reconnection/resume)
	AnalysisSessionStatus,
	AnalysisPhase,
	AnalysisErrorPhase,
	AnalysisSession,
	AnalysisSessionCreateInput,
	AnalysisSessionUpdateInput,
	ResumeAction,
	AnalysisStatusResponse,
	ResumeAnalysisRequest,
	ResynthesizeResponse
} from './types';

// Config presets
export {
	DEFAULT_MULTIPASS_MODELS,
	FEATURED_CONFIG,
	ACADEMIC_CONFIG,
	DEFAULT_RATE_LIMIT_CONFIG,
	JOBS_WORKER_CONFIG
} from './types';

export type { JobsWorkerConfig } from './types';

// Streaming utilities
export {
	formatSSEMessage,
	createProgressEvent,
	createSSEStream,
	parseSSEMessage,
	createSSEClient
} from './streaming';

export type {
	ProgressEventType,
	ProgressEvent,
	ProgressCallback,
	StartedEvent,
	Pass1StartedEvent,
	Pass1CompleteEvent,
	Pass2StartedEvent,
	Pass2BatchStartedEvent,
	Pass2BatchCompleteEvent,
	Pass2ClaimCompleteEvent,
	Pass2CompleteEvent,
	Pass3StartedEvent,
	Pass3CompleteEvent,
	CompleteEvent,
	ErrorEvent,
	SSEClient
} from './streaming';
