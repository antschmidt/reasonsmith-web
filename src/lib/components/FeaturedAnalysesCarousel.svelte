<svelte:options runes={true} />

<script lang="ts">
	import { onMount } from 'svelte';

	export type FeaturedShowcaseItem = {
		id: string;
		title: string;
		subtitle?: string | null;
		media_type?: string | null;
		creator?: string | null;
		summary?: string | null;
		analysis?: string | null;
		tags?: string[] | null;
		source_url?: string | null;
		date_published?: string | null;
		created_at: string;
	};

	const props = $props<{ items?: FeaturedShowcaseItem[] }>();
	const items = $derived(props.items ?? []);

	let viewport = $state<HTMLDivElement | null>(null);
	let atStart = $state(true);
	let atEnd = $state(false);

	const sanitizeMultiline = (value?: string | null) => {
		if (!value) return '';
		const escaped = value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
		return escaped.replace(/(?:\r\n|\r|\n)/g, '<br />');
	};

	const getStructuredAnalysisSummary = (analysisJson?: string | null): string | null => {
		if (!analysisJson) return null;
		try {
			const parsed = JSON.parse(analysisJson);
			return parsed?.summary || null;
		} catch {
			return null;
		}
	};

	const updateScrollState = () => {
		if (!viewport) return;
		const { scrollLeft, scrollWidth, clientWidth } = viewport;
		atStart = scrollLeft <= 4;
		atEnd = scrollLeft + clientWidth >= scrollWidth - 4;
	};

	const scrollByPage = (direction: 'prev' | 'next') => {
		if (!viewport) return;
		const amount = viewport.clientWidth * 0.8;
		viewport.scrollBy({ left: direction === 'next' ? amount : -amount, behavior: 'smooth' });
	};

	onMount(() => {
		const handle = () => updateScrollState();
		handle();
		const observer = new ResizeObserver(handle);
		if (viewport) observer.observe(viewport);
		return () => observer.disconnect();
	});
</script>

