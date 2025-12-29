<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { GET_MY_COLLABORATION_INVITES, UPDATE_COLLABORATION_STATUS } from '$lib/graphql/queries';
	import {
		getCollaboratorRoleLabel,
		getCollaboratorRoleColor
	} from '$lib/utils/collaborationPermissions';
	import { Check, X, Loader2, FileText } from '@lucide/svelte';
	import { onMount } from 'svelte';

	interface Props {
		onInviteResponded?: () => void;
	}

	let { onInviteResponded }: Props = $props();

	let invites = $state<any[]>([]);
	let isLoading = $state(true);
	let respondingId = $state<string | null>(null);

	onMount(() => {
		loadInvites();
	});

	async function loadInvites() {
		isLoading = true;
		try {
			const userId = nhost.auth.getUser()?.id;
			if (!userId) {
				invites = [];
				return;
			}

			const result = await nhost.graphql.request(GET_MY_COLLABORATION_INVITES, {
				userId
			});

			if (result.error) {
				console.error('Error loading invites:', result.error);
				invites = [];
			} else {
				invites = result.data?.post_collaborator || [];
			}
		} catch (error) {
			console.error('Error in loadInvites:', error);
			invites = [];
		} finally {
			isLoading = false;
		}
	}

	async function respondToInvite(inviteId: string, status: 'accepted' | 'declined') {
		respondingId = inviteId;

		try {
			const result = await nhost.graphql.request(UPDATE_COLLABORATION_STATUS, {
				id: inviteId,
				status,
				respondedAt: new Date().toISOString()
			});

			if (result.error) {
				console.error('Error responding to invite:', result.error);
				alert('Failed to respond to invitation');
			} else {
				// Remove from local state
				invites = invites.filter((invite) => invite.id !== inviteId);
				onInviteResponded?.();
			}
		} catch (error) {
			console.error('Error in respondToInvite:', error);
			alert('Failed to respond to invitation');
		} finally {
			respondingId = null;
		}
	}
</script>

<div class="collaboration-invites">
	<h3 class="section-title">Collaboration Invites</h3>

	{#if isLoading}
		<div class="loading">
			<Loader2 size="20" class="spinning" />
			<span>Loading invitations...</span>
		</div>
	{:else if invites.length === 0}
		<div class="empty-state">
			<p>No pending collaboration invites</p>
		</div>
	{:else}
		<div class="invites-list">
			{#each invites as invite (invite.id)}
				<div class="invite-card">
					<div class="invite-icon">
						<FileText size="20" />
					</div>

					<div class="invite-content">
						<div class="invite-header">
							<div class="invite-from">
								<span class="label">By:</span>
								<a href="/u/{invite.inviter.handle || invite.inviter.id}" class="inviter-link">
									{invite.inviter.display_name || invite.inviter.handle || 'Anonymous'}
								</a>
							</div>
							<span
								class="role-badge"
								style="background-color: {getCollaboratorRoleColor(invite.role)}22;
                       color: {getCollaboratorRoleColor(invite.role)};"
							>
								{getCollaboratorRoleLabel(invite.role)}
							</span>
						</div>

						{#if invite.post.discussion}
							<div class="invite-discussion">
								<a href="/discussions/{invite.post.discussion_id}" class="discussion-link">
									{invite.post.discussion.discussion_versions?.[0]?.title || 'Untitled Discussion'}
								</a>
							</div>
						{/if}

						<div class="invite-post">
							{#if invite.post.draft_content}
								<div class="post-content">
									{@html invite.post.draft_content}
								</div>
							{:else}
								<span class="post-title">Untitled post</span>
							{/if}
						</div>

						<div class="invite-actions">
							<button
								class="accept-button"
								onclick={() => respondToInvite(invite.id, 'accepted')}
								disabled={respondingId === invite.id}
								aria-label="Accept invitation"
							>
								{#if respondingId === invite.id}
									<Loader2 size="16" class="spinning" />
								{:else}
									<Check size="16" />
								{/if}
								Accept
							</button>

							<button
								class="decline-button"
								onclick={() => respondToInvite(invite.id, 'declined')}
								disabled={respondingId === invite.id}
								aria-label="Decline invitation"
							>
								{#if respondingId === invite.id}
									<Loader2 size="16" class="spinning" />
								{:else}
									<X size="16" />
								{/if}
								Decline
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.collaboration-invites {
		width: 100%;
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 1rem;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}

	.loading :global(.spinning) {
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

	.empty-state {
		padding: 2rem;
		text-align: center;
		background: var(--card-bg);
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius-sm);
	}

	.empty-state p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}

	.invites-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.invite-card {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: var(--card-bg);
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.invite-card:hover {
		border-color: var(--color-link);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	}

	.invite-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: var(--color-link);
		color: white;
		border-radius: var(--border-radius-sm);
		flex-shrink: 0;
	}

	.invite-content {
		flex: 1;
		min-width: 0;
	}

	.invite-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.invite-from {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.label {
		font-size: 0.75rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.inviter-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-weight: 500;
		color: var(--color-link);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.inviter-link:hover {
		color: var(--color-link-hover);
		text-decoration: underline;
	}

	.name {
		font-weight: 500;
		color: var(--text-color);
	}

	.handle {
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.role-badge {
		display: inline-block;
		padding: 0.25rem 0.625rem;
		border-radius: var(--border-radius-md);
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: capitalize;
	}

	.invite-discussion {
		margin-bottom: 0.625rem;
	}

	.discussion-link {
		display: inline-block;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-link);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.discussion-link:hover {
		color: var(--color-link-hover);
		text-decoration: underline;
	}

	.invite-post {
		margin-bottom: 0.75rem;
	}

	.post-content {
		font-size: 0.875rem;
		color: var(--text-color);
		line-height: 1.6;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
	}

	.post-content :global(p) {
		margin: 0.25rem 0;
	}

	.post-content :global(h1),
	.post-content :global(h2),
	.post-content :global(h3) {
		margin: 0.25rem 0;
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.post-content :global(blockquote) {
		margin: 0.25rem 0;
		padding-left: 0.75rem;
		border-left: 2px solid var(--border-color);
		font-style: italic;
	}

	.post-content :global(a) {
		color: var(--color-link);
		text-decoration: none;
	}

	.post-content :global(a:hover) {
		color: var(--color-link-hover);
		text-decoration: underline;
	}

	.post-title {
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.5;
		font-style: italic;
	}

	.invite-actions {
		display: flex;
		gap: 0.5rem;
	}

	.accept-button,
	.decline-button {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		border: 1px solid;
		border-radius: var(--border-radius-sm);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.accept-button {
		background: var(--primary-color);
		border-color: var(--primary-color);
		color: white;
	}

	.accept-button:hover:not(:disabled) {
		background: var(--primary-hover);
		border-color: var(--primary-hover);
		transform: translateY(-1px);
	}

	.decline-button {
		background: transparent;
		border-color: var(--border-color);
		color: var(--text-color);
	}

	.decline-button:hover:not(:disabled) {
		background: #fee;
		border-color: #fcc;
		color: #c33;
	}

	.accept-button:disabled,
	.decline-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.accept-button :global(.spinning),
	.decline-button :global(.spinning) {
		animation: spin 1s linear infinite;
	}

	@media (max-width: 640px) {
		.invite-card {
			flex-direction: column;
		}

		.invite-icon {
			align-self: flex-start;
		}

		.invite-actions {
			flex-direction: column;
		}

		.accept-button,
		.decline-button {
			width: 100%;
			justify-content: center;
		}
	}
</style>
