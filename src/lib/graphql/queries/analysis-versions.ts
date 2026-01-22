import { gql } from '@apollo/client/core';

// ============================================
// Analysis Version Queries
// ============================================

/**
 * Get all analysis versions for a showcase item (admin view)
 */
export const GET_ANALYSIS_VERSIONS = gql`
	query GetAnalysisVersions($showcaseItemId: uuid!) {
		showcase_analysis_version(
			where: { showcase_item_id: { _eq: $showcaseItemId } }
			order_by: { version_number: desc }
		) {
			id
			version_number
			is_active
			analysis
			summary
			analysis_strategy
			claims_total
			claims_analyzed
			claims_failed
			model_used
			input_tokens
			output_tokens
			estimated_cost_cents
			created_at
		}
	}
`;

/**
 * Get the active analysis version for a showcase item
 */
export const GET_ACTIVE_ANALYSIS_VERSION = gql`
	query GetActiveAnalysisVersion($showcaseItemId: uuid!) {
		showcase_analysis_version(
			where: { showcase_item_id: { _eq: $showcaseItemId }, is_active: { _eq: true } }
			limit: 1
		) {
			id
			version_number
			analysis
			summary
			analysis_strategy
			claims_total
			claims_analyzed
			claims_failed
			created_at
		}
	}
`;

/**
 * Get version count for a showcase item (to check if at max)
 */
export const GET_ANALYSIS_VERSION_COUNT = gql`
	query GetAnalysisVersionCount($showcaseItemId: uuid!) {
		showcase_analysis_version_aggregate(where: { showcase_item_id: { _eq: $showcaseItemId } }) {
			aggregate {
				count
			}
		}
	}
`;

// ============================================
// Analysis Version Mutations
// ============================================

/**
 * Create a new analysis version
 */
export const CREATE_ANALYSIS_VERSION = gql`
	mutation CreateAnalysisVersion($input: showcase_analysis_version_insert_input!) {
		insert_showcase_analysis_version_one(object: $input) {
			id
			version_number
			is_active
			created_at
		}
	}
`;

/**
 * Set a version as active (will auto-deactivate others via trigger)
 */
export const SET_ACTIVE_ANALYSIS_VERSION = gql`
	mutation SetActiveAnalysisVersion($id: uuid!) {
		update_showcase_analysis_version_by_pk(pk_columns: { id: $id }, _set: { is_active: true }) {
			id
			version_number
			is_active
		}
	}
`;

/**
 * Delete an analysis version
 */
export const DELETE_ANALYSIS_VERSION = gql`
	mutation DeleteAnalysisVersion($id: uuid!) {
		delete_showcase_analysis_version_by_pk(id: $id) {
			id
			version_number
		}
	}
`;

/**
 * Get next version number for a showcase item
 * Note: This uses a raw SQL function, but we can also calculate client-side
 */
export const GET_NEXT_VERSION_NUMBER = gql`
	query GetNextVersionNumber($showcaseItemId: uuid!) {
		showcase_analysis_version(
			where: { showcase_item_id: { _eq: $showcaseItemId } }
			order_by: { version_number: desc }
			limit: 1
		) {
			version_number
		}
	}
`;
