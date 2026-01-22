<script lang="ts">
	import AnimatedLogo from './AnimatedLogo.svelte';
	import Button from './Button.svelte';
	import GoodFaithAnalysisDisplay from './GoodFaithAnalysisDisplay.svelte';
	import ClaimAnalysisCard from './ClaimAnalysisCard.svelte';
	import TokenBreakdown from './TokenBreakdown.svelte';

	import type { GoodFaithResult } from '$lib/goodFaith/types';
	import type { ClaimAnalysisResult, MultiPassTokenUsage, PassSummary } from '$lib/multipass/types';

	interface MultiPassData {
		strategy: string;
		claimsTotal: number;
		claimsAnalyzed: number;
		claimsFailed: number;
		claimAnalyses: ClaimAnalysisResult[];
		passes?: PassSummary[];
		recommendSplit?: string;
	}

	let {
		result = null,
		multipass = null,
		usage = null,
		estimatedCost = 0,
		isLoading = false,
		isOutdated = false,
		onRetry
	}: {
		result: GoodFaithResult | null;
		multipass: MultiPassData | null;
		usage: MultiPassTokenUsage | null;
		estimatedCost?: number;
		isLoading?: boolean;
		isOutdated?: boolean;
		onRetry?: (claimIndices: number[]) => void;
	} = $props();

	let showDeepDive = $state(false);
	let showTokenBreakdown = $state(false);

	// Get failed claim indices for retry
	const failedClaimIndices = $derived(
		multipass?.claimAnalyses
			.filter((c) => c.status === 'failed')
			.map((c) => c.claimIndex) || []
	);

	function handleRetryFailed() {
		if (onRetry && failedClaimIndices.length > 0) {
			onRetry(failedClaimIndices);
		}
	}

	function formatCost(cents: number): string {
		if (cents < 1) return '<1¢';
		if (cents < 10) return `${cents.toFixed(1)}¢`;
		return `${Math.round(cents)}¢`;
	}
</script>

{#if isLoading}
	<div class="multipass-analysis">
		<div class="analysis-progress">
			<AnimatedLogo size="18px" isAnimating={true} />
			<span>Running multi-pass analysis...</span>
		</div>
	</div>
{:else if result && multipass}
	<div class="multipass-analysis">
		<!-- Main synthesis result -->
		<GoodFaithAnalysisDisplay
			analysis={result}
			{isOutdated}
			collapsed={false}
		/>

		<!-- Multi-pass metadata bar -->
		<div class="multipass-meta">
			<div class="meta-left">
				<span class="strategy-badge">{multipass.strategy === 'multi_featured' ? 'Featured Analysis' : 'Academic Analysis'}</span>
				<span class="claims-count">
					{multipass.claimsAnalyzed}/{multipass.claimsTotal} claims analyzed
				</span>
				{#if multipass.claimsFailed > 0}
					<span class="failed-badge">{multipass.claimsFailed} failed</span>
				{/if}
			</div>
			<div class="meta-right">
				<button
					class="cost-toggle"
					type="button"
					onclick={() => (showTokenBreakdown = !showTokenBreakdown)}
				>
					Cost: ~{formatCost(estimatedCost)}
				</button>
			</div>
		</div>

		<!-- Token breakdown (collapsible) -->
		{#if showTokenBreakdown && usage}
			<TokenBreakdown {usage} />
		{/if}

		<!-- Recommendation to split -->
		{#if multipass.recommendSplit}
			<div class="split-recommendation">
				<strong>Suggestion:</strong> This argument has many claims. Consider splitting into multiple posts for better analysis.
				<p>{multipass.recommendSplit}</p>
			</div>
		{/if}

		<!-- Deep dive toggle -->
		<div class="deep-dive-section">
			<Button
				type="button"
				variant="secondary"
				size="sm"
				onclick={() => (showDeepDive = !showDeepDive)}
			>
				{showDeepDive ? 'Hide' : 'Show'} Claim-by-Claim Analysis
			</Button>

			{#if multipass.claimsFailed > 0 && onRetry}
				<Button
					type="button"
					variant="primary"
					size="sm"
					onclick={handleRetryFailed}
				>
					Retry {multipass.claimsFailed} Failed Claim{multipass.claimsFailed > 1 ? 's' : ''}
				</Button>
			{/if}
		</div>

		<!-- Individual claim analyses -->
		{#if showDeepDive}
			<div class="claims-list">
				{#each multipass.claimAnalyses as analysis, i (analysis.claimIndex)}
					<ClaimAnalysisCard
						{analysis}
						onRetry={onRetry ? () => onRetry([analysis.claimIndex]) : undefined}
					/>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.multipass-analysis {
		margin: 1.5rem 0;
	}

	.analysis-progress {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-primary) 3%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-radius: var(--border-radius);
		color: var(--color-text-secondary);
		font-size: 0.95rem;
	}

	.multipass-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		margin-top: 0.5rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
	}

	.meta-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.meta-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.strategy-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		font-size: 0.8rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.claims-count {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
	}

	.failed-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--color-error) 15%, transparent);
		color: var(--color-error);
		font-size: 0.8rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
	}

	.cost-toggle {
		padding: 0.25rem 0.5rem;
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cost-toggle:hover {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.split-recommendation {
		margin-top: 1rem;
		padding: 1rem;
		background: color-mix(in srgb, #f59e0b 10%, transparent);
		border: 1px solid color-mix(in srgb, #f59e0b 25%, transparent);
		border-radius: var(--border-radius-sm);
		color: #d97706;
		font-size: 0.9rem;
	}

	.split-recommendation p {
		margin-top: 0.5rem;
		color: var(--color-text-secondary);
	}

	.deep-dive-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.claims-list {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
