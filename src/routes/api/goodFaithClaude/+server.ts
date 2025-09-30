import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

interface ClaudeClaimArgument {
	argument: string;
	score: number; // 1-10
	fallacies: string[];
	improvements: string;
}

interface ClaudeClaim {
	claim: string;
	supportingArguments: ClaudeClaimArgument[];
}

interface ClaudeScoreResponse {
	claims: ClaudeClaim[];
	fallacyOverload: boolean;
	goodFaithScore: number; // 0-100
	cultishPhrases: string[];
	overallAnalysis: string;

	// Legacy fields for backward compatibility
	good_faith_score?: number;
	good_faith_label?: string;
	rationale?: string;
}

function getLabel(score: number): string {
	if (score >= 0.8) return 'exemplary';
	if (score >= 0.6) return 'constructive';
	if (score >= 0.4) return 'neutral';
	if (score >= 0.2) return 'questionable';
	return 'hostile';
}

async function analyzeWithClaude(content: string): Promise<ClaudeScoreResponse> {
	try {
		console.log('Starting Claude API call...');

		if (!process.env.ANTHROPIC_API_KEY) {
			throw new Error('ANTHROPIC_API_KEY not set');
		}

		const msg = await anthropic.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 20000,
			temperature: 0.2,
			system: "You are a meticulous analyst specializing in logic, rhetoric, and critical discourse analysis. Your expertise lies in dissecting arguments to identify their structure, validity, and intent.\n\nYour task is to analyze the provided text for logical fallacies, manipulative rhetoric, and indicators of good or bad faith argumentation. You will then synthesize your findings into a single, valid JSON object.\n\n**Critical Rule: Differentiating Author vs. Quote**\nBefore analysis, you MUST distinguish between the author's original text and any text they are quoting.\n* Quoted text is often indicated by markdown `>` characters, quotation marks (`\"\"`), or phrases like \"You wrote:\".\n* **Do not attribute the fallacies or claims within the quoted text to the author.** Analyze ONLY the author's original response. The quoted text serves as the context for the author's claims, not as part of their argument.\n\n**Execution Process:**\n1.  **Isolate & Deconstruct:** First, identify and separate any quoted text from the author's original statements. Then, deconstruct the **author's statements** into every distinct claim they are making.\n2.  **Map Arguments:** For each of the author's claims, identify their supporting arguments or note their absence.\n3.  **Analyze & Score:** Evaluate each of the author's arguments against the `Analytical Framework` below. Assign a score based on the `Scoring Rubric`.\n4.  **Synthesize:** After analyzing all of the author's arguments, calculate the aggregate scores (`fallacyOverload`, `goodFaithScore`) and write the `overallAnalysis`.\n5.  **Construct JSON:** Assemble the final JSON object. Your output must *only* be this JSON object.\n\n---\n\n### **Analytical Framework**\n\n**1. Logical Fallacies to Identify:**\n* Unsubstantiated Claim, Ad Hominem, Straw Man, False Dichotomy, Hasty Generalization, Appeal to Fear.\n\n**2. Manipulative Language to Identify:**\n* Emotionally Loaded Terms, Us-vs-Them Framing, Thought-Terminating Clichés, Dehumanizing Language, Absolute Statements.\n\n**3. Handling Compound Arguments:**\n* Recognize that a single argument may contain both a fallacy and a substantive point (e.g., \"That's wrong, you're a shill! The data from the CBO says otherwise.\"). Identify the \"Ad Hominem\" fallacy, but score the argument based on the merit of the substantive point. The `improvements` suggestion should focus on removing the fallacious part.\n\n---\n\n### **Output Requirements**\n\n**CRITICAL: You must return EXACTLY this JSON structure. Do not add extra fields like 'label', 'score', 'rationale', 'provider', 'analyzedAt', etc. The field names and types must match exactly as shown below.**\n\nReturn **ONLY** a valid JSON object with this exact structure:\n\n{\n  \"claims\": [\n    {\n      \"claim\": \"The exact claim made in the author's original text.\",\n      \"supportingArguments\": [\n        {\n          \"argument\": \"Description of how the author supports their claim (or if it's unsubstantiated).\",\n          \"score\": 7,\n          \"fallacies\": [\"Array of specific fallacy names found, or empty array if none\"],\n          \"improvements\": \"Specific suggestion for how to make this argument stronger, such as removing fallacious components while retaining the substantive points.\"\n        }\n      ]\n    }\n  ],\n  \"fallacyOverload\": false,\n  \"goodFaithScore\": 75,\n  \"cultishPhrases\": [\"Array of exact manipulative/loaded phrases found in the author's original text\"],\n  \"overallAnalysis\": \"A comprehensive paragraph summarizing the author's rhetorical strategy, primary weaknesses, and overall trustworthiness based on the detailed analysis.\"\n}\n\n---\n\n### **Scoring Rubric**\n\n* **1-2 (Highly Fallacious):** Pure fallacy, manipulation, or personal attack **without any supporting argument**.\n* **3-4 (Mostly Fallacious):** A claim with no supporting evidence, or an argument that relies heavily on fallacies.\n* **5-6 (Mixed Validity):** A mix of logical reasoning and significant fallacies. Includes arguments where a valid point is marred by a fallacy like an ad hominem.\n* **7-8 (Mostly Valid):** A logically sound argument with minor issues or weaknesses. Provides some form of evidence.\n* **9-10 (Highly Valid):** Logically sound, well-supported with evidence, acknowledges nuance, and uses clear, good-faith language.",
			messages: [
				{
					role: 'user',
					content: content
				}
			]
		});

		console.log('Claude API response received');

		const responseText = msg.content[0]?.type === 'text' ? msg.content[0].text : '';

		if (!responseText) {
			throw new Error('No response from Claude');
		}

		// Strip markdown code blocks if present
		let cleanedResponse = responseText.trim();
		if (cleanedResponse.startsWith('```json')) {
			cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		} else if (cleanedResponse.startsWith('```')) {
			cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
		}

		console.log('Claude cleaned response length:', cleanedResponse.length);

		// Parse the JSON response
		const result: ClaudeScoreResponse = JSON.parse(cleanedResponse);
		console.log('Claude parsed result successfully');

		// Add backward compatibility fields
		result.good_faith_score = result.goodFaithScore / 100; // Convert 0-100 to 0-1
		result.good_faith_label = getLabel(result.good_faith_score); // Use 0-1 scale
		result.rationale = result.overallAnalysis;

		return result;
	} catch (error: any) {
		console.error('Claude API error:', error);
		console.error('Error details:', error.message, error.stack);
		// Fallback to heuristic scoring if Claude fails
		return heuristicScore(content);
	}
}

