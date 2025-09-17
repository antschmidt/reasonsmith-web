<script lang="ts">
  import { onMount } from 'svelte';
  import { nhost } from '$lib/nhostClient';
  import { goto } from '$app/navigation';

  let loading = $state(true);
  let error = $state<string | null>(null);
  let categories = $state([
    { key: 'latest', label: 'Latest' },
    { key: 'popular', label: 'Popular' },
    { key: 'ethics', label: 'Ethics' },
    { key: 'policy', label: 'Policy' },
    { key: 'tech', label: 'Technology' }
  ]);
  let activeCategory = $state('latest');
  let q = $state('');
  type DiscussionSummary = {
    id: string;
    title: string;
    description?: string | null;
    created_at: string;
    is_anonymous?: boolean | null;
    contributor?: { id: string; handle?: string | null; display_name?: string | null } | null;
  };

  let results = $state<DiscussionSummary[] | null>(null);
  let discussions = $state<DiscussionSummary[] | null>(null);
  let filtered = $state<DiscussionSummary[] | null>(null);
  const PAGE_SIZE = 20;
  let page = $state(0);
  let waitingForAuth = $state(false);
  let unsubAuth: (() => void) | null = null;
  let hasMoreDiscussions = $state(true);

  const SEARCH_DISCUSSIONS = `
    query SearchDiscussions($q: String!, $limit: Int = 20) {
      discussion(
        where: {
          _or: [
            { title: { _ilike: $q } },
            { description: { _ilike: $q } },
            { contributor: { display_name: { _ilike: $q } } }
          ]
        },
        limit: $limit,
        order_by: { created_at: desc }
      ) {
        id
        title
        description
        created_at
        is_anonymous
        contributor { id handle display_name }
      }
    }
  `;

  const LIST_DISCUSSIONS = `
    query ListDiscussions($limit: Int = 20, $offset: Int = 0, $order: order_by = desc) {
      discussion(order_by: { created_at: $order }, limit: $limit, offset: $offset) {
        id
        title
        description
        created_at
        is_anonymous
        contributor { id handle display_name }
      }
    }
  `;

  async function search() {
    loading = true;
    error = null;
    try {
      const term = q.trim();
      if (!term) { results = null; loading = false; return; }
      const { data, error: gqlError } = await nhost.graphql.request(SEARCH_DISCUSSIONS, { q: `%${term}%` });
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
      const { data, error: gqlError } = await nhost.graphql.request(LIST_DISCUSSIONS, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
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
      parts.length === 0 || parts.some((p) =>
        (d.title && d.title.toLowerCase().includes(p)) ||
        (d.description && d.description.toLowerCase().includes(p)) ||
        (d.is_anonymous && 'anonymous'.includes(p)) ||
        (d.contributor?.display_name && d.contributor.display_name.toLowerCase().includes(p)) ||
        (Array.isArray((d as any).tags) && (d as any).tags.some((tag: any) =>
          (typeof tag === 'string' && tag.toLowerCase().includes(p)) ||
          (tag?.name && typeof tag.name === 'string' && tag.name.toLowerCase().includes(p))
        ))
      )
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
      <input type="search" placeholder="Search topics..." bind:value={q} on:input={onSearchInput} on:keydown={(e)=> e.key==='Enter' && search()} />
      <button class="btn-primary" on:click={search}>Search</button>
    </div>
    <nav class="categories">
      {#each categories as c}
        <button
          class:active={c.key===activeCategory}
          on:click={() => activeCategory=c.key}
        >{c.label}</button>
      {/each}
    </nav>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <section class="results">
    {#if loading && (!discussions || discussions.length === 0)}
      <p class="hint">Loading discussions...</p>
    {:else if filtered && filtered.length > 0}
      {#each filtered as d}
        <div class="discussion-card" role="button" tabindex="0"
          on:click={() => goto(`/discussions/${d.id}`)}
          on:keydown={(e)=> e.key==='Enter' && goto(`/discussions/${d.id}`)}
        >
          <h3 class="discussion-title">{@html highlight(d.title, q)}</h3>
          {#if d.description}
            <p class="discussion-snippet">{@html highlight(d.description, q)}</p>
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
          <button class="btn-secondary" on:click={() => fetchAll(false)} disabled={loading}>Load more</button>
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
  .container { max-width: 900px; margin: 0 auto; padding: 1rem; }
  .header h1 { font-size: 1.5rem; margin: 0.25rem 0 0.75rem; }
  .search-row { display:flex; gap:0.5rem; }
  .search-row input { flex:1; padding:0.5rem 0.75rem; border:1px solid var(--color-border); border-radius: var(--border-radius-md); }
  .categories { display:flex; gap:0.5rem; margin-top:0.75rem; }
  .categories button { padding:0.25rem 0.5rem; border:1px solid var(--color-border); border-radius: 999px; background:var(--color-surface); cursor:pointer; }
  .categories button.active { background: var(--color-primary); color: var(--color-surface); border-color: var(--color-primary); }
  .results { display:flex; flex-direction:column; gap:1rem; margin-top: 1rem; }
  .load-more-row { display:flex; justify-content:center; margin-top: 0.5rem; }
  .discussion-card { background: var(--color-surface); border:1px solid var(--color-border); border-radius: var(--border-radius-md); padding:1rem; cursor:pointer; }
  .discussion-card:hover { box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); }
  .discussion-title { color: var(--color-primary); font-weight:600; }
  .discussion-snippet { color: var(--color-text-secondary); font-size:0.9rem; margin:0.25rem 0; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; text-overflow:ellipsis; line-clamp:2; }
  .discussion-meta { font-size:0.8rem; color:var(--color-text-secondary); }
  .anonymous-author { font-weight: 600; color: var(--color-text-primary); }
  :global(mark) { background: color-mix(in srgb, var(--color-primary) 25%, transparent); padding: 0 0.1em; border-radius: 2px; }
  /* back-link removed (nav provides dashboard access) */
  .hint { color: var(--color-text-secondary); margin-top: 1rem; }
  .error { color: var(--color-accent); }
  .btn-primary { background-color: var(--color-primary); color: var(--color-surface); border: none; border-radius: var(--border-radius-md); padding: 0.5rem 1rem; cursor: pointer; }
  .btn-secondary { background: var(--color-surface); color: var(--color-text-primary); border:1px solid var(--color-border); border-radius: var(--border-radius-md); padding:0.5rem 1rem; cursor:pointer; }
</style>
