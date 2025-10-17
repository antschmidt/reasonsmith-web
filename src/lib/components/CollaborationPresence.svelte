<script lang="ts">
	// Component to display active collaborators in a real-time editing session
	// Shows avatars, names, and online status of all connected users

	export let collaborators: Array<{
		id: string;
		name: string;
		color: string;
		isOnline: boolean;
	}> = [];

	export let connectionStatus: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
</script>

<div class="collaboration-presence">
	<div class="presence-header">
		<h4>Active Collaborators</h4>
		<span class="connection-badge connection-{connectionStatus}">
			{connectionStatus === 'connected'
				? '● Live'
				: connectionStatus === 'connecting'
					? '◐ Connecting'
					: '○ Offline'}
		</span>
	</div>

	{#if collaborators.length === 0}
		<p class="no-collaborators">
			{connectionStatus === 'connected'
				? 'Waiting for collaborators to join...'
				: connectionStatus === 'connecting'
					? 'Connecting to collaboration session...'
					: 'Not connected to collaboration session'}
		</p>
	{:else}
		<ul class="collaborators-list">
			{#each collaborators as collaborator (collaborator.id)}
				<li class="collaborator-item">
					<div class="collaborator-avatar" style="background-color: {collaborator.color}">
						{collaborator.name.charAt(0).toUpperCase()}
					</div>
					<div class="collaborator-info">
						<span class="collaborator-name">{collaborator.name}</span>
						<span class="collaborator-status" class:online={collaborator.isOnline}>
							{collaborator.isOnline ? 'Editing' : 'Idle'}
						</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.collaboration-presence {
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
	}

	.presence-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.presence-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.connection-badge {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		border-radius: var(--border-radius-sm);
	}

	.connection-connected {
		color: #52b788;
		background: color-mix(in srgb, #52b788 15%, transparent);
	}

	.connection-connecting {
		color: #f7dc6f;
		background: color-mix(in srgb, #f7dc6f 15%, transparent);
	}

	.connection-disconnected {
		color: #ff6b6b;
		background: color-mix(in srgb, #ff6b6b 15%, transparent);
	}

	.no-collaborators {
		margin: 0;
		padding: 1.5rem;
		text-align: center;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.collaborators-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.collaborator-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		transition: background 0.15s ease;
	}

	.collaborator-item:hover {
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
	}

	.collaborator-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.875rem;
		color: white;
		flex-shrink: 0;
	}

	.collaborator-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
		min-width: 0;
	}

	.collaborator-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.collaborator-status {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.collaborator-status.online {
		color: #52b788;
	}

	@media (max-width: 768px) {
		.collaboration-presence {
			padding: 0.75rem;
		}

		.collaborator-avatar {
			width: 32px;
			height: 32px;
			font-size: 0.8125rem;
		}

		.collaborator-name {
			font-size: 0.8125rem;
		}
	}
</style>
