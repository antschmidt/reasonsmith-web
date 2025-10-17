// Utility functions for checking subscription and feature access

export interface Contributor {
	id: string;
	realtime_collaboration_enabled?: boolean;
	subscription_expires_at?: string | null;
	display_name?: string;
	role?: string;
}

/**
 * Check if a contributor has access to real-time collaboration features
 * @param contributor - The contributor object with subscription fields
 * @returns true if user has active real-time collaboration access
 */
export function canUseRealtimeCollaboration(contributor: Contributor | null | undefined): boolean {
	if (!contributor) return false;

	// Check if feature is enabled
	if (contributor.realtime_collaboration_enabled !== true) {
		return false;
	}

	// Check if subscription has expired
	if (contributor.subscription_expires_at) {
		const expiresAt = new Date(contributor.subscription_expires_at);
		const now = new Date();
		if (expiresAt <= now) {
			return false; // Subscription expired
		}
	}

	return true;
}

/**
 * Check if all collaborators on a post have real-time collaboration enabled
 * This is necessary because all users in a collaborative session need the feature
 * @param author - The post author
 * @param collaborators - Array of accepted collaborators
 * @returns Object with hasAccess boolean and list of users without access
 */
export function checkAllCollaboratorsHaveRealtime(
	author: Contributor,
	collaborators: Contributor[]
): { hasAccess: boolean; usersWithoutAccess: string[] } {
	const usersWithoutAccess: string[] = [];

	// Check author
	if (!canUseRealtimeCollaboration(author)) {
		usersWithoutAccess.push(author.display_name || 'Author');
	}

	// Check each collaborator
	for (const collab of collaborators) {
		if (!canUseRealtimeCollaboration(collab)) {
			usersWithoutAccess.push(collab.display_name || 'Collaborator');
		}
	}

	return {
		hasAccess: usersWithoutAccess.length === 0,
		usersWithoutAccess
	};
}

/**
 * Get a user-friendly message about why realtime collaboration is not available
 * @param author - The post author
 * @param collaborators - Array of accepted collaborators
 * @returns User-friendly message explaining the issue
 */
export function getRealtimeUnavailableMessage(
	author: Contributor,
	collaborators: Contributor[]
): string {
	const check = checkAllCollaboratorsHaveRealtime(author, collaborators);

	if (check.hasAccess) {
		return '';
	}

	if (check.usersWithoutAccess.length === 1) {
		return `${check.usersWithoutAccess[0]} needs to upgrade to Pro for real-time collaboration.`;
	}

	return `The following users need to upgrade to Pro: ${check.usersWithoutAccess.join(', ')}`;
}

/**
 * Check if subscription is expiring soon (within 7 days)
 * @param contributor - The contributor object
 * @returns true if subscription expires within 7 days
 */
export function isSubscriptionExpiringSoon(contributor: Contributor | null | undefined): boolean {
	if (!contributor || !contributor.subscription_expires_at) {
		return false;
	}

	const expiresAt = new Date(contributor.subscription_expires_at);
	const now = new Date();
	const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

	return expiresAt > now && expiresAt <= sevenDaysFromNow;
}

/**
 * Get days until subscription expires
 * @param contributor - The contributor object
 * @returns Number of days until expiration, or null if no expiration
 */
export function getDaysUntilExpiration(contributor: Contributor | null | undefined): number | null {
	if (!contributor || !contributor.subscription_expires_at) {
		return null;
	}

	const expiresAt = new Date(contributor.subscription_expires_at);
	const now = new Date();
	const diff = expiresAt.getTime() - now.getTime();
	const days = Math.ceil(diff / (24 * 60 * 60 * 1000));

	return days > 0 ? days : 0;
}
