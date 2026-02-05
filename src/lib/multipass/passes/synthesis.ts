/**
 * Pass 3: Synthesis
 *
 * Combines individual claim analyses into a cohesive final evaluation.
 * Produces output in the Featured Analysis format (good_faith, logical_fallacies, etc.)
 * which is compatible with the public showcase page.
 * Uses tool calling for guaranteed valid JSON output.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import { calculatePreliminaryScore } from '../prompts/synthesis';
import type { ClaimAnalysisResult, MultiPassConfig, AnalysisContext, TokenUsage } from '../types';
import type {
	GoodFaithResult,
	Claim,
	AnalysisFinding,
	FactCheckFinding
} from '$lib/goodFaith/types';

/**
 * Featured analysis response format (matches what the public page expects)
 */
export interface FeaturedAnalysisResponse {
	good_faith: AnalysisFinding[];
	logical_fallacies: AnalysisFinding[];
	cultish_language: AnalysisFinding[];
	fact_checking: FactCheckFinding[];
	summary: string;
}

/**
 * Tool definition for structured synthesis output in featured format
 */
const FEATURED_SYNTHESIS_TOOL: Anthropic.Tool = {
	name: 'submit_featured_synthesis',
	description: 'Submit the synthesized analysis in the featured analysis format',
	input_schema: {
		type: 'object' as const,
		properties: {
			good_faith: {
				type: 'array',
				description: 'Good faith indicators found based on the claim analyses',
				items: {
					type: 'object',
					properties: {
						name: {
							type: 'string',
							description:
								'Name of the good faith indicator (e.g., "Charitable Interpretation", "Acknowledges Uncertainty")'
						},
						description: {
							type: 'string',
							description: 'Brief description of what this indicator means'
						},
						examples: {
							type: 'array',
							items: { type: 'string' },
							description: 'Specific quotes or examples from the text'
						},
						why: { type: 'string', description: 'Why this demonstrates good faith argumentation' }
					},
					required: ['name', 'description', 'examples', 'why']
				}
			},
			logical_fallacies: {
				type: 'array',
				description: 'Logical fallacies identified from the claim analyses',
				items: {
					type: 'object',
					properties: {
						name: {
							type: 'string',
							description: 'Standard name of the fallacy (e.g., "Straw Man", "Ad Hominem")'
						},
						description: {
							type: 'string',
							description: 'Brief description of what this fallacy is'
						},
						examples: {
							type: 'array',
							items: { type: 'string' },
							description: 'Specific quotes showing this fallacy'
						},
						why: {
							type: 'string',
							description: 'Why this reasoning is fallacious and how it weakens the argument'
						}
					},
					required: ['name', 'description', 'examples', 'why']
				}
			},
			cultish_language: {
				type: 'array',
				description:
					'Cultish or manipulative language patterns found, including performative good faith (e.g., "Us vs Them", "Thought-Terminating Cliché", "Sealioning", "False Balance", "Performative Respect")',
				items: {
					type: 'object',
					properties: {
						name: {
							type: 'string',
							description:
								'Name of the pattern (e.g., "Us vs Them", "Thought-Terminating Cliché", "Sealioning", "Performative Respect", "False Balance")'
						},
						description: { type: 'string', description: 'Brief description of this pattern' },
						examples: {
							type: 'array',
							items: { type: 'string' },
							description: 'Specific quotes showing this pattern'
						},
						why: { type: 'string', description: 'Why this language is manipulative or problematic' }
					},
					required: ['name', 'description', 'examples', 'why']
				}
			},
			fact_checking: {
				type: 'array',
				description:
					'Fact-checking results for verifiable claims. ONLY populate this if fact-checking was explicitly requested. Otherwise, always provide an empty array.',
				items: {
					type: 'object',
					properties: {
						claim: { type: 'string' },
						verdict: { type: 'string', enum: ['True', 'False', 'Misleading', 'Unverified'] },
						relevance: { type: 'string' },
						source: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								url: { type: 'string' }
							}
						}
					},
					required: ['claim', 'verdict', 'relevance']
				}
			},
			summary: {
				type: 'string',
				description:
					'Comprehensive summary of the analysis (3-5 paragraphs) covering tone, tactics, impact, and constructive observations'
			}
		},
		required: ['good_faith', 'logical_fallacies', 'cultish_language', 'summary']
	}
};

