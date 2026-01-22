import { gql } from '@apollo/client/core';
import {
	PUBLIC_SHOWCASE_ITEM_FIELDS,
	PUBLIC_SHOWCASE_ITEM_ADMIN_FIELDS,
	CONTRIBUTOR_FIELDS,
	DISCUSSION_VERSION_FIELDS
} from '../fragments';

// ============================================
// Public Showcase Queries
// ============================================

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
			...PublicShowcaseItemAdminFields
		}
	}
	${PUBLIC_SHOWCASE_ITEM_ADMIN_FIELDS}
`;

// ============================================
// Public Showcase Mutations
// ============================================

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

// ============================================
// Showcase Item Discussions
// ============================================

export const GET_SHOWCASE_ITEM_DISCUSSIONS = gql`
	query GetShowcaseItemDiscussions($showcaseItemId: uuid!) {
		discussion(
			where: { showcase_item_id: { _eq: $showcaseItemId }, status: { _eq: "published" } }
			order_by: { created_at: desc }
		) {
			id
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
