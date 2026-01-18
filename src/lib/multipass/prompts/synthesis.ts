/**
 * Pass 3: Synthesis Prompts
 *
 * Combines individual claim analyses into a cohesive final evaluation.
 * Uses Sonnet for balanced reasoning and synthesis.
 */

import type { ClaimAnalysisResult, AnalysisContext } from '../types';

/**
 * System prompt for synthesis
 */
export const SYNTHESIS_SYSTEM_PROMPT = `You are an expert at synthesizing analytical insights into cohesive evaluations. Your task is to combine individual claim analyses into a comprehensive assessment of an argument.

## Synthesis Framework

Given individual analyses of each claim in an argument, create a unified evaluation that:

### 1. Aggregate Scores
Calculate weighted scores considering:
- Claim importance (central claims weight more)
- Claim dependencies (foundational claims affect dependents)
- Complexity (complex claims require more consideration)

### 2. Pattern Recognition
Identify patterns across claims:
- Repeated fallacies (systemic logical issues)
- Consistent evidence gaps
- Thematic strengths or weaknesses
- Logical flow and coherence

### 3. Overall Assessment
Evaluate the argument holistically:
- Does the conclusion follow from the claims?
- Are the strongest claims well-supported?
- Do weaknesses in individual claims undermine the whole?

### 4. Growth Metrics (0-10 scale)
Assess intellectual qualities:

**Steelmanning Score**: Does the author represent opposing views charitably?
- 0-3: Strawmanning or ignoring opposition
- 4-6: Acknowledges but doesn't strengthen opposition
- 7-10: Actively presents opposition at its best

**Understanding Score**: Does the author demonstrate genuine comprehension?
- 0-3: Superficial or incorrect understanding
- 4-6: Basic understanding with gaps
- 7-10: Deep, nuanced understanding

**Intellectual Humility Score**: Does the author acknowledge uncertainty?
- 0-3: Absolute certainty, dismissive
- 4-6: Some qualification, limited acknowledgment
- 7-10: Acknowledges limits, open to being wrong

**Relevance Score**: Is the argument on-topic and focused?
- 0-3: Off-topic or tangential
- 4-6: Related but wandering
- 7-10: Directly addresses the topic

### 5. Constructive Feedback
Provide actionable suggestions:
- What would make the strongest claims even stronger?
- How could weak claims be improved or removed?
- What additional evidence would help?

## Output Format

Return the standard GoodFaithResult JSON format:

{
  "claims": [
    {
      "claim": "The claim text",
      "supportingArguments": [
        {
          "argument": "How this claim was supported",
          "score": 7,
          "fallacies": ["Any fallacies found"],
          "improvements": "How to improve"
        }
      ]
    }
  ],
  "fallacyOverload": false,
  "goodFaithScore": 75,
  "goodFaithDescriptor": "Constructive",
  "cultishPhrases": ["Any manipulative language found"],
  "tags": ["topic-tag-1", "topic-tag-2"],
  "overallAnalysis": "Comprehensive summary of the argument's strengths, weaknesses, and overall quality.",
  "steelmanScore": 6,
  "steelmanNotes": "Assessment of steelmanning quality",
  "understandingScore": 7,
  "intellectualHumilityScore": 5,
  "relevanceScore": 9,
  "relevanceNotes": "Assessment of topical relevance"
}

## Scoring Guide for goodFaithScore (0-100)

- 80-100: Exemplary - Well-reasoned, well-supported, intellectually honest
- 60-79: Constructive - Generally sound with some issues
- 40-59: Neutral - Mixed quality, significant concerns
- 20-39: Questionable - Major logical or evidence issues
- 0-19: Hostile - Primarily fallacious or manipulative

## Important Rules

1. Base scores on the actual claim analyses provided
2. Don't invent issues not found in individual analyses
3. Weight claims by their logical importance
4. Be fair but honest about weaknesses
5. Acknowledge if some claims couldn't be analyzed (failed)
6. Output ONLY the JSON object`;

/**
 * Build the user message for synthesis
 */
