<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import { goto } from '$app/navigation';
	import FeaturedAnalysesCarousel from '$lib/components/FeaturedAnalysesCarousel.svelte';
	import EditorsDeskCarousel from '$lib/components/EditorsDeskCarousel.svelte';
	import EditorsDeskPicker from '$lib/components/EditorsDeskPicker.svelte';
	import SaveButton from '$lib/components/SaveButton.svelte';
	import LandingFooter from '$lib/components/landing/LandingFooter.svelte';
	import {
		LIST_PUBLISHED_DISCUSSIONS,
		SEARCH_PUBLISHED_DISCUSSIONS,
		SEARCH_DISCUSSIONS_BY_TAGS,
		GET_DISCUSSION_TAGS,
		ADVANCED_SEARCH_DISCUSSIONS,
		GET_EDITORS_DESK_PICKS,
		GET_CONTRIBUTOR
	} from '$lib/graphql/queries';
	import { COMMON_DISCUSSION_TAGS, normalizeTag } from '$lib/types/writingStyle';
	import { canCurateEditorsDesk } from '$lib/utils/editorsDeskUtils';
	import type { PageData } from './$types';
	import { LampDesk } from '@lucide/svelte';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let q = $state('');

	// Simple tag filtering for existing search
	let selectedTags = $state<string[]>([]);
	let showTagFilter = $state(false);
	type DiscussionSummary = {
		id: string;
		created_at: string;
		is_anonymous?: boolean | null;
		status: string;
		contributor?: { id: string; handle?: string | null; display_name?: string | null } | null;
		current_version?: {
			id: string;
			title: string;
			description?: string | null;
			tags?: string[] | null;
			good_faith_score?: number | null;
			good_faith_label?: string | null;
		}[];
	};

	let results = $state<DiscussionSummary[] | null>(null);
	let discussions = $state<DiscussionSummary[] | null>(null);
	let filtered = $state<DiscussionSummary[] | null>(null);
	const PAGE_SIZE = 20;
	let page = $state(0);
	let waitingForAuth = $state(false);
	let unsubAuth: (() => void) | null = null;
	let hasMoreDiscussions = $state(true);

	type PublicShowcaseItem = {
		id: string;
		title: string;
		subtitle?: string | null;
		media_type?: string | null;
		creator?: string | null;
		source_url?: string | null;
		summary?: string | null;
		analysis?: string | null;
		created_at: string;
	};

	const props = $props<{ data: PageData }>();
	let showcaseLoading = $state(false);
	let showcaseError = $state<string | null>(props.data?.showcaseError ?? null);
	let showcaseItems = $state<PublicShowcaseItem[]>(props.data?.showcaseItems ?? []);

	$effect(() => {
		showcaseItems = props.data?.showcaseItems ?? [];
		showcaseError = props.data?.showcaseError ?? null;
	});

	// Editors' Desk state
	let editorsDeskPicks = $state<any[]>([]);
	let editorsDeskLoading = $state(false);
	let editorsDeskError = $state<string | null>(null);
	let pickerOpen = $state(false);
	let selectedDiscussion = $state<DiscussionSummary | null>(null);
	let user = $state(nhost.auth.getUser());
	let contributor = $state<any>(null);
	let canCurate = $derived(canCurateEditorsDesk(contributor));

	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
	});

	// Tag filtering functions
	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter((t) => t !== tag);
		} else {
			selectedTags = [...selectedTags, tag];
		}
		// Trigger search if we have tags selected
		if (selectedTags.length > 0) {
			searchByTags();
		} else if (q.trim()) {
			search();
		} else {
			results = null;
		}
	}

	async function searchByTags() {
		if (selectedTags.length === 0) return;

		loading = true;
		error = null;
		try {
			const { data, error: gqlError } = await nhost.graphql.request(SEARCH_DISCUSSIONS_BY_TAGS, {
				tags: selectedTags
			});
			if (gqlError)
				throw Array.isArray(gqlError)
					? new Error(gqlError.map((e: any) => e.message).join('; '))
					: gqlError;
			results = (data as any)?.discussion ?? [];
		} catch (e: any) {
			error = e.message ?? 'Tag search failed';
		} finally {
			loading = false;
		}
	}

	// Using imported GraphQL queries for the new versioning system

	async function search() {
		loading = true;
		error = null;
		try {
			const term = q.trim();
			if (!term) {
				results = null;
				loading = false;
				return;
			}
			const { data, error: gqlError } = await nhost.graphql.request(SEARCH_PUBLISHED_DISCUSSIONS, {
				searchTerm: `%${term}%`
			});
			if (gqlError)
				throw Array.isArray(gqlError)
					? new Error(gqlError.map((e: any) => e.message).join('; '))
					: gqlError;
			results = (data as any)?.discussion ?? [];
		} catch (e: any) {
			error = e.message ?? 'Search failed';
		} finally {
			loading = false;
		}
	}

	let searchTimer: any = null;
	function onSearchInput(e: Event) {
		q = (e.target as HTMLInputElement).value;
		if (searchTimer) clearTimeout(searchTimer);
		const term = q.trim();
		if (!term) {
			results = null;
			return;
		}
		searchTimer = setTimeout(() => {
			search();
		}, 300);
	}

	async function fetchAll(reset = false, retry = true) {
		if (reset) {
			page = 0;
			discussions = [];
			hasMoreDiscussions = true;
		}
		loading = true;
		error = null;
		try {
			const { data, error: gqlError } = await nhost.graphql.request(LIST_PUBLISHED_DISCUSSIONS, {
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE
			});
			if (gqlError)
				throw Array.isArray(gqlError)
					? new Error(gqlError.map((e: any) => e.message).join('; '))
					: gqlError;
			const rows = (data as any)?.discussion ?? [];
			discussions = [...(discussions ?? []), ...rows];
			page += 1;

			// If we received fewer discussions than the page size, we've reached the end
			hasMoreDiscussions = rows.length === PAGE_SIZE;
		} catch (e: any) {
			const msg = e?.message ?? String(e);
			// If schema for anonymous doesn't expose 'discussion', wait for auth and retry once
			if (retry && /field\s+'?discussion'?\s+not\s+found\s+in\s+type/i.test(msg)) {
				waitingForAuth = true;
				await ensureAuthReadyAndHeaders();
				const user = nhost.auth.getUser();
				if (user) {
					waitingForAuth = false;
					return fetchAll(reset, false);
				}
				if (!unsubAuth) {
					const off = nhost.auth.onAuthStateChanged(async (event) => {
						if (event === 'SIGNED_IN') {
							waitingForAuth = false;
							await fetchAll(true, false);
						}
					});
					unsubAuth = () => {
						try {
							(off as any)?.();
						} catch {}
					};
				}
				// Important: still set loading = false even when waiting for auth
				loading = false;
				return;
			}
			error = msg || 'Failed to load discussions';
		} finally {
			loading = false;
		}
	}

	async function ensureAuthReadyAndHeaders() {
		try {
			await nhost.auth.isAuthenticatedAsync();
		} catch {}
		// headers are managed globally by nhostClient
	}

	async function fetchEditorsDeskPicks() {
		editorsDeskLoading = true;
		editorsDeskError = null;
		try {
			const { data, error: gqlError } = await nhost.graphql.request(GET_EDITORS_DESK_PICKS, {
				publishedOnly: true
			});
			if (gqlError) {
				throw Array.isArray(gqlError)
					? new Error(gqlError.map((e: any) => e.message).join('; '))
					: gqlError;
			}
			editorsDeskPicks = (data as any)?.editors_desk_pick ?? [];
		} catch (e: any) {
			editorsDeskError = e.message ?? "Failed to load Editors' Desk picks";
		} finally {
			editorsDeskLoading = false;
		}
	}

	async function fetchContributor() {
		if (!user?.id) return;
		try {
			const { data } = await nhost.graphql.request(GET_CONTRIBUTOR, { userId: user.id });
			contributor = (data as any)?.contributor_by_pk;
		} catch (e) {
			// Silently fail, user just won't see curator features
		}
	}

	function openPicker(discussion: DiscussionSummary) {
		selectedDiscussion = discussion;
		pickerOpen = true;
	}

	function closePicker() {
		pickerOpen = false;
		selectedDiscussion = null;
		// Refresh picks after creating one
		fetchEditorsDeskPicks();
	}

	onMount(async () => {
		await ensureAuthReadyAndHeaders();
		await fetchAll(true);
		await fetchEditorsDeskPicks();
		await fetchContributor();
	});

	import { onDestroy } from 'svelte';
	onDestroy(() => {
		if (unsubAuth) {
			unsubAuth();
			unsubAuth = null;
		}
	});

	function clientFilter(list: any[], term: string) {
		const t = term.toLowerCase();
		const parts = t.split(/\s+/).filter(Boolean);
		return list.filter(
			(d) =>
				parts.length === 0 ||
				parts.some((p) => {
					const version = d.current_version?.[0];
					return (
						(version?.title && version.title.toLowerCase().includes(p)) ||
						(version?.description && version.description.toLowerCase().includes(p)) ||
						(d.is_anonymous && 'anonymous'.includes(p)) ||
						(d.contributor?.display_name && d.contributor.display_name.toLowerCase().includes(p)) ||
						(Array.isArray((d as any).tags) &&
							(d as any).tags.some(
								(tag: any) =>
									(typeof tag === 'string' && tag.toLowerCase().includes(p)) ||
									(tag?.name && typeof tag.name === 'string' && tag.name.toLowerCase().includes(p))
							))
					);
				})
		);
	}

	$effect(() => {
		const term = q.trim();
		if (!term) {
			filtered = discussions ?? [];
		} else if (results !== null) {
			filtered = results;
		} else {
			filtered = discussions ? clientFilter(discussions, term) : [];
		}
	});

	function escapeHtml(s: string) {
		return s
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}
	function escapeRegExp(s: string) {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
	function highlight(text?: string | null, query?: string) {
		if (!text) return '';
		const safe = escapeHtml(text);
		const q = (query ?? '').trim().toLowerCase();
		if (!q) return safe;
		const terms = Array.from(new Set(q.split(/\s+/).filter(Boolean)));
		if (terms.length === 0) return safe;
		const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
		return safe.replace(pattern, '<mark>$1</mark>');
	}

	function createSummary(text?: string | null, maxLength: number = 200): string {
		if (!text) return '';
		// Remove any HTML tags and extra whitespace
		const cleanText = text
			.replace(/<[^>]*>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		if (cleanText.length <= maxLength) return cleanText;

		// Find the last complete sentence or word within the limit
		const truncated = cleanText.substring(0, maxLength);
		const lastSentence = truncated.lastIndexOf('. ');
		const lastWord = truncated.lastIndexOf(' ');

		// Prefer ending at a sentence, otherwise at a word boundary
		if (lastSentence > maxLength * 0.6) {
			return truncated.substring(0, lastSentence + 1);
		} else if (lastWord > maxLength * 0.8) {
			return truncated.substring(0, lastWord) + '...';
		} else {
			return truncated + '...';
		}
	}

	// Prefer a human-friendly display over raw email-like strings
	function displayName(name?: string | null): string {
		if (!name) return '';
		const n = String(name).trim();
		const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n);
		if (isEmail) return n.split('@')[0];
		return n;
	}
</script>

<div class="page-container">
	<header class="page-hero">
		<div class="hero-body">
			<span class="editorial-masthead">Learning Through Dialogue</span>
			<h1>Explore Discussions</h1>
			<p class="editorial-lede">
				Discover thoughtful conversations where people engage constructively with different
				viewpoints. Learn from examples of good-faith reasoning, steelmanning, and evidence-based
				dialogue.
			</p>
		</div>
		<section class="search-card" aria-labelledby="discussion-search">
			<h2 id="discussion-search">Find discussions by topic</h2>
			<p>Search by title, author, or keywords to discover conversations that interest you.</p>
			<div class="search-controls">
				<input
					id="search"
					type="search"
					placeholder="Search discussions..."
					bind:value={q}
					oninput={onSearchInput}
					onkeydown={(e) => e.key === 'Enter' && search()}
				/>
				<!-- <button class="search-button" onclick={search}>Search</button> -->
			</div>
		</section>
	</header>

	{#if !q.trim()}
		<!-- Editors' Desk Section -->
		<section class="analysis-section editors-desk-section">
			<header class="analysis-header">
				<span class="editorial-kicker">Editors' Desk</span>
				<h2>Learn from exemplary discussions</h2>
				<p>
					Our editorial team highlights conversations that demonstrate strong reasoning,
					intellectual humility, and constructive engagement. Study these examples to improve your
					own dialogue skills.
				</p>
			</header>
			{#if editorsDeskLoading}
				<p class="status-message">Loading featured picks…</p>
			{:else if editorsDeskError}
				<p class="status-message error">{editorsDeskError}</p>
			{:else if editorsDeskPicks.length === 0}
				<p class="status-message">Featured picks will appear here as they are published.</p>
			{:else}
				<EditorsDeskCarousel items={editorsDeskPicks} />
			{/if}
		</section>
	{/if}

	{#if user}
		<main class="discussions-main">
			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			{#if loading && (!discussions || discussions.length === 0)}
				<p class="loading-message">Loading discussions...</p>
			{:else if filtered && filtered.length > 0}
				<div class="article-list">
					{#each filtered as d}
						<div class="discussion-card-wrapper">
							<div
								class="discussion-card"
								role="button"
								tabindex="0"
								onclick={() => goto(`/discussions/${d.id}`)}
								onkeydown={(e) => e.key === 'Enter' && goto(`/discussions/${d.id}`)}
							>
								<header class="discussion-header">
									<span class="discussion-header-head">
										{#if d.current_version?.[0]}
											<h2>{@html highlight(d.current_version[0].title, q)}</h2>
										{:else}
											<h2>Discussion</h2>
										{/if}
										<div class="card-actions">
											{#if canCurate}
												<button
													class="editors-desk-button"
													onclick={(e) => {
														e.stopPropagation();
														openPicker(d);
													}}
													title="Add to Editors' Desk"
													aria-label="Add to Editors' Desk"
												>
													<LampDesk size={16} strokeWidth={2} />
												</button>
											{/if}
											<SaveButton discussionId={d.id} size="small" />
										</div>
									</span>
									{#if d.current_version?.[0]?.description}
										<p class="deck">
											{@html highlight(createSummary(d.current_version[0].description, 180), q)}
										</p>
									{/if}
									{#if d.current_version?.[0]?.tags && d.current_version[0].tags.length > 0}
										<div class="discussion-tags">
											{#each d.current_version[0].tags as tag}
												<span class="tag">{tag}</span>
											{/each}
										</div>
									{/if}
								</header>
								<footer class="card-byline">
									{#if d.is_anonymous}
										<span>Anonymous contributor</span>
									{:else if d.contributor?.display_name}
										<span
											>By
											<a href={`/u/${d.contributor.handle || d.contributor.id}`}
												>{@html highlight(displayName(d.contributor.display_name), q)}</a
											></span
										>
									{:else}
										<span>Unknown author</span>
									{/if}
									<time
										>{new Date(d.created_at).toLocaleDateString('en-US', {
											year: 'numeric',
											month: 'long',
											day: 'numeric'
										})}</time
									>
								</footer>
							</div>
						</div>
					{/each}
				</div>
				{#if !q.trim() && hasMoreDiscussions}
					<div class="load-more">
						<button class="load-more-button" onclick={() => fetchAll(false)} disabled={loading}
							>Load More Discussions</button
						>
					</div>
				{/if}
			{:else if q.trim().length > 0 && !loading}
				<p class="empty-state">No discussions match your search.</p>
			{:else if !loading}
				<p class="empty-state">No discussions yet.</p>
			{/if}
		</main>
	{/if}

	{#if !q.trim()}
		<!-- Curated Analyses Section -->
		<section class="analysis-section">
			<header class="analysis-header">
				<span class="editorial-kicker">Curated Analyses</span>
				<h2>Educational case studies</h2>
				<p>
					Detailed analyses of public discourse that demonstrate how to identify logical fallacies,
					evaluate evidence quality, and recognize good-faith versus bad-faith argumentation. Learn
					critical thinking skills through real examples.
				</p>
			</header>
			{#if showcaseLoading}
				<p class="status-message">Loading curated analyses…</p>
			{:else if showcaseError}
				<p class="status-message error">{showcaseError}</p>
			{:else if showcaseItems.length === 0}
				<p class="status-message">Curated analyses will appear here as they are published.</p>
			{:else}
				<FeaturedAnalysesCarousel items={showcaseItems} />
			{/if}
		</section>
	{/if}
</div>

<LandingFooter />

<!-- EditorsDeskPicker Dialog -->
<EditorsDeskPicker
	isOpen={pickerOpen}
	onClose={closePicker}
	discussionId={selectedDiscussion?.id}
	discussionTitle={selectedDiscussion?.current_version?.[0]?.title}
	discussionDescription={selectedDiscussion?.current_version?.[0]?.description}
	discussionAuthorId={selectedDiscussion?.contributor?.id}
/>

<style>
	.page-container {
		background: var(--color-surface-alt);
		min-height: 100vh;
		padding-bottom: 4rem;
	}

	.page-hero {
		display: grid;
		gap: clamp(2rem, 4vw, 3rem);
		padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 5vw, 4.5rem) clamp(2rem, 4vw, 3rem);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	@media (min-width: 1024px) {
		.page-hero {
			grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr);
			align-items: center;
		}
	}

	.hero-body h1 {
		margin: 0 0 1rem;
		font-family: var(--font-family-display);
		font-size: clamp(2.25rem, 5vw, 3rem);
		letter-spacing: -0.015em;
	}

	.search-card {
		background: color-mix(in srgb, var(--color-surface-alt) 75%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: var(--border-radius-xl);
		padding: var(--space-fluid-md);
		box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
	}

	.search-card h2 {
		margin: 0 0 0.5rem;
		font-family: var(--font-family-display);
		font-size: 1.35rem;
	}

	.search-card p {
		margin: 0 0 1.5rem;
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
	}

	.search-controls {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.search-controls input {
		flex: 1 1 220px;
		padding: 0.9rem 1.2rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-text-primary);
		font-size: 1rem;
		transition: all 0.25s ease;
		margin: 0;
	}

	.search-controls input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.analysis-section {
		padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 5vw, 4.5rem);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface-alt);
	}

	.analysis-header {
		max-width: 720px;
		margin: 0 auto clamp(2rem, 5vw, 3rem);
		text-align: center;
	}

	.analysis-header h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-family-display);
		font-size: clamp(1.75rem, 4vw, 2.25rem);
	}

	.analysis-header p {
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
		margin: 0;
	}

	.status-message {
		color: var(--color-text-secondary);
		text-align: center;
		font-size: 0.95rem;
	}

	.status-message.error {
		color: #ef4444;
	}

	.discussions-main {
		padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 5vw, 4.5rem);
	}

	.article-list {
		display: flex;
		flex-direction: column;
		gap: clamp(0.5rem, 4vw, 1.5rem);
	}

	@media (min-width: 1024px) {
		.article-list {
			grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
			background: var(--color-surface);
		}
	}

	.discussion-card {
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: var(--border-radius-xl);
		padding: var(--space-fluid-sm);
		box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
		cursor: pointer;
		transition:
			transform 0.25s ease,
			box-shadow 0.25s ease;
		position: relative;
		overflow: hidden;
	}

	.discussion-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 6px;
		height: 100%;
		/*background: linear-gradient(
			180deg,
			var(--color-primary),
			color-mix(in srgb, var(--color-accent) 75%, var(--color-primary))
		);*/
		opacity: 0.8;
	}

	.discussion-card:hover {
		transform: translateY(-3px);
		box-shadow: 0 16px 38px rgba(15, 23, 42, 0.12);
	}

	.discussion-card:hover::before {
		opacity: 1;
	}

	.discussion-header h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-family-display);
		font-size: clamp(1.35rem, 3vw, 1.75rem);
		letter-spacing: -0.01em;
	}

	.deck {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
		max-width: 62ch;
		font-size: 1rem;
		font-weight: 400;
	}

	.discussion-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.discussion-tags .tag {
		display: inline-block;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 15%, var(--color-surface)),
			color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))
		);
		color: var(--color-primary);
		padding: 0.375rem 0.75rem;
		border-radius: var(--border-radius-lg);
		font-size: 0.8rem;
		font-weight: 500;
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		transition: all 0.2s ease;
	}

	.discussion-tags .tag:hover {
		background: var(--color-primary);
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.card-byline {
		/*margin-bottom: clamp(1.25rem, 3vw, 1.25rem);*/
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	.discussion-header-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.card-byline a {
		color: var(--color-link);
		font-weight: 600;
		text-decoration: none;
	}

	.card-byline a:hover,
	.card-byline a:focus {
		text-decoration: underline;
	}

	.card-byline time {
		font-variant-numeric: tabular-nums;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	@media (max-width: 640px) {
		.card-byline {
			flex-direction: column;
			align-items: flex-start;
		}
		.card-byline time {
			margin-left: 0;
		}
	}

	:global(mark) {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		padding: 0 0.25em;
		border-radius: 2px;
		font-weight: 600;
	}

	.loading-message,
	.empty-state {
		color: var(--color-text-secondary);
		text-align: center;
		font-size: 1rem;
		padding: 3rem 0;
	}

	.error-message {
		color: #ef4444;
		text-align: center;
		padding: 1rem;
		background: color-mix(in srgb, #ef4444 12%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 25%, transparent);
		border-radius: var(--border-radius-sm);
		margin-bottom: 2rem;
	}

	.load-more {
		text-align: center;
		margin-top: clamp(2.5rem, 5vw, 3.5rem);
	}

	.load-more-button {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		border-radius: 999px;
		padding: 0.9rem 2.25rem;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.25s ease;
	}

	.load-more-button:hover,
	.load-more-button:focus {
		border-color: var(--color-primary);
		color: var(--color-primary);
		box-shadow: 0 8px 22px rgba(15, 23, 42, 0.1);
	}

	.load-more-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		box-shadow: none;
	}

	@media (max-width: 960px) {
		.page-hero {
			grid-template-columns: 1fr;
		}
	}

	/* Editors' Desk specific styles */
	.editors-desk-section {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-accent) 3%, var(--color-surface-alt)),
			color-mix(in srgb, var(--color-primary) 3%, var(--color-surface-alt))
		);
	}

	.discussion-card-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.editors-desk-button {
		background: transparent;
		color: white;
		max-width: 12rem;
		border: none;
		/*padding: 0.65rem 1.25rem;*/
		/*border-radius: var(--border-radius-lg);*/
		font-size: 0.85rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		/*transition: all 0.25s ease;*/
	}

	.editors-desk-button:hover {
		transform: translateY(-2px);
	}

	.editors-desk-button img {
		flex-shrink: 0;
	}

	/* Invert the icon in dark mode */
	:global([data-theme='dark']) .editors-desk-button img {
		filter: invert(1);
	}

	@media (max-width: 640px) {
		.editors-desk-button {
			width: 2.5rem;
			height: 2.5rem;
			padding: 0;
			justify-content: center;
			border-radius: 50%;
		}
	}
</style>
