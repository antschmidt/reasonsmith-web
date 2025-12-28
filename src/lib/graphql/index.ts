// ============================================
// GraphQL Module Index
// Re-exports all fragments, queries, and mutations for backward compatibility
// ============================================

// Re-export all fragments
export {
	CONTRIBUTOR_FIELDS,
	POST_FIELDS,
	DISCUSSION_VERSION_FIELDS,
	CITATION_FIELDS,
	NOTIFICATION_FIELDS,
	EDITORS_DESK_PICK_FIELDS,
	EDITORS_DESK_PICK_FIELDS_EXTENDED,
	PUBLIC_SHOWCASE_ITEM_FIELDS,
	SECURITY_KEY_FIELDS,
	ACHIEVEMENT_FIELDS,
	CONTRIBUTOR_ACHIEVEMENT_FIELDS,
	XP_ACTIVITY_FIELDS,
	COLLABORATION_MESSAGE_FIELDS,
	EVENT_FIELDS
} from './fragments';

// Re-export all queries and mutations
export * from './queries';
