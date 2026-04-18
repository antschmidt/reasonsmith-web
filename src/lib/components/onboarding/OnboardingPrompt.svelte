<script lang="ts">
	// Dashboard-top card that invites a first-time contributor into the
	// "10-minute loop". Shown whenever the current contributor's
	// onboarding_state is anything other than 'completed' (see Plan 1).
	//
	// The card has two affordances:
	//   1. "Try the 10-minute loop" — primary CTA, links to /start
	//   2. "Skip for now" — quietly marks the contributor 'completed' so the
	//      prompt disappears. We don't call it "dismiss" because that reads
	//      as guilt-trippy; skipping is a legitimate choice.
	//
	// Copy follows docs/copy-guidelines.md: warm, second person, no
	// hero-speak, no exclamation marks.
	import { contributorStore, type OnboardingState } from '$lib/stores/contributorStore';
	import { advanceOnboarding } from '$lib/onboarding/state';

	let { userId } = $props<{ userId: string }>();

	let skipping = $state(false);

	const LABELS: Record<OnboardingState, string> = {
		not_started: 'Start here',
		read_prompt: 'Pick up where you left off',
		drafted_reply: 'Pick up where you left off',
		received_feedback: 'Pick up where you left off',
		revised: 'Pick up where you left off',
		completed: 'Completed'
	};

	const SUBCOPY: Record<OnboardingState, string> = {
		not_started:
			"A short guided loop: read a prompt, draft a reply, see how a good-faith read responds, and decide what (if anything) to revise. Takes about ten minutes.",
		read_prompt:
			"You've read the starter prompt. Draft a reply when you're ready — we'll check your reasoning once you've written something.",
		drafted_reply:
			"Your draft is saved. Hit 'Reasoning Review' to see how your argument holds up.",
		received_feedback:
			"The feedback is in. Revise if something lands — or publish as-is if you're happy with it.",
		revised: "One more pass and you're done. Publish when you're ready.",
		completed: ''
	};

	const onboardingState = $derived(
		($contributorStore?.onboarding_state as OnboardingState) ?? 'not_started'
	);
	const heading = $derived(LABELS[onboardingState] ?? LABELS.not_started);
	const sub = $derived(SUBCOPY[onboardingState] ?? SUBCOPY.not_started);

	async function skip() {
		if (skipping) return;
		skipping = true;
		try {
			await advanceOnboarding({
				contributorId: userId,
				nextState: 'completed',
				markCompleted: true
			});
		} finally {
			skipping = false;
		}
	}
</script>

{#if onboardingState !== 'completed'}
	<section class="onboarding-prompt" aria-labelledby="onboarding-heading">
		<div class="copy">
			<h2 id="onboarding-heading">{heading}</h2>
			<p>{sub}</p>
		</div>
		<div class="actions">
			<a class="primary" href="/start">
				{onboardingState === 'not_started' ? 'Try the 10-minute loop' : 'Continue the loop'}
			</a>
			<button type="button" class="skip" onclick={skip} disabled={skipping}>
				{skipping ? 'Skipping…' : 'Skip for now'}
			</button>
		</div>
	</section>
{/if}

<style>
	.onboarding-prompt {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem 1.75rem;
		margin-bottom: 2rem;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		background: var(--color-surface-elevated, var(--color-surface));
	}

	.copy h2 {
		margin: 0 0 0.5rem 0;
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 1.35rem;
		font-weight: 600;
		color: var(--color-text-primary);
		letter-spacing: -0.01em;
	}

	.copy p {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.5;
		font-size: 0.95rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.primary {
		display: inline-flex;
		align-items: center;
		padding: 0.55rem 1.1rem;
		border-radius: 6px;
		background: var(--color-primary);
		color: var(--color-on-primary, #fff);
		font-weight: 500;
		text-decoration: none;
		font-size: 0.95rem;
	}

	.primary:hover {
		filter: brightness(1.05);
	}

	.skip {
		background: none;
		border: none;
		padding: 0.55rem 0.25rem;
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.skip:hover:not(:disabled) {
		color: var(--color-text-primary);
	}

	.skip:disabled {
		opacity: 0.6;
		cursor: default;
	}

	@media (min-width: 720px) {
		.onboarding-prompt {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 1.5rem;
		}

		.actions {
			flex-shrink: 0;
		}
	}
</style>
