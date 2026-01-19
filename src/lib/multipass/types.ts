/**
 * Multi-pass analysis types
 *
 * Three-pass architecture:
 * Pass 1: Claim extraction + complexity classification (Haiku)
 * Pass 2: Individual claim analysis (Sonnet/Opus based on complexity)
 * Pass 3: Synthesis into final evaluation (Sonnet)
 */

import type { GoodFaithResult, GoodFaithInput } from '$lib/goodFaith/types';

// ============================================================================
// Enums and Basic Types
// ============================================================================

/** Complexity level assigned by Haiku in Pass 1 */
export type ClaimComplexity = 'simple' | 'moderate' | 'complex';

/** Type of claim identified */
export type ClaimType = 'factual' | 'interpretive' | 'evaluative' | 'prescriptive';

/** Analysis strategy */
export type AnalysisStrategy = 'single' | 'multi_featured' | 'multi_academic';

/** Status of individual claim analysis */
export type ClaimAnalysisStatus = 'pending' | 'completed' | 'failed';

// ============================================================================
// Pass 1: Extraction Types
// ============================================================================

/** A claim extracted in Pass 1 */
export interface ExtractedClaim {
	/** Zero-based index of this claim */
	index: number;
	/** The claim text (quote or close paraphrase) */
	text: string;
	/** Type of claim */
	type: ClaimType;
	/** Whether the claim is explicitly stated or implied */
	explicit: boolean;
	/** Complexity level for model routing */
	complexity: ClaimComplexity;
	/** Confidence in complexity classification (0-1). Below 0.65 triggers escalation */
	complexityConfidence: number;
	/** Indices of claims this claim logically depends on */
	dependsOn: number[];
}

/** Raw response from Pass 1 (Haiku extraction) */
export interface ExtractionRawResponse {
	claims: Array<{
		text: string;
		type: ClaimType;
		explicit: boolean;
		complexity: ClaimComplexity;
		complexityConfidence: number;
		dependsOn: number[];
	}>;
	totalCount: number;
	tooManyClaims: boolean;
	recommendSplit?: string;
}

/** Processed result from Pass 1 */
export interface ExtractionResult {
	claims: ExtractedClaim[];
	totalCount: number;
	/** Number of claims that were grouped (if over limit) */
	groupedCount: number;
	/** If true, user should consider splitting into multiple posts */
	tooManyClaims: boolean;
	/** Suggestion for how to split if too many claims */
	recommendSplit?: string;
	/** Token usage for this pass */
	usage: TokenUsage;
}

// ============================================================================
// Pass 2: Individual Claim Analysis Types
// ============================================================================

/** Raw response from analyzing a single claim */
export interface ClaimAnalysisRawResponse {
	validityScore: number;
	evidenceScore: number;
	fallacies: string[];
	fallacyExplanations: Record<string, string>;
	assumptions: string[];
	counterArguments: string[];
	improvements: string;
}

/** Result of analyzing a single claim */
export interface ClaimAnalysisResult {
	/** Index matching the extracted claim */
	claimIndex: number;
	/** The original extracted claim */
	claim: ExtractedClaim;
	/** Status of this analysis */
	status: ClaimAnalysisStatus;

	// Analysis results (when status === 'completed')
	/** Logical validity score (1-10) */
	validityScore?: number;
	/** Evidence support score (1-10) */
	evidenceScore?: number;
	/** List of identified fallacies */
	fallacies?: string[];
	/** Explanations for each fallacy */
	fallacyExplanations?: Record<string, string>;
	/** Assumptions required for this claim to hold */
	assumptions?: string[];
	/** Strongest counter-arguments */
	counterArguments?: string[];
	/** How this claim could be strengthened */
	improvements?: string;

	// Metadata
	/** Which Claude model was used */
	modelUsed: string;
	/** Input tokens consumed */
	inputTokens: number;
	/** Output tokens generated */
	outputTokens: number;

	// Error info (when status === 'failed')
	/** Error message if analysis failed */
	error?: string;
}

// ============================================================================
// Pass 3: Synthesis Types
// ============================================================================

/** Input to the synthesis pass */
export interface SynthesisInput {
	originalContent: string;
	claimAnalyses: ClaimAnalysisResult[];
	failedClaims: ClaimAnalysisResult[];
	context: AnalysisContext;
}

// ============================================================================
// Token Usage Types
// ============================================================================

/** Token usage for a single API call */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	/** Tokens used to create cache (if caching enabled) */
	cacheCreationTokens?: number;
	/** Tokens read from cache (if cache hit) */
	cacheReadTokens?: number;
}

/** Aggregated token usage across all passes */
export interface MultiPassTokenUsage {
	pass1: TokenUsage;
	pass2: TokenUsage[];
	pass3: TokenUsage;
	total: TokenUsage;
}

// ============================================================================
// Configuration Types
// ============================================================================

/** Model configuration for each pass and complexity level */
export interface MultiPassModels {
	extraction: string;
	simple: string;
	moderate: string;
	complex: string;
	synthesis: string;
}

/** Default model configuration */
export const DEFAULT_MULTIPASS_MODELS: MultiPassModels = {
	extraction: 'claude-haiku-4-5-20251001', // Haiku 4.5 for fast extraction
	simple: 'claude-sonnet-4-5-20250929',
	moderate: 'claude-sonnet-4-5-20250929',
	complex: 'claude-opus-4-5-20251101',
	synthesis: 'claude-sonnet-4-5-20250929'
};

