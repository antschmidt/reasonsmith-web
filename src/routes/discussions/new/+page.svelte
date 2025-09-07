<script lang="ts">
  import { page } from '$app/stores';
  import { nhost } from '$lib/nhostClient';
  import { goto } from '$app/navigation';
  import { WRITING_STYLES, getStyleConfig, validateStyleRequirements, type WritingStyle, type StyleMetadata, type Citation, type Source } from '$lib/types/writingStyle';
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

  // Writing style state
  let selectedStyle = $state<WritingStyle>('journalistic');
  let styleMetadata = $state<StyleMetadata>({});
  let styleValidation = $state<{ isValid: boolean; issues: string[] }>({ isValid: true, issues: [] });
  let showStyleHelper = $state(false);
  
  // Citation management
  let showCitationForm = $state(false);
  let citationFormType = $state<'citation' | 'source'>('citation');

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
    
    // Update style validation
    styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
    
    // Schedule auto-save
    scheduleAutoSave();
  }

  function onStyleChange(style: WritingStyle) {
    selectedStyle = style;
    styleMetadata = {}; // Reset metadata when style changes
    styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
  }

  function addCitation(citation: Citation) {
    if (!styleMetadata.citations) {
      styleMetadata.citations = [];
    }
    styleMetadata.citations = [...styleMetadata.citations, citation];
    showCitationForm = false;
    styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
  }

  function addSource(source: Source) {
    if (!styleMetadata.sources) {
      styleMetadata.sources = [];
    }
    styleMetadata.sources = [...styleMetadata.sources, source];
    showCitationForm = false;
    styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
  }

  function removeCitation(id: string) {
    if (styleMetadata.citations) {
      styleMetadata.citations = styleMetadata.citations.filter(c => c.id !== id);
      styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
    }
  }

  function removeSource(id: string) {
    if (styleMetadata.sources) {
      styleMetadata.sources = styleMetadata.sources.filter(s => s.id !== id);
      styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
    }
  }

  function showAddCitationForm(type: 'citation' | 'source') {
    citationFormType = type;
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
    
    <!-- Writing Style Selector -->
    <div class="form-group">
      <div class="style-selector">
        <div class="style-selector-header">
          <div class="style-label">Writing Style:</div>
          <button type="button" class="style-help-btn" onclick={() => showStyleHelper = !showStyleHelper}>
            {showStyleHelper ? 'Hide' : 'Show'} Help
          </button>
        </div>
        <div class="style-options">
          {#each Object.entries(WRITING_STYLES) as [value, config]}
            <label class="style-option" class:selected={selectedStyle === value}>
              <input 
                type="radio" 
                bind:group={selectedStyle} 
                value={value}
                onchange={() => onStyleChange(value as WritingStyle)}
              />
              <div class="style-option-content">
                <div class="style-title">{config.label}</div>
                <div class="style-description">{config.description}</div>
              </div>
            </label>
          {/each}
        </div>
        
        {#if showStyleHelper}
          <div class="style-helper">
            <h4>{getStyleConfig(selectedStyle).label} Guidelines:</h4>
            <ul>
              {#each getStyleConfig(selectedStyle).requirements as req}
                <li>{req}</li>
              {/each}
            </ul>
            <div class="word-count-guide">
              Word count: {getStyleConfig(selectedStyle).minWords}-{getStyleConfig(selectedStyle).maxWords} words
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Citations/Sources Management -->
    {#if selectedStyle === 'academic' || selectedStyle === 'journalistic'}
      <div class="form-group">
        <div class="citations-section">
          <div class="citations-header">
            <h3>{selectedStyle === 'academic' ? 'Citations' : 'Sources'}</h3>
            <button 
              type="button" 
              class="btn-add-citation"
              onclick={() => showAddCitationForm(selectedStyle === 'academic' ? 'citation' : 'source')}
            >
              + Add {selectedStyle === 'academic' ? 'Citation' : 'Source'}
            </button>
          </div>
          
          <!-- Display existing citations/sources -->
          {#if selectedStyle === 'academic' && styleMetadata.citations && styleMetadata.citations.length > 0}
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
          
          {#if selectedStyle === 'journalistic' && styleMetadata.sources && styleMetadata.sources.length > 0}
            <div class="citations-list">
              {#each styleMetadata.sources as source}
                <div class="citation-item">
                  <div class="citation-content">
                    <div class="citation-title">{source.title}</div>
                    <div class="citation-details">
                      {#if source.author}<strong>{source.author}</strong>{/if}
                      {#if source.publishDate}({source.publishDate}){/if}
                      {#if source.accessed}. Accessed: {source.accessed}{/if}
                    </div>
                    <div class="citation-point">
                      <strong>Supporting:</strong> {source.pointSupported}
                    </div>
                    <div class="citation-quote">
                      <strong>Quote:</strong> "{source.relevantQuote}"
                    </div>
                    <div class="citation-url">
                      <a href={source.url} target="_blank" rel="noopener">{source.url}</a>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    class="remove-citation"
                    onclick={() => removeSource(source.id)}
                  >×</button>
                </div>
              {/each}
            </div>
          {/if}
          
          <!-- Citation Form -->
          {#if showCitationForm}
            <CitationForm 
              type={citationFormType}
              onAdd={citationFormType === 'citation' ? addCitation : addSource}
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
        placeholder={getStyleConfig(selectedStyle).placeholder}
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

  /* Writing Style Selector */
  .style-selector {
    padding: 1rem;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
  }

  .style-selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .style-label {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-text-primary);
  }

  .style-help-btn {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: 0.75rem;
    cursor: pointer;
    text-decoration: underline;
  }

  .style-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .style-option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 2px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s;
  }

  .style-option:hover {
    border-color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary) 5%, transparent);
  }

  .style-option.selected {
    border-color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .style-option input[type="radio"] {
    margin: 0;
    margin-top: 0.125rem;
    width: 2rem;
  }

  .style-option-content {
    flex: 1;
  }

  .style-title {
    font-weight: 600;
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .style-description {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    line-height: 1.3;
  }

  .style-helper {
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--color-surface);
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--color-border);
  }

  .style-helper h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .style-helper ul {
    margin: 0 0 0.5rem 0;
    padding-left: 1.25rem;
    font-size: 0.8rem;
  }

  .style-helper li {
    margin-bottom: 0.25rem;
    color: var(--color-text-secondary);
  }

  .word-count-guide {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-style: italic;
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
