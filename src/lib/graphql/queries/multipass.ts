/**
 * GraphQL queries and mutations for multi-pass analysis
 */

import { gql } from '@apollo/client/core';

/**
 * Fragment for claim analysis fields
 */
export const CLAIM_ANALYSIS_FIELDS = gql`
	fragment ClaimAnalysisFields on claim_analysis {
		id
		claim_index
		claim_text
		claim_type
		complexity_level
		complexity_confidence
		is_explicit
		depends_on
		analysis
		model_used
		status
		error_message
		input_tokens
		output_tokens
		created_at
		updated_at
	}
`;

/**
 * Insert multiple claim analyses
 */
export const INSERT_CLAIM_ANALYSES = gql`
	mutation InsertClaimAnalyses($objects: [claim_analysis_insert_input!]!) {
		insert_claim_analysis(objects: $objects) {
			affected_rows
			returning {
				...ClaimAnalysisFields
			}
		}
	}
	${CLAIM_ANALYSIS_FIELDS}
`;

/**
 * Update a single claim analysis (for retries)
 */
export const UPDATE_CLAIM_ANALYSIS = gql`
	mutation UpdateClaimAnalysis(
		$id: uuid!
		$analysis: jsonb
		$status: String!
		$error_message: String
		$input_tokens: Int
		$output_tokens: Int
	) {
		update_claim_analysis_by_pk(
			pk_columns: { id: $id }
			_set: {
				analysis: $analysis
				status: $status
				error_message: $error_message
				input_tokens: $input_tokens
				output_tokens: $output_tokens
			}
		) {
			...ClaimAnalysisFields
		}
	}
	${CLAIM_ANALYSIS_FIELDS}
`;

/**
 * Get claim analyses for a post
 */
export const GET_CLAIM_ANALYSES_BY_POST = gql`
	query GetClaimAnalysesByPost($postId: uuid!) {
		claim_analysis(where: { post_id: { _eq: $postId } }, order_by: { claim_index: asc }) {
			...ClaimAnalysisFields
		}
	}
	${CLAIM_ANALYSIS_FIELDS}
`;

/**
 * Get claim analyses for a discussion version
 */
export const GET_CLAIM_ANALYSES_BY_DISCUSSION_VERSION = gql`
	query GetClaimAnalysesByDiscussionVersion($versionId: uuid!) {
		claim_analysis(
			where: { discussion_version_id: { _eq: $versionId } }
			order_by: { claim_index: asc }
		) {
			...ClaimAnalysisFields
		}
	}
	${CLAIM_ANALYSIS_FIELDS}
`;

/**
 * Get failed claim analyses for retry
 */
export const GET_FAILED_CLAIM_ANALYSES = gql`
	query GetFailedClaimAnalyses($postId: uuid!) {
		claim_analysis(
			where: { post_id: { _eq: $postId }, status: { _eq: "failed" } }
			order_by: { claim_index: asc }
		) {
			...ClaimAnalysisFields
		}
	}
	${CLAIM_ANALYSIS_FIELDS}
`;

/**
 * Delete claim analyses for a post (for re-analysis)
 */
export const DELETE_CLAIM_ANALYSES_BY_POST = gql`
	mutation DeleteClaimAnalysesByPost($postId: uuid!) {
		delete_claim_analysis(where: { post_id: { _eq: $postId } }) {
			affected_rows
		}
	}
`;

/**
 * Update post with multi-pass metadata
 */
export const UPDATE_POST_MULTIPASS_META = gql`
	mutation UpdatePostMultiPassMeta(
		$postId: uuid!
		$strategy: String!
		$passCount: Int!
		$claimsTotal: Int
		$claimsAnalyzed: Int
		$claimsFailed: Int
	) {
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: {
				analysis_strategy: $strategy
				analysis_pass_count: $passCount
				claims_total: $claimsTotal
				claims_analyzed: $claimsAnalyzed
				claims_failed: $claimsFailed
			}
		) {
			id
			analysis_strategy
			analysis_pass_count
			claims_total
			claims_analyzed
			claims_failed
		}
	}
`;

/**
 * Update discussion version with multi-pass metadata
 */
export const UPDATE_DISCUSSION_VERSION_MULTIPASS_META = gql`
	mutation UpdateDiscussionVersionMultiPassMeta(
		$versionId: uuid!
		$strategy: String!
		$passCount: Int!
		$claimsTotal: Int
		$claimsAnalyzed: Int
		$claimsFailed: Int
	) {
		update_discussion_version_by_pk(
			pk_columns: { id: $versionId }
			_set: {
				analysis_strategy: $strategy
				analysis_pass_count: $passCount
				claims_total: $claimsTotal
				claims_analyzed: $claimsAnalyzed
				claims_failed: $claimsFailed
			}
		) {
			id
			analysis_strategy
			analysis_pass_count
			claims_total
			claims_analyzed
			claims_failed
		}
	}
`;

/**
 * Get multi-pass analysis summary for a post
 */
export const GET_POST_MULTIPASS_SUMMARY = gql`
	query GetPostMultiPassSummary($postId: uuid!) {
		post_by_pk(id: $postId) {
			id
			analysis_strategy
			analysis_pass_count
			claims_total
			claims_analyzed
			claims_failed
			good_faith_score
			good_faith_label
			good_faith_analysis
		}
		claim_analysis_aggregate(where: { post_id: { _eq: $postId } }) {
			aggregate {
				count
				avg {
					complexity_confidence
				}
			}
			nodes {
				status
			}
		}
	}
`;
