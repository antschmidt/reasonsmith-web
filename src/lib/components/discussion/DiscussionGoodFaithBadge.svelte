<script lang="ts">
	let {
		score,
		label,
		onClick
	}: {
		score: number | null;
		label: string | null;
		onClick: () => void;
	} = $props();
</script>

{#if score != null && typeof score === 'number' && label}
	<button
		type="button"
		class="good-faith-info-icon"
		onclick={onClick}
		title="View Good Faith Analysis"
		aria-label="View Good Faith Analysis"
	>
		<span class="icon-symbol">ℹ</span>
		<span class="good-faith-pill {label}">
			{((score ?? 0) * 100).toFixed(0)}%
		</span>
	</button>
{/if}

<style>
	.good-faith-pill {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: var(--border-radius-full);
		font-weight: 600;
		font-size: 0.875rem;
		letter-spacing: 0.025em;
		background: var(--color-surface-alt);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.good-faith-pill.hostile {
		background: color-mix(in srgb, #ef4444 12%, var(--color-surface-alt));
		color: #dc2626;
		border-color: color-mix(in srgb, #ef4444 30%, transparent);
	}

	.good-faith-pill.questionable {
		background: color-mix(in srgb, #f59e0b 12%, var(--color-surface-alt));
		color: #d97706;
		border-color: color-mix(in srgb, #f59e0b 30%, transparent);
	}

	.good-faith-pill.neutral {
		background: color-mix(in srgb, #6b7280 12%, var(--color-surface-alt));
		color: #4b5563;
		border-color: color-mix(in srgb, #6b7280 30%, transparent);
	}

	.good-faith-pill.constructive {
		background: color-mix(in srgb, #10b981 12%, var(--color-surface-alt));
		color: #059669;
		border-color: color-mix(in srgb, #10b981 30%, transparent);
	}

	.good-faith-pill.exemplary {
		background: color-mix(in srgb, #10b981 18%, var(--color-surface-alt));
		color: #047857;
		border-color: color-mix(in srgb, #10b981 40%, transparent);
	}

	.good-faith-info-icon {
		position: absolute;
		bottom: 1rem;
		right: 1rem;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.625rem 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-full);
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		box-shadow:
			0 1px 3px rgba(15, 23, 42, 0.08),
			0 0 0 1px color-mix(in srgb, var(--color-border) 50%, transparent);
		font-family: var(--font-family-sans);
	}

	.good-faith-info-icon:hover {
		transform: translateY(-1px);
		box-shadow:
			0 4px 12px rgba(15, 23, 42, 0.12),
			0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
		color: var(--color-text-primary);
	}

	.good-faith-info-icon:hover .icon-symbol {
		background: var(--color-primary);
		color: white;
	}

	.good-faith-info-icon .icon-symbol {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.375rem;
		height: 1.375rem;
		background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-alt));
		color: var(--color-primary);
		border-radius: 50%;
		font-weight: 700;
		font-size: 0.875rem;
		font-family: var(--font-family-display);
		font-style: italic;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		line-height: 1;
	}
</style>
