import { gql } from '@apollo/client/core';
import {
	CONTRIBUTOR_FIELDS,
	POST_FIELDS,
	DISCUSSION_VERSION_FIELDS
} from '../fragments';

// ============================================
// Discussion Queries
// ============================================

export const GET_DISCUSSION_DETAILS = gql`
	query GetDiscussionDetails($discussionId: uuid!) {
		discussion_by_pk(id: $discussionId) {
			id
			created_at
			is_anonymous
			status
			contributor {
				...ContributorFields
			}
			current_version: discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				id
				title
				description
				audio_url
				good_faith_score
				good_faith_label
				good_faith_last_evaluated
				good_faith_analysis
				import_source
				import_url
				import_content
				import_author
				import_date
			}
			draft_version: discussion_versions(
				where: { version_type: { _eq: "draft" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				id
				title
				description
				good_faith_score
				good_faith_label
				good_faith_last_evaluated
				good_faith_analysis
			}
			posts(where: { status: { _eq: "approved" } }, order_by: { created_at: asc }) {
				...PostFields
			}
		}
	}
	${CONTRIBUTOR_FIELDS}
	${POST_FIELDS}
`;

export const GET_DISCUSSION_WITH_CURRENT_VERSION = gql`
	query GetDiscussionWithCurrentVersion($discussionId: uuid!) {
		discussion_by_pk(id: $discussionId) {
			id
			status
			created_by
			created_at
			is_anonymous
			contributor {
				...ContributorFields
			}
			current_version: discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				...DiscussionVersionFields
			}
			posts(where: { status: { _eq: "approved" } }, order_by: { created_at: asc }) {
				...PostFields
			}
		}
	}
	${CONTRIBUTOR_FIELDS}
	${POST_FIELDS}
	${DISCUSSION_VERSION_FIELDS}
`;

export const GET_DISCUSSION_DRAFT_VERSION = gql`
	query GetDiscussionDraftVersion($discussionId: uuid!) {
		discussion_by_pk(id: $discussionId) {
			id
			status
			created_by
			draft_version: discussion_versions(
				where: { version_type: { _eq: "draft" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				...DiscussionVersionFields
			}
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

export const LIST_PUBLISHED_DISCUSSIONS = gql`
	query ListPublishedDiscussions($limit: Int = 20, $offset: Int = 0) {
		discussion(
			where: { status: { _eq: "published" } }
			order_by: { created_at: desc }
			limit: $limit
			offset: $offset
		) {
			id
			status
			created_at
			is_anonymous
			contributor {
				...ContributorFields
			}
			current_version: discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				...DiscussionVersionFields
			}
		}
	}
	${CONTRIBUTOR_FIELDS}
	${DISCUSSION_VERSION_FIELDS}
`;

export const LIST_DISCUSSIONS_FROM_FOLLOWING = gql`
	query ListDiscussionsFromFollowing($authorIds: [uuid!]!, $limit: Int = 20, $offset: Int = 0) {
		discussion(
			where: { status: { _eq: "published" }, created_by: { _in: $authorIds } }
			order_by: { created_at: desc }
			limit: $limit
			offset: $offset
		) {
			id
			status
			created_at
			is_anonymous
			contributor {
				...ContributorFields
			}
			current_version: discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				...DiscussionVersionFields
			}
		}
	}
	${CONTRIBUTOR_FIELDS}
	${DISCUSSION_VERSION_FIELDS}
`;

export const SEARCH_PUBLISHED_DISCUSSIONS = gql`
	query SearchPublishedDiscussions($searchTerm: String!, $limit: Int = 20) {
		discussion(
			where: {
				status: { _eq: "published" }
				discussion_versions: {
					version_type: { _eq: "published" }
					_or: [{ title: { _ilike: $searchTerm } }, { description: { _ilike: $searchTerm } }]
				}
			}
			order_by: { created_at: desc }
			limit: $limit
		) {
			id
			status
			created_at
			is_anonymous
			contributor {
				...ContributorFields
			}
			current_version: discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				...DiscussionVersionFields
			}
		}
	}
	${CONTRIBUTOR_FIELDS}
	${DISCUSSION_VERSION_FIELDS}
