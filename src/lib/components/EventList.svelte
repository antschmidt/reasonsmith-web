<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { GET_POST_EVENTS } from '$lib/graphql/queries';
	import EventCard from './EventCard.svelte';
	import { Calendar } from '@lucide/svelte';

	interface Props {
		postId: string;
		currentUserId?: string;
	}

	let { postId, currentUserId }: Props = $props();
	let events = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let isBrowser = $state(false);
	let isExpanded = $state(false);

	// Initialize browser state and load events only on client
	$effect(() => {
		isBrowser = typeof window !== 'undefined';
		if (isBrowser) {
			loadEvents();
		}
	});

	async function loadEvents() {
		isLoading = true;
		error = null;
		try {
			console.log('[EventList] Loading events for post:', postId);
			const now = new Date().toISOString();
			const result = await nhost.graphql.request(GET_POST_EVENTS, { postId, now });
			console.log('[EventList] GraphQL result:', result);
			if (result.error) {
				console.error('[EventList] Error:', result.error);
				error = 'Failed to load events';
			} else {
				events = result.data?.event || [];
				console.log('[EventList] Loaded events:', events);
			}
		} catch (err) {
			console.error('[EventList] Exception:', err);
			error = 'Failed to load events';
		} finally {
			isLoading = false;
		}
	}

	export function refresh() {
		loadEvents();
	}
</script>

{#if isBrowser}
	{#if isLoading}
		<div class="events-loading">
			<Calendar size={20} />
			<span>Loading events...</span>
		</div>
	{:else if error}
		<div class="events-error"><p>{error}</p></div>
	{:else if events.length > 0}
		<div class="events-container">
			<button class="events-header" onclick={() => (isExpanded = !isExpanded)}>
				<span class="toggle-icon" class:expanded={isExpanded}>▶</span>
				<Calendar size={20} />
				<h3>Upcoming Events ({events.length})</h3>
			</button>
			{#if isExpanded}
				<div class="events-list">
					{#each events as event (event.id)}
						<EventCard {event} {currentUserId} onDeleted={loadEvents} />
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.events-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.5rem;
	}
	.events-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--text-primary);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
		width: 100%;
		transition: opacity 0.2s;
	}
	.events-header:hover {
		opacity: 0.7;
	}
	.events-header h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}
	.toggle-icon {
		display: inline-block;
		font-size: 0.75rem;
		transition: transform 0.2s;
		color: var(--text-secondary);
	}
	.toggle-icon.expanded {
		transform: rotate(90deg);
	}
	.events-list {
		display: flex;
		flex-direction: row;
		gap: 1rem;
	}
	.events-loading,
	.events-error {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 8px;
		background: var(--card-background);
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
	}
	.events-error {
		color: var(--color-error);
	}
</style>
