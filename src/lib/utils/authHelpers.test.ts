/**
 * Tests for auth helper utilities
 */

import { describe, it, expect } from 'vitest';
import { collectRoles, hasRole, hasAnyRole, hasAllRoles, getUserInitials } from './authHelpers';

describe('collectRoles', () => {
	describe('null/undefined handling', () => {
		it('returns empty array for null user', () => {
			expect(collectRoles(null)).toEqual([]);
		});

		it('returns empty array for undefined user', () => {
			expect(collectRoles(undefined)).toEqual([]);
		});

		it('returns empty array for empty object', () => {
			expect(collectRoles({})).toEqual([]);
		});
	});

	describe('direct roles array', () => {
		it('collects roles from roles array', () => {
			const user = { roles: ['user', 'admin'] };
			expect(collectRoles(user)).toContain('user');
			expect(collectRoles(user)).toContain('admin');
		});

		it('filters out non-string roles', () => {
			const user = { roles: ['user', 123, null, 'admin', undefined] };
			const roles = collectRoles(user);
			expect(roles).toEqual(['user', 'admin']);
		});

		it('handles empty roles array', () => {
			const user = { roles: [] };
			expect(collectRoles(user)).toEqual([]);
		});
	});

	describe('defaultRole field', () => {
		it('collects from defaultRole (camelCase)', () => {
			const user = { defaultRole: 'user' };
			expect(collectRoles(user)).toEqual(['user']);
		});

		it('collects from default_role (snake_case)', () => {
			const user = { default_role: 'admin' };
			expect(collectRoles(user)).toEqual(['admin']);
		});

		it('prefers defaultRole over default_role when both present', () => {
			const user = { defaultRole: 'user', default_role: 'admin' };
			// Due to nullish coalescing, defaultRole is checked first
			expect(collectRoles(user)).toContain('user');
		});
	});

	describe('metadata.roles', () => {
		it('collects from metadata.roles', () => {
			const user = { metadata: { roles: ['editor', 'moderator'] } };
			expect(collectRoles(user)).toContain('editor');
			expect(collectRoles(user)).toContain('moderator');
		});

		it('filters out non-string roles from metadata', () => {
			const user = { metadata: { roles: ['user', 42, 'admin'] } };
			const roles = collectRoles(user);
			expect(roles).toEqual(['user', 'admin']);
		});
	});

	describe('app_metadata.roles', () => {
		it('collects from app_metadata.roles', () => {
			const user = { app_metadata: { roles: ['superuser'] } };
			expect(collectRoles(user)).toEqual(['superuser']);
		});

		it('filters out non-string roles from app_metadata', () => {
			const user = { app_metadata: { roles: [null, 'admin', {}] } };
			expect(collectRoles(user)).toEqual(['admin']);
		});
	});

	describe('single role field', () => {
		it('collects from role field', () => {
			const user = { role: 'slartibartfast' };
			expect(collectRoles(user)).toEqual(['slartibartfast']);
		});

		it('ignores non-string role field', () => {
			const user = { role: 123 };
			expect(collectRoles(user)).toEqual([]);
		});
	});

	describe('deduplication', () => {
		it('returns unique roles when same role appears in multiple locations', () => {
			const user = {
				roles: ['user', 'admin'],
				defaultRole: 'user',
				metadata: { roles: ['admin', 'editor'] },
				role: 'user'
			};
			const roles = collectRoles(user);
			expect(roles).toHaveLength(3);
			expect(roles).toContain('user');
			expect(roles).toContain('admin');
			expect(roles).toContain('editor');
		});
	});

	describe('combined sources', () => {
		it('collects from all sources', () => {
			const user = {
				roles: ['role1'],
				defaultRole: 'role2',
				metadata: { roles: ['role3'] },
				app_metadata: { roles: ['role4'] },
				role: 'role5'
			};
			const roles = collectRoles(user);
			expect(roles).toHaveLength(5);
			expect(roles).toContain('role1');
			expect(roles).toContain('role2');
			expect(roles).toContain('role3');
			expect(roles).toContain('role4');
			expect(roles).toContain('role5');
		});
	});
});

