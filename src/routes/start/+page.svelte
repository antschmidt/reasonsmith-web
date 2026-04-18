<script lang="ts">
	// The "10-minute loop" entry point. Resolves the seeded starter discussion,
	// marks the current contributor as read_prompt, and redirects into the
	// discussion. Unauthenticated visitors are sent to /login with a return
	// target so they land back here after signing in.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import { advanceOnboarding, getStarterDiscussionId } from '$lib/onboarding/state';
	import AnimatedLogo from '$lib/components/ui/AnimatedLogo.svelte';

	let message = $state('Finding your starter discussion…');
	let failed = $state(false);

	onMount(async () => {
		const user = nhost.auth.getUser();
		if (!user) {
			await goto('/login?redirect=/start');
			return;
		}

		const discussionId = await getStarterDiscussionId();
		if (!discussionId) {
			message = "We couldn't find a starter discussion yet. Taking you to the home page.";
			failed = true;
			setTimeout(() => goto('/'), 1500);
			return;
		}

		// Await so the DB has the right state before the layout re-queries.
		await advanceOnboarding({
			contributorId: user.id,
			nextState: 'read_prompt',
			discussionId
		});

		await goto(`/discussions/${discussionId}`);
	});
</script>

<div class="start-shell">
	<AnimatedLogo size="48px" isAnimating={!failed} />
	<p>{message}</p>
</div>

<style>
	.start-shell {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.25rem;
		min-height: 60vh;
		color: var(--color-text-secondary);
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 1.1rem;
	}
</style>
