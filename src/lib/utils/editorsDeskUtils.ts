/**
 * Utility functions for Editors' Desk picks feature
 */

import { hasAdminAccess } from '$lib/permissions';

export type EditorsDeskPickStatus = 'pending_author_approval' | 'approved' | 'rejected';

export interface Contributor {
	id: string;
	role?: string;
	display_name?: string;
	handle?: string;
}

export interface CuratorInfo {
	displayName?: string | null;
	display_name?: string | null;
}

/**
 * Type definition for Editors' Desk picks used in UI components
 */
export interface EditorsDeskPick {
	id: string;
	title: string;
	excerpt?: string | null;
	editor_note?: string | null;
	created_at: string;
	post_id?: string | null;
	discussion_id?: string | null;
	userByCuratorId?: CuratorInfo | null;
	curator?: CuratorInfo | null;
	post?: {
		contributor?: {
			display_name?: string | null;
			handle?: string | null;
		} | null;
	} | null;
	discussion?: {
		discussion_versions?: Array<{
			title?: string | null;
			description?: string | null;
		}> | null;
	} | null;
}

/**
 * Get the curator's display name with fallback
 * @param curator - Curator object with displayName or display_name fields
 * @returns Display name or default fallback
 */
export function getCuratorName(curator?: CuratorInfo | null): string {
	return curator?.displayName || curator?.display_name || 'Editors';
}

/**
 * Check if a contributor can curate Editors' Desk picks
 * Only admin and slartibartfast roles have this permission
 */
export function canCurateEditorsDesk(contributor: Contributor | null): boolean {
	if (!contributor || !contributor.role) {
		return false;
	}
	return hasAdminAccess(contributor as any);
}

/**
 * Determine if a pick needs author approval
 * Approval is needed when the curator is not the original author
 */
export function needsAuthorApproval(curatorId: string, authorId: string): boolean {
	return curatorId !== authorId;
}

/**
 * Get the appropriate status for a new pick based on whether approval is needed
 */
export function getInitialPickStatus(
	curatorId: string,
	authorId: string
): EditorsDeskPickStatus {
	return needsAuthorApproval(curatorId, authorId) ? 'pending_author_approval' : 'approved';
}

/**
 * Get a human-readable label for a pick status
 */
export function getStatusLabel(status: EditorsDeskPickStatus): string {
	const labels: Record<EditorsDeskPickStatus, string> = {
		pending_author_approval: 'Pending Approval',
		approved: 'Approved',
		rejected: 'Rejected'
	};
	return labels[status] || status;
}

/**
 * Get a color class for a pick status (for badge styling)
 */
export function getStatusColor(status: EditorsDeskPickStatus): string {
	const colors: Record<EditorsDeskPickStatus, string> = {
		pending_author_approval: 'warning',
		approved: 'success',
		rejected: 'error'
	};
	return colors[status] || 'neutral';
}

/**
 * Extract excerpt from content if not provided
 */
export function generateExcerpt(content: string, maxLength: number = 200): string {
	if (!content) return '';

	// Remove HTML tags and extra whitespace
	const cleanText = content
		.replace(/<[^>]*>/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	if (cleanText.length <= maxLength) return cleanText;

	// Find the last complete sentence or word within the limit
	const truncated = cleanText.substring(0, maxLength);
	const lastSentence = truncated.lastIndexOf('. ');
	const lastWord = truncated.lastIndexOf(' ');

	// Prefer ending at a sentence, otherwise at a word boundary
	if (lastSentence > maxLength * 0.6) {
		return truncated.substring(0, lastSentence + 1);
	} else if (lastWord > maxLength * 0.8) {
		return truncated.substring(0, lastWord) + '...';
	} else {
		return truncated + '...';
	}
}

/**
 * Format a pick for display
 */
export function formatPickForDisplay(pick: any): {
	title: string;
	excerpt: string;
	contentType: 'discussion' | 'post';
	contentId: string;
	authorName: string;
	curatorName: string;
} {
	const contentType = pick.discussion_id ? 'discussion' : 'post';
	const contentId = pick.discussion_id || pick.post_id;

	const authorName =
		pick.author?.displayName ||
		pick.author?.display_name ||
		pick.author?.email?.split('@')[0] ||
		'Unknown Author';

	const curatorName =
		pick.curator?.displayName ||
		pick.curator?.display_name ||
		pick.curator?.email?.split('@')[0] ||
		'Unknown Curator';

	return {
		title: pick.title,
		excerpt: pick.excerpt || '',
		contentType,
		contentId,
		authorName,
		curatorName
	};
}