/** Configuration for multi-pass analysis */
export interface MultiPassConfig {
	/** Analysis strategy type */
	strategy: AnalysisStrategy;
	/** Maximum claims to analyze individually (Infinity for featured) */
	maxIndividualClaims: number;
	/** Whether this is a featured analysis (unlimited claims) */
	isFeatured: boolean;
	/** Model configuration */
	models: MultiPassModels;
	/** Confidence threshold below which to escalate to more capable model */
	complexityConfidenceThreshold: number;
	/** Cache TTL setting */
	cacheTTL: 'off' | '5m' | '1h';
}

/** Default configuration for featured analyses */
export const FEATURED_CONFIG: Partial<MultiPassConfig> = {
	strategy: 'multi_featured',
	maxIndividualClaims: Infinity,
	isFeatured: true,
	complexityConfidenceThreshold: 0.65
};

/** Default configuration for academic analyses */
export const ACADEMIC_CONFIG: Partial<MultiPassConfig> = {
	strategy: 'multi_academic',
	maxIndividualClaims: 15,
	isFeatured: false,
	complexityConfidenceThreshold: 0.65
};

// ============================================================================
// Context Types
// ============================================================================

/** Context passed through all passes */
export interface AnalysisContext {
	/** Discussion metadata */
	discussion?: {
		id?: string;
		title?: string;
		description?: string;
	};
	/** Citations provided by the author */
	citations?: Array<{
		title?: string;
		url?: string;
		author?: string;
		relevantQuote?: string;
	}>;
	/** Selected comments being responded to */
	selectedComments?: Array<{
		id: string;
		content: string;
		author: string;
	}>;
	/** Showcase/featured context if applicable */
	showcaseContext?: {
		title: string;
		subtitle?: string;
		summary?: string;
	};
}

// ============================================================================
// Final Result Types
// ============================================================================

/** Summary of a single pass execution */
export interface PassSummary {
	passNumber: 1 | 2 | 3;
	passName: 'extraction' | 'claim_analysis' | 'synthesis';
	status: 'completed' | 'partial' | 'failed';
	duration: number;
	tokenUsage: TokenUsage;
}

/** Complete result from multi-pass analysis */
export interface MultiPassResult {
	/** Final synthesized result (compatible with GoodFaithResult) */
	result: GoodFaithResult;

	/** Analysis strategy used */
	strategy: AnalysisStrategy;

	/** Number of passes (always 3 for multi-pass) */
	passCount: 3;

	/** Pass 1 extraction details */
	extraction: ExtractionResult;

	/** Pass 2 individual claim analyses (for deep dive UI) */
	claimAnalyses: ClaimAnalysisResult[];

	/** Summary statistics */
	claimsTotal: number;
	claimsAnalyzed: number;
	claimsFailed: number;

	/** Token usage breakdown by pass */
	usage: MultiPassTokenUsage;

	/** Estimated cost in cents */
	estimatedCost: number;

	/** Pass execution summaries */
	passes: PassSummary[];

	/** Whether user should split into multiple posts */
	recommendSplit?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/** Request to the multi-pass analysis endpoint */
export interface MultiPassRequest {
	content: string;
	postId?: string;
	discussionVersionId?: string;
	strategy: 'featured' | 'academic';
	writingStyle?: 'quick_point' | 'journalistic' | 'academic';
	context?: AnalysisContext;
}

/** Response from the multi-pass analysis endpoint */
export interface MultiPassResponse extends MultiPassResult {
	/** Post ID if provided */
	postId?: string;
	/** Discussion version ID if provided */
	discussionVersionId?: string;
}

// ============================================================================
// Database Types (matching Hasura schema)
// ============================================================================

/** Shape of claim_analysis table row */
export interface ClaimAnalysisRow {
	id: string;
	post_id: string | null;
	discussion_version_id: string | null;
	claim_index: number;
	claim_text: string;
	claim_type: ClaimType;
	complexity_level: ClaimComplexity;
	complexity_confidence: number;
	is_explicit: boolean;
	depends_on: number[];
	analysis: ClaimAnalysisRawResponse | null;
	model_used: string;
	status: ClaimAnalysisStatus;
	error_message: string | null;
	input_tokens: number | null;
	output_tokens: number | null;
	created_at: string;
	updated_at: string;
}

/** Input for inserting claim_analysis rows */
export interface ClaimAnalysisInsertInput {
	post_id?: string;
	discussion_version_id?: string;
	claim_index: number;
	claim_text: string;
	claim_type: ClaimType;
	complexity_level: ClaimComplexity;
	complexity_confidence: number;
	is_explicit: boolean;
	depends_on: number[];
	analysis?: ClaimAnalysisRawResponse;
	model_used: string;
	status: ClaimAnalysisStatus;
	error_message?: string;
	input_tokens?: number;
	output_tokens?: number;
}

// ============================================================================
// Retry Types
// ============================================================================

/** Request to retry failed claims */
export interface RetryClaimsRequest {
	postId?: string;
	discussionVersionId?: string;
	claimIndices: number[];
}

/** Response from retry operation */
export interface RetryClaimsResponse {
	retriedClaims: ClaimAnalysisResult[];
	allClaimsComplete: boolean;
	/** Updated synthesis if all claims now complete */
	updatedResult?: GoodFaithResult;
}
