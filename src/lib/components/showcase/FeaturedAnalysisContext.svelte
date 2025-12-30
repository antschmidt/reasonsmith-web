<svelte:options runes={true} />

<script lang="ts">
	/**
	 * FeaturedAnalysisContext - Displays a Featured Analysis as context for a discussion
	 *
	 * Shows a collapsible card with the analysis details, similar to how
	 * SocialMediaImportDisplay shows imported social media context.
	 */

	interface ShowcaseItem {
		id: string;
		title: string;
		subtitle?: string | null;
		creator?: string | null;
		media_type?: string | null;
		source_url?: string | null;
		date_published?: string | null;
		created_at?: string;
		summary?: string | null;
		analysis?: string | null;
		tags?: string[] | null;
	}

	interface StructuredAnalysis {
		good_faith?: Array<{ name: string; description?: string; examples?: string[]; why?: string }>;
		logical_fallacies?: Array<{
			name: string;
			description?: string;
			examples?: string[];
			why?: string;
		}>;
		cultish_language?: Array<{
			name: string;
			description?: string;
			examples?: string[];
			why?: string;
		}>;
		fact_checking?: Array<{
			claim: string;
			verdict?: string;
			source?: { name?: string; url?: string };
		}>;
		summary?: string;
	}

	const props = $props<{
		item: ShowcaseItem;
		initialExpanded?: boolean;
	}>();

	let expanded = $state(props.initialExpanded ?? false);

	// Parse structured analysis from JSON string
	const structuredAnalysis = $derived.by<StructuredAnalysis | null>(() => {
		if (!props.item.analysis) return null;
		try {
			return JSON.parse(props.item.analysis);
		} catch {
			return null;
		}
	});

	const hasStructured = $derived(!!structuredAnalysis);

	const sections = $derived.by(() => {
		const analysis = structuredAnalysis;
		if (!analysis) return [];
		return [
			{
				key: 'good_faith',
				title: 'Good Faith Indicators',
				icon: '🤝',
				tone: 'positive',
				items: analysis.good_faith ?? []
			},
			{
				key: 'logical_fallacies',
				title: 'Logical Fallacies',
				icon: '⚠️',
				tone: 'warning',
				items: analysis.logical_fallacies ?? []
			},
			{
				key: 'cultish_language',
				title: 'Cultish / Manipulative Language',
				icon: '🧠',
				tone: 'alert',
				items: analysis.cultish_language ?? []
			}
		];
	});

	const factChecks = $derived(structuredAnalysis?.fact_checking ?? []);
	const analysisSummary = $derived(structuredAnalysis?.summary ?? null);

	const summaryStats = $derived.by(() => {
		const analysis = structuredAnalysis;
		if (!analysis) return [];
		return sections
			.map((section) => ({
				key: section.key,
				label: section.title,
				icon: section.icon,
				tone: section.tone,
				count: Array.isArray(section.items) ? section.items.length : 0
			}))
			.concat([
				{
					key: 'fact_checking',
					label: 'Fact Checks',
					icon: '🔍',
					tone: 'fact',
					count: Array.isArray(factChecks) ? factChecks.length : 0
				}
			]);
	});

	function formatDate(dateStr?: string | null): string {
		if (!dateStr) return '';
		try {
			const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return dateStr;
		}
	}

	function formatMultiline(value?: string | null): string {
		if (!value) return '';
		const escaped = value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
		return escaped.replace(/(?:\r\n|\r|\n)/g, '<br />');
	}

	function getExamples(entry: any): string[] {
		if (!entry || typeof entry !== 'object') return [];
		const collected: string[] = [];
		if (Array.isArray(entry.examples)) {
			for (const example of entry.examples) {
				if (typeof example === 'string') {
					const trimmed = example.trim();
					if (trimmed.length > 0) {
						collected.push(trimmed);
					}
				}
			}
		}
		if (typeof entry.example === 'string') {
			const trimmed = entry.example.trim();
			if (trimmed.length > 0 && !collected.includes(trimmed)) {
				collected.push(trimmed);
			}
		}
		return collected;
	}
</script>

