<script lang="ts">
	import { getNotificationMessage, type Notification } from '$lib/utils/notificationHelpers';
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
	import { MessageCircle } from '@lucide/svelte';
	import CollaborationChatList from './CollaborationChatList.svelte';
	import CollaborationChatThread from './CollaborationChatThread.svelte';

	// Navigation height constants (must match CSS)
	const NAV_HEIGHT_MOBILE = 88;
	const NAV_HEIGHT_DESKTOP = 96;
	const MOBILE_BREAKPOINT = 768;

	let { userId, chatLabel } = $props<{ userId: string; chatLabel?: string }>();

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

	// Position and size state for draggable/resizable panel
	let panelPosition = $state({ x: 0, y: 0 });
	let panelSize = $state({ width: 400, height: 600 });
	let isDragging = $state(false);
	let isResizing = $state(false);
	let dragStart = $state({ x: 0, y: 0 });
	let resizeStart = $state({ x: 0, y: 0, width: 0, height: 0 });
	let resizeDirection = $state<string>('');

	// Load saved position/size from localStorage
	function loadPanelSettings() {
		if (typeof window === 'undefined') return;

		// On mobile, always position at right edge
		const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
		if (isMobile) {
			panelPosition = { x: 0, y: 0 };
			panelSize = { width: window.innerWidth, height: window.innerHeight };
			return;
		}

		const saved = localStorage.getItem('chat-panel-settings');
		if (saved) {
			try {
				const settings = JSON.parse(saved);

				// Validate settings structure before attempting calculations
				if (
					!settings ||
					typeof settings.screenWidth !== 'number' ||
					typeof settings.screenHeight !== 'number' ||
					settings.screenWidth <= 0 ||
					settings.screenHeight <= 0 ||
					!settings.position ||
					!settings.size
				) {
					// Invalid or incomplete settings - reset to default
					resetPanelPosition();
					return;
				}

				// Check if screen size has changed significantly since last save
				const savedScreenWidth = settings.screenWidth;
				const savedScreenHeight = settings.screenHeight;
				const currentScreenWidth = window.innerWidth;
				const currentScreenHeight = window.innerHeight;

				// If screen dimensions changed by more than 10%, reset position
				const widthChange = Math.abs(currentScreenWidth - savedScreenWidth) / savedScreenWidth;
				const heightChange = Math.abs(currentScreenHeight - savedScreenHeight) / savedScreenHeight;

				if (widthChange > 0.1 || heightChange > 0.1) {
					// Screen size changed significantly - reset to default position
					resetPanelPosition();
					return;
				}

				// Screen size is similar, load saved position
				panelPosition = settings.position;
				panelSize = settings.size;
			} catch (e) {
				console.error('Failed to load panel settings:', e);
				resetPanelPosition();
			}
		} else {
			// No saved settings - use default position
			resetPanelPosition();
		}
	}

	// Reset panel to default position (right side, below nav)
	function resetPanelPosition() {
		if (typeof window === 'undefined') return;

		const defaultWidth = 400;
		const defaultHeight = 600;
		const navHeight =
			window.innerWidth <= MOBILE_BREAKPOINT ? NAV_HEIGHT_MOBILE : NAV_HEIGHT_DESKTOP;

		panelSize = {
			width: Math.min(defaultWidth, window.innerWidth - 40),
			height: Math.min(defaultHeight, window.innerHeight - navHeight - 40)
		};

		panelPosition = {
			x: window.innerWidth - panelSize.width - 20,
			y: navHeight + 20
		};
	}

	// Save position/size to localStorage with current screen dimensions
	function savePanelSettings() {
		if (typeof window === 'undefined') return;

		localStorage.setItem(
			'chat-panel-settings',
			JSON.stringify({
				position: panelPosition,
				size: panelSize,
				screenWidth: window.innerWidth,
				screenHeight: window.innerHeight
			})
		);
	}

	// Handle drag start
	function handleDragStart(e: MouseEvent) {
		isDragging = true;
		dragStart = {
			x: e.clientX - panelPosition.x,
			y: e.clientY - panelPosition.y
		};
	}

	// Handle drag move
	function handleDragMove(e: MouseEvent) {
		if (!isDragging) return;

		const newX = e.clientX - dragStart.x;
		const newY = e.clientY - dragStart.y;

		// Keep panel within viewport bounds
		const maxX = window.innerWidth - panelSize.width;
		const maxY = window.innerHeight - panelSize.height;

		panelPosition = {
			x: Math.max(0, Math.min(newX, maxX)),
			y: Math.max(0, Math.min(newY, maxY))
		};
	}

	// Handle drag end
	function handleDragEnd() {
		if (isDragging) {
			isDragging = false;
			savePanelSettings();
		}
	}

	// Handle resize start
	function handleResizeStart(e: MouseEvent, direction: string) {
		e.stopPropagation();
		isResizing = true;
		resizeDirection = direction;
		resizeStart = {
			x: e.clientX,
			y: e.clientY,
			width: panelSize.width,
			height: panelSize.height
		};
	}

	// Handle resize move
	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;

		const deltaX = e.clientX - resizeStart.x;
		const deltaY = e.clientY - resizeStart.y;

		let newWidth = panelSize.width;
		let newHeight = panelSize.height;
		let newX = panelPosition.x;
		let newY = panelPosition.y;

		// Handle different resize directions
		if (resizeDirection.includes('e')) {
			newWidth = Math.max(300, Math.min(800, resizeStart.width + deltaX));
		}
		if (resizeDirection.includes('w')) {
			const proposedWidth = Math.max(300, Math.min(800, resizeStart.width - deltaX));
			const widthDiff = proposedWidth - panelSize.width;
			newWidth = proposedWidth;
			newX = Math.max(0, panelPosition.x - widthDiff);
		}
		if (resizeDirection.includes('s')) {
			newHeight = Math.max(
				400,
				Math.min(window.innerHeight - panelPosition.y, resizeStart.height + deltaY)
			);
		}
		if (resizeDirection.includes('n')) {
			const proposedHeight = Math.max(400, Math.min(800, resizeStart.height - deltaY));
			const heightDiff = proposedHeight - panelSize.height;
			newHeight = proposedHeight;
			newY = Math.max(0, panelPosition.y - heightDiff);
		}

		panelSize = { width: newWidth, height: newHeight };
		panelPosition = { x: newX, y: newY };
	}

	// Handle resize end
	function handleResizeEnd() {
		if (isResizing) {
			isResizing = false;
			resizeDirection = '';
			savePanelSettings();
		}
	}

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

		closeChat();

		// For collaboration requests (edit_control_request, role_upgrade_request, collaboration_invite),
		// navigate to home instead of the discussion
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

	async function handleAcceptCollaborationInvite(notification: Notification, event: Event) {
		event.stopPropagation();
		processingNotificationId = notification.id;

		try {
			const result = await nhost.graphql.request(ACCEPT_COLLABORATION_INVITE, {
				collaboratorId: notification.metadata?.collaborator_id,
				notificationId: notification.id
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				if (!notification.read) {
					notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
				}
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
			const result = await nhost.graphql.request(DECLINE_COLLABORATION_INVITE, {
				collaboratorId: notification.metadata?.collaborator_id,
				notificationId: notification.id
			});

			if (!result.error) {
				notifications = notifications.filter((n) => n.id !== notification.id);
				if (!notification.read) {
					notificationUnreadCount = Math.max(0, notificationUnreadCount - 1);
				}
			}
		} catch (err) {
			console.error('Error declining collaboration invite:', err);
		} finally {
			processingNotificationId = null;
		}
	}

	onMount(() => {
		loadAll();
		loadPanelSettings();

		// Poll for updates every 30 seconds
		const interval = setInterval(loadAll, 30000);

		// Add global mouse event listeners for dragging and resizing
		const handleGlobalMouseMove = (e: MouseEvent) => {
			handleDragMove(e);
			handleResizeMove(e);
		};

		const handleGlobalMouseUp = () => {
			handleDragEnd();
			handleResizeEnd();
		};

		// Reset position on resize if switching to/from mobile
		const handleResize = () => {
			const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
			if (isMobile && isOpen) {
				panelPosition = { x: 0, y: 0 };
				panelSize = { width: window.innerWidth, height: window.innerHeight };
			}
		};

		window.addEventListener('mousemove', handleGlobalMouseMove);
		window.addEventListener('mouseup', handleGlobalMouseUp);
		window.addEventListener('resize', handleResize);

		return () => {
			clearInterval(interval);
			window.removeEventListener('mousemove', handleGlobalMouseMove);
			window.removeEventListener('mouseup', handleGlobalMouseUp);
			window.removeEventListener('resize', handleResize);
		};
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
		class="chat-icon"
		class:has-label={!!chatLabel}
		onclick={toggleChat}
		aria-label="Contributor chat"
		aria-expanded={isOpen}
	>
		<MessageCircle size={20} />
		{#if chatLabel}
			<span class="chat-label">{chatLabel}</span>
		{/if}
		{#if unreadDisplay}
			<span class="chat-badge" aria-label="{totalUnreadCount} unread messages">{unreadDisplay}</span
			>
		{/if}
	</button>

	<!-- Chat Dropdown Panel -->
	{#if isOpen}
		<div
			class="chat-panel"
			class:mobile-panel={typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT}
			style={typeof window !== 'undefined' && window.innerWidth > MOBILE_BREAKPOINT
				? `left: ${panelPosition.x}px; top: ${panelPosition.y}px; width: ${panelSize.width}px; height: ${panelSize.height}px;`
				: ''}
		>
			<!-- Resize Handles -->
			<div class="resize-handle resize-n" onmousedown={(e) => handleResizeStart(e, 'n')}></div>
			<div class="resize-handle resize-ne" onmousedown={(e) => handleResizeStart(e, 'ne')}></div>
			<div class="resize-handle resize-e" onmousedown={(e) => handleResizeStart(e, 'e')}></div>
			<div class="resize-handle resize-se" onmousedown={(e) => handleResizeStart(e, 'se')}></div>
			<div class="resize-handle resize-s" onmousedown={(e) => handleResizeStart(e, 's')}></div>
			<div class="resize-handle resize-sw" onmousedown={(e) => handleResizeStart(e, 'sw')}></div>
			<div class="resize-handle resize-w" onmousedown={(e) => handleResizeStart(e, 'w')}></div>
			<div class="resize-handle resize-nw" onmousedown={(e) => handleResizeStart(e, 'nw')}></div>

			<!-- Drag Handle -->
			<div class="chat-header" onmousedown={handleDragStart}>
				<div class="drag-indicator">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
						<circle cx="4" cy="8" r="1.5" />
						<circle cx="8" cy="8" r="1.5" />
						<circle cx="12" cy="8" r="1.5" />
					</svg>
				</div>
				<button type="button" class="close-button" onclick={closeChat} aria-label="Close chat">
					×
				</button>
			</div>

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
										<p class="notification-message">
											{getNotificationMessage(notification, userId)}
										</p>
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
										{:else if notification.type === 'collaboration_invite'}
											<div class="notification-actions">
												<button
													type="button"
													class="action-approve"
													onclick={(e) => handleAcceptCollaborationInvite(notification, e)}
													disabled={processingNotificationId === notification.id}
												>
													Accept
												</button>
												<button
													type="button"
													class="action-deny"
													onclick={(e) => handleDeclineCollaborationInvite(notification, e)}
													disabled={processingNotificationId === notification.id}
												>
													Decline
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
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.chat-icon.has-label {
		padding: 0.5rem 0.75rem;
	}

	.chat-icon:hover {
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
	}

	.chat-label {
		white-space: nowrap;
	}

	@media (max-width: 768px) {
		.chat-label {
			display: none;
		}
		.chat-icon.has-label {
			padding: 0.5rem;
		}
	}

	.chat-badge {
		position: absolute;
		top: 6px;
		right: 6px;
		background: var(--color-error);
		color: white;
		border-radius: var(--border-radius-md);
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
		background: var(--color-surface);
		backdrop-filter: blur(8px);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		z-index: 51;
		display: flex;
		flex-direction: column;
		animation: slideDown 0.2s ease;
		overflow: hidden;
		min-width: 300px;
		min-height: 400px;
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

	/* Resize Handles */
	.resize-handle {
		position: absolute;
		z-index: 10;
	}

	.resize-n,
	.resize-s {
		left: 0;
		right: 0;
		height: 6px;
		cursor: ns-resize;
	}

	.resize-n {
		top: 0;
	}
	.resize-s {
		bottom: 0;
	}

	.resize-e,
	.resize-w {
		top: 0;
		bottom: 0;
		width: 6px;
		cursor: ew-resize;
	}

	.resize-e {
		right: 0;
	}
	.resize-w {
		left: 0;
	}

	.resize-ne,
	.resize-nw,
	.resize-se,
	.resize-sw {
		width: 12px;
		height: 12px;
	}

	.resize-ne {
		top: 0;
		right: 0;
		cursor: nesw-resize;
	}

	.resize-nw {
		top: 0;
		left: 0;
		cursor: nwse-resize;
	}

	.resize-se {
		bottom: 0;
		right: 0;
		cursor: nwse-resize;
	}

	.resize-sw {
		bottom: 0;
		left: 0;
		cursor: nesw-resize;
	}

	/* Drag Header */
	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: var(--color-surface-alt);
		border-bottom: 1px solid var(--color-border);
		cursor: move;
		user-select: none;
	}

	.drag-indicator {
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		opacity: 0.6;
	}

	.close-button {
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--border-radius-sm);
		transition: all var(--transition-speed) ease;
	}

	.close-button:hover {
		background: var(--color-error);
		color: white;
	}

	/* Mobile breakpoint - must match MOBILE_BREAKPOINT constant (768px) */
	@media (max-width: 768px) {
		/* Override all positioning for mobile */
		/* Nav height - must match NAV_HEIGHT_MOBILE constant (88px) */
		.chat-panel,
		.chat-panel[style],
		.mobile-panel,
		.mobile-panel[style] {
			position: fixed !important;
			top: var(--nav-height, 88px) !important;
			right: 0 !important;
			bottom: 0 !important;
			left: 0 !important;
			width: 100vw !important;
			max-width: 100vw !important;
			height: calc(100dvh - var(--nav-height, 88px)) !important;
			min-width: unset !important;
			min-height: unset !important;
			margin: 0 !important;
			padding: 0 !important;
			border-radius: 0 !important;
			border: none !important;
			z-index: 40 !important;
			display: flex !important;
			flex-direction: column !important;
			overflow: hidden !important;
			transform: none !important;
		}

		.resize-handle {
			display: none !important;
		}

		.chat-header {
			cursor: default;
			flex-shrink: 0 !important;
		}

		.chat-tabs {
			flex-shrink: 0 !important;
		}

		/* Make chat content areas fill remaining space */
		.chat-panel > :global(.notifications-content),
		.chat-panel > :global([class*='collaboration']) {
			flex: 1 !important;
			min-height: 0 !important;
			overflow: hidden !important;
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
		border-radius: var(--border-radius-sm);
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
