import { gql } from '@apollo/client/core';

// ============================================
// Follow System - Queries
// ============================================

export const GET_MY_FOLLOWING = gql`
	query GetMyFollowing($userId: uuid!) {
		follow(
			where: { follower_id: { _eq: $userId }, status: { _eq: "active" } }
			order_by: { created_at: desc }
		) {
			id
			following_id
			created_at
			following {
				id
				display_name
				handle
				avatar_url
			}
		}
	}
`;

export const GET_MY_FOLLOWERS = gql`
	query GetMyFollowers($userId: uuid!) {
		follow(
			where: { following_id: { _eq: $userId }, status: { _eq: "active" } }
			order_by: { created_at: desc }
		) {
			id
			follower_id
			created_at
			follower {
				id
				display_name
				handle
				avatar_url
			}
		}
	}
`;

export const GET_PENDING_FOLLOW_REQUESTS = gql`
	query GetPendingFollowRequests($userId: uuid!) {
		follow(
			where: { following_id: { _eq: $userId }, status: { _eq: "pending" } }
			order_by: { created_at: desc }
		) {
			id
			follower_id
			created_at
			follower {
				id
				display_name
				handle
				avatar_url
			}
		}
	}
`;

export const CHECK_FOLLOW_STATUS = gql`
	query CheckFollowStatus($followerId: uuid!, $followingId: uuid!) {
		follow(where: { follower_id: { _eq: $followerId }, following_id: { _eq: $followingId } }) {
			id
			status
		}
	}
`;

export const CHECK_USER_REQUIRES_FOLLOW_APPROVAL = gql`
	query CheckUserRequiresFollowApproval($userId: uuid!) {
		contributor_by_pk(id: $userId) {
			require_follow_approval
		}
	}
`;

// ============================================
// Follow System - Mutations
// ============================================

export const FOLLOW_USER = gql`
	mutation FollowUser($followerId: uuid!, $followingId: uuid!, $status: String!) {
		insert_follow_one(
			object: { follower_id: $followerId, following_id: $followingId, status: $status }
			on_conflict: { constraint: follow_unique, update_columns: [status] }
		) {
			id
			status
			created_at
		}
	}
`;

export const UNFOLLOW_USER = gql`
	mutation UnfollowUser($followerId: uuid!, $followingId: uuid!) {
		delete_follow(
			where: { follower_id: { _eq: $followerId }, following_id: { _eq: $followingId } }
		) {
			affected_rows
		}
	}
`;

export const APPROVE_FOLLOWER = gql`
	mutation ApproveFollower($followId: uuid!) {
		update_follow_by_pk(
			pk_columns: { id: $followId }
			_set: { status: "active", approved_at: "now()" }
		) {
			id
			status
			approved_at
		}
	}
`;

export const REJECT_FOLLOWER = gql`
	mutation RejectFollower($followId: uuid!) {
		delete_follow_by_pk(id: $followId) {
			id
		}
	}
`;

export const UPDATE_FOLLOW_SETTINGS = gql`
	mutation UpdateFollowSettings($userId: uuid!, $requireApproval: Boolean!) {
		update_contributor_by_pk(
			pk_columns: { id: $userId }
			_set: { require_follow_approval: $requireApproval }
		) {
			id
			require_follow_approval
		}
	}
`;

// ============================================
// Collaboration Contacts - Queries
// ============================================

export const GET_MY_CONTACTS = gql`
	query GetMyContacts($userId: uuid!) {
		collaboration_contact(
			where: {
				status: { _eq: "accepted" }
				_or: [{ requester_id: { _eq: $userId } }, { target_id: { _eq: $userId } }]
			}
			order_by: { responded_at: desc }
		) {
			id
			requester_id
			target_id
			responded_at
			requester {
				id
				display_name
				handle
				avatar_url
			}
			target {
				id
				display_name
				handle
				avatar_url
			}
		}
	}
`;

export const GET_PENDING_CONTACT_REQUESTS = gql`
	query GetPendingContactRequests($userId: uuid!) {
		incoming: collaboration_contact(
			where: { target_id: { _eq: $userId }, status: { _eq: "pending" } }
			order_by: { created_at: desc }
		) {
			id
			requester_id
			request_note
			created_at
			requester {
				id
				display_name
				handle
				avatar_url
			}
		}
		outgoing: collaboration_contact(
			where: { requester_id: { _eq: $userId }, status: { _eq: "pending" } }
			order_by: { created_at: desc }
		) {
			id
			target_id
			request_note
			created_at
			target {
				id
				display_name
				handle
				avatar_url
			}
		}
	}
`;

export const CHECK_CONTACT_STATUS = gql`
	query CheckContactStatus($userId: uuid!, $otherUserId: uuid!) {
		collaboration_contact(
			where: {
				_or: [
					{ requester_id: { _eq: $userId }, target_id: { _eq: $otherUserId } }
					{ requester_id: { _eq: $otherUserId }, target_id: { _eq: $userId } }
				]
			}
		) {
			id
			status
			requester_id
			cooldown_until
		}
	}
`;

