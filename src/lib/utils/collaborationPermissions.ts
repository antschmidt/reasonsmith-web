import type { NhostClient } from '@nhost/nhost-js';
import {
	CHECK_POST_EDIT_PERMISSION,
	GET_POST_COLLABORATORS
} from '$lib/graphql/queries';

/**
 * Check if a user can edit a specific post
 * Users can edit if they are:
 * 1. The post owner (author_id)
 * 2. An accepted collaborator with 'editor' role
 */
export async function canEditPost(
	postId: string,
	userId: string,
	nhost: NhostClient
): Promise<boolean> {
	try {
		const result = await nhost.graphql.request(CHECK_POST_EDIT_PERMISSION, {
			postId,
			userId
		});

		if (result.error) {
			console.error('Error checking edit permission:', result.error);
			return false;
		}

		// Check if user is the post owner
		const post = result.data?.post_by_pk;
		if (!post) return false;

		if (post.author_id === userId) {
			return true;
		}

		// Check if user is an accepted editor collaborator
		const collaboration = post.post_collaborators?.find(
			(collab: any) =>
				collab.contributor_id === userId &&
				collab.status === 'accepted' &&
				collab.role === 'editor'
		);

		return !!collaboration;
	} catch (error) {
		console.error('Error in canEditPost:', error);
		return false;
	}
}

/**
 * Check if a user is the owner of a post
 */
export async function isPostOwner(
	postId: string,
	userId: string,
	nhost: NhostClient
): Promise<boolean> {
	try {
		const result = await nhost.graphql.request(CHECK_POST_EDIT_PERMISSION, {
			postId,
			userId
		});

		if (result.error) {
			console.error('Error checking post owner:', result.error);
			return false;
		}

		const post = result.data?.post_by_pk;
		return post?.author_id === userId;
	} catch (error) {
		console.error('Error in isPostOwner:', error);
		return false;
	}
}

/**
 * Get all collaborators for a post with their current status and role
 */
export async function getPostCollaborators(postId: string, nhost: NhostClient) {
	try {
		const result = await nhost.graphql.request(GET_POST_COLLABORATORS, {
			postId
		});

		if (result.error) {
			console.error('Error fetching collaborators:', result.error);
			return [];
		}

		return result.data?.post_collaborator || [];
	} catch (error) {
		console.error('Error in getPostCollaborators:', error);
		return [];
	}
}

/**
 * Get a human-readable label for a collaborator role
 */
export function getCollaboratorRoleLabel(role: string): string {
	const labels: Record<string, string> = {
		editor: 'Editor',
		viewer: 'Viewer'
	};
	return labels[role] || role;
}

/**
 * Get a human-readable label for a collaboration status
 */
export function getCollaborationStatusLabel(status: string): string {
	const labels: Record<string, string> = {
		pending: 'Pending',
		accepted: 'Accepted',
		declined: 'Declined'
	};
	return labels[status] || status;
}

/**
 * Get a color code for collaboration status (for UI styling)
 */
export function getCollaborationStatusColor(status: string): string {
	const colors: Record<string, string> = {
		pending: '#f59e0b', // amber
		accepted: '#10b981', // green
		declined: '#ef4444' // red
	};
	return colors[status] || '#6b7280'; // gray fallback
}

/**
 * Get a color code for collaborator role (for UI styling)
 */
export function getCollaboratorRoleColor(role: string): string {
	const colors: Record<string, string> = {
		editor: '#3b82f6', // blue
		viewer: '#8b5cf6' // purple
	};
	return colors[role] || '#6b7280'; // gray fallback
}

/**
 * Count accepted collaborators for a post
 */
export async function getAcceptedCollaboratorCount(
	postId: string,
	nhost: NhostClient
): Promise<number> {
	try {
		const collaborators = await getPostCollaborators(postId, nhost);
		return collaborators.filter((c: any) => c.status === 'accepted').length;
	} catch (error) {
		console.error('Error counting collaborators:', error);
		return 0;
	}
}

/**
 * Check if a user has a pending collaboration invite for a post
 */
export async function hasPendingInvite(
	postId: string,
	userId: string,
	nhost: NhostClient
): Promise<boolean> {
	try {
		const collaborators = await getPostCollaborators(postId, nhost);
		return collaborators.some(
			(c: any) => c.contributor_id === userId && c.status === 'pending'
		);
	} catch (error) {
		console.error('Error checking pending invite:', error);
		return false;
	}
}
