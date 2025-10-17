<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import {
		SEARCH_USERS_FOR_COLLABORATION,
		ADD_POST_COLLABORATOR,
		GET_POST_COLLABORATORS
	} from '$lib/graphql/queries';
	import { X, Search, UserPlus, Loader2 } from '@lucide/svelte';

	interface Props {
		postId: string;
		ownerId: string;
		isOpen: boolean;
		onClose: () => void;
		onInviteSent?: () => void;
	}

	let { postId, ownerId, isOpen, onClose, onInviteSent }: Props = $props();

	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let existingCollaborators = $state<any[]>([]);
	let isSearching = $state(false);
	let isInviting = $state(false);
	let selectedRole = $state<'editor' | 'viewer'>('editor');
	let errorMessage = $state('');
	let successMessage = $state('');

	// Fetch existing collaborators when modal opens
	$effect(() => {
		if (isOpen) {
			loadExistingCollaborators();
			// Reset state
			searchQuery = '';
			searchResults = [];
			errorMessage = '';
			successMessage = '';
		}
	});

	async function loadExistingCollaborators() {
		try {
			const result = await nhost.graphql.request(GET_POST_COLLABORATORS, {
				postId
			});

			if (result.error) {
				console.error('Error loading collaborators:', result.error);
				return;
			}

			existingCollaborators = result.data?.post_collaborator || [];
		} catch (error) {
			console.error('Error in loadExistingCollaborators:', error);
		}
	}

	async function handleSearch() {
		if (!searchQuery.trim() || searchQuery.length < 2) {
			searchResults = [];
			return;
		}

		isSearching = true;
		errorMessage = '';

		try {
			const result = await nhost.graphql.request(SEARCH_USERS_FOR_COLLABORATION, {
				searchTerm: `%${searchQuery}%`
			});

			if (result.error) {
				console.error('Search error:', result.error);
				errorMessage = 'Error searching for users';
				searchResults = [];
			} else {
				// Filter out the post owner and existing collaborators
				const allUsers = result.data?.contributor || [];
				const existingIds = new Set([
					ownerId,
					...existingCollaborators.map((c: any) => c.contributor_id)
				]);

				searchResults = allUsers.filter((user: any) => !existingIds.has(user.id));
			}
		} catch (error) {
			console.error('Search error:', error);
			errorMessage = 'Error searching for users';
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	async function inviteCollaborator(contributorId: string) {
		isInviting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const userId = nhost.auth.getUser()?.id;
			if (!userId) {
				errorMessage = 'You must be logged in to invite collaborators';
				return;
			}

			const result = await nhost.graphql.request(ADD_POST_COLLABORATOR, {
				postId,
				contributorId,
				role: selectedRole,
				invitedBy: userId
			});

			if (result.error) {
				console.error('Invite error:', result.error);
				errorMessage = 'Error sending invitation';
			} else {
				successMessage = 'Invitation sent successfully!';
				// Refresh collaborators list and search results
				await loadExistingCollaborators();
				searchResults = searchResults.filter((user: any) => user.id !== contributorId);
				onInviteSent?.();

				// Clear success message after 3 seconds
				setTimeout(() => {
					successMessage = '';
				}, 3000);
			}
		} catch (error) {
			console.error('Invite error:', error);
			errorMessage = 'Error sending invitation';
		} finally {
			isInviting = false;
		}
	}

	function handleClose() {
		onClose();
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	// Debounced search
	let searchTimeout: ReturnType<typeof setTimeout>;
	$effect(() => {
		clearTimeout(searchTimeout);
		if (searchQuery.trim().length >= 2) {
			searchTimeout = setTimeout(handleSearch, 300);
		} else {
			searchResults = [];
		}
	});
</script>

{#if isOpen}
	<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
		<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<div class="modal-header">
				<h2 id="modal-title">Invite Collaborators</h2>
				<button class="close-button" onclick={handleClose} aria-label="Close modal">
					<X size="20" />
				</button>
			</div>

			<div class="modal-body">
				<!-- Role Selection -->
				<div class="role-selection">
					<label for="role-select">Invite as:</label>
					<select id="role-select" bind:value={selectedRole}>
						<option value="editor">Editor (can edit content)</option>
						<option value="viewer">Viewer (can only view)</option>
					</select>
				</div>

				<!-- Search Input -->
				<div class="search-container">
					<div class="search-input-wrapper">
						<Search size="18" class="search-icon" />
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search by username or name..."
							class="search-input"
							aria-label="Search for users"
						/>
						{#if isSearching}
							<Loader2 size="18" class="loading-icon" />
						{/if}
					</div>
				</div>

				<!-- Messages -->
				{#if errorMessage}
					<div class="error-message">{errorMessage}</div>
				{/if}

				{#if successMessage}
					<div class="success-message">{successMessage}</div>
				{/if}

				<!-- Search Results -->
				{#if searchResults.length > 0}
					<div class="search-results">
						<h3>Search Results</h3>
						<ul class="user-list">
							{#each searchResults as user}
								<li class="user-item">
									<div class="user-info">
										<div class="user-name">
											{user.display_name || user.handle || 'Anonymous'}
										</div>
										{#if user.handle}
											<div class="user-handle">@{user.handle}</div>
										{/if}
									</div>
									<button
										class="invite-button"
										onclick={() => inviteCollaborator(user.id)}
										disabled={isInviting}
										aria-label="Invite {user.display_name || user.handle}"
									>
										{#if isInviting}
											<Loader2 size="16" class="spinning" />
										{:else}
											<UserPlus size="16" />
										{/if}
										Invite
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{:else if searchQuery.trim().length >= 2 && !isSearching}
					<div class="no-results">No users found matching "{searchQuery}"</div>
				{/if}

				<!-- Existing Collaborators Info -->
				{#if existingCollaborators.length > 0}
					<div class="existing-collaborators-info">
						<p>
							{existingCollaborators.length}
							{existingCollaborators.length === 1 ? 'person has' : 'people have'} already been invited
						</p>
					</div>
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
		background: var(--card-bg);
		border-radius: 12px;
		width: 100%;
		max-width: 600px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--border-color);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-color);
	}

	.close-button {
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

	.close-button:hover {
		background: var(--hover-bg);
		color: var(--text-color);
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.role-selection {
		margin-bottom: 1.5rem;
	}

	.role-selection label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: var(--text-color);
		font-size: 0.875rem;
	}

	.role-selection select {
		width: 100%;
		padding: 0.625rem;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		background: var(--input-bg);
		color: var(--text-color);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.search-container {
		margin-bottom: 1.5rem;
	}

	.search-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-input-wrapper :global(.search-icon) {
		position: absolute;
		left: 0.875rem;
		color: var(--text-secondary);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 0.875rem 0.75rem 2.75rem;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background: var(--input-bg);
		color: var(--text-color);
		font-size: 0.875rem;
		transition: border-color 0.2s ease;
	}

	.search-input:focus {
		outline: none;
		border-color: var(--primary-color);
	}

	.search-input-wrapper :global(.loading-icon) {
		position: absolute;
		right: 0.875rem;
		color: var(--text-secondary);
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

	.error-message,
	.success-message {
		padding: 0.75rem;
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}

	.error-message {
		background: #fee;
		color: #c33;
		border: 1px solid #fcc;
	}

	.success-message {
		background: #efe;
		color: #3a3;
		border: 1px solid #cfc;
	}

	.search-results {
		margin-top: 1.5rem;
	}

	.search-results h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.75rem;
	}

	.user-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.user-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		margin-bottom: 0.5rem;
		transition: all 0.2s ease;
	}

	.user-item:hover {
		background: var(--hover-bg);
		border-color: var(--primary-color);
	}

	.user-info {
		flex: 1;
	}

	.user-name {
		font-weight: 500;
		color: var(--text-color);
		margin-bottom: 0.25rem;
	}

	.user-handle {
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.invite-button {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		background: var(--primary-color);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.invite-button:hover:not(:disabled) {
		background: var(--primary-hover);
		transform: translateY(-1px);
	}

	.invite-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.invite-button :global(.spinning) {
		animation: spin 1s linear infinite;
	}

	.no-results {
		padding: 2rem;
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}

	.existing-collaborators-info {
		margin-top: 1.5rem;
		padding: 0.875rem;
		background: var(--hover-bg);
		border-radius: 8px;
		text-align: center;
	}

	.existing-collaborators-info p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	@media (max-width: 640px) {
		.modal-content {
			max-height: 95vh;
		}

		.modal-header,
		.modal-body {
			padding: 1rem;
		}

		.user-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
		}

		.invite-button {
			width: 100%;
			justify-content: center;
		}
	}
</style>
