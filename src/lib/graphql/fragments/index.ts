import { gql } from '@apollo/client/core';

// ============================================
// Core Entity Fragments
// ============================================

export const CONTRIBUTOR_FIELDS = gql`
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
		total_xp
		current_level
		steelman_count
		steelman_quality_avg
		synthesis_count
		acknowledgment_count
		positions_changed_count
		clarifying_questions_count
		minds_opened_count
		interests
	}
`;

export const POST_FIELDS = gql`
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
		steelman_score
		steelman_quality_notes
		understanding_score
		intellectual_humility_score
		contributor {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const DISCUSSION_VERSION_FIELDS = gql`
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
		import_source
		import_url
		import_content
		import_author
		import_date
		created_at
		created_by
	}
`;

// ============================================
// Citation Fragments
// ============================================

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

// ============================================
// Notification Fragments
// ============================================

export const NOTIFICATION_FIELDS = gql`
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

// ============================================
// Editors Desk Fragments
// ============================================

export const EDITORS_DESK_PICK_FIELDS = gql`
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

export const EDITORS_DESK_PICK_FIELDS_EXTENDED = gql`
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

// ============================================
// Public Showcase Fragments
// ============================================

export const PUBLIC_SHOWCASE_ITEM_FIELDS = gql`
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
		hide_fact_checking
		created_at
	}
`;

// Admin version includes source_content for editing
export const PUBLIC_SHOWCASE_ITEM_ADMIN_FIELDS = gql`
	fragment PublicShowcaseItemAdminFields on public_showcase_item {
		id
		title
		subtitle
		media_type
		creator
		source_url
		source_content
		summary
		analysis
		tags
		display_order
		published
		hide_fact_checking
		analyst_notes
		created_at
		updated_at
	}
`;

// ============================================
// Security Key Fragments
// ============================================

export const SECURITY_KEY_FIELDS = gql`
	fragment SecurityKeyFields on authUserSecurityKeys {
		id
		credentialId
		userId
		nickname
	}
`;

// ============================================
// Growth & Gamification Fragments
// ============================================

export const ACHIEVEMENT_FIELDS = gql`
	fragment AchievementFields on achievement {
		id
		key
		name
		description
		category
		tier
		requirement_type
		requirement_value
		icon_name
		created_at
	}
`;

export const CONTRIBUTOR_ACHIEVEMENT_FIELDS = gql`
	fragment ContributorAchievementFields on contributor_achievement {
		id
		contributor_id
		achievement_id
		earned_at
		achievement {
			...AchievementFields
		}
	}
	${ACHIEVEMENT_FIELDS}
`;

export const XP_ACTIVITY_FIELDS = gql`
	fragment XPActivityFields on xp_activity {
		id
		contributor_id
		activity_type
		xp_earned
		related_post_id
		related_discussion_id
		notes
		created_at
	}
`;

// ============================================
// Collaboration Fragments
// ============================================

export const COLLABORATION_MESSAGE_FIELDS = gql`
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

// ============================================
// Event Fragments
// ============================================

export const EVENT_FIELDS = gql`
	fragment EventFields on event {
		id
		post_id
		title
		description
		start_time
		end_time
		timezone
		meeting_link
		location
		created_by
		created_at
		updated_at
		creator {
			id
			handle
			display_name
			avatar_url
		}
		attendees {
			id
			contributor_id
			rsvp_status
			created_at
			contributor {
				id
				handle
				display_name
				avatar_url
			}
		}
	}
`;
