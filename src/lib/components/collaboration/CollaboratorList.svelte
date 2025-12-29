<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { GET_POST_COLLABORATORS, REMOVE_POST_COLLABORATOR } from '$lib/graphql/queries';
	import {
		getCollaboratorRoleLabel,
		getCollaborationStatusLabel,
		getCollaborationStatusColor,
		getCollaboratorRoleColor
	} from '$lib/utils/collaborationPermissions';
	import { UserMinus, Loader2 } from '@lucide/svelte';
	import { onMount } from 'svelte';

	interface Props {
		postId: string;
		isOwner: boolean;
		onCollaboratorsChange?: () => void;
	}

	let { postId, isOwner, onCollaboratorsChange }: Props = $props();

	let collaborators = $state<any[]>([]);
	let isLoading = $state(true);
	let removingId = $state<string | null>(null);

	onMount(() => {
		loadCollaborators();
	});

	async function loadCollaborators() {
		isLoading = true;
		try {
			const result = await nhost.graphql.request(GET_POST_COLLABORATORS, {
				postId
			});

			if (result.error) {
				console.error('Error loading collaborators:', result.error);
				collaborators = [];
			} else {
				collaborators = result.data?.post_collaborator || [];
			}
		} catch (error) {
			console.error('Error in loadCollaborators:', error);
			collaborators = [];
		} finally {
			isLoading = false;
		}
	}

	async function removeCollaborator(collaboratorId: string) {
		if (!confirm('Are you sure you want to remove this collaborator?')) {
			return;
		}

		removingId = collaboratorId;

		try {
			const result = await nhost.graphql.request(REMOVE_POST_COLLABORATOR, {
				id: collaboratorId
			});

			if (result.error) {
				console.error('Error removing collaborator:', result.error);
				alert('Failed to remove collaborator');
			} else {
				// Remove from local state
				collaborators = collaborators.filter((c) => c.id !== collaboratorId);
				onCollaboratorsChange?.();
			}
		} catch (error) {
			console.error('Error in removeCollaborator:', error);
			alert('Failed to remove collaborator');
		} finally {
			removingId = null;
		}
	}

	// Expose refresh method for parent components
	export function refresh() {
		loadCollaborators();
	}
</script>

<div class="collaborator-list">
	{#if isLoading}
		<div class="loading">
			<Loader2 size="20" class="spinning" />
			<span>Loading collaborators...</span>
		</div>
	{:else if collaborators.length === 0}
		<div class="empty-state">
			<p>No collaborators yet</p>
		</div>
	{:else}
		<div class="collaborators">
			{#each collaborators as collaborator (collaborator.id)}
				<div class="collaborator-item">
					<div class="collaborator-info">
						<div class="collaborator-name">
							{collaborator.contributor.display_name ||
								collaborator.contributor.handle ||
								'Anonymous'}
						</div>
						{#if collaborator.contributor.handle}
							<div class="collaborator-handle">@{collaborator.contributor.handle}</div>
						{/if}
						<div class="collaborator-meta">
							<span
								class="status-badge"
								style="background-color: {getCollaborationStatusColor(collaborator.status)}22;
                       color: {getCollaborationStatusColor(collaborator.status)};"
							>
								{getCollaborationStatusLabel(collaborator.status)}
							</span>
							<span
								class="role-badge"
								style="background-color: {getCollaboratorRoleColor(collaborator.role)}22;
                       color: {getCollaboratorRoleColor(collaborator.role)};"
							>
								{getCollaboratorRoleLabel(collaborator.role)}
							</span>
						</div>
					</div>

					{#if isOwner}
						<button
							class="remove-button"
							onclick={() => removeCollaborator(collaborator.id)}
							disabled={removingId === collaborator.id}
							aria-label="Remove collaborator"
							title="Remove collaborator"
						>
							{#if removingId === collaborator.id}
								<Loader2 size="16" class="spinning" />
							{:else}
								<UserMinus size="16" />
							{/if}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.collaborator-list {
		width: 100%;
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
	}

	.empty-state p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}

	.collaborators {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.collaborator-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		background: var(--card-bg);
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.collaborator-item:hover {
		border-color: var(--primary-color);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	}

	.collaborator-info {
		flex: 1;
		min-width: 0;
	}

	.collaborator-name {
		font-weight: 500;
		color: var(--text-color);
		margin-bottom: 0.25rem;
	}

	.collaborator-handle {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-bottom: 0.5rem;
	}

	.collaborator-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.status-badge,
	.role-badge {
		display: inline-block;
		padding: 0.25rem 0.625rem;
		border-radius: var(--border-radius-md);
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: capitalize;
	}

	.remove-button {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		background: transparent;
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
		margin-left: 0.75rem;
	}

	.remove-button:hover:not(:disabled) {
		background: #fee;
		border-color: #fcc;
		color: #c33;
	}

	.remove-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.remove-button :global(.spinning) {
		animation: spin 1s linear infinite;
	}

	@media (max-width: 640px) {
		.collaborator-item {
			flex-direction: column;
			align-items: flex-start;
		}

		.remove-button {
			align-self: flex-end;
			margin-left: 0;
			margin-top: 0.75rem;
		}
	}
</style>
