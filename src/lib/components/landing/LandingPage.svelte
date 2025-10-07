<script lang="ts">
	import LandingHero from './LandingHero.svelte';
	import LandingFeatures from './LandingFeatures.svelte';
	import LandingShowcase from './LandingShowcase.svelte';
	import LandingResources from './LandingResources.svelte';
	import LandingFooter from './LandingFooter.svelte';

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

	type PageData = {
		showcaseError?: string | null;
		showcaseItems?: PublicShowcaseItem[];
	};

	let { data } = $props<{ data: PageData }>();

	let showcaseError = $state<string | null>(data?.showcaseError ?? null);
	let showcaseItems = $state<PublicShowcaseItem[]>(data?.showcaseItems ?? []);

	$effect(() => {
		showcaseItems = data?.showcaseItems ?? [];
		showcaseError = data?.showcaseError ?? null;
	});
</script>

<div class="landing-shell">
	<LandingHero />
	<LandingFeatures />
	<LandingShowcase error={showcaseError} items={showcaseItems} />
	<LandingResources />
	<LandingFooter />
</div>

<style>
	.landing-shell {
		background: var(--color-surface-alt);
	}
</style>
