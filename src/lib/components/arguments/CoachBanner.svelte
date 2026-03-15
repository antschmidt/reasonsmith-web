<script lang="ts">
	import type { CoachPrompt, ArgumentNodeType } from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import { fly, fade } from 'svelte/transition';
	import { Plus, X, AlertTriangle, Lightbulb } from '@lucide/svelte';

	interface Props {
		prompt: CoachPrompt;
		onAction: (type: ArgumentNodeType) => void;
		onDismiss: () => void;
	}

	let { prompt, onAction, onDismiss }: Props = $props();

	const config = $derived(NODE_TYPE_CONFIGS[prompt.type]);
</script>

<div
	class="coach-banner"
	class:urgent={prompt.urgent}
	style="--node-color: {config.color}; --node-bg: {config.bgColor}"
	transition:fly={{ y: -10, duration: 250 }}
>
	<div class="coach-icon">
		{#if prompt.urgent}
			<AlertTriangle size={18} />
		{:else}
			<Lightbulb size={18} />
		{/if}
	</div>

	<div class="coach-content">
		<p class="coach-message">{prompt.message}</p>
	</div>

	<div class="coach-actions">
		<button
			class="coach-action-btn"
			onclick={() => onAction(prompt.type)}
		>
			<Plus size={14} />
			<span>{prompt.actionLabel}</span>
		</button>

		<button
			class="coach-dismiss-btn"
			onclick={onDismiss}
			title="Dismiss"
			aria-label="Dismiss coaching suggestion"
		>
			<X size={14} />
		</button>
	</div>
</div>

<style>
	.coach-banner {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: 8px var(--space-sm);
		margin-top: var(--space-xs);
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, var(--node-color) 6%, transparent);
		border: 1px solid color-mix(in srgb, var(--node-color) 20%, transparent);
		transition: all var(--transition-base) ease;
	}

	.coach-banner.urgent {
		background: color-mix(in srgb, var(--color-error) 8%, transparent);
		border-color: color-mix(in srgb, var(--color-error) 25%, transparent);
	}

	.coach-banner.urgent .coach-icon {
		color: var(--color-error);
	}

	.coach-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--node-color);
		opacity: 0.9;
	}

	.coach-content {
		flex: 1;
		min-width: 0;
	}

	.coach-message {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.4;
		color: var(--color-text-secondary);
		font-family: var(--font-family-ui);
	}

	.coach-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.coach-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background: color-mix(in srgb, var(--node-color) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--node-color) 30%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--node-color);
		font-size: 0.75rem;
		font-weight: 600;
		font-family: var(--font-family-ui);
		letter-spacing: 0.02em;
		cursor: pointer;
		transition: all var(--transition-fast) ease;
		white-space: nowrap;
	}

	.coach-banner.urgent .coach-action-btn {
		background: color-mix(in srgb, var(--color-error) 12%, transparent);
		border-color: color-mix(in srgb, var(--color-error) 30%, transparent);
		color: var(--color-error);
	}

	.coach-action-btn:hover {
		background: color-mix(in srgb, var(--node-color) 20%, transparent);
		border-color: color-mix(in srgb, var(--node-color) 50%, transparent);
	}

	.coach-banner.urgent .coach-action-btn:hover {
		background: color-mix(in srgb, var(--color-error) 20%, transparent);
		border-color: color-mix(in srgb, var(--color-error) 50%, transparent);
	}

	.coach-action-btn:active {
		transform: scale(0.97);
	}

	.coach-dismiss-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: none;
		border: none;
		border-radius: var(--border-radius-sm);
		color: var(--color-text-tertiary);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
		opacity: 0.6;
	}

	.coach-dismiss-btn:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--color-text-tertiary) 10%, transparent);
		color: var(--color-text-secondary);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.coach-banner {
			flex-wrap: wrap;
			gap: 6px;
			padding: 6px 8px;
		}

		.coach-content {
			flex-basis: calc(100% - 60px);
		}

		.coach-actions {
			margin-left: auto;
		}

		.coach-action-btn span {
			display: none;
		}

		.coach-action-btn {
			padding: 4px 6px;
		}
	}
</style>
