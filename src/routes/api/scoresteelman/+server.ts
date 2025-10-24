import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

interface SteelmanScoreResponse {
	steelman_score: number; // 0-10 scale
	steelman_quality_notes: string;
	understanding_score: number; // 0-10 scale
	intellectual_humility_score: number; // 0-10 scale
	xp_awarded: number; // XP to award based on quality
	rationale: string;
}

async function scoreWithClaude(
	content: string,
	discussionContext?: string
): Promise<SteelmanScoreResponse> {
	try {
		const systemPrompt = `You are an expert in identifying and evaluating steelmanning - the practice of representing an opposing viewpoint in its strongest, most charitable form.

**Your task is to evaluate how well the given post steelmans an opposing position.**

## What is Steelmanning?

Steelmanning is the opposite of strawmanning. Instead of misrepresenting or weakening an opponent's argument, steelmanning involves:
1. **Accurately understanding** the opposing position
2. **Representing it charitably** in its strongest possible form
3. **Acknowledging valid points** even when you disagree
4. **Demonstrating comprehension** before critique

## Scoring Criteria

### Steelman Score (0-10):
- **9-10 (Exceptional)**: Perfect representation of opposing view, possibly even stronger than original. Shows deep understanding.
- **7-8 (Strong)**: Accurately captures core opposing arguments with charity and nuance.
- **5-6 (Good)**: Decent attempt at fair representation, minor oversimplifications.
- **3-4 (Fair)**: Some understanding shown but still somewhat weakened or incomplete.
- **1-2 (Weak)**: Barely attempts steelmanning, mostly strawman elements.
- **0 (None)**: No steelmanning present; pure strawman or no engagement with opposing view.

### Understanding Score (0-10):
How well does the author demonstrate comprehension of the opposing position, regardless of agreement?

### Intellectual Humility Score (0-10):
- Acknowledges valid points from the other side
- Admits limitations in their own position
- Shows willingness to update views based on evidence
- Avoids absolute certainty when inappropriate

## XP Award Formula:
- Exceptional steelman (9-10): 100 XP
- Strong steelman (7-8): 50 XP
- Good steelman (5-6): 25 XP
- Fair steelman (3-4): 10 XP
- Weak/None (0-2): 0 XP

## Output Format:
Provide a JSON response with:
{
  "steelman_score": <0-10>,
  "steelman_quality_notes": "<specific feedback on what was done well or could improve>",
  "understanding_score": <0-10>,
  "intellectual_humility_score": <0-10>,
  "xp_awarded": <calculated XP>,
  "rationale": "<brief explanation of scores>"
}

**Important Notes:**
- A post doesn't need to agree with the opposing view to steelman it well
- Look for phrases like "I understand that...", "From their perspective...", "The strongest argument for X would be..."
- Not all posts need to steelman - some are just making their own point. If no steelmanning is attempted or relevant, score as 0.
- Consider the discussion context if provided to understand what opposing view should be steelmanned.`;

		const userPrompt = discussionContext
			? `**Discussion Context:**
${discussionContext}

**Post to Evaluate:**
${content}

Evaluate how well this post steelmans an opposing position. Provide scores and detailed feedback in JSON format.`
			: `**Post to Evaluate:**
${content}

Evaluate how well this post steelmans an opposing position. Note that without discussion context, you may need to infer what the opposing view might be. If the post doesn't appear to engage with an opposing view at all, score as 0. Provide scores and detailed feedback in JSON format.`;

		const message = await anthropic.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 1024,
			temperature: 0.3,
			system: systemPrompt,
			messages: [
				{
					role: 'user',
					content: userPrompt
				}
			]
		});

		// Extract text content from Claude's response
		const responseText =
			message.content.find((block) => block.type === 'text')?.text || '{}';

		// Parse JSON from response (Claude should return valid JSON)
		// Handle potential markdown code blocks
		const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || [null, responseText];
		const jsonStr = jsonMatch[1] || responseText;

		const result = JSON.parse(jsonStr.trim());

		// Validate and sanitize the response
		return {
			steelman_score: Math.max(0, Math.min(10, result.steelman_score || 0)),
			steelman_quality_notes:
				result.steelman_quality_notes || 'No detailed feedback provided.',
			understanding_score: Math.max(0, Math.min(10, result.understanding_score || 0)),
			intellectual_humility_score: Math.max(
				0,
				Math.min(10, result.intellectual_humility_score || 0)
			),
			xp_awarded: calculateXP(result.steelman_score || 0),
			rationale: result.rationale || 'No rationale provided.'
		};
	} catch (error: any) {
		logger.error('Claude API error:', error);
		// Return zero scores on error rather than failing
		return {
			steelman_score: 0,
			steelman_quality_notes: `Error during analysis: ${error.message}`,
			understanding_score: 0,
			intellectual_humility_score: 0,
			xp_awarded: 0,
			rationale: 'Analysis failed due to API error.'
		};
	}
}

function calculateXP(steelmanScore: number): number {
	if (steelmanScore >= 9) return 100;
	if (steelmanScore >= 7) return 50;
	if (steelmanScore >= 5) return 25;
	if (steelmanScore >= 3) return 10;
	return 0;
}

export const POST: RequestHandler = async ({ request }) => {
	logger.info('=== Steelman scoring API endpoint called ===');
	try {
		const body = await request.json();
		const { postId, content, discussionContext } = body as {
			postId?: string;
			content?: string;
			discussionContext?: string;
		};

		if (typeof content !== 'string' || !content.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		logger.info('Processing steelman scoring for content length:', content.length);
		logger.info('Discussion context provided:', !!discussionContext);

		const scored = await scoreWithClaude(content, discussionContext);

		logger.info('Steelman scoring complete:', {
			steelman_score: scored.steelman_score,
			xp_awarded: scored.xp_awarded
		});

		return json({ ...scored, postId: postId || null });
	} catch (e: any) {
		logger.error('Steelman scoring endpoint error:', e);
		return json({ error: e?.message || 'Internal error' }, { status: 500 });
	}
};
