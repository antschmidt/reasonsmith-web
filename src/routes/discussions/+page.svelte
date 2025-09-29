<script lang="ts">
  import { onMount } from 'svelte';
  import { nhost } from '$lib/nhostClient';
  import { goto } from '$app/navigation';
  import FeaturedAnalysesCarousel from '$lib/components/FeaturedAnalysesCarousel.svelte';
  import { LIST_PUBLISHED_DISCUSSIONS, SEARCH_PUBLISHED_DISCUSSIONS } from '$lib/graphql/queries';
  import type { PageData } from './$types';

  let loading = $state(true);
  let error = $state<string | null>(null);
  let q = $state('');
  type DiscussionSummary = {
    id: string;
    created_at: string;
    is_anonymous?: boolean | null;
    status: string;
    contributor?: { id: string; handle?: string | null; display_name?: string | null } | null;
    current_version?: {
      id: string;
      title: string;
      description?: string | null;
      good_faith_score?: number | null;
      good_faith_label?: string | null;
    }[];
  };

  let results = $state<DiscussionSummary[] | null>(null);
  let discussions = $state<DiscussionSummary[] | null>(null);
  let filtered = $state<DiscussionSummary[] | null>(null);
  const PAGE_SIZE = 20;
  let page = $state(0);
  let waitingForAuth = $state(false);
  let unsubAuth: (() => void) | null = null;
  let hasMoreDiscussions = $state(true);

  type PublicShowcaseItem = {
    id: string;
    title: string;
    subtitle?: string | null;
    media_type?: string | null;
    creator?: string | null;
    source_url?: string | null;
    summary?: string | null;
    analysis?: string | null;
    created_at: string;
  };

  const props = $props<{ data: PageData }>();
  let showcaseLoading = $state(false);
  let showcaseError = $state<string | null>(props.data?.showcaseError ?? null);
  let showcaseItems = $state<PublicShowcaseItem[]>(props.data?.showcaseItems ?? []);

  $effect(() => {
    showcaseItems = props.data?.showcaseItems ?? [];
    showcaseError = props.data?.showcaseError ?? null;
  });

  // Using imported GraphQL queries for the new versioning system

  async function search() {
    loading = true;
    error = null;
    try {
      const term = q.trim();
      if (!term) { results = null; loading = false; return; }
      const { data, error: gqlError } = await nhost.graphql.request(SEARCH_PUBLISHED_DISCUSSIONS, { searchTerm: `%${term}%` });
      if (gqlError) throw (Array.isArray(gqlError) ? new Error(gqlError.map((e:any)=>e.message).join('; ')) : gqlError);
      results = (data as any)?.discussion ?? [];
    } catch (e:any) {
      error = e.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  let searchTimer: any = null;
  function onSearchInput(e: Event) {
    q = (e.target as HTMLInputElement).value;
    if (searchTimer) clearTimeout(searchTimer);
    const term = q.trim();
    if (!term) { results = null; return; }
    searchTimer = setTimeout(() => { search(); }, 300);
  }

  async function fetchAll(reset = false, retry = true) {
    if (reset) { page = 0; discussions = []; hasMoreDiscussions = true; }
    loading = true;
    error = null;
    try {
      const { data, error: gqlError } = await nhost.graphql.request(LIST_PUBLISHED_DISCUSSIONS, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      if (gqlError) throw (Array.isArray(gqlError) ? new Error(gqlError.map((e:any)=>e.message).join('; ')) : gqlError);
      const rows = (data as any)?.discussion ?? [];
      discussions = [...(discussions ?? []), ...rows];
      page += 1;
      
      // If we received fewer discussions than the page size, we've reached the end
      hasMoreDiscussions = rows.length === PAGE_SIZE;
    } catch (e:any) {
      const msg = e?.message ?? String(e);
      // If schema for anonymous doesn't expose 'discussion', wait for auth and retry once
      if (retry && /field\s+'?discussion'?\s+not\s+found\s+in\s+type/i.test(msg)) {
        waitingForAuth = true;
        await ensureAuthReadyAndHeaders();
        const user = nhost.auth.getUser();
        if (user) {
          waitingForAuth = false;
          return fetchAll(reset, false);
        }
        if (!unsubAuth) {
          const off = nhost.auth.onAuthStateChanged(async (event) => {
            if (event === 'SIGNED_IN') {
              waitingForAuth = false;
              await fetchAll(true, false);
            }
          });
          unsubAuth = () => { try { (off as any)?.(); } catch {} };
        }
        // Important: still set loading = false even when waiting for auth
        loading = false;
        return;
      }
      error = msg || 'Failed to load discussions';
    } finally {
      loading = false;
    }
  }

  async function ensureAuthReadyAndHeaders() {
    try {
      await nhost.auth.isAuthenticatedAsync();
    } catch {}
  // headers are managed globally by nhostClient
  }


  onMount(async () => {
    await ensureAuthReadyAndHeaders();
    await fetchAll(true);
  });

  import { onDestroy } from 'svelte';
  onDestroy(() => { if (unsubAuth) { unsubAuth(); unsubAuth = null; } });

  function clientFilter(list: any[], term: string) {
    const t = term.toLowerCase();
    const parts = t.split(/\s+/).filter(Boolean);
    return list.filter((d) =>
      parts.length === 0 || parts.some((p) => {
        const version = d.current_version?.[0];
        return (
          (version?.title && version.title.toLowerCase().includes(p)) ||
          (version?.description && version.description.toLowerCase().includes(p)) ||
          (d.is_anonymous && 'anonymous'.includes(p)) ||
          (d.contributor?.display_name && d.contributor.display_name.toLowerCase().includes(p)) ||
          (Array.isArray((d as any).tags) && (d as any).tags.some((tag: any) =>
            (typeof tag === 'string' && tag.toLowerCase().includes(p)) ||
            (tag?.name && typeof tag.name === 'string' && tag.name.toLowerCase().includes(p))
          ))
        );
      })
    );
  }

  $effect(() => {
    const term = q.trim();
    if (!term) {
      filtered = discussions ?? [];
    } else if (results !== null) {
      filtered = results;
    } else {
      filtered = discussions ? clientFilter(discussions, term) : [];
    }
  });

  function escapeHtml(s: string) {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function highlight(text?: string | null, query?: string) {
    if (!text) return '';
    const safe = escapeHtml(text);
    const q = (query ?? '').trim().toLowerCase();
    if (!q) return safe;
    const terms = Array.from(new Set(q.split(/\s+/).filter(Boolean)));
    if (terms.length === 0) return safe;
    const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
    return safe.replace(pattern, '<mark>$1</mark>');
  }

  // Prefer a human-friendly display over raw email-like strings
  function displayName(name?: string | null): string {
    if (!name) return '';
    const n = String(name).trim();
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n);
    if (isEmail) return n.split('@')[0];
    return n;
  }

</script>

<div class="container">
  <header class="header">
    <div class="search-row">
      <input id="search" type="search" placeholder="Search topics..." bind:value={q} oninput={onSearchInput} onkeydown={(e)=> e.key==='Enter' && search()} />
      <button class="btn-primary" onclick={search}>Search</button>
    </div>
  </header>

  {#if !q.trim()}
    <section class="showcase-block" aria-labelledby="showcase-block-title">
      <div class="showcase-block-heading">
        <h2 id="showcase-block-title">Curated Analyses</h2>
        <p>Explore highlighted evaluations of noteworthy public rhetoric.</p>
      </div>
      {#if showcaseLoading}
        <p class="showcase-block-status">Loading curated analyses…</p>
      {:else if showcaseError}
        <p class="showcase-block-status error">{showcaseError}</p>
      {:else if showcaseItems.length === 0}
        <p class="showcase-block-status">Curated analyses will appear here as they are published.</p>
      {:else}
        <FeaturedAnalysesCarousel items={showcaseItems} />
      {/if}
    </section>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <section class="results">
    {#if loading && (!discussions || discussions.length === 0)}
      <p class="hint">Loading discussions...</p>
    {:else if filtered && filtered.length > 0}
      {#each filtered as d}
        <div class="discussion-card" role="button" tabindex="0"
          onclick={() => goto(`/discussions/${d.id}`)}
          onkeydown={(e)=> e.key==='Enter' && goto(`/discussions/${d.id}`)}
        >
          {#if d.current_version?.[0]}
            <h3 class="discussion-title">{@html highlight(d.current_version[0].title, q)}</h3>
            {#if d.current_version[0].description}
              <p class="discussion-snippet">{@html highlight(d.current_version[0].description, q)}</p>
            {/if}
          {:else}
            <h3 class="discussion-title">Discussion</h3>
          {/if}
          <p class="discussion-meta">
            {#if d.is_anonymous}
              <span class="anonymous-author">by Anonymous</span>
              {' · '}{new Date(d.created_at).toLocaleString()}
            {:else if d.contributor?.display_name}
              by <a href={`/u/${d.contributor.handle || d.contributor.id}`}>@{@html highlight(displayName(d.contributor.display_name), q)}</a> · {new Date(d.created_at).toLocaleString()}
            {:else}
              {new Date(d.created_at).toLocaleString()}
            {/if}
          </p>
        </div>
      {/each}
      {#if !q.trim() && hasMoreDiscussions}
        <div class="load-more-row">
          <button class="btn-secondary" onclick={() => fetchAll(false)} disabled={loading}>Load more</button>
        </div>
      {/if}
    {:else if q.trim().length > 0 && !loading}
      <p class="hint">No discussions match your search.</p>
    {:else if !loading}
      <p class="hint">No discussions yet.</p>
    {/if}
  </section>
</div>

<style>
  .container {
    margin: 0 auto;
    padding: 2rem 1rem;
    max-width: 1200px;
    background: linear-gradient(135deg,
      var(--color-surface) 0%,
      color-mix(in srgb, var(--color-primary) 3%, var(--color-surface)) 50%,
      color-mix(in srgb, var(--color-accent) 2%, var(--color-surface)) 100%
    );
    min-height: 100vh;
    position: relative;
  }

  .container::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(
      circle at 30% 20%,
      color-mix(in srgb, var(--color-primary) 6%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      circle at 70% 80%,
      color-mix(in srgb, var(--color-accent) 4%, transparent) 0%,
      transparent 50%
    );
    z-index: -1;
    animation: float 20s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    33% { transform: translate(-1%, -0.5%) rotate(0.5deg); }
    66% { transform: translate(0.5%, -1%) rotate(-0.5deg); }
  }

  .header h1 {
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 900;
    margin: 0 0 2rem;
    font-family: var(--font-family-display);
    color: var(--color-text-primary);
    text-align: center;
    letter-spacing: -0.02em;
    position: relative;
  }

  .header h1::after {
    content: '';
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 60px;
    height: 4px;
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    border-radius: 2px;
  }

  .search-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
    background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
    backdrop-filter: blur(20px);
    padding: 1.5rem;
    border-radius: 20px;
    border: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
    box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 8%, transparent);
  }

  .search-row input {
    flex: 1;
    padding: 1rem 1.25rem;
    margin-bottom: 0;
    border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
    border-radius: 16px;
    background: color-mix(in srgb, var(--color-input-bg) 70%, transparent);
    backdrop-filter: blur(10px);
    font-size: 1rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .search-row input:focus {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-input-bg) 90%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    transform: translateY(-1px);
  }

  .showcase-block {
    margin: 2rem 0 3rem;
    border: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
    border-radius: 24px;
    padding: 2rem;
    background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
    backdrop-filter: blur(20px) saturate(1.2);
    box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 8%, transparent);
    position: relative;
    overflow: hidden;
  }

  .showcase-block::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    border-radius: 24px 24px 0 0;
  }

  .showcase-block-heading {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .showcase-block-heading h2 {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 800;
    font-family: var(--font-family-display);
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
  }
  .showcase-block-heading p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 1.1rem;
    line-height: 1.6;
  }

  .showcase-block-status {
    color: var(--color-text-secondary);
    font-size: 1rem;
  }
  .showcase-block-status.error {
    color: #f87171;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-top: 2rem;
  }

  .load-more-row {
    display: flex;
    justify-content: center;
    margin-top: 2rem;
  }

  .discussion-card {
    background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
    backdrop-filter: blur(15px) saturate(1.1);
    border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
    border-radius: 20px;
    padding: 2rem;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 6%, transparent);
    position: relative;
    overflow: hidden;
  }

  .discussion-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    border-radius: 20px 20px 0 0;
  }

  .discussion-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 15px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
    background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
  }


  .discussion-title {
    color: var(--color-text-primary);
    font-weight: 700;
    font-size: 1.375rem;
    font-family: var(--font-family-display);
    margin-bottom: 0.75rem;
    line-height: 1.3;
  }

  .discussion-snippet {
    color: var(--color-text-primary);
    font-size: 1rem;
    margin: 0 0 1rem 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    line-clamp: 2;
    line-height: 1.6;
  }

  .discussion-meta {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .anonymous-author {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  :global(mark) {
    background: color-mix(in srgb, var(--color-primary) 25%, transparent);
    padding: 0 0.2em;
    border-radius: 4px;
    font-weight: 600;
  }

  .hint {
    color: var(--color-text-secondary);
    margin-top: 2rem;
    text-align: center;
    font-size: 1rem;
  }

  .error {
    color: #ef4444;
    text-align: center;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    color: var(--color-surface);
    border: none;
    border-radius: 50px;
    padding: 1rem 2rem;
    cursor: pointer;
    font-weight: 700;
    font-family: var(--font-family-display);
    font-size: 1rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 25%, transparent);
    position: relative;
    overflow: hidden;
  }

  .btn-primary::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 15px 40px color-mix(in srgb, var(--color-primary) 35%, transparent);
    filter: brightness(1.05);
  }

  .btn-primary:hover::before {
    left: 100%;
  }

  .btn-secondary {
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    backdrop-filter: blur(10px);
    color: var(--color-text-primary);
    border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
    border-radius: 50px;
    padding: 1rem 2rem;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 8%, transparent);
  }

  .btn-secondary:hover {
    background: color-mix(in srgb, var(--color-surface) 80%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
  }

  /* Dark mode button text contrast fix */
  :global([data-theme="dark"]) .btn-primary {
    color: #000000;
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.1);
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .container {
      padding: 1rem 0.5rem;
    }

    .search-row {
      padding: 1.25rem;
      gap: 0.75rem;
    }

    .showcase-block {
      padding: 1.5rem;
      margin: 1.5rem 0 2rem;
    }

    .discussion-card {
      padding: 1.5rem;
    }

    .discussion-title {
      font-size: 1.25rem;
    }

    .results {
      gap: 1.25rem;
    }
  }

  /* Nuclear approach - override ALL link colors in dark mode */
  :global([data-theme="dark"] a),
  :global([data-theme="dark"] a:link),
  :global([data-theme="dark"] a:visited),
  :global([data-theme="dark"] a:hover),
  :global([data-theme="dark"] a:active) {
    color: #a9c8ff;
  }
</style>
