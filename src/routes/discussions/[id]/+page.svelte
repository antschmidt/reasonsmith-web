<script lang="ts">
  import { page } from '$app/stores';
  // Avoid importing gql to prevent type resolution issues; use plain string
  import { nhost } from '$lib/nhostClient';
  import { onMount } from 'svelte';
  import { CREATE_POST_DRAFT, UPDATE_POST_DRAFT, PUBLISH_POST } from '$lib/graphql/queries';
  import { createDraftAutosaver, type DraftAutosaver } from '$lib';

  let discussion: any = null;
  let loading = true;
  let error: Error | null = null;

  // New comment form state
  let newComment = '';
  let submitting = false;
  let submitError: string | null = null;
  let user = nhost.auth.getUser();
  nhost.auth.onAuthStateChanged(() => { user = nhost.auth.getUser(); });

  let draftPostId: string | null = null;
  let draftAutosaver: DraftAutosaver | null = null;
  let draftLoaded = false; // prevents duplicate fetch
  let lastSavedAt: number | null = null;
  let hasPending = false;
  let focusReplyOnMount = false;

  const GET_DISCUSSION_DETAILS = `
    query GetDiscussionDetails($discussionId: uuid!) {
      discussion_by_pk(id: $discussionId) {
        id
        title
        description
        created_at
        contributor { # created_by relation
          id
          display_name
        }
        posts(where: { status: { _eq: "approved" } }, order_by: { created_at: asc }) {
          id
          content
          created_at
          contributor { # author relation
            id
            display_name
          }
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
      const { data, error } = await nhost.graphql.request(`query GetDraftById($id: uuid!, $authorId: uuid!, $discussionId: uuid!) { post_by_pk(id: $id) { id draft_content discussion_id author_id } }`, { id: replyDraftParam, authorId: user.id, discussionId });
      if (!error) {
        const candidate = (data as any)?.post_by_pk;
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
    if (!draftPostId) {
      // lazily create draft after first actual input (non-empty or first key)
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
    submitting = true;
    try {
      if (draftPostId) {
        // Use publish mutation to promote draft to approved content
        const { data, error } = await nhost.graphql.request(PUBLISH_POST, { postId: draftPostId });
        if (error) throw (error as any);
        const discussionId = $page.params.id as string;
        // refetch approved posts (simpler than manually merging since publish copies content)
        await refreshApprovedPosts(discussionId);
        // reset draft state
        draftAutosaver?.destroy();
        draftAutosaver = null;
        draftPostId = null;
        newComment = '';
        draftLoaded = false; // allow new draft creation later
      } else {
        // fallback legacy path (should rarely hit now)
        await submitComment();
      }
    } catch (e: any) {
      submitError = e.message || 'Failed to publish comment.';
    } finally {
      submitting = false;
    }
  }

  async function refreshApprovedPosts(discussionId: string) {
    const result = await nhost.graphql.request(GET_DISCUSSION_DETAILS, { discussionId });
    if ((result as any).error) return;
    const fresh = (result as any).data?.discussion_by_pk;
    if (fresh) discussion.posts = fresh.posts; // only need posts
  }

  // Extend existing onMount: after loading discussion, attempt to load draft
  onMount(async () => {
    try {
      const discussionId = $page.params.id as string;
      const result = await nhost.graphql.request(GET_DISCUSSION_DETAILS, { discussionId });
      if ((result as any).error) { throw (result as any).error; }
      discussion = (result as any).data.discussion_by_pk;
      await loadExistingDraft();
    } catch (e: any) {
      error = e;
    } finally {
      loading = false;
    }
    if (focusReplyOnMount) {
      const ta = document.querySelector('textarea[aria-label="New comment"]') as HTMLTextAreaElement | null;
      if (ta) setTimeout(() => ta.focus(), 50);
    }
  });

  nhost.auth.onAuthStateChanged(() => { user = nhost.auth.getUser(); loadExistingDraft(); });
</script>

<div class="container">
  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <p class="error-message">Error: {error.message}</p>
  {:else if discussion}
    <a href="/" class="back-link" aria-label="Back to Dashboard">← Back to Dashboard</a>
    <header class="discussion-header">
      <h1 class="discussion-title">{discussion.title}</h1>
      <p class="discussion-meta">
        Started by {discussion.contributor.display_name} on {new Date(discussion.created_at).toLocaleDateString()}
      </p>
      {#if discussion.description}
        <p class="discussion-description">{discussion.description}</p>
      {/if}
    </header>

    <div class="posts-list">
      {#each discussion.posts as post}
        <div class="post-card">
          <div class="post-meta">
            <strong>{post.contributor.display_name}</strong>
            <span>&middot;</span>
            <time>{new Date(post.created_at).toLocaleString()}</time>
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
            <button type="submit" class="btn-primary" disabled={submitting}>{submitting ? 'Posting...' : (draftPostId ? 'Publish Comment' : 'Post Comment')}</button>
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
  .back-link {
    display: inline-block;
    margin-bottom: 0.75rem;
    color: var(--color-primary);
    text-decoration: none;
    font-size: 0.875rem;
  }
  .back-link:hover { text-decoration: underline; }
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
  .error-message { color: #ef4444; }
  .autosave-indicator { font-size:0.65rem; color: var(--color-text-secondary); min-height:0.9rem; display:flex; align-items:center; gap:0.35rem; }
  .pending-dot { width:6px; height:6px; border-radius:50%; background: var(--color-accent); display:inline-block; animation: pulse 1s linear infinite; }
  @keyframes pulse { 0% { opacity:0.2; } 50% { opacity:1; } 100% { opacity:0.2; } }
</style>