{#if items.length > 0}
	<div class="featured-carousel" aria-label="Featured analyses carousel">
		<button
			class="nav-button prev"
			type="button"
			onclick={() => scrollByPage('prev')}
			disabled={atStart}
			aria-label="Scroll to previous featured analysis"
		>
			‹
		</button>

		<div class="carousel-viewport" bind:this={viewport} role="list" onscroll={updateScrollState}>
			{#each items as item (item.id)}
				<div role="listitem" class="carousel-card">
					<a href={`/featured/${item.id}`} class="card-link">
						<header class="card-header">
							<div class="meta-tags">
								{#if item.media_type}<span>{item.media_type}</span>{/if}
								{#if item.creator}<span>{item.creator}</span>{/if}
								<span
									>{item.date_published
										? new Date(item.date_published + 'T12:00:00').toLocaleDateString()
										: new Date(item.created_at).toLocaleDateString()}</span
								>
							</div>
							<h3>{item.title}</h3>
							{#if item.subtitle}
								<p class="subtitle">{@html sanitizeMultiline(item.subtitle)}</p>
							{/if}
						</header>
						{#if getStructuredAnalysisSummary(item.analysis)}
							<p class="analysis-summary">
								{@html sanitizeMultiline(getStructuredAnalysisSummary(item.analysis))}
							</p>
						{/if}
						<footer class="card-footer">
							<span class="card-cta">Read analysis</span>
							<span class="card-arrow" aria-hidden="true">→</span>
						</footer>
					</a>
					{#if item.source_url}
						<a class="source-link" href={item.source_url} target="_blank" rel="noopener"
							>Source ↗</a
						>
					{/if}
				</div>
			{/each}
		</div>

		<button
			class="nav-button next"
			type="button"
			onclick={() => scrollByPage('next')}
			disabled={atEnd}
			aria-label="Scroll to next featured analysis"
		>
			›
		</button>
	</div>
{/if}

<style>
	.featured-carousel {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.75rem;
		align-items: center;
	}

	.carousel-viewport {
		position: relative;
		display: flex;
		gap: 1.5rem;
		overflow-x: auto;
		padding: 1rem 0.5rem;
		scroll-snap-type: x mandatory;
		scroll-behavior: smooth;
		scrollbar-width: thin;
	}

	.carousel-viewport::-webkit-scrollbar {
		height: 8px;
	}

	.carousel-viewport::-webkit-scrollbar-track {
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
		border-radius: var(--border-radius-md);
	}

	.carousel-viewport::-webkit-scrollbar-thumb {
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: var(--border-radius-md);
		border: 2px solid transparent;
		background-clip: content-box;
	}

	.carousel-viewport::-webkit-scrollbar-thumb:hover {
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--color-primary) 80%, transparent),
			color-mix(in srgb, var(--color-accent) 80%, transparent)
		);
	}

	.carousel-card {
		scroll-snap-align: start;
		min-width: clamp(280px, 45vw, 350px);
		position: relative;
		border-radius: var(--border-radius-xl);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		/* background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent); */
		backdrop-filter: blur(20px) saturate(1.2);
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 8%, transparent);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		overflow: hidden;
	}

	.card-link {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 2rem;
		color: inherit;
		text-decoration: none;
	}

	.carousel-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: var(--border-radius-xl) var(--border-radius-xl) 0 0;
	}

	.carousel-card:hover {
		transform: translateY(-8px);
		box-shadow: 0 20px 50px color-mix(in srgb, var(--color-primary) 15%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.card-link:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 4px;
	}

	.card-header {
		display: flex;
		flex-direction: column;
		/* gap: 0.15rem; */
	}

	.card-header h3 {
		margin: 0;
		font-size: 1.25rem;
		line-height: 1.3;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}

	.subtitle {
		margin: 0;
		text-align: left;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-weight: 500;
	}

	.analysis-summary {
		margin: 0;
		text-align: left;
		font-size: 0.9rem;
		min-height: 8rem;
		overflow: scroll;
		color: var(--color-text-secondary);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		font-style: italic;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		padding: 0.75rem;
		border-radius: var(--border-radius-md);
		border-left: 3px solid color-mix(in srgb, var(--color-primary) 50%, transparent);
		backdrop-filter: blur(5px);
	}

	.meta-tags {
		order: -1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.meta-tags span + span::before {
		content: '•';
		margin-right: 0.45rem;
		color: color-mix(in srgb, var(--color-text-secondary) 55%, transparent);
	}

	.card-footer {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-primary);
		margin-top: auto;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.card-cta {
		margin: 0;
	}

	.card-arrow {
		display: inline-flex;
		transition: transform var(--transition-speed) ease;
	}

	.carousel-card:hover .card-arrow {
		transform: translateX(2px);
	}

	.source-link {
		position: absolute;
		bottom: 1rem;
		right: 1rem;
		font-size: 0.78rem;
		font-weight: 500;
		color: color-mix(in srgb, var(--color-primary) 90%, transparent);
		text-decoration: none;
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		padding: 0.25rem 0.5rem;
		border-radius: 8px;
		backdrop-filter: blur(10px);
	}

	.source-link:hover,
	.source-link:focus-visible {
		text-decoration: underline;
	}

	.nav-button {
		width: 3rem;
		height: 3rem;
		border-radius: var(--border-radius-xl);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px);
		color: var(--color-text-primary);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.nav-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.nav-button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	@media (max-width: 768px) {
		.carousel-card {
			min-width: clamp(250px, 85vw, 320px);
			padding: 1.5rem;
		}

		.card-header h3 {
			font-size: 1.125rem;
		}

		.nav-button {
			width: 2.5rem;
			height: 2.5rem;
			font-size: 1.25rem;
		}
	}

	@media (max-width: 640px) {
		.featured-carousel {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.nav-button {
			display: none;
		}

		.carousel-viewport {
			order: 2;
			margin: 0 -1rem;
			padding: 1rem;
			gap: 1rem;
		}

		.carousel-card {
			min-width: clamp(240px, 80vw, 300px);
		}
	}
</style>
