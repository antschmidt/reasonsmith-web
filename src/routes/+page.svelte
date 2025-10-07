<svelte:options runes={true} />

<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import Dashboard from '$lib/components/Dashboard.svelte';
	import LandingPage from '$lib/components/landing/LandingPage.svelte';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
	let user = $state(nhost.auth.getUser());

	onMount(() => {
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