/**
 * Run Pass 3: Synthesize claim analyses into featured format result using tool calling
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
	logger.info('[Pass 3] Starting synthesis (using tool calling, featured format)');

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
		const userMessage = buildFeaturedSynthesisUserMessage(
			originalContent,
			completedAnalyses,
			failedAnalyses,
			context,
			config.skipFactChecking
		);

		const requestOptions: Parameters<typeof anthropic.messages.create>[0] = {
			model: config.models.synthesis,
			max_tokens: 16384, // Increased for analyses with many findings
			temperature: 0.3,
			tools: [FEATURED_SYNTHESIS_TOOL],
			tool_choice: { type: 'tool', name: 'submit_featured_synthesis' },
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
					text: FEATURED_SYNTHESIS_SYSTEM_PROMPT,
					cache_control: { type: 'ephemeral' }
				}
			] as any;
		} else {
			requestOptions.system = FEATURED_SYNTHESIS_SYSTEM_PROMPT;
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

		// Check if response was truncated
		if (response.stop_reason === 'max_tokens') {
			logger.warn('[Pass 3] Response was truncated due to max_tokens - results may be incomplete');
		}

		// Extract tool use response - guaranteed valid JSON
		const toolUseBlock = response.content.find(
			(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
		);

		if (!toolUseBlock) {
			throw new Error('No tool use response from synthesis');
		}

		// Log raw tool response for debugging
		const rawInput = toolUseBlock.input as any;
		logger.debug(
			'[Pass 3] Raw tool response - good_faith count:',
			rawInput.good_faith?.length || 0
		);
		logger.debug(
			'[Pass 3] Raw tool response - logical_fallacies count:',
			rawInput.logical_fallacies?.length || 0
		);
		logger.debug(
			'[Pass 3] Raw tool response - cultish_language count:',
			rawInput.cultish_language?.length || 0
		);

		// Tool input is already parsed JSON in featured format
		const featuredResult = normalizeFeaturedResponse(rawInput);

		// Convert to GoodFaithResult format (which includes the featured fields)
		const result = convertToGoodFaithResult(
			featuredResult,
			completedAnalyses,
			failedAnalyses.length
		);

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
 * System prompt for featured synthesis
 */
