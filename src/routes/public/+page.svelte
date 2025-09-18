<svelte:options runes={true} />
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { nhost } from '$lib/nhostClient';
  import {
    GET_PUBLIC_SHOWCASE_ADMIN,
    CREATE_PUBLIC_SHOWCASE_ITEM,
    UPDATE_PUBLIC_SHOWCASE_ITEM,
    DELETE_PUBLIC_SHOWCASE_ITEM
  } from '$lib/graphql/queries';

  type ShowcaseItem = {
    id: string;
    title: string;
    subtitle?: string | null;
    media_type?: string | null;
    creator?: string | null;
    source_url?: string | null;
    summary?: string | null;
    analysis?: string | null;
    tags?: string[] | null;
    display_order: number;
    published: boolean;
    created_at: string;
    updated_at: string;
  };

  type ShowcaseForm = {
    id: string | null;
    title: string;
    subtitle: string;
    media_type: string;
    creator: string;
    source_url: string;
    summary: string;
    analysis: string;
    tags: string;
    display_order: number;
    published: boolean;
  };

  const blankForm: ShowcaseForm = {
    id: null,
    title: '',
    subtitle: '',
    media_type: '',
    creator: '',
    source_url: '',
    summary: '',
    analysis: '',
    tags: '',
    display_order: 0,
    published: true
  };

  let checkingAuth = $state(true);
  let hasAccess = $state(false);
  let user = $state(nhost.auth.getUser());
  let items = $state<ShowcaseItem[]>([]);
  let loading = $state(false);
  let saving = $state(false);
  let deleting = $state<string | null>(null);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let form = $state<ShowcaseForm>({ ...blankForm });

  function collectRoles(u: any): string[] {
    if (!u) return [];
    const roles = new Set<string>();
    const direct = (u as any).roles;
    if (Array.isArray(direct)) direct.forEach((r) => typeof r === 'string' && roles.add(r));
    const defaultRole = (u as any).defaultRole ?? (u as any).default_role;
    if (typeof defaultRole === 'string') roles.add(defaultRole);
    const metadataRoles = (u as any).metadata?.roles;
    if (Array.isArray(metadataRoles)) metadataRoles.forEach((r: any) => typeof r === 'string' && roles.add(r));
    const appMetadataRoles = (u as any).app_metadata?.roles;
    if (Array.isArray(appMetadataRoles)) appMetadataRoles.forEach((r: any) => typeof r === 'string' && roles.add(r));
    const userRole = (u as any).role;
    if (typeof userRole === 'string') roles.add(userRole);
    return Array.from(roles);
  }

  async function ensureAuth() {
    try {
      await nhost.auth.isAuthenticatedAsync();
    } catch {}
    user = nhost.auth.getUser();
    const roles = collectRoles(user);
    hasAccess = roles.includes('me');
    checkingAuth = false;
    if (!hasAccess) {
      error = 'You do not have permission to view this page.';
    } else {
      await loadItems();
    }
  }

  async function loadItems() {
    loading = true;
    error = null;
    try {
      const { data, error: gqlError } = await nhost.graphql.request(GET_PUBLIC_SHOWCASE_ADMIN);
      if (gqlError) throw (Array.isArray(gqlError) ? new Error(gqlError.map((e:any)=>e.message).join('; ')) : gqlError);
      items = (data as any)?.public_showcase_item ?? [];
    } catch (e: any) {
      error = e?.message ?? 'Failed to load showcase items.';
    } finally {
      loading = false;
    }
  }

  function resetForm(keepOrder = false) {
    const reset = { ...blankForm };
    if (keepOrder) reset.display_order = form.display_order;
    form = reset;
    success = null;
    error = null;
  }

  function editItem(item: ShowcaseItem) {
    form = {
      id: item.id,
      title: item.title ?? '',
      subtitle: item.subtitle ?? '',
      media_type: item.media_type ?? '',
      creator: item.creator ?? '',
      source_url: item.source_url ?? '',
      summary: item.summary ?? '',
      analysis: item.analysis ?? '',
      tags: item.tags?.join(', ') ?? '',
      display_order: item.display_order ?? 0,
      published: !!item.published
    };
  }

  function parseTags(input: string): string[] {
    return input
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  async function saveForm() {
    if (!hasAccess) return;
    if (!form.title.trim()) {
      error = 'Title is required.';
      return;
    }
    saving = true;
    error = null;
    success = null;
    const payload: Record<string, any> = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      media_type: form.media_type.trim() || null,
      creator: form.creator.trim() || null,
      source_url: form.source_url.trim() || null,
      summary: form.summary.trim() || null,
      analysis: form.analysis.trim() || null,
      tags: parseTags(form.tags),
      display_order: form.display_order ?? 0,
      published: form.published
    };
    try {
      if (form.id) {
        const { data, error: gqlError } = await nhost.graphql.request(UPDATE_PUBLIC_SHOWCASE_ITEM, {
          id: form.id,
          changes: { ...payload, updated_at: new Date().toISOString() }
        });
        if (gqlError) throw (Array.isArray(gqlError) ? new Error(gqlError.map((e:any)=>e.message).join('; ')) : gqlError);
        const updated = (data as any)?.update_public_showcase_item_by_pk;
        items = items.map((it) => (it.id === updated.id ? updated : it));
        success = 'Showcase item updated.';
      } else {
        const { data, error: gqlError } = await nhost.graphql.request(CREATE_PUBLIC_SHOWCASE_ITEM, {
          input: payload
        });
        if (gqlError) throw (Array.isArray(gqlError) ? new Error(gqlError.map((e:any)=>e.message).join('; ')) : gqlError);
        const created = (data as any)?.insert_public_showcase_item_one;
        items = [created, ...items];
        success = 'Showcase item created.';
        resetForm(true);
      }
    } catch (e: any) {
      error = e?.message ?? 'Failed to save showcase item.';
    } finally {
      saving = false;
    }
  }

  async function removeItem(id: string) {
    if (!hasAccess) return;
    if (!confirm('Delete this showcase item?')) return;
    deleting = id;
    error = null;
    success = null;
    try {
      const { error: gqlError } = await nhost.graphql.request(DELETE_PUBLIC_SHOWCASE_ITEM, { id });
      if (gqlError) throw (Array.isArray(gqlError) ? new Error(gqlError.map((e:any)=>e.message).join('; ')) : gqlError);
      items = items.filter((it) => it.id !== id);
      if (form.id === id) resetForm();
      success = 'Showcase item deleted.';
    } catch (e: any) {
      error = e?.message ?? 'Failed to delete showcase item.';
    } finally {
      deleting = null;
    }
  }

  onMount(() => {
    const off = nhost.auth.onAuthStateChanged(async () => {
      user = nhost.auth.getUser();
      const roles = collectRoles(user);
      hasAccess = roles.includes('me');
      if (hasAccess && !loading && items.length === 0) {
        await loadItems();
      }
      if (!hasAccess && !checkingAuth) {
        error = 'You do not have permission to view this page.';
      }
    });
    ensureAuth();
    return () => { try { (off as any)?.(); } catch {} };
  });

  function viewLanding() {
    goto('/');
  }

  function viewDiscussions() {
    goto('/discussions');
  }
