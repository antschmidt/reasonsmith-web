<script lang="ts">
	import type { ArgumentNodeType } from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';

	interface Props {
		typesPresent: Set<ArgumentNodeType>;
		nodeTypeCounts: Record<ArgumentNodeType, number>;
		activeFilter: ArgumentNodeType | 'all';
		onFilterChange: (type: ArgumentNodeType | 'all') => void;
	}

	let { typesPresent, nodeTypeCounts, activeFilter, onFilterChange }: Props = $props();

	const allTypes: ArgumentNodeType[] = [
		'claim',
		'evidence',
		'source',
		'warrant',
		'qualifier',
		'counter',
		'rebuttal'
	];

	const visibleTypes = $derived(allTypes.filter((t) => typesPresent.has(t)));

	const totalCount = $derived(
		Object.values(nodeTypeCounts).reduce((sum, count) => sum + count, 0)
	);
</script>

<div class="type-filter-tabs" role="tablist" aria-label="Filter nodes by type">
	<button
		class="filter-tab"
		class:active={activeFilter === 'all'}
		role="tab"
		aria-selected={activeFilter === 'all'}
		onclick={() => onFilterChange('all')}
	>
		<span class="tab-label">All</span>
		<span class="tab-count">{totalCount}</span>
	</button>

	{#each visibleTypes as nodeType (nodeType)}
		{@const config = NODE_TYPE_CONFIGS[nodeType]}
		{@const count = nodeTypeCounts[nodeType]}
		<button
			class="filter-tab"
			class:active={activeFilter === nodeType}
			role="tab"
			aria-selected={activeFilter === nodeType}
			style="--tab-color: {config.color}; --tab-bg: {config.bgColor}"
			onclick={() => onFilterChange(nodeType)}
		>
			<span class="tab-dot" aria-hidden="true"></span>
			<span class="tab-label">{config.label}</span>
			<span class="tab-count">{count}</span>
		</button>
	{/each}
</div>

<style>
	.type-filter-tabs {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.type-filter-tabs::-webkit-scrollbar {
		display: none;
	}

	.filter-tab {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--border-radius-full);
		color: var(--color-text-tertiary);
		font-size: 0.7rem;
		font-weight: 500;
		font-family: var(--font-family-ui);
		letter-spacing: 0.02em;
		cursor: pointer;
		transition: all var(--transition-fast) ease;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.filter-tab:hover {
		color: var(--color-text-secondary);
		background: var(--color-surface-alt);
		border-color: var(--color-border);
	}

	.filter-tab.active {
		color: var(--tab-color, var(--color-text-primary));
		background: color-mix(in srgb, var(--tab-color, var(--color-primary)) 8%, transparent);
		border-color: color-mix(in srgb, var(--tab-color, var(--color-primary)) 25%, transparent);
	}

	.tab-dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--tab-color, var(--color-text-tertiary));
		opacity: 0.5;
		transition: opacity var(--transition-fast) ease;
		flex-shrink: 0;
	}

	.filter-tab.active .tab-dot {
		opacity: 1;
	}

	.filter-tab:hover .tab-dot {
		opacity: 0.8;
	}

	.tab-label {
		line-height: 1;
	}

	.tab-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: var(--border-radius-full);
		background: color-mix(in srgb, var(--tab-color, var(--color-text-tertiary)) 10%, transparent);
		font-size: 0.6rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--tab-color, var(--color-text-tertiary));
		opacity: 0.7;
		transition: opacity var(--transition-fast) ease;
	}

	.filter-tab.active .tab-count {
		opacity: 1;
		background: color-mix(in srgb, var(--tab-color, var(--color-primary)) 15%, transparent);
		color: var(--tab-color, var(--color-primary));
	}

	/* Responsive */
	@media (max-width: 640px) {
		.filter-tab {
			padding: 3px 6px;
			font-size: 0.65rem;
			gap: 3px;
		}

		.tab-dot {
			width: 6px;
			height: 6px;
		}

		.tab-count {
			min-width: 14px;
			height: 14px;
			font-size: 0.55rem;
		}

		.tab-label {
			max-width: 48px;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
</style>
