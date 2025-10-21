<script lang="ts">
	import { CheckCircle, XCircle } from '@lucide/svelte';
	import { formatTimeAgo } from '$lib/utils/time';

	type Message = {
		id: string;
		post_id: string;
		sender_id: string;
		message_type: 'text' | 'system' | 'edit_request' | 'role_request';
		content: string;
		metadata?: {
			requester_id?: string;
			current_holder_id?: string;
			discussion_title?: string;
			status?: 'pending' | 'approved' | 'denied';
			denial_message?: string;
			event_type?: string;
			editor_id?: string;
			collaborator_id?: string;
			role?: string;
		};
		created_at: string;
		sender: {
			id: string;
			display_name: string;
			handle: string | null;
			avatar_url: string | null;
		};
	};

	let {
		message,
		currentUserId,
		showHeader = true,
		isProcessing = false,
		onApproveEditRequest,
		onDenyEditRequest
	} = $props<{
		message: Message;
		currentUserId: string;
		showHeader?: boolean;
		isProcessing?: boolean;
		onApproveEditRequest?: (messageId: string) => void;
		onDenyEditRequest?: (messageId: string) => void;
	}>();

	const isOwnMessage = $derived(message.sender_id === currentUserId);
	const isSystemMessage = $derived(message.message_type === 'system');
	const isEditRequest = $derived(message.message_type === 'edit_request');
	const isRoleRequest = $derived(message.message_type === 'role_request');

	const isPendingRequest = $derived(
		(isEditRequest || isRoleRequest) && message.metadata?.status === 'pending'
	);

	const isApprovedRequest = $derived(
		(isEditRequest || isRoleRequest) && message.metadata?.status === 'approved'
	);

	const isDeniedRequest = $derived(
		(isEditRequest || isRoleRequest) && message.metadata?.status === 'denied'
	);

	// Check if current user can approve this request (must be the current holder or author)
	const canApprove = $derived(
		isPendingRequest &&
			(message.metadata?.current_holder_id === currentUserId || message.sender_id !== currentUserId)
	);

	function handleApprove() {
		if (onApproveEditRequest && canApprove) {
			onApproveEditRequest(message.id);
		}
	}

	function handleDeny() {
		if (onDenyEditRequest && canApprove) {
			onDenyEditRequest(message.id);
		}
	}
</script>

<div
	class="message-item {message.message_type} {isOwnMessage ? 'own' : 'other'}"
	class:system={isSystemMessage}
	class:request={isEditRequest || isRoleRequest}
	class:grouped={!showHeader && !isSystemMessage}