</script>

{#if checkingAuth}
  <div class="page-container">
    <p>Checking access…</p>
  </div>
{:else if !hasAccess}
  <div class="page-container">
    <div class="access-denied">
      <h1>Restricted</h1>
      <p>{error ?? 'You do not have permission to view this page.'}</p>
      <div class="nav-links">
        <button type="button" class="btn-secondary" onclick={viewLanding}>Back to Home</button>
      </div>
    </div>
  </div>
{:else}
  <div class="page-container">
    <header class="page-header">
      <div>
        <h1>Public Showcase Manager</h1>
        <p class="lead">Curate external analyses to highlight on the landing page and discussions hub.</p>
      </div>
      <div class="nav-links">
        <button type="button" class="btn-secondary" onclick={viewLanding}>View Landing</button>
        <button type="button" class="btn-secondary" onclick={viewDiscussions}>View Discussions</button>
      </div>
    </header>

    <section class="content">
      <aside class="list-panel">
        <div class="panel-header">
          <h2>Existing Entries</h2>
          <button type="button" class="btn-secondary" onclick={() => resetForm()}>New Item</button>
        </div>
        {#if loading}
          <p>Loading showcase items…</p>
        {:else if error}
          <p class="error">{error}</p>
        {:else if items.length === 0}
          <p>No showcase items yet. Create your first entry using the form.</p>
        {:else}
          <ul class="item-list">
            {#each items as item}
              <li class:inactive={!item.published}>
                <button type="button" class="item-button" onclick={() => editItem(item)}>
                  <div class="item-title">{item.title}</div>
                  <div class="item-meta">
                    {#if item.media_type}<span>{item.media_type}</span>{/if}
                    {#if item.creator}<span>{item.creator}</span>{/if}
                    <span>Order: {item.display_order}</span>
                    <span>{item.published ? 'Published' : 'Hidden'}</span>
                  </div>
                </button>
                <button
                  type="button"
                  class="delete-button"
                  aria-label={`Delete ${item.title}`}
                  onclick={() => removeItem(item.id)}
                  disabled={deleting === item.id}
                >
                  {deleting === item.id ? '…' : '×'}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>

      <section class="form-panel">
        <h2>{form.id ? 'Edit Showcase Item' : 'Create Showcase Item'}</h2>
        <form onsubmit={(event) => { event.preventDefault(); saveForm(); }}>
          <div class="form-grid">
            <label>
              <span>Title *</span>
              <input type="text" bind:value={form.title} required />
            </label>
            <label>
              <span>Subtitle</span>
              <input type="text" bind:value={form.subtitle} />
            </label>
            <label>
              <span>Media Type</span>
              <input type="text" bind:value={form.media_type} placeholder="Speech, Podcast, Essay…" />
            </label>
            <label>
              <span>Creator / Speaker</span>
              <input type="text" bind:value={form.creator} placeholder="Name of the author or speaker" />
            </label>
            <label>
              <span>Source URL</span>
              <input type="url" bind:value={form.source_url} placeholder="https://" />
            </label>
            <label>
              <span>Display Order</span>
              <input type="number" bind:value={form.display_order} min="0" />
            </label>
            <label class="checkbox">
              <input type="checkbox" bind:checked={form.published} />
              <span>Published</span>
            </label>
          </div>

          <label>
            <span>Summary</span>
            <textarea rows="3" bind:value={form.summary} placeholder="Short context for the source material." />
          </label>

          <label>
            <span>Analysis</span>
            <textarea rows="6" bind:value={form.analysis} placeholder="Key findings from the good-faith analysis." />
          </label>

          <label>
            <span>Tags (comma separated)</span>
            <input type="text" bind:value={form.tags} placeholder="ethics, policy, rhetoric" />
          </label>

          <div class="form-actions">
            <button type="submit" class="btn-primary" disabled={saving}>{saving ? 'Saving…' : (form.id ? 'Update Item' : 'Create Item')}</button>
            <button type="button" class="btn-secondary" onclick={() => resetForm(true)} disabled={saving}>Reset</button>
          </div>
          {#if success}<p class="success">{success}</p>{/if}
          {#if error && !loading}<p class="error">{error}</p>{/if}
        </form>
      </section>
    </section>
  </div>
{/if}

<style>
  .page-container {
    max-width: 1100px;
    margin: 2rem auto;
    padding: 0 1.5rem 3rem;
  }
  .page-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .page-header h1 {
    margin: 0;
    font-size: 1.75rem;
  }
  .lead {
    margin: 0.35rem 0 0;
    color: var(--color-text-secondary);
  }
  .nav-links {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .content {
    display: grid;
    grid-template-columns: minmax(240px, 320px) 1fr;
    gap: 1.5rem;
  }
  .list-panel {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    background: var(--color-surface);
    padding: 1rem;
  }
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .item-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .item-list li {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    overflow: hidden;
  }
  .item-list li.inactive {
    opacity: 0.65;
  }
  .item-button {
    flex: 1;
    text-align: left;
    padding: 0.75rem;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
  }
  .item-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .item-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }
  .delete-button {
    border: none;
    background: #f87171;
    color: white;
    width: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    cursor: pointer;
  }
  .delete-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .form-panel {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    background: var(--color-surface);
    padding: 1.25rem;
  }
  .form-panel h2 {
    margin-top: 0;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.9rem;
  }
  label span {
    font-weight: 600;
    color: var(--color-text-primary);
  }
  input[type='text'],
  input[type='url'],
  input[type='number'],
  textarea {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    padding: 0.5rem 0.6rem;
    background: var(--color-input-bg, var(--color-surface));
    color: var(--color-text-primary);
    box-sizing: border-box;
  }
  textarea {
    min-height: 5rem;
    resize: vertical;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  .checkbox {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  .form-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .btn-primary {
    background: var(--color-primary);
    color: var(--color-surface);
    border: none;
    padding: 0.6rem 1.2rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    font-weight: 600;
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    padding: 0.55rem 1.1rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
  }
  .error {
    color: #ef4444;
    font-size: 0.9rem;
  }
  .success {
    color: #10b981;
    font-size: 0.9rem;
  }
  .access-denied {
    max-width: 460px;
    margin: 4rem auto;
    text-align: center;
    padding: 2rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    background: var(--color-surface);
  }
  @media (max-width: 900px) {
    .content {
      grid-template-columns: 1fr;
    }
  }
</style>
