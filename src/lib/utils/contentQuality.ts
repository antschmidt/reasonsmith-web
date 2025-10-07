/**
 * Content quality assessment utilities
 */

// Question pattern constant
const QUESTION_PATTERN = /\?$/;

/**
 * Heuristic pre-screening function for content quality
 * @param content - The content to assess
 * @param title - Optional title (for discussions)
 * @returns Assessment result with score, passed flag, and issues
 */
export function assessContentQuality(
	content: string,
	title?: string
): { score: number; passed: boolean; issues: string[] } {
	const issues: string[] = [];
	let score = 0;

	// Word count assessment (0-25 points)
	const wordCount = content.trim().split(/\s+/).length;
	if (wordCount >= 50) score += 25;
	else if (wordCount >= 25) score += 15;
	else if (wordCount >= 10) score += 10;
	else issues.push(`Content too short (${wordCount} words, minimum 25 recommended)`);

	// Substance assessment (0-15 points)
	const isQuestion = QUESTION_PATTERN.test(content.trim());
	const hasReasoningWords = /\b(because|since|therefore|however|although|while)\b/i.test(
		content
	);
	const hasEvidence = /\b(study|research|data|evidence|example|according to)\b/i.test(content);

	// Structure assessment (0-25 points)
	const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);

	if (sentences.length >= 3) score += 25;
	else if (sentences.length >= 2) score += 15;
	else if (sentences.length >= 1 && isQuestion)
		score += 15; // Questions can be shorter
	else issues.push('Content needs more detailed explanation (at least 2-3 sentences)');

	// Title assessment for discussions (0-15 points)
	if (title) {
		const titleWords = title.trim().split(/\s+/).length;
		if (titleWords >= 3 && titleWords <= 15) score += 15;
		else if (titleWords >= 2) score += 10;
		else issues.push('Title should be 3-15 words for clarity');
	}

	// Basic grammar/formatting (0-20 points)
	const hasCapitalization = /[A-Z]/.test(content);
	const hasPunctuation = /[.!?]/.test(content);
	const notAllCaps = content !== content.toUpperCase();

	if (hasCapitalization && hasPunctuation && notAllCaps) score += 20;
	else if (hasCapitalization && hasPunctuation) score += 15;
	else if (hasCapitalization || hasPunctuation) score += 10;
	else issues.push('Content needs proper capitalization and punctuation');

	if (hasEvidence) score += 15;
	else if (hasReasoningWords) score += 10;
	else if (isQuestion) score += 5;
	else issues.push('Content could benefit from more reasoning, evidence, or specific examples');

	const passed = score >= 50; // 50% threshold
	return { score, passed, issues };
}
