<script lang="ts">
	import { onMount } from 'svelte';

	interface CitationData {
		citation: {
			id: string;
			title: string;
			url: string;
			author?: string;
			type: string;
		};
		relationship: {
			pointSupported: string;
			relevantQuote: string;
			pageNumber?: string;
		};
	}

	interface RelatedDiscussion {
		discussion: {
			id: string;
			title: string;
			authorId: string;
		};
		sharedCitations: number;
	}

	const props = $props<{
		discussionId: string;
		showRelated?: boolean;
	}>();

	let loading = $state(true);
	let error = $state<string | null>(null);
	let citations = $state<CitationData[]>([]);
	let relatedDiscussions = $state<RelatedDiscussion[]>([]);

	async function loadCitationNetwork() {
		try {
			loading = true;
			error = null;

			const response = await fetch(`/api/syncCitations?discussionId=${props.discussionId}`);

			if (!response.ok) {
				throw new Error(`Failed to load citation network: ${response.status}`);
			}

			const data = await response.json();
			citations = data.citations || [];
			relatedDiscussions = data.relatedDiscussions || [];
		} catch (err: any) {
			console.error('Citation network error:', err);
			error = err.message || 'Failed to load citation network';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadCitationNetwork();
	});

	function getCitationTypeIcon(type: string): string {
		switch (type) {
			case 'academic':
				return '🎓';
			case 'news':
				return '📰';
			case 'internal':
				return '💬';
			case 'web':
				return '🌐';
			default:
				return '📄';
		}
	}

	function getCitationTypeLabel(type: string): string {
		switch (type) {
			case 'academic':
				return 'Academic Source';
			case 'news':
				return 'News Article';
			case 'internal':
				return 'Discussion';
			case 'web':
				return 'Web Source';
			default:
				return 'Document';
		}
	}
</script>

{#if loading}
	<div class="citation-network loading">
		<div class="loading-spinner"></div>
		<p>Loading citation network...</p>
	</div>
{:else if error}
	<div class="citation-network error">
		<p>⚠️ {error}</p>
	</div>
{:else if citations.length > 0 || relatedDiscussions.length > 0}
	<div class="citation-network">
		{#if citations.length > 0}
			<section class="citations-section">
				<h3>📚 Citation Network</h3>
				<div class="citations-grid">
					{#each citations as { citation, relationship }}
						<div class="citation-card">
							<div class="citation-header">
								<span class="citation-type" title={getCitationTypeLabel(citation.type)}>
									{getCitationTypeIcon(citation.type)}
								</span>
								<h4 class="citation-title">
									<a href={citation.url} target="_blank" rel="noopener noreferrer">
										{citation.title}
									</a>
								</h4>
							</div>

							{#if citation.author}
								<p class="citation-author">by {citation.author}</p>
							{/if}

							<div class="citation-usage">
								<p class="point-supported">
									<strong>Supports:</strong>
									{relationship.pointSupported}
								</p>
								{#if relationship.relevantQuote}
									<blockquote class="relevant-quote">
										"{relationship.relevantQuote}"
										{#if relationship.pageNumber}
											<cite>(p. {relationship.pageNumber})</cite>
										{/if}
									</blockquote>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if props.showRelated && relatedDiscussions.length > 0}
			<section class="related-section">
				<h3>🔗 Related Discussions</h3>
				<p class="related-description">Discussions that cite similar sources to this one:</p>
				<div class="related-grid">
					{#each relatedDiscussions as { discussion, sharedCitations }}
						<div class="related-card">
							<h4 class="related-title">
								<a href="/discussions/{discussion.id}">
									{discussion.title}
								</a>
							</h4>
							<p class="shared-count">
								{sharedCitations} shared citation{sharedCitations !== 1 ? 's' : ''}
							</p>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}

<style>
	.citation-network {
		margin: 1.5rem 0;
	}

	.citation-network.loading,
	.citation-network.error {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--color-border);
		border-top: 2px solid var(--color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.citations-section,
	.related-section {
		margin-bottom: 2rem;
	}

	.citations-section h3,
	.related-section h3 {
		margin: 0 0 1rem 0;
		font-size: 1.2rem;
		color: var(--color-text-primary);
		border-bottom: 2px solid var(--color-border);
		padding-bottom: 0.5rem;
	}

	.citations-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
	}

	.citation-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		padding: 1rem;
		transition: box-shadow 0.2s ease;
	}

	.citation-card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.citation-header {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.citation-type {
		font-size: 1.2rem;
		flex-shrink: 0;
		margin-top: 0.1rem;
	}

	.citation-title {
		margin: 0;
		font-size: 1rem;
		line-height: 1.4;
	}

	.citation-title a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.citation-title a:hover {
		text-decoration: underline;
	}

	.citation-author {
		margin: 0.25rem 0 0.75rem 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.citation-usage {
		border-top: 1px solid var(--color-border);
		padding-top: 0.75rem;
	}

	.point-supported {
		margin: 0 0 0.5rem 0;
		font-size: 0.9rem;
	}

	.relevant-quote {
		margin: 0;
		padding: 0.5rem;
		background: var(--color-surface-alt);
		border-left: 3px solid var(--color-accent);
		font-size: 0.85rem;
		font-style: italic;
		line-height: 1.4;
	}

	.relevant-quote cite {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-style: normal;
	}

	.related-description {
		margin: 0 0 1rem 0;
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	.related-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
	}

	.related-card {
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		padding: 0.75rem;
		transition: background-color 0.2s ease;
	}

	.related-card:hover {
		background: var(--color-surface);
	}

	.related-title {
		margin: 0 0 0.5rem 0;
		font-size: 0.95rem;
		line-height: 1.3;
	}

	.related-title a {
		color: var(--color-text-primary);
		text-decoration: none;
	}

	.related-title a:hover {
		color: var(--color-primary);
		text-decoration: underline;
	}

	.shared-count {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-accent);
		font-weight: 600;
	}

	@media (max-width: 768px) {
		.citations-grid {
			grid-template-columns: 1fr;
		}

		.related-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
