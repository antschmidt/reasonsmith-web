import { nhost } from '$lib/nhostClient';
import { UPDATE_POST_STEELMAN_SCORES, AWARD_XP } from '$lib/graphql/queries';

interface SteelmanScoreResult {
	steelman_score: number;
	steelman_quality_notes: string;
	understanding_score: number;
	intellectual_humility_score: number;
	xp_awarded: number;
	rationale: string;
}

/**
 * Scores a post for steelman quality using the serverless function,
 * updates the post with the scores, and awards XP to the contributor.
 *
 * @param postId - The ID of the post to score
 * @param contributorId - The ID of the post author
 * @param content - The content of the post
 * @param discussionContext - Optional discussion context for better scoring
 * @returns The scoring result
 */
export async function scoreAndAwardSteelman(
	postId: string,
	contributorId: string,
	content: string,
	discussionContext?: string
): Promise<SteelmanScoreResult | null> {
	try {
		// Call the serverless function to score the post
		const response = await fetch('/api/scoresteelman', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				postId,
				content,
				discussionContext
			})
		});

		if (!response.ok) {
			console.error('Steelman scoring failed:', response.statusText);
			return null;
		}

		const result: SteelmanScoreResult = await response.json();

		// Update the post with the scores
		await nhost.graphql.request(UPDATE_POST_STEELMAN_SCORES, {
			postId,
			steelmanScore: result.steelman_score,
			steelmanNotes: result.steelman_quality_notes,
			understandingScore: result.understanding_score,
			intellectualHumilityScore: result.intellectual_humility_score
		});

		// Award XP if the score is > 0
		if (result.xp_awarded > 0) {
			await nhost.graphql.request(AWARD_XP, {
				contributorId,
				activityType: 'steelman_quality',
				xpAmount: result.xp_awarded,
				relatedPostId: postId,
				notes: `Steelman score: ${result.steelman_score}/10 - ${result.steelman_quality_notes.substring(0, 100)}`
			});
		}

		return result;
	} catch (error) {
		console.error('Error scoring steelman:', error);
		return null;
	}
}

/**
 * Helper to extract discussion context from a discussion object.
 * This provides context to the AI for better steelman scoring.
 */
export function buildDiscussionContext(discussion: any): string {
	if (!discussion) return '';

	const title = discussion.current_version?.[0]?.title || discussion.title || '';
	const description = discussion.current_version?.[0]?.description || discussion.description || '';

	return `Discussion Title: ${title}\n\nDiscussion Description: ${description}`;
}
