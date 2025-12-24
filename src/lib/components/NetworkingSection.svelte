<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import {
		GET_NETWORKING_DATA,
		RESPOND_TO_CONTACT_REQUEST,
		APPROVE_FOLLOWER,
		REJECT_FOLLOWER,
		REMOVE_CONTACT,
		UNFOLLOW_USER,
		UNBLOCK_USER
	} from '$lib/graphql/queries';
	import {
		Users,
		UserPlus,
		UserMinus,
		Clock,
		Check,
		X,
		Ban,
		Loader2,
		ChevronRight
	} from '@lucide/svelte';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	type TabId = 'pending' | 'contacts' | 'followers' | 'following' | 'blocked';
	let activeTab = $state<TabId>('pending');

	let data = $state<{
		pendingContactRequests: any[];
		pendingFollowRequests: any[];
		contacts: any[];
		followers: any[];
		following: any[];
		blocks: any[];
	}>({
		pendingContactRequests: [],
		pendingFollowRequests: [],
		contacts: [],
		followers: [],
		following: [],
		blocks: []
	});

	let isLoading = $state(true);
	let actionLoading = $state<string | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (userId) {
			loadData();
		}
	});

	async function loadData() {
		isLoading = true;
		error = null;

		try {
			const result = await nhost.graphql.request(GET_NETWORKING_DATA, { userId });

			if (result.error) {
				throw new Error('Failed to load networking data');
			}

			data = {
				pendingContactRequests: result.data?.pendingContactRequests || [],
				pendingFollowRequests: result.data?.pendingFollowRequests || [],
				contacts: result.data?.contacts || [],
				followers: result.data?.followers || [],
				following: result.data?.following || [],
				blocks: result.data?.blocks || []
			};
		} catch (err: any) {
			error = err.message || 'Failed to load data';
			console.error('Error loading networking data:', err);
		} finally {
			isLoading = false;
		}
	}

	// Contact request actions
	async function acceptContactRequest(contactId: string) {
		actionLoading = contactId;
		try {
			await nhost.graphql.request(RESPOND_TO_CONTACT_REQUEST, {
				contactId,
				status: 'accepted',
				cooldownUntil: null
			});
			await loadData();
		} catch (err) {
			console.error('Error accepting contact request:', err);
		} finally {
			actionLoading = null;
		}
	}

	async function declineContactRequest(contactId: string, type: 'not_now' | 'no_thanks') {
		actionLoading = contactId;
		try {
			const cooldownDays = type === 'not_now' ? 1 : 7;
			const cooldownUntil = new Date();
			cooldownUntil.setDate(cooldownUntil.getDate() + cooldownDays);

			await nhost.graphql.request(RESPOND_TO_CONTACT_REQUEST, {
				contactId,
				status: type === 'not_now' ? 'declined_not_now' : 'declined_no_thanks',
				cooldownUntil: cooldownUntil.toISOString()
			});
			await loadData();
		} catch (err) {
			console.error('Error declining contact request:', err);
		} finally {
			actionLoading = null;
		}
	}

	// Follow request actions
	async function approveFollower(followId: string) {
		actionLoading = followId;
		try {
			await nhost.graphql.request(APPROVE_FOLLOWER, { followId });
			await loadData();
		} catch (err) {
			console.error('Error approving follower:', err);
		} finally {
			actionLoading = null;
		}
	}

	async function rejectFollower(followId: string) {
		actionLoading = followId;
		try {
			await nhost.graphql.request(REJECT_FOLLOWER, { followId });
			await loadData();
		} catch (err) {
			console.error('Error rejecting follower:', err);
		} finally {
			actionLoading = null;
		}
	}

	// Remove actions
	async function removeContact(contactId: string) {
		if (!confirm('Remove this contact? You can add them again later.')) return;
		actionLoading = contactId;
		try {
			await nhost.graphql.request(REMOVE_CONTACT, { contactId });
			await loadData();
		} catch (err) {
			console.error('Error removing contact:', err);
		} finally {
			actionLoading = null;
		}
	}

	async function removeFollower(followerId: string) {
		if (!confirm('Remove this follower?')) return;
		actionLoading = followerId;
		try {
			await nhost.graphql.request(UNFOLLOW_USER, {
				followerId,
				followingId: userId
			});
			await loadData();
		} catch (err) {
			console.error('Error removing follower:', err);
		} finally {
			actionLoading = null;
		}
	}

	async function unfollow(followingId: string) {
		actionLoading = followingId;
		try {
			await nhost.graphql.request(UNFOLLOW_USER, {
				followerId: userId,
				followingId
			});
			await loadData();
		} catch (err) {
			console.error('Error unfollowing:', err);
		} finally {
			actionLoading = null;
		}
	}

	async function unblock(blockedId: string) {
		actionLoading = blockedId;
		try {
			await nhost.graphql.request(UNBLOCK_USER, {
				blockerId: userId,
				blockedId
			});
			await loadData();
		} catch (err) {
			console.error('Error unblocking:', err);
		} finally {
			actionLoading = null;
		}
	}

	// Helper to get the "other" user from a contact
	function getContactUser(contact: any) {
		return contact.requester_id === userId ? contact.target : contact.requester;
	}

	const pendingCount =
		data.pendingContactRequests.length + data.pendingFollowRequests.length;
