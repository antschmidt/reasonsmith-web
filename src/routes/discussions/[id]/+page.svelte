<script lang="ts">
  import { page } from '$app/stores';
  // Avoid importing gql to prevent type resolution issues; use plain string
  import { nhost } from '$lib/nhostClient';
  import { onMount } from 'svelte';

  let discussion: any = null;
  let loading = true;
  let error: Error | null = null;

  // New comment form state
  let newComment = '';
  let submitting = false;
  let submitError: string | null = null;
  let user = nhost.auth.getUser();
  nhost.auth.onAuthStateChanged(() => { user = nhost.auth.getUser(); });

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

  onMount(async () => {
    try {
      const discussionId = $page.params.id as string;
      const result = await nhost.graphql.request(GET_DISCUSSION_DETAILS, {
        discussionId
      });

      if ((result as any).error) {
        throw (result as any).error;
      }

      discussion = (result as any).data.discussion_by_pk;
    } catch (e: any) {
      error = e;
    } finally {
      loading = false;
    }
  });
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
        <form on:submit|preventDefault={submitComment} class="comment-form">
          <textarea bind:value={newComment} rows="5" placeholder="Share your perspective..." aria-label="New comment"></textarea>
          {#if submitError}<p class="error-message" style="margin-top:0.5rem;">{submitError}</p>{/if}
          <div class="comment-actions">
            <button type="submit" class="btn-primary" disabled={submitting}>{submitting ? 'Posting...' : 'Post Comment'}</button>
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
</style>
