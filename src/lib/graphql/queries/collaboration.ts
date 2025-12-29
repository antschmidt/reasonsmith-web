import { gql } from '@apollo/client/core';
import { COLLABORATION_MESSAGE_FIELDS } from '../fragments';

// ============================================
// Post Collaboration Queries
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
// Collaboration Invite Mutations
// ============================================

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

export const REINVITE_COLLABORATOR = gql`
	mutation ReinviteCollaborator(
		$collaboratorId: uuid!
		$role: String!
		$invitedBy: uuid!
		$now: timestamptz!
	) {
		update_post_collaborator_by_pk(
			pk_columns: { id: $collaboratorId }
			_set: { status: "pending", role: $role, invited_by: $invitedBy, invited_at: $now }
		) {
			id
			status
			role
			invited_at
		}
	}
`;

export const ACCEPT_COLLABORATION_INVITE = gql`
	mutation AcceptCollaborationInvite($collaboratorId: uuid!, $notificationId: uuid!) {
		update_post_collaborator_by_pk(
			pk_columns: { id: $collaboratorId }
			_set: { status: "accepted" }
		) {
			id
			status
			post_id
		}
		delete_notification_by_pk(id: $notificationId) {
			id
		}
	}
`;

export const DECLINE_COLLABORATION_INVITE = gql`
	mutation DeclineCollaborationInvite($collaboratorId: uuid!, $notificationId: uuid!) {
		delete_post_collaborator_by_pk(id: $collaboratorId) {
			id
		}
		delete_notification_by_pk(id: $notificationId) {
			id
		}
	}
`;

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

// ============================================
// Edit Lock System
// ============================================

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

export const ACQUIRE_EDIT_LOCK = gql`
	mutation AcquireEditLock($postId: uuid!, $userId: uuid!, $now: timestamptz!) {
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: $userId, edit_locked_at: $now }
		) {
			id
			current_editor_id
			edit_locked_at
			collaboration_enabled
		}
		set_collaborator_lock: update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $userId } }
			_set: { has_edit_lock: true, edit_lock_acquired_at: $now }
		) {
			affected_rows
		}
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
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: null, edit_locked_at: null }
		) {
			id
			current_editor_id
			edit_locked_at
			collaboration_enabled
		}
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
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { collaboration_enabled: $enabled, current_editor_id: null, edit_locked_at: null }
		) {
			id
			collaboration_enabled
			current_editor_id
			edit_locked_at
		}
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, has_edit_lock: { _eq: true } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}
	}
`;

export const FORCE_RECLAIM_EDIT_LOCK = gql`
	mutation ForceReclaimEditLock($postId: uuid!, $fromUserId: uuid!) {
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $fromUserId } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}
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
// Edit Control Requests
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
		delete_notification(
			where: {
				type: { _eq: "edit_control_request" }
				post_id: { _eq: $postId }
				actor_id: { _eq: $requesterId }
			}
		) {
			affected_rows
		}
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
		releaseLock: update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $previousEditorId } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}
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
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: $newEditorId, edit_locked_at: $now }
		) {
			id
			current_editor_id
			edit_locked_at
		}
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

// ============================================
// Role Upgrade Requests
// ============================================

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
		update_post_collaborator_by_pk(pk_columns: { id: $collaboratorId }, _set: { role: $newRole }) {
			id
			role
		}
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
// Collaboration Sessions
// ============================================

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

// ============================================
// Collaboration Subscriptions
// ============================================

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
// Collaboration Chat
// ============================================

export const GET_USER_COLLABORATION_CHATS = gql`
	${COLLABORATION_MESSAGE_FIELDS}
	query GetUserCollaborationChats($userId: uuid!) {
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

export const APPROVE_EDIT_CONTROL_FROM_CHAT = gql`
	mutation ApproveEditControlFromChat(
		$messageId: uuid!
		$postId: uuid!
		$newEditorId: uuid!
		$previousEditorId: uuid!
		$now: timestamptz!
	) {
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $previousEditorId } }
			_set: { has_edit_lock: false, edit_lock_acquired_at: null }
		) {
			affected_rows
		}
		update_post_collaborator(
			where: { post_id: { _eq: $postId }, contributor_id: { _eq: $newEditorId } }
			_set: { has_edit_lock: true, edit_lock_acquired_at: $now }
		) {
			affected_rows
		}
		update_post_by_pk(
			pk_columns: { id: $postId }
			_set: { current_editor_id: $newEditorId, edit_locked_at: $now }
		) {
			id
			current_editor_id
			edit_locked_at
		}
		update_collaboration_message_by_pk(
			pk_columns: { id: $messageId }
			_set: { metadata: { status: "approved" } }
		) {
			id
			metadata
		}
	}
`;

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
