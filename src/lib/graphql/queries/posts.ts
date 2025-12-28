import { gql } from '@apollo/client/core';

// ============================================
// Post Queries
// ============================================

export const CHECK_POST_DELETABLE = gql`
	query CheckPostDeletable(
		$authorId: uuid!
		$discussionId: uuid!
		$postCreatedAt: timestamptz!
		$postIdString: String!
	) {
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

// ============================================
// Post Mutations - Draft Creation
// ============================================

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

// ============================================
// Post Mutations - Draft Updates
// ============================================

export const UPDATE_POST_DRAFT = gql`
	mutation UpdatePostDraft($postId: uuid!, $draftContent: String!) {
		update_post_by_pk(pk_columns: { id: $postId }, _set: { draft_content: $draftContent }) {
			id
		}
	}
`;

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

// ============================================
// Post Mutations - Publishing
// ============================================

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

// ============================================
// Post Mutations - Good Faith & Scoring
// ============================================

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

export const UPDATE_POST_STEELMAN_SCORES = gql`
	mutation UpdatePostSteelmanScores(
		$postId: uuid!
		$steelmanScore: numeric
		$steelmanNotes: String
		$understandingScore: numeric
		$intellectualHumilityScore: numeric
	) {
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: {
				steelman_score: $steelmanScore
				steelman_quality_notes: $steelmanNotes
				understanding_score: $understandingScore
				intellectual_humility_score: $intellectualHumilityScore
			}
		) {
			id
			steelman_score
			steelman_quality_notes
			understanding_score
			intellectual_humility_score
		}
	}
`;

// ============================================
// Post Mutations - Delete & Anonymize
// ============================================

export const DELETE_POST = gql`
	mutation DeletePost($postId: uuid!) {
		delete_post_by_pk(id: $postId) {
			id
		}
	}
`;

export const ANONYMIZE_POST = gql`
	mutation AnonymizePost($postId: uuid!) {
		update_post_by_pk(pk_columns: { id: $postId }, _set: { is_anonymous: true }) {
			id
			is_anonymous
		}
	}
`;

export const UNANONYMIZE_POST = gql`
	mutation UnanonymizePost($postId: uuid!) {
		update_post_by_pk(pk_columns: { id: $postId }, _set: { is_anonymous: false }) {
			id
			is_anonymous
		}
	}
`;
