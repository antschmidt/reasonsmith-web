<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import {
		GET_NOTIFICATIONS,
		GET_UNREAD_NOTIFICATION_COUNT,
		MARK_NOTIFICATION_AS_READ,
		MARK_ALL_NOTIFICATIONS_AS_READ
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
		{#if notifications.length > 0 && unreadCount > 0}
			<button type="button" class="mark-all-read-btn" onclick={markAllAsRead}>
				Mark all as read
			</button>
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

	.mark-all-read-btn {
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		padding: 0.375rem 0.75rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.mark-all-read-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
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

	.notification-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-md);
		border: none;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		background: transparent;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;
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

	@media (max-width: 768px) {
		.notifications-container {
			padding: var(--space-md);
		}

		.notification-item {
			padding: var(--space-sm) var(--space-md);
		}

		.mark-all-read-btn {
			font-size: 0.75rem;
			padding: 0.25rem 0.5rem;
		}
	}
</style>
