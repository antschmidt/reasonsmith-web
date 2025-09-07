<script lang="ts">
  import type { Citation, Source } from '$lib/types/writingStyle';
  
  export let type: 'citation' | 'source' = 'citation';
  export let onAdd: (item: Citation | Source) => void;
  export let onCancel: () => void;
  export let editingItem: Citation | Source | null = null; // For editing existing items
  
  let title = '';
  let url = '';
  let publishDate = '';
  let pointSupported = '';
  let relevantQuote = '';
  let pageNumber = ''; // For citations only
  let author = '';
  let publisher = ''; // For citations only
  
  let errors: Record<string, string> = {};

  // Initialize form fields if editing
  $: if (editingItem) {
    title = editingItem.title || '';
    url = editingItem.url || '';
    publishDate = editingItem.publishDate || '';
    pointSupported = editingItem.pointSupported || '';
    relevantQuote = editingItem.relevantQuote || '';
    author = editingItem.author || '';
    
    if (type === 'citation' && 'pageNumber' in editingItem) {
      pageNumber = editingItem.pageNumber || '';
      publisher = editingItem.publisher || '';
    }
  }
  
  function validateForm(): boolean {
    errors = {};
    
    if (!title.trim()) errors.title = 'Title is required';
    if (!url.trim()) errors.url = 'URL is required';
    if (!pointSupported.trim()) errors.pointSupported = 'Point supported is required';
    if (!relevantQuote.trim()) errors.relevantQuote = 'Relevant quote is required';
    
    // Basic URL validation
    if (url.trim() && !url.match(/^https?:\/\/.+/)) {
      errors.url = 'Please enter a valid URL (starting with http:// or https://)';
    }
    
    return Object.keys(errors).length === 0;
  }
  
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  function handleSubmit() {
    if (!validateForm()) return;
    
    const baseData = {
      id: editingItem?.id || generateId(), // Use existing ID if editing
      title: title.trim(),
      url: url.trim(),
      publishDate: publishDate.trim() || undefined,
      pointSupported: pointSupported.trim(),
      relevantQuote: relevantQuote.trim(),
      author: author.trim() || undefined,
    };
    
    if (type === 'citation') {
      const citation: Citation = {
        ...baseData,
        pageNumber: pageNumber.trim() || undefined,
        publisher: publisher.trim() || undefined,
      };
      onAdd(citation);
    } else {
      const source: Source = {
        ...baseData,
        accessed: editingItem && 'accessed' in editingItem ? editingItem.accessed : new Date().toLocaleDateString(),
      };
      onAdd(source);
    }
    
    // Reset form only if not editing (editing form will be closed by parent)
    if (!editingItem) {
      resetForm();
    }
  }

  function resetForm() {
    title = '';
    url = '';
    publishDate = '';
    pointSupported = '';
    relevantQuote = '';
    pageNumber = '';
    author = '';
    publisher = '';
    errors = {};
  }
</script>

<div class="citation-form">
  <h4>{editingItem ? 'Edit' : 'Add'} {type === 'citation' ? 'Citation' : 'Source'}</h4>
  
  <div class="form-grid">
    <div class="form-field">
      <label for="title">Title *</label>
      <input 
        id="title"
        type="text" 
        bind:value={title}
        placeholder="Enter the title of the source"
        class:error={errors.title}
      />
      {#if errors.title}<div class="error-text">{errors.title}</div>{/if}
    </div>
    
    <div class="form-field">
      <label for="url">URL *</label>
      <input 
        id="url"
        type="url" 
        bind:value={url}
        placeholder="https://example.com"
        class:error={errors.url}
      />
      {#if errors.url}<div class="error-text">{errors.url}</div>{/if}
    </div>
    
    <div class="form-field">
      <label for="author">Author</label>
      <input 
        id="author"
        type="text" 
        bind:value={author}
        placeholder="Author name (optional)"
      />
    </div>
    
    <div class="form-field">
      <label for="publishDate">Publish Date</label>
      <input 
        id="publishDate"
        type="date" 
        bind:value={publishDate}
      />
      <div class="field-help">Optional - leave blank if unknown</div>
    </div>
    
    {#if type === 'citation'}
      <div class="form-field">
        <label for="publisher">Publisher</label>
        <input 
          id="publisher"
          type="text" 
          bind:value={publisher}
          placeholder="Publisher name (optional)"
        />
      </div>
      
      <div class="form-field">
        <label for="pageNumber">Page Number</label>
        <input 
          id="pageNumber"
          type="text" 
          bind:value={pageNumber}
          placeholder="e.g., 42, 15-18 (optional)"
        />
      </div>
    {/if}
  </div>
  
  <div class="form-field">
    <label for="pointSupported">Point Being Supported *</label>
    <textarea 
      id="pointSupported"
      bind:value={pointSupported}
      rows="2"
      placeholder="Describe the specific claim or point this source supports"
      class:error={errors.pointSupported}
    ></textarea>
    {#if errors.pointSupported}<div class="error-text">{errors.pointSupported}</div>{/if}
  </div>
  
  <div class="form-field">
    <label for="relevantQuote">Relevant Quote *</label>
    <textarea 
      id="relevantQuote"
      bind:value={relevantQuote}
      rows="3"
      placeholder="Copy the exact text from the source that supports your point"
      class:error={errors.relevantQuote}
    ></textarea>
    {#if errors.relevantQuote}<div class="error-text">{errors.relevantQuote}</div>{/if}
  </div>
  
  <div class="form-actions">
    <button type="button" class="btn-primary" onclick={handleSubmit}>
      {editingItem ? 'Update' : 'Add'} {type === 'citation' ? 'Citation' : 'Source'}
    </button>
    <button type="button" class="btn-secondary" onclick={onCancel}>
      Cancel
    </button>
  </div>
</div>

<style>
  .citation-form {
    background: var(--color-surface);
    border: 2px solid var(--color-primary);
    border-radius: var(--border-radius-md);
    padding: 1.5rem;
    margin: 1rem 0;
  }
  
  .citation-form h4 {
    margin: 0 0 1rem 0;
    color: var(--color-primary);
    font-size: 1rem;
    font-weight: 600;
  }
  
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .form-field:last-of-type {
    grid-column: 1 / -1;
  }
  
  .form-field label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .form-field input,
  .form-field textarea {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    font: inherit;
    background: var(--color-surface);
    color: var(--color-text-primary);
  }
  
  .form-field input:focus,
  .form-field textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  
  .form-field input.error,
  .form-field textarea.error {
    border-color: #ef4444;
  }
  
  .field-help {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-style: italic;
  }
  
  .error-text {
    font-size: 0.75rem;
    color: #ef4444;
    margin-top: 0.25rem;
  }
  
  .form-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
  
  .btn-primary {
    background: var(--color-primary);
    color: var(--color-surface);
    border: none;
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius-sm);
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  
  .btn-primary:hover {
    opacity: 0.9;
  }
  
  .btn-secondary {
    background: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .btn-secondary:hover {
    background: var(--color-surface-alt);
  }
  
  @media (max-width: 640px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
  }
</style>