`;

export const SEARCH_DISCUSSIONS_BY_TAGS = gql`
	query SearchDiscussionsByTags($tags: [String!]!, $limit: Int = 20) {
		discussion(
			where: {
				status: { _eq: "published" }
				discussion_versions: { version_type: { _eq: "published" }, tags: { _overlap: $tags } }
			}
			order_by: { created_at: desc }
			limit: $limit
		) {
			id
			status
			created_at
			is_anonymous
			contributor {
				...ContributorFields
			}
			current_version: discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				...DiscussionVersionFields
			}
		}
	}
	${CONTRIBUTOR_FIELDS}
	${DISCUSSION_VERSION_FIELDS}
`;

export const GET_DISCUSSION_TAGS = gql`
	query GetDiscussionTags {
		discussion_version(where: { version_type: { _eq: "published" } }, distinct_on: [tags]) {
			tags
		}
	}
`;

export const GET_ALL_TAGS = gql`
	query GetAllTags {
		discussion_version(
			where: { version_type: { _eq: "published" }, tags: { _is_null: false } }
			distinct_on: []
		) {
			tags
		}
	}
`;

export const ADVANCED_SEARCH_DISCUSSIONS = gql`
	query AdvancedSearchDiscussions(
		$searchTerm: String
		$tags: [String!]
		$minGoodFaithScore: numeric
		$limit: Int = 20
		$offset: Int = 0
	) {
		discussion(
			where: {
				status: { _eq: "published" }
				discussion_versions: {
					version_type: { _eq: "published" }
					_and: [
						{ _or: [{ title: { _ilike: $searchTerm } }, { description: { _ilike: $searchTerm } }] }
						{ tags: { _overlap: $tags } }
						{ good_faith_score: { _gte: $minGoodFaithScore } }
					]
				}
			}
			order_by: [
				{ discussion_versions_aggregate: { max: { good_faith_score: desc } } }
				{ created_at: desc }
			]
			limit: $limit
			offset: $offset
		) {
			id
			status
			created_at
			is_anonymous
			contributor {
				...ContributorFields
			}
			current_version: discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				...DiscussionVersionFields
			}
		}
	}
	${CONTRIBUTOR_FIELDS}
	${DISCUSSION_VERSION_FIELDS}
`;

export const GET_DISCUSSION_POSTS_THREADED = gql`
	query GetDiscussionPostsThreaded($discussionId: uuid!) {
		posts(
			where: {
				discussion_id: { _eq: $discussionId }
				status: { _eq: "approved" }
				parent_post_id: { _is_null: true }
			}
			order_by: [{ post_type: asc }, { created_at: asc }]
		) {
			...PostFields
			replies: posts_by_parent_post_id(
				where: { status: { _eq: "approved" } }
				order_by: { created_at: asc }
			) {
				...PostFields
			}
		}
	}
	${POST_FIELDS}
`;

export const GET_DISCUSSION_POSTS_BY_TYPE = gql`
	query GetDiscussionPostsByType($discussionId: uuid!, $postType: post_type_enum!) {
		posts(
			where: {
				discussion_id: { _eq: $discussionId }
				status: { _eq: "approved" }
				post_type: { _eq: $postType }
			}
			order_by: { created_at: asc }
		) {
			...PostFields
		}
	}
	${POST_FIELDS}
`;

export const CHECK_DISCUSSION_DELETABLE = gql`
	query CheckDiscussionDeletable(
		$discussionId: uuid!
		$createdBy: uuid!
		$discussionIdString: String!
	) {
		otherUserPosts: post(
			where: {
				discussion_id: { _eq: $discussionId }
				author_id: { _neq: $createdBy }
				status: { _in: ["approved", "pending"] }
			}
		) {
			id
		}
		referencingPosts: post(
			where: {
				author_id: { _neq: $createdBy }
				status: { _in: ["approved", "pending"] }
				_or: [
					{ content: { _ilike: $discussionIdString } }
					{ style_metadata: { _contains: { citations: [{ id: $discussionIdString }] } } }
					{ style_metadata: { _contains: { sources: [{ id: $discussionIdString }] } } }
				]
			}
		) {
			id
		}
	}