</script>

<section class="networking-section">
	<h3 class="section-title">Contacts & Networking</h3>

	<div class="tabs">
		<button
			class="tab"
			class:active={activeTab === 'pending'}
			onclick={() => (activeTab = 'pending')}
		>
			Pending
			{#if pendingCount > 0}
				<span class="badge">{pendingCount}</span>
			{/if}
		</button>
		<button
			class="tab"
			class:active={activeTab === 'contacts'}
			onclick={() => (activeTab = 'contacts')}
		>
			Contacts
			<span class="count">({data.contacts.length})</span>
		</button>
		<button
			class="tab"
			class:active={activeTab === 'followers'}
			onclick={() => (activeTab = 'followers')}
		>
			Followers
			<span class="count">({data.followers.length})</span>
		</button>
		<button
			class="tab"
			class:active={activeTab === 'following'}
			onclick={() => (activeTab = 'following')}
		>
			Following
			<span class="count">({data.following.length})</span>
		</button>
		<button
			class="tab"
			class:active={activeTab === 'blocked'}
			onclick={() => (activeTab = 'blocked')}
		>
			Blocked
			<span class="count">({data.blocks.length})</span>
		</button>
	</div>

	<div class="tab-content">
		{#if isLoading}
			<div class="loading-state">
				<Loader2 size={24} class="spinning" />
				<span>Loading...</span>
			</div>
		{:else if error}
			<div class="error-state">{error}</div>
		{:else if activeTab === 'pending'}
			{#if data.pendingContactRequests.length === 0 && data.pendingFollowRequests.length === 0}
				<div class="empty-state">
					<Clock size={32} />
					<p>No pending requests</p>
				</div>
			{:else}
				{#if data.pendingContactRequests.length > 0}
					<div class="list-section">
						<h4>Contact Requests</h4>
						{#each data.pendingContactRequests as request}
							<div class="user-card">
								<a href="/u/{request.requester.handle || request.requester.id}" class="user-link">
									{#if request.requester.avatar_url}
										<img src={request.requester.avatar_url} alt="" class="avatar" />
									{:else}
										<div class="avatar placeholder">
											{(request.requester.display_name || request.requester.handle || '?')[0].toUpperCase()}
										</div>
									{/if}
									<div class="user-info">
										<span class="name">{request.requester.display_name || request.requester.handle}</span>
										{#if request.requester.handle}
											<span class="handle">@{request.requester.handle}</span>
										{/if}
									</div>
								</a>
								{#if request.request_note}
									<p class="note">{request.request_note}</p>
								{/if}
								<div class="actions">
									<button
										class="btn-accept"
										onclick={() => acceptContactRequest(request.id)}
										disabled={actionLoading === request.id}
									>
										{#if actionLoading === request.id}
											<Loader2 size={14} class="spinning" />
										{:else}
											<Check size={14} />
										{/if}
										Accept
									</button>
									<button
										class="btn-decline"
										onclick={() => declineContactRequest(request.id, 'not_now')}
										disabled={actionLoading === request.id}
										title="Ask again in 1 day"
									>
										Not now
									</button>
									<button
										class="btn-decline-strong"
										onclick={() => declineContactRequest(request.id, 'no_thanks')}
										disabled={actionLoading === request.id}
										title="Ask again in 1 week"
									>
										No thanks
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if data.pendingFollowRequests.length > 0}
					<div class="list-section">
						<h4>Follow Requests</h4>
						{#each data.pendingFollowRequests as request}
							<div class="user-card">
								<a href="/u/{request.follower.handle || request.follower.id}" class="user-link">
									{#if request.follower.avatar_url}
										<img src={request.follower.avatar_url} alt="" class="avatar" />
									{:else}
										<div class="avatar placeholder">
											{(request.follower.display_name || request.follower.handle || '?')[0].toUpperCase()}
										</div>
									{/if}
									<div class="user-info">
										<span class="name">{request.follower.display_name || request.follower.handle}</span>
										{#if request.follower.handle}
											<span class="handle">@{request.follower.handle}</span>
										{/if}
									</div>
								</a>
								<div class="actions">
									<button
										class="btn-accept"
										onclick={() => approveFollower(request.id)}
										disabled={actionLoading === request.id}
									>
										{#if actionLoading === request.id}
											<Loader2 size={14} class="spinning" />
										{:else}
											<Check size={14} />
										{/if}
										Approve
									</button>
									<button
										class="btn-decline"
										onclick={() => rejectFollower(request.id)}
										disabled={actionLoading === request.id}
									>
										<X size={14} />
										Reject
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		{:else if activeTab === 'contacts'}
			{#if data.contacts.length === 0}
				<div class="empty-state">
					<Users size={32} />
					<p>No contacts yet</p>
					<span class="hint">Add contacts from user profiles to collaborate more easily</span>
				</div>
			{:else}
				<div class="user-list">
					{#each data.contacts as contact}
						{@const user = getContactUser(contact)}
						<div class="user-card compact">
							<a href="/u/{user.handle || user.id}" class="user-link">
								{#if user.avatar_url}
									<img src={user.avatar_url} alt="" class="avatar" />
								{:else}
									<div class="avatar placeholder">
										{(user.display_name || user.handle || '?')[0].toUpperCase()}
									</div>
								{/if}
								<div class="user-info">
									<span class="name">{user.display_name || user.handle}</span>
									{#if user.handle}
										<span class="handle">@{user.handle}</span>
									{/if}
								</div>
								<ChevronRight size={16} class="chevron" />
							</a>
							<button
								class="btn-remove"
								onclick={() => removeContact(contact.id)}
								disabled={actionLoading === contact.id}
								title="Remove contact"
							>
								<X size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'followers'}
			{#if data.followers.length === 0}
				<div class="empty-state">
					<UserPlus size={32} />
					<p>No followers yet</p>
				</div>
			{:else}
				<div class="user-list">
					{#each data.followers as follow}
						<div class="user-card compact">
							<a href="/u/{follow.follower.handle || follow.follower.id}" class="user-link">
								{#if follow.follower.avatar_url}
									<img src={follow.follower.avatar_url} alt="" class="avatar" />
								{:else}
									<div class="avatar placeholder">
										{(follow.follower.display_name || follow.follower.handle || '?')[0].toUpperCase()}
									</div>
								{/if}
								<div class="user-info">
									<span class="name">{follow.follower.display_name || follow.follower.handle}</span>
									{#if follow.follower.handle}
										<span class="handle">@{follow.follower.handle}</span>
									{/if}
								</div>
								<ChevronRight size={16} class="chevron" />
							</a>
							<button
								class="btn-remove"
								onclick={() => removeFollower(follow.follower.id)}
								disabled={actionLoading === follow.follower.id}
								title="Remove follower"
							>
								<UserMinus size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'following'}
			{#if data.following.length === 0}
				<div class="empty-state">
					<Users size={32} />
					<p>Not following anyone</p>
					<span class="hint">Follow users to get notified when they publish new content</span>
				</div>
			{:else}
				<div class="user-list">
					{#each data.following as follow}
						<div class="user-card compact">
							<a href="/u/{follow.following.handle || follow.following.id}" class="user-link">
								{#if follow.following.avatar_url}
									<img src={follow.following.avatar_url} alt="" class="avatar" />
								{:else}
									<div class="avatar placeholder">
										{(follow.following.display_name || follow.following.handle || '?')[0].toUpperCase()}
									</div>
								{/if}
								<div class="user-info">
									<span class="name">{follow.following.display_name || follow.following.handle}</span>
									{#if follow.following.handle}
										<span class="handle">@{follow.following.handle}</span>
									{/if}
								</div>
								<ChevronRight size={16} class="chevron" />
							</a>
							<button
								class="btn-remove"
								onclick={() => unfollow(follow.following.id)}
								disabled={actionLoading === follow.following.id}
								title="Unfollow"
							>
								<UserMinus size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'blocked'}
			{#if data.blocks.length === 0}
				<div class="empty-state">
					<Ban size={32} />
					<p>No blocked users</p>
				</div>
			{:else}
				<div class="user-list">
					{#each data.blocks as block}
						<div class="user-card compact">
							<a href="/u/{block.blocked.handle || block.blocked.id}" class="user-link">
								{#if block.blocked.avatar_url}
									<img src={block.blocked.avatar_url} alt="" class="avatar" />
								{:else}
									<div class="avatar placeholder">
										{(block.blocked.display_name || block.blocked.handle || '?')[0].toUpperCase()}
									</div>
								{/if}
								<div class="user-info">
									<span class="name">{block.blocked.display_name || block.blocked.handle}</span>
									{#if block.blocked.handle}
										<span class="handle">@{block.blocked.handle}</span>
									{/if}
									<span class="block-types">
										{#if block.block_collaboration_requests && block.block_following}
											Blocked: requests & following
										{:else if block.block_collaboration_requests}
											Blocked: requests
										{:else}
											Blocked: following
										{/if}
									</span>
								</div>
							</a>
							<button
								class="btn-unblock"
								onclick={() => unblock(block.blocked_id)}
								disabled={actionLoading === block.blocked_id}
								title="Unblock"
							>
								Unblock
							</button>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</section>

<style>
	.networking-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		overflow: hidden;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		padding: 1rem 1.25rem;
		margin: 0;
		border-bottom: 1px solid var(--color-border);
	}

	.tabs {
		display: flex;
		overflow-x: auto;
		border-bottom: 1px solid var(--color-border);
		scrollbar-width: none;
	}

	.tabs::-webkit-scrollbar {
		display: none;
	}

	.tab {
		flex: 1;
		min-width: max-content;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
	}

	.tab:hover {
		color: var(--color-text-primary);
		background: var(--color-surface-alt);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.badge {
		background: var(--color-primary);
		color: white;
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		min-width: 1.25rem;
		text-align: center;
	}

	.count {
		color: var(--color-text-secondary);
		font-weight: 400;
	}

	.tab-content {
		padding: 1rem;
		min-height: 200px;
	}

	.loading-state,
	.empty-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		text-align: center;
		color: var(--color-text-secondary);
		gap: 0.5rem;
	}

	.empty-state p {
		margin: 0;
		font-weight: 500;
	}

	.hint {
		font-size: 0.875rem;
		opacity: 0.8;
	}

	.error-state {
		color: #ef4444;
	}

	.list-section {
		margin-bottom: 1.5rem;
	}

	.list-section:last-child {
		margin-bottom: 0;
	}

	.list-section h4 {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.75rem 0;
	}

	.user-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.user-card {
		padding: 0.875rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-md);
		transition: all 0.2s ease;
	}

	.user-card:hover {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, var(--color-primary) 5%);
	}

	.user-card.compact {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.user-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		color: inherit;
		flex: 1;
	}

	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-primary);
		color: white;
		font-weight: 600;
		font-size: 1rem;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.name {
		font-weight: 500;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.handle {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.block-types {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		opacity: 0.8;
	}

	.note {
		margin: 0.75rem 0;
		padding: 0.75rem;
		background: var(--color-surface);
		border-radius: var(--border-radius-sm);
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		font-style: italic;
		line-height: 1.5;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
		flex-wrap: wrap;
	}

	.btn-accept,
	.btn-decline,
	.btn-decline-strong,
	.btn-remove,
	.btn-unblock {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.375rem 0.75rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
	}

	.btn-accept {
		background: var(--color-primary);
		color: white;
	}

	.btn-accept:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 85%, black);
	}

	.btn-decline {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-color: var(--color-border);
	}

	.btn-decline:hover:not(:disabled) {
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
	}

	.btn-decline-strong {
		background: transparent;
		color: var(--color-text-secondary);
	}

	.btn-decline-strong:hover:not(:disabled) {
		color: #ef4444;
	}

	.btn-remove {
		background: transparent;
		color: var(--color-text-secondary);
		padding: 0.375rem;
		opacity: 0;
		transition: opacity 0.2s ease, color 0.2s ease;
	}

	.user-card:hover .btn-remove {
		opacity: 1;
	}

	.btn-remove:hover:not(:disabled) {
		color: #ef4444;
	}

	.btn-unblock {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-color: var(--color-border);
	}

	.btn-unblock:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		border-color: var(--color-primary);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	:global(.chevron) {
		color: var(--color-text-secondary);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.user-link:hover :global(.chevron) {
		opacity: 1;
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

	@media (max-width: 640px) {
		.tabs {
			padding: 0 0.5rem;
		}

		.tab {
			padding: 0.625rem 0.75rem;
			font-size: 0.8rem;
		}

		.tab-content {
			padding: 0.75rem;
		}

		.actions {
			flex-direction: column;
		}

		.btn-accept,
		.btn-decline,
		.btn-decline-strong {
			width: 100%;
			justify-content: center;
		}

		.btn-remove {
			opacity: 1;
		}
	}
</style>
