<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();

	const { item, structuredAnalysis } = data;
	const metaDescription = item.summary
		? item.summary.replace(/\s+/g, ' ').trim().slice(0, 160)
		: null;

	const formatMultiline = (value?: string | null) => {
		if (!value) return '';
		const escaped = value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
		return escaped.replace(/(?:\r\n|\r|\n)/g, '<br />');
	};

	const hasStructured = !!structuredAnalysis;

	const sections = structuredAnalysis
		? [
				{
					key: 'good_faith',
					title: 'Good Faith Indicators',
					icon: '🤝',
					tone: 'positive',
					items: structuredAnalysis.good_faith ?? [],
					emptyCopy: 'No clear good-faith signals were identified in this excerpt.'
				},
				{
					key: 'logical_fallacies',
					title: 'Logical Fallacies',
					icon: '⚠️',
					tone: 'warning',
					items: structuredAnalysis.logical_fallacies ?? [],
					emptyCopy: 'No explicit logical fallacies were detected.'
				},
				{
					key: 'cultish_language',
					title: 'Cultish / Manipulative Language',
					icon: '🧠',
					tone: 'alert',
					items: structuredAnalysis.cultish_language ?? [],
					emptyCopy: 'No manipulative language patterns were highlighted.'
				}
			]
		: [];

	const factChecks = structuredAnalysis?.fact_checking ?? [];
	const summary = structuredAnalysis?.summary ?? null;

	const getExamples = (entry: any): string[] => {
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
	};

	const summaryStats = structuredAnalysis
		? sections
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
				])
		: [];
</script>

