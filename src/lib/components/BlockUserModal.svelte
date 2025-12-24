<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { BLOCK_USER, CHECK_BLOCK_STATUS } from '$lib/graphql/queries';
	import { X, Ban, Loader2 } from '@lucide/svelte';

	interface Props {
		isOpen: boolean;
		targetUser: {
			id: string;
			display_name?: string | null;
			handle?: string | null;
			avatar_url?: string | null;
		};
		currentUserId: string;
		onClose: () => void;
		onSuccess?: () => void;
	}

	let { isOpen, targetUser, currentUserId, onClose, onSuccess }: Props = $props();

	let blockCollaboration = $state(true);
	let blockFollowing = $state(true);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Check existing block status when modal opens
	$effect(() => {
		if (isOpen && currentUserId && targetUser.id) {
			checkExistingBlock();
		}
	});

	async function checkExistingBlock() {
		try {
			const result = await nhost.graphql.request(CHECK_BLOCK_STATUS, {
				userId: currentUserId,
				otherUserId: targetUser.id
			});

			const existingBlock = result.data?.my_block?.[0];
			if (existingBlock) {
				blockCollaboration = existingBlock.block_collaboration_requests;
				blockFollowing = existingBlock.block_following;
			} else {
				blockCollaboration = true;
				blockFollowing = true;
			}
		} catch (err) {
			console.error('Error checking block status:', err);
		}
	}

	async function handleSubmit() {
		if (isSubmitting) return;
		if (!blockCollaboration && !blockFollowing) {
			error = 'Please select at least one blocking option';
			return;
		}

		isSubmitting = true;
		error = null;

		try {
			const result = await nhost.graphql.request(BLOCK_USER, {
				blockerId: currentUserId,
				blockedId: targetUser.id,
				blockCollaboration,
				blockFollowing
			});

			if (result.error) {
				throw new Error('Failed to block user');
			}

			onSuccess?.();
			onClose();
		} catch (err: any) {
			error = err.message || 'Failed to block user';
			console.error('Error blocking user:', err);
		} finally {
			isSubmitting = false;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
		<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<div class="modal-header">
				<h2 id="modal-title">Block User</h2>
				<button class="close-button" onclick={onClose} aria-label="Close modal">
					<X size="20" />
				</button>
			</div>

			<div class="modal-body">
				<div class="target-user">
					{#if targetUser.avatar_url}
						<img src={targetUser.avatar_url} alt="" class="user-avatar" />
					{:else}
						<div class="user-avatar placeholder">
							{(targetUser.display_name || targetUser.handle || '?')[0].toUpperCase()}
						</div>
					{/if}
					<div class="user-info">
						<div class="user-name">
							{targetUser.display_name || targetUser.handle || 'Anonymous'}
						</div>
						{#if targetUser.handle}
							<div class="user-handle">@{targetUser.handle}</div>
						{/if}
					</div>
				</div>

				<p class="description">
					Select what you want to block. Blocked users can still see your public posts,
					but they won't receive notifications about your content.
				</p>

				<div class="options">
					<label class="option">
						<input type="checkbox" bind:checked={blockCollaboration} />
						<div class="option-content">
							<span class="option-title">Block contact requests</span>
							<span class="option-desc">
								This user cannot send you collaboration contact requests
							</span>
						</div>
					</label>

					<label class="option">
						<input type="checkbox" bind:checked={blockFollowing} />
						<div class="option-content">
							<span class="option-title">Block following</span>
							<span class="option-desc">
								This user cannot follow you. If they currently follow you, they will be removed.
							</span>
						</div>
					</label>
				</div>

				{#if error}
					<div class="error-message">{error}</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="btn-secondary" onclick={onClose} disabled={isSubmitting}>
					Cancel
				</button>
				<button
					class="btn-danger"
					onclick={handleSubmit}
					disabled={isSubmitting || (!blockCollaboration && !blockFollowing)}
				>
					{#if isSubmitting}
						<Loader2 size="16" class="spinning" />
						Blocking...
					{:else}
						<Ban size="16" />
						Block User
					{/if}
				</button>
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
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--color-surface);
		border-radius: var(--border-radius-lg);
		width: 100%;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
		border: 1px solid var(--color-border);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.close-button {
		background: none;
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.close-button:hover {
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.target-user {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-md);
		margin-bottom: 1.25rem;
	}

	.user-avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
	}

	.user-avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-primary);
		color: white;
		font-weight: 600;
		font-size: 1.25rem;
	}

	.user-info {
		flex: 1;
	}

	.user-name {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.user-handle {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.description {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0 0 1.25rem 0;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.option {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
	}

	.option:hover {
		border-color: var(--color-border);
	}

	.option:has(input:checked) {
		background: color-mix(in srgb, #ef4444 8%, transparent);
		border-color: color-mix(in srgb, #ef4444 30%, transparent);
	}

	.option input[type='checkbox'] {
		width: 18px;
		height: 18px;
		margin-top: 2px;
		cursor: pointer;
		accent-color: #ef4444;
	}

	.option-content {
		flex: 1;
	}

	.option-title {
		display: block;
		font-weight: 500;
		color: var(--color-text-primary);
		margin-bottom: 0.25rem;
	}

	.option-desc {
		display: block;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.error-message {
		margin-top: 1rem;
		padding: 0.75rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
		border-radius: var(--border-radius-sm);
		font-size: 0.875rem;
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--color-border);
	}

	.btn-secondary,
	.btn-danger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		border-radius: var(--border-radius-md);
		font-weight: 500;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border-color: var(--color-border);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-surface-alt);
	}

	.btn-danger {
		background: #ef4444;
		color: white;
	}

	.btn-danger:hover:not(:disabled) {
		background: #dc2626;
		transform: translateY(-1px);
	}

	.btn-secondary:disabled,
	.btn-danger:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	:global(.spinning) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 480px) {
		.modal-content {
			max-height: 90vh;
		}

		.modal-header,
		.modal-body,
		.modal-footer {
			padding: 1rem;
		}
	}
</style>
