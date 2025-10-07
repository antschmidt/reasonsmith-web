<script lang="ts">
	import { slide } from 'svelte/transition';
	import { getPostTypeConfig } from '$lib/types/writingStyle';

	type PostType = 'response' | 'counter_argument' | 'supporting_evidence' | 'question';

	let {
		selected = $bindable('response' as PostType),
		expanded = $bindable(true),
		disabled = false
	} = $props<{
		selected: PostType;
		expanded?: boolean;
		disabled?: boolean;
	}>();

	const postTypes: PostType[] = ['response', 'counter_argument', 'supporting_evidence', 'question'];

	function selectType(type: PostType) {
		selected = type;
		expanded = false;
	}

	function toggleExpanded() {
		if (!disabled) {
			expanded = !expanded;
		}
	}
</script>

<div class="post-type-selection">
	{#if expanded}
		<div class="post-type-buttons" transition:slide={{ duration: 300 }}>
			{#each postTypes as type}
				{@const config = getPostTypeConfig(type)}
				<button
					type="button"
					class="post-type-btn"
					class:selected={selected === type}
					class:disabled
					{disabled}
					onclick={() => selectType(type)}
				>
					<div class="post-type-header">
						<span class="post-type-icon">{config.icon}</span>
						<span class="post-type-title">{config.label}</span>
					</div>
					<span class="post-type-desc">{config.description}</span>
				</button>
			{/each}
		</div>
	{:else}
		{@const config = getPostTypeConfig(selected)}
		<div class="post-type-selected">
			<button
				type="button"
				class="post-type-btn selected compact"
				class:disabled
				{disabled}
				onclick={toggleExpanded}
			>
				<span class="post-type-icon">{config.icon}</span>
				<span class="post-type-text">
					<span class="post-type-title">{config.label}</span>
				</span>
			</button>
		</div>
	{/if}
</div>

<style>
	.post-type-selection {
		margin-bottom: 1rem;
	}

	.post-type-buttons {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	}

	.post-type-btn {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border);
		border-radius: var(--border-radius);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		font-family: inherit;
		color: var(--color-text-primary);
		flex: 1;
	}

	.post-type-btn:hover:not(:disabled) {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}

	.post-type-btn.selected {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		font-weight: 500;
	}

	.post-type-btn.compact {
		padding: 0.65rem 1rem;
		max-width: fit-content;
		flex-direction: row;
		align-items: center;
		gap: 0.75rem;
	}

	.post-type-btn.disabled,
	.post-type-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.post-type-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.post-type-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
		line-height: 1;
	}

	.post-type-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.post-type-title {
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--color-text-primary);
	}

	.post-type-desc {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.post-type-selected {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	@media (max-width: 768px) {
		.post-type-buttons {
			grid-template-columns: 1fr;
		}
	}
</style>