function heuristicScore(content: string): ClaudeScoreResponse {
	const lower = content.toLowerCase();
	let score = 50; // 0-100 scale

	// Basic heuristic analysis
	if (/(thank|appreciate)/.test(lower)) score += 10;
	if (/(evidence|source|reference)/.test(lower)) score += 15;
	if (/(idiot|stupid|hate|moron|trash)/.test(lower)) score -= 30;
	if (/(I understand|I see your point|you might be right)/.test(lower)) score += 10;
	if (/(always|never|all|none|everyone|no one)/.test(lower)) score -= 5; // Absolute statements

	score = Math.max(0, Math.min(100, score));

	// Create basic structured response
	const claims: ClaudeClaim[] = [
		{
			claim: content.length > 100 ? content.substring(0, 100) + '...' : content,
			supportingArguments: [
				{
					argument: 'Heuristic analysis of overall content',
					score: Math.round(score / 10), // Convert to 1-10 scale
					fallacies: score < 40 ? ['Potential logical issues detected'] : [],
					improvements:
						score < 60
							? 'Consider providing more evidence and using more respectful language'
							: 'Content appears reasonable'
				}
			]
		}
	];

	return {
		claims,
		fallacyOverload: score < 30,
		goodFaithScore: score,
		cultishPhrases: [],
		overallAnalysis: 'Heuristic fallback analysis. Claude analysis unavailable.',
		good_faith_score: score / 100,
		good_faith_label: getLabel(score / 100),
		rationale: 'Heuristic fallback score.'
	};
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { postId, content } = body as { postId?: string; content?: string };

		if (typeof content !== 'string' || !content.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		console.log('Claude API key present:', !!process.env.ANTHROPIC_API_KEY);
		console.log('Processing request for content length:', content.length);

		// Use Claude analysis
		const scored = await analyzeWithClaude(content);
		return json({ ...scored, postId: postId || null });
	} catch (e: any) {
		console.error('POST handler error:', e);
		return json({ error: e?.message || 'Internal error' }, { status: 500 });
	}
};
