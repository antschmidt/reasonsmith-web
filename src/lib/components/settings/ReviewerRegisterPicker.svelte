<!--
  ReviewerRegisterPicker (Plan 8)

  Four-card picker for the voice the AI coach uses.

  Persistence: when `contributorId` is provided the selection is saved to the
  contributor.reviewer_register column via GraphQL. Also mirrors to
  localStorage (`rs.reviewerRegister`) so signed-out previews and the initial
  paint before SSR-hydration feel instant.

  Props:
    value          — the currently-selected register (optional)
    contributorId  — the current user's contributor id; enables DB persistence
    onChange       — called with the new register whenever the user picks one
-->
<script lang="ts">
	import type { ReviewerRegister } from '$lib/goodFaith';
	import { nhost } from '$lib/nhostClient';
	import { contributorStore } from '$lib/stores/contributorStore';

	let {
		value = 'editor',
		contributorId,
		onChange
	} = $props<{
		value?: ReviewerRegister;
		contributorId?: string | null;
		onChange?: (next: ReviewerRegister) => void;
	}>();

	let saveError = $state<string | null>(null);
	let saving = $state(false);

	const UPDATE_REGISTER_MUTATION = `
		mutation UpdateContributorReviewerRegister(
			$contributorId: uuid!
			$register: reviewer_register!
		) {
			update_contributor_by_pk(
				pk_columns: { id: $contributorId }
				_set: { reviewer_register: $register }
			) {
				id
				reviewer_register
			}
		}
	`;

	interface RegisterOption {
		key: ReviewerRegister;
		name: string;
		oneLiner: string;
		sample: string;
	}

	/**
	 * The same feedback rewritten in each voice. Hard-coded so the picker is
	 * deterministic and costs nothing. When adding a new register, add a
	 * sample here that critiques the SAME argument so users can directly
	 * compare voices.
	 */
	const OPTIONS: RegisterOption[] = [
		{
			key: 'coach',
			name: 'Coach',
			oneLiner: 'Casual, warm, like a friend who reads a lot.',
			sample:
				"Hey — this one leans on a straw man in ¶2. The other side isn't really saying what you've got them saying. Try restating their view first, then countering."
		},
		{
			key: 'editor',
			name: 'Editor',
			oneLiner: 'Newsroom tone: precise, direct, collegial.',
			sample:
				'The second paragraph characterizes the opposing position more weakly than its proponents would. Revise to engage the stronger version.'
		},
		{
			key: 'scholar',
			name: 'Scholar',
			oneLiner: 'Formal academic register; terms of art without gloss.',
			sample:
				'The representation of the opposing view in paragraph two constitutes a straw man: the argument attributed is materially weaker than the position advanced by its proponents. Revision is warranted.'
		},
		{
			key: 'adaptive',
			name: 'Adaptive',
			oneLiner: 'Matches the room — coach for quick points, scholar for academic pieces.',
			sample:
				'The voice shifts with the discussion: lighter for casual threads, more formal for academic work.'
		}
	];

	async function handleSelect(next: ReviewerRegister) {
		const previous = value;
		value = next;
		saveError = null;

		// Mirror to localStorage for signed-out previews and the pre-hydration
		// paint on the next page load.
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('rs.reviewerRegister', next);
			}
		} catch {
			/* localStorage may be blocked; silently ignore */
		}

		// Optimistic update of the shared store so other surfaces (e.g. the
		// register-link in AnalysisCoachCard) reflect the change immediately.
		contributorStore.updatePreferences({ reviewer_register: next });

		onChange?.(next);

		if (!contributorId) {
			// No DB row to save to (signed out, or settings page rendered before
			// auth hydration). The localStorage mirror is sufficient.
			return;
		}

		saving = true;
		try {
			const result = await nhost.graphql.request(UPDATE_REGISTER_MUTATION, {
				contributorId,
				register: next
			});
			const errors = (result as any)?.error ?? (result as any)?.errors;
			if (errors) {
				throw new Error(
					Array.isArray(errors)
						? errors[0]?.message ?? 'Save failed'
						: errors?.message ?? 'Save failed'
				);
			}
		} catch (err) {
			// Roll back to the previous selection; the user will see the card
			// they had before and an error message under the legend.
			value = previous;
			contributorStore.updatePreferences({ reviewer_register: previous });
			saveError =
				err instanceof Error
					? err.message
					: "Couldn't save that choice. Check your connection and try again.";
		} finally {
			saving = false;
		}
	}
</script>

<fieldset class="register-picker" id="reviewer-register" disabled={saving} aria-busy={saving}>
	<legend>
		<span class="legend-title">How should the coach talk to you?</span>
		<span class="legend-sub">Your scores stay the same — only the voice changes.</span>
		{#if saveError}
			<span class="legend-error" role="alert">{saveError}</span>
		{/if}
	</legend>

	<div class="cards">
		{#each OPTIONS as opt (opt.key)}
			<label
				class="card"
				class:selected={value === opt.key}
				for={`register-${opt.key}`}
			>
				<input
					type="radio"
					name="reviewer-register"
					id={`register-${opt.key}`}
					value={opt.key}
					checked={value === opt.key}
					onchange={() => handleSelect(opt.key)}
				/>
				<div class="card-body">
					<p class="card-name">{opt.name}</p>
					<p class="card-one-liner">{opt.oneLiner}</p>
					<blockquote class="card-sample">{opt.sample}</blockquote>
				</div>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.register-picker {
		border: none;
		padding: 0;
		margin: 0;
	}

	legend {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 1rem;
	}

	.legend-title {
		font-family: var(--font-family-display, Georgia, serif);
		font-size: 1.25rem;
		color: var(--color-text-primary);
	}

	.legend-sub {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
	}

	.legend-error {
		font-size: 0.85rem;
		color: var(--color-danger, #b91c1c);
		margin-top: 0.25rem;
	}

	.cards {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	}

	.card {
		display: block;
		border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
		border-radius: var(--border-radius-lg, 12px);
		padding: 1rem;
		cursor: pointer;
		background: var(--color-surface);
		transition: all 0.15s ease;
		position: relative;
	}

	.card:hover {
		border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
	}

	.card.selected {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.card input[type='radio'] {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.card:focus-within {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.card-name {
		margin: 0;
		font-weight: 700;
		font-size: 1rem;
		color: var(--color-text-primary);
	}

	.card-one-liner {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.card-sample {
		margin: 0.25rem 0 0;
		padding: 0.65rem 0.75rem;
		font-size: 0.88rem;
		font-style: italic;
		background: color-mix(in srgb, var(--color-surface-alt, #fafafa) 85%, transparent);
		border-left: 2px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
		border-radius: 4px;
		line-height: 1.45;
	}
</style>