>
	{#if !isSystemMessage && showHeader}
		<div class="message-avatar">
			{#if message.sender.avatar_url}
				<img src={message.sender.avatar_url} alt={message.sender.display_name} />
			{:else}
				<div class="avatar-placeholder">
					{message.sender.display_name?.charAt(0).toUpperCase() || '?'}
				</div>
			{/if}
		</div>
	{:else if !isSystemMessage && !showHeader}
		<div class="message-avatar-spacer"></div>
	{/if}

	<div class="message-body">
		{#if !isSystemMessage && showHeader}
			<div class="message-header">
				<span class="sender-name">{message.sender.display_name}</span>
				<span class="message-time">{formatTimeAgo(message.created_at)}</span>
			</div>
		{/if}

		<div class="message-content">
			{#if isEditRequest}
				<div class="request-card edit-request">
					<div class="request-icon">🔐</div>
					<div class="request-text">
						<strong>{message.sender.display_name}</strong> is requesting edit control
					</div>

					{#if isPendingRequest && canApprove}
						<div class="request-actions">
							<button
								type="button"
								class="action-approve"
								onclick={handleApprove}
								disabled={isProcessing}
							>
								<CheckCircle size={16} />
								Approve
							</button>
							<button
								type="button"
								class="action-deny"
								onclick={handleDeny}
								disabled={isProcessing}
							>
								<XCircle size={16} />
								Deny
							</button>
						</div>
					{:else if isApprovedRequest}
						<div class="request-status approved">
							<CheckCircle size={16} />
							Approved
						</div>
					{:else if isDeniedRequest}
						<div class="request-status denied">
							<XCircle size={16} />
							Denied
							{#if message.metadata?.denial_message}
								<span class="denial-reason">— {message.metadata.denial_message}</span>
							{/if}
						</div>
					{/if}
				</div>
			{:else if isRoleRequest}
				<div class="request-card role-request">
					<div class="request-icon">👤</div>
					<div class="request-text">
						<strong>{message.sender.display_name}</strong> is requesting
						{message.metadata?.requested_role || 'editor'} role
					</div>

					{#if isPendingRequest && canApprove}
						<div class="request-actions">
							<button
								type="button"
								class="action-approve"
								onclick={handleApprove}
								disabled={isProcessing}
							>
								<CheckCircle size={16} />
								Approve
							</button>
							<button
								type="button"
								class="action-deny"
								onclick={handleDeny}
								disabled={isProcessing}
							>
								<XCircle size={16} />
								Deny
							</button>
						</div>
					{:else if isApprovedRequest}
						<div class="request-status approved">
							<CheckCircle size={16} />
							Approved
						</div>
					{:else if isDeniedRequest}
						<div class="request-status denied">
							<XCircle size={16} />
							Denied
						</div>
					{/if}
				</div>
			{:else}
				<p class="message-text">{message.content}</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.message-item {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 0;
		animation: fadeIn 0.2s ease;
	}

	.message-item.own {
		flex-direction: row-reverse;
	}

	.message-item.grouped {
		padding: 0.25rem 0;
	}

	.message-avatar-spacer {
		flex-shrink: 0;
		width: 32px;
		height: 0;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.message-item.system {
		justify-content: center;
		padding: 0.5rem 0;
		width: 100%;
	}

	.message-item.system .message-body {
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		border-radius: var(--border-radius-sm);
		padding: 0.5rem 1rem;
		text-align: center;
		width: 100%;
	}

	.message-item.system .message-content {
		font-size: 0.625rem;
		color: var(--color-text-secondary);
		font-style: italic;
		text-align: center;
		margin: 0;
		padding: 0;
	}

	.message-avatar {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		overflow: hidden;
	}

	.message-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-primary);
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.message-body {
		flex: 1;
		min-width: 0;
	}

	.message-header {
		display: flex;
		align-items: center;
		width: 100%;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.own .message-header {
		display: flex;
		flex-direction: row-reverse;
		justify-content: right;
		/*justify-content: flex-end;*/
	}

	.sender-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--color-text-primary);
	}

	.message-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.message-content {
		font-size: 0.9375rem;
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	.message-text {
		margin: 0;
		word-wrap: break-word;
	}

	.message-item.own .message-body {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.message-item.own .message-text {
		background: var(--color-secondary);
		color: white;
		padding: 0.5rem 0.75rem;
		border-radius: var(--border-radius-md);
		max-width: 80%;
		text-align: right;
	}

	.message-item.other .message-text {
		background: var(--color-surface);
		padding: 0.5rem 0.75rem;
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border);
		max-width: 80%;
	}

	.request-card {
		background: color-mix(in srgb, var(--color-warning) 8%, var(--color-surface));
		border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
		border-radius: var(--border-radius-md);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.request-icon {
		font-size: 1.5rem;
		text-align: center;
	}

	.request-text {
		font-size: 0.9375rem;
		text-align: center;
		color: var(--color-text-primary);
	}

	.request-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.action-approve,
	.action-deny {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		border: 1px solid transparent;
	}

	.action-approve {
		background: var(--color-success);
		color: white;
		border-color: var(--color-success);
	}

	.action-approve:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-success) 85%, black);
	}

	.action-deny {
		background: transparent;
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.action-deny:hover:not(:disabled) {
		background: var(--color-error);
		color: white;
	}

	.action-approve:disabled,
	.action-deny:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.request-status {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.5rem;
	}

	.request-status.approved {
		color: var(--color-success);
	}

	.request-status.denied {
		color: var(--color-error);
	}

	.denial-reason {
		font-weight: 400;
		font-style: italic;
		color: var(--color-text-secondary);
	}
</style>
