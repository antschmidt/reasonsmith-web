/**
 * Pass 2: Individual Claim Analysis Prompts
 *
 * Each claim is analyzed by Sonnet or Opus based on complexity.
 * Prompts are designed for focused, deep analysis of single claims.
 */

import type { ExtractedClaim, AnalysisContext } from '../types';

/**
 * System prompt for individual claim analysis
 */
export const CLAIM_ANALYSIS_SYSTEM_PROMPT = `You are an expert in logic, rhetoric, and critical analysis. Your task is to deeply analyze a single claim from a larger argument.

## Analysis Framework

For the given claim, evaluate:

### 1. Logical Validity (1-10)
How sound is the reasoning?
- 9-10: Logically airtight, follows necessarily from premises
- 7-8: Strong reasoning with minor gaps
- 5-6: Reasonable but with significant assumptions
- 3-4: Weak reasoning, major logical gaps
- 1-2: Fundamentally flawed logic

### 2. Evidence Support (1-10)
How well is the claim supported?
- 9-10: Strong, verifiable evidence provided
- 7-8: Good evidence, some verification possible
- 5-6: Moderate support, claims could be verified
- 3-4: Weak support, mostly unsupported assertions
- 1-2: No evidence, pure assertion

### 3. Logical Fallacies
Identify any logical errors using standard fallacy names:
- Ad Hominem
- Straw Man
- False Dichotomy
- Hasty Generalization
- Appeal to Fear
- Appeal to Authority
- Red Herring
- Slippery Slope
- Circular Reasoning
- Tu Quoque (Whataboutism)
- False Equivalence
- Unsubstantiated Claim

For each fallacy found, provide a brief explanation of why it applies.

### 4. Assumptions
What must be true for this claim to hold? Identify:
- Explicit assumptions (stated)
- Implicit assumptions (unstated but required)
- Shared premises with other claims

### 5. Counter-Arguments
Provide the strongest objections to this claim:
- What would a thoughtful critic say?
- What evidence would challenge this?
- What alternative interpretations exist?

### 6. Improvements
How could this claim be strengthened?
- What evidence would help?
- How could the reasoning be tightened?
- What qualifications would make it more defensible?

## Output Format

Return ONLY valid JSON:
{
  "validityScore": 7,
  "evidenceScore": 6,
  "fallacies": ["Hasty Generalization"],
  "fallacyExplanations": {
    "Hasty Generalization": "The claim extrapolates from a single study to a universal conclusion"
  },
  "assumptions": [
    "The study methodology was sound",
    "The sample was representative"
  ],
  "counterArguments": [
    "Other studies have shown different results",
    "The sample size may be insufficient"
  ],
  "improvements": "Cite multiple studies and acknowledge the limitations of available evidence"
}

## Important Rules

1. Be thorough but concise
2. Focus ONLY on this specific claim, not the broader argument
3. Be fair - identify both strengths and weaknesses
4. Fallacies should be genuine logical errors, not just disagreements
5. Counter-arguments should be substantive, not dismissive
6. Output ONLY the JSON object`;

/**
 * Build the user message for analyzing a specific claim
 */
export function buildClaimAnalysisUserMessage(
	claim: ExtractedClaim,
	originalContent: string,
	context: AnalysisContext
): string {
	let message = '';

	// Add discussion context if available
	if (context.discussion?.title) {
		message += `## Discussion Context\n`;
		message += `Title: ${context.discussion.title}\n`;
		if (context.discussion.description) {
			message += `Description: ${context.discussion.description}\n`;
		}
		message += `\n`;
	}

	// Add citations if available
	if (context.citations && context.citations.length > 0) {
		message += `## Citations Provided by Author\n`;
		for (const citation of context.citations) {
			message += `- ${citation.title || 'Untitled'}`;
			if (citation.url) message += ` (${citation.url})`;
			if (citation.relevantQuote) message += `\n  Quote: "${citation.relevantQuote}"`;
			message += `\n`;
		}
		message += `\n`;
	}

	// Add the full original content for context
	message += `## Full Argument (for context)\n`;
	message += `${originalContent}\n\n`;

	// Add the specific claim to analyze
	message += `---\n\n`;
	message += `## CLAIM TO ANALYZE\n\n`;
	message += `**Claim #${claim.index + 1}:** "${claim.text}"\n\n`;
	message += `**Type:** ${claim.type}\n`;
	message += `**Complexity:** ${claim.complexity}\n`;
	message += `**Explicit:** ${claim.explicit ? 'Yes (directly stated)' : 'No (implied/assumed)'}\n`;

	if (claim.dependsOn.length > 0) {
		message += `**Depends on claims:** ${claim.dependsOn.map((i) => `#${i + 1}`).join(', ')}\n`;
	}

	message += `\nAnalyze this specific claim thoroughly.`;

	return message;
}

/**
 * Build system prompt with claim-specific context for caching
 */
export function buildClaimAnalysisSystemPromptWithContext(
	originalContent: string,
	context: AnalysisContext
): string {
	let systemPrompt = CLAIM_ANALYSIS_SYSTEM_PROMPT;

	// Add context that will be cached and reused across all claim analyses
	systemPrompt += `\n\n## Cached Context\n\n`;

	if (context.discussion?.title) {
		systemPrompt += `Discussion: ${context.discussion.title}\n`;
	}

	if (context.citations && context.citations.length > 0) {
		systemPrompt += `\nCitations provided:\n`;
		for (const citation of context.citations) {
			systemPrompt += `- ${citation.title || citation.url || 'Untitled'}\n`;
		}
	}

	systemPrompt += `\nFull argument for reference:\n${originalContent}\n`;

	return systemPrompt;
}

/**
 * Build a minimal user message when system prompt includes cached context
 */
export function buildMinimalClaimUserMessage(claim: ExtractedClaim): string {
	let message = `Analyze this claim:\n\n`;
	message += `**Claim #${claim.index + 1}:** "${claim.text}"\n`;
	message += `Type: ${claim.type} | Complexity: ${claim.complexity} | Explicit: ${claim.explicit}\n`;

	if (claim.dependsOn.length > 0) {
		message += `Depends on: ${claim.dependsOn.map((i) => `#${i + 1}`).join(', ')}\n`;
	}

	return message;
}
