<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'icon';
		size?: 'sm' | 'md' | 'lg';
		fullWidth?: boolean;
		loading?: boolean;
		icon?: Snippet;
		iconPosition?: 'left' | 'right';
		children?: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		fullWidth = false,
		loading = false,
		disabled = false,
		type = 'button',
		icon,
		iconPosition = 'left',
		children,
		class: className = '',
		...restProps
	}: Props = $props();

	const isDisabled = $derived(disabled || loading);
</script>

<button
	class="btn btn-{variant} btn-{size} {className}"
	class:btn-full={fullWidth}
	class:btn-loading={loading}
	class:btn-icon-only={variant === 'icon'}
	disabled={isDisabled}
	{type}
	{...restProps}
>
	{#if loading}
		<span class="btn-spinner"></span>
	{:else}
		{#if icon && iconPosition === 'left'}
			<span class="btn-icon-wrapper">{@render icon()}</span>
		{/if}
		{#if children}
			{@render children()}
		{/if}
		{#if icon && iconPosition === 'right'}
			<span class="btn-icon-wrapper">{@render icon()}</span>
		{/if}
	{/if}
</button>

<style>
	/* Base button styles */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
		font-family: var(--font-family-ui);
		font-weight: 500;
		letter-spacing: 0.025em;
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		text-decoration: none;
		white-space: nowrap;
		border: 1px solid transparent;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
	}

	/* Size variants */
	.btn-sm {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
	}

	.btn-md {
		padding: 0.625rem 1.25rem;
		font-size: 14px;
	}

	.btn-lg {
		padding: 1rem 2rem;
		font-size: 1rem;
	}

	/* Style variants */
	.btn-primary {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.btn-primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 80%, black);
		border-color: color-mix(in srgb, var(--color-primary) 80%, black);
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border-color: var(--color-border);
	}

	.btn-secondary:hover:not(:disabled) {
		border-color: var(--color-primary);
		background: var(--color-surface-alt);
	}

	.btn-accent {
		background: transparent;
		color: var(--color-text-primary);
		border-color: var(--color-success);
		box-shadow: 0 0 8px color-mix(in srgb, var(--color-success) 30%, transparent);
	}

	.btn-accent:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-success) 5%, transparent);
		border-color: var(--color-success);
		color: var(--color-success);
		box-shadow: 0 0 12px color-mix(in srgb, var(--color-success) 40%, transparent);
	}

	.btn-danger {
		background: transparent;
		color: var(--color-error);
		border-color: var(--color-border);
	}

	.btn-danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-error) 5%, transparent);
		border-color: var(--color-error);
		color: var(--color-error);
	}

	.btn-ghost {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: transparent;
	}

	.btn-ghost:hover:not(:disabled) {
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
	}

	/* Icon variant */
	.btn-icon {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-color: var(--color-border);
		padding: var(--space-xs);
		width: 42px;
		height: 42px;
	}

	.btn-icon:hover:not(:disabled) {
		color: var(--color-primary);
		border-color: var(--color-primary);
		background: var(--color-surface-alt);
	}

	/* Full width */
	.btn-full {
		width: 100%;
	}

	/* Loading state */
	.btn-loading {
		position: relative;
		color: transparent;
	}

	.btn-spinner {
		position: absolute;
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		opacity: 0.6;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Icon wrapper */
	.btn-icon-wrapper {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.btn-icon-wrapper :global(svg) {
		width: 1em;
		height: 1em;
	}
</style>
