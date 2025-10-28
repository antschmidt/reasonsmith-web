<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import { GET_EDITORS_DESK_PICKS } from '$lib/graphql/queries';
	import LandingHero from './LandingHero.svelte';
	import LandingFeatures from './LandingFeatures.svelte';
	import LandingLearningPath from './LandingLearningPath.svelte';
	import LandingShowcase from './LandingShowcase.svelte';
	import LandingResources from './LandingResources.svelte';
	import LandingFooter from './LandingFooter.svelte';
	import EditorsDeskCarousel from '$lib/components/EditorsDeskCarousel.svelte';

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

	// Editors' Desk state
	let editorsDeskPicks = $state<any[]>([]);
	let editorsDeskLoading = $state(false);
	let editorsDeskError = $state<string | null>(null);

	$effect(() => {
		// Only run on client side
		if (typeof window !== 'undefined') {
			showcaseItems = data?.showcaseItems ?? [];
			showcaseError = data?.showcaseError ?? null;
		}
	});

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
			console.error('Error loading editors desk picks:', e);
		} finally {
			editorsDeskLoading = false;
		}
	}

	onMount(() => {
		fetchEditorsDeskPicks();
	});
</script>

<div class="landing-shell">
	<LandingHero {editorsDeskPicks} />

	<LandingFeatures />
	<LandingLearningPath />
	<LandingShowcase error={showcaseError} items={showcaseItems} />
	<LandingResources />
	<LandingFooter />
</div>

<style>
	.landing-shell {
		background: var(--color-surface-alt);
	}
</style>
