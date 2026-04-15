<!--
  SteelmanPrompt (Plan 4)

  Pre-composer input that asks a contributor to restate the opposing position
  in its strongest form BEFORE they write their own argument. Required when
  `discussion_version.steelman_required === true` and the contributor hasn't
  already supplied one on a prior draft of the same post.

  Props:
    value               — bound steelman sentence (two-way)
    required            — true when the parent discussion demands a steelman
    placeholder         — override the example copy
    ariaDescribedBy     — id of helper text already rendered elsewhere
    maxLength           — soft cap; shown as a character counter

  Accessibility:
    - Always uses plain-language aria-label regardless of smithing settings.
    - Error state is announced via aria-invalid + aria-errormessage.
    - The helper text is rendered in prose so screen readers don't require
      expanding a disclosure.

  Integration notes:
    - Call `validate()` before publishing to surface the error state.
    - When `markPromptShown()` is called, consumers should record the
      timestamp in the post's `steelman_prompt_shown_at` column so we can
      distinguish "user dismissed" from "never saw the prompt" during audits.
-->
<script lang="ts">
	let {
		value = $bindable(''),
		required = false,
		placeholder = 'In one sentence, state the strongest version of the view you disagree with.',
		ariaDescribedBy,
		maxLength = 280,
		onPromptShown
	} = $props<{
		value?: string;
		required?: boolean;
		placeholder?: string;
		ariaDescribedBy?: string;
		maxLength?: number;
		onPromptShown?: () => void;
	}>();

	let errorMessage = $state<string | null>(null);
	let touched = $state(false);

	const remaining = $derived(maxLength - (value?.length ?? 0));

	// Announce the prompt to parents once per mount so the steelman_prompt_shown_at
	// timestamp can be persisted. This is a single-shot lifecycle signal.
	import { onMount } from 'svelte';
	onMount(() => {
		onPromptShown?.();
	});

	export function validate(): boolean {
		touched = true;
		if (required && (!value || value.trim().length < 15)) {
			errorMessage =
				'Please take a moment to state the opposing view in its strongest form — at least one full sentence.';
			return false;
		}
		if (value && value.length > maxLength) {
			errorMessage = `Keep the steelman under ${maxLength} characters — you've got ${Math.abs(remaining)} to trim.`;
			return false;
		}
		errorMessage = null;
		return true;
	}

	function handleBlur() {
		touched = true;
		validate();
	}

	function handleInput() {
		if (touched) validate();
	}

	const errorId = 'steelman-error';
</script>

<section
	class="steelman-prompt"
	aria-label={required ? 'Required steelman' : 'Optional steelman'}
>
	<header class="steelman-header">
		<h3>
			First, steelman the other side
			{#if required}<span class="required-marker" aria-label="required">*</span>{/if}
		</h3>
		<p class="steelman-helper">
			Before you make your case, summarize the strongest version of the view you're about to
			disagree with. This isn't a trick — it's the single best predictor of an argument that
			actually persuades.
		</p>
	</header>

	<textarea
		class="steelman-input"
		class:has-error={Boolean(errorMessage)}
		bind:value
		{placeholder}
		maxlength={maxLength}
		aria-required={required}
		aria-invalid={Boolean(errorMessage)}
		aria-errormessage={errorMessage ? errorId : undefined}
		aria-describedby={ariaDescribedBy}
		rows="3"
		onblur={handleBlur}
		oninput={handleInput}
	></textarea>

	<footer class="steelman-footer">
		<span class="char-counter" class:warning={remaining < 0}>
			{remaining >= 0 ? `${remaining} left` : `${Math.abs(remaining)} over`}
		</span>
		{#if errorMessage}
			<span id={errorId} class="steelman-error" role="alert">{errorMessage}</span>
		{/if}
	</footer>
</section>

<style>
	.steelman-prompt {
		background: color-mix(in srgb, var(--color-surface) 92%, var(--color-primary) 8%);
		border-left: 3px solid var(--color-primary);
		border-radius: var(--border-radius-lg, 12px);
		padding: clamp(1rem, 2.5vw, 1.4rem);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.steelman-header h3 {
		margin: 0;
		font-family: var(--font-family-display, Georgia, serif);
		font-size: 1.1rem;
		color: var(--color-text-primary);
	}

	.required-marker {
		color: var(--color-primary);
		margin-left: 0.15rem;
	}

	.steelman-helper {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.steelman-input {
		width: 100%;
		padding: 0.75rem 0.9rem;
		border-radius: var(--border-radius-sm, 6px);
		border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
		background: var(--color-surface);
		color: var(--color-text-primary);
		font-family: var(--font-family-serif, Georgia, serif);
		font-size: 1rem;
		line-height: 1.55;
		resize: vertical;
		min-height: 4.5rem;
	}

	.steelman-input:focus {
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
	}

	.steelman-input.has-error {
		border-color: var(--color-danger, #b91c1c);
	}

	.steelman-footer {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.75rem;
	}

	.char-counter {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.char-counter.warning {
		color: var(--color-danger, #b91c1c);
	}

	.steelman-error {
		font-size: 0.85rem;
		color: var(--color-danger, #b91c1c);
	}
</style>
