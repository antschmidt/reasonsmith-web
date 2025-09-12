<script lang="ts">
  import { page } from '$app/stores';
  import { nhost } from '$lib/nhostClient';
  import { goto } from '$app/navigation';
  import { WRITING_STYLES, getStyleConfig, validateStyleRequirements, type WritingStyle, type StyleMetadata, type Citation } from '$lib/types/writingStyle';
  import CitationForm from '$lib/components/CitationForm.svelte';

  // --- State (Runes) ---
  let user = $state(nhost.auth.getUser());
  nhost.auth.onAuthStateChanged(() => { user = nhost.auth.getUser(); });

  let title = $state('');
  let content = $state('');
  let discussionId = $state<string | null>(null);
  let publishing = $state(false);
  let publishError = $state<string | null>(null);
  let lastSavedAt = $state<number | null>(null);
  let autoSaveTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

  // Writing style state (automatically inferred)
  let styleMetadata = $state<StyleMetadata>({});
  let styleValidation = $state<{ isValid: boolean; issues: string[] }>({ isValid: true, issues: [] });
  let wordCount = $state(0);
  let showCitationReminder = $state(false);
  
  // Automatically infer writing style based on content length
  function getInferredStyle(): WritingStyle {
    if (wordCount <= 100) return 'quick_point';
    if (wordCount <= 500) return 'journalistic';
    return 'academic';
  }
  
  let selectedStyle = $derived(getInferredStyle());
  
  // Citation management
  let showCitationForm = $state(false);

  // GraphQL mutation documents (without writing style fields until migration is applied)
  const CREATE_DISCUSSION = `mutation CreateDiscussion($title: String!, $description: String, $authorId: uuid!) { insert_discussion_one(object:{ title:$title, description:$description, created_by:$authorId }) { id } }`;
  const UPDATE_DISCUSSION = `mutation UpdateDiscussion($id: uuid!, $title: String!, $description: String!) { update_discussion_by_pk(pk_columns: {id: $id}, _set: {title: $title, description: $description}) { id title description } }`;


  async function createDraftDiscussion() {
    if (!user || discussionId) return;
    console.log('Creating draft discussion...');
    try {
      const discTitle = title.trim() || 'Untitled Discussion';
      const { data: discData, error: discError } = await nhost.graphql.request(CREATE_DISCUSSION, { 
        title: discTitle,
        description: content || '',
        authorId: user.id 
      });
      if (discError) {
        console.error('Failed to create discussion:', discError);
        return;
      }
      
      const newDiscussionId = (discData as any)?.insert_discussion_one?.id;
      if (newDiscussionId) {
        discussionId = newDiscussionId;
        lastSavedAt = Date.now();
        console.log('Draft discussion created:', newDiscussionId);
      }
    } catch (e) {
      console.error('Failed to create draft discussion:', e);
    }
  }

  async function autoSaveDiscussion() {
    if (!discussionId || !user) return;
    
    try {
      const { error } = await nhost.graphql.request(UPDATE_DISCUSSION, {
        id: discussionId,
        title: title.trim() || 'Untitled Discussion',
        description: content || ''
      });
      
      if (!error) {
        lastSavedAt = Date.now();
        console.log('Discussion auto-saved');
      }
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }

  function scheduleAutoSave() {
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
    autoSaveTimeout = setTimeout(() => {
      if (discussionId) {
        autoSaveDiscussion();
      } else if (user && (title.trim() || content.trim())) {
        createDraftDiscussion();
      }
    }, 1500); // Auto-save after 1.5 seconds of no typing
  }

  function onTitleInput(e: Event) {
    title = (e.target as HTMLInputElement).value;
    scheduleAutoSave();
  }

  function onContentInput(e: Event) {
    content = (e.target as HTMLTextAreaElement).value;
    
    // Calculate word count
    wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    
    // Show citation reminder based on content and style
    const hasNoCitations = !styleMetadata.citations || styleMetadata.citations.length === 0;
    const hasSubstantialContent = wordCount >= 50; // Any meaningful content can benefit from citations
    showCitationReminder = hasSubstantialContent && hasNoCitations;
    
    // Update style validation using the derived selectedStyle
    styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
    
    // Schedule auto-save
    scheduleAutoSave();
  }


  function addCitation(citation: Citation) {
    if (!styleMetadata.citations) {
      styleMetadata.citations = [];
    }
    styleMetadata.citations = [...styleMetadata.citations, citation];
    showCitationForm = false;
    
    // Update citation reminder status
    const hasSubstantialContent = wordCount >= 50;
    showCitationReminder = hasSubstantialContent && styleMetadata.citations.length === 0;
    
    styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
  }

  function removeCitation(id: string) {
    if (styleMetadata.citations) {
      styleMetadata.citations = styleMetadata.citations.filter(c => c.id !== id);
      
      // Update citation reminder status
      const hasSubstantialContent = wordCount >= 50;
      showCitationReminder = hasSubstantialContent && styleMetadata.citations.length === 0;
      
      styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
    }
  }

  function showAddCitationForm() {
    showCitationForm = true;
  }

  async function publishNewDiscussion() {
    publishError = null;
    if (!user) { publishError = 'Sign in required.'; return; }
    if (!title.trim()) { publishError = 'Title required.'; return; }
    if (!content.trim()) { publishError = 'Content required.'; return; }
    // Temporarily disable style validation until migration is applied
    // if (!styleValidation.isValid) { 
    //   publishError = `Style requirements not met: ${styleValidation.issues.join(', ')}`;
    //   return;
    // }
    
    publishing = true;
    try {
      // If we don't have a discussion yet, create one
      if (!discussionId) {
        await createDraftDiscussion();
        if (!discussionId) {
          throw new Error('Failed to create discussion');
        }
      }
      
      // Final save with current content
      await autoSaveDiscussion();
      
      // Navigate to the discussion
      goto(`/discussions/${discussionId}`);
    } catch (e: any) {
      publishError = e.message || 'Failed to publish.';
    } finally {
      publishing = false;
    }
  }

  const canPublish = $derived(() => !!user && title.trim().length > 0 && content.trim().length > 0 && !publishing);
</script>

<div class="container">
  <h1 class="title">Create a New Discussion</h1>
  <form onsubmit={(e) => { e.preventDefault(); publishNewDiscussion(); }}>
    <div class="form-group">
      <label for="title">Title</label>
      <input id="title" type="text" bind:value={title} placeholder="Enter a clear and concise title" oninput={onTitleInput} required />
    </div>
    
    <!-- Word Count and Style Info -->
    <div class="form-group">
      <div class="writing-info">
        <div class="word-count">
          <span class="word-count-label">Words: {wordCount}</span>
          <span class="style-indicator">({getStyleConfig(selectedStyle).label})</span>
        </div>
        
        {#if showCitationReminder}
          <div class="citation-reminder">
            <div class="reminder-icon">📚</div>
            <div class="reminder-text">
              <strong>Add citations</strong> to support any claims and improve credibility.
            </div>
            <button 
              type="button" 
              class="btn-add-citation-inline"
              onclick={() => showAddCitationForm()}
            >
              Add Citation
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Citations Management -->
    {#if wordCount > 0}
      <div class="form-group">
        <div class="citations-section">
          <div class="citations-header">
            <h3>Citations</h3>
            <button 
              type="button" 
              class="btn-add-citation"
              onclick={() => showAddCitationForm()}
            >
              + Add Citation
            </button>
          </div>
          
          <!-- Display existing citations -->
          {#if styleMetadata.citations && styleMetadata.citations.length > 0}
            <div class="citations-list">
              {#each styleMetadata.citations as citation}
                <div class="citation-item">
                  <div class="citation-content">
                    <div class="citation-title">{citation.title}</div>
                    <div class="citation-details">
                      {#if citation.author}<strong>{citation.author}</strong>{/if}
                      {#if citation.publishDate}({citation.publishDate}){/if}
                      {#if citation.publisher}. {citation.publisher}{/if}
                      {#if citation.pageNumber}, p. {citation.pageNumber}{/if}
                      {#if citation.accessed}. Accessed: {citation.accessed}{/if}
                    </div>
                    <div class="citation-point">
                      <strong>Supporting:</strong> {citation.pointSupported}
                    </div>
                    <div class="citation-quote">
                      <strong>Quote:</strong> "{citation.relevantQuote}"
                    </div>
                    <div class="citation-url">
                      <a href={citation.url} target="_blank" rel="noopener">{citation.url}</a>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    class="remove-citation"
                    onclick={() => removeCitation(citation.id)}
                  >×</button>
                </div>
              {/each}
            </div>
          {/if}
          
          <!-- Citation Form -->
          {#if showCitationForm}
            <CitationForm 
              onAdd={addCitation}
              onCancel={() => showCitationForm = false}
            />
          {/if}
        </div>
      </div>
    {/if}

    <div class="form-group">
      <label for="description">Description</label>
      <textarea 
        id="description" 
        bind:value={content} 
        rows="8" 
        placeholder="Share your thoughts... (Style will be automatically determined by length)"
        oninput={onContentInput}
      ></textarea>
      
      <!-- Style Validation -->
      {#if !styleValidation.isValid}
        <div class="style-validation-errors">
          {#each styleValidation.issues as issue}
            <div class="validation-issue">{issue}</div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="autosave-indicator" aria-live="polite">
      {#if discussionId && lastSavedAt}
        Draft saved {new Date(lastSavedAt).toLocaleTimeString()}
      {:else if discussionId}
        Draft created
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
    color: var(--color-text-primary);
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

  /* Writing Info and Citation Reminder */
  .writing-info {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .word-count {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .word-count-label {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .style-indicator {
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .citation-reminder {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border: 1px solid #f59e0b;
    border-radius: var(--border-radius-md);
    animation: slideIn 0.3s ease-out;
  }

  .reminder-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .reminder-text {
    flex: 1;
    font-size: 0.875rem;
    color: #92400e;
  }

  .btn-add-citation-inline {
    background: #f59e0b;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius-sm);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
    flex-shrink: 0;
  }

  .btn-add-citation-inline:hover {
    background: #d97706;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .style-validation-errors {
    background: color-mix(in srgb, #ef4444 10%, transparent);
    border: 1px solid #ef4444;
    border-radius: var(--border-radius-sm);
    padding: 0.5rem;
    margin-top: 0.5rem;
  }

  .validation-issue {
    font-size: 0.75rem;
    color: #ef4444;
    margin-bottom: 0.25rem;
  }

  .validation-issue:last-child {
    margin-bottom: 0;
  }

  /* Citations Section */
  .citations-section {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    padding: 1rem;
    background: var(--color-surface-alt);
  }

  .citations-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .citations-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .btn-add-citation {
    background: var(--color-primary);
    color: var(--color-surface);
    border: none;
    padding: 0.5rem 0.75rem;
    border-radius: var(--border-radius-sm);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-add-citation:hover {
    opacity: 0.9;
  }

  .citations-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .citation-item {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    padding: 1rem;
    position: relative;
  }

  .citation-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .citation-title {
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.3;
  }

  .citation-details {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .citation-point,
  .citation-quote {
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .citation-quote {
    font-style: italic;
    padding-left: 0.5rem;
    border-left: 3px solid var(--color-border);
  }

  .citation-url {
    font-size: 0.8rem;
  }

  .citation-url a {
    color: var(--color-primary);
    text-decoration: none;
    word-break: break-all;
  }

  .citation-url a:hover {
    text-decoration: underline;
  }

  .remove-citation {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
  }

  .remove-citation:hover {
    opacity: 0.8;
  }
</style>
