<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

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
    ? sections.map(section => ({
        key: section.key,
        label: section.title,
        icon: section.icon,
        tone: section.tone,
        count: Array.isArray(section.items) ? section.items.length : 0
      })).concat([
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
  <a class="back-link" href="/">← Back to Featured Analyses</a>

  <article class="analysis-card">
    <header class="analysis-header">
      <h1>{item.title}</h1>
      {#if item.subtitle}
        <p class="subtitle">{@html formatMultiline(item.subtitle)}</p>
      {/if}
      <div class="meta">
        {#if item.media_type}<span>{item.media_type}</span>{/if}
        {#if item.creator}<span>{item.creator}</span>{/if}
        <span>{new Date(item.created_at).toLocaleDateString()}</span>
      </div>

      {#if item.tags && item.tags.length > 0}
        <ul class="tag-list">
          {#each item.tags as tag}
            <li>{tag}</li>
          {/each}
        </ul>
      {/if}
    </header>

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
              <span class="section-count">{section.items.length} finding{section.items.length === 1 ? '' : 's'}</span>
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
            <span class="section-count">{factChecks.length} claim{factChecks.length === 1 ? '' : 's'}</span>
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
                      <a href={check.source.url} target="_blank" rel="noopener">{check.source?.name || check.source.url}</a>
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
        {#if summary}
          <div class="section-body" style="margin-top: 1.5rem;">
            <strong>Overall summary:</strong> {@html formatMultiline(summary)}
          </div>
        {/if}
      </section>

      {#if item.analysis}
        <details class="raw-analysis">
          <summary>View raw analysis JSON</summary>
          <pre><code>{item.analysis}</code></pre>
        </details>
      {/if}
    {:else if item.analysis}
      <section class="section">
        <h2>Analysis</h2>
        <div class="section-body">{@html formatMultiline(item.analysis)}</div>
      </section>
    {/if}

    {#if item.source_url}
      <a class="source-link" href={item.source_url} target="_blank" rel="noopener">Original source ↗</a>
    {/if}
  </article>
</main>

<style>
  .featured-analysis {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
    color: var(--color-text-primary);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-bottom: 1.5rem;
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .analysis-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-lg);
    box-shadow: 0 10px 30px color-mix(in srgb, var(--color-border) 20%, transparent);
    padding: 2.5rem clamp(1.5rem, 5vw, 3rem);
  }

  .analysis-header h1 {
    margin: 0;
    font-size: clamp(1.8rem, 3vw, 2.4rem);
    line-height: 1.2;
  }

  .subtitle {
    margin: 0.75rem 0 0;
    font-size: 1.1rem;
    color: var(--color-text-secondary);
  }

  .meta {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    font-size: 0.85rem;
    margin-top: 1rem;
    color: var(--color-text-secondary);
  }

  .tag-list {
    list-style: none;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0;
    margin: 1.25rem 0 0;
  }

  .tag-list li {
    background-color: var(--color-surface-alt);
    border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
  }

  .section {
    margin-top: 2.5rem;
  }

  .section:first-of-type {
    margin-top: 2rem;
  }

  .section h2 {
    margin: 0 0 0.75rem;
    font-size: 1.2rem;
  }

  .section-heading {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .section-count {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  .section-body {
    font-size: 1rem;
    line-height: 1.6;
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
    border-radius: var(--border-radius-md);
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
  }

  .summary-icon {
    font-size: 1.5rem;
  }

  .summary-meta {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }

  .summary-count {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .summary-label {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  .insight-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .insight-card {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    padding: 1.25rem;
    background: var(--color-surface-alt);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .insight-card h3 {
    margin: 0;
    font-size: 1.05rem;
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
    border-radius: var(--border-radius-md);
    padding: 1.25rem;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .fact-card header h3 {
    margin: 0;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .fact-card .claim {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .fact-card .source {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
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
    border-color: color-mix(in srgb, #22c55e 40%, var(--color-border));
  }

  .summary-card.tone-warning,
  .insight-card.tone-warning {
    border-color: color-mix(in srgb, #f59e0b 45%, var(--color-border));
  }

  .summary-card.tone-alert,
  .insight-card.tone-alert {
    border-color: color-mix(in srgb, #ef4444 45%, var(--color-border));
  }

  .summary-card.tone-fact {
    border-color: color-mix(in srgb, #3b82f6 45%, var(--color-border));
  }

  .fact-card.verdict-true {
    border-color: color-mix(in srgb, #22c55e 40%, var(--color-border));
    box-shadow: 0 4px 14px color-mix(in srgb, #22c55e 18%, transparent);
  }

  .fact-card.verdict-false {
    border-color: color-mix(in srgb, #ef4444 40%, var(--color-border));
    box-shadow: 0 4px 14px color-mix(in srgb, #ef4444 18%, transparent);
  }

  .fact-card.verdict-misleading {
    border-color: color-mix(in srgb, #f59e0b 40%, var(--color-border));
    box-shadow: 0 4px 14px color-mix(in srgb, #f59e0b 18%, transparent);
  }

  .fact-card.verdict-unverified {
    border-color: color-mix(in srgb, var(--color-border) 80%, transparent);
  }

  .raw-analysis {
    margin-top: 2.5rem;
  }

  .raw-analysis summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--color-primary);
  }

  .raw-analysis pre {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--color-surface-alt);
    border-radius: var(--border-radius-sm);
    overflow-x: auto;
    font-size: 0.85rem;
  }

  .section-body :global(br) {
    content: '';
  }

  .source-link {
    display: inline-flex;
    margin-top: 2.5rem;
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: none;
  }

  .source-link:hover {
    text-decoration: underline;
  }
</style>
