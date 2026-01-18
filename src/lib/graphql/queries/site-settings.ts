import { gql } from '@apollo/client/core';

// ============================================
// Site Settings Queries & Mutations
// ============================================

/**
 * Get a specific site setting by key
 */
export const GET_SITE_SETTING = gql`
	query GetSiteSetting($key: String!) {
		site_settings_by_pk(key: $key) {
			key
			value
			description
			updated_at
			updated_by
		}
	}
`;

/**
 * Get all site settings (admin only)
 */
export const GET_ALL_SITE_SETTINGS = gql`
	query GetAllSiteSettings {
		site_settings(order_by: { key: asc }) {
			key
			value
			description
			updated_at
			updated_by
		}
	}
`;

/**
 * Update a site setting
 */
export const UPDATE_SITE_SETTING = gql`
	mutation UpdateSiteSetting($key: String!, $value: jsonb!, $updatedBy: uuid) {
		update_site_settings_by_pk(
			pk_columns: { key: $key }
			_set: { value: $value, updated_by: $updatedBy }
		) {
			key
			value
			description
			updated_at
			updated_by
		}
	}
`;

// Type definitions for site settings
export type PromptCacheTTL = 'off' | '5m' | '1h';

export interface SiteSetting {
	key: string;
	value: unknown;
	description: string | null;
	updated_at: string;
	updated_by: string | null;
}
