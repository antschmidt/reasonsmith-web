<script lang="ts">
	import FeaturedAnalysesCarousel from '../FeaturedAnalysesCarousel.svelte';

	type PublicShowcaseItem = {
		id: string;
		title: string;
		subtitle?: string | null;
		media_type?: string | null;
		creator?: string | null;
		source_url?: string | null;
		summary?: string | null;
		analysis?: string | null;
		tags?: string[] | null;
		created_at: string;
	};

	let { error = null, items = [] } = $props<{
		error?: string | null;
		items?: PublicShowcaseItem[];
	}>();
</script>

<section class="landing-showcase">
	<div class="section-heading">
		<span class="editorial-kicker">Curated Analyses</span>
		<h2>Handpicked rhetoric worth studying.</h2>
		<p class="section-lede">
			Briefings on speeches, podcasts, and essays our editors dissect for sourcing discipline and
			reasoning craft.
		</p>
	</div>
	{#if error}
		<p class="showcase-status error">{error}</p>
	{:else if items.length === 0}
		<p class="showcase-status">Curated analyses will appear here soon.</p>
	{:else}
		<FeaturedAnalysesCarousel {items} />
	{/if}
</section>

<style>
	.landing-showcase {
		padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 6vw, 5rem);
		background: var(--color-surface-alt);
		border-bottom: 1px solid var(--color-border);
	}

	.section-heading {
		max-width: 720px;
		margin: 0 auto clamp(2rem, 5vw, 3rem);
		text-align: center;
	}

	.section-heading h2 {
		margin: 0;
		font-family: var(--font-family-display);
		font-size: clamp(1.8rem, 4vw, 2.5rem);
		letter-spacing: -0.01em;
	}

	.section-lede {
		max-width: 620px;
		margin: 1rem auto 0;
		color: var(--color-text-secondary);
		line-height: var(--line-height-relaxed);
		text-align: center;
	}

	.showcase-status {
		color: var(--color-text-secondary);
		font-size: 0.95rem;
		text-align: center;
	}

	.showcase-status.error {
		color: #f87171;
	}

	@media (max-width: 768px) {
		.landing-showcase {
			margin: 2rem auto 0;
			padding: 2rem 1rem;
		}
	}
</style>
