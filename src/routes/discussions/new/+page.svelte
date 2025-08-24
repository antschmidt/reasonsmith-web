<script lang="ts">
  import { page } from '$app/stores';
  import { nhost } from '$lib/nhostClient';
  import { onMount } from 'svelte';
  import { createDraftAutosaver, type DraftAutosaver } from '$lib';
  import { goto } from '$app/navigation';

  // --- State (Runes) ---
  let user = $state(nhost.auth.getUser());
  nhost.auth.onAuthStateChanged(() => { user = nhost.auth.getUser(); });

  let title = $state('');
  let content = $state('');
  let draftId = $state<string | null>(null);
  let autosaver = $state<DraftAutosaver | null>(null);
  let hasPending = $state(false);
  let lastSavedAt = $state<number | null>(null);
  let publishing = $state(false);
  let publishError = $state<string | null>(null);

  // GraphQL mutation documents
  const CREATE_DISCUSSION = `mutation CreateDiscussion($title: String!, $authorId: uuid!) { insert_discussion_one(object:{ title:$title, created_by:$authorId }) { id } }`;
  const ATTACH_AND_PUBLISH = `mutation AttachAndPublish($postId: uuid!, $discussionId: uuid!, $content: String!) { update_post_by_pk(pk_columns:{id:$postId}, _set:{discussion_id:$discussionId, draft_content:$content, content:$content, status:"approved"}) { id status discussion_id } }`;

  // Derived route param
  const routeDraftId = $derived($page.url.searchParams.get('draftId'));

  async function loadDraftById(id: string) {
    const { data, error } = await nhost.graphql.request(`query GetDraft($id: uuid!, $authorId: uuid!) { post_by_pk(id: $id) { id draft_content author_id status } }`, { id, authorId: user?.id });
    if (error) return;
    const d = (data as any)?.post_by_pk;
    if (d && d.author_id === user?.id && d.status === 'draft') {
      draftId = d.id;
      content = d.draft_content || '';
      initAutosaver();
    }
  }

  function updateAutosaveState() {
    if (!autosaver) return;
    const st = autosaver.getState();
    hasPending = st.hasPending;
    lastSavedAt = st.lastSavedAt;
  }

  function initAutosaver() {
    if (!draftId) return;
    if (autosaver) autosaver.destroy();
    autosaver = createDraftAutosaver({ postId: draftId, initialContent: content, delay: 700, minInterval: 2500, onSaved: updateAutosaveState });
    updateAutosaveState();
  }

  onMount(async () => {
    if (routeDraftId && user) {
      await loadDraftById(routeDraftId);
    }
  });

  function onContentInput(e: Event) {
    content = (e.target as HTMLTextAreaElement).value;
    if (draftId) {
      autosaver?.handleChange(content);
      updateAutosaveState();
    }
  }

  async function publishNewDiscussion() {
    publishError = null;
    if (!user) { publishError = 'Sign in required.'; return; }
    if (!title.trim()) { publishError = 'Title required.'; return; }
    if (!content.trim()) { publishError = 'Content required.'; return; }
    if (!draftId) { publishError = 'Draft missing.'; return; }
    publishing = true;
    try {
      const { data: discData, error: discErr } = await nhost.graphql.request(CREATE_DISCUSSION, { title: title.trim(), authorId: user.id });
      if (discErr) throw discErr;
      const discussionId = (discData as any)?.insert_discussion_one?.id;
      if (!discussionId) throw new Error('Failed to create discussion.');
      autosaver?.handleChange(content);
      const { error: attachErr } = await nhost.graphql.request(ATTACH_AND_PUBLISH, { postId: draftId, discussionId, content });
      if (attachErr) throw attachErr;
      goto(`/discussions/${discussionId}`);
    } catch (e: any) {
      publishError = e.message || 'Failed to publish.';
    } finally {
      publishing = false;
    }
  }

  const canPublish = $derived(() => !!user && !!draftId && title.trim().length > 0 && content.trim().length > 0 && !publishing);

  // Effect: watch routeDraftId changes
  $effect(() => {
    if (!user) return;
    if (!routeDraftId) return;
    if (routeDraftId === draftId) return;
    autosaver?.destroy();
    autosaver = null;
    draftId = null;
    content = '';
    loadDraftById(routeDraftId);
  });
</script>

<div class="container">
  <h1 class="title">Create a New Discussion</h1>
  <form onsubmit={(e) => { e.preventDefault(); publishNewDiscussion(); }}>
    <div class="form-group">
      <label for="title">Title</label>
      <input id="title" type="text" bind:value={title} placeholder="Enter a clear and concise title" required />
    </div>
    <div class="form-group">
      <label for="description">Description (Optional)</label>
  <textarea id="description" bind:value={content} rows="4" placeholder="Provide some context or a starting point for the discussion." oninput={onContentInput}></textarea>
    </div>

    <div class="autosave-indicator" aria-live="polite">
      {#if draftId}
        {#if hasPending}
          <span class="pending-dot" aria-hidden="true"></span> Saving…
        {:else if lastSavedAt}
          Saved {new Date(lastSavedAt).toLocaleTimeString()}
        {:else}
          Draft loaded
        {/if}
      {/if}
    </div>

    {#if publishError}<p style="color:var(--color-accent); font-size:0.75rem;">{publishError}</p>{/if}
    <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
  <button class="btn-primary" type="submit" disabled={!canPublish}>{publishing ? 'Publishing…' : 'Publish Discussion'}</button>
  <button type="button" class="btn-secondary" onclick={() => goto('/')}>Cancel</button>
    </div>
  </form>
</div>

<style>
  .container {
    max-width: 900px;
    margin: 2rem auto;
    padding: 2rem;
  }
  .title {
    font-size: 1.75rem;
    font-weight: 600;
    font-family: var(--font-family-display);
    margin-bottom: 1.5rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  /* removed unused label span styling */
  input[type=text], textarea {
    width: 100%;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    padding: 0.75rem;
    border-radius: var(--border-radius-md);
    font: inherit;
  }
  input[type=text]:focus, textarea:focus {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 40%, transparent);
  }
  .autosave-indicator {
    font-size: 0.65rem;
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 1rem;
  }
  .pending-dot {
    width: 6px;
    height: 6px;
    background: var(--color-primary);
    border-radius: 50%;
    animation: pulse 1.2s infinite ease-in-out;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(0.5); opacity: 0.4; }
  }
  button.btn-primary {
    margin-top: 0.5rem;
  }
  .btn-primary {
    align-self: flex-start;
    background-color: var(--color-primary);
    color: var(--color-surface);
    padding: 0.75rem 1.5rem;
    border-radius: var(--border-radius-md);
    border: none;
    cursor: pointer;
    transition: opacity 150ms ease-in-out;
  }
  .btn-primary:hover {
    opacity: 0.9;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  /* removed unused .actions */
  .btn-secondary {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    padding: 0.75rem 1.5rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: background-color 150ms ease-in-out;
  }
  .btn-secondary:hover { background-color: var(--color-surface-alt); }
</style>