<svelte:head>
	<title>{item.title} • Featured Analysis</title>
	{#if metaDescription}
		<meta name="description" content={metaDescription} />
	{/if}
</svelte:head>

<main class="featured-analysis">
	<a class="back-link" href="/discussions">← Back to Featured Analyses</a>

	<article class="analysis-card">
		<header class="analysis-header">
			<h1>{item.title}</h1>
			{#if item.subtitle}
				<p class="subtitle">{@html formatMultiline(item.subtitle)}</p>
			{/if}
			<div class="meta">
				{#if item.media_type}<span>{item.media_type}</span>{/if}
				{#if item.creator}<span>{item.creator}</span>{/if}
				<span
					>{item.date_published
						? new Date(item.date_published + 'T12:00:00').toLocaleDateString()
						: new Date(item.created_at).toLocaleDateString()}</span
				>
			</div>

			{#if item.tags && item.tags.length > 0}
				<ul class="tag-list">
					{#each item.tags as tag}
						<li>{tag}</li>
					{/each}
				</ul>
			{/if}
		</header>

		{#if summary}
			<div class="section-body" style="margin-top: 1.5rem;">
				<strong>Overall summary:</strong>
				{@html formatMultiline(summary)}
			</div>
		{/if}

		{#if item.summary}
			<section class="section">
				<h2>Highlights</h2>
				<div class="section-body">{@html formatMultiline(item.summary)}</div>
			</section>
		{/if}

		{#if hasStructured}
			<section class="summary">
				<div class="summary-grid">
					{#each summaryStats as stat}
						<div class={`summary-card tone-${stat.tone}`}>
							<div class="summary-icon">{stat.icon}</div>
							<div class="summary-meta">
								<span class="summary-count">{stat.count}</span>
								<span class="summary-label">{stat.label}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			{#each sections as section}
				<section class="section">
					<div class="section-heading">
						<h2>{section.icon} {section.title}</h2>
						{#if section.items.length > 0}
							<span class="section-count"
								>{section.items.length} finding{section.items.length === 1 ? '' : 's'}</span
							>
						{/if}
					</div>
					{#if section.items.length > 0}
						<div class="insight-grid">
							{#each section.items as entry}
								{@const examples = getExamples(entry)}
								<article class={`insight-card tone-${section.tone}`}>
									<header>
										<h3>{entry.name}</h3>
										{#if entry.description}
											<p class="description">{entry.description}</p>
										{/if}
									</header>
									{#if examples.length > 0}
										<div class="example">
											<strong>{examples.length === 1 ? 'Example' : 'Examples'}:</strong>
											<ul>
												{#each examples as example}
													<li>{example}</li>
												{/each}
											</ul>
										</div>
									{/if}
									{#if entry.why}
										<p class="rationale"><strong>Why it matters:</strong> {entry.why}</p>
									{/if}
								</article>
							{/each}
						</div>
					{:else}
						<p class="section-empty">{section.emptyCopy}</p>
					{/if}
				</section>
			{/each}

			<section class="section">
				<div class="section-heading">
					<h2>🔍 Fact Checking</h2>
					{#if factChecks.length > 0}
						<span class="section-count"
							>{factChecks.length} claim{factChecks.length === 1 ? '' : 's'}</span
						>
					{/if}
				</div>
				{#if factChecks.length > 0}
					<div class="fact-grid">
						{#each factChecks as check}
							<article class={`fact-card verdict-${(check.verdict || 'Unverified').toLowerCase()}`}>
								<header>
									<h3>{check.verdict || 'Unverified'}</h3>
								</header>
								{#if check.claim}
									<p class="claim">{check.claim}</p>
								{/if}
								{#if check.source?.name || check.source?.url}
									<p class="source">
										<strong>Source:</strong>
										{#if check.source?.url}
											<a href={check.source.url} target="_blank" rel="noopener"
												>{check.source?.name || check.source.url}</a
											>
										{:else if check.source?.name}
											{check.source.name}
										{/if}
									</p>
								{/if}
							</article>
						{/each}
					</div>
				{:else}
					<p class="section-empty">No fact-checkable claims were highlighted.</p>
				{/if}
			</section>
		{:else if item.analysis}
			<section class="section">
				<h2>Analysis</h2>
				<div class="section-body">{@html formatMultiline(item.analysis)}</div>
			</section>
		{/if}

		{#if item.source_url}
			<a class="source-link" href={item.source_url} target="_blank" rel="noopener"
				>Original source ↗</a
			>
		{/if}
	</article>
</main>

<style>
	.featured-analysis {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		color: var(--color-text-primary);
		background: linear-gradient(
			135deg,
			var(--color-surface) 0%,
			color-mix(in srgb, var(--color-primary) 3%, var(--color-surface)) 50%,
			color-mix(in srgb, var(--color-accent) 2%, var(--color-surface)) 100%
		);
		min-height: 100vh;
		position: relative;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 2rem;
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 600;
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-lg);
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.back-link:hover {
		transform: translateY(-2px);
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
	}

	.analysis-card {
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		backdrop-filter: blur(30px) saturate(1.2);
		border: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
		border-radius: 30px;
		box-shadow:
			0 20px 60px color-mix(in srgb, var(--color-primary) 12%, transparent),
			0 8px 32px color-mix(in srgb, var(--color-surface) 15%, transparent);
		padding: 3rem clamp(2rem, 5vw, 4rem);
		position: relative;
		overflow: hidden;
	}

	.analysis-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 30px 30px 0 0;
	}

	.analysis-header h1 {
		margin: 0;
		font-size: clamp(2.5rem, 6vw, 4rem);
		font-weight: 900;
		line-height: 1.1;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		letter-spacing: -0.02em;
		margin-bottom: 1rem;
	}

	.subtitle {
		margin: 0 0 1.5rem;
		font-size: clamp(1.125rem, 2.5vw, 1.375rem);
		color: var(--color-text-secondary);
		line-height: 1.6;
		font-weight: 400;
	}

	.meta {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.9rem;
		margin-top: 1.5rem;
		color: var(--color-text-secondary);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.meta span + span::before {
		content: '•';
		margin-right: 0.5rem;
		color: color-mix(in srgb, var(--color-text-secondary) 60%, transparent);
	}

	.tag-list {
		list-style: none;
		max-height: 10rem;
		overflow: auto;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0;
		margin: 1.25rem 0 0;
	}

	.tag-list li {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-primary);
		transition: all 0.2s ease;
	}

	.tag-list li:hover {
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
		transform: translateY(-1px);
	}

	.section {
		margin-top: 3rem;
	}

	.section:first-of-type {
		margin-top: 2.5rem;
	}

	.section h2 {
		margin: 0 0 1.5rem;
		font-size: clamp(1.5rem, 3vw, 2rem);
		font-weight: 800;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		letter-spacing: -0.01em;
	}

	.section-heading {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.section-heading h2 {
		margin: 0;
		font-size: clamp(1.5rem, 3vw, 2rem);
		font-weight: 800;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		letter-spacing: -0.01em;
	}

	.section-count {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		font-weight: 600;
		padding: 0.25rem 0.75rem;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		border-radius: var(--border-radius-md);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.section-body {
		font-size: 1.1rem;
		line-height: 1.7;
		color: var(--color-text-primary);
	}

	.summary {
		margin-top: 2.5rem;
	}

	.summary-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	}

	.summary-card {
		border-radius: var(--border-radius-lg);
		padding: 1.5rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(10px);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.summary-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 30px color-mix(in srgb, var(--color-primary) 12%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
	}

	.summary-icon {
		font-size: 2rem;
		filter: drop-shadow(0 2px 4px color-mix(in srgb, var(--color-primary) 15%, transparent));
	}

	.summary-meta {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}

	.summary-count {
		font-size: 1.5rem;
		font-weight: 900;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}

	.summary-label {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.insight-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}

	.insight-card {
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 2rem;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(15px) saturate(1.1);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 6%, transparent);
		position: relative;
		overflow: hidden;
	}

	.insight-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: var(--border-radius-lg) 20px 0 0;
	}

	.insight-card:hover {
		transform: translateY(-6px);
		box-shadow: 0 15px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
	}

	.insight-card h3 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}

	.insight-card .description {
		margin: 0.25rem 0 0;
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	.insight-card .example {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.insight-card .example strong {
		display: block;
		margin-bottom: 0.35rem;
	}

	.insight-card .example ul {
		margin: 0;
		padding-left: 1.1rem;
	}

	.insight-card .example li {
		margin: 0.15rem 0;
	}

	.insight-card .rationale {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.section-empty {
		margin: 0;
		font-size: 0.95rem;
		color: var(--color-text-secondary);
	}

	.fact-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	}

	.fact-card {
		border-radius: var(--border-radius-lg);
		padding: 2rem;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(15px) saturate(1.1);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 6%, transparent);
		position: relative;
		overflow: hidden;
	}

	.fact-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: var(--border-radius-lg) 20px 0 0;
	}

	.fact-card:hover {
		transform: translateY(-6px);
		box-shadow: 0 15px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
	}

	.fact-card header h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}

	.fact-card .claim {
		margin: 0;
		font-size: 1rem;
		line-height: 1.6;
		color: var(--color-text-primary);
	}

	.fact-card .source {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.fact-card .source a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.fact-card .source a:hover {
		text-decoration: underline;
	}

	.summary-card.tone-positive,
	.insight-card.tone-positive {
		border-color: color-mix(in srgb, #10b981 60%, transparent);
		box-shadow: 0 6px 20px color-mix(in srgb, #10b981 15%, transparent);
	}

	.summary-card.tone-positive:hover,
	.insight-card.tone-positive:hover {
		box-shadow: 0 15px 40px color-mix(in srgb, #10b981 25%, transparent);
	}

	.summary-card.tone-warning,
	.insight-card.tone-warning {
		border-color: color-mix(in srgb, #f59e0b 60%, transparent);
		box-shadow: 0 6px 20px color-mix(in srgb, #f59e0b 15%, transparent);
	}

	.summary-card.tone-warning:hover,
	.insight-card.tone-warning:hover {
		box-shadow: 0 15px 40px color-mix(in srgb, #f59e0b 25%, transparent);
	}

	.summary-card.tone-alert,
	.insight-card.tone-alert {
		border-color: color-mix(in srgb, #ef4444 60%, transparent);
		box-shadow: 0 6px 20px color-mix(in srgb, #ef4444 15%, transparent);
	}

	.summary-card.tone-alert:hover,
	.insight-card.tone-alert:hover {
		box-shadow: 0 15px 40px color-mix(in srgb, #ef4444 25%, transparent);
	}

	.summary-card.tone-fact {
		border-color: color-mix(in srgb, #3b82f6 60%, transparent);
		box-shadow: 0 6px 20px color-mix(in srgb, #3b82f6 15%, transparent);
	}

	.summary-card.tone-fact:hover {
		box-shadow: 0 15px 40px color-mix(in srgb, #3b82f6 25%, transparent);
	}

	.fact-card.verdict-true {
		border-color: color-mix(in srgb, #10b981 60%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, #10b981 20%, transparent);
	}

	.fact-card.verdict-true::before {
		background: linear-gradient(90deg, #10b981, #34d399);
	}

	.fact-card.verdict-true:hover {
		box-shadow: 0 20px 50px color-mix(in srgb, #10b981 30%, transparent);
	}

	.fact-card.verdict-false {
		border-color: color-mix(in srgb, #ef4444 60%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, #ef4444 20%, transparent);
	}

	.fact-card.verdict-false::before {
		background: linear-gradient(90deg, #ef4444, #f87171);
	}

	.fact-card.verdict-false:hover {
		box-shadow: 0 20px 50px color-mix(in srgb, #ef4444 30%, transparent);
	}

	.fact-card.verdict-misleading {
		border-color: color-mix(in srgb, #f59e0b 60%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, #f59e0b 20%, transparent);
	}

	.fact-card.verdict-misleading::before {
		background: linear-gradient(90deg, #f59e0b, #fbbf24);
	}

	.fact-card.verdict-misleading:hover {
		box-shadow: 0 20px 50px color-mix(in srgb, #f59e0b 30%, transparent);
	}

	.fact-card.verdict-unverified {
		border-color: color-mix(in srgb, var(--color-border) 60%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.fact-card.verdict-unverified:hover {
		box-shadow: 0 20px 50px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.section-body :global(br) {
		content: '';
	}

	/* Mobile Responsiveness */
	@media (max-width: 768px) {
		.featured-analysis {
			padding: 1rem 0.5rem 3rem;
		}

		.analysis-card {
			padding: 2rem 1.5rem;
			border-radius: var(--border-radius-xl);
		}

		.analysis-header h1 {
			font-size: clamp(2rem, 8vw, 3rem);
		}

		.section-heading {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
			margin-bottom: 1.5rem;
		}

		.summary-grid {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.insight-grid,
		.fact-grid {
			grid-template-columns: 1fr;
		}

		.back-link {
			padding: 0.6rem 1.25rem;
			font-size: 0.9rem;
		}

		.tag-list {
			gap: 0.75rem;
		}
	}

	@media (max-width: 480px) {
		.meta {
			flex-direction: column;
			gap: 0.5rem;
		}

		.summary-card,
		.insight-card,
		.fact-card {
			padding: 1.5rem;
		}

		.source-link {
			padding: 0.75rem 1.5rem;
			font-size: 0.9rem;
		}
	}

	.source-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 3rem;
		color: var(--color-primary);
		font-weight: 600;
		text-decoration: none;
		padding: 1rem 2rem;
		border-radius: var(--border-radius-lg);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 10%, transparent);
		font-family: var(--font-family-display);
	}

	.source-link:hover {
		transform: translateY(-2px);
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}
</style>
