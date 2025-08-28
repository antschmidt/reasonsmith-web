<script lang="ts">
  import { page } from '$app/stores';
  // Avoid importing gql to prevent type resolution issues; use plain string
  import { nhost } from '$lib/nhostClient';
  import { onMount } from 'svelte';
  import { CREATE_POST_DRAFT } from '$lib/graphql/queries';
  import { createDraftAutosaver, type DraftAutosaver } from '$lib';

  let discussion: any = null;
  let loading = true;
  let error: Error | null = null;
  let authReady = false;

  // New comment form state
  let newComment = '';
  let submitting = false;
  let submitError: string | null = null;
  let user = nhost.auth.getUser();
  nhost.auth.onAuthStateChanged(() => { 
    user = nhost.auth.getUser(); 
    authReady = true;
  });

  let draftPostId: string | null = null;
  let draftAutosaver: DraftAutosaver | null = null;
  let draftLoaded = false; // prevents duplicate fetch
  let lastSavedAt: number | null = null;
  let hasPending = false;
  let focusReplyOnMount = false;
  // Good-Faith scoring state
  let gfScore: number | null = null;
  let gfLabel: string | null = null;
  let gfLoading = false;
  let gfError: string | null = null;
  const GOOD_FAITH_THRESHOLD = 0.6; // provisional threshold
  let lastScoredContent = '';

  async function scoreGoodFaith() {
    if (!newComment.trim()) { gfScore = null; gfLabel = null; return; }
    const content = newComment;
    if (content === lastScoredContent) return; // unchanged since last scoring
    lastScoredContent = content;
    gfLoading = true; gfError = null;
    try {
      let payload: any = { content };
      if (draftPostId) {
        // Persist score to draft row but DO NOT auto-approve while user is still editing.
        payload.post_id = draftPostId;
        payload.persist = true;
      }
      let res: any; let error: any;
      try {
        const r = await nhost.functions.call('goodFaithScore', payload);
        res = r.res; error = r.error;
      } catch (e: any) {
        error = e;
      }
      if (error) {
        // Attempt manual fallback paths (some environments differ in path prefix)
        const pubEnv: any = (globalThis as any).env || {};
        const sub = pubEnv?.PUBLIC_NHOST_SUBDOMAIN;
        const region = pubEnv?.PUBLIC_NHOST_REGION;
        if (sub && region) {
          const base = `https://${sub}.functions.${region}.nhost.run`;
          const paths = ['/v1/functions/goodFaithScore', '/v1/goodFaithScore'];
          let success = false;
            for (const p of paths) {
              try {
                const resp = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (resp.ok) { res = await resp.json(); success = true; break; }
              } catch (e2) { /* continue */ }
            }
          if (!success) throw error;
        } else {
          throw error;
        }
      }
      if (!res) throw new Error('No response from goodFaithScore');
      gfScore = typeof (res as any).good_faith_score === 'number' ? (res as any).good_faith_score : null;
      gfLabel = (res as any).good_faith_label || null;
    } catch (e: any) {
      gfError = e.message || 'Scoring failed';
      gfScore = null; gfLabel = null;
    } finally { gfLoading = false; }
  }

  // Removed auto-debounce scoring; scoring now only occurs when user clicks button (first submit attempt).

  const GET_DISCUSSION_DETAILS = `
    query GetDiscussionDetails($discussionId: uuid!) {
      discussion(where: { id: { _eq: $discussionId } }) {
        id
        title
        description
        current_version_id
        # current_version: discussion_version(where: {id: {_eq: current_version_id}}) @skip(if: true) # placeholder - disabled
        created_at
        contributor { id display_name }
        posts(where: { status: { _eq: "approved" } }, order_by: { created_at: asc }) {
          id
          content
          created_at
          context_version_id
          contributor { id display_name }
        }
      }
    }
  `;

  const ADD_POST = `
    mutation AddPost($discussionId: uuid!, $authorId: uuid!, $content: String!) {
      insert_post_one(
        object: { discussion_id: $discussionId, author_id: $authorId, content: $content, status: "approved" }
      ) {
        id
        content
        created_at
        contributor { id display_name }
      }
    }
  `;

  const GET_EXISTING_DRAFT = `
    query GetExistingDraft($discussionId: uuid!, $authorId: uuid!) {
      post(where: {discussion_id: {_eq: $discussionId}, author_id: {_eq: $authorId}, status: {_eq: "draft"}}, limit: 1, order_by: {updated_at: desc}) {
        id
        draft_content
        updated_at
      }
    }
  `;

  const CREATE_DISCUSSION_VERSION = `
    mutation CreateDiscussionVersion($discussionId: uuid!, $title: String!, $description: String!, $versionNumber: Int!) {
      insert_discussion_version_one(object: {
        discussion_id: $discussionId,
        title: $title,
        description: $description,
        version_number: $versionNumber
      }) { id version_number title description created_at }
    }
  `;
  const UPDATE_DISCUSSION_CURRENT_VERSION = `
    mutation UpdateDiscussionCurrentVersion($discussionId: uuid!, $versionId: uuid!, $title: String!, $description: String!) {
      update_discussion(where: {id: {_eq: $discussionId}}, _set: {current_version_id: $versionId, title: $title, description: $description}) { returning { id current_version_id title description } }
    }
  `;

  const GET_DISCUSSION_VERSION = `
    query GetDiscussionVersion($versionId: uuid!) {
      discussion_version(where: {id: {_eq: $versionId}}) {
        id
        version_number
        title
        description
        created_at
      }
    }
  `;

  const GET_LATEST_VERSION_NUMBER = `
    query LatestVersion($discussionId: uuid!) {
      discussion_version(where:{discussion_id:{_eq:$discussionId}}, order_by:{version_number: desc}, limit:1){ version_number }
    }
  `;

  let historicalVersion: any = null;
  let versionLoading = false;
  let versionError: string | null = null;

  $: {
    const versionRef = $page.url.searchParams.get('versionRef');
    if (versionRef) {
      versionLoading = true;
      versionError = null;
      nhost.graphql.request(GET_DISCUSSION_VERSION, { versionId: versionRef })
        .then(({ data, error }) => {
          if (error) {
            // error could be array or object; attempt to normalize
            versionError = Array.isArray(error) ? error.map(e => (e as any).message || 'Error').join(', ') : (error as any).message || 'Error';
          } else {
            const versions = (data as any)?.discussion_version;
            historicalVersion = versions?.[0];
          }
        })
        .finally(() => { versionLoading = false; });
    } else {
      historicalVersion = null;
      versionError = null;
      versionLoading = false;
    }
  }

  let editing = false;
  let editTitle = '';
  let editDescription = '';
  let editError: string | null = null;
  let editLoading = false;

  async function submitComment() {
    submitError = null;
    if (!user) { submitError = 'You must be signed in to comment.'; return; }
    if (!newComment.trim()) { submitError = 'Comment cannot be empty.'; return; }
    submitting = true;
    try {
      const discussionId = $page.params.id as string;
      const result = await nhost.graphql.request(ADD_POST, {
        discussionId,
        authorId: user.id,
        content: newComment.trim()
      });
      if ((result as any).error) throw (result as any).error;
      const created = (result as any).data.insert_post_one;
      discussion.posts = [...discussion.posts, created];
      newComment = '';
    } catch (e: any) {
      submitError = e.message || 'Failed to add comment.';
    } finally {
      submitting = false;
    }
  }

  function updateAutosaveStatus() {
    if (!draftAutosaver) return;
    const st = draftAutosaver.getState();
    lastSavedAt = st.lastSavedAt;
    hasPending = st.hasPending;
  }

  function initAutosaver() {
    if (!draftPostId) return;
    if (draftAutosaver) draftAutosaver.destroy();
    draftAutosaver = createDraftAutosaver({
      postId: draftPostId,
      initialContent: newComment,
      delay: 700,
      minInterval: 2500,
      onSaved: () => { updateAutosaveStatus(); }
    });
    updateAutosaveStatus();
  }

  async function loadExistingDraft() {
    if (!user || draftLoaded) return;
    draftLoaded = true;
    const discussionId = $page.params.id as string;
    const qp = $page.url.searchParams;
    const replyDraftParam = qp.get('replyDraftId');
    if (replyDraftParam) {
      // fetch that specific draft id if belongs to this discussion & user
      const { data, error } = await nhost.graphql.request(`query GetDraftById($id: uuid!, $authorId: uuid!, $discussionId: uuid!) { post(where: {id: {_eq: $id}}) { id draft_content discussion_id author_id } }`, { id: replyDraftParam, authorId: user.id, discussionId });
      if (!error) {
        const posts = (data as any)?.post;
        const candidate = posts?.[0];
        if (candidate && candidate.author_id === user.id && candidate.discussion_id === discussionId) {
          draftPostId = candidate.id;
          newComment = candidate.draft_content || '';
          initAutosaver();
          focusReplyOnMount = true;
          return;
        }
      }
    }
    // fallback to existing most recent draft lookup
    const { data, error } = await nhost.graphql.request(GET_EXISTING_DRAFT, { discussionId, authorId: user.id });
    if (error) return; // silent
    const existing = (data as any)?.post?.[0];
    if (existing) {
      draftPostId = existing.id;
      newComment = existing.draft_content || '';
      initAutosaver();
    }
  }

  async function ensureDraftCreated() {
    if (!user || draftPostId) return;
    const discussionId = $page.params.id as string;
    // create empty draft row immediately
    const { data, error } = await nhost.graphql.request(CREATE_POST_DRAFT, {
      discussionId,
      authorId: user.id,
      draftContent: newComment || ''
    });
    if (error) return; // silent fail; user can still post normally
    draftPostId = (data as any)?.insert_post_one?.id || null;
    initAutosaver();
    // push initial content through autosaver
    if (draftPostId && newComment) draftAutosaver?.handleChange(newComment);
  }

  function onCommentInput(e: Event) {
    newComment = (e.target as HTMLTextAreaElement).value;
    // Invalidate prior score so user must explicitly re-check
    gfScore = null; gfLabel = null; gfError = null; lastScoredContent = '';
    if (!draftPostId) {
      ensureDraftCreated();
    } else {
      draftAutosaver?.handleChange(newComment);
      updateAutosaveStatus();
    }
  }

  async function publishDraft() {
    submitError = null;
    if (!user) { submitError = 'You must be signed in to comment.'; return; }
    if (!newComment.trim()) { submitError = 'Comment cannot be empty.'; return; }
    if (gfScore == null) {
      // First click: perform scoring only.
      await scoreGoodFaith();
      // If still null (error) show message; else user can click again to publish if meets threshold.
      if (gfScore == null) submitError = gfError || 'Scoring failed; try again.';
      return;
    }
    if (gfScore < GOOD_FAITH_THRESHOLD) {
      submitError = `Improve tone to reach threshold (${Math.round(gfScore*100)}% < ${Math.round(GOOD_FAITH_THRESHOLD*100)}%).`;
      return;
    }
    submitting = true;
    try {
      // Ensure draft exists
      if (!draftPostId) {
        await ensureDraftCreated();
      }
      if (!draftPostId) throw new Error('Failed to create draft.');
      // Flush current content through autosaver logic
      draftAutosaver?.handleChange(newComment);
      // Perform atomic score + approve (server will also persist final content)
      const { res, error } = await nhost.functions.call('goodFaithScore', {
        content: newComment,
        post_id: draftPostId,
        persist: true,
        approve_if: GOOD_FAITH_THRESHOLD
      });
      if (error) throw error;
      const approved = (res as any)?.approved;
      // Clear composer & reload posts if approved
      if (approved) {
        newComment = '';
        gfScore = null; gfLabel = null; lastScoredContent = '';
        draftAutosaver?.destroy();
        draftAutosaver = null;
        draftPostId = null;
        draftLoaded = false;
        await refreshApprovedPosts($page.params.id as string);
      } else {
        submitError = 'Publish attempt did not meet approval threshold.';
      }
    } catch (e: any) {
      submitError = e.message || 'Failed to publish comment.';
    } finally { submitting = false; }
  }

  async function refreshApprovedPosts(discussionId: string) {
    const result = await nhost.graphql.request(GET_DISCUSSION_DETAILS, { discussionId });
    if ((result as any).error) return;
    const fresh = (result as any).data?.discussion?.[0];
    if (fresh) discussion.posts = fresh.posts; // only need posts
  }

  async function loadDiscussion() {
    try {
      const discussionId = $page.params.id as string;
      const result = await nhost.graphql.request(GET_DISCUSSION_DETAILS, { discussionId });
      if ((result as any).error) { throw (result as any).error; }
      const discussions = (result as any).data.discussion;
      if (!discussions || discussions.length === 0) {
        throw new Error('Discussion not found');
      }
      discussion = discussions[0];
      await loadExistingDraft();
    } catch (e: any) {
      error = e;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    // Give auth a moment to initialize, then mark as ready
    setTimeout(() => {
      authReady = true;
    }, 100);
    
    if (focusReplyOnMount) {
      const ta = document.querySelector('textarea[aria-label="New comment"]') as HTMLTextAreaElement | null;
      if (ta) setTimeout(() => ta.focus(), 50);
    }
  });

  // Reactive: load discussion when auth becomes ready
  $: if (authReady && !discussion && !error) {
    loadDiscussion();
  }

  function startEdit() {
    editing = true;
    editTitle = discussion.title;
    editDescription = discussion.description;
    editError = null;
  }
  
  async function submitEdit() {
    if (!editing) return;
    editError = null;
    if (!editTitle.trim()) { editError = 'Title required'; return; }
    if (!editDescription.trim()) { editError = 'Description required'; return; }
    // If no meaningful change skip
    if (editTitle.trim() === discussion.title && editDescription.trim() === discussion.description) { editing = false; return; }
    editLoading = true;
    try {
      const discussionId = discussion.id;
      // Fetch latest version number
      const latest = await nhost.graphql.request(GET_LATEST_VERSION_NUMBER, { discussionId });
      if ((latest as any).error) throw (latest as any).error;
      const latestNum = (latest as any).data?.discussion_version?.[0]?.version_number || 0;
      const nextVersion = latestNum + 1;
      // Create version
      const created = await nhost.graphql.request(CREATE_DISCUSSION_VERSION, { discussionId, title: editTitle.trim(), description: editDescription.trim(), versionNumber: nextVersion });
      if ((created as any).error) throw (created as any).error;
      const versionId = (created as any).data?.insert_discussion_version_one?.id;
      if (!versionId) throw new Error('Failed to create version');
      // Set current version & update root discussion record
      const upd = await nhost.graphql.request(UPDATE_DISCUSSION_CURRENT_VERSION, { discussionId, versionId, title: editTitle.trim(), description: editDescription.trim() });
      if ((upd as any).error) throw (upd as any).error;
      // Update UI
      discussion.title = editTitle.trim();
      discussion.description = editDescription.trim();
      discussion.current_version_id = versionId;
      editing = false;
    } catch (e: any) {
      editError = e.message || 'Failed to update.';
    } finally { editLoading = false; }
  }
