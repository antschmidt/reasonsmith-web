<script lang="ts">
	import type { CompletenessScore } from '$lib/types/argument';

	interface Props {
		completeness: CompletenessScore;
	}

	let { completeness }: Props = $props();

	const checks = $derived([
		{ key: 'hasEvidence', label: 'Evidence', done: completeness.hasEvidence, color: '#4BC4E8' },
		{ key: 'hasSource', label: 'Source', done: completeness.hasSource, color: '#8B8B8B' },
		{ key: 'hasCounter', label: 'Counter', done: completeness.hasCounter, color: '#E84B4B' },
		{ key: 'hasRebuttal', label: 'Rebuttal', done: completeness.hasRebuttal, color: '#4BE87A' },
		{ key: 'hasWarrant', label: 'Warrant', done: completeness.hasWarrant, color: '#B44BE8' }
	]);

	const completedCount = $derived(checks.filter((c) => c.done).length);

	function getScoreLabel(score: number): string {
		if (score === 0) return 'Getting started';
		if (score <= 20) return 'Bare claim';
		if (score <= 40) return 'Partially supported';
		if (score <= 60) return 'Developing';
		if (score <= 80) return 'Well-structured';
		return 'Complete argument';
	}
</script>

<div class="completeness-bar">
	<div class="bar-header">
		<span class="bar-label">
			Completeness
			<span class="score-badge">{completeness.score}%</span>
		</span>
		<span class="score-description">{getScoreLabel(completeness.score)}</span>
	</div>

	<div class="progress-track">
		<div
			class="progress-fill"
			style="width: {completeness.score}%"
			class:low={completeness.score <= 20}
			class:mid={completeness.score > 20 && completeness.score <= 60}
			class:high={completeness.score > 60 && completeness.score < 100}
			class:complete={completeness.score === 100}
		></div>
		<!-- Segment markers at 20% intervals -->
		{#each [20, 40, 60, 80] as marker}
			<div class="segment-marker" style="left: {marker}%"></div>
		{/each}
	</div>

	<div class="checks-row">
		{#each checks as check (check.key)}
			<label class="check-item" class:done={check.done}>
				<span class="check-indicator" style="--check-color: {check.color}">
					{#if check.done}
						<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M3.5 8.5L6.5 11.5L12.5 4.5"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{/if}
				</span>
				<span class="check-label">{check.label}</span>
			</label>
		{/each}
	</div>
</div>

<style>
	.completeness-bar {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.bar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.bar-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		font-family: var(--font-family-ui);
	}

	.score-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 1px 6px;
		border-radius: var(--border-radius-full);
		background: var(--color-surface-alt);
		font-size: 0.7rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-primary);
	}

	.score-description {
		font-size: 0.7rem;
		color: var(--color-text-tertiary);
		font-style: italic;
	}

	/* Progress Track */
	.progress-track {
		position: relative;
		height: 6px;
		border-radius: 3px;
		background: var(--color-surface-alt);
		overflow: visible;
	}

	.progress-fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		border-radius: 3px;
		transition: width 0.4s ease;
		min-width: 0;
	}

	.progress-fill.low {
		background: var(--color-error);
	}

	.progress-fill.mid {
		background: var(--color-warning);
	}

	.progress-fill.high {
		background: color-mix(in srgb, var(--color-success) 80%, var(--color-warning));
	}

	.progress-fill.complete {
		background: var(--color-success);
		box-shadow: 0 0 8px color-mix(in srgb, var(--color-success) 40%, transparent);
	}

	.segment-marker {
		position: absolute;
		top: -1px;
		bottom: -1px;
		width: 1px;
		background: var(--color-border);
		opacity: 0.5;
	}

	/* Check Items */
	.checks-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}

	.check-item {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		cursor: default;
		user-select: none;
	}

	.check-indicator {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 3px;
		border: 1.5px solid var(--color-border);
		color: transparent;
		transition: all var(--transition-fast) ease;
		flex-shrink: 0;
	}

	.check-item.done .check-indicator {
		border-color: var(--check-color);
		background: color-mix(in srgb, var(--check-color) 15%, transparent);
		color: var(--check-color);
	}

	.check-indicator svg {
		width: 12px;
		height: 12px;
	}

	.check-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--color-text-tertiary);
		font-family: var(--font-family-ui);
		letter-spacing: 0.02em;
		transition: color var(--transition-fast) ease;
	}

	.check-item.done .check-label {
		color: var(--color-text-secondary);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.checks-row {
			gap: 6px;
		}

		.check-label {
			font-size: 0.65rem;
		}

		.score-description {
			display: none;
		}
	}
</style>
