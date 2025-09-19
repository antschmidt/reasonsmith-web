<script lang="ts">
  import type { User } from '@nhost/nhost-js';
  import { onMount } from 'svelte';
  // Avoid importing gql to prevent type resolution issues; use plain strings
  import { nhost } from '$lib/nhostClient';
  import { GET_DASHBOARD_DATA, GET_USER_STATS } from '$lib/graphql/queries';
  import { goto } from '$app/navigation';
  import { calculateUserStats, type UserStats } from '$lib/utils/userStats';

  export let user: User;

  // Real user statistics
  let stats: UserStats = {
    goodFaithRate: 0,
    sourceAccuracy: 0,
    reputationScore: 0,
    totalPosts: 0,
    totalDiscussions: 0,
    participatedDiscussions: 0
  };
  let statsLoading = true;

  type DashboardDiscussion = {
    id: string;
    title: string;
    description?: string | null;
    created_at: string;
    is_anonymous?: boolean | null;
    contributor?: { id: string; handle?: string | null; display_name?: string | null } | null;
  };

  // Live data
  let myDiscussions: DashboardDiscussion[] = [];
  let repliedDiscussions: DashboardDiscussion[] = [];

  let drafts: Array<{
    id: string;
    draft_content?: string | null;
    discussion_id?: string | null;
    updated_at?: string | null;
    discussion_title?: string | null;
    status?: string | null;
    type?: string;
    original_discussion_id?: string;
    good_faith_score?: number | null;
    good_faith_label?: string | null;
    good_faith_last_evaluated?: string | null;
    good_faith_analysis?: any;
  }> = [];

  let loading = true;
  let error: string | null = null;

  async function loadData() {
    loading = true;
    statsLoading = true;
    error = null;
    
    try {
      // Load dashboard data and user stats in parallel
      const [dashboardResult, statsResult] = await Promise.all([
        nhost.graphql.request(GET_DASHBOARD_DATA, {
          userId: user.id as unknown as string
        }),
        nhost.graphql.request(GET_USER_STATS, {
          userId: user.id as unknown as string
        })
      ]);

      // Handle dashboard data
      if (dashboardResult.error) {
        error = Array.isArray(dashboardResult.error)
          ? dashboardResult.error.map((e: any) => e.message ?? String(e)).join('; ')
          : ((dashboardResult.error as any).message ?? 'Failed to load dashboard data');
      } else if (dashboardResult.data) {
        myDiscussions = dashboardResult.data.myDiscussions ?? [];
        repliedDiscussions = dashboardResult.data.repliedDiscussions ?? [];
        
        // Get database drafts (comment drafts)
        const dbDrafts = (dashboardResult.data.myDrafts ?? []).map((draft: any) => ({
          id: draft.id,
          draft_content: draft.draft_content,
          discussion_id: draft.discussion_id,
          updated_at: draft.updated_at,
          discussion_title: draft.discussion?.title ?? null,
          status: draft.status,
          type: 'comment',
          good_faith_score: draft.good_faith_score,
          good_faith_label: draft.good_faith_label,
          good_faith_last_evaluated: draft.good_faith_last_evaluated,
          good_faith_analysis: draft.good_faith_analysis
        }));
        
        // Get discussion description drafts from localStorage
        const discussionDrafts = getDiscussionDraftsFromLocalStorage();
        
        // Combine both types of drafts
        drafts = [...dbDrafts, ...discussionDrafts].sort((a, b) => {
          const dateA = new Date(a.updated_at || 0).getTime();
          const dateB = new Date(b.updated_at || 0).getTime();
          return dateB - dateA; // Most recent first
        });
      }

      // Handle user stats
      if (statsResult.error) {
        console.warn('Failed to load user stats:', statsResult.error);
        // Keep default stats values
      } else if (statsResult.data) {
        stats = calculateUserStats(statsResult.data);
      }
      
    } catch (err) {
      error = `Failed to load data: ${err}`;
      console.error('Error loading dashboard data:', err);
    }
    
    loading = false;
    statsLoading = false;
  }

  function getDiscussionDraftsFromLocalStorage() {
    if (typeof localStorage === 'undefined') return [];
    
    const discussionDrafts: any[] = [];
    
    // Check localStorage for discussion drafts for discussions created by this user
    myDiscussions.forEach(discussion => {
      const draftKey = `discussion_draft:${discussion.id}`;
      const draftData = localStorage.getItem(draftKey);
      
      if (draftData) {
        try {
          const draft = JSON.parse(draftData);
          discussionDrafts.push({
            id: `discussion_${discussion.id}`, // Unique ID for UI
            draft_content: `${draft.title}\n\n${draft.description}`,
            discussion_id: null, // This is the discussion itself, not a comment
            updated_at: new Date(draft.lastSaved).toISOString(),
            discussion_title: draft.title,
            status: 'draft',
            type: 'discussion',
            original_discussion_id: discussion.id // Keep reference to original discussion
          });
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    });
    
    return discussionDrafts;
  }

  onMount(loadData);



  function getDraftHref(d: { id: string; discussion_id?: string | null; type?: string; original_discussion_id?: string }) {
    if (d.type === 'discussion' && d.original_discussion_id) {
      return `/discussions/${d.original_discussion_id}`;
    } else if (d.discussion_id) {
      return `/discussions/${d.discussion_id}?replyDraftId=${d.id}`;
    } else {
      return `/discussions/new?draftId=${d.id}`;
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

  async function deleteDraft(d: { id: string; type?: string; original_discussion_id?: string }) {
    if (!user) return;
    const ok = typeof window !== 'undefined' ? confirm('Delete this draft?') : true;
    if (!ok) return;
    
    if (d.type === 'discussion' && d.original_discussion_id) {
      // Delete discussion description draft from localStorage
      const draftKey = `discussion_draft:${d.original_discussion_id}`;
      localStorage.removeItem(draftKey);
      drafts = drafts.filter(dr => dr.id !== d.id);
    } else {
      // Delete comment draft from database
      const { error: delErr } = await nhost.graphql.request(DELETE_DRAFT, { id: d.id, authorId: user.id as unknown as string });
      if (delErr) {
        // simple inline fallback; could add toast later
        console.warn('Failed to delete draft', delErr);
        return;
      }
      drafts = drafts.filter(dr => dr.id !== d.id);
    }
  }
  
  // Prefer a human-friendly display over raw email-like strings
  function displayName(name?: string | null): string {
    if (!name) return '';
    const n = String(name).trim();
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n);
    if (isEmail) return n.split('@')[0];
    return n;
  }

  function authorLabel(discussion: DashboardDiscussion, isOwner = false): string {
    if (discussion.is_anonymous) {
      return isOwner ? 'by You (anonymous to others)' : 'by Anonymous';
    }
    if (discussion.contributor?.display_name) {
      return `by ${displayName(discussion.contributor.display_name)}`;
    }
    return isOwner ? 'by You' : '';
  }
</script>

<div class="dashboard-container">

  <!-- Main Content Grid -->
  <div class="dashboard-grid">
        <!-- Sidebar (Right Column) -->
    <!-- Replace "Your Drafts" list with live data -->
    <aside class="sidebar">
      <!-- Stats Section -->
      <section class="card stats-section">
        <div class="stats-container">
          <div class="stat-item">
            <h3 class="stat-title">Good-Faith Rate</h3>
            <p class="stat-value">
              {#if statsLoading}
                <span class="loading-text">...</span>
              {:else}
                {stats.goodFaithRate}%
              {/if}
            </p>
          </div>
          <div class="stat-item">
            <h3 class="stat-title">Source Accuracy</h3>
            <p class="stat-value">
              {#if statsLoading}
                <span class="loading-text">...</span>
              {:else}
                {stats.sourceAccuracy}%
              {/if}
            </p>
          </div>
          <div class="stat-item">
            <h3 class="stat-title">Reputation Score</h3>
            <p class="stat-value">
              {#if statsLoading}
                <span class="loading-text">...</span>
              {:else}
                {stats.reputationScore.toLocaleString()}
              {/if}
            </p>
          </div>
        </div>
      </section>

      <!-- Single Action: New Discussion -->
      <section class="card quick-discussion">
        <a href="/discussions/new" class="btn-primary full-width">
          <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          New Discussion
        </a>
      </section>

      <!-- Your Drafts -->
      <section class="card">
        <h2 class="section-title">Drafts</h2>
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
                    <div>
                      <a href="{getDraftHref(draft)}" class="draft-button">
                        {extractSnippet(draft.draft_content || '')}
                      </a>
                      <div class="draft-meta" style="font-size:0.8em; color:var(--color-text-secondary); margin-top:2px; display:flex; flex-wrap:wrap; align-items:center;">
                        {#if draft.type === 'discussion'}
                          <span>Discussion description draft</span>
                          {#if draft.discussion_title}
                            &nbsp;for <span class="discussion-title">{draft.discussion_title}</span>
                          {/if}
                        {:else if draft.discussion_id}
                          <span>Reply draft</span>
                          {#if draft.discussion_title}
                            &nbsp;to&nbsp;<span class="discussion-title">{draft.discussion_title}</span>
                          {/if}
                        {:else}
                          <span>Discussion draft</span>
                        {/if}
                        {#if draft.status === 'pending'}
                          <span class="pending-badge" title="Awaiting moderation / processing">Pending…</span>
                        {/if}
                      </div>
                      
                      <!-- Good Faith Analysis Display -->
                      {#if draft.good_faith_score !== null && draft.good_faith_score !== undefined}
                        <div class="draft-analysis" style="margin-top:4px;">
                          <div class="good-faith-pill {draft.good_faith_label || 'neutral'}" title="Good faith score: {(draft.good_faith_score * 100).toFixed(0)}%">
                            <span class="gf-score">{(draft.good_faith_score * 100).toFixed(0)}%</span>
                            <span class="gf-label">{draft.good_faith_label || 'unrated'}</span>
                          </div>
                          {#if draft.good_faith_last_evaluated}
                            <span class="analysis-date" style="font-size:0.7em; color:var(--color-text-secondary); margin-left:6px;">
                              Analyzed {new Date(draft.good_faith_last_evaluated).toLocaleDateString()}
                            </span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                    <button type="button" class="draft-delete" aria-label="Delete draft" title="Delete draft" on:click={() => deleteDraft(draft)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m5,6 1,14 c0,1 1,2 2,2 h8 c1,0 2,-1 2,-2 l1,-14"></path>
                        <path d="m10,11 v6"></path>
                        <path d="m14,11 v6"></path>
                        <path d="M7,6V4c0-1,1-2,2-2h6c0,1,1,2h-2V6"></path>
                      </svg>
                    </button>
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
    <!-- Your Discussions (Left Column) -->
    <main class="main-content">
      {#if loading}
        <p>Loading…</p>
      {:else if error}
        <p style="color: var(--color-accent)">{error}</p>
      {:else}
        {#if (myDiscussions.length + repliedDiscussions.length) === 0}
          <div class="card" style="margin-bottom: 1rem;">
            <p>No discussions yet.</p>

          </div>
        {/if}

        {#if myDiscussions.length > 0}
          <div class="discussions-list">
            <h3 class="subsection-title">Discussions</h3>
            {#each myDiscussions as discussion}
              {@const label = authorLabel(discussion, true)}
              <div class="discussion-card" role="button" tabindex="0" on:click={() => goto(`/discussions/${discussion.id}`)} on:keydown={(e) => (e.key === 'Enter' ? goto(`/discussions/${discussion.id}`) : null)}>
                <h3 class="discussion-title">{discussion.title}</h3>
                {#if discussion.description}
                  <p class="discussion-snippet">{discussion.description}</p>
                {/if}
                <p class="discussion-meta">
                  {#if label}
                    <span class:anonymous-author={discussion.is_anonymous}>{label}</span>
                  {/if}
                  {#if discussion.created_at}
                    {#if label}
                      <span class="dot-separator" aria-hidden="true">·</span>
                    {/if}
                    <span>{new Date(discussion.created_at).toLocaleString()}</span>
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
              {@const label = authorLabel(discussion, false)}
              <div class="discussion-card" role="button" tabindex="0" on:click={() => goto(`/discussions/${discussion.id}`)} on:keydown={(e) => (e.key === 'Enter' ? goto(`/discussions/${discussion.id}`) : null)}>
                <h3 class="discussion-title">{discussion.title}</h3>
                {#if discussion.description}
                  <p class="discussion-snippet">{discussion.description}</p>
                {/if}
                <p class="discussion-meta">
                  {#if label}
                    <span class:anonymous-author={discussion.is_anonymous}>{label}</span>
                  {/if}
                  {#if discussion.created_at}
                    {#if label}
                      <span class="dot-separator" aria-hidden="true">·</span>
                    {/if}
                    <span>{new Date(discussion.created_at).toLocaleString()}</span>
                  {/if}
                </p>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </main>
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

  /* Stats Section */
  .stats-container {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .stat-item {
    padding: 0.5rem;
    border-radius: var(--border-radius-sm);
    transition: background-color 150ms ease-in-out;
    background-color: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    text-align: center;
    flex: 1;
    min-width: 0;
  }
  .stat-item:hover {
    background-color: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface-alt));
  }
  .stat-title {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    margin: 0 0 0.25rem 0;
    line-height: 1.2;
  }
  .stat-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
    line-height: 1.2;
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
  }

  /* Cards */
  .card {
    /* background-color: var(--color-surface); */
    padding: 0.5rem;
    border-radius: var(--border-radius-md);
    border: 0px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }
  .section-title {
    text-align: center;;
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0rem;
    font-family: var(--font-family-display);
    color: var(--color-text-primary);
  }

  /* Discussion List */
  .discussions-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
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
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .discussion-meta .dot-separator {
    color: var(--color-text-secondary);
  }
  .discussion-meta .anonymous-author {
    font-weight: 600;
    color: var(--color-text-primary);
  }
  /* .load-more removed: no longer used */

  /* Sidebar Lists */
  .list {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    list-style: none;
    padding: 0;
    flex-wrap: wrap;
  }
  .list-item {
    color: var(--color-primary);
    cursor: pointer;
    max-width: 15rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    padding: 0.5rem;
  }

  .discussion-title {
    font-weight: 600;
  }
  .list-item:hover {
    background-color: var(--color-surface-alt);
  }

  /* Buttons */
  .btn-primary {
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

  .btn-primary:focus {
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
    text-align: center;
    flex-wrap: wrap;
    flex-direction: column;
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
    padding: 0.5rem 0 0.5rem 0;
  }
  .draft-button {
    border: none;
    border-radius: var(--border-radius-md);
    color: var(--color-primary);
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: background-color 150ms, box-shadow 150ms;
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    text-decoration: none;
    display: block;
    width: 100%;
  }
  .draft-button:hover, .draft-button:focus {
    background: var(--color-surface-alt);
    text-decoration: underline;
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  .draft-delete { 
    background: none; 
    border: none; 
    color: var(--color-text-secondary); 
    cursor: pointer; 
    padding: 0.25rem; 
    border-radius: 4px; 
    display: flex; 
    align-items: center; 
    justify-content: center;
    transition: color 0.2s ease;
  }
  .draft-delete:hover, .draft-delete:focus { 
    color: var(--color-accent); 
    outline: none; 
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  }
  .draft-delete svg {
    width: 24px;
    height: 24px;
  }
  .pending-badge { background: color-mix(in srgb, var(--color-accent) 18%, transparent); color: var(--color-accent); padding:2px 6px; border-radius: 999px; font-size:0.6rem; font-weight:600; letter-spacing:0.5px; border:1px solid color-mix(in srgb, var(--color-accent) 55%, transparent); }
  
  /* Good Faith Analysis Display */
  .draft-analysis {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .good-faith-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 600;
    border: 1px solid;
    white-space: nowrap;
  }
  
  .good-faith-pill.hostile {
    background: color-mix(in srgb, #dc2626 15%, transparent);
    color: #dc2626;
    border-color: color-mix(in srgb, #dc2626 30%, transparent);
  }
  
  .good-faith-pill.questionable {
    background: color-mix(in srgb, #ea580c 15%, transparent);
    color: #ea580c;
    border-color: color-mix(in srgb, #ea580c 30%, transparent);
  }
  
  .good-faith-pill.neutral {
    background: color-mix(in srgb, #6b7280 15%, transparent);
    color: #6b7280;
    border-color: color-mix(in srgb, #6b7280 30%, transparent);
  }
  
  .good-faith-pill.constructive {
    background: color-mix(in srgb, #059669 15%, transparent);
    color: #059669;
    border-color: color-mix(in srgb, #059669 30%, transparent);
  }
  
  .good-faith-pill.exemplary {
    background: color-mix(in srgb, #0284c7 15%, transparent);
    color: #0284c7;
    border-color: color-mix(in srgb, #0284c7 30%, transparent);
  }
  
  .gf-score {
    font-weight: 700;
  }
  
  .gf-label {
    font-weight: 500;
    text-transform: capitalize;
  }
  
  .analysis-date {
    opacity: 0.8;
  }

  /* Loading text for stats */
  .loading-text {
    color: var(--color-text-secondary);
    font-weight: 400;
  }

    /* Nuclear approach - override ALL link colors in dark mode */
  :global([data-theme="dark"] a),
  :global([data-theme="dark"] a:link),
  :global([data-theme="dark"] a:visited),
  :global([data-theme="dark"] a:hover),
  :global([data-theme="dark"] a:active),
  :global([data-theme="dark"] a:focus),
  :global([data-theme="dark"] a:focus-visible) {
    color: #a9c8ff;
  }
</style>