`;

// ============================================
// Discussion Mutations
// ============================================

export const CREATE_DISCUSSION_WITH_VERSION = gql`
	mutation CreateDiscussionWithVersion(
		$title: String!
		$description: String
		$tags: [String!] = []
		$sections: jsonb = []
		$claims: jsonb = []
		$citations: jsonb = []
		$createdBy: uuid!
		$importSource: String
		$importUrl: String
		$importContent: String
		$importAuthor: String
		$importDate: timestamptz
	) {
		insert_discussion_one(
			object: {
				created_by: $createdBy
				status: "draft"
				discussion_versions: {
					data: {
						title: $title
						description: $description
						tags: $tags
						sections: $sections
						claims: $claims
						citations: $citations
						version_number: 1
						version_type: "draft"
						created_by: $createdBy
						import_source: $importSource
						import_url: $importUrl
						import_content: $importContent
						import_author: $importAuthor
						import_date: $importDate
					}
				}
			}
		) {
			id
			status
			discussion_versions {
				...DiscussionVersionFields
			}
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

export const CREATE_DISCUSSION_VERSION = gql`
	mutation CreateDiscussionVersion(
		$discussionId: uuid!
		$title: String!
		$description: String
		$tags: [String!] = []
		$sections: jsonb = []
		$claims: jsonb = []
		$citations: jsonb = []
		$createdBy: uuid!
		$importSource: String
		$importUrl: String
		$importContent: String
		$importAuthor: String
		$importDate: timestamptz
	) {
		insert_discussion_version_one(
			object: {
				discussion_id: $discussionId
				title: $title
				description: $description
				tags: $tags
				sections: $sections
				claims: $claims
				citations: $citations
				version_type: "draft"
				created_by: $createdBy
				version_number: 1
				import_source: $importSource
				import_url: $importUrl
				import_content: $importContent
				import_author: $importAuthor
				import_date: $importDate
			}
		) {
			...DiscussionVersionFields
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

export const PUBLISH_DISCUSSION_VERSION = gql`
	mutation PublishDiscussionVersion($versionId: uuid!, $discussionId: uuid!) {
		update_discussion_version_by_pk(
			pk_columns: { id: $versionId }
			_set: { version_type: "published" }
		) {
			...DiscussionVersionFields
		}
		update_discussion_by_pk(
			pk_columns: { id: $discussionId }
			_set: { status: "published", current_version_id: $versionId }
		) {
			id
			status
			current_version_id
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

export const UPDATE_DISCUSSION_VERSION = gql`
	mutation UpdateDiscussionVersion(
		$versionId: uuid!
		$title: String
		$description: String
		$tags: [String!]
		$sections: jsonb
		$claims: jsonb
		$citations: jsonb
		$importSource: String
		$importUrl: String
		$importContent: String
		$importAuthor: String
		$importDate: timestamptz
	) {
		update_discussion_version_by_pk(
			pk_columns: { id: $versionId }
			_set: {
				title: $title
				description: $description
				tags: $tags
				sections: $sections
				claims: $claims
				citations: $citations
				import_source: $importSource
				import_url: $importUrl
				import_content: $importContent
				import_author: $importAuthor
				import_date: $importDate
			}
		) {
			...DiscussionVersionFields
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

export const UPDATE_DISCUSSION_VERSION_GOOD_FAITH = gql`
	mutation UpdateDiscussionVersionGoodFaith(
		$versionId: uuid!
		$score: numeric!
		$label: String!
		$analysis: jsonb
	) {
		update_discussion_version_by_pk(
			pk_columns: { id: $versionId }
			_set: {
				good_faith_score: $score
				good_faith_label: $label
				good_faith_last_evaluated: "now()"
				good_faith_analysis: $analysis
			}
		) {
			...DiscussionVersionFields
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

export const UPDATE_DISCUSSION_VERSION_AUDIO = gql`
	mutation UpdateDiscussionVersionAudio($versionId: uuid!, $audioUrl: String) {
		update_discussion_version_by_pk(
			pk_columns: { id: $versionId }
			_set: { audio_url: $audioUrl }
		) {
			...DiscussionVersionFields
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

export const DELETE_DISCUSSION = gql`
	mutation DeleteDiscussion($discussionId: uuid!, $createdBy: uuid!) {
		delete_post(where: { discussion_id: { _eq: $discussionId }, author_id: { _eq: $createdBy } }) {
			affected_rows
		}
		delete_discussion_by_pk(id: $discussionId) {
			id
		}
	}
`;

export const ANONYMIZE_DISCUSSION = gql`
	mutation AnonymizeDiscussion($discussionId: uuid!) {
		update_discussion_by_pk(pk_columns: { id: $discussionId }, _set: { is_anonymous: true }) {
			id
			is_anonymous
		}
	}
`;

export const UNANONYMIZE_DISCUSSION = gql`
	mutation UnanonymizeDiscussion($discussionId: uuid!) {
		update_discussion_by_pk(pk_columns: { id: $discussionId }, _set: { is_anonymous: false }) {
			id
			is_anonymous
		}
	}
`;
