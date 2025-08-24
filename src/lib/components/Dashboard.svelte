<script lang="ts">
  import type { User } from '@nhost/nhost-js';
  import { onMount } from 'svelte';
  // Avoid importing gql to prevent type resolution issues; use plain strings
  import { nhost } from '$lib/nhostClient';
  import { GET_DASHBOARD_DATA } from '$lib/graphql/queries';
  import { goto } from '$app/navigation';

  export let user: User;

  // Keep placeholder stats for now; can be backed by a view later
  const stats = {
    goodFaithRate: 88,
    sourceAccuracy: 95,
    reputationScore: 750
  };

  // Live data
  let myDiscussions: Array<{
    id: string;
    title: string;
    description?: string | null;
    created_at: string;
    contributor?: { id: string; display_name?: string | null } | null;
  }> = [];
  let repliedDiscussions: Array<{
    id: string;
    title: string;
    description?: string | null;
    created_at: string;
    contributor?: { id: string; display_name?: string | null } | null;
  }> = [];

  let drafts: Array<{
    id: string;
    draft_content?: string | null;
    discussion_id?: string | null;
    updated_at?: string | null;
    discussion_title?: string | null;
    status?: string | null;
  }> = [];

  let loading = true;
  let error: string | null = null;

  async function loadData() {
    loading = true;
    error = null;
    const { data, error: gqlError } = await nhost.graphql.request(GET_DASHBOARD_DATA, {
      userId: user.id as unknown as string
    });
    if (gqlError) {
      error = Array.isArray(gqlError)
        ? gqlError.map((e: any) => e.message ?? String(e)).join('; ')
        : ((gqlError as any).message ?? 'Failed to load data');
    } else if (data) {
      myDiscussions = data.myDiscussions ?? [];
      repliedDiscussions = data.repliedDiscussions ?? [];
      drafts = (data.myDrafts ?? []).map((draft: any) => ({
        id: draft.id,
        draft_content: draft.draft_content,
        discussion_id: draft.discussion_id,
        updated_at: draft.updated_at,
        discussion_title: draft.discussion?.title ?? null,
        status: draft.status
      }));
    }
    loading = false;
  }

  onMount(loadData);

  // Seed sample discussions and drafts for this user
  const SEED_DISCUSSIONS = `
    mutation SeedDiscussions($userId: uuid!) {
      insert_discussion(objects: [
        { title: "The role of AI in moderating online discourse", description: "Context, intent, and the limits of automated moderation.", created_by: $userId },
        { title: "Decentralized social media: pros and cons", description: "Balancing freedom with responsibility and safety.", created_by: $userId }
      ]) {
        returning { id }
      }
    }
  `;

  const SEED_DRAFTS = `
    mutation SeedDrafts($objects: [post_insert_input!]!) {
      insert_post(objects: $objects) { affected_rows }
    }
  `;

  async function seedSampleData() {
    const res1 = await nhost.graphql.request(SEED_DISCUSSIONS, { userId: user.id as unknown as string });
    if ((res1 as any).error) {
      error = (res1 as any).error.message || 'Failed to seed discussions';
      return;
    }
    const ids: string[] = (res1 as any).data?.insert_discussion?.returning?.map((r: { id: string }) => r.id) ?? [];

    if (!ids.length) {
      error = 'No discussions were created';
      return;
    }

    const draftObjects = [
      {
        author_id: user.id as unknown as string,
        discussion_id: ids[0],
        draft_content: 'I argue that while useful, it fails to account for rights and justice.',
        status: 'draft'
      },
      ids[1]
        ? {
            author_id: user.id as unknown as string,
            discussion_id: ids[1],
            draft_content: 'Algorithms can assist but must be guided by transparent community norms.',
            status: 'draft'
          }
        : null
    ].filter(Boolean) as any[];

    const res2 = await nhost.graphql.request(SEED_DRAFTS, { objects: draftObjects });
    if ((res2 as any).error) {
      error = (res2 as any).error.message || 'Failed to seed drafts';
      return;
    }

    await loadData();
  }

  function goToDraft(d: { id: string; discussion_id?: string | null }) {
    if (d.discussion_id) {
      goto(`/discussions/${d.discussion_id}?replyDraftId=${d.id}`);
    } else {
      goto(`/discussions/new?draftId=${d.id}`);
    }
  }

  function extractSnippet(html: string, max = 80) {
    if (!html) return 'Untitled draft';
    const txt = html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ') // remove tags
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ') // collapse whitespace
      .trim();
    if (!txt) return 'Untitled draft';
    return txt.length > max ? txt.slice(0, max) + '…' : txt;
  }

  const DELETE_DRAFT = `mutation DeleteDraft($id: uuid!, $authorId: uuid!) { delete_post(where:{id:{_eq:$id}, author_id:{_eq:$authorId}, status:{_eq:"draft"}}){ affected_rows } }`;

  async function deleteDraft(d: { id: string }) {
    if (!user) return;
    const ok = typeof window !== 'undefined' ? confirm('Delete this draft?') : true;
    if (!ok) return;
    const { error: delErr } = await nhost.graphql.request(DELETE_DRAFT, { id: d.id, authorId: user.id as unknown as string });
    if (delErr) {
      // simple inline fallback; could add toast later
      console.warn('Failed to delete draft', delErr);
      return;
    }
    drafts = drafts.filter(dr => dr.id !== d.id);
  }
