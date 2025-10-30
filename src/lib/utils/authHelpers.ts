/**
 * Auth Helper Utilities
 *
 * Consolidated authentication and authorization helper functions
 * to reduce code duplication across the application.
 */

/**
 * Collects all roles from a user object by checking multiple possible locations
 * where roles might be stored (roles array, defaultRole, metadata, app_metadata, role field)
 *
 * @param user - The user object (can be any type due to various auth providers)
 * @returns Array of unique role strings
 */
export function collectRoles(user: any): string[] {
	if (!user) return [];

	const roles = new Set<string>();

	// Check direct roles array
	if (Array.isArray(user?.roles)) {
		user.roles.forEach((r: any) => {
			if (typeof r === 'string') roles.add(r);
		});
	}

	// Check defaultRole field (both naming conventions)
	const defaultRole = user?.defaultRole ?? user?.default_role;
	if (typeof defaultRole === 'string') {
		roles.add(defaultRole);
	}

	// Check metadata.roles
	if (Array.isArray(user?.metadata?.roles)) {
		user.metadata.roles.forEach((r: any) => {
			if (typeof r === 'string') roles.add(r);
		});
	}

	// Check app_metadata.roles
	if (Array.isArray(user?.app_metadata?.roles)) {
		user.app_metadata.roles.forEach((r: any) => {
			if (typeof r === 'string') roles.add(r);
		});
	}

	// Check single role field
	if (typeof user?.role === 'string') {
		roles.add(user.role);
	}

	return Array.from(roles);
}

/**
 * Checks if a user has a specific role
 *
 * @param user - The user object
 * @param role - The role to check for
 * @returns true if user has the role
 */
export function hasRole(user: any, role: string): boolean {
	const roles = collectRoles(user);
	return roles.includes(role);
}

/**
 * Checks if a user has any of the specified roles
 *
 * @param user - The user object
 * @param rolesToCheck - Array of roles to check
 * @returns true if user has at least one of the roles
 */
export function hasAnyRole(user: any, rolesToCheck: string[]): boolean {
	const roles = collectRoles(user);
	return rolesToCheck.some(role => roles.includes(role));
}

/**
 * Checks if a user has all of the specified roles
 *
 * @param user - The user object
 * @param rolesToCheck - Array of roles to check
 * @returns true if user has all of the roles
 */
export function hasAllRoles(user: any, rolesToCheck: string[]): boolean {
	const roles = collectRoles(user);
	return rolesToCheck.every(role => roles.includes(role));
}

/**
 * Gets user initials from a display name
 * Useful for avatar fallbacks
 *
 * @param name - The user's display name
 * @returns Initials (up to 2 characters) or "?" if no name
 */
export function getUserInitials(name: string | undefined): string {
	if (!name) return '?';

	return name
		.trim()
		.split(' ')
		.map((n: string) => n[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
}
