<script lang="ts">
	import { Users } from '@lucide/svelte';

	interface Props {
		count: number;
		onClick?: () => void;
		size?: 'small' | 'medium' | 'large';
	}

	let { count, onClick, size = 'medium' }: Props = $props();

	function handleClick(event: MouseEvent) {
		if (onClick) {
			event.preventDefault();
			event.stopPropagation();
			onClick();
		}
	}
</script>

{#if count > 0}
	<button
		class="collaborator-badge {size}"
		class:clickable={onClick}
		onclick={handleClick}
		title="{count} {count === 1 ? 'collaborator' : 'collaborators'}"
		aria-label="{count} {count === 1 ? 'collaborator' : 'collaborators'}"
	>
		<Users size={size === 'small' ? '12' : size === 'medium' ? '14' : '16'} />
		<span class="count">{count}</span>
	</button>
{/if}

<style>
	.collaborator-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: var(--primary-color);
		color: white;
		border: none;
		border-radius: var(--border-radius-md);
		font-size: 0.75rem;
		font-weight: 500;
		transition: all 0.2s ease;
		cursor: default;
	}

	.collaborator-badge.small {
		padding: 0.125rem 0.375rem;
		font-size: 0.625rem;
		gap: 0.125rem;
	}

	.collaborator-badge.large {
		padding: 0.375rem 0.625rem;
		font-size: 0.875rem;
		gap: 0.375rem;
	}

	.collaborator-badge.clickable {
		cursor: pointer;
	}

	.collaborator-badge.clickable:hover {
		background: var(--primary-hover);
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.collaborator-badge.clickable:active {
		transform: translateY(0);
	}

	.count {
		line-height: 1;
	}
</style>
