<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import {
		GET_NOTIFICATIONS,
		GET_UNREAD_NOTIFICATION_COUNT,
		GET_USER_COLLABORATION_CHATS,
		GET_TOTAL_COLLABORATION_UNREAD_COUNT,
		MARK_NOTIFICATION_AS_READ,
		MARK_ALL_NOTIFICATIONS_AS_READ,
		DELETE_NOTIFICATION,
		APPROVE_EDIT_CONTROL_REQUEST,
		DENY_EDIT_CONTROL_REQUEST,
		APPROVE_ROLE_UPGRADE_REQUEST,
		DENY_ROLE_UPGRADE_REQUEST,
		ACCEPT_COLLABORATION_INVITE,
		DECLINE_COLLABORATION_INVITE
	} from '$lib/graphql/queries';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import CollaborationChatList from './CollaborationChatList.svelte';
	import CollaborationChatThread from './CollaborationChatThread.svelte';

	let { userId } = $props<{ userId: string }>();

	type Notification = {
		id: string;
		type: string;
		discussion_id: string;
		post_id: string | null;
		actor_id: string | null;
		read: boolean;
		created_at: string;
		metadata?: any;
		discussion: {
			discussion_versions: Array<{ title: string }>;
		};
		post: {
			content: string;
			post_collaborators?: Array<{
				id: string;
				contributor_id: string;
				role: string;
			}>;
		} | null;
	};

	type ChatSummary = {
		postId: string;
		discussionId: string;
		discussionTitle: string;
		collaborators: Array<{
			id: string;
			display_name: string;
			handle: string | null;
			avatar_url: string | null;
		}>;
		lastMessage: {
			content: string;
			sender_name: string;
			created_at: string;
		} | null;
		unreadCount: number;
	};

	let notifications = $state<Array<Notification>>([]);
	let notificationUnreadCount = $state(0);
	let chats = $state<Array<ChatSummary>>([]);
	let chatUnreadCount = $state(0);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let processingNotificationId = $state<string | null>(null);

	// Tab state: 'messages' or 'notifications'
	let activeTab = $state<'messages' | 'notifications'>('notifications');

	// View state: 'list' (showing chat list) or 'thread' (showing conversation)
	let viewMode = $state<'list' | 'thread'>('list');
	let selectedChat = $state<ChatSummary | null>(null);

	async function loadNotifications() {
		try {
			const session = nhost.getUserSession();
			if (!session || !session.user) {
				return;
			}

			await nhost.auth.isAuthenticatedAsync();

			const [notifResult, countResult] = await Promise.all([
				nhost.graphql.request(GET_NOTIFICATIONS, { userId }),
				nhost.graphql.request(GET_UNREAD_NOTIFICATION_COUNT, { userId })
			]);

			if (notifResult.error) {
				const errorMsg = Array.isArray(notifResult.error)
					? notifResult.error[0]?.message || ''
					: notifResult.error.message || '';

				if (errorMsg.includes('JWT') || errorMsg.includes('JWTExpired')) {
					return;
				}

				error = 'Failed to load notifications';
			} else if (notifResult.data) {
				notifications = notifResult.data.notification || [];
			}

			if (countResult.data) {
				notificationUnreadCount = countResult.data.notification_aggregate?.aggregate?.count || 0;
			}
		} catch (err) {
			console.error('Error loading notifications:', err);
		}
	}

	async function loadChats() {
		try {
			const session = nhost.getUserSession();
			if (!session || !session.user) {
				return;
			}

			const [chatsResult, unreadResult] = await Promise.all([
				nhost.graphql.request(GET_USER_COLLABORATION_CHATS, { userId }),
				nhost.graphql.request(GET_TOTAL_COLLABORATION_UNREAD_COUNT, { userId })
			]);

			if (chatsResult.data) {
				const authorPosts = chatsResult.data.author_posts || [];
				const collaboratorPosts = (chatsResult.data.collaborator_posts || []).map(
					(pc: any) => pc.post
				);

				const allPosts = [...authorPosts, ...collaboratorPosts];

				chats = allPosts.map((post: any) => {
					const discussionTitle =
						post.discussion?.discussion_versions?.[0]?.title || 'Untitled Discussion';
					const lastMsg = post.collaboration_messages?.[0];

					return {
						postId: post.id,
						discussionId: post.discussion_id,
						discussionTitle,
						collaborators: [...post.post_collaborators.map((pc: any) => pc.contributor)],
						lastMessage: lastMsg
							? {
									content: lastMsg.content,
									sender_name: lastMsg.sender.display_name,
									created_at: lastMsg.created_at
								}
							: null,
						unreadCount: post.unread_count?.aggregate?.count || 0
					};
				});
			}

			if (unreadResult.data) {
				chatUnreadCount = unreadResult.data.collaboration_message_aggregate?.aggregate?.count || 0;
			}
		} catch (err) {
			console.error('Error loading chats:', err);
		}
	}

	async function loadAll() {
		loading = true;
		error = null;

		try {
			await Promise.all([loadNotifications(), loadChats()]);
		} catch (err) {
			error = 'Failed to load messages';
			console.error('Error loading:', err);
		} finally {
			loading = false;
		}
	}

	async function markNotificationAsRead(notificationId: string) {
		try {
			const result = await nhost.graphql.request(MARK_NOTIFICATION_AS_READ, {
				notificationId
			});

			if (!result.error) {
				notifications = notifications.map((n) =>
					n.id === notificationId ? { ...n, read: true } : n
				);
				notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
			}
		} catch (err) {
			console.error('Error marking notification as read:', err);
		}
	}

	async function markAllNotificationsAsRead() {
		try {
			const result = await nhost.graphql.request(MARK_ALL_NOTIFICATIONS_AS_READ, { userId });

			if (!result.error) {
				notifications = notifications.map((n) => ({ ...n, read: true }));
				notificationUnreadCount = 0;
			}
		} catch (err) {
			console.error('Error marking all notifications as read:', err);
		}
	}

	async function deleteNotification(notificationId: string, event: Event) {
		event.stopPropagation();

		try {
			const wasUnread = notifications.find((n) => n.id === notificationId && !n.read);

			const result = await nhost.graphql.request(DELETE_NOTIFICATION, {
				notificationId
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notificationId);
				if (wasUnread) {
					notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
				}
			}
		} catch (err) {
			console.error('Error deleting notification:', err);
		}
	}

	function handleSelectChat(chat: ChatSummary) {
		selectedChat = chat;
		viewMode = 'thread';
	}

	function handleBackToList() {
		viewMode = 'list';
		selectedChat = null;
		loadChats();
	}

	function getNotificationMessage(notification: Notification): string {
		const discussionTitle =
			notification.discussion?.discussion_versions?.[0]?.title || 'a discussion';

		switch (notification.type) {
			case 'new_comment_on_my_discussion':
				return `New comment on your discussion "${discussionTitle}"`;
			case 'new_comment_on_participated_discussion':
				return `New comment on "${discussionTitle}"`;
			case 'reply_to_my_comment':
				return `New reply to your comment in "${discussionTitle}"`;
			case 'collaboration_invite':
				return `You've been invited to collaborate on "${notification.metadata?.discussion_title || discussionTitle}" as ${notification.metadata?.role || 'editor'}`;
			case 'edit_control_request':
				const isForAuthor = notification.metadata?.current_holder_id !== userId;
				if (isForAuthor) {
					return `Edit control request for "${notification.metadata?.discussion_title || discussionTitle}"`;
				} else {
					return `Someone is requesting edit control`;
				}
			case 'role_upgrade_request':
				return `Role upgrade request for "${notification.metadata?.discussion_title || discussionTitle}"`;
			case 'editors_desk_approval_request':
				return `Your discussion "${discussionTitle}" has been submitted for editorial review`;
			case 'editors_desk_approved':
				return `Your discussion "${discussionTitle}" has been featured on the Editors' Desk!`;
			case 'editors_desk_rejected':
				return `Your discussion "${discussionTitle}" was not selected for featuring`;
			default:
				return `New activity on "${discussionTitle}"`;
		}
	}

	function formatTimeAgo(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (seconds < 60) return 'just now';
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
		if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
		return date.toLocaleDateString();
	}

	function isActionableNotification(notification: Notification): boolean {
		return (
			notification.type === 'edit_control_request' ||
			notification.type === 'role_upgrade_request' ||
			notification.type === 'collaboration_invite'
		);
	}

	async function handleNotificationClick(notification: Notification) {
		if (!notification.read) {
			markNotificationAsRead(notification.id);
		}

		if (isActionableNotification(notification)) {
			await goto('/');
		} else {
			const url = `/discussions/${notification.discussion_id}${
				notification.post_id ? `#post-${notification.post_id}` : ''
			}`;
			await goto(url);
		}
	}

	async function handleApproveEditControl(notification: Notification, event: Event) {
		event.stopPropagation();
		processingNotificationId = notification.id;

		try {
			const result = await nhost.graphql.request(APPROVE_EDIT_CONTROL_REQUEST, {
				notificationId: notification.id,
				postId: notification.metadata?.post_id
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
			}
		} catch (err) {
			console.error('Error approving edit control request:', err);
		} finally {
			processingNotificationId = null;
		}
	}

	async function handleDenyEditControl(notification: Notification, event: Event) {
		event.stopPropagation();
		processingNotificationId = notification.id;

		try {
			const result = await nhost.graphql.request(DENY_EDIT_CONTROL_REQUEST, {
				notificationId: notification.id
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
			}
		} catch (err) {
			console.error('Error denying edit control request:', err);
		} finally {
			processingNotificationId = null;
		}
	}

	async function handleApproveRoleUpgrade(notification: Notification, event: Event) {
		event.stopPropagation();
		processingNotificationId = notification.id;

		try {
			const result = await nhost.graphql.request(APPROVE_ROLE_UPGRADE_REQUEST, {
				notificationId: notification.id,
				postId: notification.metadata?.post_id,
				contributorId: notification.metadata?.requester_id,
				newRole: notification.metadata?.requested_role
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
			}
		} catch (err) {
			console.error('Error approving role upgrade request:', err);
		} finally {
			processingNotificationId = null;
		}
	}

	async function handleDenyRoleUpgrade(notification: Notification, event: Event) {
		event.stopPropagation();
		processingNotificationId = notification.id;

		try {
			const result = await nhost.graphql.request(DENY_ROLE_UPGRADE_REQUEST, {
				notificationId: notification.id
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
			}
		} catch (err) {
			console.error('Error denying role upgrade request:', err);
		} finally {
			processingNotificationId = null;
		}
	}

	async function handleAcceptCollaborationInvite(notification: Notification, event: Event) {
		event.stopPropagation();
		processingNotificationId = notification.id;

		try {
			const collaboratorId = notification.post?.post_collaborators?.find(
				(pc) => pc.contributor_id === userId
			)?.id;

			if (!collaboratorId) {
				console.error('Could not find collaborator record');
				return;
			}

			const result = await nhost.graphql.request(ACCEPT_COLLABORATION_INVITE, {
				collaboratorId,
				notificationId: notification.id
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
			}
		} catch (err) {
			console.error('Error accepting collaboration invite:', err);
		} finally {
			processingNotificationId = null;
		}
	}

	async function handleDeclineCollaborationInvite(notification: Notification, event: Event) {
		event.stopPropagation();
		processingNotificationId = notification.id;

		try {
			const collaboratorId = notification.post?.post_collaborators?.find(
				(pc) => pc.contributor_id === userId
			)?.id;

			if (!collaboratorId) {
				console.error('Could not find collaborator record');
				return;
			}

			const result = await nhost.graphql.request(DECLINE_COLLABORATION_INVITE, {
				collaboratorId,
				notificationId: notification.id
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
			}
		} catch (err) {
			console.error('Error declining collaboration invite:', err);
		} finally {
			processingNotificationId = null;
		}
	}

	onMount(() => {
		loadAll();

		// Poll for updates every 30 seconds
		const interval = setInterval(loadAll, 30000);
		return () => clearInterval(interval);
	});
</script>

<section class="dashboard-notifications-panel">
	<!-- Tabs Header -->
	<div class="tabs-header">
		<button
			type="button"
			class="tab-button"
			class:active={activeTab === 'notifications'}
			onclick={() => {
				activeTab = 'notifications';
			}}
		>
			Notifications
			{#if notificationUnreadCount > 0}
				<span class="tab-badge">{notificationUnreadCount}</span>
			{/if}
		</button>
		<button
			type="button"
			class="tab-button"
			class:active={activeTab === 'messages'}
			onclick={() => {
				activeTab = 'messages';
				viewMode = 'list';
				selectedChat = null;
			}}
		>
			Messages
			{#if chatUnreadCount > 0}
				<span class="tab-badge">{chatUnreadCount}</span>
			{/if}
		</button>
	</div>

	<!-- Tab Content -->
	<div class="tab-content">
		{#if activeTab === 'notifications'}
			<!-- Notifications Tab -->
			<div class="notifications-content">
				<div class="notifications-header">
					{#if notifications.length > 0 && notificationUnreadCount > 0}
						<button type="button" class="action-btn" onclick={markAllNotificationsAsRead}>
							Mark all read
						</button>
					{/if}
				</div>

				<div class="notifications-list">
					{#if loading}
						<div class="loading-state">Loading notifications...</div>
					{:else if error}
						<div class="error-state">{error}</div>
					{:else if notifications.length === 0}
						<div class="empty-state">
							<p>No notifications</p>
						</div>
					{:else}
						{#each notifications as notification}
							<button
								type="button"
								class="notification-item"
								class:unread={!notification.read}
								onclick={() => handleNotificationClick(notification)}
							>
								<div class="notification-content">
									<p class="notification-message">
										{getNotificationMessage(notification)}
									</p>
									<span class="notification-time">{formatTimeAgo(notification.created_at)}</span>
								</div>

								{#if notification.type === 'edit_control_request'}
									<div class="notification-actions">
										<button
											type="button"
											class="action-btn approve"
											onclick={(e) => handleApproveEditControl(notification, e)}
											disabled={processingNotificationId === notification.id}
										>
											Approve
										</button>
										<button
											type="button"
											class="action-btn deny"
											onclick={(e) => handleDenyEditControl(notification, e)}
											disabled={processingNotificationId === notification.id}
										>
											Deny
										</button>
									</div>
								{:else if notification.type === 'role_upgrade_request'}
									<div class="notification-actions">
										<button
											type="button"
											class="action-btn approve"
											onclick={(e) => handleApproveRoleUpgrade(notification, e)}
											disabled={processingNotificationId === notification.id}
										>
											Approve
										</button>
										<button
											type="button"
											class="action-btn deny"
											onclick={(e) => handleDenyRoleUpgrade(notification, e)}
											disabled={processingNotificationId === notification.id}
										>
											Deny
										</button>
									</div>
								{:else if notification.type === 'collaboration_invite'}
									<div class="notification-actions">
										<button
											type="button"
											class="action-btn approve"
											onclick={(e) => handleAcceptCollaborationInvite(notification, e)}
											disabled={processingNotificationId === notification.id}
										>
											Accept
										</button>
										<button
											type="button"
											class="action-btn deny"
											onclick={(e) => handleDeclineCollaborationInvite(notification, e)}
											disabled={processingNotificationId === notification.id}
										>
											Decline
										</button>
									</div>
								{:else}
									<button
										type="button"
										class="delete-btn"
										onclick={(e) => deleteNotification(notification.id, e)}
										aria-label="Delete notification"
									>
										×
									</button>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{:else}
			<!-- Messages Tab -->
			{#if viewMode === 'list'}
				<CollaborationChatList {chats} {loading} {error} onSelectChat={handleSelectChat} />
			{:else if viewMode === 'thread' && selectedChat}
				<CollaborationChatThread
					postId={selectedChat.postId}
					discussionTitle={selectedChat.discussionTitle}
					collaborators={selectedChat.collaborators}
					currentUserId={userId}
					onBack={handleBackToList}
				/>
			{/if}
		{/if}
	</div>
</section>

<style>
	.dashboard-notifications-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		height: fit-content;
		max-height: 80vh;
	}

	.tabs-header {
		display: flex;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface-alt);
	}

	.tab-button {
		flex: 1;
		padding: 1rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		transition: all var(--transition-speed) ease;
		position: relative;
		font-family: var(--font-family-ui);
	}

	.tab-button:hover {
		color: var(--color-text-primary);
		background: var(--color-surface);
	}

	.tab-button.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab-badge {
		display: inline-block;
		margin-left: 0.5rem;
		padding: 0.125rem 0.5rem;
		background: var(--color-primary);
		color: white;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		min-width: 1.25rem;
		text-align: center;
	}

	.tab-content {
		flex: 1;
		overflow-y: auto;
		max-height: 80vh;
	}

	.notifications-content {
		display: flex;
		flex-direction: column;
	}

	.notifications-header {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		justify-content: flex-end;
	}

	.action-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-primary);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		font-family: var(--font-family-ui);
	}

	.action-btn:hover:not(:disabled) {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.approve {
		border-color: var(--color-success);
		color: var(--color-success);
	}

	.action-btn.approve:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-success) 10%, transparent);
	}

	.action-btn.deny {
		border-color: var(--color-error);
		color: var(--color-error);
	}

	.action-btn.deny:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
	}

	.notifications-list {
		flex: 1;
		overflow-y: auto;
	}

	.loading-state,
	.error-state,
	.empty-state {
		padding: 2rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.error-state {
		color: var(--color-error);
	}

	.notification-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);
		cursor: pointer;
		background: transparent;
		border-left: 3px solid transparent;
		border-right: none;
		border-top: none;
		text-align: left;
		width: 100%;
		transition: all var(--transition-speed) ease;
	}

	.notification-item.unread {
		background: color-mix(in srgb, var(--color-primary) 3%, transparent);
		border-left-color: var(--color-primary);
	}

	.notification-item:hover {
		background: var(--color-surface-alt);
	}

	.notification-content {
		flex: 1;
		min-width: 0;
	}

	.notification-message {
		margin: 0 0 0.25rem 0;
		font-size: 0.875rem;
		line-height: 1.4;
		color: var(--color-text-primary);
	}

	.notification-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.notification-actions {
		display: flex;
		gap: 0.5rem;
		margin-left: 1rem;
	}

	.delete-btn {
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0 0.5rem;
		line-height: 1;
		transition: color var(--transition-speed) ease;
	}

	.delete-btn:hover {
		color: var(--color-error);
	}

	@media (max-width: 768px) {
		.dashboard-notifications-panel {
			max-height: 80vh;
		}

		.tab-content {
			max-height: 450px;
		}
	}
</style>
