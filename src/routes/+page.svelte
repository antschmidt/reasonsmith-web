<svelte:options runes={true} />

<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import Dashboard from '$lib/components/Dashboard.svelte';
	import LandingPage from '$lib/components/landing/LandingPage.svelte';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
	// Don't get user during SSR - always show landing page on server
	let user = $state(typeof window !== 'undefined' ? nhost.auth.getUser() : null);

	onMount(() => {
		// Update user on mount
		user = nhost.auth.getUser();

		nhost.auth.onAuthStateChanged((_event: string) => {
			user = nhost.auth.getUser();
		});
	});
</script>

{#if user}
	<Dashboard {user} />
{:else}
	<LandingPage {data} />
{/if}