describe('hasRole', () => {
	it('returns true when user has the role', () => {
		const user = { roles: ['user', 'admin'] };
		expect(hasRole(user, 'admin')).toBe(true);
	});

	it('returns false when user does not have the role', () => {
		const user = { roles: ['user'] };
		expect(hasRole(user, 'admin')).toBe(false);
	});

	it('returns false for null user', () => {
		expect(hasRole(null, 'admin')).toBe(false);
	});

	it('returns false for undefined user', () => {
		expect(hasRole(undefined, 'admin')).toBe(false);
	});

	it('works with role from any source', () => {
		expect(hasRole({ defaultRole: 'admin' }, 'admin')).toBe(true);
		expect(hasRole({ role: 'editor' }, 'editor')).toBe(true);
		expect(hasRole({ metadata: { roles: ['mod'] } }, 'mod')).toBe(true);
	});
});

describe('hasAnyRole', () => {
	it('returns true when user has at least one of the roles', () => {
		const user = { roles: ['user'] };
		expect(hasAnyRole(user, ['admin', 'user', 'moderator'])).toBe(true);
	});

	it('returns false when user has none of the roles', () => {
		const user = { roles: ['user'] };
		expect(hasAnyRole(user, ['admin', 'moderator'])).toBe(false);
	});

	it('returns false for empty rolesToCheck array', () => {
		const user = { roles: ['user', 'admin'] };
		expect(hasAnyRole(user, [])).toBe(false);
	});

	it('returns false for null user', () => {
		expect(hasAnyRole(null, ['admin'])).toBe(false);
	});

	it('returns true when user has multiple matching roles', () => {
		const user = { roles: ['admin', 'moderator'] };
		expect(hasAnyRole(user, ['admin', 'moderator'])).toBe(true);
	});
});

describe('hasAllRoles', () => {
	it('returns true when user has all specified roles', () => {
		const user = { roles: ['user', 'admin', 'moderator'] };
		expect(hasAllRoles(user, ['admin', 'moderator'])).toBe(true);
	});

	it('returns false when user is missing one role', () => {
		const user = { roles: ['user', 'admin'] };
		expect(hasAllRoles(user, ['admin', 'moderator'])).toBe(false);
	});

	it('returns true for empty rolesToCheck array', () => {
		const user = { roles: ['user'] };
		expect(hasAllRoles(user, [])).toBe(true);
	});

	it('returns true for empty array with no user roles', () => {
		expect(hasAllRoles({}, [])).toBe(true);
	});

	it('returns false for null user when roles required', () => {
		expect(hasAllRoles(null, ['admin'])).toBe(false);
	});

	it('works with roles from different sources', () => {
		const user = {
			roles: ['role1'],
			defaultRole: 'role2',
			role: 'role3'
		};
		expect(hasAllRoles(user, ['role1', 'role2', 'role3'])).toBe(true);
	});
});

describe('getUserInitials', () => {
	it('returns initials for two-word name', () => {
		expect(getUserInitials('John Doe')).toBe('JD');
	});

	it('returns initials for single-word name', () => {
		expect(getUserInitials('John')).toBe('J');
	});

	it('returns up to 2 characters for multi-word names', () => {
		expect(getUserInitials('John Paul Doe')).toBe('JP');
	});

	it('returns uppercase initials', () => {
		expect(getUserInitials('john doe')).toBe('JD');
	});

	it('returns ? for undefined name', () => {
		expect(getUserInitials(undefined)).toBe('?');
	});

	it('returns ? for empty string', () => {
		expect(getUserInitials('')).toBe('?');
	});

	it('returns empty string for whitespace-only string', () => {
		// After trim, becomes empty string but passes !name check
		expect(getUserInitials('   ')).toBe('');
	});

	it('handles names with extra whitespace', () => {
		expect(getUserInitials('  John   Doe  ')).toBe('JD');
	});

	it('handles single character name', () => {
		expect(getUserInitials('J')).toBe('J');
	});

	it('handles hyphenated names (takes first char of each word)', () => {
		// "Mary-Jane Watson" splits to ["Mary-Jane", "Watson"]
		expect(getUserInitials('Mary-Jane Watson')).toBe('MW');
	});
});
