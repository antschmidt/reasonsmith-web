<script lang="ts">
	/**
	 * Reusable video-anchored analysis view. Takes a flat `excerpts`
	 * list (produced by `annotatedToExcerpts()` from the transcripts
	 * pipeline, or any hand-authored equivalent) and renders:
	 *
	 *   - A filterable excerpt feed in speech order (timestamped).
	 *   - A sticky YouTube player on the side that excerpts can seek.
	 *   - Live highlight of the excerpt under the current playhead.
	 *
	 * No scores, no band labels — just findings at moments. See
	 * content-guideline-characterize-not-score.md.
	 *
	 * Originally extracted from `/prototype/featured-video-anchored/+page.svelte`
	 * so the prototype page and the eventual production `featured/[id]`
	 * route can share the same renderer.
	 */
	import { onMount, onDestroy } from 'svelte';
	import type { Excerpt, ExcerptCategory } from '$lib/transcripts/toExcerpts';

	interface Props {
		excerpts: Excerpt[];
		videoId: string;
		sourceTitle: string;
		sourceMeta?: string;
		/**
		 * Short sentence rendered above the feed. Typically the dossier
		 * thesis. Keep it a single line.
		 */
		blurb?: string;
		/** Optional href to the old categorical dossier — shown as a link. */
		legacyHref?: string;
	}

	const {
		excerpts,
		videoId,
		sourceTitle,
		sourceMeta = '',
		blurb = '',
		legacyHref = ''
	}: Props = $props();

	// ------------------------------------------------------------------
	// Category metadata (display-only)
	// ------------------------------------------------------------------

	const categoryMeta: Record<
		ExcerptCategory,
		{ label: string; icon: string; color: string; bg: string }
	> = {
		good_faith: {
			label: 'Good-faith move',
			icon: '🤝',
			color: '#10b981',
			bg: 'rgba(16, 185, 129, 0.08)'
		},
		fallacy: {
			label: 'Logical fallacy',
			icon: '⚠️',
			color: '#f59e0b',
			bg: 'rgba(245, 158, 11, 0.08)'
		},
		cultish: {
			label: 'Cultish language',
			icon: '🧠',
			color: '#ef4444',
			bg: 'rgba(239, 68, 68, 0.08)'
		},
		fact: {
			label: 'Fact check',
			icon: '🔍',
			color: '#3b82f6',
			bg: 'rgba(59, 130, 246, 0.08)'
		}
	};

	// ------------------------------------------------------------------
	// Filter state
	// ------------------------------------------------------------------

	let activeFilters = $state<Set<ExcerptCategory>>(
		new Set<ExcerptCategory>(['good_faith', 'fallacy', 'cultish', 'fact'])
	);

	function toggleFilter(cat: ExcerptCategory) {
		const next = new Set(activeFilters);
		if (next.has(cat)) next.delete(cat);
		else next.add(cat);
		if (next.size === 0) next.add(cat);
		activeFilters = next;
	}

	const visibleExcerpts = $derived(excerpts.filter((e) => activeFilters.has(e.category)));

	const counts = $derived({
		good_faith: excerpts.filter((e) => e.category === 'good_faith').length,
		fallacy: excerpts.filter((e) => e.category === 'fallacy').length,
		cultish: excerpts.filter((e) => e.category === 'cultish').length,
		fact: excerpts.filter((e) => e.category === 'fact').length
	});

	// ------------------------------------------------------------------
	// YouTube IFrame API integration
	// ------------------------------------------------------------------

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let player: any = null;
	let playerReady = $state(false);
	let currentTime = $state(0);
	let pollInterval: number | null = null;
	let apiScriptEl: HTMLScriptElement | null = null;

	const activeExcerptId = $derived(
		visibleExcerpts.find(
			(e) => currentTime >= e.startSec && currentTime < (e.endSec ?? e.startSec + 10)
		)?.id ?? null
	);

	onMount(() => {
		if (typeof window === 'undefined') return;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const g = window as any;
		const initPlayer = () => {
			player = new g.YT.Player('ytplayer', {
				events: {
					onReady: () => {
						playerReady = true;
						pollInterval = window.setInterval(() => {
							if (player?.getCurrentTime) {
								currentTime = player.getCurrentTime();
							}
						}, 500);
					}
				}
			});
		};

		if (g.YT && g.YT.Player) {
			initPlayer();
		} else {
			const prev = g.onYouTubeIframeAPIReady;
			g.onYouTubeIframeAPIReady = () => {
				if (typeof prev === 'function') prev();
				initPlayer();
			};
			if (!document.querySelector('script[data-yt-iframe-api]')) {
				apiScriptEl = document.createElement('script');
				apiScriptEl.src = 'https://www.youtube.com/iframe_api';
				apiScriptEl.async = true;
				apiScriptEl.setAttribute('data-yt-iframe-api', '');
				document.head.appendChild(apiScriptEl);
			}
		}
	});

	onDestroy(() => {
		if (pollInterval !== null) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
		// Leave the API script in place — it may be shared across navigations.
		player = null;
	});

	function seekTo(sec: number) {
		if (player?.seekTo) {
			player.seekTo(sec, true);
			if (player.playVideo) player.playVideo();
			currentTime = sec;
		}
	}

	function formatTime(sec: number): string {
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// ------------------------------------------------------------------
	// Highlight renderer
	// ------------------------------------------------------------------

	function renderQuote(quote: string, highlight?: string): string {
		if (!highlight) return escapeHtml(quote);
		const idx = quote.toLowerCase().indexOf(highlight.toLowerCase());
		if (idx === -1) return escapeHtml(quote);
		const before = quote.slice(0, idx);
		const match = quote.slice(idx, idx + highlight.length);
		const after = quote.slice(idx + highlight.length);
		return `${escapeHtml(before)}<mark class="phrase">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
	}

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	let expanded = $state<Set<string>>(new Set());
	function toggleExpand(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function reactionLabel(type: string): string {
		switch (type) {
			case 'applause':
			case 'applauding':
			case 'clapping':
			case 'audience clapping':
				return '👏 applause';
			case 'cheering':
				return '📣 cheers';
			case 'laughs':
			case 'laughing':
			case 'chuckles':
				return '😄 laughter';
			default:
				return type;
		}
	}
</script>

<main class="video-anchored">
	<header class="va-header">
		<h1>{sourceTitle}</h1>
		{#if sourceMeta}
			<p class="va-meta">{sourceMeta}</p>
		{/if}
		{#if blurb}
			<p class="va-blurb">
				{blurb}
				{#if legacyHref}
					<br />
					<a href={legacyHref} class="legacy-link">View the categorical dossier →</a>
				{/if}
			</p>
		{:else if legacyHref}
			<p class="va-blurb">
				<a href={legacyHref} class="legacy-link">View the categorical dossier →</a>
			</p>
		{/if}
	</header>

	<div class="layout">
		<section class="feed" aria-label="Findings in speech order">
			<div class="filters" role="toolbar" aria-label="Filter by category">
				{#each Object.entries(categoryMeta) as [cat, meta] (cat)}
					{@const c = cat as ExcerptCategory}
					{@const on = activeFilters.has(c)}
					<button
						type="button"
						class="chip"
						class:on
						style:--chip-color={meta.color}
						style:--chip-bg={meta.bg}
						aria-pressed={on}
						onclick={() => toggleFilter(c)}
					>
						<span class="chip-icon">{meta.icon}</span>
						<span>{meta.label}</span>
						<span class="chip-count">{counts[c]}</span>
					</button>
				{/each}
			</div>

			<ol class="excerpts">
				{#each visibleExcerpts as excerpt (excerpt.id)}
					{@const meta = categoryMeta[excerpt.category]}
					{@const isActive = activeExcerptId === excerpt.id}
					{@const isExpanded = expanded.has(excerpt.id)}
					<li
						class="excerpt"
						class:active={isActive}
						style:--cat-color={meta.color}
						style:--cat-bg={meta.bg}
					>
						<button
							type="button"
							class="jump"
							onclick={() => seekTo(excerpt.startSec)}
							aria-label={`Jump to ${formatTime(excerpt.startSec)}`}
						>
							<span class="timestamp">{formatTime(excerpt.startSec)}</span>
							<span class="jump-icon" aria-hidden="true">▶</span>
						</button>

						<div class="excerpt-body">
							<div class="finding-row">
								<span class="cat-pill">
									<span aria-hidden="true">{meta.icon}</span>
									{meta.label}
								</span>
								<h3 class="finding-title">{excerpt.findingTitle}</h3>
							</div>

							<blockquote class="quote">
								{@html renderQuote(excerpt.quote, excerpt.highlight)}
							</blockquote>

							{#if excerpt.reactions && excerpt.reactions.length > 0}
								<div class="reactions" aria-label="Audience reactions">
									{#each excerpt.reactions as r, i (i)}
										<span class="reaction">{reactionLabel(r.type)}</span>
									{/each}
								</div>
							{/if}

							<button
								type="button"
								class="why-toggle"
								aria-expanded={isExpanded}
								onclick={() => toggleExpand(excerpt.id)}
							>
								{isExpanded ? '− Hide explanation' : '+ Why this matters'}
							</button>

							{#if isExpanded}
								<p class="why">{excerpt.whyItMatters}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ol>

			{#if visibleExcerpts.length === 0}
				<p class="empty">No excerpts match the selected filters.</p>
			{/if}
		</section>

		<aside class="video-column">
			<div class="video-sticky">
				<div class="video-wrap">
					<iframe
						id="ytplayer"
						title="Source video"
						src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`}
						frameborder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
					></iframe>
				</div>

				<div class="playhead">
					<span class="playhead-label">Now playing</span>
					<span class="playhead-time">{formatTime(currentTime)}</span>
					{#if !playerReady}
						<span class="playhead-status">loading…</span>
					{/if}
				</div>

				<p class="source-note">
					We excerpt short passages for commentary and link to the original video rather than
					hosting a full transcript.
				</p>
			</div>
		</aside>
	</div>
</main>

<style>
	.video-anchored {
		max-width: 1280px;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-fluid-sm);
		font-family: var(--font-family-ui);
		color: var(--color-text-primary);
	}

	.va-header h1 {
		font-family: var(--font-family-display);
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		margin: 0 0 0.25rem;
	}

	.va-meta {
		color: var(--color-text-secondary);
		margin: 0;
		font-size: var(--font-size-sm);
	}

	.va-blurb {
		color: var(--color-text-secondary);
		margin: var(--space-sm) 0 var(--space-lg);
		font-size: var(--font-size-base);
	}

	.legacy-link {
		color: var(--color-link);
		text-decoration: none;
		border-bottom: 1px dashed currentColor;
	}
	.legacy-link:hover {
		color: var(--color-link-hover);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
		gap: var(--space-lg);
	}

	@media (max-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	/* ---------- filters ---------- */

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: var(--space-md);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem;
		font-size: var(--font-size-sm);
		font-family: inherit;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			all 0.15s ease;
	}
	.chip:hover {
		border-color: var(--chip-color);
		color: var(--chip-color);
	}
	.chip.on {
		background: var(--chip-bg);
		border-color: var(--chip-color);
		color: var(--chip-color);
		font-weight: 600;
	}
	.chip-count {
		font-size: var(--font-size-xs);
		opacity: 0.75;
		padding-left: 0.35rem;
		border-left: 1px solid currentColor;
		margin-left: 0.1rem;
	}

	/* ---------- excerpt list ---------- */

	.excerpts {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.excerpt {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 0.75rem;
		padding: var(--space-sm);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--cat-color);
		border-radius: 8px;
		background: var(--color-surface);
		transition:
			box-shadow 0.2s ease,
			border-color 0.2s ease;
	}
	.excerpt.active {
		box-shadow:
			0 0 0 2px var(--cat-color),
			0 8px 24px color-mix(in srgb, var(--cat-color) 18%, transparent);
		background: var(--cat-bg);
	}

	.jump {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
		font-family: var(--font-family-ui);
		cursor: pointer;
		transition:
			all 0.15s ease;
	}
	.jump:hover {
		border-color: var(--cat-color);
		color: var(--cat-color);
		background: var(--cat-bg);
	}
	.timestamp {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: var(--font-size-sm);
	}
	.jump-icon {
		font-size: 0.7rem;
	}

	.excerpt-body {
		min-width: 0;
	}

	.finding-row {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.cat-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--font-size-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--cat-color);
		background: var(--cat-bg);
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
	}

	.finding-title {
		margin: 0;
		font-family: var(--font-family-display);
		font-size: var(--font-size-lg);
		line-height: 1.3;
	}

	.quote {
		margin: 0.25rem 0 0.5rem;
		padding: 0.4rem 0 0.4rem 0.75rem;
		border-left: 2px solid color-mix(in srgb, var(--cat-color) 40%, transparent);
		font-family: var(--font-family-display);
		font-size: var(--font-size-md);
		line-height: 1.55;
		color: var(--color-text-primary);
	}

	.quote :global(.phrase) {
		background: color-mix(in srgb, var(--cat-color) 18%, transparent);
		padding: 0 0.15rem;
		border-radius: 2px;
	}

	.reactions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0.1rem 0 0.35rem;
	}
	.reaction {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}

	.why-toggle {
		appearance: none;
		background: transparent;
		border: none;
		padding: 0;
		margin-top: 0.25rem;
		color: var(--color-text-secondary);
		font-family: inherit;
		font-size: var(--font-size-sm);
		cursor: pointer;
	}
	.why-toggle:hover {
		color: var(--cat-color);
	}

	.why {
		margin: 0.5rem 0 0;
		font-size: var(--font-size-sm);
		line-height: 1.5;
		color: var(--color-text-secondary);
	}

	.empty {
		color: var(--color-text-tertiary);
		font-style: italic;
		padding: var(--space-md);
		text-align: center;
	}

	/* ---------- video column ---------- */

	.video-column {
		min-width: 0;
	}

	.video-sticky {
		position: sticky;
		top: var(--space-md);
	}

	.video-wrap {
		position: relative;
		padding-bottom: 56.25%;
		height: 0;
		border-radius: 8px;
		overflow: hidden;
		background: #000;
	}
	.video-wrap iframe {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}

	.playhead {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-top: 0.5rem;
		background: var(--color-surface-alt);
		border-radius: 6px;
		font-size: var(--font-size-sm);
	}
	.playhead-label {
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: var(--font-size-xs);
	}
	.playhead-time {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: var(--color-text-primary);
	}
	.playhead-status {
		margin-left: auto;
		color: var(--color-text-tertiary);
		font-style: italic;
	}

	.source-note {
		margin: var(--space-sm) 0 0;
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		line-height: 1.5;
	}

	@media (max-width: 900px) {
		.video-sticky {
			position: sticky;
			top: 0;
			background: var(--color-surface);
			padding: 0.5rem 0;
			z-index: 10;
			margin-bottom: var(--space-md);
		}
	}
</style>
