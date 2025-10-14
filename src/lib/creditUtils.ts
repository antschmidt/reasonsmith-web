import { print } from 'graphql';
import { RESET_ANALYSIS_USAGE } from '$lib/graphql/queries';
import { hasAdminAccess, type UserRole } from '$lib/permissions';
import { logger } from '$lib/logger';

/**
 * Checks if a contributor's monthly credits need to be reset.
 * Monthly credits reset at the beginning of each month.
 */
export function shouldResetMonthlyCredits(lastResetDate: string | null): boolean {
	if (!lastResetDate) {
		return true; // Never reset before
	}

	const lastReset = new Date(lastResetDate);
	const now = new Date();

	// Check if we're in a different month than the last reset
	return now.getFullYear() !== lastReset.getFullYear() || now.getMonth() !== lastReset.getMonth();
}

/**
 * Resets a contributor's monthly analysis usage count.
 * This should be called when shouldResetMonthlyCredits returns true.
 */
export async function resetMonthlyCredits(
	contributorId: string,
	graphqlEndpoint: string,
	accessToken?: string,
	adminSecret?: string
): Promise<boolean> {
	try {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		// Use admin secret if available, otherwise use user access token
		if (adminSecret) {
			headers['x-hasura-admin-secret'] = adminSecret;
			// Admin secret provides full access - no role header needed
		} else if (accessToken) {
			headers['Authorization'] = `Bearer ${accessToken}`;
		} else {
			logger.error('No authentication method provided for reset');
			return false;
		}

		const response = await fetch(graphqlEndpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				query: print(RESET_ANALYSIS_USAGE),
				variables: { contributorId }
			})
		});

		const result = await response.json();

		if (result.errors) {
			logger.error('Failed to reset monthly credits:', result.errors);
			return false;
		}

		logger.info(`Monthly credits reset for contributor ${contributorId}`);
		return true;
	} catch (error) {
		logger.error('Error resetting monthly credits:', error);
		return false;
	}
}

/**
 * Checks and resets monthly credits if needed for a contributor.
 * This is the main function to call from other parts of the application.
 */
export async function checkAndResetMonthlyCredits(
	contributor: {
		id: string;
		analysis_count_reset_at: string | null;
	},
	graphqlEndpoint: string,
	accessToken?: string,
	adminSecret?: string
): Promise<boolean> {
	if (shouldResetMonthlyCredits(contributor.analysis_count_reset_at)) {
		return await resetMonthlyCredits(contributor.id, graphqlEndpoint, accessToken, adminSecret);
	}
	return false; // No reset was needed
}

/**
 * Gets the current monthly credits remaining for a contributor.
 * Takes into account whether a reset is needed.
 */
export function getMonthlyCreditsRemaining(contributor: {
	id?: string;
	analysis_limit?: number | null;
	monthly_credits_remaining?: number | null;
	analysis_count_used?: number;
	analysis_count_reset_at?: string | null;
	monthly_credits_reset_at?: string | null;
	role?: UserRole;
}): number {
	// Check for unlimited access
	if (hasAdminAccess(contributor)) {
		return Infinity;
	}

	if (contributor.analysis_limit === null) {
		return Infinity; // Unlimited
	}

	// Use the new monthly_credits_remaining field if available
	if (typeof contributor.monthly_credits_remaining === 'number') {
		return Math.max(0, contributor.monthly_credits_remaining);
	}

	// Fallback to old calculation for backward compatibility
	if (typeof contributor.analysis_limit === 'number') {
		// If a reset is needed, they have their full limit available
		if (
			shouldResetMonthlyCredits(
				contributor.analysis_count_reset_at || contributor.monthly_credits_reset_at || null
			)
		) {
			return contributor.analysis_limit;
		}

		// Otherwise, calculate remaining from current usage
		return Math.max(0, contributor.analysis_limit - (contributor.analysis_count_used || 0));
	}

	return 0;
}

/**
 * Gets the purchased credits remaining for a contributor.
 */
export function getPurchasedCreditsRemaining(contributor: {
	purchased_credits_remaining?: number | null;
	purchased_credits_total?: number;
	purchased_credits_used?: number;
}): number {
	// Use the new purchased_credits_remaining field if available
	if (typeof contributor.purchased_credits_remaining === 'number') {
		return Math.max(0, contributor.purchased_credits_remaining);
	}

	// Fallback to calculation for backward compatibility
	const total = contributor.purchased_credits_total ?? 0;
	const used = contributor.purchased_credits_used ?? 0;
	return Math.max(0, total - used);
}

/**
 * Checks if a contributor can use analysis, considering both monthly and purchased credits.
 * Also considers whether monthly credits need to be reset.
 */
export function canUseAnalysis(contributor: {
	id?: string;
	analysis_enabled: boolean;
	role: UserRole;
	analysis_limit: number | null;
	analysis_count_used: number;
	analysis_count_reset_at: string | null;
	purchased_credits_total?: number;
	purchased_credits_used?: number;
}): boolean {
	if (!contributor.analysis_enabled) {
		return false;
	}

	// Admin and slartibartfast roles have unlimited access
	if (hasAdminAccess(contributor)) {
		return true;
	}

	// Check monthly credits first
	const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
	if (monthlyRemaining > 0) {
		return true;
	}

	// If no monthly credits, check purchased credits
	const purchasedRemaining = getPurchasedCreditsRemaining(contributor);
	return purchasedRemaining > 0;
}

/**
 * Determines whether the next analysis will use a purchased credit.
 * Returns true if monthly credits are exhausted and purchased credits will be used.
 */
export function willUsePurchasedCredit(contributor: {
	id?: string;
	role: UserRole;
	analysis_limit: number | null;
	analysis_count_used: number;
	analysis_count_reset_at: string | null;
	purchased_credits_total?: number;
	purchased_credits_used?: number;
}): boolean {
	// Admin and slartibartfast roles don't use any credits
	if (hasAdminAccess(contributor)) {
		return false;
	}

	// Check if monthly credits are available
	const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
	if (monthlyRemaining > 0) {
		return false; // Will use monthly credit
	}

	// Monthly credits exhausted, check if purchased credits are available
	const purchasedRemaining = getPurchasedCreditsRemaining(contributor);
	return purchasedRemaining > 0;
}
