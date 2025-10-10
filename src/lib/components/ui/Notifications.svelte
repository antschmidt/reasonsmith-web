<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import {
		GET_NOTIFICATIONS,
		GET_UNREAD_NOTIFICATION_COUNT,
		MARK_NOTIFICATION_AS_READ,
		MARK_ALL_NOTIFICATIONS_AS_READ,
		DELETE_NOTIFICATION,
		DELETE_ALL_NOTIFICATIONS
	} from '$lib/graphql/queries';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let { userId } = $props<{ userId: string }>();

	let notifications = $state<
		Array<{
			id: string;
			type: string;
			discussion_id: string;
			post_id: string | null;
			actor_id: string | null;
			read: boolean;
			created_at: string;
			discussion: {
				discussion_versions: Array<{ title: string }>;
			};
			post: {
				content: string;
			} | null;
		}>
	>([]);

	let unreadCount = $state(0);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadNotifications() {
		loading = true;
		error = null;

		try {
			const [notifResult, countResult] = await Promise.all([
				nhost.graphql.request(GET_NOTIFICATIONS, { userId }),
				nhost.graphql.request(GET_UNREAD_NOTIFICATION_COUNT, { userId })
			]);

			if (notifResult.error) {
				error = 'Failed to load notifications';
				console.error('Notification error:', notifResult.error);
			} else if (notifResult.data) {
				notifications = notifResult.data.notification || [];
			}

			if (countResult.data) {
				unreadCount = countResult.data.notification_aggregate?.aggregate?.count || 0;
			}
		} catch (err) {
			error = `Failed to load notifications: ${err}`;
			console.error('Error loading notifications:', err);
		}

		loading = false;
	}

	async function markAsRead(notificationId: string) {
		try {
			const result = await nhost.graphql.request(MARK_NOTIFICATION_AS_READ, {
				notificationId
			});

			if (!result.error) {
				// Update local state
				notifications = notifications.map((n) =>
					n.id === notificationId ? { ...n, read: true } : n
				);
				unreadCount = Math.max(0, unreadCount - 1);
			}
		} catch (err) {
			console.error('Error marking notification as read:', err);
		}
	}

	async function markAllAsRead() {
		try {
			const result = await nhost.graphql.request(MARK_ALL_NOTIFICATIONS_AS_READ, { userId });

			if (!result.error) {
				// Update local state
				notifications = notifications.map((n) => ({ ...n, read: true }));
				unreadCount = 0;
			}
		} catch (err) {
			console.error('Error marking all notifications as read:', err);
		}
	}

	function getNotificationMessage(notification: (typeof notifications)[0]): string {
		const discussionTitle =
			notification.discussion?.discussion_versions?.[0]?.title || 'a discussion';

		switch (notification.type) {
			case 'new_comment_on_my_discussion':
				return `New comment on your discussion "${discussionTitle}"`;
			case 'new_comment_on_participated_discussion':
				return `New comment on "${discussionTitle}"`;
			case 'reply_to_my_comment':
				return `New reply to your comment`;
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

	async function deleteNotification(notificationId: string, event: Event) {
		event.stopPropagation(); // Prevent notification click navigation

		try {
			// Check if the notification was unread before deleting
			const wasUnread = notifications.find((n) => n.id === notificationId && !n.read);

			const result = await nhost.graphql.request(DELETE_NOTIFICATION, {
				notificationId
			});

			if (!result.error) {
				// Remove from local state
				notifications = notifications.filter((n) => n.id !== notificationId);
				// Update unread count if the deleted notification was unread
				if (wasUnread) {
					unreadCount = Math.max(0, unreadCount - 1);
				}
			}
		} catch (err) {
			console.error('Error deleting notification:', err);
		}
	}

	async function deleteAllNotifications() {
		if (!confirm('Are you sure you want to delete all notifications? This cannot be undone.')) {
			return;
		}

		try {
			const result = await nhost.graphql.request(DELETE_ALL_NOTIFICATIONS, { userId });

			if (!result.error) {
				// Clear local state
				notifications = [];
				unreadCount = 0;
			}
		} catch (err) {
			console.error('Error deleting all notifications:', err);
		}
	}

	async function handleNotificationClick(notification: (typeof notifications)[0]) {
		if (!notification.read) {
			markAsRead(notification.id);
		}
		// Navigate to the discussion using SvelteKit navigation
		const url = `/discussions/${notification.discussion_id}${
			notification.post_id ? `#post-${notification.post_id}` : ''
		}`;
		await goto(url);
	}

	onMount(() => {
		loadNotifications();

		// Poll for new notifications every 30 seconds
		const interval = setInterval(loadNotifications, 30000);
		return () => clearInterval(interval);
	});
</script>

<div class="notifications-container">
	<div class="notifications-header">
		<h3 class="notifications-title">
			Notifications
			{#if unreadCount > 0}
				<span class="unread-badge">{unreadCount}</span>
			{/if}
		</h3>
		{#if notifications.length > 0}
			<div class="header-actions">
				{#if unreadCount > 0}
					<button type="button" class="action-btn" onclick={markAllAsRead}>
						Mark all as read
					</button>
				{/if}
				<button type="button" class="action-btn delete-all-btn" onclick={deleteAllNotifications}>
					Delete all
				</button>
			</div>
		{/if}
	</div>

	{#if loading}
		<p class="notifications-message">Loading notifications...</p>
	{:else if error}
		<p class="notifications-error">{error}</p>
	{:else if notifications.length === 0}
		<p class="notifications-message">No notifications yet</p>
	{:else}
		<div class="notifications-list">
			{#each notifications as notification}
				<div class="notification-wrapper">
					<button
						type="button"
						class="notification-item {notification.read ? 'read' : 'unread'}"
						onclick={() => handleNotificationClick(notification)}
					>
						<div class="notification-content">
							<p class="notification-message">{getNotificationMessage(notification)}</p>
							<span class="notification-time">{formatTimeAgo(notification.created_at)}</span>
						</div>
						{#if !notification.read}
							<span class="unread-indicator" aria-label="Unread"></span>
						{/if}
					</button>
					<button
						type="button"
						class="delete-btn"
						onclick={(e) => deleteNotification(notification.id, e)}
						aria-label="Delete notification"
						title="Delete notification"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M6 2h4M2 4h12M13 4l-.5 8.5a1 1 0 01-1 .9h-7a1 1 0 01-1-.9L3 4M6.5 7v4M9.5 7v4"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.notifications-container {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		padding: var(--space-lg);
		margin-bottom: var(--space-lg);
	}

	.notifications-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-md);
	}

	.notifications-title {
		font-size: 1.125rem;
		font-weight: 700;
		font-family: var(--font-family-display);
		color: var(--color-text-primary);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
	}

	.unread-badge {
		background: var(--color-accent);
		color: white;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: var(--border-radius-full);
		min-width: 1.5rem;
		text-align: center;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.action-btn {
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		padding: 0.375rem 0.75rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.action-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.delete-all-btn:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 5%, transparent);
	}

	.notifications-message,
	.notifications-error {
		padding: var(--space-md);
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.notifications-error {
		color: var(--color-accent);
	}

	.notifications-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.notification-wrapper {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.notification-wrapper:last-child {
		border-bottom: none;
	}

	.notification-item {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-md);
		border: none;
		background: transparent;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}

	.notification-item:hover {
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
	}

	.notification-item.unread {
		background: color-mix(in srgb, var(--color-primary) 3%, transparent);
	}

	.notification-item.unread:hover {
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.notification-content {
		flex: 1;
		min-width: 0;
	}

	.notification-message {
		font-size: 0.875rem;
		color: var(--color-text-primary);
		margin: 0 0 0.25rem 0;
		line-height: 1.4;
	}

	.notification-item.read .notification-message {
		color: var(--color-text-secondary);
	}

	.notification-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.unread-indicator {
		width: 8px;
		height: 8px;
		background: var(--color-accent);
		border-radius: 50%;
		flex-shrink: 0;
	}

	.delete-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-md);
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
		opacity: 0;
		flex-shrink: 0;
	}

	.notification-wrapper:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}

	@media (max-width: 768px) {
		.delete-btn {
			opacity: 1; /* Always visible on mobile */
			padding: var(--space-sm);
		}
		.notifications-container {
			padding: var(--space-md);
		}

		.notification-item {
			padding: var(--space-sm) var(--space-md);
		}

		.action-btn {
			font-size: 0.75rem;
			padding: 0.25rem 0.5rem;
		}
	}
</style>
