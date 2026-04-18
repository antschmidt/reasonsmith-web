<script lang="ts">
	// Four-step progress rail shown at the top of the seeded starter
	// discussion while the contributor is mid-loop. Maps contributor
	// onboarding_state → which step is "current" and which are "done".
	//
	// Render conditions (the parent is expected to gate, but we double-check):
	//   - discussion.is_onboarding_starter === true
	//   - onboarding_state !== 'completed'
	//
	// Copy is terse on purpose — the rail is meant to orient, not teach.
	// Detailed guidance lives in the prompt card on the dashboard and in
	// later coachmarks (Chunk 4b).
	import { contributorStore, type OnboardingState } from '$lib/stores/contributorStore';
	import { advanceOnboarding } from '$lib/onboarding/state';

	let { userId, visible = true } = $props<{ userId: string; visible?: boolean }>();

	interface Step {
		key: OnboardingState;
		label: string;
	}

	const STEPS: Step[] = [
		{ key: 'read_prompt', label: 'Read the prompt' },
		{ key: 'drafted_reply', label: 'Draft a reply' },
		{ key: 'received_feedback', label: 'Reasoning Review' },
		{ key: 'revised', label: 'Revise or publish' }
	];

	function rank(s: OnboardingState): number {
		return ['not_started', 'read_prompt', 'drafted_reply', 'received_feedback', 'revised', 'completed'].indexOf(s);
	}

	const current = $derived(
		($contributorStore?.onboarding_state as OnboardingState) ?? 'not_started'
	);

	function stepStatus(step: Step): 'done' | 'current' | 'upcoming' {
		const currentRank = rank(current);
		const stepRank = rank(step.key);
		if (currentRank > stepRank) return 'done';
		if (currentRank === stepRank) return 'current';
		// Edge case: not_started is before read_prompt; treat read_prompt as current
		if (current === 'not_started' && step.key === 'read_prompt') return 'current';
		return 'upcoming';
	}

	async function skip() {
		await advanceOnboarding({
			contributorId: userId,
			nextState: 'completed',
			markCompleted: true
		});
	}
</script>

{#if visible && current !== 'completed'}
	<aside class="rail" aria-label="Onboarding progress">
		<ol class="steps">
			{#each STEPS as step, i (step.key)}
				{@const status = stepStatus(step)}
				<li class="step step-{status}">
					<span class="marker" aria-hidden="true">
						{#if status === 'done'}
							<svg viewBox="0 0 16 16" width="14" height="14">
								<path
									d="M3 8.5 L6.5 12 L13 4"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{:else}
							<span class="dot">{i + 1}</span>
						{/if}
					</span>
					<span class="label">{step.label}</span>
				</li>
			{/each}
		</ol>
		<button type="button" class="skip" onclick={skip}>Exit the guided loop</button>
	</aside>
{/if}

<style>
	.rail {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		margin-bottom: 1.5rem;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface-elevated, var(--color-surface));
		font-size: 0.875rem;
	}

	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
		flex: 1;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-text-tertiary, var(--color-text-secondary));
	}

	.step-done {
		color: var(--color-text-secondary);
	}

	.step-current {
		color: var(--color-text-primary);
		font-weight: 500;
	}

	.marker {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid currentColor;
		flex-shrink: 0;
	}

	.step-done .marker {
		background: var(--color-primary);
		color: var(--color-on-primary, #fff);
		border-color: var(--color-primary);
	}

	.step-current .marker {
		background: var(--color-primary);
		color: var(--color-on-primary, #fff);
		border-color: var(--color-primary);
	}

	.dot {
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1;
	}

	.label {
		white-space: nowrap;
	}

	.skip {
		background: none;
		border: none;
		padding: 0.25rem 0.5rem;
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		flex-shrink: 0;
	}

	.skip:hover {
		color: var(--color-text-primary);
	}

	@media (max-width: 720px) {
		.rail {
			flex-direction: column;
			align-items: stretch;
		}

		.label {
			white-space: normal;
		}
	}
</style>
