<script lang="ts">
  import { nhost } from '$lib/nhostClient';
  import { onMount } from 'svelte';

  let loading = true;
  let error: string | null = null;
  let slides: Array<{
    id: string;
    discussion_id: string;
    discussion_title: string;
    content_html: string;
    author_name: string;
    author_id: string;
    author_handle?: string | null;
    good_faith_score: number | null;
    good_faith_label?: string | null;
    comments_count: number;
    created_at: string;
  }> = [];

  const QUERY = `
    query TopPosts($limit: Int = 25) {
      post(
        where: { status: { _eq: "approved" } }
        order_by: [{ good_faith_score: desc_nulls_last }, { created_at: desc }]
        limit: $limit
      ) {
        id
        content
        created_at
        good_faith_score
        good_faith_label
        discussion { id title posts_aggregate { aggregate { count } } }
        contributor { id handle display_name }
      }
    }
  `;

  function toTextSnippet(html: string, max = 180): string {
    if (!html) return '';
    const cleaned = html
      .replace(/<!--\s*CITATION_DATA:[\s\S]*?-->/gi, ' ')
      .replace(/<!--\s*REPLY_TO:[\s\S]*?-->/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
  }

  function displayName(name?: string | null): string {
    if (!name) return '';
    const n = String(name).trim();
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n);
    if (isEmail) return n.split('@')[0];
    return n;
  }

  function rankScore(s: { good_faith_score: number | null; comments_count: number; created_at: string }) {
    const gf = (s.good_faith_score ?? 0) * 100; // 0-100
    const comments = s.comments_count;
    const recencyBoost = Math.max(0, 30 - Math.min(30, (Date.now() - new Date(s.created_at).getTime()) / (1000*60*60*24))); // up to 30 points for recency
    return gf * 1.0 + comments * 3 + recencyBoost;
  }

  onMount(async () => {
    loading = true; error = null;
    try {
      // Ensure auth init for role header (even for anon)
      try { await nhost.auth.isAuthenticatedAsync(); } catch {}
      const { data, error: gqlError } = await nhost.graphql.request(QUERY, { limit: 25 });
      if (gqlError) throw (Array.isArray(gqlError) ? new Error(gqlError.map((e:any)=>e.message).join('; ')) : gqlError);
      const rows = (data as any)?.post ?? [];
      const mapped = rows.map((p: any) => ({
        id: p.id,
        discussion_id: p.discussion?.id,
        discussion_title: p.discussion?.title || 'Discussion',
        content_html: toTextSnippet(p.content || ''),
        author_name: displayName(p.contributor?.display_name),
        author_id: p.contributor?.id,
        author_handle: p.contributor?.handle,
        good_faith_score: p.good_faith_score,
        good_faith_label: p.good_faith_label,
        comments_count: p.discussion?.posts_aggregate?.aggregate?.count ?? 0,
        created_at: p.created_at
      }));
      // Sort by combined rank and take top 10
      slides = mapped.sort((a,b) => rankScore(b) - rankScore(a)).slice(0, 10);
    } catch (e:any) {
      const msg = e?.message || String(e);
      if (/field\s+'?post'?\s+not\s+found\s+in\s+type/i.test(msg)) {
        error = 'Top posts are not publicly available.';
      } else {
        error = msg;
      }
    } finally { loading = false; }
  });

  // Carousel state
  let index = 0;
  let timer: any = null;
  const interval = 6000;

  function startTimer() {
    stopTimer();
    timer = setInterval(() => { next(); }, interval);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function next() { index = (index + 1) % (slides.length || 1); }
  function prev() { index = (index - 1 + (slides.length || 1)) % (slides.length || 1); }

  $: if (!loading && slides.length > 1) startTimer();
</script>

<!-- <div class="top-posts">
  <h2 class="title">Featured Top Posts</h2>
  {#if loading}
    <div class="hint">Loading top posts…</div>
  {:else if error}
    <div class="hint">{error}</div>
  {:else if slides.length === 0}
    <div class="hint">No posts to show yet.</div>
  {:else}
    <div class="carousel" on:mouseenter={stopTimer} on:mouseleave={startTimer}>
      {#each slides as s, i}
        <a class="slide" class:active={i===index} href={`/discussions/${s.discussion_id}`} tabindex={i===index ? 0 : -1} aria-hidden={i===index ? 'false' : 'true'}>
          <div class="slide-header">
            <div class="discussion-title">{s.discussion_title}</div>
            {#if s.good_faith_score != null}
              <div class="gf-pill {s.good_faith_label}">
                <span class="score">{(s.good_faith_score * 100).toFixed(0)}%</span>
                <span class="label">{s.good_faith_label}</span>
              </div>
            {/if}
          </div>
          <div class="excerpt">{s.content_html}</div>
          <div class="meta">
            <span>by <span class="author">{s.author_name}</span></span>
            <span>·</span>
            <span>{s.comments_count} comments</span>
            <span>·</span>
            <time>{new Date(s.created_at).toLocaleDateString()}</time>
          </div>
        </a>
      {/each}
      {#if slides.length > 1}
        <button class="nav prev" on:click|stopPropagation={prev} aria-label="Previous">‹</button>
        <button class="nav next" on:click|stopPropagation={next} aria-label="Next">›</button>
        <div class="dots">
          {#each slides as _s, d}
            <button class="dot" class:active={d===index} on:click={() => index=d} aria-label={`Go to slide ${d+1}`}></button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div> -->

<style>
  .top-posts { margin-top: 2rem; }
  .title { margin: 0 0 0.75rem; font-size: 1.25rem; }
  .hint { color: var(--color-text-secondary); }
  .carousel { position: relative; overflow: hidden; min-height: 140px; }
  .slide { position: absolute; inset: 0; opacity: 0; transform: translateX(8%); transition: opacity .35s ease, transform .35s ease; display:block; background: var(--color-surface); border:1px solid var(--color-border); border-radius: var(--border-radius-md); padding: 1rem; text-decoration: none; color: inherit; }
  .slide.active { opacity: 1; transform: translateX(0); }
  .slide-header { display:flex; align-items:center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.35rem; }
  .discussion-title { font-weight: 600; color: var(--color-primary); }
  .excerpt { color: var(--color-text-primary); line-height: 1.45; margin: 0.35rem 0 0.5rem; }
  .meta { display:flex; gap:0.35rem; color: var(--color-text-secondary); font-size: 0.85rem; }
  .author { font-weight: 600; }
  .gf-pill { display:inline-flex; align-items:center; gap:0.35rem; padding: 0.15rem 0.4rem; border-radius: 999px; border:1px solid var(--color-border); font-size: 0.8rem; }
  .gf-pill .score { font-weight: 700; }
  .nav { position:absolute; top: 50%; transform: translateY(-50%); background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-primary); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display:flex; align-items:center; justify-content:center; }
  .nav.prev { left: 8px; }
  .nav.next { right: 8px; }
  .dots { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); display:flex; gap:6px; }
  .dot { width:8px; height:8px; border-radius:50%; background: var(--color-border); border:none; cursor:pointer; }
  .dot.active { background: var(--color-primary); }
</style>

