/**
 * GraphQL queries and mutations for analysis session management
 * Used for reconnection/resume functionality in multi-pass analysis
 */

import { gql } from '@apollo/client/core';

/**
 * Insert a new analysis session
 */
export const INSERT_ANALYSIS_SESSION = gql`
	mutation InsertAnalysisSession(
		$showcase_item_id: uuid!
		$status: String!
		$current_pass: Int!
		$content_hash: String
	) {
		insert_analysis_session_one(
			object: {
				showcase_item_id: $showcase_item_id
				status: $status
				current_pass: $current_pass
				content_hash: $content_hash
			}
		) {
			id
			showcase_item_id
			status
			current_pass
			content_hash
			started_at
		}
	}
`;

/**
 * Update an existing analysis session
 */
export const UPDATE_ANALYSIS_SESSION = gql`
	mutation UpdateAnalysisSession(
		$id: uuid!
		$status: String
		$current_pass: Int
		$extracted_claims: jsonb
		$total_claims: Int
		$claims_completed: Int
		$claims_failed: Int
		$last_batch_index: Int
		$completed_at: timestamptz
		$error_message: String
		$error_phase: String
	) {
		update_analysis_session_by_pk(
			pk_columns: { id: $id }
			_set: {
				status: $status
				current_pass: $current_pass
				extracted_claims: $extracted_claims
				total_claims: $total_claims
				claims_completed: $claims_completed
				claims_failed: $claims_failed
				last_batch_index: $last_batch_index
				completed_at: $completed_at
				error_message: $error_message
				error_phase: $error_phase
			}
		) {
			id
			status
			current_pass
			claims_completed
			claims_failed
			updated_at
		}
	}
`;

/**
 * Get the most recent analysis session for a showcase item
 */
export const GET_ANALYSIS_SESSION = gql`
	query GetAnalysisSession($showcaseItemId: uuid!) {
		analysis_session(
			where: { showcase_item_id: { _eq: $showcaseItemId } }
			order_by: { started_at: desc }
			limit: 1
		) {
			id
			showcase_item_id
			status
			current_pass
			extracted_claims
			total_claims
			claims_completed
			claims_failed
			last_batch_index
			content_hash
			started_at
			updated_at
			completed_at
			error_message
			error_phase
		}
	}
`;

/**
 * Mark a session as abandoned (useful for cleanup)
 */
export const ABANDON_ANALYSIS_SESSION = gql`
	mutation AbandonAnalysisSession($id: uuid!) {
		update_analysis_session_by_pk(pk_columns: { id: $id }, _set: { status: "abandoned" }) {
			id
			status
		}
	}
`;

/**
 * Delete old abandoned or failed sessions (for cleanup jobs)
 */
export const DELETE_OLD_SESSIONS = gql`
	mutation DeleteOldSessions($olderThan: timestamptz!) {
		delete_analysis_session(
			where: {
				_and: [{ status: { _in: ["abandoned", "failed"] } }, { updated_at: { _lt: $olderThan } }]
			}
		) {
			affected_rows
		}
	}
`;