<div class="featured-context" class:expanded>
	<button class="context-header" onclick={() => (expanded = !expanded)}>
		<div class="header-content">
			<div class="context-badge">
				<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
					<path
						d="M8 2L10 6L14 6.5L11 9.5L11.5 14L8 12L4.5 14L5 9.5L2 6.5L6 6L8 2Z"
						stroke="currentColor"
						stroke-width="1.5"
						fill="none"
						stroke-linejoin="round"
					/>
				</svg>
				<span>Featured Analysis Context</span>
			</div>
			<h3 class="context-title">{props.item.title}</h3>
			<div class="context-meta">
				{#if props.item.media_type}<span>{props.item.media_type}</span>{/if}
				{#if props.item.creator}<span>{props.item.creator}</span>{/if}
				{#if props.item.date_published || props.item.created_at}
					<span>{formatDate(props.item.date_published || props.item.created_at)}</span>
				{/if}
			</div>
		</div>
		<span class="expand-icon">{expanded ? '−' : '+'}</span>
	</button>

	{#if expanded}
		<div class="context-body">
			{#if props.item.subtitle}
				<p class="subtitle">{@html formatMultiline(props.item.subtitle)}</p>
			{/if}

			{#if analysisSummary}
				<div class="summary-section">
					<strong>Overall Summary:</strong>
					<p>{@html formatMultiline(analysisSummary)}</p>
				</div>
			{/if}

			{#if props.item.summary}
				<div class="highlights-section">
					<strong>Highlights:</strong>
					<p>{@html formatMultiline(props.item.summary)}</p>
				</div>
			{/if}

			{#if hasStructured}
				<div class="stats-grid">
					{#each summaryStats as stat}
						<div class={`stat-card tone-${stat.tone}`}>
							<span class="stat-icon">{stat.icon}</span>
							<span class="stat-count">{stat.count}</span>
							<span class="stat-label">{stat.label}</span>
						</div>
					{/each}
				</div>

				{#each sections as section}
					{#if section.items.length > 0}
						<div class="analysis-section">
							<h4>{section.icon} {section.title}</h4>
							<div class="findings-list">
								{#each section.items as entry}
									{@const examples = getExamples(entry)}
									<div class={`finding-item tone-${section.tone}`}>
										<strong>{entry.name}</strong>
										{#if entry.description}
											<p class="finding-description">{entry.description}</p>
										{/if}
										{#if examples.length > 0}
											<div class="finding-examples">
												<em>Examples:</em>
												<ul>
													{#each examples as example}
														<li>{example}</li>
													{/each}
												</ul>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/each}

				{#if factChecks.length > 0}
					<div class="analysis-section">
						<h4>🔍 Fact Checking</h4>
						<div class="findings-list">
							{#each factChecks as check}
								<div
									class={`finding-item fact-check verdict-${(check.verdict || 'Unverified').toLowerCase()}`}
								>
									<strong>{check.verdict || 'Unverified'}</strong>
									{#if check.claim}
										<p class="finding-description">{check.claim}</p>
									{/if}
									{#if check.source?.name || check.source?.url}
										<p class="finding-source">
											Source:
											{#if check.source?.url}
												<a href={check.source.url} target="_blank" rel="noopener">
													{check.source?.name || check.source.url}
												</a>
											{:else}
												{check.source?.name}
											{/if}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{:else if props.item.analysis}
				<div class="analysis-section">
					<h4>Analysis</h4>
					<p>{@html formatMultiline(props.item.analysis)}</p>
				</div>
			{/if}

			<div class="context-actions">
				<a href="/featured/{props.item.id}" class="view-full-link">
					View Full Analysis
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path
							d="M5 2H12M12 2V9M12 2L5 9"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</a>
				{#if props.item.source_url}
					<a href={props.item.source_url} target="_blank" rel="noopener" class="source-link">
						Original Source
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
							<path
								d="M10 6.5V10C10 10.5523 9.55228 11 9 11H2C1.44772 11 1 10.5523 1 10V3C1 2.44772 1.44772 2 2 2H5.5M7.5 1H11M11 1V4.5M11 1L5 7"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</a>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.featured-context {
		margin: 1.5rem 0;
		background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
		border: 1px solid color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-left: 4px solid var(--color-primary);
		border-radius: var(--border-radius-lg);
		overflow: hidden;
	}

	.context-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		width: 100%;
		padding: 1.25rem 1.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.2s ease;
	}

	.context-header:hover {
		background: color-mix(in srgb, var(--color-primary) 6%, transparent);
	}

	.header-content {
		flex: 1;
		min-width: 0;
	}

	.context-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		border-radius: var(--border-radius-md);
		color: var(--color-primary);
		font-size: 0.8rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	.icon {
		flex-shrink: 0;
	}

	.context-title {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		line-height: 1.3;
	}

	.context-meta {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.context-meta span + span::before {
		content: '•';
		margin-right: 0.75rem;
		opacity: 0.5;
	}

	.expand-icon {
		font-size: 1.5rem;
		font-weight: 300;
		color: var(--color-primary);
		padding: 0.25rem 0.5rem;
		line-height: 1;
	}

	.context-body {
		padding: 0 1.5rem 1.5rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		margin-top: 0;
	}

	.subtitle {
		margin: 1rem 0;
		font-size: 1rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.summary-section,
	.highlights-section {
		margin: 1rem 0;
		padding: 1rem;
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		border-radius: var(--border-radius-md);
	}

	.summary-section strong,
	.highlights-section strong {
		display: block;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
		font-size: 0.9rem;
	}

	.summary-section p,
	.highlights-section p {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.6;
		font-size: 0.95rem;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.75rem;
		margin: 1.25rem 0;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.875rem;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: var(--border-radius-md);
		text-align: center;
	}

	.stat-icon {
		font-size: 1.25rem;
	}

	.stat-count {
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}

	.stat-label {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.stat-card.tone-positive {
		border-color: color-mix(in srgb, #10b981 40%, transparent);
	}

	.stat-card.tone-warning {
		border-color: color-mix(in srgb, #f59e0b 40%, transparent);
	}

	.stat-card.tone-alert {
		border-color: color-mix(in srgb, #ef4444 40%, transparent);
	}

	.stat-card.tone-fact {
		border-color: color-mix(in srgb, #3b82f6 40%, transparent);
	}

	.analysis-section {
		margin: 1.25rem 0;
	}

	.analysis-section h4 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text-primary);
	}

	.findings-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.finding-item {
		padding: 0.875rem 1rem;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-left: 3px solid var(--color-border);
		border-radius: var(--border-radius-md);
	}

	.finding-item.tone-positive {
		border-left-color: #10b981;
	}

	.finding-item.tone-warning {
		border-left-color: #f59e0b;
	}

	.finding-item.tone-alert {
		border-left-color: #ef4444;
	}

	.finding-item.verdict-true {
		border-left-color: #10b981;
	}

	.finding-item.verdict-false {
		border-left-color: #ef4444;
	}

	.finding-item.verdict-misleading {
		border-left-color: #f59e0b;
	}

	.finding-item strong {
		display: block;
		color: var(--color-text-primary);
		font-size: 0.95rem;
		margin-bottom: 0.25rem;
	}

	.finding-description {
		margin: 0.25rem 0 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.finding-examples {
		margin-top: 0.5rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.finding-examples em {
		font-style: italic;
	}

	.finding-examples ul {
		margin: 0.25rem 0 0;
		padding-left: 1.25rem;
	}

	.finding-examples li {
		margin: 0.25rem 0;
	}

	.finding-source {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.finding-source a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.finding-source a:hover {
		text-decoration: underline;
	}

	.context-actions {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.view-full-link,
	.source-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		border-radius: var(--border-radius-md);
		transition: all 0.2s ease;
	}

	.view-full-link {
		background: var(--color-primary);
		color: white;
	}

	.view-full-link:hover {
		background: var(--color-primary-hover, var(--color-primary));
		transform: translateY(-1px);
	}

	.source-link {
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}

	.source-link:hover {
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
		border-color: var(--color-primary);
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.context-header {
			padding: 1rem;
		}

		.context-body {
			padding: 0 1rem 1rem;
		}

		.context-title {
			font-size: 1.1rem;
		}

		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.context-actions {
			flex-direction: column;
		}

		.view-full-link,
		.source-link {
			justify-content: center;
		}
	}
</style>