</script>

<div class="dashboard-container">
  <!-- Welcome & At-a-Glance Metrics -->
  <section class="welcome-card">
    <div class="welcome-card-content">
        <h1 class="welcome-title">
          Welcome back, {user.displayName}!
        </h1>
        <div class="stats-container">
          <div class="stat-item">
            <h3 class="stat-title">Good-Faith Rate</h3>
            <p class="stat-value">{stats.goodFaithRate}%</p>
          </div>
          <div class="stat-item">
            <h3 class="stat-title">Source Accuracy</h3>
            <p class="stat-value">{stats.sourceAccuracy}%</p>
          </div>
          <div class="stat-item">
            <h3 class="stat-title">Reputation Score</h3>
            <p class="stat-value">{stats.reputationScore}</p>
          </div>
        </div>
    </div>
  </section>

  <!-- Main Content Grid -->
  <div class="dashboard-grid">
    <!-- Your Discussions (Left Column) -->
    <main class="main-content">
      <div class="header-row">
        <h2 class="section-title">Your Discussions</h2>
        <a class="btn-secondary" href="/discussions" style="margin-left:auto;">Browse all</a>
      </div>

      {#if loading}
        <p>Loading…</p>
      {:else if error}
        <p style="color: var(--color-accent)">{error}</p>
      {:else}
        {#if (myDiscussions.length + repliedDiscussions.length) === 0}
          <div class="card" style="margin-bottom: 1rem;">
            <p>No discussions yet.</p>
            <button class="btn-primary" on:click={seedSampleData} style="margin-top: 0.75rem;">Seed sample data</button>
          </div>
        {/if}

        {#if myDiscussions.length > 0}
          <h3 class="subsection-title">Started by you</h3>
          <div class="discussions-list">
            {#each myDiscussions as discussion}
              <div class="discussion-card" role="button" tabindex="0" on:click={() => goto(`/discussions/${discussion.id}`)} on:keydown={(e) => (e.key === 'Enter' ? goto(`/discussions/${discussion.id}`) : null)}>
                <h3 class="discussion-title">{discussion.title}</h3>
                {#if discussion.description}
                  <p class="discussion-snippet">{discussion.description}</p>
                {/if}
                <p class="discussion-meta">
                  {#if discussion.contributor?.display_name}
                    by {discussion.contributor.display_name}
                  {/if}
                  {#if discussion.created_at}
                    &middot; {new Date(discussion.created_at).toLocaleString()}
                  {/if}
                </p>
              </div>
            {/each}
          </div>
        {/if}

        {#if repliedDiscussions.length > 0}
          <h3 class="subsection-title">You replied to</h3>
          <div class="discussions-list">
            {#each repliedDiscussions as discussion}
              <div class="discussion-card" role="button" tabindex="0" on:click={() => goto(`/discussions/${discussion.id}`)} on:keydown={(e) => (e.key === 'Enter' ? goto(`/discussions/${discussion.id}`) : null)}>
                <h3 class="discussion-title">{discussion.title}</h3>
                {#if discussion.description}
                  <p class="discussion-snippet">{discussion.description}</p>
                {/if}
                <p class="discussion-meta">
                  {#if discussion.contributor?.display_name}
                    by {discussion.contributor.display_name}
                  {/if}
                  {#if discussion.created_at}
                    &middot; {new Date(discussion.created_at).toLocaleString()}
                  {/if}
                </p>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </main>

    <!-- Sidebar (Right Column) -->
    <!-- Replace "Your Drafts" list with live data -->
    <aside class="sidebar">
      <!-- Single Action: New Discussion -->
      <section class="card quick-discussion">
        <a href="/discussions/new" class="btn-primary full-width">
          <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          New Discussion
        </a>
      </section>

      <!-- Your Drafts -->
      <section class="card">
        <h2 class="section-title">Your Drafts</h2>
        {#if loading}
          <p>Loading…</p>
        {:else}
          {#if drafts.length === 0}
            <p>No drafts yet.</p>
          {:else}
            <ul class="list">
              {#each drafts as draft}
                <li class="list-item">
                  <div class="draft-row">
                    <div style="flex:1;">
                      <button type="button" class="draft-button" on:click={() => goToDraft(draft)} on:keydown={(e: KeyboardEvent)=> e.key==='Enter' && goToDraft(draft)}>
                        {extractSnippet(draft.draft_content || '')}
                      </button>
                      <div class="draft-meta" style="font-size:0.8em; color:var(--color-text-secondary); margin-top:2px; display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                        {#if draft.discussion_id}
                          <span>Reply draft</span>
                          {#if draft.discussion_title}
                            &nbsp;to <span style="font-weight:500; text-decoration:underline;">{draft.discussion_title}</span>
                          {/if}
                        {:else}
                          <span>Discussion draft</span>
                        {/if}
                        {#if draft.status === 'pending'}
                          <span class="pending-badge" title="Awaiting moderation / processing">Pending…</span>
                        {/if}
                      </div>
                    </div>
                    <button type="button" class="draft-delete" aria-label="Delete draft" title="Delete draft" on:click={() => deleteDraft(draft)}>&times;</button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
        <!-- Removed inline editor; navigation now handles drafting -->
      </section>

      <!-- Pinned Threads, Leaderboard, Notifications remain placeholders for now -->
      <!-- ...existing code... -->
    </aside>
  </div>

  <!-- Learning & Resources -->
  <footer class="dashboard-footer">
    <h2 class="section-title">Learning & Resources</h2>
    <div class="footer-links">
      <a href="/resources/good-faith-arguments">How to Craft Good-Faith Arguments</a>
      <a href="/resources/citation-best-practices">Citation Best Practices</a>
      <a href="/resources/community-guidelines">Community Guidelines</a>
    </div>
  </footer>
</div>

<style>
  .dashboard-container {
    padding: 1rem;
    max-width: 1280px;
    margin: 0 auto;
  }
  @media (min-width: 640px) {
    .dashboard-container {
      padding: 1.5rem;
    }
  }
  @media (min-width: 1024px) {
    .dashboard-container {
      padding: 2rem;
    }
  }

  /* Welcome Card */
  .welcome-card {
    background-color: var(--color-surface);
    padding: 1.25rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    margin-bottom: 2rem;
  }
  .welcome-card-content {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .welcome-title {
    font-size: 1.5rem;
    font-weight: 700;
    font-family: var(--font-family-display);
    color: var(--color-text-primary);
  }
  .stats-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .stat-item {
    padding: 0.75rem;
    border-radius: var(--border-radius-md);
    transition: background-color 150ms ease-in-out;
  }
  .stat-item:hover {
    background-color: var(--color-surface-alt);
  }
  .stat-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-secondary);
  }
  .stat-value {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  /* Grid */
  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
  }
  @media (min-width: 1024px) {
    .dashboard-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    .main-content {
      grid-column: span 2 / span 2;
    }
    .sidebar {
      grid-column: span 1 / span 1;
    }
  }
  .main-content {
    margin-bottom: 2rem;
  }
  @media (min-width: 1024px) {
    .main-content {
      margin-bottom: 0;
    }
  }
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* Cards */
  .card {
    background-color: var(--color-surface);
    padding: 1.25rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }
  .section-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1rem;
    font-family: var(--font-family-display);
    color: var(--color-text-primary);
  }

  /* Discussion List */
  .discussions-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .discussion-card {
    background-color: var(--color-surface);
    padding: 1.25rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    transition: box-shadow 150ms ease-in-out;
    cursor: pointer;
  }
  .discussion-card:hover {
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  }
  .discussion-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-primary);
  }
  .discussion-snippet {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    margin: 0.25rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  line-clamp: 2;
  }
  .discussion-meta {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  /* .load-more removed: no longer used */

  /* Sidebar Lists */
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    list-style: none;
    padding: 0;
  }
  .list-item {
    color: var(--color-primary);
    cursor: pointer;
  }
  .list-item:hover {
    text-decoration: underline;
  }

  /* Buttons */
  .btn-primary, .btn-secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius-md);
    transition: all 150ms ease-in-out;
    cursor: pointer;
    text-decoration: none;
  }
  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-surface);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }
  .btn-primary:hover {
    opacity: 0.9;
  }
  .btn-secondary {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }
  .btn-secondary:hover {
    background-color: var(--color-surface-alt);
  }
  .btn-primary:focus, .btn-secondary:focus {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  .btn-icon {
    width: 1.25rem;
    height: 1.25rem;
    margin-right: 0.5rem;
  }

  /* Footer */
  .dashboard-footer {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--color-border);
  }
  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
  }
  .footer-links a {
    color: var(--color-primary);
  }
  .footer-links a:hover {
    text-decoration: underline;
  }

  /* Draft Delete Button */
  .draft-row { display:flex; align-items:center; justify-content:space-between; gap:0.5rem; }
  .draft-meta {
    margin-left: 1rem;
    padding: 1rem;
  }
  .draft-button {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    color: var(--color-primary);
    cursor: pointer;
    font: inherit;
    text-align: left;
    padding: 0.5rem 1rem;
    transition: background-color 150ms, box-shadow 150ms;
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }
  .draft-button:hover, .draft-button:focus {
    background: var(--color-surface-alt);
    text-decoration: underline;
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  .draft-delete { background:none; border:none; color:var(--color-text-secondary); cursor:pointer; font-size:1rem; line-height:1; padding:0 0.25rem; border-radius:4px; }
  .draft-delete:hover, .draft-delete:focus { color:var(--color-accent); outline:none; }
  .pending-badge { background: color-mix(in srgb, var(--color-accent) 18%, transparent); color: var(--color-accent); padding:2px 6px; border-radius: 999px; font-size:0.6rem; font-weight:600; letter-spacing:0.5px; border:1px solid color-mix(in srgb, var(--color-accent) 55%, transparent); }
</style>
