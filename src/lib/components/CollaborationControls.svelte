<script lang="ts">
	import { Users, Lock, LockOpen, AlertCircle, Shield, Calendar } from '@lucide/svelte';
	import Button from './ui/Button.svelte';
	import CollaboratorContextMenu from './CollaboratorContextMenu.svelte';
	import EventModal from './EventModal.svelte';
	import EventCard from './EventCard.svelte';
	import { nhost } from '$lib/nhostClient';
	import {
		CREATE_EDIT_CONTROL_REQUEST,
		CREATE_ROLE_UPGRADE_REQUEST,
		GET_POST_EVENTS
	} from '$lib/graphql/queries';

	type Collaborator = {
		id: string;
		display_name: string;
		handle: string | null;
		avatar_url: string | null;
	};

	type PostCollaborator = {
		id: string;
		has_edit_lock: boolean;
		edit_lock_acquired_at: string | null;
		role: 'viewer' | 'editor' | 'co-author';
		contributor: Collaborator;
	};

	type EditLockStatus = {
		current_editor_id: string | null;
		edit_locked_at: string | null;
		collaboration_enabled: boolean;
		author_id: string;
		author: Collaborator;
		current_editor: Collaborator | null;
		post_collaborators: Array<PostCollaborator>;
	};

	let {
		lockStatus,
		currentUserId,
		contributorId,
		isAuthor,
		postId,
		discussionId,
		discussionTitle,
		onAcquireLock,
		onReleaseLock,
		onToggleCollaboration,
		onUpdate,
		isLoading = false
	} = $props<{
		lockStatus: EditLockStatus;
		currentUserId: string;
		contributorId: string;
		isAuthor: boolean;
		postId: string;
		discussionId: string | null | undefined;
		discussionTitle: string;
		onAcquireLock: () => void;
		onReleaseLock: () => void;
		onToggleCollaboration: (enabled: boolean) => void;
		onUpdate: () => void;
		isLoading?: boolean;
	}>();

	let selectedCollaborator = $state<PostCollaborator | null>(null);
	let showContextMenu = $state(false);
	let showEventModal = $state(false);
	let requestFeedback = $state<string | null>(null);
	let isRequestingControl = $state(false);
	let isRequestingRoleUpgrade = $state(false);

	// Event list state
	let events = $state<any[]>([]);
	let isLoadingEvents = $state(true);
	let eventsError = $state<string | null>(null);
	let isBrowser = $state(false);
	let isEventsExpanded = $state(false);

	// Get current user's role
	const currentUserRole = $derived(
		lockStatus.post_collaborators.find((pc) => pc.contributor.id === currentUserId)?.role || null
	);

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
		!isCurrentUserEditing && lockStatus.collaboration_enabled && !isAuthor
	);

	const canReleaseControl = $derived(isCurrentUserEditing && !isAuthor);

	// Check if current user is a co-author
	const isCoAuthor = $derived(
		lockStatus.post_collaborators.some(
			(pc) => pc.contributor.id === currentUserId && pc.role === 'co-author'
		)
	);

	// Get list of active collaborators including the author
	const activeCollaborators = $derived.by(() => {
		// Only include author if author data is available
		if (!lockStatus.author) {
			return lockStatus.post_collaborators;
		}

		// Create a pseudo-collaborator entry for the author
		const authorAsCollaborator: PostCollaborator = {
			id: 'author-' + lockStatus.author_id, // Unique ID for author
			has_edit_lock: lockStatus.current_editor_id === null && lockStatus.edit_locked_at !== null,
			edit_lock_acquired_at:
				lockStatus.current_editor_id === null ? lockStatus.edit_locked_at : null,
			role: 'editor', // Placeholder, we'll check if it's the author in the template
			contributor: lockStatus.author
		};

		// Combine author with other collaborators
		return [authorAsCollaborator, ...lockStatus.post_collaborators];
	});

	function handleCollaboratorClick(collaborator: PostCollaborator) {
		selectedCollaborator = collaborator;
		showContextMenu = true;
	}

	function handleCloseContextMenu() {
		showContextMenu = false;
		selectedCollaborator = null;
	}

	// Handle edit control request when someone else has the lock
	async function handleRequestEditControl() {
		if (!currentlyEditing) {
			// No one has the lock, try to acquire directly
			onAcquireLock();
			return;
		}

		// Someone has the lock (either a collaborator or the author)
		// Send approval request
		isRequestingControl = true;
		requestFeedback = null;

		try {
			// Current editor is either a collaborator or the author
			const currentHolderId = lockStatus.current_editor_id;

			if (!currentHolderId) {
				console.error('No current editor - cannot request edit control');
				requestFeedback = 'No one has edit control';
				isRequestingControl = false;
				return;
			}

			// Can't request from yourself
			if (currentHolderId === currentUserId) {
				console.error('Cannot request edit control from yourself');
				requestFeedback = 'You already have edit control';
				isRequestingControl = false;
				return;
			}

			if (!discussionId) {
				console.error('No discussion ID - cannot create notification');
				requestFeedback = 'Missing discussion information';
				isRequestingControl = false;
				return;
			}

			console.log('[Request Edit Control]', {
				postId,
				discussionId,
				requesterId: currentUserId,
				currentHolderId,
				authorId: lockStatus.author_id,
				discussionTitle,
				skipAuthorNotification: lockStatus.author_id === currentHolderId
			});

			const result = await nhost.graphql.request(CREATE_EDIT_CONTROL_REQUEST, {
				postId,
				discussionId,
				requesterId: currentUserId,
				currentHolderId: currentHolderId,
				authorId: lockStatus.author_id,
				discussionTitle,
				skipAuthorNotification: lockStatus.author_id === currentHolderId
			});

			console.log('[Request Edit Control] Result:', result);

			if (result.error) {
				console.error('Error creating edit control request:', result.error);
				requestFeedback = 'Failed to send request';
			} else {
				const holderName = lockStatus.current_editor?.display_name || 'current editor';
				requestFeedback = `Request sent to ${holderName} and author`;

				// Clear feedback after 5 seconds
				setTimeout(() => {
					requestFeedback = null;
				}, 5000);
			}
		} catch (error) {
			console.error('Error creating edit control request:', error);
			requestFeedback = 'Failed to send request';
		} finally {
			isRequestingControl = false;
		}
	}

	// Handle role upgrade request for viewers
	async function handleRequestRoleUpgrade() {
		isRequestingRoleUpgrade = true;
		requestFeedback = null;

		try {
			if (!discussionId) {
				console.error('No discussion ID - cannot create notification');
				requestFeedback = 'Missing discussion information';
				isRequestingRoleUpgrade = false;
				return;
			}

			const result = await nhost.graphql.request(CREATE_ROLE_UPGRADE_REQUEST, {
				postId,
				discussionId,
				requesterId: currentUserId,
				authorId: lockStatus.author_id,
				discussionTitle,
				requestedRole: 'editor'
			});

			if (result.error) {
				console.error('Error creating role upgrade request:', result.error);
				requestFeedback = 'Failed to send request';
			} else {
				requestFeedback = 'Request sent to author';

				// Clear feedback after 5 seconds
				setTimeout(() => {
					requestFeedback = null;
				}, 5000);
			}
		} catch (error) {
			console.error('Error creating role upgrade request:', error);
			requestFeedback = 'Failed to send request';
		} finally {
			isRequestingRoleUpgrade = false;
		}
	}

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

	// Initialize browser state and load events only on client
	$effect(() => {
		isBrowser = typeof window !== 'undefined';
		if (isBrowser) {
			loadEvents();
		}
	});

	async function loadEvents() {
		isLoadingEvents = true;
		eventsError = null;
		try {
			const now = new Date().toISOString();
			const result = await nhost.graphql.request(GET_POST_EVENTS, { postId, now });
			if (result.error) {
				console.error('[CollaborationControls] Error loading events:', result.error);
				eventsError = 'Failed to load events';
			} else {
				events = result.data?.event || [];
			}
		} catch (err) {
			console.error('[CollaborationControls] Exception loading events:', err);
			eventsError = 'Failed to load events';
		} finally {
			isLoadingEvents = false;
		}
	}

	function onEventCreated() {
		loadEvents();
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
			<Button
				variant="primary"
				size="sm"
				onclick={handleRequestEditControl}
				disabled={isLoading || isRequestingControl}
			>
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

		{#if currentUserRole === 'viewer' && lockStatus.collaboration_enabled}
			<Button
				variant="secondary"
				size="sm"
				onclick={handleRequestRoleUpgrade}
				disabled={isRequestingRoleUpgrade}
			>
				<Shield size={16} />
				Request Edit Role
			</Button>
		{/if}
		{#if lockStatus.collaboration_enabled && (isAuthor || currentUserRole === 'editor' || currentUserRole === 'co-author')}
			<Button variant="secondary" size="sm" onclick={() => (showEventModal = true)}>
				<Calendar size={16} />
				Add Event
			</Button>
		{/if}

		{#if isBrowser && !isLoadingEvents && !eventsError && events.length > 0}
			<button class="events-toggle" onclick={() => (isEventsExpanded = !isEventsExpanded)}>
				<span class="toggle-icon" class:expanded={isEventsExpanded}>▶</span>
				<Calendar size={16} />
				<span>Upcoming Events ({events.length})</span>
			</button>
		{/if}

		{#if requestFeedback}
			<div class="request-feedback">
				{requestFeedback}
			</div>
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
					<div
						class="collaborator-avatar"
						class:author={collaborator.contributor.id === lockStatus.author_id}
						class:co-author={collaborator.role === 'co-author'}
						class:clickable={true}
						title="{collaborator.contributor.display_name} ({collaborator.contributor.id ===
						lockStatus.author_id
							? 'Author'
							: collaborator.role})"
						onclick={() => handleCollaboratorClick(collaborator)}
						role="button"
						tabindex="0"
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								handleCollaboratorClick(collaborator);
							}
						}}
					>
						{#if collaborator.contributor.avatar_url}
							<img
								src={collaborator.contributor.avatar_url}
								alt={collaborator.contributor.display_name}
							/>
						{:else}
							<span class="avatar-initials">
								{collaborator.contributor.display_name?.charAt(0).toUpperCase() || '?'}
							</span>
						{/if}
						{#if collaborator.contributor.id === lockStatus.author_id}
							<span class="role-badge author-badge" title="Author">👑</span>
						{:else if collaborator.role === 'co-author'}
							<span class="role-badge co-author-badge" title="Co-Author">★</span>
						{:else if collaborator.role === 'editor'}
							<span class="role-badge editor-badge" title="Editor">✎</span>
						{:else if collaborator.role === 'viewer'}
							<span class="role-badge viewer-badge" title="Viewer">👁</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Expanded Events List -->
	{#if isEventsExpanded && events.length > 0}
		<div class="events-list">
			{#each events as event (event.id)}
				<EventCard {event} {currentUserId} onDeleted={loadEvents} />
			{/each}
		</div>
	{/if}
</div>

{#if selectedCollaborator && showContextMenu}
	<CollaboratorContextMenu
		collaborator={selectedCollaborator}
		{currentUserId}
		{isAuthor}
		{isCoAuthor}
		authorId={lockStatus.author_id}
		{postId}
		isOpen={showContextMenu}
		onClose={handleCloseContextMenu}
		{onUpdate}
	/>
{/if}

<EventModal
	{postId}
	{contributorId}
	{discussionTitle}
	isOpen={showEventModal}
	onClose={() => (showEventModal = false)}
	onEventCreated={() => {
		showEventModal = false;
		onEventCreated();
		onUpdate();
	}}
/>

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

	.request-feedback {
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-success) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-success) 30%, transparent);
		border-radius: var(--border-radius-sm);
		font-size: 0.875rem;
		color: var(--color-success);
		font-weight: 500;
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
		position: relative;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		overflow: hidden;
		background: var(--color-primary);
		border: 2px solid var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.collaborator-avatar.clickable {
		cursor: pointer;
	}

	.collaborator-avatar.clickable:hover {
		transform: scale(1.1);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.collaborator-avatar.clickable:focus {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.collaborator-avatar.author {
		border-color: var(--color-primary);
		border-width: 3px;
	}

	.collaborator-avatar.co-author {
		border-color: gold;
		border-width: 3px;
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

	.role-badge {
		position: absolute;
		bottom: -2px;
		right: -2px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 50%;
		width: 1rem;
		height: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.625rem;
		pointer-events: none;
	}

	.author-badge {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
		font-size: 0.75rem;
	}

	.co-author-badge {
		background: gold;
		border-color: darkgoldenrod;
		color: white;
	}

	.editor-badge {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.viewer-badge {
		background: var(--color-surface-secondary);
		border-color: var(--color-border);
		font-size: 0.5rem;
	}

	@media (max-width: 768px) {
		.collaboration-controls {
			padding: 0.5rem;
		}

		.controls-actions {
			flex-direction: column;
		}
	}

	/* Events toggle button */
	.events-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--text-primary);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.875rem;
		transition: all 0.2s;
	}

	.events-toggle:hover {
		background: var(--color-surface-secondary);
		opacity: 0.8;
	}

	.toggle-icon {
		display: inline-block;
		font-size: 0.75rem;
		transition: transform 0.2s;
		color: var(--text-secondary);
	}

	.toggle-icon.expanded {
		transform: rotate(90deg);
	}

	/* Events list */
	.events-list {
		display: flex;
		flex-direction: row;
		gap: 1rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}
</style>
