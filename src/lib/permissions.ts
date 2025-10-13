/**
 * Centralized permission utilities for role-based access control
 */

export type UserRole = 'user' | 'admin' | 'slartibartfast';

export type Contributor = {
	id: string;
	role: UserRole;
	[key: string]: any;
};

/**
 * Check if a user has admin-level access (admin or slartibartfast)
 */
export function hasAdminAccess(contributor: Partial<Contributor> | null | undefined): boolean {
	if (!contributor || !contributor.role) return false;
	return ['admin', 'slartibartfast'].includes(contributor.role);
}

/**
 * Check if a user has site manager access (slartibartfast role)
 * Site managers can manage featured content, disputes, and operations
 */
export function hasSiteManagerAccess(contributor: Contributor | null | undefined): boolean {
	if (!contributor) return false;
	return contributor.role === 'slartibartfast';
}

/**
 * Check if a user has full admin access (admin role)
 * Admins have complete system control
 */
export function hasFullAdminAccess(contributor: Contributor | null | undefined): boolean {
	if (!contributor) return false;
	return contributor.role === 'admin';
}

/**
 * Check if a user can edit a resource (owner or admin)
 */
export function canEdit(
	contributor: Contributor | null | undefined,
	resourceOwnerId: string | null | undefined,
	userId: string | null | undefined
): boolean {
	if (!contributor || !userId) return false;

	// Admins can edit anything
	if (hasAdminAccess(contributor)) return true;

	// Owners can edit their own resources
	return resourceOwnerId === userId;
}

/**
 * Check if a user can delete a resource (owner or admin)
 */
export function canDelete(
	contributor: Contributor | null | undefined,
	resourceOwnerId: string | null | undefined,
	userId: string | null | undefined
): boolean {
	// Same logic as canEdit for now
	return canEdit(contributor, resourceOwnerId, userId);
}

/**
 * Check if a user can moderate content (admin or slartibartfast)
 */
export function canModerate(contributor: Contributor | null | undefined): boolean {
	return hasAdminAccess(contributor);
}

/**
 * Check if a user can manage featured content (admin or slartibartfast)
 */
export function canManageFeaturedContent(contributor: Contributor | null | undefined): boolean {
	return hasAdminAccess(contributor);
}

/**
 * Check if a user can upload audio (admin or slartibartfast)
 */
export function canUploadAudio(contributor: Contributor | null | undefined): boolean {
	return hasAdminAccess(contributor);
}

/**
 * Get a human-readable role display name
 */
export function getRoleDisplayName(role: UserRole): string {
	switch (role) {
		case 'admin':
			return 'Administrator';
		case 'slartibartfast':
			return 'Site Manager';
		case 'user':
		default:
			return 'User';
	}
}

/**
 * Check if a role has higher privileges than another role
 */
export function hasHigherPrivileges(role1: UserRole, role2: UserRole): boolean {
	const hierarchy: Record<UserRole, number> = {
		user: 0,
		slartibartfast: 1,
		admin: 2
	};

	return hierarchy[role1] > hierarchy[role2];
}
