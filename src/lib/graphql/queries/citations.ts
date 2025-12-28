import { gql } from '@apollo/client/core';
import { CITATION_FIELDS } from '../fragments';

// ============================================
// Citation Queries
// ============================================

export const GET_DISCUSSION_CITATIONS = gql`
	query GetDiscussionCitations($discussion_version_id: uuid!) {
		discussion_version_citation(
			where: { discussion_version_id: { _eq: $discussion_version_id } }
			order_by: { citation_order: asc }
		) {
			id
			citation_order
			custom_point_supported
			custom_relevant_quote
			citation {
				...CitationFields
			}
		}
	}
	${CITATION_FIELDS}
`;

// ============================================
// Citation Mutations
// ============================================

export const CREATE_CITATION = gql`
	mutation CreateCitation(
		$id: uuid!
		$title: String!
		$url: String!
		$author: String
		$publisher: String
		$publish_date: date
		$accessed_date: date
		$page_number: String
		$point_supported: String!
		$relevant_quote: String!
		$created_by: uuid!
	) {
		insert_citation_one(
			object: {
				id: $id
				title: $title
				url: $url
				author: $author
				publisher: $publisher
				publish_date: $publish_date
				accessed_date: $accessed_date
				page_number: $page_number
				point_supported: $point_supported
				relevant_quote: $relevant_quote
				created_by: $created_by
			}
		) {
			...CitationFields
		}
	}
	${CITATION_FIELDS}
`;

export const UPDATE_CITATION = gql`
	mutation UpdateCitation(
		$id: uuid!
		$title: String!
		$url: String!
		$author: String
		$publisher: String
		$publish_date: date
		$accessed_date: date
		$page_number: String
		$point_supported: String!
		$relevant_quote: String!
	) {
		update_citation_by_pk(
			pk_columns: { id: $id }
			_set: {
				title: $title
				url: $url
				author: $author
				publisher: $publisher
				publish_date: $publish_date
				accessed_date: $accessed_date
				page_number: $page_number
				point_supported: $point_supported
				relevant_quote: $relevant_quote
			}
		) {
			...CitationFields
		}
	}
	${CITATION_FIELDS}
`;

export const LINK_CITATION_TO_DISCUSSION = gql`
	mutation LinkCitationToDiscussion(
		$discussion_version_id: uuid!
		$citation_id: uuid!
		$citation_order: Int!
		$custom_point_supported: String
		$custom_relevant_quote: String
	) {
		insert_discussion_version_citation_one(
			object: {
				discussion_version_id: $discussion_version_id
				citation_id: $citation_id
				citation_order: $citation_order
				custom_point_supported: $custom_point_supported
				custom_relevant_quote: $custom_relevant_quote
			}
		) {
			id
			citation_order
			custom_point_supported
			custom_relevant_quote
			citation {
				...CitationFields
			}
		}
	}
	${CITATION_FIELDS}
`;

export const UPDATE_DISCUSSION_VERSION_CITATION = gql`
	mutation UpdateDiscussionVersionCitation(
		$discussion_version_id: uuid!
		$citation_id: uuid!
		$custom_point_supported: String
		$custom_relevant_quote: String
	) {
		update_discussion_version_citation(
			where: {
				discussion_version_id: { _eq: $discussion_version_id }
				citation_id: { _eq: $citation_id }
			}
			_set: {
				custom_point_supported: $custom_point_supported
				custom_relevant_quote: $custom_relevant_quote
			}
		) {
			affected_rows
		}
	}
`;

export const REMOVE_CITATION_FROM_DISCUSSION = gql`
	mutation RemoveCitationFromDiscussion($discussion_version_id: uuid!, $citation_id: uuid!) {
		delete_discussion_version_citation(
			where: {
				discussion_version_id: { _eq: $discussion_version_id }
				citation_id: { _eq: $citation_id }
			}
		) {
			affected_rows
		}
	}
`;

// Re-export CITATION_FIELDS for backward compatibility
export { CITATION_FIELDS };
