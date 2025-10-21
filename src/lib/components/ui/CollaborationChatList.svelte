<script lang="ts">
	import { formatTimeAgo } from '$lib/utils/time';

	type Collaborator = {
		id: string;
		display_name: string;
		handle: string | null;
		avatar_url: string | null;
	};

	type ChatSummary = {
		postId: string;
		discussionId: string;
		discussionTitle: string;
		collaborators: Array<Collaborator>;
		lastMessage: {
			content: string;
			sender_name: string;
			created_at: string;
		} | null;
		unreadCount: number;
	};

	let { chats, loading, error, onSelectChat } = $props<{
		chats: Array<ChatSummary>;
		loading: boolean;
		error: string | null;
		onSelectChat: (chat: ChatSummary) => void;
	}>();
</script>

<div class="chat-list">
	{#if loading}
		<p class="chat-list-message">Loading chats...</p>
	{:else if error}
		<p class="chat-list-error">{error}</p>
	{:else if chats.length === 0}
		<p class="chat-list-message">No active collaborations yet</p>
	{:else}
		{#each chats as chat (chat.postId)}
			<button type="button" class="chat-item" onclick={() => onSelectChat(chat)}>
				<div class="chat-item-content">
					<div class="chat-item-header">
						<h4 class="chat-title">{chat.discussionTitle}</h4>
						{#if chat.unreadCount > 0}
							<span class="chat-unread-badge">{chat.unreadCount}</span>
						{/if}
					</div>

					{#if chat.lastMessage}
						<p class="chat-last-message">
							<strong>{chat.lastMessage.sender_name}:</strong>
							{chat.lastMessage.content.slice(0, 60)}{chat.lastMessage.content.length > 60
								? '...'
								: ''}
						</p>
						<div class="chat-meta">
							<span class="chat-time">{formatTimeAgo(chat.lastMessage.created_at)}</span>
							<span class="chat-collaborators"
								>{chat.collaborators.length} collaborator{chat.collaborators.length !== 1
									? 's'
									: ''}</span
							>
						</div>
					{:else}
						<p class="chat-no-messages">No messages yet</p>
						<div class="chat-meta">
							<span class="chat-collaborators"
								>{chat.collaborators.length} collaborator{chat.collaborators.length !== 1
									? 's'
									: ''}</span
							>
						</div>
					{/if}
				</div>
			</button>
		{/each}
	{/if}
</div>

<style>
	.chat-list {
		overflow-y: auto;
		max-height: 500px;
	}

	.chat-list-message,
	.chat-list-error {
		padding: 2rem 1.25rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.chat-list-error {
		color: var(--color-error);
	}

	.chat-item {
		width: 100%;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border: none;
		border-bottom: 1px solid var(--color-border);
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition: background var(--transition-speed) ease;
	}

	.chat-item:hover {
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
	}

	.chat-item:last-child {
		border-bottom: none;
	}

	.chat-item-content {
		flex: 1;
		min-width: 0;
	}

	.chat-item-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}

	.chat-title {
		flex: 1;
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		font-family: var(--font-family-display);
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chat-unread-badge {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		background: var(--color-primary);
		color: white;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1;
	}

	.chat-last-message {
		margin: 0 0 0.375rem 0;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.4;
	}

	.chat-last-message strong {
		color: var(--color-text-primary);
		font-weight: 600;
	}

	.chat-no-messages {
		margin: 0 0 0.375rem 0;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.chat-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.chat-time {
		color: var(--color-text-secondary);
	}

	.chat-collaborators {
		color: var(--color-text-secondary);
	}
</style>
