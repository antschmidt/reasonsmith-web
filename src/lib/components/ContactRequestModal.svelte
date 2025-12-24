<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { SEND_CONTACT_REQUEST } from '$lib/graphql/queries';
	import { X, Send, Loader2 } from '@lucide/svelte';

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

	let requestNote = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	const MAX_NOTE_LENGTH = 500;

	async function handleSubmit() {
		if (isSubmitting) return;

		isSubmitting = true;
		error = null;

		try {
			const result = await nhost.graphql.request(SEND_CONTACT_REQUEST, {
				requesterId: currentUserId,
				targetId: targetUser.id,
				requestNote: requestNote.trim() || null
			});

			if (result.error) {
				throw new Error('Failed to send contact request');
			}

			requestNote = '';
			onSuccess?.();
			onClose();
		} catch (err: any) {
			error = err.message || 'Failed to send request';
			console.error('Error sending contact request:', err);
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

	$effect(() => {
		if (isOpen) {
			requestNote = '';
			error = null;
		}
	});
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
		<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<div class="modal-header">
				<h2 id="modal-title">Add to Contacts</h2>
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

				<div class="form-group">
					<label for="request-note">
						Add a note <span class="optional">(optional)</span>
					</label>
					<textarea
						id="request-note"
						bind:value={requestNote}
						placeholder="Introduce yourself or explain why you'd like to connect..."
						maxlength={MAX_NOTE_LENGTH}
						rows="4"
					></textarea>
					<div class="char-count">
						{requestNote.length}/{MAX_NOTE_LENGTH}
					</div>
				</div>

				{#if error}
					<div class="error-message">{error}</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="btn-secondary" onclick={onClose} disabled={isSubmitting}>
					Cancel
				</button>
				<button class="btn-primary" onclick={handleSubmit} disabled={isSubmitting}>
					{#if isSubmitting}
						<Loader2 size="16" class="spinning" />
						Sending...
					{:else}
						<Send size="16" />
						Send Request
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
		margin-bottom: 1.5rem;
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

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		font-weight: 500;
		color: var(--color-text-primary);
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
	}

	.optional {
		font-weight: 400;
		color: var(--color-text-secondary);
	}

	.form-group textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		background: var(--color-surface);
		color: var(--color-text-primary);
		font-size: 0.9rem;
		resize: vertical;
		min-height: 100px;
		font-family: inherit;
		transition: border-color 0.2s ease;
	}

	.form-group textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.char-count {
		text-align: right;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin-top: 0.25rem;
	}

	.error-message {
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
	.btn-primary {
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

	.btn-primary {
		background: var(--color-primary);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 85%, black);
		transform: translateY(-1px);
	}

	.btn-secondary:disabled,
	.btn-primary:disabled {
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
