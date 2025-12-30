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
	// Output types
	GoodFaithResult,
	Claim,
	Argument,
	// Provider types
	ClaudeRawResponse,
	OpenAIRawResponse,
	ProviderName,
	ProviderConfig
} from './types';

export { PROVIDER_CONFIGS } from './types';

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
	CLAUDE_SPECIFIC_INSTRUCTIONS,
	OPENAI_SPECIFIC_INSTRUCTIONS,
	buildBaseSystemPrompt
} from './prompts';

// Response normalization
export {
	normalizeScore,
	getLabel,
	extractFallacies,
	normalizeClaudeResponse,
	normalizeOpenAIResponse,
	parseClaudeJsonResponse,
	isValidResponse,
	addLegacyFields
} from './response';

// Heuristic fallback
export { heuristicScore } from './heuristics';
