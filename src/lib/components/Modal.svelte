<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		show: boolean;
		onClose: () => void;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		header?: Snippet;
		footer?: Snippet;
		children: Snippet;
		closeOnOverlayClick?: boolean;
	}

	let {
		show = $bindable(),
		onClose,
		title,
		size = 'md',
		header,
		footer,
		children,
		closeOnOverlayClick = true
	}: Props = $props();

	function handleOverlayClick() {
		if (closeOnOverlayClick) {
			onClose();
		}
	}
</script>

{#if show}
	<div class="modal-overlay" onclick={handleOverlayClick} transition:fade={{ duration: 200 }}>
		<div
			class="modal-content modal-{size}"
			onclick={(e) => e.stopPropagation()}
			transition:scale={{ duration: 200, start: 0.9 }}
		>
			<div class="modal-header">
				{#if header}
					{@render header()}
				{:else if title}
					<h3 class="modal-title">{title}</h3>
				{/if}
				<button
					type="button"
					class="modal-close-btn"
					onclick={onClose}
					aria-label="Close modal"
				>
					×
				</button>
			</div>

			<div class="modal-body">
				{@render children()}
			</div>

			{#if footer}
				<div class="modal-footer">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(2px);
	}

	.modal-content {
		background: var(--color-bg-primary);
		border-radius: 12px;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	/* Size variants */
	.modal-sm {
		max-width: 400px;
	}

	.modal-md {
		max-width: 500px;
	}

	.modal-lg {
		max-width: 700px;
	}

	.modal-xl {
		max-width: 900px;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 1.5rem 1rem;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.modal-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.modal-close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		line-height: 1;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.modal-close-btn:hover {
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
	}

	.modal-body {
		padding: 1.5rem;
		flex: 1;
		overflow-y: auto;
	}

	.modal-footer {
		padding: 1rem 1.5rem 1.5rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.modal-content {
			width: 95%;
			margin: 1rem;
		}

		.modal-header,
		.modal-body,
		.modal-footer {
			padding-left: 1rem;
			padding-right: 1rem;
		}

		.modal-footer {
			flex-direction: column;
		}

		.modal-footer :global(.btn) {
			width: 100%;
		}
	}
</style>
