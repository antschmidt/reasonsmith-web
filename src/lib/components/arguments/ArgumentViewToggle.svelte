<script lang="ts">
	import { List, Network } from '@lucide/svelte';

	export type ArgumentView = 'builder' | 'map';

	interface Props {
		value: ArgumentView;
		onChange: (view: ArgumentView) => void;
		/** When true, hide the Map option entirely (used on mobile). */
		hideMap?: boolean;
	}

	let { value, onChange, hideMap = false }: Props = $props();
</script>

<div class="view-toggle" role="tablist" aria-label="Argument view">
	<button
		role="tab"
		aria-selected={value === 'builder'}
		class="toggle-btn"
		class:active={value === 'builder'}
		onclick={() => onChange('builder')}
	>
		<List size={14} />
		<span>Builder</span>
	</button>
	{#if !hideMap}
		<button
			role="tab"
			aria-selected={value === 'map'}
			class="toggle-btn"
			class:active={value === 'map'}
			onclick={() => onChange('map')}
		>
			<Network size={14} />
			<span>Map</span>
		</button>
	{/if}
</div>

<style>
	.view-toggle {
		display: inline-flex;
		padding: 2px;
		background: var(--color-surface-elevated, #141414);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		gap: 2px;
	}

	.toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--color-text-tertiary, #888);
		font-size: 0.78rem;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.toggle-btn:hover {
		color: var(--color-text-secondary, #aaa);
		background: var(--color-surface-hover, #1e1e1e);
	}

	.toggle-btn.active {
		color: var(--color-primary, #6366f1);
		background: color-mix(in srgb, var(--color-primary, #6366f1) 15%, transparent);
	}
</style>
