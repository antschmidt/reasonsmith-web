<svelte:options runes={true} />

<script lang="ts">
	/**
	 * SocialMediaImportDisplay - Component for displaying imported social media posts
	 *
	 * Shows the imported content that provides context for the discussion
	 * but is not subject to good-faith evaluation.
	 */

	const props = $props<{
		source: string;
		url?: string;
		content: string;
		author: string;
		date?: string;
	}>();

	// Format the date if present
	const formattedDate = $derived(() => {
		if (!props.date) return null;
		try {
			const d = new Date(props.date);
			return d.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch {
			return props.date;
		}
	});
</script>

<div class="import-display">
	<div class="import-header">
		<div class="import-badge">
			<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path
					d="M8 2L10 6L14 6.5L11 9.5L11.5 14L8 12L4.5 14L5 9.5L2 6.5L6 6L8 2Z"
					stroke="currentColor"
					stroke-width="1.5"
					fill="none"
					stroke-linejoin="round"
				/>
			</svg>
			<span>Imported Context</span>
		</div>
		<p class="import-notice">
			This content was imported from social media to provide context for the discussion below.
			It is not subject to our good-faith requirements.
		</p>
	</div>

	<div class="import-body">
		<div class="import-meta">
			<div class="meta-row">
				<span class="meta-label">Platform:</span>
				<span class="meta-value">{props.source}</span>
			</div>
			<div class="meta-row">
				<span class="meta-label">Author:</span>
				<span class="meta-value">{props.author}</span>
			</div>
			{#if formattedDate()}
				<div class="meta-row">
					<span class="meta-label">Date:</span>
					<span class="meta-value">{formattedDate()}</span>
				</div>
			{/if}
			{#if props.url}
				<div class="meta-row">
					<span class="meta-label">Source:</span>
					<a href={props.url} target="_blank" rel="noopener noreferrer" class="meta-link">
						View Original
						<svg class="external-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
							<path
								d="M10 6.5V10C10 10.5523 9.55228 11 9 11H2C1.44772 11 1 10.5523 1 10V3C1 2.44772 1.44772 2 2 2H5.5M7.5 1H11M11 1V4.5M11 1L5 7"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</a>
				</div>
			{/if}
		</div>

		<div class="import-content">
			<p>{props.content}</p>
		</div>
	</div>
</div>

<style>
	.import-display {
		margin: 2rem 0;
		background: color-mix(in srgb, var(--color-warning) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 20%, transparent);
		border-left: 4px solid var(--color-warning);
		border-radius: var(--border-radius-lg);
		overflow: hidden;
	}

	.import-header {
		padding: 1.25rem 1.5rem;
		background: color-mix(in srgb, var(--color-warning) 8%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--color-warning) 15%, transparent);
	}

	.import-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		border-radius: var(--border-radius-md);
		color: var(--color-warning);
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	.icon {
		flex-shrink: 0;
	}

	.import-notice {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.5;
	}

	.import-body {
		padding: 1.5rem;
	}

	.import-meta {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		margin-bottom: 1.25rem;
		padding-bottom: 1.25rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.meta-label {
		font-weight: 600;
		color: var(--color-text-secondary);
		min-width: 5rem;
	}

	.meta-value {
		color: var(--color-text-primary);
	}

	.meta-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--color-accent);
		text-decoration: none;
		transition: all 0.2s ease;
	}

	.meta-link:hover {
		color: var(--color-accent-hover);
		text-decoration: underline;
	}

	.external-icon {
		flex-shrink: 0;
		opacity: 0.7;
	}

	.import-content {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 1.25rem;
	}

	.import-content p {
		margin: 0;
		color: var(--color-text-primary);
		line-height: 1.6;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.import-header,
		.import-body {
			padding: 1rem;
		}

		.meta-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}

		.meta-label {
			min-width: auto;
		}
	}

	/* Light mode adjustments */
	:global([data-theme='light']) .import-display {
		background: color-mix(in srgb, var(--color-warning) 3%, transparent);
	}

	:global([data-theme='light']) .import-header {
		background: color-mix(in srgb, var(--color-warning) 5%, transparent);
	}

	:global([data-theme='light']) .import-badge {
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
	}
</style>
