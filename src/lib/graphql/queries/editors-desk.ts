import { gql } from '@apollo/client/core';
import { EDITORS_DESK_PICK_FIELDS, EDITORS_DESK_PICK_FIELDS_EXTENDED } from '../fragments';

// ============================================
// Editors Desk Queries
// ============================================

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

// ============================================
// Editors Desk Mutations
// ============================================

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

export const UPDATE_EDITORS_DESK_PICK_STATUS = gql`
	mutation UpdateEditorsDeskPickStatus($id: uuid!, $status: editors_desk_status_enum!) {
		update_editors_desk_pick_by_pk(pk_columns: { id: $id }, _set: { status: $status }) {
			id
			status
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
