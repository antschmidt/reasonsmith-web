import { gql } from '@apollo/client/core';

// ============================================
// Saved Items Queries
// ============================================

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

// ============================================
// Saved Items Mutations
// ============================================

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
