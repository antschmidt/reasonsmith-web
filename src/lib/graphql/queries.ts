import { gql } from '@apollo/client/core';

// Fragments to reuse common field selections
const CONTRIBUTOR_FIELDS = gql`
	fragment ContributorFields on contributor {
		id
		handle
		display_name
		email
		role
		analysis_enabled
		analysis_limit
		analysis_count_used
		analysis_count_reset_at
		monthly_credits_remaining
		monthly_credits_reset_at
		purchased_credits_total
		purchased_credits_used
		purchased_credits_remaining
		subscription_tier
		avatar_url
		account_disabled
	}
`;

const POST_FIELDS = gql`
	fragment PostFields on post {
		id
		content
		status
		created_at
		is_anonymous
		post_type
		parent_post_id
		good_faith_score
		good_faith_label
		good_faith_last_evaluated
		good_faith_analysis
		writing_style
		style_metadata
		style_word_count
		style_requirements_met
		contributor {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Query for the main dashboard view
export const GET_DASHBOARD_DATA = gql`
	query GetDashboardData($userId: uuid!) {
		# Discussions created by the user
		myDiscussions: discussion(
			where: { created_by: { _eq: $userId } }
			order_by: { created_at: desc }
			limit: 10
		) {
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
				title
				description
			}
			draft_version: discussion_versions(
				where: { version_type: { _eq: "draft" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				title
				description
			}
		}

		# Discussions the user has replied to (exclude those created by the user)
		repliedDiscussions: discussion(
			where: { created_by: { _neq: $userId }, posts: { author_id: { _eq: $userId } } }
			order_by: { created_at: desc }
			limit: 10
		) {
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
				title
				description
			}
		}

		# Get discussion drafts (versions) instead of post drafts
		myDiscussionDrafts: discussion_version(
			where: { created_by: { _eq: $userId }, version_type: { _eq: "draft" } }
			order_by: { created_at: desc }
		) {
			id
			title
			description
			discussion_id
			created_at
			good_faith_score
			good_faith_label
			good_faith_last_evaluated
			discussion {
				id
				status
			}
		}

		# Get the current user's post drafts
		myPostDrafts: post(
			where: { author_id: { _eq: $userId }, status: { _in: ["draft", "pending"] } }
			order_by: { updated_at: desc }
		) {
			id
			draft_content
			discussion_id
			status
			updated_at
			good_faith_score
			good_faith_label
			good_faith_last_evaluated
			good_faith_analysis
			discussion {
				id
				discussion_versions(
					where: { version_type: { _eq: "published" } }
					order_by: { version_number: desc }
					limit: 1
				) {
					title
				}
			}
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Query to get the details of a single discussion and its approved posts
// This is now replaced by GET_DISCUSSION_WITH_CURRENT_VERSION but kept for backward compatibility
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
				good_faith_score
				good_faith_label
				good_faith_last_evaluated
				good_faith_analysis
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

// Discussion version fragments for the new versioning system
const DISCUSSION_VERSION_FIELDS = gql`
	fragment DiscussionVersionFields on discussion_version {
		id
		discussion_id
		title
		description
		tags
		sections
		claims
		citations
		version_number
		version_type
		good_faith_score
		good_faith_label
		good_faith_last_evaluated
		good_faith_analysis
		created_at
		created_by
	}
`;

// Create a new discussion with its initial version (as draft)
export const CREATE_DISCUSSION_WITH_VERSION = gql`
	mutation CreateDiscussionWithVersion(
		$title: String!
		$description: String
		$tags: [String!] = []
		$sections: jsonb = []
		$claims: jsonb = []
		$citations: jsonb = []
		$createdBy: uuid!
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

// Create a new version of an existing discussion (for edits)
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
				version_number: 1 # This will be calculated properly in the database trigger
			}
		) {
			...DiscussionVersionFields
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

// Publish a discussion version (mark as published and update discussion status)
export const PUBLISH_DISCUSSION_VERSION = gql`
	mutation PublishDiscussionVersion($versionId: uuid!, $discussionId: uuid!) {
		# Update the version to published
		update_discussion_version_by_pk(
			pk_columns: { id: $versionId }
			_set: { version_type: "published" }
		) {
			...DiscussionVersionFields
		}

		# Update the discussion status
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

// Update a draft version
export const UPDATE_DISCUSSION_VERSION = gql`
	mutation UpdateDiscussionVersion(
		$versionId: uuid!
		$title: String
		$description: String
		$tags: [String!]
		$sections: jsonb
		$claims: jsonb
		$citations: jsonb
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
			}
		) {
			...DiscussionVersionFields
		}
	}
	${DISCUSSION_VERSION_FIELDS}
`;

// Get discussion with its current published version
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

// Get discussion draft version for editing
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

// List published discussions with their current versions
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

// Search published discussions
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

// Search discussions by tags
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

// Get all unique tags for discovery
export const GET_DISCUSSION_TAGS = gql`
	query GetDiscussionTags {
		discussion_version(where: { version_type: { _eq: "published" } }, distinct_on: [tags]) {
			tags
		}
	}
`;

// Advanced search with full-text search and tag filtering
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

// Get threaded posts for a discussion
export const GET_DISCUSSION_POSTS_THREADED = gql`
	query GetDiscussionPostsThreaded($discussionId: uuid!) {
		# Get top-level posts (no parent)
		posts(
			where: {
				discussion_id: { _eq: $discussionId }
				status: { _eq: "approved" }
				parent_post_id: { _is_null: true }
			}
			order_by: [{ post_type: asc }, { created_at: asc }]
		) {
			...PostFields
			# Get replies to this post
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

// Get posts by type for a discussion
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

// Update good faith analysis for a discussion version
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

// Mutation to create a new post (as a draft) - fallback version for pre-migration compatibility
export const CREATE_POST_DRAFT = gql`
	mutation CreatePostDraft(
		$discussionId: uuid!
		$authorId: uuid!
		$draftContent: String!
		$contextVersionId: uuid
	) {
		insert_post_one(
			object: {
				discussion_id: $discussionId
				author_id: $authorId
				draft_content: $draftContent
				status: "draft"
				context_version_id: $contextVersionId
			}
		) {
			id
		}
	}
`;

// Mutation to create a new post (as a draft) - with writing style support (for post-migration)
export const CREATE_POST_DRAFT_WITH_STYLE = gql`
	mutation CreatePostDraftWithStyle(
		$discussionId: uuid!
		$authorId: uuid!
		$draftContent: String!
		$postType: post_type_enum = response
		$parentPostId: uuid
		$contextVersionId: uuid
		$writingStyle: writing_style_type = quick_point
		$styleMetadata: jsonb = {}
	) {
		insert_post_one(
			object: {
				discussion_id: $discussionId
				author_id: $authorId
				draft_content: $draftContent
				post_type: $postType
				parent_post_id: $parentPostId
				context_version_id: $contextVersionId
				status: "draft"
				writing_style: $writingStyle
				style_metadata: $styleMetadata
			}
		) {
			id
			post_type
			parent_post_id
			writing_style
			style_metadata
		}
	}
`;

// Mutation to publish a draft - fallback version for pre-migration compatibility
export const PUBLISH_POST = gql`
	mutation PublishPost($postId: uuid!) {
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { status: "pending", content: draft_content, draft_content: "" }
		) {
			id
			status
			content
			created_at
			good_faith_score
			good_faith_label
			good_faith_last_evaluated
			contributor {
				id
				display_name
				email
				role
			}
		}
	}
`;

// Mutation to publish a draft - with writing style support (for post-migration)
export const PUBLISH_POST_WITH_STYLE = gql`
	mutation PublishPostWithStyle(
		$postId: uuid!
		$writingStyle: writing_style_type_enum
		$styleMetadata: jsonb
		$wordCount: Int
	) {
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: {
				status: "pending"
				content: draft_content
				draft_content: ""
				writing_style: $writingStyle
				style_metadata: $styleMetadata
				style_word_count: $wordCount
				style_requirements_met: true
			}
		) {
			id
			status
			content
			writing_style
			style_metadata
			style_word_count
			style_requirements_met
			created_at
			good_faith_score
			good_faith_label
			good_faith_last_evaluated
			contributor {
				id
				display_name
				email
				role
			}
		}
	}
`;

// Mutation to update draft content (autosave) - fallback version for pre-migration compatibility
export const UPDATE_POST_DRAFT = gql`
	mutation UpdatePostDraft($postId: uuid!, $draftContent: String!) {
		update_post_by_pk(pk_columns: { id: $postId }, _set: { draft_content: $draftContent }) {
			id
		}
	}
`;

// Mutation to update draft content (autosave) - with writing style support (for post-migration)
export const UPDATE_POST_DRAFT_WITH_STYLE = gql`
	mutation UpdatePostDraftWithStyle(
		$postId: uuid!
		$draftContent: String!
		$writingStyle: writing_style_type_enum
		$styleMetadata: jsonb
	) {
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: {
				draft_content: $draftContent
				writing_style: $writingStyle
				style_metadata: $styleMetadata
			}
		) {
			id
			writing_style
			style_metadata
		}
	}
