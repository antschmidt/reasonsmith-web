<script lang="ts">
	import AnimatedLogo from './AnimatedLogo.svelte';
	import Button from './Button.svelte';

	type GoodFaithAnalysis = {
		good_faith_score: number;
		good_faith_label: string;
		rationale?: string | null;
		claims?: Array<{
			claim: string;
			supportingArguments?: Array<{
				argument?: string;
				score: number;
				fallacies?: string[];
				improvements?: string;
			}>;
		}>;
		provider?: string;
	};

	let {
		analysis = null,
		isLoading = false,
		isOutdated = false,
		collapsed = false,
		onToggle
	} = $props<{
		analysis: GoodFaithAnalysis | null;
		isLoading?: boolean;
		isOutdated?: boolean;
		collapsed?: boolean;
		onToggle?: () => void;
	}>();
</script>

{#if isLoading}
	<div class="good-faith-analysis">
		<div class="analysis-progress">
			<AnimatedLogo size="18px" isAnimating={true} />
			<span>Analyzing content for good faith...</span>
		</div>
	</div>
{:else if analysis}
	<div class="good-faith-analysis">
		<div class="analysis-header">
			<div class="analysis-summary">
				<div class="analysis-badge {analysis.good_faith_label}">
					<span class="analysis-score">{(analysis.good_faith_score * 100).toFixed(0)}%</span>
					<span class="analysis-label">{analysis.good_faith_label}</span>
				</div>
				{#if isOutdated}
					<span class="outdated-badge">Outdated - Content edited since analysis</span>
				{/if}
			</div>
			{#if onToggle}
				<Button type="button" variant="ghost" size="sm" onclick={onToggle}>
					{collapsed ? 'Expand Analysis' : 'Collapse'}
				</Button>
			{/if}
		</div>
		{#if !collapsed && analysis.rationale}
			<div class="analysis-section">
				<strong>Analysis Summary:</strong>
				{analysis.rationale}
			</div>
		{/if}
		{#if !collapsed && analysis.claims && analysis.claims.length > 0}
			<div class="analysis-section">
				<strong>Claims Analysis:</strong>
				{#each analysis.claims as claimObj}
					<div class="claim-item">
						<div class="claim-text"><strong>Claim:</strong> {claimObj.claim}</div>
						{#if claimObj.supportingArguments}
							{#each claimObj.supportingArguments as arg}
								<div class="argument-item">
									{#if arg.argument}
										<div class="argument-text"><strong>Analysis:</strong> {arg.argument}</div>
									{/if}
									<span class="argument-score">Score: {arg.score}/10</span>
									{#if arg.fallacies && arg.fallacies.length > 0}
										<span class="fallacies">Fallacies: {arg.fallacies.join(', ')}</span>
									{/if}
									{#if arg.improvements}
										<div class="improvements">
											<strong>Improvements:</strong>
											{arg.improvements}
										</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.good-faith-analysis {
		margin: 1.5rem 0;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-primary) 3%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-radius: var(--border-radius);
	}

	.analysis-progress {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--color-text-secondary);
		font-size: 0.95rem;
	}

	.analysis-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.analysis-summary {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.analysis-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		font-weight: 500;
		font-size: 0.9rem;
	}

	.analysis-badge.constructive,
	.analysis-badge.exemplary {
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
		border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent);
	}

	.analysis-badge.neutral {
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		color: var(--color-warning);
		border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
	}

	.analysis-badge.questionable,
	.analysis-badge.hostile {
		background: color-mix(in srgb, var(--color-error) 15%, transparent);
		color: var(--color-error);
		border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
	}

	.analysis-score {
		font-weight: 600;
		font-size: 1rem;
	}

	.analysis-section {
		margin-bottom: 1rem;
		color: var(--color-text-primary);
		line-height: 1.6;
	}

	.claim-item {
		margin: 1rem 0;
		padding: 1rem;
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		border-radius: var(--border-radius-sm);
		border-left: 3px solid var(--color-primary);
	}

	.claim-text {
		margin-bottom: 0.75rem;
		font-weight: 500;
	}

	.argument-item {
		margin: 0.75rem 0;
		padding: 0.75rem;
		background: var(--color-surface);
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
	}

	.argument-text {
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	.argument-score {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		font-size: 0.85rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
		margin-right: 0.5rem;
	}

	.fallacies {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		color: var(--color-error);
		font-size: 0.85rem;
		border-radius: var(--border-radius-sm);
	}

	.improvements {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		border-radius: var(--border-radius-sm);
		border-left: 3px solid var(--color-primary);
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	.outdated-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background: color-mix(in srgb, #f59e0b 15%, transparent);
		color: #d97706;
		font-size: 0.85rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
		border: 1px solid color-mix(in srgb, #f59e0b 25%, transparent);
	}
</style>
