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
			system: `You are an expert in logic, rhetoric, and argumentation analysis.

Analyze the given text for logical fallacies, manipulative language, and good faith communication.

Return ONLY a valid JSON object with this EXACT structure:

{
  "claims": [
    {
      "claim": "The exact claim made in the text",
      "supportingArguments": [
        {
          "argument": "Description of how the claim is supported (or not)",
          "score": <1-10 integer, where 1=completely fallacious, 10=perfectly logical>,
          "fallacies": ["Array of specific fallacy names found, or empty array if none"],
          "improvements": "Specific suggestion for how to make this argument stronger"
        }
      ]
    }
  ],
  "fallacyOverload": <boolean: true if >50% of arguments score 5 or below>,
  "goodFaithScore": <0-100 integer: percentage of arguments scoring 6+ out of 10>,
  "cultishPhrases": ["Array of exact manipulative/cultish phrases found in the text"],
  "overallAnalysis": "A comprehensive paragraph summarizing the analysis"
}

Evaluation criteria:
1. LOGICAL FALLACIES - Identify and name specifically (e.g., "Ad Hominem", "Straw Man", "Appeal to Fear", "False Dichotomy", "Hasty Generalization", "Unsubstantiated Claim")

2. CULTISH/MANIPULATIVE LANGUAGE - Look for:
   - Emotionally loaded terms
   - Us-vs-them framing
   - Thought-terminating clichés
   - Dehumanizing language
   - Apocalyptic/crisis rhetoric
   - Absolute statements without evidence

3. SCORING GUIDELINES:
   - 1-2: Pure fallacy or manipulation
   - 3-4: Mostly fallacious with minor valid points
   - 5-6: Mixed validity and fallacies
   - 7-8: Mostly valid with minor issues
   - 9-10: Logically sound and well-supported

4. GOOD FAITH INDICATORS:
   - Acknowledges counterarguments
   - Provides sources/evidence
   - Uses measured language
   - Admits uncertainty when appropriate
   - Focuses on ideas not persons

5. CALIBRATION REMINDER:
  Before finalizing scores, verify:
- short agreements/disagreements without supporting evidence = 1-2
- Claims without any supporting evidence = 3-4 maximum
- Only award 7+ for arguments with actual evidence or logical structure
- Consistency: similar argument types should receive similar scores

Extract EVERY distinct claim made. For each claim, analyze ALL supporting arguments (or note their absence).

Return ONLY the JSON object, no additional text.`,
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
