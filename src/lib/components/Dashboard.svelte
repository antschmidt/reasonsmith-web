<script lang="ts">
  import type { User } from '@nhost/nhost-js';
  import { onMount } from 'svelte';
  // Avoid importing gql to prevent type resolution issues; use plain strings
  import { nhost } from '$lib/nhostClient';
  import { GET_DASHBOARD_DATA, CREATE_POST_DRAFT } from '$lib/graphql/queries';
  import { goto } from '$app/navigation';
  import Editor from '$lib/Editor.svelte';

  export let user: User;

  // Keep placeholder stats for now; can be backed by a view later
  const stats = {
    goodFaithRate: 88,
    sourceAccuracy: 95,
    reputationScore: 750
  };

  // Live data
  let recentDiscussions: Array<{
    id: string;
    title: string;
    description?: string | null;
    created_at: string;
    creator?: { id: string; display_name?: string | null } | null;
  }> = [];

  let drafts: Array<{
    id: string;
    draft_content?: string | null;
    discussion_id?: string | null;
    updated_at?: string | null;
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
      error = gqlError.message || 'Failed to load data';
    } else if (data) {
      recentDiscussions = data.recentDiscussions ?? [];
      drafts = data.myDrafts ?? [];
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

  let activeDraftId: string | null = null;
  let activeDraftContent = '';
  function openDraft(d: { id: string; draft_content?: string | null }) {
    activeDraftId = d.id;
    activeDraftContent = d.draft_content || '';
  }

  let newDraftLoading = false;
  async function createNewDraft() {
    if (newDraftLoading) return;
    const userObj = nhost.auth.getUser();
    if (!userObj) { error = 'Not authenticated'; return; }
    if (!recentDiscussions.length) {
      error = 'Create or seed a discussion first.';
      return;
    }
    newDraftLoading = true;
    error = null;
    const discussionId = recentDiscussions[0].id; // simple heuristic; later allow selection
    const { data, error: draftErr } = await nhost.graphql.request(CREATE_POST_DRAFT, {
      discussionId,
      authorId: userObj.id,
      draftContent: ''
    });
    if (draftErr) {
      error = draftErr.message || 'Failed to create draft';
      newDraftLoading = false;
      return;
    }
    const newId = (data as any)?.insert_post_one?.id;
    if (newId) {
      const draftObj = { id: newId, draft_content: '', discussion_id: discussionId, updated_at: new Date().toISOString() };
      drafts = [draftObj, ...drafts];
      openDraft(draftObj);
    }
    newDraftLoading = false;
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
    <!-- Recent & Pinned Discussions (Left Column) -->
    <main class="main-content">
      <h2 class="section-title">Recent Discussions</h2>

      {#if loading}
        <p>Loading…</p>
      {:else if error}
        <p style="color: var(--color-accent)">{error}</p>
      {:else}
        {#if recentDiscussions.length === 0}
          <div class="card" style="margin-bottom: 1rem;">
            <p>No discussions yet.</p>
            <button class="btn-primary" on:click={seedSampleData} style="margin-top: 0.75rem;">Seed sample data</button>
          </div>
        {/if}

        <div class="discussions-list">
          {#each recentDiscussions as discussion}
            <div class="discussion-card" role="button" tabindex="0" on:click={() => goto(`/discussions/${discussion.id}`)} on:keydown={(e) => (e.key === 'Enter' ? goto(`/discussions/${discussion.id}`) : null)}>
              <h3 class="discussion-title">{discussion.title}</h3>
              {#if discussion.description}
                <p class="discussion-snippet">{discussion.description}</p>
              {/if}
              <p class="discussion-meta">
                {#if discussion.creator?.display_name}
                  by {discussion.creator.display_name}
                {/if}
                
                {#if discussion.created_at}
                  &middot; {new Date(discussion.created_at).toLocaleString()}
                {/if}
              </p>
            </div>
          {/each}
        </div>
        <button class="btn-secondary load-more">Load More</button>
      {/if}
    </main>

    <!-- Sidebar (Right Column) -->
    <!-- Replace "Your Drafts" list with live data -->
    <aside class="sidebar">
      <!-- Quick Actions -->
      <section class="card">
        <h2 class="section-title">Quick Actions</h2>
        <div class="quick-actions">
          <a href="/discussions/new" class="btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
            New Discussion
          </a>
          <button class="btn-secondary" on:click={createNewDraft} disabled={newDraftLoading}>
            {#if newDraftLoading}
              Creating…
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
              New Draft
            {/if}
          </button>
          <button class="btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
            New Reply
          </button>
          <button class="btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 11a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1v-1z" /></svg>
            Invite Collaborator
          </button>
        </div>
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
                  <button type="button" class="draft-button" on:click={() => openDraft(draft)} on:keydown={(e)=> e.key==='Enter' && openDraft(draft)}>{extractSnippet(draft.draft_content || '')}</button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
        {#if activeDraftId}
          <div class="editor-wrapper">
            <h3 class="editor-title">Editing Draft</h3>
            <Editor postId={activeDraftId} content={activeDraftContent} on:saved={(e)=>{/* could surface toast */}} onUpdate={(html)=> activeDraftContent = html} />
            <p class="hint">Autosaves locally & to server.</p>
          </div>
        {/if}
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
  }
  .discussion-meta {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  .load-more {
    margin-top: 1.5rem;
    width: 100%;
  }

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
  .leaderboard-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .leaderboard-score {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }
  .current-rank {
    margin-top: 1rem;
    text-align: center;
    background-color: var(--color-surface-alt);
    padding: 0.5rem;
    border-radius: var(--border-radius-md);
    font-size: 0.875rem;
  }
  .notification-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    font-size: 0.875rem;
  }
  .notification-icon {
    margin-top: 0.25rem;
    color: var(--color-accent);
  }
  .notification-icon svg {
      width: 1.25rem;
      height: 1.25rem;
  }

  /* Quick Actions */
  .quick-actions {
    display: inline-flex;
    flex-direction: column;
    gap: 1rem;
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

  .editor-wrapper { margin-top:1rem; padding-top:1rem; border-top:1px solid var(--color-border); }
  .editor-title { font-size:0.85rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 0.5rem; color: var(--color-text-secondary); }
  .hint { font-size:0.65rem; color: var(--color-text-secondary); margin-top:0.35rem; }

  .draft-button { background:none; border:none; padding:0; margin:0; color: var(--color-primary); cursor:pointer; font: inherit; text-align:left; }
  .draft-button:hover, .draft-button:focus { text-decoration:underline; outline:none; }
</style>
