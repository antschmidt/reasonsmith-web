<script lang="ts">
  import { nhost } from '$lib/nhostClient';
  import { goto } from '$app/navigation';

  let title = '';
  let description = '';
  let error: Error | null = null;
  let loading = false;

  // Simplified mutation – contributor upsert handled globally in nhostClient ensureContributor
  const CREATE_DISCUSSION = `
    mutation CreateDiscussion($title: String!, $description: String, $userId: uuid!) {
      insert_discussion_one(
        object: { title: $title, description: $description, created_by: $userId }
      ) { id }
    }
  `;

  const handleSubmit = async () => {
    loading = true;
    error = null;
    const user = nhost.auth.getUser();

    if (!user) {
      error = new Error('You must be logged in to create a discussion.');
      loading = false;
      return;
    }

    if (!title.trim()) {
        error = new Error('Title is required.');
        loading = false;
        return;
    }

    try {
      const result = await nhost.graphql.request(CREATE_DISCUSSION, {
        title,
        description,
        userId: user.id
      });

      if ((result as any).error) {
        throw (result as any).error;
      }

      const newDiscussionId = (result as any).data.insert_discussion_one.id;
      goto(`/discussions/${newDiscussionId}`);
    } catch (e: any) {
      error = e;
    } finally {
      loading = false;
    }
  };
</script>

<div class="container">
  <a href="/" class="back-link" aria-label="Back to Dashboard">← Back to Dashboard</a>
  <h1 class="title">Create a New Discussion</h1>
  <form on:submit|preventDefault={handleSubmit} class="form">
    <div class="form-group">
      <label for="title">Title</label>
      <input id="title" type="text" bind:value={title} placeholder="Enter a clear and concise title" required />
    </div>
    <div class="form-group">
      <label for="description">Description (Optional)</label>
      <textarea id="description" bind:value={description} rows="4" placeholder="Provide some context or a starting point for the discussion."></textarea>
    </div>

    {#if error}
      <p class="error-message">{error.message}</p>
    {/if}

    <div class="actions">
      <button type="submit" class="btn-primary" disabled={loading}>
        {loading ? 'Creating...' : 'Create Discussion'}
      </button>
      <button type="button" class="btn-secondary" on:click={() => goto('/')}>Cancel</button>
    </div>
  </form>
</div>

<style>
  .container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 2rem;
    background-color: var(--color-surface);
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
  }
  .title {
    font-size: 1.75rem;
    font-weight: 600;
    font-family: var(--font-family-display);
    margin-bottom: 1.5rem;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .form-group {
    display: flex;
    flex-direction: column;
  }
  .form-group label {
    margin-bottom: 0.5rem;
    font-weight: 500;
  }
  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-input-bg);
    color: var(--color-text-primary);
    transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;
  }
  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  .error-message {
    color: #ef4444; /* Red 500 */
    margin-bottom: 1rem;
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
  .back-link {
    display: inline-block;
    margin-bottom: 0.5rem;
    color: var(--color-primary);
    text-decoration: none;
  }
  .back-link:hover { text-decoration: underline; }
  .actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-top: 0.5rem;
  }
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
