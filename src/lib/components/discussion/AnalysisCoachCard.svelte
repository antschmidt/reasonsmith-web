<!--
  AnalysisCoachCard (Plan 2)

  The coaching-first surface for a good-faith analysis result. Leads with a
  single-sentence diagnosis and a suggested revision; the numeric score and
  detailed breakdown move behind a disclosure.

  Props:
    result         — A GoodFaithResult (from /api/goodFaithClaude etc.)
    onUseRevision — Optional callback. When provided, the "Use this revision"
                    button calls it with the suggestedRevision string so the
                    editor can paste it in.

  Accessibility:
    - The disclosure uses <details>/<summary> so keyboard users get the
      native expand/collapse affordance.
    - The score is announced with its context ("This feeds your XP; it
      isn't a grade.") so screen readers don't read it as a grade.
-->
<script lang="ts">
	import type { GoodFaithResult, ReviewerRegister } from '$lib/goodFaith';
	import { getLabel as getSmithLabel } from '$lib/copy/smithing';
	import { contributorStore } from '$lib/stores/contributorStore';

	let {
		result,
		onUseRevision,
		prefersPlainLanguage
	} = $props<{
		result: GoodFaithResult;
		onUseRevision?: (revision: string) => void;
		/**
		 * When omitted, the component pulls `prefers_plain_language` from the
		 * shared contributor store. Pass an explicit value from the call site
		 * only when you need to override (e.g. rendering for a different user
		 * in admin review).
		 */
		prefersPlainLanguage?: boolean;
	}>();

	// Reactive slice of the contributor store for the plain-language flag.
	let storePlainLanguage = $state<boolean>(false);
	const unsub = contributorStore.subscribe((data) => {
		storePlainLanguage = Boolean(data?.prefers_plain_language);
	});
	// Clean up subscription when the component is destroyed.
	import { onDestroy } from 'svelte';
	onDestroy(unsub);

	const effectivePlainLanguage = $derived(
		typeof prefersPlainLanguage === 'boolean' ? prefersPlainLanguage : storePlainLanguage
	);

	const registerLabel: Record<ReviewerRegister, string> = {
		coach: 'Coach voice',
		editor: 'Editor voice',
		scholar: 'Scholar voice',
		adaptive: 'Adaptive voice'
	};

	const headline = $derived(result.coachingHeadline?.trim() || result.summary?.split('.')[0] || '');
	const revision = $derived(result.suggestedRevision?.trim());
	const scorePercent = $derived(Math.round((result.good_faith_score ?? 0) * 100));
	const register = $derived(result.register);

	const heatLabel = $derived(getSmithLabel('ai_feedback', effectivePlainLanguage));
</script>

<section class="coach-card" aria-label="Coach feedback">
	<header class="coach-header">
		<span class="coach-kicker">{heatLabel}</span>
		{#if register}
			<a
				class="register-link"
				href="/settings#reviewer-register"
				aria-label="Change reviewer voice"
			>
				{registerLabel[register as ReviewerRegister]}
			</a>
		{/if}
	</header>

	{#if headline}
		<p class="coach-headline">{headline}</p>
	{/if}

	{#if revision}
		<div class="revision-block">
			<p class="revision-label">Try this:</p>
			<blockquote class="revision-text">{revision}</blockquote>
			{#if onUseRevision}
				<button
					type="button"
					class="use-revision-button"
					onclick={() => onUseRevision?.(revision)}
				>
					Use this revision
				</button>
			{/if}
		</div>
	{/if}

	<details class="breakdown">
		<summary>See the breakdown</summary>
		<div class="breakdown-body">
			<p class="score-row">
				<span class="score-label">Good-faith score:</span>
				<span class="score-value">{scorePercent}/100</span>
				<span class="score-note">This feeds your XP; it isn't a grade.</span>
			</p>

			{#if result.summary}
				<p class="overall">{result.summary}</p>
			{/if}

			{#if result.steelmanScore != null || result.intellectualHumilityScore != null || result.relevanceScore != null}
				<dl class="subscores">
					{#if result.steelmanScore != null}
						<div class="subscore">
							<dt>Steelmanning</dt>
							<dd>{result.steelmanScore}/10</dd>
						</div>
					{/if}
					{#if result.intellectualHumilityScore != null}
						<div class="subscore">
							<dt>Humility</dt>
							<dd>{result.intellectualHumilityScore}/10</dd>
						</div>
					{/if}
					{#if result.relevanceScore != null}
						<div class="subscore">
							<dt>Relevance</dt>
							<dd>{result.relevanceScore}/10</dd>
						</div>
					{/if}
				</dl>
			{/if}

			{#if result.cultishPhrases && result.cultishPhrases.length > 0}
				<p class="cultish">
					<strong>Loaded language flagged:</strong>
					{result.cultishPhrases.join(', ')}
				</p>
			{/if}

			{#if result.claims && result.claims.length > 0}
				<ol class="claims">
					{#each result.claims as claim}
						<li>
							<p class="claim-text">{claim.claim}</p>
							{#if claim.supportingArguments?.length}
								<ul class="args">
									{#each claim.supportingArguments as arg}
										<li>
											<p>{arg.argument} <span class="arg-score">({arg.score}/10)</span></p>
											{#if arg.fallacies?.length}
												<p class="fallacies">Fallacies: {arg.fallacies.join(', ')}</p>
											{/if}
											{#if arg.improvements}
												<p class="improvements">How to strengthen: {arg.improvements}</p>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</details>
</section>

<style>
	.coach-card {
		background: color-mix(in srgb, var(--color-surface) 92%, var(--color-primary) 8%);
		border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
		border-radius: var(--border-radius-lg, 12px);
		padding: clamp(1.25rem, 3vw, 1.75rem);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.coach-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
	}

	.coach-kicker {
		font-family: var(--font-family-ui, sans-serif);
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
	}

	.register-link {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		text-decoration: none;
		border-bottom: 1px dotted var(--color-border);
	}

	.register-link:hover,
	.register-link:focus {
		color: var(--color-primary);
		border-color: var(--color-primary);
		outline: none;
	}

	.coach-headline {
		font-family: var(--font-family-display, Georgia, serif);
		font-size: clamp(1.15rem, 2.6vw, 1.4rem);
		line-height: 1.35;
		margin: 0;
		color: var(--color-text-primary);
	}

	.revision-block {
		background: color-mix(in srgb, var(--color-surface-alt, #fafafa) 80%, transparent);
		border-left: 3px solid var(--color-primary);
		padding: 0.9rem 1rem;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.revision-label {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-secondary);
	}

	.revision-text {
		margin: 0;
		font-style: italic;
		font-family: var(--font-family-serif, Georgia, serif);
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	.use-revision-button {
		align-self: flex-start;
		background: transparent;
		border: 1px solid var(--color-primary);
		color: var(--color-primary);
		padding: 0.45rem 1rem;
		border-radius: var(--border-radius-full, 999px);
		font-size: 0.85rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.use-revision-button:hover,
	.use-revision-button:focus {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		outline: none;
	}

	.breakdown {
		border-top: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		padding-top: 0.75rem;
	}

	.breakdown summary {
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		list-style: none;
	}

	.breakdown summary::-webkit-details-marker {
		display: none;
	}

	.breakdown summary::before {
		content: '▸ ';
		margin-right: 0.25rem;
	}

	.breakdown[open] summary::before {
		content: '▾ ';
	}

	.breakdown-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.75rem;
		font-size: 0.95rem;
	}

	.score-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.75rem;
		margin: 0;
	}

	.score-label {
		font-weight: 600;
	}

	.score-value {
		font-variant-numeric: tabular-nums;
	}

	.score-note {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.overall {
		margin: 0;
		line-height: 1.55;
		color: var(--color-text-primary);
	}

	.subscores {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin: 0;
	}

	.subscore {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 5rem;
	}

	.subscore dt {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-secondary);
	}

	.subscore dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.cultish,
	.claims {
		margin: 0;
		font-size: 0.9rem;
	}

	.claims {
		padding-left: 1.25rem;
	}

	.claim-text {
		font-weight: 600;
		margin: 0 0 0.35rem;
	}

	.args {
		margin: 0 0 0.75rem;
		padding-left: 1rem;
	}

	.arg-score {
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.fallacies {
		color: var(--color-warning, #b45309);
		margin: 0.15rem 0;
	}

	.improvements {
		color: var(--color-text-secondary);
		margin: 0.15rem 0;
		font-style: italic;
	}
</style>