const FEATURED_SYNTHESIS_SYSTEM_PROMPT = `You are an expert educator in rhetoric, logic, and argumentation analysis. Your task is to synthesize the results of detailed claim-by-claim analyses into a comprehensive featured analysis.

## CRITICAL: Balanced Assessment

You must identify BOTH strengths AND weaknesses with EQUAL diligence. Do not focus only on problems.

**For Good Faith Indicators, actively look for:**
- Claims with high validity scores (7+/10) indicate sound reasoning
- Claims with high evidence scores (7+/10) indicate well-supported arguments
- Acknowledgment of nuance, complexity, or uncertainty
- Charitable interpretation of opposing views
- Use of qualified language ("often", "tends to", "in many cases")
- Citation of evidence or sources
- Acknowledgment of counterarguments or limitations
- Intellectual humility (admitting what isn't known)

**CRITICAL: Validate Good Faith Authenticity**
Before reporting a good faith indicator, you MUST verify it is GENUINE and not performative or manipulative:

RED FLAGS that disqualify "good faith" language:
- "I'm just asking questions" followed by leading/loaded questions → NOT good faith (sealioning)
- "I respect your opinion, but..." immediately followed by dismissal → NOT good faith (false respect)
- "To be fair..." used to introduce a strawman or weak version of opposing view → NOT good faith
- "Both sides have valid points" when one side is clearly factual/ethical → NOT good faith (false balance)
- Hedging language ("maybe", "possibly") used to spread misinformation while maintaining deniability → NOT good faith
- "I'm not saying X, but..." followed by implying X → NOT good faith (implicature manipulation)
- Citing sources that don't support the claim or are misrepresented → NOT good faith
- Acknowledging a counterargument only to immediately dismiss it without engagement → NOT good faith

GENUINE good faith requires:
- The charitable interpretation actually engages with the strongest form of the opposing argument
- The uncertainty acknowledgment is consistent (not selective uncertainty on inconvenient facts only)
- The qualified language reflects genuine epistemic humility, not rhetorical hedging
- Evidence citations actually support the claim and aren't cherry-picked or misrepresented
- Counterargument acknowledgment includes substantive engagement, not token mention

**For Logical Fallacies:**
- Only report fallacies explicitly identified in the claim analyses
- Each instance of a fallacy is a separate finding
- Use standard fallacy names with clear examples

**For Cultish/Manipulative Language:**
- Look for us-vs-them framing, loaded language, thought-terminating clichés
- Only report patterns clearly present in the text
- Each instance is a separate finding
- NOTE: Performative good faith that fails validation should be reported here as manipulation

## Your Tasks

1. **Identify Good Faith Indicators**: Scan ALL claims for positive patterns. High-scoring claims should yield good faith indicators. VALIDATE each indicator is genuine before including it.

2. **Identify Logical Fallacies**: Report each fallacy instance found in the claim analyses with specific examples from the text.

3. **Identify Cultish/Manipulative Language**: Report each instance of manipulative language patterns found. Include any performative/fake good faith patterns here.

4. **Fact Checking**: Only include fact-checking results if explicitly requested in the instructions below. If not requested, omit or leave empty.

5. **Write a Comprehensive Summary** (3-5 paragraphs) covering:
   - Tone & Voice Analysis
   - Tactical Assessment (rhetorical strategies, good/bad faith patterns)
   - Impact Analysis (likely audience response, effect on discourse)
   - Constructive Observations (strengths to emulate, weaknesses to avoid)

Be thorough, educational, and BALANCED. Report both what works well and what doesn't. Be skeptical of surface-level good faith signals - verify they represent genuine intellectual honesty.`;

/**
 * Build user message for featured synthesis
 */
function buildFeaturedSynthesisUserMessage(
	originalContent: string,
	completedAnalyses: ClaimAnalysisResult[],
	failedAnalyses: ClaimAnalysisResult[],
	context: AnalysisContext,
	skipFactChecking: boolean = true
): string {
	// Calculate summary statistics to guide balanced assessment
	const avgValidity =
		completedAnalyses.length > 0
			? completedAnalyses.reduce((sum, a) => sum + (a.validityScore || 5), 0) /
				completedAnalyses.length
			: 5;
	const avgEvidence =
		completedAnalyses.length > 0
			? completedAnalyses.reduce((sum, a) => sum + (a.evidenceScore || 5), 0) /
				completedAnalyses.length
			: 5;
	const highValidityClaims = completedAnalyses.filter((a) => (a.validityScore || 0) >= 7).length;
	const highEvidenceClaims = completedAnalyses.filter((a) => (a.evidenceScore || 0) >= 7).length;
	const totalFallacies = completedAnalyses.reduce((sum, a) => sum + (a.fallacies?.length || 0), 0);

	let message = `Synthesize the following claim analyses into a featured analysis format.

## Claim Analysis Summary
- Total claims analyzed: ${completedAnalyses.length}
- Average validity score: ${avgValidity.toFixed(1)}/10
- Average evidence score: ${avgEvidence.toFixed(1)}/10
- Claims with high validity (≥7): ${highValidityClaims} ← these indicate good faith reasoning
- Claims with high evidence (≥7): ${highEvidenceClaims} ← these indicate well-supported arguments
- Total fallacy instances found: ${totalFallacies}

**IMPORTANT**: ${highValidityClaims + highEvidenceClaims > 0 ? `The ${highValidityClaims} high-validity and ${highEvidenceClaims} high-evidence claims should each yield good faith indicators.` : 'The claim scores should guide your good faith assessment.'}

## Original Content
${originalContent}

## Claim Analyses
`;

	for (const analysis of completedAnalyses) {
		message += `
### Claim ${analysis.claimIndex + 1}: "${analysis.claim.text}"
- Type: ${analysis.claim.type}
- Complexity: ${analysis.claim.complexity}
- Validity Score: ${analysis.validityScore}/10
- Evidence Score: ${analysis.evidenceScore}/10
- Fallacies: ${analysis.fallacies?.length ? analysis.fallacies.join(', ') : 'None identified'}
${analysis.fallacyExplanations ? `- Fallacy Explanations: ${JSON.stringify(analysis.fallacyExplanations)}` : ''}
- Assumptions: ${analysis.assumptions?.length ? analysis.assumptions.join('; ') : 'None noted'}
- Counter-arguments: ${analysis.counterArguments?.length ? analysis.counterArguments.join('; ') : 'None noted'}
- Improvements: ${analysis.improvements || 'None suggested'}
`;
	}

	if (failedAnalyses.length > 0) {
		message += `
## Failed Analyses
${failedAnalyses.length} claims could not be analyzed. Please note this in your summary.
`;
	}

	const factCheckingInstruction = skipFactChecking
		? '4. Do NOT include fact_checking - omit it entirely or provide an empty array. Fact-checking has not been requested for this analysis.'
		: '4. Evaluate verifiable factual claims and provide fact_checking results with verdicts and sources.';

	message += `
## Instructions
Based on these detailed claim analyses, create a featured analysis that:
1. Identifies good_faith indicators for EACH claim with high validity or evidence scores (≥7) - these represent sound reasoning
2. Reports each fallacy instance found in the claim analyses with proper names, descriptions, examples, and explanations
3. Reports each cultish_language pattern instance (us-vs-them, loaded language, etc.)
${factCheckingInstruction}
5. Writes a comprehensive summary covering tone, tactics, impact, and constructive observations

Use the submit_featured_synthesis tool to provide your analysis.`;

	return message;
}