`;

// Mutation to update writing style and metadata
export const UPDATE_POST_STYLE = gql`
	mutation UpdatePostStyle(
		$postId: uuid!
		$writingStyle: writing_style_type_enum!
		$styleMetadata: jsonb!
		$wordCount: Int
		$requirementsMet: Boolean!
	) {
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: {
				writing_style: $writingStyle
				style_metadata: $styleMetadata
				style_word_count: $wordCount
				style_requirements_met: $requirementsMet
			}
		) {
			id
			writing_style
			style_metadata
			style_word_count
			style_requirements_met
		}
	}
`;

// Query to get real user statistics
export const GET_USER_STATS = gql`
	query GetUserStats($userId: uuid!) {
		# Get user's posts with good faith scores
		userPosts: post(
			where: { author_id: { _eq: $userId }, status: { _in: ["approved", "pending"] } }
		) {
			id
			good_faith_score
			good_faith_label
			created_at
			style_metadata
		}

		# Get user's discussions with good faith scores
		userDiscussions: discussion(where: { created_by: { _eq: $userId } }) {
			id
			created_at
			current_version: discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				title
				good_faith_score
				good_faith_label
			}
			draft_version: discussion_versions(
				where: { version_type: { _eq: "draft" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				title
				good_faith_score
				good_faith_label
			}
		}

		# Count total discussions created (using array length)
		allUserDiscussions: discussion(where: { created_by: { _eq: $userId } }) {
			id
		}

		# Count total posts/replies made (using array length)
		allUserPosts: post(
			where: { author_id: { _eq: $userId }, status: { _in: ["approved", "pending"] } }
		) {
			id
		}

		# Count discussions user has participated in (replied to) - using array length
		participatedDiscussionsList: discussion(
			where: {
				created_by: { _neq: $userId }
				posts: { author_id: { _eq: $userId }, status: { _in: ["approved", "pending"] } }
			}
		) {
			id
		}
	}
`;

/*
NOTE ON METRICS (Good-Faith Rate, Source Accuracy, Reputation Score):
Calculating these percentages and scores directly on the client is inefficient.
The best practice is to create database VIEWS or FUNCTIONS in Hasura/Nhost
that perform these aggregations on the server. You can then query these views
as if they were tables.

For example, a view `user_stats` could provide these metrics per user:

CREATE VIEW user_stats AS
SELECT
  u.id AS user_id,
  -- Good-Faith Rate
  COALESCE(SUM(CASE WHEN ml.is_good_faith THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(ml.id), 0), 0) AS good_faith_rate,
  -- Source Accuracy
  COALESCE(SUM(CASE WHEN ps.is_valid AND ps.is_relevant THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(ps.id), 0), 0) AS source_accuracy
FROM
  "user" u
LEFT JOIN post p ON u.id = p.author_id
LEFT JOIN moderation_log ml ON p.id = ml.post_id
LEFT JOIN post_source ps ON p.id = ps.post_id
GROUP BY
  u.id;

You could then query this view easily:
query GetUserStats($userId: uuid!) {
  user_stats_by_pk(user_id: $userId) {
    good_faith_rate
    source_accuracy
    # Reputation score would be another calculated column
  }
}
*/

// Query to check if a post can be deleted (no other users have replied to this discussion after this post)
export const CHECK_POST_DELETABLE = gql`
	query CheckPostDeletable(
		$authorId: uuid!
		$discussionId: uuid!
		$postCreatedAt: timestamptz!
		$postIdString: String!
	) {
		# Check if any other users have posted after this post in the same discussion
		laterPosts: post(
			where: {
				discussion_id: { _eq: $discussionId }
				author_id: { _neq: $authorId }
				created_at: { _gt: $postCreatedAt }
				status: { _in: ["approved", "pending"] }
			}
		) {
			id
		}

		# Check if this post has been referenced in other posts' content or citations
		# This would require checking style_metadata for citation references
		referencingPosts: post(
			where: {
				author_id: { _neq: $authorId }
				status: { _in: ["approved", "pending"] }
				_or: [
					{ content: { _ilike: $postIdString } }
					{ style_metadata: { _contains: { citations: [{ id: $postIdString }] } } }
					{ style_metadata: { _contains: { sources: [{ id: $postIdString }] } } }
				]
			}
		) {
			id
		}
	}
`;

// Mutation to delete a post (only if it passes safety checks)
export const DELETE_POST = gql`
	mutation DeletePost($postId: uuid!) {
		delete_post_by_pk(id: $postId) {
			id
		}
	}
`;

// Query to check if a discussion can be deleted (no posts from other users)
export const CHECK_DISCUSSION_DELETABLE = gql`
	query CheckDiscussionDeletable(
		$discussionId: uuid!
		$createdBy: uuid!
		$discussionIdString: String!
	) {
		# Check if any other users have posted in this discussion
		otherUserPosts: post(
			where: {
				discussion_id: { _eq: $discussionId }
				author_id: { _neq: $createdBy }
				status: { _in: ["approved", "pending"] }
			}
		) {
			id
		}

		# Check if this discussion has been referenced in other posts
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

// Mutation to delete a discussion and all its posts by the same user
export const DELETE_DISCUSSION = gql`
	mutation DeleteDiscussion($discussionId: uuid!, $createdBy: uuid!) {
		# First delete all posts by the same user in this discussion
		delete_post(where: { discussion_id: { _eq: $discussionId }, author_id: { _eq: $createdBy } }) {
			affected_rows
		}

		# Then delete the discussion itself
		delete_discussion_by_pk(id: $discussionId) {
			id
		}
	}
`;

// Mutation to update good faith analysis for a post
export const UPDATE_POST_GOOD_FAITH = gql`
	mutation UpdatePostGoodFaith(
		$postId: uuid!
		$score: numeric!
		$label: String!
		$analysis: jsonb
	) {
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: {
				good_faith_score: $score
				good_faith_label: $label
				good_faith_last_evaluated: "now()"
				good_faith_analysis: $analysis
			}
		) {
			id
		}
	}
`;

// Mutation to anonymize a post
export const ANONYMIZE_POST = gql`
	mutation AnonymizePost($postId: uuid!) {
		update_post_by_pk(pk_columns: { id: $postId }, _set: { is_anonymous: true }) {
			id
			is_anonymous
		}
	}
`;

// Mutation to anonymize a discussion
export const ANONYMIZE_DISCUSSION = gql`
	mutation AnonymizeDiscussion($discussionId: uuid!) {
		update_discussion_by_pk(pk_columns: { id: $discussionId }, _set: { is_anonymous: true }) {
			id
			is_anonymous
		}
	}
`;

// Mutation to un-anonymize a post
export const UNANONYMIZE_POST = gql`
	mutation UnanonymizePost($postId: uuid!) {
		update_post_by_pk(pk_columns: { id: $postId }, _set: { is_anonymous: false }) {
			id
			is_anonymous
		}
	}
`;

// Mutation to un-anonymize a discussion
export const UNANONYMIZE_DISCUSSION = gql`
	mutation UnanonymizeDiscussion($discussionId: uuid!) {
		update_discussion_by_pk(pk_columns: { id: $discussionId }, _set: { is_anonymous: false }) {
			id
			is_anonymous
		}
	}
`;

// Mutation to update contributor analysis settings
export const UPDATE_CONTRIBUTOR_ANALYSIS_SETTINGS = gql`
	mutation UpdateContributorAnalysisSettings(
		$contributorId: uuid!
		$analysisEnabled: Boolean!
		$analysisLimit: Int
	) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { analysis_enabled: $analysisEnabled, analysis_limit: $analysisLimit }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Get contributor by user ID
export const GET_CONTRIBUTOR = gql`
	query GetContributor($userId: uuid!) {
		contributor_by_pk(id: $userId) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to increment analysis usage count
export const INCREMENT_ANALYSIS_USAGE = gql`
	mutation IncrementAnalysisUsage($contributorId: uuid!) {
		update_contributor_by_pk(pk_columns: { id: $contributorId }, _inc: { analysis_count_used: 1 }) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to reset analysis usage count
export const RESET_ANALYSIS_USAGE = gql`
	mutation ResetAnalysisUsage($contributorId: uuid!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { analysis_count_used: 0, analysis_count_reset_at: "now()" }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to update contributor role
export const UPDATE_CONTRIBUTOR_ROLE = gql`
	mutation UpdateContributorRole($contributorId: uuid!, $role: String!) {
		update_contributor_by_pk(pk_columns: { id: $contributorId }, _set: { role: $role }) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to update contributor avatar
export const UPDATE_CONTRIBUTOR_AVATAR = gql`
	mutation UpdateContributorAvatar($contributorId: uuid!, $avatarUrl: String) {
		update_contributor_by_pk(pk_columns: { id: $contributorId }, _set: { avatar_url: $avatarUrl }) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to add purchased credits
export const ADD_PURCHASED_CREDITS = gql`
	mutation AddPurchasedCredits($contributorId: uuid!, $creditsToAdd: Int!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_inc: { purchased_credits_total: $creditsToAdd }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to increment purchased credits used
export const INCREMENT_PURCHASED_CREDITS_USED = gql`
	mutation IncrementPurchasedCreditsUsed($contributorId: uuid!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_inc: { purchased_credits_used: 1 }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to update subscription tier
export const UPDATE_SUBSCRIPTION_TIER = gql`
	mutation UpdateSubscriptionTier(
		$contributorId: uuid!
		$tier: subscription_tier_enum!
		$analysisLimit: Int!
	) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { subscription_tier: $tier, analysis_limit: $analysisLimit }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to update analysis limit based on subscription tier
export const UPDATE_ANALYSIS_LIMIT_BY_TIER = gql`
	mutation UpdateAnalysisLimitByTier($contributorId: uuid!, $limit: Int) {
		update_contributor_by_pk(pk_columns: { id: $contributorId }, _set: { analysis_limit: $limit }) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Public showcase content surfaced on landing/discussions pages
const PUBLIC_SHOWCASE_ITEM_FIELDS = gql`
	fragment PublicShowcaseItemFields on public_showcase_item {
		id
		title
		subtitle
		media_type
		creator
		source_url
		summary
		analysis
		tags
		display_order
		published
		created_at
	}
`;

export const GET_PUBLIC_SHOWCASE_PUBLISHED = gql`
	query GetPublicShowcasePublished {
		public_showcase_item(
			where: { published: { _eq: true } }
			order_by: [{ display_order: desc }, { created_at: desc }]
		) {
			...PublicShowcaseItemFields
		}
	}
	${PUBLIC_SHOWCASE_ITEM_FIELDS}
`;

export const GET_PUBLIC_SHOWCASE_ITEM = gql`
	query GetPublicShowcaseItem($id: uuid!) {
		public_showcase_item_by_pk(id: $id) {
			...PublicShowcaseItemFields
		}
	}
	${PUBLIC_SHOWCASE_ITEM_FIELDS}
`;

export const GET_PUBLIC_SHOWCASE_ADMIN = gql`
	query GetPublicShowcaseAdmin {
		public_showcase_item(order_by: [{ display_order: desc }, { created_at: desc }]) {
			...PublicShowcaseItemFields
		}
	}
	${PUBLIC_SHOWCASE_ITEM_FIELDS}
`;

export const CREATE_PUBLIC_SHOWCASE_ITEM = gql`
	mutation CreatePublicShowcaseItem($input: public_showcase_item_insert_input!) {
		insert_public_showcase_item_one(object: $input) {
			id
		}
	}
`;

export const UPDATE_PUBLIC_SHOWCASE_ITEM = gql`
	mutation UpdatePublicShowcaseItem($id: uuid!, $changes: public_showcase_item_set_input!) {
		update_public_showcase_item_by_pk(pk_columns: { id: $id }, _set: $changes) {
			id
		}
	}
`;

export const DELETE_PUBLIC_SHOWCASE_ITEM = gql`
	mutation DeletePublicShowcaseItem($id: uuid!) {
		delete_public_showcase_item_by_pk(id: $id) {
			id
		}
	}
`;

// Citation queries and mutations
export const CITATION_FIELDS = gql`
	fragment CitationFields on citation {
		id
		title
		url
		author
		publisher
		publish_date
		accessed_date
		page_number
		point_supported
		relevant_quote
		created_at
		created_by
	}
`;

export const CREATE_CITATION = gql`
	mutation CreateCitation(
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

// Notification queries
const NOTIFICATION_FIELDS = gql`
	fragment NotificationFields on notification {
		id
		type
		discussion_id
		post_id
		actor_id
		read
		created_at
		discussion {
			id
			discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				title
			}
		}
		post {
			id
			content
		}
	}
`;

export const GET_NOTIFICATIONS = gql`
	query GetNotifications($userId: uuid!, $limit: Int = 20) {
		notification(
			where: { recipient_id: { _eq: $userId } }
			order_by: { created_at: desc }
			limit: $limit
		) {
			...NotificationFields
		}
	}
	${NOTIFICATION_FIELDS}
`;

export const GET_UNREAD_NOTIFICATION_COUNT = gql`
	query GetUnreadNotificationCount($userId: uuid!) {
		notification_aggregate(where: { recipient_id: { _eq: $userId }, read: { _eq: false } }) {
			aggregate {
				count
			}
		}
	}
`;

export const MARK_NOTIFICATION_AS_READ = gql`
	mutation MarkNotificationAsRead($notificationId: uuid!) {
		update_notification_by_pk(pk_columns: { id: $notificationId }, _set: { read: true }) {
			id
			read
		}
	}
`;

export const MARK_ALL_NOTIFICATIONS_AS_READ = gql`
	mutation MarkAllNotificationsAsRead($userId: uuid!) {
		update_notification(where: { recipient_id: { _eq: $userId } }, _set: { read: true }) {
			affected_rows
		}
	}
`;

// Editors' Desk Pick queries and mutations
// Basic fragment for anonymous/public users - no relationships
const EDITORS_DESK_PICK_FIELDS = gql`
	fragment EditorsDeskPickFields on editors_desk_pick {
		id
		title
		excerpt
		editor_note
		display_order
		published
		created_at
		post_id
		discussion_id
	}
`;

// Extended fragment for authenticated users with relationship access
const EDITORS_DESK_PICK_FIELDS_EXTENDED = gql`
	fragment EditorsDeskPickFieldsExtended on editors_desk_pick {
		id
		title
		excerpt
		editor_note
		display_order
		status
		published
		created_at
		updated_at
		post_id
		discussion_id
		author_id
		curator_id
		post {
			id
			content
			contributor {
				id
				display_name
				handle
			}
		}
		discussion {
			id
			discussion_versions(
				where: { version_type: { _eq: "published" } }
				order_by: { version_number: desc }
				limit: 1
			) {
				title
				description
			}
		}
		userByAuthorId {
			id
			display_name
		}
		userByCuratorId {
			id
			display_name
		}
	}
`;

export const GET_EDITORS_DESK_PICKS = gql`
	query GetEditorsDeskPicks($publishedOnly: Boolean = true) {
		editors_desk_pick(
			where: { published: { _eq: $publishedOnly } }
			order_by: [{ display_order: desc }, { created_at: desc }]
		) {
			...EditorsDeskPickFields
		}
	}
	${EDITORS_DESK_PICK_FIELDS}
`;

export const GET_EDITORS_DESK_PICK_BY_ID = gql`
	query GetEditorsDeskPickById($id: uuid!) {
		editors_desk_pick_by_pk(id: $id) {
			...EditorsDeskPickFields
		}
	}
	${EDITORS_DESK_PICK_FIELDS}
`;

export const GET_MY_PENDING_EDITORS_DESK_APPROVALS = gql`
	query GetMyPendingEditorsDeskApprovals($authorId: uuid!) {
		editors_desk_pick(
			where: {
				author_id: { _eq: $authorId }
				status: { _eq: "pending_author_approval" }
			}
			order_by: { created_at: desc }
		) {
			id
			title
			excerpt
			editor_note
			display_order
			status
			published
			created_at
			updated_at
			post_id
			discussion_id
			author_id
			curator_id
		}
	}
`;

export const GET_ALL_EDITORS_DESK_PICKS_ADMIN = gql`
	query GetAllEditorsDeskPicksAdmin {
		editors_desk_pick(order_by: [{ display_order: desc }, { created_at: desc }]) {
			...EditorsDeskPickFieldsExtended
		}
	}
	${EDITORS_DESK_PICK_FIELDS_EXTENDED}
`;

export const CREATE_EDITORS_DESK_PICK = gql`
	mutation CreateEditorsDeskPick(
		$title: String!
		$excerpt: String
		$editorNote: String
		$displayOrder: Int = 0
		$postId: uuid
		$discussionId: uuid
		$authorId: uuid!
		$curatorId: uuid!
		$status: editors_desk_status_enum!
		$published: Boolean = false
	) {
		insert_editors_desk_pick_one(
			object: {
				title: $title
				excerpt: $excerpt
				editor_note: $editorNote
				display_order: $displayOrder
				post_id: $postId
				discussion_id: $discussionId
				author_id: $authorId
				curator_id: $curatorId
				status: $status
				published: $published
			}
		) {
			id
			title
			excerpt
			editor_note
			display_order
			status
			published
			created_at
			post_id
			discussion_id
			author_id
			curator_id
		}
	}
`;

export const UPDATE_EDITORS_DESK_PICK_STATUS = gql`
	mutation UpdateEditorsDeskPickStatus($id: uuid!, $status: editors_desk_status_enum!) {
		update_editors_desk_pick_by_pk(pk_columns: { id: $id }, _set: { status: $status }) {
			id
			status
		}
	}
`;

export const UPDATE_EDITORS_DESK_PICK = gql`
	mutation UpdateEditorsDeskPick(
		$id: uuid!
		$title: String
		$excerpt: String
		$editorNote: String
		$displayOrder: Int
		$published: Boolean
	) {
		update_editors_desk_pick_by_pk(
			pk_columns: { id: $id }
			_set: {
				title: $title
				excerpt: $excerpt
				editor_note: $editorNote
				display_order: $displayOrder
				published: $published
			}
		) {
			id
			title
			excerpt
			editor_note
			display_order
			published
		}
	}
`;

export const DELETE_EDITORS_DESK_PICK = gql`
	mutation DeleteEditorsDeskPick($id: uuid!) {
		delete_editors_desk_pick_by_pk(id: $id) {
			id
		}
	}
`;