</script>

<div class="container">
  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <p class="error-message">Error: {error.message}</p>
  {:else if discussion}
    <header class="discussion-header">
      <h1 class="discussion-title">{discussion.title}</h1>
      <p class="discussion-meta">
        Started by {discussion.contributor.display_name} on {new Date(discussion.created_at).toLocaleDateString()}
        {#if user && user.id === discussion.contributor.id}
          <button class="edit-btn" on:click={startEdit}>Edit</button>
        {/if}
      </p>
      {#if editing}
        <form class="edit-form" on:submit|preventDefault={submitEdit}>
          <label>
            Title
            <input type="text" bind:value={editTitle} />
          </label>
          <label>
            Description
            <textarea rows="3" bind:value={editDescription}></textarea>
          </label>
          {#if editError}<p class="error-message">{editError}</p>{/if}
          <div style="display:flex; gap:0.5rem;">
            <button class="btn-primary" type="submit" disabled={editLoading}>{editLoading ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" class="btn-secondary" on:click={() => editing=false}>Cancel</button>
          </div>
        </form>
      {/if}
      {#if discussion.description}
        <p class="discussion-description">{discussion.description}</p>
      {/if}
    </header>

    {#if historicalVersion}
      <div class="historical-version-banner">
        <strong>Historical Version (v{historicalVersion.version_number})</strong>
        <div class="historical-title">{historicalVersion.title}</div>
        <div class="historical-description">{historicalVersion.description}</div>
        <a href={`/discussions/${discussion.id}`} class="return-current">Return to current version</a>
      </div>
    {:else if versionLoading}
      <div class="historical-version-banner">Loading historical version…</div>
    {:else if versionError}
      <div class="historical-version-banner error-message">{versionError}</div>
    {/if}

    <div class="posts-list">
      {#each discussion.posts as post}
        <div class="post-card">
          <div class="post-meta">
            <strong>{post.contributor.display_name}</strong>
            <span>&middot;</span>
            <time>{new Date(post.created_at).toLocaleString()}</time>
            {#if post.context_version_id}
              <a class="post-version-link" href={`?versionRef=${post.context_version_id}`}>context version</a>
            {/if}
            {#if post.good_faith_score != null}
              <span class="gf-chip" title={post.good_faith_label ? `${post.good_faith_label} (${Math.round(post.good_faith_score * 100)/100})` : `Good-faith score: ${Math.round(post.good_faith_score * 100)/100}`}>GF {Math.round(post.good_faith_score * 10)/10}</span>
            {/if}
          </div>
          <div class="post-content">
            {@html post.content}
          </div>
        </div>
      {:else}
        <p>No posts in this discussion yet. Be the first to contribute!</p>
      {/each}
    </div>

    <section class="add-comment">
      <h2 class="add-comment-title">Add a Comment</h2>
      {#if !user}
        <p class="signin-hint">Please sign in to participate.</p>
      {:else}
        <form on:submit|preventDefault={publishDraft} class="comment-form">
          <textarea bind:value={newComment} on:input={onCommentInput} on:focus={loadExistingDraft} rows="5" placeholder="Share your perspective..." aria-label="New comment"></textarea>
          {#if submitError}<p class="error-message" style="margin-top:0.5rem;">{submitError}</p>{/if}
          <div class="comment-actions" style="flex-direction:column; align-items:flex-end; gap:0.4rem;">
            <div class="autosave-indicator" aria-live="polite">
              {#if draftPostId}
                {#if hasPending}
                  <span class="pending-dot" aria-hidden="true"></span> Saving…
                {:else if lastSavedAt}
                  Saved {new Date(lastSavedAt).toLocaleTimeString()}
                {:else}
                  Draft created
                {/if}
              {/if}
            </div>
            <button type="submit" class="btn-primary" disabled={submitting || gfLoading || !newComment.trim()}>
              {#if submitting}
                {gfScore !== null && gfScore >= GOOD_FAITH_THRESHOLD ? 'Publishing…' : 'Scoring…'}
              {:else if gfScore === null}
                {gfLoading ? 'Scoring…' : 'Good Faith?'}
              {:else if gfScore < GOOD_FAITH_THRESHOLD}
                Recheck (GF {Math.round(gfScore*100)}%)
              {:else}
                Publish Comment (GF {Math.round(gfScore*100)}%)
              {/if}
            </button>
            {#if gfError}<span class="gf-error" aria-live="polite">{gfError}</span>{/if}
            {#if gfScore !== null && gfScore < GOOD_FAITH_THRESHOLD && !gfError}
              <div class="gf-hint" aria-live="polite">Aim for constructive language, cite sources, avoid personal attacks.</div>
            {/if}
          </div>
        </form>
      {/if}
    </section>
  {:else}
    <p>Discussion not found.</p>
  {/if}
</div>

<style>
  .container {
    max-width: 900px;
    margin: 2rem auto;
    padding: 2rem;
  }
  /* Removed obsolete .back-link styles */
  .discussion-header {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }
  .discussion-title {
    font-size: 2.25rem;
    font-weight: 700;
    font-family: var(--font-family-display);
    margin-bottom: 0.5rem;
  }
  .discussion-meta {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
  }
  .discussion-description {
    font-size: 1.125rem;
    color: var(--color-text-secondary);
  }
  .posts-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .post-card {
    background-color: var(--color-surface);
    padding: 1.5rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
  }
  .post-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
  }
  .gf-chip {
    margin-left: 0.4rem;
    background: color-mix(in srgb, var(--color-accent) 20%, transparent);
    color: var(--color-accent);
    font-size: 0.6rem;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 4px;
    letter-spacing: 0.5px;
    line-height: 1;
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
  }
  .post-content { line-height: 1.6; }
  .add-comment { margin-top: 3rem; }
  .add-comment-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; }
  .signin-hint { color: var(--color-text-secondary); }
  .comment-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .comment-form textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-input-bg);
    color: var(--color-text-primary);
    resize: vertical;
  }
  .comment-form textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  .comment-actions { display: flex; justify-content: flex-end; }
  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-surface);
    padding: 0.6rem 1.2rem;
    border-radius: var(--border-radius-md);
    border: none;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
  .gf-error { color: var(--color-accent); font-size:0.6rem; margin-top:0.25rem; }
  .gf-hint { font-size:0.55rem; color: var(--color-text-secondary); max-width:320px; text-align:right; }
  .error-message { color: #ef4444; }
  .autosave-indicator { font-size:0.65rem; color: var(--color-text-secondary); min-height:0.9rem; display:flex; align-items:center; gap:0.35rem; }
  .pending-dot { width:6px; height:6px; border-radius:50%; background: var(--color-accent); display:inline-block; animation: pulse 1s linear infinite; }
  @keyframes pulse { 0% { opacity:0.2; } 50% { opacity:1; } 100% { opacity:0.2; } }
  .post-version-link { font-size:0.65rem; color:var(--color-primary); margin-left:0.5rem; }
  .post-version-link:hover { text-decoration:underline; }
  .edit-btn { margin-left:1rem; font-size:0.85rem; background:none; border:none; color:var(--color-primary); cursor:pointer; }
  .edit-btn:hover, .edit-btn:focus { text-decoration:underline; outline:none; }
  .edit-form { margin-top:1rem; display:flex; flex-direction:column; gap:0.75rem; background:var(--color-surface-alt); padding:1rem; border-radius:var(--border-radius-md); border:1px solid var(--color-border); }
  .edit-form label { font-size:0.85rem; font-weight:600; color:var(--color-text-secondary); margin-bottom:0.25rem; }
  .edit-form input[type=text], .edit-form textarea { width:100%; padding:0.5rem; border-radius:var(--border-radius-sm); border:1px solid var(--color-border); font:inherit; }
  .edit-form input:focus, .edit-form textarea:focus { outline:none; border-color:var(--color-primary); box-shadow:0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent); }
  .historical-version-banner {
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    padding: 1rem;
    margin-bottom: 1.5rem;
    font-size: 0.95rem;
    color: var(--color-text-secondary);
  }
  .historical-version-banner strong { color: var(--color-accent); font-size:1.05rem; }
  .historical-title { font-weight:600; margin-top:0.5rem; }
  .historical-description { margin-top:0.25rem; }
  .return-current { margin-top:0.75rem; display:inline-block; color:var(--color-primary); font-size:0.85rem; }
  .return-current:hover { text-decoration:underline; }
</style>
