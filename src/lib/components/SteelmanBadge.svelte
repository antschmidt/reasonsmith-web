<script lang="ts">
	import { Shield } from '@lucide/svelte';

	// Props
	let {
		score,
		qualityNotes = null,
		size = 'medium',
		showLabel = true,
		showTooltip = true
	} = $props<{
		score: number | null | undefined;
		qualityNotes?: string | null | undefined;
		size?: 'small' | 'medium' | 'large';
		showLabel?: boolean;
		showTooltip?: boolean;
	}>();

	// Compute quality tier based on score
	const qualityTier = $derived(getQualityTier(score));
	const tierColor = $derived(getTierColor(qualityTier));
	const tierLabel = $derived(getTierLabel(qualityTier));

	function getQualityTier(score: number | null | undefined): string {
		if (score === null || score === undefined) return 'none';
		if (score >= 9) return 'exceptional';
		if (score >= 7) return 'strong';
		if (score >= 5) return 'good';
		if (score >= 3) return 'fair';
		return 'weak';
	}

	function getTierColor(tier: string): string {
		const colors: Record<string, string> = {
			exceptional: '#059669', // green
			strong: '#0891b2', // cyan
			good: '#0284c7', // blue
			fair: '#6366f1', // indigo
			weak: '#64748b', // slate
			none: '#9ca3af' // gray
		};
		return colors[tier] || colors.none;
	}

	function getTierLabel(tier: string): string {
		const labels: Record<string, string> = {
			exceptional: 'Exceptional Steelman',
			strong: 'Strong Steelman',
			good: 'Good Steelman',
			fair: 'Fair Steelman',
			weak: 'Weak Steelman',
			none: 'Not Scored'
		};
		return labels[tier] || labels.none;
	}

	function getIconSize(): number {
		const sizes = { small: 14, medium: 18, large: 24 };
		return sizes[size];
	}

	function getBadgeSize(): string {
		const sizes = {
			small: 'padding: 0.25rem 0.5rem; font-size: 0.75rem;',
			medium: 'padding: 0.375rem 0.75rem; font-size: 0.875rem;',
			large: 'padding: 0.5rem 1rem; font-size: 1rem;'
		};
		return sizes[size];
	}
</script>

{#if score !== null && score !== undefined}
	<div
		class="steelman-badge"
		class:has-tooltip={showTooltip && qualityNotes}
		style="background-color: {tierColor}15; border-color: {tierColor}50; {getBadgeSize()}"
		title={showTooltip && qualityNotes ? qualityNotes : tierLabel}
	>
		<div class="badge-icon" style="color: {tierColor}">
			<Shield size={getIconSize()} strokeWidth={2} />
		</div>
		<div class="badge-content" style="color: {tierColor}">
			<span class="score-value">{score.toFixed(1)}</span>
			{#if showLabel}
				<span class="score-label">/10</span>
			{/if}
		</div>
		{#if showTooltip && qualityNotes}
			<div class="tooltip">
				<div class="tooltip-header">
					<strong>{tierLabel}</strong>
					<span class="tooltip-score">{score.toFixed(1)}/10</span>
				</div>
				<p class="tooltip-notes">{qualityNotes}</p>
			</div>
		{/if}
	</div>
{/if}

<style>
	.steelman-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		border-radius: var(--border-radius-md);
		border: 1px solid;
		font-weight: 600;
		font-family: var(--font-family-sans);
		transition: all 0.2s ease;
		position: relative;
		white-space: nowrap;
	}

	.steelman-badge.has-tooltip {
		cursor: help;
	}

	.steelman-badge.has-tooltip:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.badge-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.badge-content {
		display: flex;
		align-items: baseline;
		gap: 0.125rem;
		line-height: 1;
	}

	.score-value {
		font-weight: 700;
	}

	.score-label {
		font-weight: 500;
		opacity: 0.7;
		font-size: 0.85em;
	}

	/* Tooltip */
	.tooltip {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: var(--space-sm);
		min-width: 200px;
		max-width: 300px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s ease;
		z-index: 1000;
	}

	.steelman-badge.has-tooltip:hover .tooltip {
		opacity: 1;
		pointer-events: auto;
	}

	.tooltip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 6px solid transparent;
		border-top-color: var(--color-surface);
	}

	.tooltip-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-xs);
		padding-bottom: var(--space-xs);
		border-bottom: 1px solid var(--color-border-light);
	}

	.tooltip-header strong {
		color: var(--color-text-primary);
		font-size: 0.875rem;
	}

	.tooltip-score {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.tooltip-notes {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--color-text-secondary);
	}
</style>
