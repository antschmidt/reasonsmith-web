/**
 * Tests for credit utility functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	shouldResetMonthlyCredits,
	getMonthlyCreditsRemaining,
	getPurchasedCreditsRemaining,
	canUseAnalysis,
	willUsePurchasedCredit
} from './creditUtils';
import type { UserRole } from './permissions';

// Helper type for contributor objects
interface TestContributor {
	id?: string;
	role: UserRole;
	analysis_enabled: boolean;
	analysis_limit: number | null;
	analysis_count_used: number;
	analysis_count_reset_at: string | null;
	monthly_credits_remaining?: number | null;
	monthly_credits_reset_at?: string | null;
	purchased_credits_remaining?: number | null;
	purchased_credits_total?: number;
	purchased_credits_used?: number;
}

// Helper to create contributor objects
function createContributor(overrides: Partial<TestContributor> = {}): TestContributor {
	return {
		id: 'user-123',
		role: 'user',
		analysis_enabled: true,
		analysis_limit: 10,
		analysis_count_used: 0,
		analysis_count_reset_at: null,
		purchased_credits_total: 0,
		purchased_credits_used: 0,
		...overrides
	};
}

describe('shouldResetMonthlyCredits', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns true if lastResetDate is null', () => {
		expect(shouldResetMonthlyCredits(null)).toBe(true);
	});

	it('returns true if last reset was in a previous month', () => {
		vi.setSystemTime(new Date('2024-02-15T12:00:00'));
		expect(shouldResetMonthlyCredits('2024-01-15T12:00:00')).toBe(true);
	});

	it('returns true if last reset was in a previous year', () => {
		vi.setSystemTime(new Date('2024-01-15T12:00:00'));
		expect(shouldResetMonthlyCredits('2023-12-15T12:00:00')).toBe(true);
	});

	it('returns false if last reset was in the current month', () => {
		vi.setSystemTime(new Date('2024-02-15T12:00:00'));
		expect(shouldResetMonthlyCredits('2024-02-01T12:00:00')).toBe(false);
	});

	it('returns false if last reset was today', () => {
		vi.setSystemTime(new Date('2024-02-15T12:00:00'));
		expect(shouldResetMonthlyCredits('2024-02-15T12:00:00')).toBe(false);
	});

	it('returns false if reset was on last day of current month', () => {
		vi.setSystemTime(new Date('2024-02-29T12:00:00'));
		expect(shouldResetMonthlyCredits('2024-02-01T12:00:00')).toBe(false);
	});

	it('handles year boundary correctly', () => {
		vi.setSystemTime(new Date('2025-01-01T12:00:00'));
		expect(shouldResetMonthlyCredits('2024-12-31T12:00:00')).toBe(true);
	});
});

describe('getMonthlyCreditsRemaining', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-02-15T12:00:00'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('admin/slartibartfast access', () => {
		it('returns Infinity for admin role', () => {
			const admin = createContributor({ role: 'admin' });
			expect(getMonthlyCreditsRemaining(admin)).toBe(Infinity);
		});

		it('returns Infinity for slartibartfast role', () => {
			const slarti = createContributor({ role: 'slartibartfast' });
			expect(getMonthlyCreditsRemaining(slarti)).toBe(Infinity);
		});
	});

	describe('unlimited access (null limit)', () => {
		it('returns Infinity when analysis_limit is null', () => {
			const contributor = createContributor({ analysis_limit: null });
			expect(getMonthlyCreditsRemaining(contributor)).toBe(Infinity);
		});
	});

	describe('using monthly_credits_remaining field', () => {
		it('returns monthly_credits_remaining when available', () => {
			const contributor = createContributor({
				monthly_credits_remaining: 5,
				analysis_limit: 10
			});
			expect(getMonthlyCreditsRemaining(contributor)).toBe(5);
		});

		it('returns 0 when monthly_credits_remaining is 0', () => {
			const contributor = createContributor({
				monthly_credits_remaining: 0,
				analysis_limit: 10
			});
			expect(getMonthlyCreditsRemaining(contributor)).toBe(0);
		});

		it('returns 0 for negative monthly_credits_remaining', () => {
			const contributor = createContributor({
				monthly_credits_remaining: -5,
				analysis_limit: 10
			});
			expect(getMonthlyCreditsRemaining(contributor)).toBe(0);
		});
	});

	describe('fallback calculation', () => {
		it('returns full limit when reset is needed', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 5,
				analysis_count_reset_at: '2024-01-01T12:00:00' // Previous month
			});
			expect(getMonthlyCreditsRemaining(contributor)).toBe(10);
		});

		it('calculates remaining from usage when no reset needed', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 3,
				analysis_count_reset_at: '2024-02-01T12:00:00' // Current month
			});
			expect(getMonthlyCreditsRemaining(contributor)).toBe(7);
		});

		it('returns 0 when all credits used', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 10,
				analysis_count_reset_at: '2024-02-01T12:00:00'
			});
			expect(getMonthlyCreditsRemaining(contributor)).toBe(0);
		});

		it('returns 0 when over limit', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 15,
				analysis_count_reset_at: '2024-02-01T12:00:00'
			});
			expect(getMonthlyCreditsRemaining(contributor)).toBe(0);
		});

		it('uses monthly_credits_reset_at as fallback', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 5,
				analysis_count_reset_at: null,
				monthly_credits_reset_at: '2024-01-01T12:00:00' // Previous month
			});
			expect(getMonthlyCreditsRemaining(contributor)).toBe(10);
		});
	});
});

describe('getPurchasedCreditsRemaining', () => {
	describe('using purchased_credits_remaining field', () => {
		it('returns purchased_credits_remaining when available', () => {
			expect(getPurchasedCreditsRemaining({ purchased_credits_remaining: 25 })).toBe(25);
		});

		it('returns 0 when purchased_credits_remaining is 0', () => {
			expect(getPurchasedCreditsRemaining({ purchased_credits_remaining: 0 })).toBe(0);
		});

		it('returns 0 for negative purchased_credits_remaining', () => {
			expect(getPurchasedCreditsRemaining({ purchased_credits_remaining: -10 })).toBe(0);
		});
	});

	describe('fallback calculation', () => {
		it('calculates remaining from total and used', () => {
			expect(
				getPurchasedCreditsRemaining({
					purchased_credits_total: 100,
					purchased_credits_used: 30
				})
			).toBe(70);
		});

		it('returns 0 when all credits used', () => {
			expect(
				getPurchasedCreditsRemaining({
					purchased_credits_total: 50,
					purchased_credits_used: 50
				})
			).toBe(0);
		});

		it('returns 0 when over-used', () => {
			expect(
				getPurchasedCreditsRemaining({
					purchased_credits_total: 50,
					purchased_credits_used: 60
				})
			).toBe(0);
		});

		it('handles missing fields with defaults', () => {
			expect(getPurchasedCreditsRemaining({})).toBe(0);
		});

		it('handles only total provided', () => {
			expect(getPurchasedCreditsRemaining({ purchased_credits_total: 100 })).toBe(100);
		});
	});
});

describe('canUseAnalysis', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-02-15T12:00:00'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('disabled accounts', () => {
		it('returns false when analysis_enabled is false', () => {
			const contributor = createContributor({ analysis_enabled: false });
			expect(canUseAnalysis(contributor)).toBe(false);
		});

		it('returns false even for admin when disabled', () => {
			const admin = createContributor({ role: 'admin', analysis_enabled: false });
			expect(canUseAnalysis(admin)).toBe(false);
		});
	});

	describe('admin access', () => {
		it('returns true for admin with enabled account', () => {
			const admin = createContributor({ role: 'admin' });
			expect(canUseAnalysis(admin)).toBe(true);
		});

		it('returns true for slartibartfast with enabled account', () => {
			const slarti = createContributor({ role: 'slartibartfast' });
			expect(canUseAnalysis(slarti)).toBe(true);
		});
	});

	describe('monthly credits', () => {
		it('returns true when monthly credits available', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 5,
				analysis_count_reset_at: '2024-02-01T12:00:00'
			});
			expect(canUseAnalysis(contributor)).toBe(true);
		});

		it('returns true when monthly credits need reset', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 10,
				analysis_count_reset_at: '2024-01-01T12:00:00' // Previous month - needs reset
			});
			expect(canUseAnalysis(contributor)).toBe(true);
		});
	});

	describe('purchased credits fallback', () => {
		it('returns true when monthly exhausted but purchased available', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 10,
				analysis_count_reset_at: '2024-02-01T12:00:00', // Current month - no reset
				purchased_credits_total: 50,
				purchased_credits_used: 25
			});
			expect(canUseAnalysis(contributor)).toBe(true);
		});

		it('returns false when both monthly and purchased exhausted', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 10,
				analysis_count_reset_at: '2024-02-01T12:00:00',
				purchased_credits_total: 50,
				purchased_credits_used: 50
			});
			expect(canUseAnalysis(contributor)).toBe(false);
		});
	});
});

describe('willUsePurchasedCredit', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-02-15T12:00:00'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('admin access', () => {
		it('returns false for admin (unlimited access)', () => {
			const admin = createContributor({ role: 'admin' });
			expect(willUsePurchasedCredit(admin)).toBe(false);
		});

		it('returns false for slartibartfast (unlimited access)', () => {
			const slarti = createContributor({ role: 'slartibartfast' });
			expect(willUsePurchasedCredit(slarti)).toBe(false);
		});
	});

	describe('monthly credits available', () => {
		it('returns false when monthly credits available', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 5,
				analysis_count_reset_at: '2024-02-01T12:00:00'
			});
			expect(willUsePurchasedCredit(contributor)).toBe(false);
		});
	});

	describe('purchased credits will be used', () => {
		it('returns true when monthly exhausted and purchased available', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 10,
				analysis_count_reset_at: '2024-02-01T12:00:00',
				purchased_credits_total: 50,
				purchased_credits_used: 25
			});
			expect(willUsePurchasedCredit(contributor)).toBe(true);
		});

		it('returns false when both exhausted', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 10,
				analysis_count_reset_at: '2024-02-01T12:00:00',
				purchased_credits_total: 50,
				purchased_credits_used: 50
			});
			expect(willUsePurchasedCredit(contributor)).toBe(false);
		});

		it('returns false when no purchased credits exist', () => {
			const contributor = createContributor({
				analysis_limit: 10,
				analysis_count_used: 10,
				analysis_count_reset_at: '2024-02-01T12:00:00',
				purchased_credits_total: 0,
				purchased_credits_used: 0
			});
			expect(willUsePurchasedCredit(contributor)).toBe(false);
		});
	});
});