export function buildSynthesisUserMessage(
	originalContent: string,
	claimAnalyses: ClaimAnalysisResult[],
	failedClaims: ClaimAnalysisResult[],
	context: AnalysisContext
): string {
	let message = '';

	// Add discussion context
	if (context.discussion?.title) {
		message += `## Discussion Context\n`;
		message += `Title: ${context.discussion.title}\n`;
		if (context.discussion.description) {
			message += `Description: ${context.discussion.description}\n`;
		}
		message += `\n`;
	}

	// Add original content
	message += `## Original Argument\n\n`;
	message += `${originalContent}\n\n`;

	// Add claim analyses
	message += `---\n\n## Claim-by-Claim Analyses\n\n`;

	const completedAnalyses = claimAnalyses.filter((a) => a.status === 'completed');

	for (const analysis of completedAnalyses) {
		message += `### Claim #${analysis.claimIndex + 1}\n`;
		message += `**Text:** "${analysis.claim.text}"\n`;
		message += `**Type:** ${analysis.claim.type} | **Complexity:** ${analysis.claim.complexity}\n\n`;

		message += `**Validity Score:** ${analysis.validityScore}/10\n`;
		message += `**Evidence Score:** ${analysis.evidenceScore}/10\n`;

		if (analysis.fallacies && analysis.fallacies.length > 0) {
			message += `**Fallacies:** ${analysis.fallacies.join(', ')}\n`;
			if (analysis.fallacyExplanations) {
				for (const [fallacy, explanation] of Object.entries(analysis.fallacyExplanations)) {
					message += `  - ${fallacy}: ${explanation}\n`;
				}
			}
		} else {
			message += `**Fallacies:** None identified\n`;
		}

		if (analysis.assumptions && analysis.assumptions.length > 0) {
			message += `**Assumptions:** ${analysis.assumptions.join('; ')}\n`;
		}

		if (analysis.counterArguments && analysis.counterArguments.length > 0) {
			message += `**Counter-arguments:** ${analysis.counterArguments.join('; ')}\n`;
		}

		if (analysis.improvements) {
			message += `**Improvements:** ${analysis.improvements}\n`;
		}

		message += `\n`;
	}

	// Note failed claims
	if (failedClaims.length > 0) {
		message += `---\n\n## Claims That Could Not Be Analyzed\n\n`;
		for (const failed of failedClaims) {
			message += `- Claim #${failed.claimIndex + 1}: "${failed.claim.text}"\n`;
			message += `  Error: ${failed.error}\n`;
		}
		message += `\nNote: These claims could not be analyzed. Factor this into your overall assessment.\n\n`;
	}

	// Summary stats
	message += `---\n\n## Summary Statistics\n\n`;
	message += `- Total claims: ${claimAnalyses.length + failedClaims.length}\n`;
	message += `- Successfully analyzed: ${completedAnalyses.length}\n`;
	message += `- Failed to analyze: ${failedClaims.length}\n`;

	const avgValidity =
		completedAnalyses.length > 0
			? completedAnalyses.reduce((sum, a) => sum + (a.validityScore || 0), 0) /
				completedAnalyses.length
			: 0;

	const avgEvidence =
		completedAnalyses.length > 0
			? completedAnalyses.reduce((sum, a) => sum + (a.evidenceScore || 0), 0) /
				completedAnalyses.length
			: 0;

	message += `- Average validity score: ${avgValidity.toFixed(1)}/10\n`;
	message += `- Average evidence score: ${avgEvidence.toFixed(1)}/10\n`;

	const allFallacies = completedAnalyses.flatMap((a) => a.fallacies || []);
	const uniqueFallacies = [...new Set(allFallacies)];
	message += `- Unique fallacies found: ${uniqueFallacies.length > 0 ? uniqueFallacies.join(', ') : 'None'}\n`;

	message += `\nSynthesize these analyses into a cohesive evaluation.`;

	return message;
}

/**
 * Calculate a preliminary good faith score from claim analyses
 * Used as a fallback if synthesis fails
 */
export function calculatePreliminaryScore(claimAnalyses: ClaimAnalysisResult[]): number {
	const completed = claimAnalyses.filter((a) => a.status === 'completed');

	if (completed.length === 0) {
		return 50; // Neutral default
	}

	// Average validity and evidence scores, convert to 0-100 scale
	const avgValidity =
		completed.reduce((sum, a) => sum + (a.validityScore || 5), 0) / completed.length;
	const avgEvidence =
		completed.reduce((sum, a) => sum + (a.evidenceScore || 5), 0) / completed.length;

	// Weight validity slightly higher
	const baseScore = (avgValidity * 0.6 + avgEvidence * 0.4) * 10;

	// Penalty for fallacies
	const totalFallacies = completed.reduce((sum, a) => sum + (a.fallacies?.length || 0), 0);
	const fallacyPenalty = Math.min(20, totalFallacies * 3);

	return Math.max(0, Math.min(100, baseScore - fallacyPenalty));
}
