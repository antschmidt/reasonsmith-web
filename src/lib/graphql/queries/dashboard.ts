import { gql } from '@apollo/client/core';
import { CONTRIBUTOR_FIELDS } from '../fragments';

// ============================================
// Dashboard Queries
// ============================================

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
