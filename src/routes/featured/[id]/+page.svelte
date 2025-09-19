<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

  const { item } = data;
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
        <h2>Summary</h2>
        <div class="section-body">{@html formatMultiline(item.summary)}</div>
      </section>
    {/if}

    {#if item.analysis}
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

  .section-body {
    font-size: 1rem;
    line-height: 1.6;
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
