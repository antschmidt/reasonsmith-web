<script lang="ts">
	import { Users, Lock, LockOpen, AlertCircle } from '@lucide/svelte';
	import Button from './ui/Button.svelte';

	type Collaborator = {
		id: string;
		display_name: string;
		handle: string | null;
		avatar_url: string | null;
	};

	type EditLockStatus = {
		current_editor_id: string | null;
		edit_locked_at: string | null;
		collaboration_enabled: boolean;
		author_id: string;
		author: Collaborator;
		current_editor: Collaborator | null;
		post_collaborators: Array<{
			id: string;
			has_edit_lock: boolean;
			edit_lock_acquired_at: string | null;
			contributor: Collaborator;
		}>;
	};

	let {
		lockStatus,
		currentUserId,
		isAuthor,
		onAcquireLock,
		onReleaseLock,
		onToggleCollaboration,
		isLoading = false
	} = $props<{
		lockStatus: EditLockStatus;
		currentUserId: string;
		isAuthor: boolean;
		onAcquireLock: () => void;
		onReleaseLock: () => void;
		onToggleCollaboration: (enabled: boolean) => void;
		isLoading?: boolean;
	}>();

	// Derived state
	const currentlyEditing = $derived(
		lockStatus.current_editor_id
			? lockStatus.current_editor
			: lockStatus.edit_locked_at && !lockStatus.current_editor_id
				? lockStatus.author
				: null
	);

	const isCurrentUserEditing = $derived(
		(isAuthor && !lockStatus.current_editor_id && lockStatus.edit_locked_at) ||
			lockStatus.current_editor_id === currentUserId
	);

	const canRequestControl = $derived(
		!isCurrentUserEditing && !currentlyEditing && lockStatus.collaboration_enabled && !isAuthor
	);

	const canReleaseControl = $derived(isCurrentUserEditing && !isAuthor);

	// Get list of active collaborators (for presence display)
	const activeCollaborators = $derived(lockStatus.post_collaborators.map((pc) => pc.contributor));

	// Calculate how long the lock has been held
	function getLockDuration(lockedAt: string | null): string {
		if (!lockedAt) return '';

		const now = new Date();
		const locked = new Date(lockedAt);
		const diffMs = now.getTime() - locked.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'just now';
		if (diffMins === 1) return '1 minute ago';
		if (diffMins < 60) return `${diffMins} minutes ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours === 1) return '1 hour ago';
		return `${diffHours} hours ago`;
	}
</script>

<div class="collaboration-controls">
	<!-- Current Editor Status -->
	{#if currentlyEditing}
		<div class="editor-status" class:is-you={isCurrentUserEditing}>
			<div class="status-icon">
				{#if isCurrentUserEditing}
					<LockOpen size={16} />
				{:else}
					<Lock size={16} />
				{/if}
			</div>
			<div class="status-text">
				{#if isCurrentUserEditing}
					<span class="editing-label">You're editing</span>
				{:else}
					<span class="editing-label">
						<strong>{currentlyEditing.display_name}</strong> is editing
					</span>
				{/if}
				{#if lockStatus.edit_locked_at}
					<span class="lock-time">{getLockDuration(lockStatus.edit_locked_at)}</span>
				{/if}
			</div>
		</div>
	{:else if !lockStatus.collaboration_enabled && !isAuthor}
		<div class="editor-status disabled">
			<div class="status-icon">
				<AlertCircle size={16} />
			</div>
			<div class="status-text">
				<span class="editing-label">Collaboration is currently disabled</span>
			</div>
		</div>
	{/if}

	<!-- Action Buttons -->
	<div class="controls-actions">
		{#if canRequestControl}
			<Button variant="primary" size="sm" onclick={onAcquireLock} disabled={isLoading}>
				<LockOpen size={16} />
				Request Edit Control
			</Button>
		{/if}

		{#if canReleaseControl}
			<Button variant="secondary" size="sm" onclick={onReleaseLock} disabled={isLoading}>
				<Lock size={16} />
				Release Control
			</Button>
		{/if}

		{#if isAuthor}
			<div class="author-controls">
				<label class="toggle-label">
					<input
						type="checkbox"
						checked={lockStatus.collaboration_enabled}
						onchange={(e) => onToggleCollaboration(e.currentTarget.checked)}
						disabled={isLoading}
					/>
					<span>Collaboration {lockStatus.collaboration_enabled ? 'Enabled' : 'Disabled'}</span>
				</label>
			</div>
		{/if}
	</div>

	<!-- Active Collaborators -->
	{#if activeCollaborators.length > 0}
		<div class="collaborators-list">
			<div class="collaborators-header">
				<Users size={14} />
				<span>Collaborators ({activeCollaborators.length})</span>
			</div>
			<div class="collaborators-avatars">
				{#each activeCollaborators as collaborator}
					<div class="collaborator-avatar" title={collaborator.display_name}>
						{#if collaborator.avatar_url}
							<img src={collaborator.avatar_url} alt={collaborator.display_name} />
						{:else}
							<span class="avatar-initials">
								{collaborator.display_name?.charAt(0).toUpperCase() || '?'}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.collaboration-controls {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem;
		background: color-mix(in srgb, var(--color-surface-alt) 20%, transparent);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
	}

	.editor-status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		border-radius: var(--border-radius-sm);
	}

	.editor-status.is-you {
		background: color-mix(in srgb, var(--color-success) 10%, transparent);
		border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
	}

	.editor-status.disabled {
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
		border-color: color-mix(in srgb, var(--color-warning) 20%, transparent);
	}

	.status-icon {
		display: flex;
		align-items: center;
		color: var(--color-primary);
	}

	.editor-status.is-you .status-icon {
		color: var(--color-success);
	}

	.editor-status.disabled .status-icon {
		color: var(--color-warning);
	}

	.status-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
	}

	.editing-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.lock-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.controls-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.author-controls {
		display: flex;
		align-items: center;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
	}

	.toggle-label input[type='checkbox'] {
		cursor: pointer;
	}

	.collaborators-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.collaborators-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		letter-spacing: 0.05em;
	}

	.collaborators-avatars {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.collaborator-avatar {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		overflow: hidden;
		background: var(--color-primary);
		border: 2px solid var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.collaborator-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-initials {
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
	}

	@media (max-width: 768px) {
		.collaboration-controls {
			padding: 0.5rem;
		}

		.controls-actions {
			flex-direction: column;
		}
	}
</style>
