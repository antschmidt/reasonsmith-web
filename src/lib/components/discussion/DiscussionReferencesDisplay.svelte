<script lang="ts">
	import type { Citation } from '$lib/types/writingStyle';

	let {
		citations,
		formatChicagoCitation
	}: {
		citations: Citation[];
		formatChicagoCitation: (citation: Citation) => string;
	} = $props();
</script>

{#if citations.length > 0}
	<div class="discussion-metadata">
		<div class="references-section">
			<h5>References</h5>
			<div class="references-list">
				{#each citations as item, index}
					<div class="reference-item" id="citation-{index + 1}">
						<details class="citation-details">
							<summary>
								<div class="chicago-citation">
									<span class="citation-number">{index + 1}.</span>
									{@html formatChicagoCitation(item)}
								</div>
								<span class="summary-arrow">▶</span>
								<span class="summary-text">Context</span>
							</summary>
							<div class="citation-context">
								<div class="citation-point">
									<strong>Supports:</strong>
									{item.point_supported || (item as any).pointSupported}
								</div>
								<div class="citation-quote">
									<strong>Quote:</strong> "{item.relevant_quote || (item as any).relevantQuote}"
								</div>
							</div>						</details>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.discussion-metadata {
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 1rem;
		margin-top: 1rem;
		margin-bottom: 3.5rem;
	}

	.references-section h5 {
		margin: 0 0 0.75rem 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.references-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.reference-item {
		scroll-margin-top: 100px;
	}

	.chicago-citation {
		font-size: 0.8rem;
		line-height: 1.5;
		flex: 1;
	}

	.citation-number {
		font-weight: 600;
		color: var(--color-primary);
		margin-right: 0.5rem;
	}

	.citation-details {
		margin-top: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		overflow: hidden;
	}

	.citation-details summary {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface-alt);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		border: none;
		outline: none;
		user-select: none;
		transition: background-color 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.citation-details summary:hover {
		background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-alt));
		color: var(--color-text-primary);
	}

	.citation-details summary::-webkit-details-marker {
		display: none;
	}

	.summary-arrow {
		font-size: 0.75rem;
		color: var(--color-primary);
		transition: transform 0.2s;
		font-family: monospace;
	}

	.citation-details[open] .summary-arrow {
		transform: rotate(90deg);
	}

	.summary-text {
		font-weight: 500;
	}

	.citation-details[open] summary {
		background: color-mix(in srgb, var(--color-primary) 15%, var(--color-surface-alt));
		color: var(--color-text-primary);
		border-bottom: 1px solid var(--color-border);
	}

	.citation-context {
		padding: 0.75rem;
		background: var(--color-surface);
	}

	.citation-point,
	.citation-quote {
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.citation-point:last-child,
	.citation-quote:last-child {
		margin-bottom: 0;
	}

	.citation-point strong,
	.citation-quote strong {
		color: var(--color-primary);
		font-weight: 600;
	}

	.citation-quote {
		font-style: italic;
		color: var(--color-text-secondary);
	}
</style>
