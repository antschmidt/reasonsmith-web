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
		DENY_ROLE_UPGRADE_REQUEST
	} from '$lib/graphql/queries';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { MessageCircle } from '@lucide/svelte';
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
	let isOpen = $state(false);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let processingNotificationId = $state<string | null>(null);

	// Tab state: 'messages' or 'notifications'
	let activeTab = $state<'messages' | 'notifications'>('messages');

	// View state: 'list' (showing chat list) or 'thread' (showing conversation)
	let viewMode = $state<'list' | 'thread'>('list');
	let selectedChat = $state<ChatSummary | null>(null);

	// Total unread count for badge (messages + notifications)
	const totalUnreadCount = $derived(chatUnreadCount + notificationUnreadCount);

	// Format unread count for display (1-9, 9+)
	const unreadDisplay = $derived(
		totalUnreadCount === 0 ? '' : totalUnreadCount > 9 ? '9+' : totalUnreadCount.toString()
	);

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

				console.error('Notification error:', notifResult.error);
			} else if (notifResult.data) {
				notifications = notifResult.data.notification || [];
			}

			if (countResult.data) {
				notificationUnreadCount = countResult.data.notification_aggregate?.aggregate?.count || 0;
			}
		} catch (err: any) {
			const errorMsg = err?.message || String(err);
			if (!errorMsg.includes('JWT') && !errorMsg.includes('JWTExpired')) {
				console.error('Error loading notifications:', err);
			}
		}
	}

	async function loadChats() {
		try {
			const session = nhost.getUserSession();
			if (!session || !session.user) {
				return;
			}

			await nhost.auth.isAuthenticatedAsync();

			const [chatsResult, unreadResult] = await Promise.all([
				nhost.graphql.request(GET_USER_COLLABORATION_CHATS, { userId }),
				nhost.graphql.request(GET_TOTAL_COLLABORATION_UNREAD_COUNT, { userId })
			]);

			if (chatsResult.error) {
				console.error('Error loading chats:', chatsResult.error);
			} else if (chatsResult.data) {
				// Combine author posts and collaborator posts
				const authorPosts = chatsResult.data.author_posts || [];
				const collaboratorPosts = (chatsResult.data.collaborator_posts || []).map(
					(pc: any) => pc.post
				);

				const allPosts = [...authorPosts, ...collaboratorPosts];

				// Transform to ChatSummary format
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

	function toggleChat() {
		isOpen = !isOpen;
		if (isOpen) {
			// Reset to list view when opening
			viewMode = 'list';
			selectedChat = null;
		}
	}

	function closeChat() {
		isOpen = false;
		viewMode = 'list';
		selectedChat = null;
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeChat();
		}
	}

	function handleSelectChat(chat: ChatSummary) {
		selectedChat = chat;
		viewMode = 'thread';
	}

	function handleBackToList() {
		viewMode = 'list';
		selectedChat = null;
		// Reload chats to update unread counts
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
				return `New reply to your comment`;
			case 'edit_control_request':
				const isForAuthor = notification.metadata?.current_holder_id !== userId;
				if (isForAuthor) {
					return `Edit control request for "${notification.metadata?.discussion_title || discussionTitle}"`;
				} else {
					return `Someone is requesting edit control`;
				}
			case 'role_upgrade_request':
				return `Role upgrade request for "${notification.metadata?.discussion_title || discussionTitle}"`;
			default:
				return 'New notification';
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
			notification.type === 'edit_control_request' || notification.type === 'role_upgrade_request'
		);
	}

	async function handleNotificationClick(notification: Notification) {
		if (isActionableNotification(notification)) {
			if (!notification.read) {
				markNotificationAsRead(notification.id);
			}
			return;
		}

		if (!notification.read) {
			markNotificationAsRead(notification.id);
		}

		closeChat();

		const url = `/discussions/${notification.discussion_id}${
			notification.post_id ? `#post-${notification.post_id}` : ''
		}`;
		await goto(url);
	}

	async function handleApproveEditControl(notification: Notification, event: Event) {
		event.stopPropagation();
		processingNotificationId = notification.id;

		try {
			const result = await nhost.graphql.request(APPROVE_EDIT_CONTROL_REQUEST, {
				postId: notification.metadata?.post_id,
				newEditorId: notification.metadata?.requester_id,
				previousEditorId: notification.metadata?.current_holder_id,
				now: new Date().toISOString()
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				if (!notification.read) {
					notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
				}
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
				requesterId: notification.metadata?.requester_id,
				postId: notification.metadata?.post_id
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				if (!notification.read) {
					notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
				}
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
				collaboratorId: notification.metadata?.collaborator_id,
				newRole: notification.metadata?.requested_role
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				if (!notification.read) {
					notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
				}
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
				if (!notification.read) {
					notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
				}
			}
		} catch (err) {
			console.error('Error denying role upgrade request:', err);
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

<!-- Backdrop -->
{#if isOpen}
	<button class="chat-backdrop" onclick={handleBackdropClick} aria-label="Close chat"></button>
{/if}

<!-- Chat Bubble Icon -->
<div class="chat-container">
	<button
		type="button"
		class="chat-icon nav-icon"
		onclick={toggleChat}
		aria-label="Contributor chat"
		aria-expanded={isOpen}
	>
		<MessageCircle size={20} />
		{#if unreadDisplay}
			<span class="chat-badge" aria-label="{totalUnreadCount} unread messages">{unreadDisplay}</span
			>
		{/if}
	</button>

	<!-- Chat Dropdown Panel -->
	{#if isOpen}
		<div class="chat-panel">
			<!-- Tabs Header -->
			<div class="chat-tabs">
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
			</div>

			<!-- Tab Content -->
			{#if activeTab === 'messages'}
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
			{:else}
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
							<p class="notifications-message">Loading notifications...</p>
						{:else if notifications.length === 0}
							<p class="notifications-message">No notifications yet</p>
						{:else}
							{#each notifications as notification}
								<div
									class="notification-item {notification.read ? 'read' : 'unread'}"
									role="button"
									tabindex="0"
									onclick={() => handleNotificationClick(notification)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											handleNotificationClick(notification);
										}
									}}
									class:disabled={processingNotificationId === notification.id}
								>
									<div class="notification-content">
										<p class="notification-message">{getNotificationMessage(notification)}</p>
										<span class="notification-time">{formatTimeAgo(notification.created_at)}</span>

										{#if notification.type === 'edit_control_request'}
											<div class="notification-actions">
												<button
													type="button"
													class="action-approve"
													onclick={(e) => handleApproveEditControl(notification, e)}
													disabled={processingNotificationId === notification.id}
												>
													Approve
												</button>
												<button
													type="button"
													class="action-deny"
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
													class="action-approve"
													onclick={(e) => handleApproveRoleUpgrade(notification, e)}
													disabled={processingNotificationId === notification.id}
												>
													Approve
												</button>
												<button
													type="button"
													class="action-deny"
													onclick={(e) => handleDenyRoleUpgrade(notification, e)}
													disabled={processingNotificationId === notification.id}
												>
													Deny
												</button>
											</div>
										{/if}
									</div>

									<button
										type="button"
										class="delete-btn"
										onclick={(e) => deleteNotification(notification.id, e)}
										aria-label="Delete notification"
									>
										×
									</button>

									{#if !notification.read}
										<span class="unread-indicator" aria-label="Unread"></span>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.chat-backdrop {
		position: fixed;
		inset: 0;
		background: transparent;
		border: none;
		padding: 0;
		cursor: default;
		z-index: 49;
	}

	.chat-container {
		position: relative;
	}

	.chat-icon {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: var(--border-radius-sm);
		background: transparent;
		border: none;
		color: var(--color-text-primary);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
	}

	.chat-icon:hover {
		background: var(--color-surface);
	}

	.chat-badge {
		position: absolute;
		top: 6px;
		right: 6px;
		background: var(--color-error);
		color: white;
		border-radius: 10px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		font-size: 0.7rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		line-height: 1;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.chat-panel {
		position: fixed;
		top: calc(100% + 0.5rem);
		right: 0.5rem;
		width: 400px;
		max-height: 600px;
		background: var(--color-surface);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--color-text-primary);
		border-radius: var(--border-radius-lg);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 51;
		display: flex;
		flex-direction: column;
		animation: slideDown 0.2s ease;
		overflow: hidden;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 768px) {
		.chat-panel {
			position: fixed;
			top: 60px;
			right: 1rem;
			left: 1rem;
			width: auto;
		}
	}

	.chat-tabs {
		display: flex;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.tab-button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		position: relative;
	}

	.tab-button:hover {
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
	}

	.tab-button.active {
		color: var(--color-primary);
	}

	.tab-button.active::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--color-primary);
	}

	.tab-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		background: var(--color-primary);
		color: white;
		border-radius: 9px;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.notifications-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.notifications-header {
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		justify-content: flex-end;
	}

	.action-btn {
		font-size: 0.75rem;
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		font-weight: 500;
	}

	.action-btn:hover {
		background: var(--color-surface);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.notifications-list {
		overflow-y: auto;
		flex: 1;
	}

	.notifications-message {
		padding: 2rem 1.25rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin: 0;
	}

	.notification-item {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border);
		background: transparent;
		cursor: pointer;
		transition: background var(--transition-speed) ease;
	}

	.notification-item:hover {
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
	}

	.notification-item.unread {
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.notification-item.unread:hover {
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.notification-item.disabled {
		opacity: 0.6;
		cursor: wait;
		pointer-events: none;
	}

	.notification-content {
		flex: 1;
		min-width: 0;
	}

	.notification-message {
		margin: 0 0 0.25rem 0;
		font-size: 0.875rem;
		color: var(--color-text-primary);
		line-height: 1.4;
	}

	.notification-item.unread .notification-message {
		font-weight: 600;
	}

	.notification-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.notification-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.action-approve,
	.action-deny {
		padding: 0.375rem 0.75rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		border: 1px solid transparent;
	}

	.action-approve {
		background: var(--color-success);
		color: white;
		border-color: var(--color-success);
	}

	.action-approve:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-success) 85%, black);
	}

	.action-deny {
		background: transparent;
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.action-deny:hover:not(:disabled) {
		background: var(--color-error);
		color: white;
	}

	.action-approve:disabled,
	.action-deny:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.delete-btn {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		border-radius: var(--border-radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 1.5rem;
		line-height: 1;
		opacity: 0;
		transition: all var(--transition-speed) ease;
	}

	.notification-item:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: var(--color-error);
		color: white;
	}

	.unread-indicator {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-primary);
	}
</style>