export const GET_CONTACTS_FOR_COLLABORATION = gql`
	query GetContactsForCollaboration($userId: uuid!, $searchTerm: String!) {
		contacts: collaboration_contact(
			where: {
				status: { _eq: "accepted" }
				_or: [{ requester_id: { _eq: $userId } }, { target_id: { _eq: $userId } }]
			}
		) {
			requester {
				id
				display_name
				handle
				avatar_url
			}
			target {
				id
				display_name
				handle
				avatar_url
			}
		}
		all_users: contributor(
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

// ============================================
// Collaboration Contacts - Mutations
// ============================================

export const SEND_CONTACT_REQUEST = gql`
	mutation SendContactRequest($requesterId: uuid!, $targetId: uuid!, $requestNote: String) {
		insert_collaboration_contact_one(
			object: {
				requester_id: $requesterId
				target_id: $targetId
				request_note: $requestNote
				status: "pending"
			}
		) {
			id
			status
			created_at
		}
	}
`;

export const RESPOND_TO_CONTACT_REQUEST = gql`
	mutation RespondToContactRequest(
		$contactId: uuid!
		$status: String!
		$cooldownUntil: timestamptz
	) {
		update_collaboration_contact_by_pk(
			pk_columns: { id: $contactId }
			_set: { status: $status, responded_at: "now()", cooldown_until: $cooldownUntil }
		) {
			id
			status
			responded_at
			cooldown_until
		}
	}
`;

export const REMOVE_CONTACT = gql`
	mutation RemoveContact($contactId: uuid!) {
		delete_collaboration_contact_by_pk(id: $contactId) {
			id
		}
	}
`;

// ============================================
// Blocking - Queries
// ============================================

export const GET_MY_BLOCKS = gql`
	query GetMyBlocks($userId: uuid!) {
		user_block(where: { blocker_id: { _eq: $userId } }, order_by: { created_at: desc }) {
			id
			blocked_id
			block_collaboration_requests
			block_following
			created_at
			blocked {
				id
				display_name
				handle
				avatar_url
			}
		}
	}
`;

export const CHECK_BLOCK_STATUS = gql`
	query CheckBlockStatus($userId: uuid!, $otherUserId: uuid!) {
		my_block: user_block(
			where: { blocker_id: { _eq: $userId }, blocked_id: { _eq: $otherUserId } }
		) {
			id
			block_collaboration_requests
			block_following
		}
		their_block: user_block(
			where: { blocker_id: { _eq: $otherUserId }, blocked_id: { _eq: $userId } }
		) {
			block_collaboration_requests
			block_following
		}
	}
`;

// ============================================
// Blocking - Mutations
// ============================================

export const BLOCK_USER = gql`
	mutation BlockUser(
		$blockerId: uuid!
		$blockedId: uuid!
		$blockCollaboration: Boolean!
		$blockFollowing: Boolean!
	) {
		insert_user_block_one(
			object: {
				blocker_id: $blockerId
				blocked_id: $blockedId
				block_collaboration_requests: $blockCollaboration
				block_following: $blockFollowing
			}
			on_conflict: {
				constraint: block_unique
				update_columns: [block_collaboration_requests, block_following]
			}
		) {
			id
			block_collaboration_requests
			block_following
		}
	}
`;

export const UNBLOCK_USER = gql`
	mutation UnblockUser($blockerId: uuid!, $blockedId: uuid!) {
		delete_user_block(where: { blocker_id: { _eq: $blockerId }, blocked_id: { _eq: $blockedId } }) {
			affected_rows
		}
	}
`;

export const UPDATE_BLOCK_SETTINGS = gql`
	mutation UpdateBlockSettings(
		$blockerId: uuid!
		$blockedId: uuid!
		$blockCollaboration: Boolean!
		$blockFollowing: Boolean!
	) {
		update_user_block(
			where: { blocker_id: { _eq: $blockerId }, blocked_id: { _eq: $blockedId } }
			_set: { block_collaboration_requests: $blockCollaboration, block_following: $blockFollowing }
		) {
			affected_rows
			returning {
				id
				block_collaboration_requests
				block_following
			}
		}
	}
`;

// ============================================
// Networking Dashboard Data
// ============================================

export const GET_NETWORKING_DATA = gql`
	query GetNetworkingData($userId: uuid!) {
		pendingContactRequests: collaboration_contact(
			where: { target_id: { _eq: $userId }, status: { _eq: "pending" } }
		) {
			id
			requester_id
			request_note
			created_at
			requester {
				id
				display_name
				handle
				avatar_url
			}
		}
		pendingFollowRequests: follow(
			where: { following_id: { _eq: $userId }, status: { _eq: "pending" } }
		) {
			id
			follower_id
			created_at
			follower {
				id
				display_name
				handle
				avatar_url
			}
		}
		contacts: collaboration_contact(
			where: {
				status: { _eq: "accepted" }
				_or: [{ requester_id: { _eq: $userId } }, { target_id: { _eq: $userId } }]
			}
		) {
			id
			requester_id
			target_id
			requester {
				id
				display_name
				handle
				avatar_url
			}
			target {
				id
				display_name
				handle
				avatar_url
			}
		}
	}
`;
