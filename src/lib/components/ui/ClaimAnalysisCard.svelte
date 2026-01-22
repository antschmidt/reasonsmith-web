<script lang="ts">
	import Button from './Button.svelte';
	import type { ClaimAnalysisResult } from '$lib/multipass/types';

	let {
		analysis,
		onRetry
	}: {
		analysis: ClaimAnalysisResult;
		onRetry?: () => void;
	} = $props();

	let expanded = $state(false);

	// Determine badge color based on complexity
	const complexityColors = {
		simple: { bg: 'var(--color-success)', label: 'Simple' },
		moderate: { bg: 'var(--color-warning)', label: 'Moderate' },
		complex: { bg: 'var(--color-primary)', label: 'Complex' }
	};

	const complexity = $derived(complexityColors[analysis.claim.complexity] || complexityColors.moderate);

	// Calculate average score
	const avgScore = $derived(
		analysis.status === 'completed' && analysis.validityScore && analysis.evidenceScore
			? ((analysis.validityScore + analysis.evidenceScore) / 2).toFixed(1)
			: null
	);

	// Determine card status styling
	const statusClass = $derived(
		analysis.status === 'failed' ? 'failed' :
		analysis.status === 'pending' ? 'pending' :
		avgScore && parseFloat(avgScore) >= 7 ? 'good' :
		avgScore && parseFloat(avgScore) >= 5 ? 'neutral' :
		'poor'
	);
</script>

<div class="claim-card {statusClass}">
	<div class="claim-header" role="button" tabindex="0" onclick={() => (expanded = !expanded)} onkeypress={(e) => e.key === 'Enter' && (expanded = !expanded)}>
		<div class="claim-info">
			<span class="claim-number">#{analysis.claimIndex + 1}</span>
			<span class="claim-type">{analysis.claim.type}</span>
			<span class="complexity-badge" style="background: color-mix(in srgb, {complexity.bg} 15%, transparent); color: {complexity.bg}">
				{complexity.label}
			</span>
			{#if analysis.status === 'failed'}
				<span class="status-badge failed">Failed</span>
			{:else if analysis.status === 'pending'}
				<span class="status-badge pending">Pending</span>
			{:else if avgScore}
				<span class="score-badge">{avgScore}/10</span>
			{/if}
		</div>
		<span class="expand-icon">{expanded ? '▼' : '▶'}</span>
	</div>

	<div class="claim-text">
		"{analysis.claim.text}"
	</div>

	{#if expanded}
		<div class="claim-details">
			{#if analysis.status === 'failed'}
				<div class="error-section">
					<strong>Error:</strong> {analysis.error || 'Analysis failed'}
					{#if onRetry}
						<Button type="button" variant="primary" size="sm" onclick={onRetry}>
							Retry
						</Button>
					{/if}
				</div>
			{:else if analysis.status === 'completed'}
				<div class="scores-row">
					<div class="score-item">
						<span class="score-label">Validity</span>
						<span class="score-value">{analysis.validityScore}/10</span>
					</div>
					<div class="score-item">
						<span class="score-label">Evidence</span>
						<span class="score-value">{analysis.evidenceScore}/10</span>
					</div>
				</div>

				{#if analysis.fallacies && analysis.fallacies.length > 0}
					<div class="detail-section fallacies">
						<strong>Fallacies:</strong>
						<ul>
							{#each analysis.fallacies as fallacy}
								<li>
									{fallacy}
									{#if analysis.fallacyExplanations?.[fallacy]}
										<span class="explanation"> — {analysis.fallacyExplanations[fallacy]}</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if analysis.assumptions && analysis.assumptions.length > 0}
					<div class="detail-section">
						<strong>Assumptions:</strong>
						<ul>
							{#each analysis.assumptions as assumption}
								<li>{assumption}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if analysis.counterArguments && analysis.counterArguments.length > 0}
					<div class="detail-section">
						<strong>Counter-Arguments:</strong>
						<ul>
							{#each analysis.counterArguments as counter}
								<li>{counter}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if analysis.improvements}
					<div class="detail-section improvements">
						<strong>How to Strengthen:</strong>
						<p>{analysis.improvements}</p>
					</div>
				{/if}

				<div class="meta-row">
					<span class="model-used">Model: {analysis.modelUsed.split('-').slice(0, 2).join(' ')}</span>
					<span class="tokens-used">{analysis.inputTokens + analysis.outputTokens} tokens</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.claim-card {
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius);
		background: var(--color-surface);
		overflow: hidden;
	}

	.claim-card.failed {
		border-color: color-mix(in srgb, var(--color-error) 40%, transparent);
	}

	.claim-card.good {
		border-left: 3px solid var(--color-success);
	}

	.claim-card.neutral {
		border-left: 3px solid var(--color-warning);
	}

	.claim-card.poor {
		border-left: 3px solid var(--color-error);
	}

	.claim-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-surface) 80%, var(--color-background));
		cursor: pointer;
		user-select: none;
	}

	.claim-header:hover {
		background: var(--color-surface-hover);
	}

	.claim-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.claim-number {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.claim-type {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-transform: capitalize;
	}

	.complexity-badge {
		padding: 0.15rem 0.4rem;
		font-size: 0.7rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.status-badge {
		padding: 0.15rem 0.4rem;
		font-size: 0.7rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
	}

	.status-badge.failed {
		background: color-mix(in srgb, var(--color-error) 15%, transparent);
		color: var(--color-error);
	}

	.status-badge.pending {
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		color: var(--color-warning);
	}

	.score-badge {
		padding: 0.15rem 0.4rem;
		font-size: 0.75rem;
		font-weight: 600;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		border-radius: var(--border-radius-sm);
	}

	.expand-icon {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		transition: transform 0.15s ease;
	}

	.claim-text {
		padding: 0.75rem 1rem;
		color: var(--color-text-primary);
		font-style: italic;
		line-height: 1.5;
		background: color-mix(in srgb, var(--color-primary) 3%, transparent);
	}

	.claim-details {
		padding: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.scores-row {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 1rem;
	}

	.score-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.score-label {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.score-value {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.detail-section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.detail-section strong {
		display: block;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
		font-size: 0.9rem;
	}

	.detail-section ul {
		margin: 0;
		padding-left: 1.25rem;
	}

	.detail-section li {
		margin-bottom: 0.5rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.fallacies li {
		color: var(--color-error);
	}

	.explanation {
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.improvements {
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		padding: 1rem;
		border-radius: var(--border-radius-sm);
		border-left: 3px solid var(--color-primary);
	}

	.improvements p {
		margin: 0.5rem 0 0 0;
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	.error-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: color-mix(in srgb, var(--color-error) 5%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-error);
	}

	.meta-row {
		display: flex;
		justify-content: space-between;
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border);
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
	}
</style>