/**
 * Normalize the featured response (already parsed from tool use)
 */
function normalizeFeaturedResponse(input: any): FeaturedAnalysisResponse {
	return {
		good_faith: Array.isArray(input.good_faith)
			? input.good_faith.map(normalizeAnalysisFinding)
			: [],
		logical_fallacies: Array.isArray(input.logical_fallacies)
			? input.logical_fallacies.map(normalizeAnalysisFinding)
			: [],
		cultish_language: Array.isArray(input.cultish_language)
			? input.cultish_language.map(normalizeAnalysisFinding)
			: [],
		fact_checking: Array.isArray(input.fact_checking) ? input.fact_checking : [],
		summary: input.summary || ''
	};
}

function normalizeAnalysisFinding(item: any): AnalysisFinding {
	return {
		name: item.name || 'Unknown',
		description: item.description || '',
		examples: Array.isArray(item.examples) ? item.examples : item.example ? [item.example] : [],
		why: item.why || ''
	};
}

/**
 * Convert featured format to GoodFaithResult (which the system also expects)
 * The result contains BOTH the featured fields AND the GoodFaithResult fields
 */
function convertToGoodFaithResult(
	featured: FeaturedAnalysisResponse,
	completedAnalyses: ClaimAnalysisResult[],
	failedCount: number
): GoodFaithResult {
	// Calculate score based on the balance of good faith vs fallacies/cultish language
	const goodFaithCount = featured.good_faith.length;
	const problemCount = featured.logical_fallacies.length + featured.cultish_language.length;

	// Simple scoring: more good faith indicators relative to problems = higher score
	let score: number;
	if (goodFaithCount + problemCount === 0) {
		score = 0.5; // Neutral if nothing found
	} else {
		score = Math.max(0.1, Math.min(0.9, 0.5 + (goodFaithCount - problemCount) * 0.1));
	}

	// Also factor in the average validity/evidence scores from claim analyses
	if (completedAnalyses.length > 0) {
		const avgValidity =
			completedAnalyses.reduce((sum, a) => sum + (a.validityScore || 5), 0) /
			completedAnalyses.length;
		const avgEvidence =
			completedAnalyses.reduce((sum, a) => sum + (a.evidenceScore || 5), 0) /
			completedAnalyses.length;
		const avgScore = (avgValidity + avgEvidence) / 2 / 10; // Convert to 0-1 scale
		score = (score + avgScore) / 2; // Average with the indicator-based score
	}

	const label = getScoreLabel(score);

	// Build summary with failed claim note if needed
	const summaryText =
		failedCount > 0
			? `${featured.summary}\n\n(Note: ${failedCount} claim(s) could not be analyzed)`
			: featured.summary;

	// Build claims array from completed analyses for GoodFaithResult compatibility
	const claims: Claim[] = completedAnalyses.map((a) => ({
		claim: a.claim.text,
		supportingArguments: [
			{
				argument: a.improvements || 'See detailed analysis',
				score: Math.round(((a.validityScore || 5) + (a.evidenceScore || 5)) / 2),
				fallacies: a.fallacies || [],
				improvements: a.improvements
			}
		]
	}));

	// Collect unique fallacy names for cultishPhrases field (legacy)
	const allFallacies = featured.logical_fallacies.map((f) => f.name);
	const cultishPhrases = featured.cultish_language.map((c) => c.name);

	return {
		// Core GoodFaithResult fields
		good_faith_score: score,
		good_faith_label: label,
		claims,
		fallacyOverload: featured.logical_fallacies.length > 5,
		cultishPhrases,
		summary: summaryText,
		rationale: summaryText,
		tags: [...new Set([...allFallacies.slice(0, 3), ...cultishPhrases.slice(0, 2)])],
		provider: 'claude',
		usedAI: true,

		// Legacy compatibility
		goodFaithScore: Math.round(score * 100),
		goodFaithDescriptor: label,
		overallAnalysis: summaryText,

		// FEATURED FORMAT FIELDS - these are what the public page actually uses
		good_faith: featured.good_faith,
		logical_fallacies: featured.logical_fallacies,
		cultish_language: featured.cultish_language,
		fact_checking: featured.fact_checking
	} as GoodFaithResult & FeaturedAnalysisResponse;
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
	const summaryText = `Analysis incomplete: ${failedCount} of ${claimAnalyses.length} claims could not be analyzed. Please try again.`;
	return {
		good_faith_score: 0.5,
		good_faith_label: 'neutral',
		claims: claimAnalyses.map((a) => ({
			claim: a.claim.text,
			supportingArguments: []
		})),
		fallacyOverload: false,
		cultishPhrases: [],
		summary: summaryText,
		rationale: summaryText,
		tags: [],
		provider: 'claude',
		usedAI: false,
		goodFaithScore: 50,
		goodFaithDescriptor: 'Incomplete',
		// Featured format fields (empty)
		good_faith: [],
		logical_fallacies: [],
		cultish_language: [],
		fact_checking: []
	} as GoodFaithResult & FeaturedAnalysisResponse;
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

	const summaryText =
		`Aggregated analysis of ${completedAnalyses.length} claims. ` +
		`Average validity: ${avgValidity.toFixed(1)}/10. Average evidence: ${avgEvidence.toFixed(1)}/10. ` +
		`${uniqueFallacies.length > 0 ? `Fallacies identified: ${uniqueFallacies.join(', ')}.` : 'No significant fallacies identified.'} ` +
		`${failedAnalyses.length > 0 ? `(${failedAnalyses.length} claims could not be analyzed)` : ''}`;

	// Build logical_fallacies array from unique fallacies
	const logicalFallacies: AnalysisFinding[] = uniqueFallacies.map((name) => ({
		name,
		description: `Fallacy identified in claim analysis`,
		examples: completedAnalyses
			.filter((a) => a.fallacies?.includes(name))
			.map((a) => a.claim.text)
			.slice(0, 2),
		why:
			completedAnalyses.find((a) => a.fallacyExplanations?.[name])?.fallacyExplanations?.[name] ||
			'See individual claim analysis'
	}));

	return {
		good_faith_score: normalizedScore,
		good_faith_label: getScoreLabel(normalizedScore),
		claims,
		fallacyOverload: uniqueFallacies.length > 5,
		cultishPhrases: [],
		summary: summaryText,
		rationale: summaryText,
		tags: uniqueFallacies.slice(0, 5),
		provider: 'claude',
		usedAI: true,
		goodFaithScore: preliminaryScore,
		goodFaithDescriptor: getScoreLabel(normalizedScore),
		// Featured format fields
		good_faith: [],
		logical_fallacies: logicalFallacies,
		cultish_language: [],
		fact_checking: []
	} as GoodFaithResult & FeaturedAnalysisResponse;
}
