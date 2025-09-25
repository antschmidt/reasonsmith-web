<svelte:options runes={true} />
<script lang="ts">
  import { onMount } from 'svelte';

  export type FeaturedShowcaseItem = {
    id: string;
    title: string;
    subtitle?: string | null;
    media_type?: string | null;
    creator?: string | null;
    summary?: string | null;
    analysis?: string | null;
    tags?: string[] | null;
    source_url?: string | null;
    created_at: string;
  };

  const props = $props<{ items?: FeaturedShowcaseItem[] }>();
  const items = $derived(props.items ?? []);

  let viewport: HTMLDivElement | null = null;
  let atStart = $state(true);
  let atEnd = $state(false);

  const sanitizeMultiline = (value?: string | null) => {
    if (!value) return '';
    const escaped = value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    return escaped.replace(/(?:\r\n|\r|\n)/g, '<br />');
  };

  const updateScrollState = () => {
    if (!viewport) return;
    const { scrollLeft, scrollWidth, clientWidth } = viewport;
    atStart = scrollLeft <= 4;
    atEnd = scrollLeft + clientWidth >= scrollWidth - 4;
  };

  const scrollByPage = (direction: 'prev' | 'next') => {
    if (!viewport) return;
    const amount = viewport.clientWidth * 0.8;
    viewport.scrollBy({ left: direction === 'next' ? amount : -amount, behavior: 'smooth' });
  };

  onMount(() => {
    const handle = () => updateScrollState();
    handle();
    const observer = new ResizeObserver(handle);
    if (viewport) observer.observe(viewport);
    return () => observer.disconnect();
  });
</script>

{#if items.length > 0}
  <div class="featured-carousel" aria-label="Featured analyses carousel">
    <button
      class="nav-button prev"
      type="button"
      on:click={() => scrollByPage('prev')}
      disabled={atStart}
      aria-label="Scroll to previous featured analysis"
    >
      ‹
    </button>

    <div
      class="carousel-viewport"
      bind:this={viewport}
      role="list"
      on:scroll={updateScrollState}
    >
      {#each items as item (item.id)}
        <a role="listitem" class="carousel-card" href={`/featured/${item.id}`}>
          <header class="card-header">
            <div class="meta-tags">
              {#if item.media_type}<span>{item.media_type}</span>{/if}
              {#if item.creator}<span>{item.creator}</span>{/if}
              <span>{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
            <h3>{item.title}</h3>
            {#if item.subtitle}
              <p class="subtitle">{@html sanitizeMultiline(item.subtitle)}</p>
            {/if}
          </header>
          {#if item.summary}
            <p class="summary">{@html sanitizeMultiline(item.summary)}</p>
          {/if}
          <!-- {#if item.analysis}
            <p class="analysis">{@html sanitizeMultiline(item.analysis)}</p>
          {/if} -->
          {#if item.tags && item.tags.length > 0}
            <ul class="tag-list">
              {#each item.tags as tag}
                <li>{tag}</li>
              {/each}
            </ul>
          {/if}
          <footer class="card-footer">
            <span class="card-cta">Read analysis</span>
            <span class="card-arrow" aria-hidden="true">→</span>
            {#if item.source_url}
              <a class="source-link" href={item.source_url} target="_blank" rel="noopener">Source ↗</a>
            {/if}
          </footer>
        </a>
      {/each}
    </div>

    <button
      class="nav-button next"
      type="button"
      on:click={() => scrollByPage('next')}
      disabled={atEnd}
      aria-label="Scroll to next featured analysis"
    >
      ›
    </button>
  </div>
{/if}

<style>
  .featured-carousel {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: center;
  }

  .carousel-viewport {
    position: relative;
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    padding: 0.25rem;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    scrollbar-width: thin;
  }

  .carousel-viewport::-webkit-scrollbar {
    height: 6px;
  }

  .carousel-viewport::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-border) 80%, transparent);
    border-radius: 999px;
  }

  .carousel-card {
    scroll-snap-align: start;
    min-width: clamp(220px, 48vw, 280px);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1.05rem clamp(1rem, 3vw, 1.35rem);
    border-radius: var(--border-radius-md);
    border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
    background: var(--color-surface);
    color: inherit;
    text-decoration: none;
    box-shadow: 0 6px 16px color-mix(in srgb, var(--color-border) 16%, transparent);
    transition: transform var(--transition-speed) ease, box-shadow var(--transition-speed) ease;
  }

  .carousel-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 22px color-mix(in srgb, var(--color-border) 22%, transparent);
  }

  .carousel-card:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 4px;
  }

  .card-header {
    display: flex;
    flex-direction: column;
    /* gap: 0.15rem; */
  }

  .card-header h3 {
    margin: 0;
    font-size: 1.05rem;
    line-height: 1.35;
  }

  .subtitle {
    margin: 0;
    text-align: left;
    font-size: 0.7rem;
    color: var(--color-text-secondary);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .summary {
    margin: 0;
    text-align: left;
    font-size: 0.86rem;
    line-height: 1.4;
    color: color-mix(in srgb, var(--color-text-secondary) 90%, transparent);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .analysis {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.4;
    color: color-mix(in srgb, var(--color-text-secondary) 80%, transparent);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .tag-list {
    display: flex;
    max-height: 8rem;
    overflow: auto;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }


  .tag-list li {
    padding: 0.25rem 0.25rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    /* letter-spacing: 0.05em; */
    background: color-mix(in srgb, var(--color-surface-alt) 85%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
    color: color-mix(in srgb, var(--color-text-secondary) 92%, transparent);
  }

  .meta-tags {
    order: -1;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.6rem;
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--color-text-secondary) 95%, transparent);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .meta-tags span + span::before {
    content: '•';
    margin-right: 0.45rem;
    color: color-mix(in srgb, var(--color-text-secondary) 55%, transparent);
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-primary);
  }

  .card-cta {
    margin: 0;
  }

  .card-arrow {
    display: inline-flex;
    transition: transform var(--transition-speed) ease;
  }

  .carousel-card:hover .card-arrow {
    transform: translateX(2px);
  }

  .source-link {
    margin-left: auto;
    font-size: 0.78rem;
    font-weight: 500;
    color: color-mix(in srgb, var(--color-primary) 90%, transparent);
    text-decoration: none;
  }

  .source-link:hover,
  .source-link:focus-visible {
    text-decoration: underline;
  }

  .nav-button {
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    cursor: pointer;
    transition: background var(--transition-speed) ease, transform var(--transition-speed) ease;
  }

  .nav-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
    transform: translateY(-1px);
  }

  .nav-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (max-width: 640px) {
    .featured-carousel {
      grid-template-columns: 1fr;
    }

    .nav-button {
      display: none;
    }

    .carousel-viewport {
      order: 2;
      margin: 0 -1rem;
      padding: 0.25rem 1rem;
    }
  }
</style>
