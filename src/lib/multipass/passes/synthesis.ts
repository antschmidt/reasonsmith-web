/**
 * Pass 3: Synthesis
 *
 * Combines individual claim analyses into a cohesive final evaluation.
 * Produces a GoodFaithResult compatible with the existing system.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import {
	SYNTHESIS_SYSTEM_PROMPT,
	buildSynthesisUserMessage,
	calculatePreliminaryScore
} from '../prompts/synthesis';
import type { ClaimAnalysisResult, MultiPassConfig, AnalysisContext, TokenUsage } from '../types';
import type { GoodFaithResult, Claim } from '$lib/goodFaith/types';

/**
 * Raw response from synthesis
 */
interface SynthesisRawResponse {
	claims: Claim[];
	fallacyOverload: boolean;
	goodFaithScore: number;
	goodFaithDescriptor: string;
	cultishPhrases: string[];
	tags: string[];
	overallAnalysis: string;
	steelmanScore?: number;
	steelmanNotes?: string;
	understandingScore?: number;
	intellectualHumilityScore?: number;
	relevanceScore?: number;
	relevanceNotes?: string;
}

/**
 * Run Pass 3: Synthesize claim analyses into final result
 */
export async function runSynthesisPass(
	originalContent: string,
	claimAnalyses: ClaimAnalysisResult[],
	context: AnalysisContext,
	config: MultiPassConfig,
	anthropic: Anthropic
): Promise<{
	result: GoodFaithResult;
	usage: TokenUsage;
}> {
	const startTime = Date.now();
	logger.info('[Pass 3] Starting synthesis');

	// Separate completed and failed analyses
	const completedAnalyses = claimAnalyses.filter((a) => a.status === 'completed');
	const failedAnalyses = claimAnalyses.filter((a) => a.status === 'failed');

	// If all claims failed, return a fallback result
	if (completedAnalyses.length === 0) {
		logger.warn('[Pass 3] All claims failed analysis, using fallback');
		return {
			result: createFallbackResult(claimAnalyses, failedAnalyses.length),
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
		};
	}

	try {
		const userMessage = buildSynthesisUserMessage(
			originalContent,
			completedAnalyses,
			failedAnalyses,
			context
		);

		const requestOptions: Parameters<typeof anthropic.messages.create>[0] = {
			model: config.models.synthesis,
			max_tokens: 4096,
			temperature: 0.3,
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
					text: SYNTHESIS_SYSTEM_PROMPT,
					cache_control: { type: 'ephemeral', ttl: config.cacheTTL }
				}
			] as any;
			(requestOptions as any).betas = ['extended-cache-ttl-2025-04-11'];
		} else {
			requestOptions.system = SYNTHESIS_SYSTEM_PROMPT;
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
			throw new Error('Empty response from synthesis');
		}

		const rawResult = parseSynthesisResponse(responseText);
		const result = normalizeToGoodFaithResult(rawResult, failedAnalyses.length);

		logger.info(
			`[Pass 3] Synthesis completed in ${Date.now() - startTime}ms (score: ${result.good_faith_score})`
		);

		return { result, usage };
	} catch (error) {
		logger.error('[Pass 3] Synthesis failed:', error);

		// Fall back to aggregated result from claim analyses
		return {
			result: createAggregatedResult(completedAnalyses, failedAnalyses),
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
		};
	}
}

/**
 * Parse the JSON response from synthesis
 */
function parseSynthesisResponse(responseText: string): SynthesisRawResponse {
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

	try {
		const parsed = JSON.parse(jsonText);

		return {
			claims: Array.isArray(parsed.claims) ? parsed.claims : [],
			fallacyOverload: parsed.fallacyOverload || false,
			goodFaithScore: parsed.goodFaithScore || 50,
			goodFaithDescriptor: parsed.goodFaithDescriptor || 'Neutral',
			cultishPhrases: Array.isArray(parsed.cultishPhrases) ? parsed.cultishPhrases : [],
			tags: Array.isArray(parsed.tags) ? parsed.tags : [],
			overallAnalysis: parsed.overallAnalysis || '',
			steelmanScore: parsed.steelmanScore,
			steelmanNotes: parsed.steelmanNotes,
			understandingScore: parsed.understandingScore,
			intellectualHumilityScore: parsed.intellectualHumilityScore,
			relevanceScore: parsed.relevanceScore,
			relevanceNotes: parsed.relevanceNotes
		};
	} catch (parseError) {
		logger.error('[Pass 3] Failed to parse synthesis response:', responseText.substring(0, 500));
		throw new Error(`Failed to parse synthesis response: ${parseError}`);
	}
}

