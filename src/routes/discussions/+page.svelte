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
		LIST_DISCUSSIONS_FROM_FOLLOWING,
		SEARCH_PUBLISHED_DISCUSSIONS,
		SEARCH_DISCUSSIONS_BY_TAGS,
		buildTagOverlapQuery,
		GET_EDITORS_DESK_PICKS,
		GET_CONTRIBUTOR,
		DELETE_EDITORS_DESK_PICK,
		GET_MY_FOLLOWING,
		GET_ALL_TAGS,
		UPDATE_CONTRIBUTOR_INTERESTS
	} from '$lib/graphql/queries';
	import { canCurateEditorsDesk } from '$lib/utils/editorsDeskUtils';
	import OnboardingPrompt from '$lib/components/onboarding/OnboardingPrompt.svelte';
	import FollowButton from '$lib/components/FollowButton.svelte';
	import { contributorStore, type OnboardingState } from '$lib/stores/contributorStore';
	import type { PageData } from './$types';
	import { LampDesk, MessageSquare } from '@lucide/svelte';

	// Build a dynamic suggestion query using _contains + _or (same pattern as buildTagOverlapQuery)
	function buildSuggestContributorsQuery(tags: string[]) {
		const tagConditions = tags.map((_, i) => `{ tags: { _contains: $tag${i} } }`).join(', ');
		const tagParams = tags.map((_, i) => `$tag${i}: [String!]!`).join(', ');
		const variables: Record<string, any> = {};
		tags.forEach((tag, i) => { variables[`tag${i}`] = [tag]; });

		const query = `
			query SuggestContributorsByInterests(${tagParams}, $excludeIds: [uuid!]!, $limit: Int = 6) {
				discussion(
					where: {
						status: { _eq: "published" }
						discussion_versions: {
							version_type: { _eq: "published" }
							_or: [${tagConditions}]
						}
						created_by: { _nin: $excludeIds }
					}
					order_by: { created_at: desc }
					limit: 20
				) {
					contributor { id display_name handle avatar_url }
				}
			}
		`;
		return { query, variables };
	}

	let loading = $state(true);
	let error = $state<string | null>(null);
	let q = $state('');

	// Simple tag filtering for existing search
	let selectedTags = $state<string[]>([]);
	let showTagFilter = $state(false);

	// Filter mode: 'all' | 'following' | 'interests'
	type FilterMode = 'all' | 'following' | 'interests';
	let filterMode = $state<FilterMode>('all');
	let followingIds = $state<string[]>([]);
	let followingLoaded = $state(false);

	// Interests filter
	let userInterests = $state<string[]>([]);
	let allTags = $state<string[]>([]);
	let selectedInterests = $state<string[]>([]);
	let interestsLoaded = $state(false);
	let savingInterests = $state(false);

	// Following suggestions state
	type SuggestedContributor = {
		id: string;
		display_name?: string | null;
		handle?: string | null;
		avatar_url?: string | null;
	};
	let suggestedContributors = $state<SuggestedContributor[]>([]);
	let suggestionsLoading = $state(false);
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
		posts_aggregate?: { aggregate?: { count?: number } };
		posts?: { created_at: string }[];
	};

	function replyCount(d: DiscussionSummary): number {
		return d.posts_aggregate?.aggregate?.count ?? 0;
	}

	function recentActivity(d: DiscussionSummary): string | null {
		const latest = d.posts?.[0]?.created_at;
		if (!latest) return null;
		const diff = Date.now() - new Date(latest).getTime();
		const hours = Math.floor(diff / 3_600_000);
		if (hours < 1) return 'Active now';
		if (hours < 24) return `Active ${hours}h ago`;
		if (hours < 48) return 'Active yesterday';
		return null;
	}

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
	const onboardingState = $derived(
		($contributorStore?.onboarding_state as OnboardingState) ?? 'not_started'
	);
	const showOnboarding = $derived(
		!!user && onboardingState !== 'completed'
	);
	let alphaDismissed = $state(false);

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
			const { query, variables } = buildTagOverlapQuery(selectedTags);
			const { data, error: gqlError } = await nhost.graphql.request(query, variables);
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

	async function fetchFollowingIds() {
		if (!user?.id || followingLoaded) return;
		try {
			const { data, error: gqlError } = await nhost.graphql.request(GET_MY_FOLLOWING, {
				userId: user.id
			});
			if (gqlError) throw gqlError;
			followingIds = ((data as any)?.follow ?? []).map((f: any) => f.following_id);
			followingLoaded = true;
		} catch (e) {
			// Silently fail, user just won't see following filter work
			followingIds = [];
			followingLoaded = true;
		}
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
			let data: any;
			let gqlError: any;

			if (filterMode === 'following' && followingIds.length > 0) {
				// Fetch discussions from followed users
				const result = await nhost.graphql.request(LIST_DISCUSSIONS_FROM_FOLLOWING, {
					authorIds: followingIds,
					limit: PAGE_SIZE,
					offset: page * PAGE_SIZE
				});
				data = result.data;
				gqlError = result.error;
			} else if (filterMode === 'following' && followingIds.length === 0) {
				// User is not following anyone - return empty
				discussions = [];
				hasMoreDiscussions = false;
				loading = false;
				return;
			} else if (filterMode === 'interests') {
				// Get the tags to filter by (saved interests or manually selected)
				const tagsToFilter = selectedInterests.length > 0 ? selectedInterests : userInterests;
				if (tagsToFilter.length === 0) {
					// No interests selected - show empty state
					discussions = [];
					hasMoreDiscussions = false;
					loading = false;
					return;
				}
				// Use dynamic tag overlap query for interests
				const { query: tagQuery, variables: tagVars } = buildTagOverlapQuery(tagsToFilter, PAGE_SIZE);
				const result = await nhost.graphql.request(tagQuery, tagVars);
				data = result.data;
				gqlError = result.error;
				// Tag search doesn't support pagination well, so disable load more
				hasMoreDiscussions = false;
			} else {
				// Fetch all published discussions
				const result = await nhost.graphql.request(LIST_PUBLISHED_DISCUSSIONS, {
					limit: PAGE_SIZE,
					offset: page * PAGE_SIZE
				});
				data = result.data;
				gqlError = result.error;
			}

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

	async function handleRemoveEditorsPick(pickId: string) {
		if (!confirm("Are you sure you want to remove this item from the Editors' Desk?")) {
			return;
		}

		try {
			const { error: deleteError } = await nhost.graphql.request(DELETE_EDITORS_DESK_PICK, {
				pickId
			});

			if (deleteError) {
				throw Array.isArray(deleteError)
					? new Error(deleteError.map((e: any) => e.message).join('; '))
					: deleteError;
			}

			// Refresh the picks list
			await fetchEditorsDeskPicks();
		} catch (e: any) {
			alert('Failed to remove pick: ' + (e.message ?? 'Unknown error'));
		}
	}

	function closePicker() {
		pickerOpen = false;
		selectedDiscussion = null;
		// Refresh picks after creating one
		fetchEditorsDeskPicks();
	}

	async function fetchSuggestedContributors() {
		if (userInterests.length === 0 || !user?.id) return;
		suggestionsLoading = true;
		try {
			const excludeIds = [user.id, ...followingIds];
			const { query, variables } = buildSuggestContributorsQuery(userInterests);
			const { data, error: gqlError } = await nhost.graphql.request(
				query,
				{ ...variables, excludeIds, limit: 6 }
			);
			if (gqlError) throw gqlError;
			// Dedupe contributors by id (multiple discussions may share authors)
			const seen = new Set<string>();
			const contributors: SuggestedContributor[] = [];
			for (const d of (data as any)?.discussion ?? []) {
				const c = d.contributor;
				if (c?.id && !seen.has(c.id)) {
					seen.add(c.id);
					contributors.push(c);
				}
				if (contributors.length >= 6) break;
			}
			suggestedContributors = contributors;
		} catch (e) {
			suggestedContributors = [];
		} finally {
			suggestionsLoading = false;
		}
	}

	async function setFilterMode(mode: FilterMode) {
		filterMode = mode;
		if (mode === 'following' && !followingLoaded) {
			await fetchFollowingIds();
		}
		if (mode === 'following' && followingIds.length === 0) {
			await fetchSuggestedContributors();
		}
		if (mode === 'interests') {
			if (!interestsLoaded) {
				await fetchAllTags();
			}
			// Auto-select saved interests so the user gets a personalized feed
			if (userInterests.length > 0 && selectedInterests.length === 0) {
				selectedInterests = [...userInterests];
			}
		}
		await fetchAll(true);
	}

	async function fetchAllTags() {
		try {
			const { data, error: gqlError } = await nhost.graphql.request(GET_ALL_TAGS);
			if (gqlError) throw gqlError;
			// Flatten and dedupe tags from all discussions
			const tagArrays = ((data as any)?.discussion_version ?? []).map((dv: any) => dv.tags ?? []);
			const flatTags = tagArrays.flat();
			allTags = [...new Set(flatTags)].sort();
			interestsLoaded = true;
		} catch (e) {
			allTags = [];
			interestsLoaded = true;
		}
	}

	function toggleInterest(tag: string) {
		if (selectedInterests.includes(tag)) {
			selectedInterests = selectedInterests.filter((t) => t !== tag);
		} else {
			selectedInterests = [...selectedInterests, tag];
		}
		// Re-fetch with new selection
		fetchAll(true);
	}

	async function saveInterests() {
		if (!user?.id || selectedInterests.length === 0) return;
		savingInterests = true;
		try {
			const { data: _d, error: gqlError } = await nhost.graphql.request(
				`mutation UpdateContributorInterests($userId: uuid!, $interests: [String!]!) {
					update_contributor_by_pk(pk_columns: { id: $userId }, _set: { interests: $interests }) {
						id
						interests
					}
				}`,
				{ userId: user.id, interests: selectedInterests }
			);
			if (gqlError) throw gqlError;
			userInterests = [...selectedInterests];
			// Update contributor data
			if (contributor) {
				contributor = { ...contributor, interests: selectedInterests };
			}
		} catch (e: any) {
			console.error('Failed to save interests:', e);
		} finally {
			savingInterests = false;
		}
	}

	onMount(async () => {
		await ensureAuthReadyAndHeaders();
		await fetchAll(true);
		await fetchEditorsDeskPicks();
		await fetchContributor();
		// Pre-fetch following IDs and interests for logged-in users
		if (user?.id) {
			await fetchFollowingIds();
			// Load user's saved interests from contributor data
			if (contributor?.interests) {
				userInterests = contributor.interests;
				selectedInterests = [...contributor.interests];
			}
		}
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

<!-- Alpha strip — site-level, dismissable -->
{#if !alphaDismissed}
	<div class="alpha-strip">
		<p>
			We're currently in <strong>Alpha</strong>. Features and designs may change as we work toward
			Beta in early-to-mid 2026.
		</p>
		<button class="alpha-dismiss" onclick={() => (alphaDismissed = true)} aria-label="Dismiss">✕</button>
	</div>
{/if}

<div class="page-container">
	<!-- Slim header -->
	<header class="page-header">
		<div class="header-top">
			<div class="header-title">
				<span class="editorial-masthead">Learning Through Dialogue</span>
				<h1>Discussions</h1>
			</div>
		</div>

		<!-- Search + filter bar -->
		<div class="search-bar">
			<input
				id="search"
				type="search"
				placeholder="Search by title, author, or keyword…"
				bind:value={q}
				oninput={onSearchInput}
				onkeydown={(e) => e.key === 'Enter' && search()}
			/>
			{#if user}
				<div class="filter-toggle">
					<button
						class="filter-button"
						class:active={filterMode === 'all'}
						onclick={() => setFilterMode('all')}
					>
						All
					</button>
					<button
						class="filter-button"
						class:active={filterMode === 'following'}
						onclick={() => setFilterMode('following')}
					>
						Following
						{#if followingIds.length > 0}
							<span class="filter-count">({followingIds.length})</span>
						{/if}
					</button>
					<button
						class="filter-button"
						class:active={filterMode === 'interests'}
						onclick={() => setFilterMode('interests')}
					>
						Interests
						{#if userInterests.length > 0}
							<span class="filter-count">({userInterests.length})</span>
						{/if}
					</button>
				</div>
			{/if}
		</div>

		{#if filterMode === 'interests' && user}
			<div class="interests-picker">
				{#if allTags.length > 0}
					<div class="interests-tags">
						{#each allTags as tag}
							<button
								class="interest-tag"
								class:selected={selectedInterests.includes(tag)}
								onclick={() => toggleInterest(tag)}
							>
								{tag}
							</button>
						{/each}
					</div>
					{#if selectedInterests.length > 0 && selectedInterests.join(',') !== userInterests.join(',')}
						<button
							class="save-interests-button"
							onclick={saveInterests}
							disabled={savingInterests}
						>
							{savingInterests ? 'Saving...' : 'Save as my interests'}
						</button>
					{/if}
				{:else if interestsLoaded}
					<p class="interests-empty">No topics available yet.</p>
				{:else}
					<p class="interests-loading">Loading topics...</p>
				{/if}
			</div>
		{/if}
	</header>

	<!-- Onboarding prompt for new / mid-loop users -->
	{#if showOnboarding}
		<div class="onboarding-area">
			<OnboardingPrompt userId={user?.id ?? ''} />
		</div>
	{/if}

	<!-- Editors' Desk: featured cards inline -->
	{#if !q.trim() && !editorsDeskLoading && editorsDeskPicks.length > 0}
		<section class="featured-section">
			<div class="section-label">
				<span class="editorial-kicker">Editors' Picks</span>
			</div>
			<EditorsDeskCarousel
				items={editorsDeskPicks}
				{canCurate}
				onRemove={handleRemoveEditorsPick}
			/>
		</section>
	{/if}

	<!-- Curated Analyses — moved up, compact -->
	{#if !q.trim() && showcaseItems.length > 0}
		<section class="featured-section curated-section">
			<div class="section-label">
				<span class="editorial-kicker">Case Studies</span>
				<p class="section-sub">Learn to spot fallacies and evaluate evidence through real examples.</p>
			</div>
			<FeaturedAnalysesCarousel items={showcaseItems} />
		</section>
	{/if}

	<!-- Main discussion grid -->
	{#if user}
		<main class="discussions-main">
			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			{#if loading && (!discussions || discussions.length === 0)}
				<p class="loading-message">Loading discussions...</p>
			{:else if filtered && filtered.length > 0}
				<div class="discussion-grid">
					{#each filtered as d}
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
								<span class="byline-left">
									{#if d.is_anonymous}
										Anonymous contributor
									{:else if d.contributor?.display_name}
										By
										<a href={`/u/${d.contributor.handle || d.contributor.id}`}
											>{@html highlight(displayName(d.contributor.display_name), q)}</a
										>
									{:else}
										Unknown author
									{/if}
								</span>
								<span class="byline-right">
									{#if replyCount(d) > 0}
										<span class="reply-count">
											<MessageSquare size={12} /> {replyCount(d)}
										</span>
									{/if}
									{#if recentActivity(d)}
										<span class="activity-badge">{recentActivity(d)}</span>
									{/if}
									<time
										>{new Date(d.created_at).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}</time
									>
								</span>
							</footer>
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
			{:else if filterMode === 'following' && followingIds.length === 0 && !loading}
				<div class="following-empty">
					{#if suggestionsLoading}
						<p class="empty-state">Finding contributors for you...</p>
					{:else if userInterests.length === 0}
						<div class="empty-nudge">
							<p class="empty-nudge-headline">Set your interests to discover contributors</p>
							<p class="empty-nudge-body">
								We suggest people to follow based on what you're interested in.
								Switch to <button class="link-button" onclick={() => setFilterMode('interests')}>Interests</button> to pick topics first.
							</p>
						</div>
					{:else if suggestedContributors.length > 0}
						<div class="suggestions-section">
							<p class="suggestions-headline">People writing about your interests</p>
							<div class="suggestion-cards">
								{#each suggestedContributors as c (c.id)}
									<div class="suggestion-card">
										<a href={`/u/${c.handle || c.id}`} class="suggestion-identity">
											{#if c.avatar_url}
												<img src={c.avatar_url} alt="" class="suggestion-avatar" />
											{:else}
												<span class="suggestion-avatar-fallback">
													{(c.display_name ?? '?')[0].toUpperCase()}
												</span>
											{/if}
											<span class="suggestion-name">{displayName(c.display_name)}</span>
										</a>
										<FollowButton
											targetUserId={c.id}
											currentUserId={user?.id ?? ''}
											size="sm"
											onStatusChange={() => {
												// Refresh following list after follow action
												followingLoaded = false;
												fetchFollowingIds();
											}}
										/>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="empty-nudge">
							<p class="empty-nudge-headline">No suggestions yet</p>
							<p class="empty-nudge-body">
								We couldn't find contributors in your interest areas yet.
								Check back as more people join, or browse <button class="link-button" onclick={() => setFilterMode('all')}>All</button> discussions.
							</p>
						</div>
					{/if}
				</div>
			{:else if filterMode === 'following' && !loading}
				<p class="empty-state">No discussions from people you follow yet. Check back soon.</p>
			{:else if filterMode === 'interests' && selectedInterests.length === 0 && !loading}
				<div class="empty-nudge" style="padding: 2rem 0;">
					<p class="empty-nudge-headline">Pick a few topics you care about</p>
					<p class="empty-nudge-body">
						Select interests above and we'll surface discussions that match.
						Save them to personalise your feed across visits.
					</p>
				</div>
			{:else if filterMode === 'interests' && !loading}
				<div class="empty-nudge" style="padding: 2rem 0;">
					<p class="empty-nudge-headline">No discussions on these topics yet</p>
					<p class="empty-nudge-body">
						Be the first to start a conversation, or try different topics.
					</p>
				</div>
			{:else if !loading}
				<p class="empty-state">No discussions yet.</p>
			{/if}
		</main>
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
	/* ── Alpha strip ── */
	.alpha-strip {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 0.5rem 1.5rem;
		background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
		border-bottom: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.alpha-strip p {
		margin: 0;
	}

	.alpha-strip strong {
		color: var(--color-warning);
	}

	.alpha-dismiss {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.25rem;
		line-height: 1;
	}

	.alpha-dismiss:hover {
		color: var(--color-text-primary);
	}

	/* ── Page container ── */
	.page-container {
		background: var(--color-surface-alt);
		min-height: 100vh;
		padding-bottom: 4rem;
	}

	/* ── Slim header ── */
	.page-header {
		padding: clamp(1rem, 2.5vw, 1.5rem) clamp(1rem, 5vw, 4.5rem);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.header-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.header-title h1 {
		margin: 0.15rem 0 0;
		font-family: var(--font-family-display);
		font-size: clamp(1.25rem, 2.5vw, 1.75rem);
		letter-spacing: -0.015em;
	}

	/* ── Search bar ── */
	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.search-bar input {
		flex: 1 1 0;
		min-width: 0;
		padding: 0.55rem 1rem;
		border-radius: 8px;
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
		font-size: 0.9rem;
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
		margin: 0;
	}

	.search-bar input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.filter-toggle {
		display: flex;
		gap: 2px;
		background: color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 8px;
		padding: 2px;
		flex-shrink: 0;
	}

	.filter-button {
		background: transparent;
		border: none;
		padding: 0.4rem 0.7rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.filter-button:hover:not(:disabled) {
		color: var(--color-text-primary);
	}

	.filter-button.active {
		background: var(--color-surface);
		color: var(--color-primary);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.filter-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.filter-count {
		font-size: 0.7rem;
		opacity: 0.8;
	}

	/* ── Interests picker ── */
	.interests-picker {
		margin-top: 0.75rem;
		padding: 0.75rem 0 0;
		background: var(--color-surface);
	}

	.interests-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.interest-tag {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		color: var(--color-text-secondary);
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		font-size: 0.78rem;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.interest-tag:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
	}

	.interest-tag.selected {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.save-interests-button {
		margin-top: 0.6rem;
		background: none;
		color: var(--color-primary);
		border: 1px solid var(--color-primary);
		padding: 0.35rem 0.85rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.save-interests-button:hover:not(:disabled) {
		background: var(--color-primary);
		color: white;
	}

	.save-interests-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.interests-empty,
	.interests-loading {
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		margin: 0;
	}

	/* ── Onboarding area ── */
	.onboarding-area {
		padding: 1rem clamp(1rem, 5vw, 4.5rem) 0;
	}

	/* ── Editorial kicker (shared) ── */
	.editorial-masthead {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-primary);
	}

	.editorial-kicker {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-primary);
	}

	/* ── Featured sections (Editors' Picks + Case Studies) ── */
	.featured-section {
		padding: clamp(1.5rem, 3vw, 2rem) clamp(1.5rem, 5vw, 4.5rem);
		border-bottom: 1px solid var(--color-border);
	}

	.section-label {
		margin-bottom: 1rem;
	}

	.section-sub {
		margin: 0.25rem 0 0;
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	/* ── Main discussions area ── */
	.discussions-main {
		padding: clamp(1.5rem, 3vw, 2rem) clamp(1.5rem, 5vw, 4.5rem);
	}

	/* ── CSS Grid layout ── */
	.discussion-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 1024px) {
		.discussion-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.discussion-grid {
			grid-template-columns: 1fr;
		}
	}

	/* ── Discussion card ── */
	.discussion-card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: var(--border-radius-xl);
		padding: var(--space-fluid-sm, 1.25rem);
		box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
		overflow: hidden;
	}

	.discussion-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
	}

	.discussion-header h2 {
		margin: 0 0 0.5rem;
		font-family: var(--font-family-display);
		font-size: 1.15rem;
		letter-spacing: -0.01em;
		line-height: 1.3;
	}

	.deck {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.5;
		font-size: 0.9rem;
	}

	.discussion-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: 0.75rem;
	}

	.discussion-tags .tag {
		display: inline-block;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 12%, var(--color-surface)),
			color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))
		);
		color: var(--color-primary);
		padding: 0.25rem 0.6rem;
		border-radius: var(--border-radius-lg);
		font-size: 0.7rem;
		font-weight: 500;
		border: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
	}

	.discussion-header-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.75rem;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
	}

	/* ── Card byline ── */
	.card-byline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-top: 0.75rem;
		margin-top: auto;
		border-top: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		font-size: 0.8rem;
	}

	.byline-left {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.byline-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.reply-count {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}

	.activity-badge {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		padding: 0.15rem 0.4rem;
		border-radius: 999px;
		white-space: nowrap;
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
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.card-byline {
			flex-direction: column;
			align-items: flex-start;
		}
	}

	/* ── Utility ── */
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
		margin-bottom: 1.5rem;
	}

	.load-more {
		text-align: center;
		margin-top: 2rem;
	}

	.load-more-button {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		border-radius: 999px;
		padding: 0.75rem 2rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.load-more-button:hover,
	.load-more-button:focus {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.load-more-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Editors' desk button on cards ── */
	.editors-desk-button {
		background: transparent;
		color: white;
		border: none;
		font-size: 0.85rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		cursor: pointer;
	}

	.editors-desk-button:hover {
		transform: translateY(-1px);
	}

	:global([data-theme='dark']) .editors-desk-button img {
		filter: invert(1);
	}

	/* ── Following empty / suggestions ── */
	.following-empty {
		padding: 2rem 0;
	}

	.empty-nudge {
		text-align: center;
		max-width: 28rem;
		margin: 0 auto;
	}

	.empty-nudge-headline {
		font-family: var(--font-family-display);
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 0.5rem;
	}

	.empty-nudge-body {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		line-height: 1.5;
		margin: 0;
	}

	.link-button {
		background: none;
		border: none;
		color: var(--color-primary);
		font-weight: 600;
		font-size: inherit;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.link-button:hover {
		opacity: 0.8;
	}

	.suggestions-section {
		max-width: 36rem;
		margin: 0 auto;
	}

	.suggestions-headline {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 1rem;
		text-align: center;
	}

	.suggestion-cards {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	@media (max-width: 480px) {
		.suggestion-cards {
			grid-template-columns: 1fr;
		}
	}

	.suggestion-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 0.75rem 1rem;
		transition: border-color 0.2s ease;
	}

	.suggestion-card:hover {
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.suggestion-identity {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		text-decoration: none;
		color: var(--color-text-primary);
		min-width: 0;
	}

	.suggestion-identity:hover .suggestion-name {
		text-decoration: underline;
	}

	.suggestion-avatar {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.suggestion-avatar-fallback {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--color-primary) 15%, var(--color-surface-alt));
		color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.85rem;
		flex-shrink: 0;
	}

	.suggestion-name {
		font-weight: 500;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media (max-width: 640px) {
		.page-header {
			padding: 0.75rem 1rem;
		}

		.header-top {
			margin-bottom: 0.5rem;
		}

		.editorial-masthead {
			display: none;
		}

		.search-bar {
			gap: 0.4rem;
		}

		.search-bar input {
			padding: 0.5rem 0.75rem;
			font-size: 0.85rem;
		}

		.filter-button {
			padding: 0.35rem 0.55rem;
			font-size: 0.7rem;
		}

		.onboarding-area {
			padding: 0.75rem 1rem 0;
		}

		.featured-section {
			padding: 1rem;
		}

		.discussions-main {
			padding: 1rem;
		}
	}
</style>
