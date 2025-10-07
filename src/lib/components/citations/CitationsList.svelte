<script lang="ts">
	import Button from '../ui/Button.svelte';
	import { formatChicagoCitation, type Citation } from '$lib/types/writingStyle';

	let {
		citations = [],
		onInsert,
		onEdit,
		onRemove
	} = $props<{
		citations?: Citation[];
		onInsert?: (citationId: string) => void;
		onEdit?: (citationId: string) => void;
		onRemove?: (citationId: string) => void;
	}>();
</script>

<div class="form-group">
	<div class="citations-header">
		<label>Citations</label>
		<slot name="add-button" />
	</div>

	{#if citations && citations.length > 0}
		<div class="citations-list">
			{#each citations as citation, index}
				<div class="citation-item">
					<div class="citation-content">
						<div class="citation-number">[{index + 1}]</div>
						<div class="citation-details">
							<div class="citation-title">{citation.title}</div>
							<div class="citation-formatted">
								{@html formatChicagoCitation(citation)}
							</div>
							<div class="citation-meta">
								<span class="point-supported">Point: {citation.point_supported}</span>
								{#if citation.relevant_quote}
									<span class="relevant-quote">Quote: "{citation.relevant_quote}"</span>
								{/if}
							</div>
						</div>
					</div>
					<div class="citation-actions">
						{#if onInsert}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => onInsert(citation.id)}
								title="Insert citation reference"
							>
								Insert
							</Button>
						{/if}
						{#if onEdit}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => onEdit(citation.id)}
								title="Edit citation"
							>
								Edit
							</Button>
						{/if}
						{#if onRemove}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => onRemove(citation.id)}
								title="Remove citation"
							>
								Remove
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="no-citations">
			<p>No citations added yet. Citations help support your arguments and improve credibility.</p>
		</div>
	{/if}
</div>

<style>
	.form-group {
		margin-bottom: 2.5rem;
	}

	.citations-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.citations-header label {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 15px;
		letter-spacing: 0.025em;
	}

	.citations-list {
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius);
		background: var(--color-surface);
	}

	.citation-item {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.citation-item:last-child {
		border-bottom: none;
	}

	.citation-content {
		display: flex;
		gap: 1rem;
		flex: 1;
	}

	.citation-number {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 2rem;
	}

	.citation-details {
		flex: 1;
	}

	.citation-title {
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
	}

	.citation-formatted {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
		line-height: 1.4;
	}

	.citation-meta {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.point-supported {
		font-style: italic;
	}

	.relevant-quote {
		font-style: italic;
		color: var(--color-text-primary);
	}

	.citation-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.no-citations {
		padding: 2rem;
		text-align: center;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: var(--border-radius);
	}
</style>
