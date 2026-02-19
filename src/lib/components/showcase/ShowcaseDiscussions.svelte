<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { goto } from '$app/navigation';
	import { GET_SHOWCASE_ITEM_DISCUSSIONS } from '$lib/graphql/queries/public-showcase';
	import { extractCitationData } from '$lib/utils/contentExtraction';

	type Discussion = {
		id: string;
		created_at: string;
		is_anonymous: boolean;
		contributor?: {
			id: string;
			display_name?: string | null;
			handle?: string | null;
			avatar_url?: string | null;
		} | null;
		current_version?: {
			id: string;
			title: string;
			description?: string | null;
			tags?: string[] | null;
			import_source?: string | null;
			import_url?: string | null;
			import_content?: string | null;
			import_author?: string | null;
			import_date?: string | null;
		}[];
	};

	let {
		showcaseItemId,
		showcaseTitle,
		initialDiscussions = []
	} = $props<{
		showcaseItemId: string;
		showcaseTitle: string;
		initialDiscussions?: Discussion[];
	}>();

	let discussions = $state<Discussion[]>(initialDiscussions);
	let loading = $state(false);
	let loaded = $state(initialDiscussions.length > 0);
	let error = $state<string | null>(null);
	let user = $state(nhost.auth.getUser());

	nhost.auth.onAuthStateChanged(() => {
		const newUser = nhost.auth.getUser();
		const wasLoggedOut = !user;
		user = newUser;
		// Load discussions when user logs in (not on every token refresh)
		if (wasLoggedOut && newUser && !loaded && !loading) {
			loadDiscussions();
		}
	});

	async function loadDiscussions() {
		loading = true;
		error = null;
		try {
			const { data, error: gqlError } = await nhost.graphql.request(GET_SHOWCASE_ITEM_DISCUSSIONS, {
				showcaseItemId
			});
			if (gqlError) {
				throw Array.isArray(gqlError)
					? new Error(gqlError.map((e: any) => e.message).join('; '))
					: gqlError;
			}
			discussions = (data as any)?.discussion ?? [];
			loaded = true;
		} catch (e: any) {
			error = e?.message ?? 'Failed to load discussions';
		} finally {
			loading = false;
		}
	}

	function startDiscussion() {
		goto(`/discussions/new?showcase=${showcaseItemId}`);
	}

	function viewDiscussion(discussionId: string) {
		goto(`/discussions/${discussionId}`);
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getAuthorName(discussion: Discussion): string {
		if (discussion.is_anonymous) return 'Anonymous';
		return discussion.contributor?.display_name || discussion.contributor?.handle || 'Unknown';
	}

	function hasImportContext(discussion: Discussion): boolean {
		const version = discussion.current_version?.[0];
		return !!(version?.import_source && version?.import_content && version?.import_author);
	}

	function formatImportDate(dateStr?: string | null): string | null {
		if (!dateStr) return null;
		try {
			const date = new Date(dateStr);
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return dateStr;
		}
	}

	function truncateContent(content: string, maxLength: number = 120): string {
		if (content.length <= maxLength) return content;
		return content.slice(0, maxLength).trim() + '...';
	}

	function cleanDescription(description: string | null | undefined): string {
		if (!description) return '';
		// Strip citation data and other embedded HTML comments
		const { cleanContent } = extractCitationData(description);
		// Also strip any remaining HTML tags
		return cleanContent.replace(/<[^>]*>/g, '').trim();
	}

	// Load discussions on mount if user is already authenticated
	import { onMount } from 'svelte';
	onMount(() => {
		if (!loaded && user) {
			loadDiscussions();
		}
	});
</script>

<section class="showcase-discussions">
	<header class="discussions-header">
		<div class="header-text">
			<h2>Discussions</h2>
			<p>Join the conversation about this analysis</p>
		</div>
		{#if user}
			<button class="start-discussion-btn" onclick={startDiscussion}> Start a Discussion </button>
		{:else}
			<a href="/login" class="login-prompt"> Sign in to start a discussion </a>
		{/if}
	</header>

	{#if !user}
		<div class="empty-state">
			<p>Sign in to view and participate in discussions about this analysis.</p>
		</div>
	{:else if loading}
		<p class="status-message">Loading discussions...</p>
	{:else if error}
		<p class="status-message error">{error}</p>
	{:else if discussions.length === 0}
		<div class="empty-state">
			<p>No discussions yet. Be the first to start a conversation about this analysis!</p>
		</div>
	{:else}
		<div class="discussions-list">
			{#each discussions as discussion}
				{@const version = discussion.current_version?.[0]}
				<button class="discussion-card" onclick={() => viewDiscussion(discussion.id)}>
					{#if hasImportContext(discussion)}
						<div class="import-context">
							<div class="import-badge">
								<svg class="import-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
									<path
										d="M8 2L10 6L14 6.5L11 9.5L11.5 14L8 12L4.5 14L5 9.5L2 6.5L6 6L8 2Z"
										stroke="currentColor"
										stroke-width="1.5"
										fill="none"
										stroke-linejoin="round"
									/>
								</svg>
								<span>{version?.import_source}</span>
								{#if version?.import_author}
									<span class="import-author">@{version.import_author}</span>
								{/if}
								{#if version?.import_date}
									<span class="import-date">{formatImportDate(version.import_date)}</span>
								{/if}
							</div>
							{#if version?.import_content}
								<p class="import-quote">"{truncateContent(version.import_content)}"</p>
							{/if}
						</div>
					{/if}
					<div class="card-content">
						<h3>{version?.title || 'Untitled Discussion'}</h3>
						{#if version?.description}
							{@const cleaned = cleanDescription(version.description)}
							{#if cleaned}
								<p class="description">
									{cleaned.slice(0, 150)}{cleaned.length > 150 ? '...' : ''}
								</p>
							{/if}
						{/if}
						{#if version?.tags && version.tags.length > 0}
							<div class="tags">
								{#each version.tags.slice(0, 3) as tag}
									<span class="tag">{tag}</span>
								{/each}
								{#if version.tags.length > 3}
									<span class="tag more">+{version.tags.length - 3}</span>
								{/if}
							</div>
						{/if}
					</div>
					<footer class="card-footer">
						<span class="author">By {getAuthorName(discussion)}</span>
						<span class="date">{formatDate(discussion.created_at)}</span>
					</footer>
				</button>
			{/each}
		</div>
	{/if}
</section>

<style>
	.showcase-discussions {
		margin-top: 3rem;
		padding: 2rem;
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: var(--border-radius-xl);
	}

	.discussions-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.header-text h2 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
		font-family: var(--font-family-display);
		font-weight: 700;
		color: var(--color-text-primary);
	}

	.header-text p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 0.95rem;
	}

	.start-discussion-btn {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-lg);
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.start-discussion-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.login-prompt {
		color: var(--color-primary);
		font-weight: 600;
		text-decoration: none;
		padding: 0.75rem 1.5rem;
		border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
		border-radius: var(--border-radius-lg);
		transition: all 0.2s ease;
	}

	.login-prompt:hover {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-color: var(--color-primary);
	}

	.status-message {
		text-align: center;
		color: var(--color-text-secondary);
		padding: 2rem;
	}

	.status-message.error {
		color: #ef4444;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 2rem;
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		border-radius: var(--border-radius-lg);
		border: 1px dashed color-mix(in srgb, var(--color-border) 50%, transparent);
	}

	.empty-state p {
		margin: 0;
		color: var(--color-text-secondary);
	}

	.discussions-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.discussion-card {
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 1.25rem;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;
	}

	.discussion-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.card-content h3 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}

	.description {
		margin: 0 0 0.75rem;
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.tag {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		padding: 0.25rem 0.6rem;
		border-radius: var(--border-radius-md);
		font-size: 0.75rem;
		font-weight: 500;
	}

	.tag.more {
		background: color-mix(in srgb, var(--color-text-secondary) 15%, transparent);
		color: var(--color-text-secondary);
	}

	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 0.75rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.author {
		font-weight: 500;
	}

	.date {
		opacity: 0.8;
	}

	/* Import context styles */
	.import-context {
		margin-bottom: 1rem;
		padding: 0.875rem;
		background: color-mix(in srgb, var(--color-warning) 6%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 20%, transparent);
		border-left: 3px solid var(--color-warning);
		border-radius: var(--border-radius-md);
	}

	.import-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.8rem;
		color: var(--color-warning);
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.import-icon {
		flex-shrink: 0;
	}

	.import-author {
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.import-date {
		color: var(--color-text-secondary);
		font-weight: 400;
		opacity: 0.8;
	}

	.import-date::before {
		content: '•';
		margin-right: 0.5rem;
	}

	.import-quote {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	@media (max-width: 640px) {
		.showcase-discussions {
			padding: 1.5rem;
		}

		.discussions-header {
			flex-direction: column;
			align-items: stretch;
		}

		.start-discussion-btn,
		.login-prompt {
			text-align: center;
		}
	}
</style>
