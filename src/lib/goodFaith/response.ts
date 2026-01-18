/**
 * Response normalization utilities for good faith analysis
 * Converts provider-specific responses to a unified format
 */

import type { GoodFaithResult, ClaudeRawResponse, OpenAIRawResponse, Claim } from './types';

/**
 * Normalize a score to 0-1 scale
 */
export function normalizeScore(score: number, scale: '0-1' | '0-100'): number {
	if (scale === '0-100') {
		return Math.max(0, Math.min(1, score / 100));
	}
	return Math.max(0, Math.min(1, score));
}

/**
 * Get a human-readable label from a normalized score (0-1)
 */
export function getLabel(score: number): string {
	if (score >= 0.8) return 'exemplary';
	if (score >= 0.6) return 'constructive';
	if (score >= 0.4) return 'neutral';
	if (score >= 0.2) return 'questionable';
	return 'hostile';
}

/**
 * Extract all unique fallacies from claims
 */
export function extractFallacies(claims: Claim[]): string[] {
	const fallacies = new Set<string>();

	claims.forEach((claim) => {
		claim.supportingArguments?.forEach((arg) => {
			arg.fallacies?.forEach((fallacy) => {
				if (fallacy && fallacy.trim()) {
					fallacies.add(fallacy.trim());
				}
			});
		});
	});

	return Array.from(fallacies);
}

/**
 * Normalize a Claude API response to the unified format
 */
export function normalizeClaudeResponse(raw: ClaudeRawResponse): GoodFaithResult {
	const normalizedScore = normalizeScore(raw.goodFaithScore ?? 50, '0-100');

	return {
		// Core scoring
		good_faith_score: normalizedScore,
		// Always derive label from score to ensure consistency with publishing requirements
		good_faith_label: getLabel(normalizedScore),

		// Detailed analysis
		claims: raw.claims ?? [],
		fallacyOverload: raw.fallacyOverload ?? false,
		cultishPhrases: raw.cultishPhrases ?? [],
		summary: raw.overallAnalysis ?? '',
		rationale: raw.overallAnalysis,
		tags: raw.tags,

		// Growth metrics
		steelmanScore: raw.steelmanScore,
		steelmanNotes: raw.steelmanNotes,
		understandingScore: raw.understandingScore,
		intellectualHumilityScore: raw.intellectualHumilityScore,
		relevanceScore: raw.relevanceScore,
		relevanceNotes: raw.relevanceNotes,

		// Metadata
		provider: 'claude',
		usedAI: true,

		// Legacy compatibility
		goodFaithScore: raw.goodFaithScore,
		goodFaithDescriptor: raw.goodFaithDescriptor,
		overallAnalysis: raw.overallAnalysis
	};
}

/**
 * Normalize an OpenAI API response to the unified format
 */
export function normalizeOpenAIResponse(raw: OpenAIRawResponse): GoodFaithResult {
	const normalizedScore = normalizeScore(raw.goodFaithScore ?? 50, '0-100');

	return {
		// Core scoring
		good_faith_score: normalizedScore,
		// Always derive label from score to ensure consistency with publishing requirements
		good_faith_label: getLabel(normalizedScore),

		// Detailed analysis
		claims: raw.claims ?? [],
		fallacyOverload: raw.fallacyOverload ?? false,
		cultishPhrases: raw.cultishPhrases ?? [],
		summary: raw.summary ?? '',
		rationale: raw.summary,
		tags: raw.tags,

		// Growth metrics
		steelmanScore: raw.steelmanScore,
		steelmanNotes: raw.steelmanNotes,
		understandingScore: raw.understandingScore,
		intellectualHumilityScore: raw.intellectualHumilityScore,
		relevanceScore: raw.relevanceScore,
		relevanceNotes: raw.relevanceNotes,

		// Metadata
		provider: 'openai',
		usedAI: true,

		// Legacy compatibility
		goodFaithScore: raw.goodFaithScore,
		goodFaithDescriptor: raw.goodFaithDescriptor
	};
}

/**
 * Parse a JSON response from Claude (handles markdown code blocks)
 */
export function parseClaudeJsonResponse(responseText: string): ClaudeRawResponse {
	let cleanedResponse = responseText.trim();

	// Strip markdown code blocks if present
	if (cleanedResponse.startsWith('```json')) {
		cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
	} else if (cleanedResponse.startsWith('```')) {
		cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
	}

	// Try to extract JSON if Claude included extra text
	const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
	if (jsonMatch) {
		cleanedResponse = jsonMatch[0];
	}

	return JSON.parse(cleanedResponse);
}

/**
 * Validate that a response has the minimum required fields
 */
export function isValidResponse(
	response: unknown
): response is ClaudeRawResponse | OpenAIRawResponse {
	if (!response || typeof response !== 'object') return false;

	const resp = response as Record<string, unknown>;

	// Must have either goodFaithScore or claims
	return (
		typeof resp.goodFaithScore === 'number' ||
		(Array.isArray(resp.claims) && resp.claims.length > 0)
	);
}

/**
 * Merge legacy fields for backward compatibility
 */
export function addLegacyFields(result: GoodFaithResult): GoodFaithResult {
	return {
		...result,
		// Some consumers expect these field names
		good_faith_score: result.good_faith_score,
		good_faith_label: result.good_faith_label,
		rationale: result.rationale || result.summary,
		usedClaude: result.provider === 'claude' && result.usedAI
	} as GoodFaithResult & { usedClaude?: boolean };
}
