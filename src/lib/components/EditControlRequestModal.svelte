<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { APPROVE_EDIT_CONTROL_REQUEST, DENY_EDIT_CONTROL_REQUEST } from '$lib/graphql/queries';
	import { X, Lock, CheckCircle, XCircle } from '@lucide/svelte';
	import Button from './ui/Button.svelte';

	type Notification = {
		id: string;
		type: string;
		actor_id: string | null;
		metadata: {
			requester_id: string;
			current_holder_id: string;
			post_id: string;
			discussion_title: string;
		};
	};

	let { notification, isAuthor, currentUserId, isOpen, onClose, onUpdate } = $props<{
		notification: Notification;
		isAuthor: boolean;
		currentUserId: string;
		isOpen: boolean;
		onClose: () => void;
		onUpdate: () => void;
	}>();

	let isLoading = $state(false);
	let errorMessage = $state('');

	const isCurrentHolder = $derived(notification.metadata.current_holder_id === currentUserId);

	async function handleApprove() {
		isLoading = true;
		errorMessage = '';

		console.log('[APPROVE] Approving edit control request:', {
			notificationId: notification.id,
			postId: notification.metadata.post_id,
			newEditorId: notification.metadata.requester_id,
			previousEditorId: notification.metadata.current_holder_id
		});

		try {
			const result = await nhost.graphql.request(APPROVE_EDIT_CONTROL_REQUEST, {
				notificationId: notification.id,
				postId: notification.metadata.post_id,
				newEditorId: notification.metadata.requester_id,
				previousEditorId: notification.metadata.current_holder_id,
				now: new Date().toISOString()
			});

			console.log('[APPROVE] Mutation result:', result);

			if (result.error) {
				console.error('Error approving edit control request:', result.error);
				errorMessage = 'Failed to approve request';
			} else {
				console.log('[APPROVE] Success! Updated post:', result.data?.update_post_by_pk);
				onUpdate();
				onClose();
			}
		} catch (error) {
			console.error('Error approving edit control request:', error);
			errorMessage = 'Failed to approve request';
		} finally {
			isLoading = false;
		}
	}

	async function handleDeny() {
		isLoading = true;
		errorMessage = '';

		try {
			const result = await nhost.graphql.request(DENY_EDIT_CONTROL_REQUEST, {
				notificationId: notification.id,
				requesterId: notification.metadata.requester_id,
				postId: notification.metadata.post_id
			});

			if (result.error) {
				console.error('Error denying edit control request:', result.error);
				errorMessage = 'Failed to deny request';
			} else {
				onUpdate();
				onClose();
			}
		} catch (error) {
			console.error('Error denying edit control request:', error);
			errorMessage = 'Failed to deny request';
		} finally {
			isLoading = false;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

{#if isOpen}
	<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
		<div class="modal-content" role="dialog" aria-modal="true">
			<div class="modal-header">
				<div class="header-icon">
					<Lock size={24} />
				</div>
				<h2>Edit Control Request</h2>
				<button class="close-btn" onclick={onClose} aria-label="Close">
					<X size={20} />
				</button>
			</div>

			<div class="modal-body">
				{#if errorMessage}
					<div class="error-message">{errorMessage}</div>
				{/if}

				<div class="request-message">
					{#if isAuthor && !isCurrentHolder}
						<p>
							<strong>Requester</strong> would like to claim edit controls from
							<strong>Current Editor</strong> for:
						</p>
					{:else}
						<p><strong>Requester</strong> is requesting edit controls for:</p>
					{/if}
					<p class="discussion-title">Comment on "{notification.metadata.discussion_title}"</p>
				</div>

				<div class="actions">
					<Button
						variant="primary"
						size="md"
						onclick={handleApprove}
						disabled={isLoading}
						fullWidth={true}
					>
						<CheckCircle size={18} />
						Approve Request
					</Button>
					<Button
						variant="secondary"
						size="md"
						onclick={handleDeny}
						disabled={isLoading}
						fullWidth={true}
					>
						<XCircle size={18} />
						Deny Request
					</Button>
				</div>
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
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	@media (prefers-color-scheme: light) {
		.modal-backdrop {
			background: rgba(255, 255, 255, 0.8);
		}
	}

	.modal-content {
		background: color-mix(in srgb, var(--card-bg) 80%, transparent);
		backdrop-filter: blur(8px);
		border-radius: var(--border-radius-md);
		width: 100%;
		max-width: 500px;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1.5rem;
		border-bottom: 1px solid var(--border-color);
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-color);
		flex: 1;
	}

	.close-btn {
		background: none;
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: var(--hover-bg);
		color: var(--text-color);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.error-message {
		padding: 0.75rem;
		border-radius: var(--border-radius-sm);
		margin-bottom: 1rem;
		font-size: 0.875rem;
		background: #fee;
		color: #c33;
		border: 1px solid #fcc;
	}

	.request-message {
		margin-bottom: 1.5rem;
	}

	.request-message p {
		margin: 0 0 0.5rem 0;
		color: var(--text-color);
		line-height: 1.6;
	}

	.discussion-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-primary);
		font-style: italic;
		padding: 1rem;
		background: var(--hover-bg);
		border-radius: var(--border-radius-sm);
		border-left: 3px solid var(--color-primary);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	@media (max-width: 640px) {
		.modal-content {
			max-height: 90vh;
		}

		.modal-header,
		.modal-body {
			padding: 1rem;
		}
	}
</style>
