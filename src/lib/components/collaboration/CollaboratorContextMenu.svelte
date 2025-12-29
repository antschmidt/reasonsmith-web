<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import {
		UPDATE_COLLABORATOR_ROLE,
		REMOVE_COLLABORATOR,
		FORCE_RECLAIM_EDIT_LOCK
	} from '$lib/graphql/queries';
	import { User, Shield, Lock, Trash2, X } from '@lucide/svelte';
	import Button from '../ui/Button.svelte';

	type PostCollaborator = {
		id: string; // post_collaborator.id
		role: 'viewer' | 'editor' | 'co-author';
		has_edit_lock: boolean;
		contributor: {
			id: string;
			display_name: string;
			handle: string | null;
			avatar_url: string | null;
		};
	};

	let {
		collaborator,
		currentUserId,
		isAuthor,
		isCoAuthor,
		authorId,
		postId,
		isOpen,
		onClose,
		onUpdate
	} = $props<{
		collaborator: PostCollaborator;
		currentUserId: string;
		isAuthor: boolean;
		isCoAuthor: boolean;
		authorId: string;
		postId: string;
		isOpen: boolean;
		onClose: () => void;
		onUpdate: () => void;
	}>();

	let selectedRole = $state(collaborator.role);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let showRemoveConfirm = $state(false);

	const canManage = $derived(isAuthor || isCoAuthor);
	const canChangeRole = $derived(canManage && collaborator.contributor.id !== authorId);
	const canRemove = $derived(canManage && collaborator.contributor.id !== authorId);
	const canReclaimLock = $derived(
		canManage &&
			collaborator.has_edit_lock &&
			collaborator.contributor.id !== currentUserId &&
			(isAuthor || collaborator.contributor.id !== authorId) // Co-authors can't reclaim from author
	);

	// Debug logging
	$effect(() => {
		console.log('[CollaboratorContextMenu] Debug:', {
			isAuthor,
			isCoAuthor,
			canManage,
			canChangeRole,
			collaboratorId: collaborator.contributor.id,
			authorId,
			isAuthorCollaborator: collaborator.contributor.id === authorId,
			currentRole: collaborator.role
		});
	});

	// Reset state when modal opens/closes
	$effect(() => {
		if (isOpen) {
			selectedRole = collaborator.role;
			errorMessage = '';
			showRemoveConfirm = false;
		}
	});

	async function handleRoleChange() {
		if (selectedRole === collaborator.role) return;

		isLoading = true;
		errorMessage = '';

		try {
			const result = await nhost.graphql.request(UPDATE_COLLABORATOR_ROLE, {
				collaboratorId: collaborator.id,
				newRole: selectedRole
			});

			if (result.error) {
				console.error('Error updating role:', result.error);
				errorMessage = 'Failed to update role';
				selectedRole = collaborator.role; // Revert
			} else {
				onUpdate();
				onClose();
			}
		} catch (error) {
			console.error('Error updating role:', error);
			errorMessage = 'Failed to update role';
			selectedRole = collaborator.role;
		} finally {
			isLoading = false;
		}
	}

	async function handleReclaimLock() {
		isLoading = true;
		errorMessage = '';

		try {
			const result = await nhost.graphql.request(FORCE_RECLAIM_EDIT_LOCK, {
				postId,
				fromUserId: collaborator.contributor.id
			});

			if (result.error) {
				console.error('Error reclaiming lock:', result.error);
				errorMessage = 'Failed to reclaim edit lock';
			} else {
				onUpdate();
				onClose();
			}
		} catch (error) {
			console.error('Error reclaiming lock:', error);
			errorMessage = 'Failed to reclaim edit lock';
		} finally {
			isLoading = false;
		}
	}

	async function handleRemove() {
		isLoading = true;
		errorMessage = '';

		try {
			const result = await nhost.graphql.request(REMOVE_COLLABORATOR, {
				id: collaborator.id
			});

			if (result.error) {
				console.error('Error removing collaborator:', result.error);
				errorMessage = 'Failed to remove collaborator';
			} else {
				onUpdate();
				onClose();
			}
		} catch (error) {
			console.error('Error removing collaborator:', error);
			errorMessage = 'Failed to remove collaborator';
		} finally {
			isLoading = false;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	function goToProfile() {
		if (collaborator.contributor.handle) {
			window.location.href = `/u/${collaborator.contributor.handle}`;
		}
	}
</script>

{#if isOpen}
	<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
		<div class="modal-content" role="dialog" aria-modal="true">
			<div class="modal-header">
				<div class="collaborator-info">
					{#if collaborator.contributor.avatar_url}
						<img
							src={collaborator.contributor.avatar_url}
							alt={collaborator.contributor.display_name}
							class="avatar"
						/>
					{:else}
						<div class="avatar-placeholder">
							{collaborator.contributor.display_name?.charAt(0).toUpperCase() || '?'}
						</div>
					{/if}
					<div>
						<h3>{collaborator.contributor.display_name}</h3>
						{#if collaborator.contributor.handle}
							<p class="handle">@{collaborator.contributor.handle}</p>
						{/if}
					</div>
				</div>
				<button class="close-btn" onclick={onClose} aria-label="Close">
					<X size={20} />
				</button>
			</div>

			<div class="modal-body">
				{#if errorMessage}
					<div class="error-message">{errorMessage}</div>
				{/if}

				<!-- View Profile -->
				{#if collaborator.contributor.handle}
					<button class="menu-item" onclick={goToProfile}>
						<User size={18} />
						<span>View Profile</span>
					</button>
				{/if}

				<!-- Change Role -->
				{#if canChangeRole}
					<div class="role-section">
						<label for="role-select">
							<Shield size={18} />
							<span>Role</span>
						</label>
						<select id="role-select" bind:value={selectedRole} disabled={isLoading}>
							<option value="viewer">Viewer (read-only)</option>
							<option value="editor">Editor (can edit)</option>
							{#if isAuthor}
								<option value="co-author">Co-Author (can manage)</option>
							{/if}
						</select>
						{#if selectedRole !== collaborator.role}
							<Button variant="primary" size="sm" onclick={handleRoleChange} disabled={isLoading}>
								Save Role Change
							</Button>
						{/if}
					</div>
				{:else if collaborator.contributor.id === authorId}
					<div class="role-badge author-badge">
						<Shield size={16} />
						<span>Author</span>
					</div>
				{:else}
					<div class="role-badge">
						<span class="role-label">{collaborator.role}</span>
					</div>
				{/if}

				<!-- Reclaim Edit Lock -->
				{#if canReclaimLock}
					<button class="menu-item danger" onclick={handleReclaimLock} disabled={isLoading}>
						<Lock size={18} />
						<span>Reclaim Edit Control</span>
					</button>
				{/if}

				<!-- Remove Collaborator -->
				{#if canRemove}
					{#if !showRemoveConfirm}
						<button class="menu-item danger" onclick={() => (showRemoveConfirm = true)}>
							<Trash2 size={18} />
							<span>Remove Collaborator</span>
						</button>
					{:else}
						<div class="remove-confirm">
							<p class="warning-text">
								Remove {collaborator.contributor.display_name}? They will lose access to this draft.
								If they have contributed content, consider crediting them.
							</p>
							<div class="confirm-actions">
								<Button variant="secondary" size="sm" onclick={() => (showRemoveConfirm = false)}>
									Cancel
								</Button>
								<Button variant="danger" size="sm" onclick={handleRemove} disabled={isLoading}>
									Remove
								</Button>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		width: 100%;
		max-width: 400px;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.collaborator-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
	}

	.avatar,
	.avatar-placeholder {
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.avatar {
		object-fit: cover;
	}

	.avatar-placeholder {
		background: var(--color-primary);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 1.25rem;
	}

	.collaborator-info h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.handle {
		margin: 0.25rem 0 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.close-btn {
		background: none;
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.close-btn:hover {
		background: var(--color-surface-alt);
		color: var(--color-text);
	}

	.modal-body {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.error-message {
		padding: 0.75rem;
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-danger);
		font-size: 0.875rem;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		color: var(--color-text);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		width: 100%;
		text-align: left;
	}

	.menu-item:hover:not(:disabled) {
		background: var(--color-surface-alt);
		border-color: var(--color-primary);
	}

	.menu-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.menu-item.danger {
		border-color: color-mix(in srgb, var(--color-danger) 30%, transparent);
		color: var(--color-danger);
	}

	.menu-item.danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		border-color: var(--color-danger);
	}

	.role-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		background: var(--color-surface-alt);
	}

	.role-section label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.role-section select {
		padding: 0.625rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.role-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.role-badge.author-badge {
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.role-label {
		text-transform: capitalize;
	}

	.remove-confirm {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
		border-radius: var(--border-radius-sm);
	}

	.warning-text {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text);
		line-height: 1.5;
	}

	.confirm-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	@media (max-width: 640px) {
		.modal-content {
			max-width: 100%;
		}
	}
</style>
