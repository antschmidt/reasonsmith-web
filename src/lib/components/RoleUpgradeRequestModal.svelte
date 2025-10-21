<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { APPROVE_ROLE_UPGRADE_REQUEST, DENY_ROLE_UPGRADE_REQUEST } from '$lib/graphql/queries';
	import { X, Shield, CheckCircle, XCircle } from '@lucide/svelte';
	import Button from './ui/Button.svelte';

	type Notification = {
		id: string;
		type: string;
		actor_id: string | null;
		metadata: {
			requester_id: string;
			post_id: string;
			discussion_title: string;
			requested_role: string;
		};
		post: {
			post_collaborators: Array<{
				id: string;
				contributor_id: string;
			}>;
		} | null;
	};

	let { notification, isOpen, onClose, onUpdate } = $props<{
		notification: Notification;
		isOpen: boolean;
		onClose: () => void;
		onUpdate: () => void;
	}>();

	let isLoading = $state(false);
	let errorMessage = $state('');

	// Find the collaborator record for the requester
	const collaboratorId = $derived(
		notification.post?.post_collaborators?.find(
			(pc) => pc.contributor_id === notification.metadata.requester_id
		)?.id
	);

	async function handleApprove() {
		if (!collaboratorId) {
			errorMessage = 'Could not find collaborator record';
			return;
		}

		isLoading = true;
		errorMessage = '';

		try {
			const result = await nhost.graphql.request(APPROVE_ROLE_UPGRADE_REQUEST, {
				notificationId: notification.id,
				collaboratorId,
				newRole: notification.metadata.requested_role
			});

			if (result.error) {
				console.error('Error approving role upgrade request:', result.error);
				errorMessage = 'Failed to approve request';
			} else {
				onUpdate();
				onClose();
			}
		} catch (error) {
			console.error('Error approving role upgrade request:', error);
			errorMessage = 'Failed to approve request';
		} finally {
			isLoading = false;
		}
	}

	async function handleDeny() {
		isLoading = true;
		errorMessage = '';

		try {
			const result = await nhost.graphql.request(DENY_ROLE_UPGRADE_REQUEST, {
				notificationId: notification.id
			});

			if (result.error) {
				console.error('Error denying role upgrade request:', result.error);
				errorMessage = 'Failed to deny request';
			} else {
				onUpdate();
				onClose();
			}
		} catch (error) {
			console.error('Error denying role upgrade request:', error);
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

	function getRoleDisplayName(role: string): string {
		switch (role) {
			case 'editor':
				return 'Editor';
			case 'co-author':
				return 'Co-Author';
			default:
				return role;
		}
	}
</script>

{#if isOpen}
	<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
		<div class="modal-content" role="dialog" aria-modal="true">
			<div class="modal-header">
				<div class="header-icon">
					<Shield size={24} />
				</div>
				<h2>Role Upgrade Request</h2>
				<button class="close-btn" onclick={onClose} aria-label="Close">
					<X size={20} />
				</button>
			</div>

			<div class="modal-body">
				{#if errorMessage}
					<div class="error-message">{errorMessage}</div>
				{/if}

				<div class="request-message">
					<p>
						<strong>Requester</strong> is requesting
						<strong>{getRoleDisplayName(notification.metadata.requested_role)}</strong> role for:
					</p>
					<p class="discussion-title">Comment on "{notification.metadata.discussion_title}"</p>

					<div class="role-info">
						<p class="info-label">This will allow them to:</p>
						<ul>
							{#if notification.metadata.requested_role === 'editor'}
								<li>Request edit control and modify content</li>
								<li>View and edit draft versions</li>
							{:else if notification.metadata.requested_role === 'co-author'}
								<li>Edit content and manage collaborators</li>
								<li>Reclaim locks from editors (not from you)</li>
								<li>Invite new collaborators</li>
							{/if}
						</ul>
					</div>
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
						Approve & Upgrade Role
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
		border-radius: 12px;
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
		border-radius: 6px;
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
		border-radius: 6px;
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
		border-radius: 6px;
		border-left: 3px solid var(--color-primary);
		margin-bottom: 1rem;
	}

	.role-info {
		padding: 1rem;
		background: color-mix(in srgb, var(--color-success) 10%, transparent);
		border-radius: 6px;
		border-left: 3px solid var(--color-success);
	}

	.info-label {
		margin: 0 0 0.5rem 0;
		font-weight: 600;
		color: var(--text-color);
		font-size: 0.875rem;
	}

	.role-info ul {
		margin: 0;
		padding-left: 1.5rem;
		color: var(--text-color);
	}

	.role-info li {
		margin: 0.25rem 0;
		font-size: 0.875rem;
		line-height: 1.5;
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
