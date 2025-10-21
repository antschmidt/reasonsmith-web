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
		# Get current user's contributor data (for role check)
		contributor_by_pk(id: $userId) {
			id
			role
		}

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

		# Get pending collaboration invites for the current user
		myCollaborationInvites: post_collaborator(
			where: { contributor_id: { _eq: $userId }, status: { _eq: "pending" } }
			order_by: { invited_at: desc }
		) {
			id
			post_id
			status
			role
			invited_at
			inviter {
				...ContributorFields
			}
			post {
				id
				draft_content
				discussion_id
				discussion {
					id
					discussion_versions(limit: 1, order_by: { created_at: desc }) {
						title
					}
				}
			}
		}

		# Get drafts where the user is an accepted collaborator
		collaborativeDrafts: post_collaborator(
			where: {
				contributor_id: { _eq: $userId }
				status: { _eq: "accepted" }
				post: { status: { _in: ["draft", "pending"] } }
			}
			order_by: { post: { updated_at: desc } }
		) {
			id
			post_id
			role
			post {
				id
				draft_content
				discussion_id
				status
				updated_at
				good_faith_score
				good_faith_label
				good_faith_last_evaluated
				good_faith_analysis
				contributor {
					...ContributorFields
				}
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
				audio_url
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
		audio_url
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

// Update audio URL for a discussion version
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

// Search contributors (for admin purposes)
export const SEARCH_CONTRIBUTORS = gql`
	query SearchContributors($searchTerm: String!) {
		contributor(
			where: {
				_or: [
					{ display_name: { _ilike: $searchTerm } }
					{ handle: { _ilike: $searchTerm } }
					{ auth_email: { _ilike: $searchTerm } }
				]
			}
			limit: 20
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to anonymize all user content and delete the contributor record (admin only)
// Note: A database trigger will automatically delete the auth.users record when contributor is deleted
export const ANONYMIZE_AND_DELETE_USER = gql`
	mutation AnonymizeAndDeleteUser($userId: uuid!) {
		# Anonymize all discussions created by this user
		update_discussion(where: { created_by: { _eq: $userId } }, _set: { is_anonymous: true }) {
			affected_rows
		}

		# Anonymize all posts by this user
		update_post(where: { author_id: { _eq: $userId } }, _set: { is_anonymous: true }) {
			affected_rows
		}

		# Delete the contributor record
		# A database trigger will automatically delete the corresponding auth.users record
		delete_contributor(where: { id: { _eq: $userId } }) {
			affected_rows
			returning {
				id
			}
		}
	}
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

// Mutation to add purchased credits (increments total, remaining is auto-calculated)
// Note: purchased_credits_remaining is a generated column (total - used), so we only increment total
export const ADD_PURCHASED_CREDITS = gql`
	mutation AddPurchasedCredits($contributorId: uuid!, $creditsToAdd: Int!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_inc: { purchased_credits_total: $creditsToAdd, purchased_credits_remaining: $creditsToAdd }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// Mutation to set purchased credits to a specific value
// Note: purchased_credits_remaining is calculated as (total - used), so we update total and used
export const SET_PURCHASED_CREDITS = gql`
	mutation SetPurchasedCredits($contributorId: uuid!, $totalCredits: Int!, $usedCredits: Int!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { purchased_credits_total: $totalCredits, purchased_credits_used: $usedCredits }
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
		metadata
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
			post_collaborators {
				id
				contributor_id
				role
			}
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

export const DELETE_NOTIFICATION = gql`
	mutation DeleteNotification($notificationId: uuid!) {
		delete_notification_by_pk(id: $notificationId) {
			id
		}
	}
`;

export const DELETE_ALL_NOTIFICATIONS = gql`
	mutation DeleteAllNotifications($userId: uuid!) {
		delete_notification(where: { recipient_id: { _eq: $userId } }) {
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
			where: { author_id: { _eq: $authorId }, status: { _eq: "pending_author_approval" } }
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

export const DELETE_EDITORS_DESK_PICK = gql`
	mutation DeleteEditorsDeskPick($pickId: uuid!) {
		delete_editors_desk_pick_by_pk(id: $pickId) {
			id
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

// Save for Later queries and mutations
export const CHECK_SAVED_ITEM = gql`
	query CheckSavedItem(
		$contributorId: uuid!
		$discussionId: uuid
		$postId: uuid
		$editorsDeskPickId: uuid
	) {
		saved_item(
			where: {
				contributor_id: { _eq: $contributorId }
				_and: [
					{
						_or: [{ discussion_id: { _eq: $discussionId } }, { discussion_id: { _is_null: true } }]
					}
					{ _or: [{ post_id: { _eq: $postId } }, { post_id: { _is_null: true } }] }
					{
						_or: [
							{ editors_desk_pick_id: { _eq: $editorsDeskPickId } }
							{ editors_desk_pick_id: { _is_null: true } }
						]
					}
				]
			}
			limit: 1
		) {
			id
		}
	}
`;

export const SAVE_ITEM = gql`
	mutation SaveItem(
		$contributorId: uuid!
		$discussionId: uuid
		$postId: uuid
		$editorsDeskPickId: uuid
	) {
		insert_saved_item_one(
			object: {
				contributor_id: $contributorId
				discussion_id: $discussionId
				post_id: $postId
				editors_desk_pick_id: $editorsDeskPickId
			}
		) {
			id
			contributor_id
			discussion_id
			post_id
			editors_desk_pick_id
			created_at
		}
	}
`;

export const REMOVE_SAVED_ITEM = gql`
	mutation RemoveSavedItem($savedItemId: uuid!) {
		delete_saved_item_by_pk(id: $savedItemId) {
			id
		}
	}
`;

export const GET_SAVED_ITEMS = gql`
	query GetSavedItems($contributorId: uuid!) {
		saved_item(where: { contributor_id: { _eq: $contributorId } }, order_by: { created_at: desc }) {
			id
			created_at
			discussion {
				id
				created_at
				contributor {
					id
					display_name
					handle
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
			post {
				id
				content
				created_at
				discussion_id
				contributor {
					id
					display_name
					handle
				}
				discussion {
					id
					current_version: discussion_versions(
						where: { version_type: { _eq: "published" } }
						order_by: { version_number: desc }
						limit: 1
					) {
						title
					}
				}
			}
			editors_desk_pick {
				id
				title
				excerpt
				editor_note
				created_at
				discussion_id
				post_id
			}
		}
	}
`;

// Security Keys (WebAuthn) queries
// Note: Based on nhost/metadata/databases/default/tables/auth_user_security_keys.yaml
// WARNING: The 'nickname' field exists in the database but is NOT present in the metadata.
// This schema inconsistency may cause confusion or errors if metadata is used for type generation or validation.
// To resolve, update the metadata to include 'nickname', or ensure all code using this field is aware of the discrepancy.
const SECURITY_KEY_FIELDS = gql`
	fragment SecurityKeyFields on authUserSecurityKeys {
		id
		credentialId
		userId
		nickname
	}
`;

export const GET_USER_SECURITY_KEYS = gql`
	query GetUserSecurityKeys($userId: uuid!) {
		authUserSecurityKeys(where: { userId: { _eq: $userId } }) {
			...SecurityKeyFields
		}
	}
	${SECURITY_KEY_FIELDS}
`;

export const DELETE_SECURITY_KEY = gql`
	mutation DeleteSecurityKey($id: uuid!) {
		deleteAuthUserSecurityKey(id: $id) {
			id
		}
	}
`;

// ============================================
// Subscription and Real-Time Collaboration
// ============================================

export const GET_SUBSCRIPTION_PLANS = gql`
	query GetSubscriptionPlans {
		subscription_plan(order_by: { price_monthly: asc }) {
			id
			name
			price_monthly
			features
			display_name
			description
		}
	}
`;

export const GET_COLLABORATION_SESSION = gql`
	query GetCollaborationSession($postId: uuid!) {
		collaboration_session(where: { post_id: { _eq: $postId } }) {
			id
			post_id
			yjs_state
			last_active_at
			created_at
		}
	}
`;

export const UPSERT_COLLABORATION_SESSION = gql`
	mutation UpsertCollaborationSession($postId: uuid!, $yjsState: bytea!) {
		insert_collaboration_session_one(
			object: { post_id: $postId, yjs_state: $yjsState, last_active_at: "now()" }
			on_conflict: {
				constraint: collaboration_session_post_id_key
				update_columns: [yjs_state, last_active_at]
			}
		) {
			id
			post_id
		}
	}
`;

export const UPDATE_CONTRIBUTOR_SUBSCRIPTION = gql`
	mutation UpdateContributorSubscription(
		$id: uuid!
		$realtimeEnabled: Boolean!
		$expiresAt: timestamptz
	) {
		update_contributor_by_pk(
			pk_columns: { id: $id }
			_set: {
				realtime_collaboration_enabled: $realtimeEnabled
				subscription_expires_at: $expiresAt
			}
		) {
			id
			realtime_collaboration_enabled
			subscription_expires_at
		}
	}
`;

export const CHECK_REALTIME_ACCESS = gql`
	query CheckRealtimeAccess($postId: uuid!, $userId: uuid!) {
		post_by_pk(id: $postId) {
			id
			status
			author_id
			author: contributor {
				id
				display_name
				realtime_collaboration_enabled
				subscription_expires_at
			}
			post_collaborators(where: { contributor_id: { _eq: $userId }, status: { _eq: "accepted" } }) {
				contributor {
					id
					display_name
					realtime_collaboration_enabled
					subscription_expires_at
				}
			}
		}
	}
`;

// ============================================
// Phase 1: Basic Post Collaboration
// ============================================

export const GET_POST_COLLABORATORS = gql`
	query GetPostCollaborators($postId: uuid!) {
		post_collaborator(where: { post_id: { _eq: $postId } }) {
			id
			post_id
			contributor_id
			status
			role
			invited_at
			responded_at
			contributor {
				id
				display_name
				handle
				avatar_url
			}
			inviter {
				id
				display_name
				handle
			}
		}
	}
`;

export const GET_MY_COLLABORATION_INVITES = gql`
	query GetMyCollaborationInvites($userId: uuid!) {
		post_collaborator(
			where: { contributor_id: { _eq: $userId }, status: { _eq: "pending" } }
			order_by: { invited_at: desc }
		) {
			id
			post_id
			status
			role
			invited_at
			inviter {
				id
				display_name
				handle
			}
			post {
				id
				draft_content
				discussion_id
				discussion {
					id
					discussion_versions(limit: 1, order_by: { created_at: desc }) {
						title
					}
				}
			}
		}
	}
`;

export const INVITE_COLLABORATOR = gql`
	mutation InviteCollaborator(
		$postId: uuid!
		$contributorId: uuid!
		$role: String!
		$invitedBy: uuid!
	) {
		insert_post_collaborator_one(
			object: {
				post_id: $postId
				contributor_id: $contributorId
				role: $role
				invited_by: $invitedBy
				status: "pending"
			}
		) {
			id
			post_id
			contributor_id
			status
			role
		}
	}
`;

export const UPDATE_COLLABORATION_STATUS = gql`
	mutation UpdateCollaborationStatus($id: uuid!, $status: String!, $respondedAt: timestamptz!) {
		update_post_collaborator_by_pk(
			pk_columns: { id: $id }
			_set: { status: $status, responded_at: $respondedAt }
		) {
			id
			status
			responded_at
		}
	}
`;

export const REMOVE_COLLABORATOR = gql`
	mutation RemoveCollaborator($id: uuid!) {
		delete_post_collaborator_by_pk(id: $id) {
			id
		}
	}
`;

export const CHECK_POST_EDIT_PERMISSION = gql`
	query CheckPostEditPermission($postId: uuid!, $userId: uuid!) {
		post_by_pk(id: $postId) {
			id
			author_id
			post_collaborators(where: { contributor_id: { _eq: $userId } }) {
				contributor_id
				status
				role
			}
		}
	}
`;

export const SEARCH_USERS_FOR_COLLABORATION = gql`
	query SearchUsersForCollaboration($searchTerm: String!) {
		contributor(
			where: {
				_or: [{ display_name: { _ilike: $searchTerm } }, { handle: { _ilike: $searchTerm } }]
			}
			limit: 10
		) {
			id
			display_name
			handle
			avatar_url
		}
	}
`;

export const ADD_POST_COLLABORATOR = gql`
	mutation AddPostCollaborator(
		$postId: uuid!
		$contributorId: uuid!
		$role: String!
		$invitedBy: uuid!
	) {
		insert_post_collaborator_one(
			object: {
				post_id: $postId
				contributor_id: $contributorId
				role: $role
				invited_by: $invitedBy
				status: "pending"
			}
		) {
			id
			post_id
			contributor_id
			role
			status
			invited_at
		}
	}
`;

// ============================================
// Collaborator Management
// ============================================

export const UPDATE_COLLABORATOR_ROLE = gql`
	mutation UpdateCollaboratorRole($collaboratorId: uuid!, $newRole: String!) {
		update_post_collaborator_by_pk(pk_columns: { id: $collaboratorId }, _set: { role: $newRole }) {
			id
			role
			contributor {
				id
				display_name
				handle
				avatar_url
			}
		}
	}
`;

export const FORCE_RECLAIM_EDIT_LOCK = gql`
	mutation ForceReclaimEditLock($postId: uuid!, $fromUserId: uuid!) {
		# Release the current editor's lock
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $fromUserId } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}
		# Clear the post's current editor
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: null, edit_locked_at: null }
		) {
			id
			current_editor_id
			edit_locked_at
		}
	}
`;

// ============================================
// Edit Lock System - Turn-based Collaboration
// ============================================

// Note: Using direct mutations instead of PostgreSQL functions due to Hasura tracking limitations
// The business logic is handled client-side with optimistic updates

export const ACQUIRE_EDIT_LOCK = gql`
	mutation AcquireEditLock($postId: uuid!, $userId: uuid!, $now: timestamptz!) {
		# Update post to set current editor
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: $userId, edit_locked_at: $now }
		) {
			id
			current_editor_id
			edit_locked_at
			collaboration_enabled
		}
		# Update collaborator status (use alias to avoid conflict)
		set_collaborator_lock: update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $userId } }
			_set: { has_edit_lock: true, edit_lock_acquired_at: $now }
		) {
			affected_rows
		}
		# Release other collaborators' locks (use alias to avoid conflict)
		release_other_locks: update_post_collaborator(
			where: {
				post_id: { _eq: $postId }
				contributor_id: { _neq: $userId }
				has_edit_lock: { _eq: true }
			}
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}
	}
`;

export const RELEASE_EDIT_LOCK = gql`
	mutation ReleaseEditLock($postId: uuid!, $userId: uuid!) {
		# Clear current editor
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: null, edit_locked_at: null }
		) {
			id
			current_editor_id
			edit_locked_at
			collaboration_enabled
		}
		# Release collaborator's lock
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $userId } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}
	}
`;

export const TOGGLE_COLLABORATION = gql`
	mutation ToggleCollaboration($postId: uuid!, $enabled: Boolean!) {
		# Toggle collaboration and release all locks
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { collaboration_enabled: $enabled, current_editor_id: null, edit_locked_at: null }
		) {
			id
			collaboration_enabled
			current_editor_id
			edit_locked_at
		}
		# Release all collaborator locks
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, has_edit_lock: { _eq: true } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}
	}
`;

export const GET_EDIT_LOCK_STATUS = gql`
	query GetEditLockStatus($postId: uuid!) {
		post_by_pk(id: $postId) {
			id
			current_editor_id
			edit_locked_at
			collaboration_enabled
			author_id
			author: contributor {
				id
				display_name
				handle
				avatar_url
			}
			current_editor: contributorByCurrentEditorId {
				id
				display_name
				handle
				avatar_url
			}
			post_collaborators(where: { status: { _eq: "accepted" } }) {
				id
				has_edit_lock
				edit_lock_acquired_at
				role
				contributor {
					id
					display_name
					handle
					avatar_url
				}
			}
		}
	}
`;

// Subscription for real-time draft content updates
export const SUBSCRIBE_TO_DRAFT_UPDATES = gql`
	subscription SubscribeToDraftUpdates($postId: uuid!) {
		post_by_pk(id: $postId) {
			id
			draft_content
			updated_at
			current_editor_id
			author_id
			edit_locked_at
		}
	}
`;

// Subscription for real-time edit lock status changes
export const SUBSCRIBE_TO_EDIT_LOCK_STATUS = gql`
	subscription SubscribeToEditLockStatus($postId: uuid!) {
		post_by_pk(id: $postId) {
			id
			current_editor_id
			edit_locked_at
			collaboration_enabled
			author_id
			author: contributor {
				id
				display_name
				handle
				avatar_url
			}
			current_editor: contributorByCurrentEditorId {
				id
				display_name
				handle
				avatar_url
			}
			post_collaborators(where: { status: { _eq: "accepted" } }) {
				id
				has_edit_lock
				edit_lock_acquired_at
				role
				contributor {
					id
					display_name
					handle
					avatar_url
				}
			}
		}
	}
`;

// ============================================
// Edit Control Request System
// ============================================

export const CREATE_EDIT_CONTROL_REQUEST = gql`
	mutation CreateEditControlRequest(
		$postId: uuid!
		$discussionId: uuid!
		$requesterId: uuid!
		$currentHolderId: uuid!
		$authorId: uuid!
		$discussionTitle: String!
		$skipAuthorNotification: Boolean!
	) {
		# Delete any existing edit control request notifications for this post from this requester
		# This prevents duplicate notification errors
		delete_notification(
			where: {
				type: { _eq: "edit_control_request" }
				post_id: { _eq: $postId }
				actor_id: { _eq: $requesterId }
			}
		) {
			affected_rows
		}

		# Create notification for current lock holder
		insert_notification_one(
			object: {
				type: "edit_control_request"
				recipient_id: $currentHolderId
				actor_id: $requesterId
				discussion_id: $discussionId
				post_id: $postId
				metadata: {
					requester_id: $requesterId
					current_holder_id: $currentHolderId
					post_id: $postId
					discussion_title: $discussionTitle
				}
			}
		) {
			id
		}

		# Create notification for author (if different from current holder)
		author_notification: insert_notification_one(
			object: {
				type: "edit_control_request"
				recipient_id: $authorId
				actor_id: $requesterId
				discussion_id: $discussionId
				post_id: $postId
				metadata: {
					requester_id: $requesterId
					current_holder_id: $currentHolderId
					post_id: $postId
					discussion_title: $discussionTitle
				}
			}
		) @skip(if: $skipAuthorNotification) {
			id
		}
	}
`;

export const APPROVE_EDIT_CONTROL_REQUEST = gql`
	mutation ApproveEditControlRequest(
		$postId: uuid!
		$newEditorId: uuid!
		$previousEditorId: uuid!
		$now: timestamptz!
	) {
		# Release previous editor's lock (only if they have a collaborator record)
		releaseLock: update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $previousEditorId } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}

		# Grant lock to requester (only if they have a collaborator record)
		# If requester is author, they may not have a collaborator record
		grantLock: update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $newEditorId } }
			_set: { has_edit_lock: true, edit_lock_acquired_at: $now }
		) {
			affected_rows
			returning {
				id
				has_edit_lock
			}
		}

		# Update post's current editor and lock timestamp
		# This works for both author and collaborators
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: $newEditorId, edit_locked_at: $now }
		) {
			id
			current_editor_id
			edit_locked_at
		}

		# Delete all related notifications for this request
		delete_notification(
			where: {
				_and: [
					{ type: { _eq: "edit_control_request" } }
					{ post_id: { _eq: $postId } }
					{ metadata: { _contains: { requester_id: $newEditorId } } }
				]
			}
		) {
			affected_rows
		}
	}
`;

export const DENY_EDIT_CONTROL_REQUEST = gql`
	mutation DenyEditControlRequest($requesterId: uuid!, $postId: uuid!) {
		# Delete all related notifications for this request
		delete_notification(
			where: {
				_and: [
					{ type: { _eq: "edit_control_request" } }
					{ post_id: { _eq: $postId } }
					{ metadata: { _contains: { requester_id: $requesterId } } }
				]
			}
		) {
			affected_rows
		}
	}
`;

export const CREATE_ROLE_UPGRADE_REQUEST = gql`
	mutation CreateRoleUpgradeRequest(
		$postId: uuid!
		$discussionId: uuid!
		$requesterId: uuid!
		$authorId: uuid!
		$discussionTitle: String!
		$requestedRole: String!
	) {
		insert_notification_one(
			object: {
				type: "role_upgrade_request"
				recipient_id: $authorId
				actor_id: $requesterId
				discussion_id: $discussionId
				post_id: $postId
				metadata: {
					requester_id: $requesterId
					post_id: $postId
					discussion_title: $discussionTitle
					requested_role: $requestedRole
				}
			}
		) {
			id
		}
	}
`;

export const APPROVE_ROLE_UPGRADE_REQUEST = gql`
	mutation ApproveRoleUpgradeRequest(
		$notificationId: uuid!
		$collaboratorId: uuid!
		$newRole: String!
	) {
		# Update collaborator role
		update_post_collaborator_by_pk(pk_columns: { id: $collaboratorId }, _set: { role: $newRole }) {
			id
			role
		}

		# Delete notification
		delete_notification_by_pk(id: $notificationId) {
			id
		}
	}
`;

export const DENY_ROLE_UPGRADE_REQUEST = gql`
	mutation DenyRoleUpgradeRequest($notificationId: uuid!) {
		delete_notification_by_pk(id: $notificationId) {
			id
		}
	}
`;

// ============================================
// Collaboration Chat System
// ============================================

// Fragment for collaboration message fields
const COLLABORATION_MESSAGE_FIELDS = gql`
	fragment CollaborationMessageFields on collaboration_message {
		id
		post_id
		sender_id
		message_type
		content
		metadata
		created_at
		updated_at
		deleted_at
		sender {
			id
			display_name
			handle
			avatar_url
		}
	}
`;

// Get all collaboration chats for current user
export const GET_USER_COLLABORATION_CHATS = gql`
	${COLLABORATION_MESSAGE_FIELDS}
	query GetUserCollaborationChats($userId: uuid!) {
		# Posts where user is the author
		author_posts: post(
			where: {
				author_id: { _eq: $userId }
				collaboration_enabled: { _eq: true }
				status: { _eq: "draft" }
			}
			order_by: { updated_at: desc }
		) {
			id
			discussion_id
			author_id
			collaboration_enabled
			current_editor_id
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
			post_collaborators(where: { status: { _eq: "accepted" } }) {
				id
				contributor_id
				role
				contributor {
					id
					display_name
					handle
					avatar_url
				}
			}
			collaboration_messages(
				where: { deleted_at: { _is_null: true } }
				order_by: { created_at: desc }
				limit: 1
			) {
				...CollaborationMessageFields
			}
			unread_count: collaboration_messages_aggregate(
				where: {
					deleted_at: { _is_null: true }
					sender_id: { _neq: $userId }
					_not: { read_statuses: { user_id: { _eq: $userId } } }
				}
			) {
				aggregate {
					count
				}
			}
		}

		# Posts where user is a collaborator
		collaborator_posts: post_collaborator(
			where: {
				contributor_id: { _eq: $userId }
				status: { _eq: "accepted" }
				post: { collaboration_enabled: { _eq: true }, status: { _eq: "draft" } }
			}
			order_by: { post: { updated_at: desc } }
		) {
			id
			post {
				id
				discussion_id
				author_id
				collaboration_enabled
				current_editor_id
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
				post_collaborators(where: { status: { _eq: "accepted" } }) {
					id
					contributor_id
					role
					contributor {
						id
						display_name
						handle
						avatar_url
					}
				}
				collaboration_messages(
					where: { deleted_at: { _is_null: true } }
					order_by: { created_at: desc }
					limit: 1
				) {
					...CollaborationMessageFields
				}
				unread_count: collaboration_messages_aggregate(
					where: {
						deleted_at: { _is_null: true }
						sender_id: { _neq: $userId }
						_not: { read_statuses: { user_id: { _eq: $userId } } }
					}
				) {
					aggregate {
						count
					}
				}
			}
		}
	}
`;

// Get messages for a specific collaboration
export const GET_COLLABORATION_MESSAGES = gql`
	${COLLABORATION_MESSAGE_FIELDS}
	query GetCollaborationMessages($postId: uuid!, $limit: Int = 50, $offset: Int = 0) {
		collaboration_message(
			where: { post_id: { _eq: $postId }, deleted_at: { _is_null: true } }
			order_by: { created_at: asc }
			limit: $limit
			offset: $offset
		) {
			...CollaborationMessageFields
		}
	}
`;

// Get total unread message count across all collaborations
export const GET_TOTAL_COLLABORATION_UNREAD_COUNT = gql`
	query GetTotalCollaborationUnreadCount($userId: uuid!) {
		collaboration_message_aggregate(
			where: {
				deleted_at: { _is_null: true }
				sender_id: { _neq: $userId }
				_not: { read_statuses: { user_id: { _eq: $userId } } }
				post: {
					_or: [
						{ author_id: { _eq: $userId } }
						{
							post_collaborators: {
								_and: [{ contributor_id: { _eq: $userId } }, { status: { _eq: "accepted" } }]
							}
						}
					]
				}
			}
		) {
			aggregate {
				count
			}
		}
	}
`;

// Subscribe to new messages in a collaboration
export const SUBSCRIBE_TO_COLLABORATION_MESSAGES = gql`
	${COLLABORATION_MESSAGE_FIELDS}
	subscription SubscribeToCollaborationMessages($postId: uuid!) {
		collaboration_message(
			where: { post_id: { _eq: $postId }, deleted_at: { _is_null: true } }
			order_by: { created_at: asc }
		) {
			...CollaborationMessageFields
		}
	}
`;

// Send a collaboration message
export const SEND_COLLABORATION_MESSAGE = gql`
	${COLLABORATION_MESSAGE_FIELDS}
	mutation SendCollaborationMessage(
		$postId: uuid!
		$senderId: uuid!
		$messageType: String = "text"
		$content: String!
		$metadata: jsonb = {}
	) {
		insert_collaboration_message_one(
			object: {
				post_id: $postId
				sender_id: $senderId
				message_type: $messageType
				content: $content
				metadata: $metadata
			}
		) {
			...CollaborationMessageFields
		}
	}
`;

// Mark messages as read for a specific post
export const MARK_COLLABORATION_MESSAGES_AS_READ = gql`
	mutation MarkCollaborationMessagesAsRead(
		$readStatuses: [collaboration_message_read_status_insert_input!]!
	) {
		insert_collaboration_message_read_status(
			objects: $readStatuses
			on_conflict: {
				constraint: collaboration_message_read_status_message_id_user_id_key
				update_columns: []
			}
		) {
			affected_rows
		}
	}
`;

// Send edit control request as collaboration message
export const SEND_EDIT_CONTROL_REQUEST_MESSAGE = gql`
	${COLLABORATION_MESSAGE_FIELDS}
	mutation SendEditControlRequestMessage(
		$postId: uuid!
		$requesterId: uuid!
		$currentHolderId: uuid!
		$discussionTitle: String!
	) {
		insert_collaboration_message_one(
			object: {
				post_id: $postId
				sender_id: $requesterId
				message_type: "edit_request"
				content: "Requesting edit control"
				metadata: {
					requester_id: $requesterId
					current_holder_id: $currentHolderId
					discussion_title: $discussionTitle
					status: "pending"
				}
			}
		) {
			...CollaborationMessageFields
		}
	}
`;

// Approve edit control request from chat
export const APPROVE_EDIT_CONTROL_FROM_CHAT = gql`
	mutation ApproveEditControlFromChat(
		$messageId: uuid!
		$postId: uuid!
		$newEditorId: uuid!
		$previousEditorId: uuid!
		$now: timestamptz!
	) {
		# Release previous editor's lock
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $previousEditorId } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}

		# Grant lock to requester
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $newEditorId } }
			_set: { has_edit_lock: true, edit_lock_acquired_at: $now }
		) {
			affected_rows
		}

		# Update post's current editor
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: $newEditorId, edit_locked_at: $now }
		) {
			id
			current_editor_id
			edit_locked_at
		}

		# Update message to mark as approved
		update_collaboration_message_by_pk(
			pk_columns: { id: $messageId }
			_set: { metadata: { status: "approved" } }
		) {
			id
			metadata
		}
	}
`;

// Deny edit control request from chat
export const DENY_EDIT_CONTROL_FROM_CHAT = gql`
	mutation DenyEditControlFromChat($messageId: uuid!, $denialMessage: String) {
		update_collaboration_message_by_pk(
			pk_columns: { id: $messageId }
			_set: { metadata: { status: "denied", denial_message: $denialMessage } }
		) {
			id
			metadata
		}
	}
`;

// Delete (soft delete) a collaboration message
export const DELETE_COLLABORATION_MESSAGE = gql`
	mutation DeleteCollaborationMessage($messageId: uuid!) {
		update_collaboration_message_by_pk(
			pk_columns: { id: $messageId }
			_set: { deleted_at: "now()" }
		) {
			id
			deleted_at
		}
	}
`;
