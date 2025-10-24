<script lang="ts">
	let {
		score,
		label,
		size = 'default',
		showPercentage = true,
		interactive = false,
		onclick
	} = $props<{
		score: number | null;
		label: string | null;
		size?: 'sm' | 'default' | 'lg';
		showPercentage?: boolean;
		interactive?: boolean;
		onclick?: () => void;
	}>();

	const sizeClasses = {
		sm: 'size-sm',
		default: 'size-default',
		lg: 'size-lg'
	};

	// Map descriptors to color themes based on sentiment
	function getColorClass(descriptor: string | null): string {
		if (!descriptor) return 'neutral';

		const lower = descriptor.toLowerCase();

		// Positive/Constructive descriptors
		if (
			lower.includes('constructive') ||
			lower.includes('thoughtful') ||
			lower.includes('evidence') ||
			lower.includes('respectful') ||
			lower.includes('exemplary') ||
			lower.includes('nuanced')
		) {
			return 'positive';
		}

		// Negative/Hostile descriptors
		if (
			lower.includes('hostile') ||
			lower.includes('inflammatory') ||
			lower.includes('manipulative') ||
			lower.includes('combative') ||
			lower.includes('aggressive')
		) {
			return 'negative';
		}

		// Warning/Questionable descriptors
		if (
			lower.includes('questionable') ||
			lower.includes('dismissive') ||
			lower.includes('tangent') ||
			lower.includes('deflecting')
		) {
			return 'warning';
		}

		// Off-topic gets special treatment
		if (lower.includes('off-topic') || lower.includes('offtopic')) {
			return 'off-topic';
		}

		// Default to neutral
		return 'neutral';
	}

	const colorClass = $derived(getColorClass(label));
</script>

{#if score != null && label}
	<button
		type="button"
		class="good-faith-badge {colorClass} {sizeClasses[size]}"
		class:interactive
		disabled={!interactive}
		{onclick}
		title={interactive
			? 'View Good Faith Analysis'
			: `Good Faith Score: ${(score * 100).toFixed(0)}%`}
	>
		{#if showPercentage}
			<span class="badge-score">{(score * 100).toFixed(0)}%</span>
		{/if}
		<span class="badge-label">{label}</span>
	</button>
{/if}

<style>
	.good-faith-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.8rem;
		font-weight: 600;
		border: 1px solid;
		background: transparent;
		cursor: default;
		transition: all 0.2s ease;
		font-family: inherit;
		white-space: nowrap;
	}

	.good-faith-badge.interactive {
		cursor: pointer;
	}

	.good-faith-badge.interactive:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	/* Size variants */
	.good-faith-badge.size-sm {
		padding: 0.2rem 0.5rem;
		font-size: 0.75rem;
		gap: 0.3rem;
	}

	.good-faith-badge.size-lg {
		padding: 0.4rem 0.75rem;
		font-size: 0.9rem;
		gap: 0.5rem;
	}

	/* Color variants based on sentiment */
	.good-faith-badge.positive {
		color: var(--color-success, #10b981);
		border-color: color-mix(in srgb, var(--color-success, #10b981) 30%, transparent);
		background: color-mix(in srgb, var(--color-success, #10b981) 8%, transparent);
	}

	.good-faith-badge.neutral {
		color: var(--color-warning, #f59e0b);
		border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent);
		background: color-mix(in srgb, var(--color-warning, #f59e0b) 8%, transparent);
	}

	.good-faith-badge.warning {
		color: #f97316;
		border-color: color-mix(in srgb, #f97316 30%, transparent);
		background: color-mix(in srgb, #f97316 8%, transparent);
	}

	.good-faith-badge.negative {
		color: var(--color-error, #ef4444);
		border-color: color-mix(in srgb, var(--color-error, #ef4444) 30%, transparent);
		background: color-mix(in srgb, var(--color-error, #ef4444) 8%, transparent);
	}

	.good-faith-badge.off-topic {
		color: #9333ea;
		border-color: color-mix(in srgb, #9333ea 30%, transparent);
		background: color-mix(in srgb, #9333ea 8%, transparent);
	}

	.badge-score {
		font-weight: 700;
	}

	.badge-label {
		text-transform: capitalize;
		font-weight: 500;
	}
</style>
