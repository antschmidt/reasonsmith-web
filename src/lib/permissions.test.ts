/**
 * Tests for permission utilities
 */

import { describe, it, expect } from 'vitest';
import {
	hasAdminAccess,
	hasSiteManagerAccess,
	hasFullAdminAccess,
	canEdit,
	canDelete,
	canModerate,
	canManageFeaturedContent,
	canUploadAudio,
	getRoleDisplayName,
	hasHigherPrivileges,
	type Contributor,
	type UserRole
} from './permissions';

// Helper to create contributor objects
function createContributor(role: UserRole, id = 'user-123'): Contributor {
	return { id, role };
}

describe('hasAdminAccess', () => {
	it('returns true for admin role', () => {
		expect(hasAdminAccess(createContributor('admin'))).toBe(true);
	});

	it('returns true for slartibartfast role', () => {
		expect(hasAdminAccess(createContributor('slartibartfast'))).toBe(true);
	});

	it('returns false for user role', () => {
		expect(hasAdminAccess(createContributor('user'))).toBe(false);
	});

	it('returns false for null', () => {
		expect(hasAdminAccess(null)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(hasAdminAccess(undefined)).toBe(false);
	});

	it('returns false for contributor without role', () => {
		expect(hasAdminAccess({ id: 'test' })).toBe(false);
	});

	it('returns false for empty object', () => {
		expect(hasAdminAccess({})).toBe(false);
	});
});

describe('hasSiteManagerAccess', () => {
	it('returns true for slartibartfast role', () => {
		expect(hasSiteManagerAccess(createContributor('slartibartfast'))).toBe(true);
	});

	it('returns false for admin role', () => {
		expect(hasSiteManagerAccess(createContributor('admin'))).toBe(false);
	});

	it('returns false for user role', () => {
		expect(hasSiteManagerAccess(createContributor('user'))).toBe(false);
	});

	it('returns false for null', () => {
		expect(hasSiteManagerAccess(null)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(hasSiteManagerAccess(undefined)).toBe(false);
	});
});

describe('hasFullAdminAccess', () => {
	it('returns true for admin role', () => {
		expect(hasFullAdminAccess(createContributor('admin'))).toBe(true);
	});

	it('returns false for slartibartfast role', () => {
		expect(hasFullAdminAccess(createContributor('slartibartfast'))).toBe(false);
	});

	it('returns false for user role', () => {
		expect(hasFullAdminAccess(createContributor('user'))).toBe(false);
	});

	it('returns false for null', () => {
		expect(hasFullAdminAccess(null)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(hasFullAdminAccess(undefined)).toBe(false);
	});
});

describe('canEdit', () => {
	const ownerId = 'owner-123';
	const userId = 'owner-123';
	const otherUserId = 'other-456';

	describe('with admin access', () => {
		it('allows admin to edit any resource', () => {
			const admin = createContributor('admin', 'admin-id');
			expect(canEdit(admin, ownerId, 'admin-id')).toBe(true);
		});

		it('allows slartibartfast to edit any resource', () => {
			const slarti = createContributor('slartibartfast', 'slarti-id');
			expect(canEdit(slarti, ownerId, 'slarti-id')).toBe(true);
		});
	});

	describe('with owner access', () => {
		it('allows owner to edit their own resource', () => {
			const owner = createContributor('user', ownerId);
			expect(canEdit(owner, ownerId, userId)).toBe(true);
		});

		it('prevents non-owner from editing others resource', () => {
			const nonOwner = createContributor('user', otherUserId);
			expect(canEdit(nonOwner, ownerId, otherUserId)).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('returns false for null contributor', () => {
			expect(canEdit(null, ownerId, userId)).toBe(false);
		});

		it('returns false for undefined contributor', () => {
			expect(canEdit(undefined, ownerId, userId)).toBe(false);
		});

		it('returns false for null userId', () => {
			const user = createContributor('user');
			expect(canEdit(user, ownerId, null)).toBe(false);
		});

		it('returns false for undefined userId', () => {
			const user = createContributor('user');
			expect(canEdit(user, ownerId, undefined)).toBe(false);
		});

		it('handles null resourceOwnerId', () => {
			const admin = createContributor('admin', 'admin-id');
			expect(canEdit(admin, null, 'admin-id')).toBe(true); // Admin can still edit
		});
	});
});

describe('canDelete', () => {
	const ownerId = 'owner-123';

	it('allows admin to delete any resource', () => {
		const admin = createContributor('admin', 'admin-id');
		expect(canDelete(admin, ownerId, 'admin-id')).toBe(true);
	});

	it('allows owner to delete their own resource', () => {
		const owner = createContributor('user', ownerId);
		expect(canDelete(owner, ownerId, ownerId)).toBe(true);
	});

	it('prevents non-owner from deleting others resource', () => {
		const nonOwner = createContributor('user', 'other-456');
		expect(canDelete(nonOwner, ownerId, 'other-456')).toBe(false);
	});

	it('returns false for null contributor', () => {
		expect(canDelete(null, ownerId, 'user-id')).toBe(false);
	});
});

describe('canModerate', () => {
	it('returns true for admin', () => {
		expect(canModerate(createContributor('admin'))).toBe(true);
	});

	it('returns true for slartibartfast', () => {
		expect(canModerate(createContributor('slartibartfast'))).toBe(true);
	});

	it('returns false for user', () => {
		expect(canModerate(createContributor('user'))).toBe(false);
	});

	it('returns false for null', () => {
		expect(canModerate(null)).toBe(false);
	});
});

describe('canManageFeaturedContent', () => {
	it('returns true for admin', () => {
		expect(canManageFeaturedContent(createContributor('admin'))).toBe(true);
	});

	it('returns true for slartibartfast', () => {
		expect(canManageFeaturedContent(createContributor('slartibartfast'))).toBe(true);
	});

	it('returns false for user', () => {
		expect(canManageFeaturedContent(createContributor('user'))).toBe(false);
	});

	it('returns false for null', () => {
		expect(canManageFeaturedContent(null)).toBe(false);
	});
});

describe('canUploadAudio', () => {
	it('returns true for admin', () => {
		expect(canUploadAudio(createContributor('admin'))).toBe(true);
	});

	it('returns true for slartibartfast', () => {
		expect(canUploadAudio(createContributor('slartibartfast'))).toBe(true);
	});

	it('returns false for user', () => {
		expect(canUploadAudio(createContributor('user'))).toBe(false);
	});

	it('returns false for null', () => {
		expect(canUploadAudio(null)).toBe(false);
	});
});

describe('getRoleDisplayName', () => {
	it('returns "Administrator" for admin', () => {
		expect(getRoleDisplayName('admin')).toBe('Administrator');
	});

	it('returns "Site Manager" for slartibartfast', () => {
		expect(getRoleDisplayName('slartibartfast')).toBe('Site Manager');
	});

	it('returns "User" for user', () => {
		expect(getRoleDisplayName('user')).toBe('User');
	});
});

describe('hasHigherPrivileges', () => {
	describe('admin privileges', () => {
		it('admin has higher privileges than slartibartfast', () => {
			expect(hasHigherPrivileges('admin', 'slartibartfast')).toBe(true);
		});

		it('admin has higher privileges than user', () => {
			expect(hasHigherPrivileges('admin', 'user')).toBe(true);
		});

		it('admin does not have higher privileges than admin', () => {
			expect(hasHigherPrivileges('admin', 'admin')).toBe(false);
		});
	});

	describe('slartibartfast privileges', () => {
		it('slartibartfast has higher privileges than user', () => {
			expect(hasHigherPrivileges('slartibartfast', 'user')).toBe(true);
		});

		it('slartibartfast does not have higher privileges than admin', () => {
			expect(hasHigherPrivileges('slartibartfast', 'admin')).toBe(false);
		});

		it('slartibartfast does not have higher privileges than slartibartfast', () => {
			expect(hasHigherPrivileges('slartibartfast', 'slartibartfast')).toBe(false);
		});
	});

	describe('user privileges', () => {
		it('user does not have higher privileges than user', () => {
			expect(hasHigherPrivileges('user', 'user')).toBe(false);
		});

		it('user does not have higher privileges than slartibartfast', () => {
			expect(hasHigherPrivileges('user', 'slartibartfast')).toBe(false);
		});

		it('user does not have higher privileges than admin', () => {
			expect(hasHigherPrivileges('user', 'admin')).toBe(false);
		});
	});
});
