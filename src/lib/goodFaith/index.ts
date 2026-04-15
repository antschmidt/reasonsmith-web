/**
 * Good Faith Analysis Module
 *
 * Shared utilities for analyzing content across multiple AI providers.
 * This module provides:
 * - Type definitions for inputs and outputs
 * - Context building utilities
 * - Shared prompt components
 * - Response normalization
 * - Heuristic fallback scoring
 */

// Type exports
export type {
	// Input types
	GoodFaithInput,
	ImportData,
	ShowcaseContext,
	DiscussionContext,
	Citation,
	SelectedComment,
	ReviewerRegister,
	// Output types
	GoodFaithResult,
	Claim,
	Argument,
	// Provider types
	ClaudeRawResponse,
	ProviderName,
	ProviderConfig,
	WritingStyle,
	ModelConfig
} from './types';

export {
	PROVIDER_CONFIGS,
	STYLE_MODEL_MAP,
	DEFAULT_CLAUDE_MODEL,
	DEFAULT_MAX_TOKENS,
	DEFAULT_REVIEWER_REGISTER
} from './types';

// Context building
export { buildAnalysisContext, buildFullContent, hasContext } from './context';

// Prompt components
export {
	FALLACY_DEFINITIONS,
	MANIPULATIVE_LANGUAGE_PATTERNS,
	SCORING_RUBRIC,
	STEELMANNING_CRITERIA,
	INTELLECTUAL_HUMILITY_CRITERIA,
	RELEVANCE_CRITERIA,
	QUOTE_HANDLING,
	COMPOUND_ARGUMENT_HANDLING,
	OUTPUT_SCHEMA_DESCRIPTION,
	COACHING_OUTPUT_INSTRUCTIONS,
	CLAUDE_SPECIFIC_INSTRUCTIONS,
	REVIEWER_REGISTER_INSTRUCTIONS,
	REVIEWER_GUARDRAIL,
	buildBaseSystemPrompt,
	buildRegisterBlock
} from './prompts';

// Response normalization
export {
	normalizeScore,
	getLabel,
	extractFallacies,
	normalizeClaudeResponse,
	parseClaudeJsonResponse,
	isValidResponse,
	addLegacyFields,
	deriveCoachingHeadline
} from './response';

// Heuristic fallback
export { heuristicScore } from './heuristics';
