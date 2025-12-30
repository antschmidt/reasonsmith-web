<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { nhost } from '$lib/nhostClient';
	import { onMount } from 'svelte';
	import { CREATE_DISCUSSION_WITH_VERSION } from '$lib/graphql/queries';
	import { GET_PUBLIC_SHOWCASE_ITEM } from '$lib/graphql/queries/public-showcase';
	import AnimatedLogo from '$lib/components/ui/AnimatedLogo.svelte';

	let creating = $state(true);
	let error = $state<string | null>(null);
	let showcaseItem = $state<{ id: string; title: string; subtitle?: string | null } | null>(null);

	onMount(async () => {
		const user = nhost.auth.getUser();

		if (!user) {
			// Not authenticated, redirect to login
			goto('/');
			return;
		}

		// Check for showcase query parameter
		const showcaseId = $page.url.searchParams.get('showcase');

		try {
			// If we have a showcase ID, fetch the showcase item details
			if (showcaseId) {
				const showcaseResult = await nhost.graphql.request(GET_PUBLIC_SHOWCASE_ITEM, {
					id: showcaseId
				});

				if (showcaseResult.data?.public_showcase_item_by_pk) {
					showcaseItem = showcaseResult.data.public_showcase_item_by_pk;
				}
			}

			// Create a new discussion with a draft version
			const result = await nhost.graphql.request(CREATE_DISCUSSION_WITH_VERSION, {
				title: showcaseItem ? `Discussion: ${showcaseItem.title}` : '',
				description: showcaseItem?.subtitle || '',
				tags: [],
				sections: [],
				claims: [],
				citations: [],
				createdBy: user.id,
				showcaseItemId: showcaseId || null
			});

			if (result.error) {
				console.error('Failed to create discussion:', result.error);
				throw new Error('Failed to create discussion');
			}

			const discussion = result.data?.insert_discussion_one;
			if (!discussion?.id) {
				throw new Error('No discussion ID returned');
			}

			const draftVersion = discussion.discussion_versions?.[0];
			if (!draftVersion?.id) {
				throw new Error('No draft version created');
			}

			// Redirect to the draft editor
			goto(`/discussions/${discussion.id}/draft/${draftVersion.id}`);
		} catch (e: any) {
			console.error('Error creating discussion:', e);
			error = e.message || 'Failed to create discussion';
			creating = false;
		}
	});
</script>

<div class="new-discussion-redirect">
	{#if creating}
		<div class="creating-message">
			<AnimatedLogo size="64px" />
			{#if showcaseItem}
				<p>Creating discussion about "{showcaseItem.title}"...</p>
			{:else}
				<p>Creating your new discussion...</p>
			{/if}
		</div>
	{:else if error}
		<div class="error-message">
			<p class="error">{error}</p>
			<button onclick={() => goto('/')}>Go Back</button>
		</div>
	{/if}
</div>

<style>
	.new-discussion-redirect {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		padding: 2rem;
	}

	.creating-message,
	.error-message {
		text-align: center;
		max-width: 400px;
	}

	.creating-message p {
		margin-top: 1.5rem;
		color: var(--text-secondary);
		font-size: 1.1rem;
	}

	.error-message p {
		margin-bottom: 1.5rem;
		color: var(--error);
		font-size: 1.1rem;
	}

	.error-message button {
		padding: 0.75rem 1.5rem;
		background: var(--primary);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
	}

	.error-message button:hover {
		background: var(--primary-dark);
	}
</style>
