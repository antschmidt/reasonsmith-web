/**
 * Helper functions to handle versioned discussion data
 */

/**
 * Get discussion title from versioned data
 */
export function getDiscussionTitle(discussion: any): string {
	if (!discussion) return 'Untitled Discussion';
	const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
	return version?.title || 'Untitled Discussion';
}

/**
 * Get discussion description from versioned data
 */
export function getDiscussionDescription(discussion: any): string {
	if (!discussion) return '';
	const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
	return version?.description || '';
}

/**
 * Get discussion tags from versioned data
 */
export function getDiscussionTags(discussion: any): string[] {
	if (!discussion) return [];
	const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
	return version?.tags || [];
}

/**
 * Get discussion good faith score from versioned data
 */
export function getDiscussionGoodFaithScore(discussion: any): number | null {
	if (!discussion) return null;
	const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
	return version?.good_faith_score || null;
}

/**
 * Get discussion good faith label from versioned data
 */
export function getDiscussionGoodFaithLabel(discussion: any): string | null {
	if (!discussion) return null;
	const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
	return version?.good_faith_label || null;
}

/**
 * Get discussion good faith last evaluated timestamp from versioned data
 */
export function getDiscussionGoodFaithLastEvaluated(discussion: any): string | null {
	if (!discussion) return null;
	const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
	return version?.good_faith_last_evaluated || null;
}

/**
 * Get discussion good faith analysis from versioned data
 */
export function getDiscussionGoodFaithAnalysis(discussion: any): any | null {
	if (!discussion) return null;
	// For analysis, we check the versioned data first, then fall back to local state
	const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
	return version?.good_faith_analysis || discussion.good_faith_analysis || null;
}