/**
 * Normalize synthesis result to GoodFaithResult format
 */
function normalizeToGoodFaithResult(
	raw: SynthesisRawResponse,
	failedCount: number
): GoodFaithResult {
	// Normalize score to 0-1 scale
	const normalizedScore = Math.max(0, Math.min(1, raw.goodFaithScore / 100));

	// Determine label based on score
	const label = getScoreLabel(normalizedScore);

	return {
		good_faith_score: normalizedScore,
		good_faith_label: label,
		claims: raw.claims,
		fallacyOverload: raw.fallacyOverload,
		cultishPhrases: raw.cultishPhrases,
		summary: raw.overallAnalysis,
		tags: raw.tags,
		steelmanScore: raw.steelmanScore,
		steelmanNotes: raw.steelmanNotes,
		understandingScore: raw.understandingScore,
		intellectualHumilityScore: raw.intellectualHumilityScore,
		relevanceScore: raw.relevanceScore,
		relevanceNotes:
			failedCount > 0
				? `${raw.relevanceNotes || ''} (Note: ${failedCount} claim(s) could not be analyzed)`
				: raw.relevanceNotes,
		provider: 'claude',
		usedAI: true,
		// Legacy compatibility
		goodFaithScore: raw.goodFaithScore,
		goodFaithDescriptor: raw.goodFaithDescriptor,
		overallAnalysis: raw.overallAnalysis
	};
}

/**
 * Get label from normalized score
 */
function getScoreLabel(score: number): string {
	if (score >= 0.8) return 'exemplary';
	if (score >= 0.6) return 'constructive';
	if (score >= 0.4) return 'neutral';
	if (score >= 0.2) return 'questionable';
	return 'hostile';
}

/**
 * Create a fallback result when all analyses failed
 */
function createFallbackResult(
	claimAnalyses: ClaimAnalysisResult[],
	failedCount: number
): GoodFaithResult {
	return {
		good_faith_score: 0.5,
		good_faith_label: 'neutral',
		claims: claimAnalyses.map((a) => ({
			claim: a.claim.text,
			supportingArguments: []
		})),
		fallacyOverload: false,
		cultishPhrases: [],
		summary: `Analysis incomplete: ${failedCount} of ${claimAnalyses.length} claims could not be analyzed. Please try again.`,
		tags: [],
		provider: 'claude',
		usedAI: false,
		goodFaithScore: 50,
		goodFaithDescriptor: 'Incomplete'
	};
}

/**
 * Create an aggregated result from claim analyses (fallback if synthesis fails)
 */
function createAggregatedResult(
	completedAnalyses: ClaimAnalysisResult[],
	failedAnalyses: ClaimAnalysisResult[]
): GoodFaithResult {
	const preliminaryScore = calculatePreliminaryScore(completedAnalyses);
	const normalizedScore = preliminaryScore / 100;

	// Collect all fallacies
	const allFallacies = completedAnalyses.flatMap((a) => a.fallacies || []);
	const uniqueFallacies = [...new Set(allFallacies)];

	// Build claims structure
	const claims: Claim[] = completedAnalyses.map((a) => ({
		claim: a.claim.text,
		supportingArguments: [
			{
				argument: a.improvements || 'See individual analysis',
				score: Math.round(((a.validityScore || 5) + (a.evidenceScore || 5)) / 2),
				fallacies: a.fallacies || [],
				improvements: a.improvements
			}
		]
	}));

	// Generate summary
	const avgValidity =
		completedAnalyses.reduce((sum, a) => sum + (a.validityScore || 5), 0) /
		completedAnalyses.length;
	const avgEvidence =
		completedAnalyses.reduce((sum, a) => sum + (a.evidenceScore || 5), 0) /
		completedAnalyses.length;

	const summary =
		`Aggregated analysis of ${completedAnalyses.length} claims. ` +
		`Average validity: ${avgValidity.toFixed(1)}/10. Average evidence: ${avgEvidence.toFixed(1)}/10. ` +
		`${uniqueFallacies.length > 0 ? `Fallacies identified: ${uniqueFallacies.join(', ')}.` : 'No significant fallacies identified.'} ` +
		`${failedAnalyses.length > 0 ? `(${failedAnalyses.length} claims could not be analyzed)` : ''}`;

	return {
		good_faith_score: normalizedScore,
		good_faith_label: getScoreLabel(normalizedScore),
		claims,
		fallacyOverload: uniqueFallacies.length > 5,
		cultishPhrases: [],
		summary,
		tags: [],
		provider: 'claude',
		usedAI: true,
		goodFaithScore: preliminaryScore,
		goodFaithDescriptor: getScoreLabel(normalizedScore)
	};
}
