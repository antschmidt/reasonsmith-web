<script lang="ts">
	import type { Citation } from '$lib/types/writingStyle';
	import Button from '../ui/Button.svelte';

	interface Props {
		onAdd: (item: Citation) => void;
		onCancel: () => void;
		editingItem?: Citation | null;
	}

	let { onAdd, onCancel, editingItem = null }: Props = $props();

	let title = $state('');
	let url = $state('');
	let publishDate = $state('');
	let pointSupported = $state('');
	let relevantQuote = $state('');
	let pageNumber = $state(''); // For academic citations
	let author = $state('');
	let publisher = $state(''); // For academic citations
	let accessed = $state(''); // For journalistic sources

	let errors = $state<Record<string, string>>({});

	// Track the ID of the citation being edited to prevent re-initialization
	let currentEditingId = $state<string | null>(null);

	// Initialize form fields if editing
	$effect(() => {
		console.log('[CitationForm] $effect triggered, editingItem:', editingItem);
		const editingId = editingItem?.id || null;

		// Only reinitialize if we're editing a different citation or switching between add/edit modes
		if (editingId !== currentEditingId) {
			currentEditingId = editingId;

			if (editingItem) {
				console.log('[CitationForm] Initializing form with editingItem data');
				title = editingItem.title || '';
				url = editingItem.url || '';
				publishDate = editingItem.publish_date || '';
				pointSupported = editingItem.point_supported || '';
				relevantQuote = editingItem.relevant_quote || '';
				author = editingItem.author || '';

				pageNumber = editingItem.page_number || '';
				publisher = editingItem.publisher || '';
				accessed = editingItem.accessed_date || '';
			} else {
				console.log('[CitationForm] Resetting form (no editingItem)');
				// Reset form when not editing
				resetForm();
			}
		}
	});

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
		// Generate a UUID v4
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			const r = Math.random() * 16 | 0;
			const v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	function handleSubmit() {
		console.log('[CitationForm] handleSubmit called');
		console.log('[CitationForm] editingItem:', editingItem);
		console.log('[CitationForm] Current form values:', {
			title,
			url,
			publishDate,
			pointSupported,
			relevantQuote,
			author,
			pageNumber,
			publisher,
			accessed
		});

		if (!validateForm()) return;

		const baseData = {
			id: editingItem?.id || generateId(), // Use existing ID if editing
			title: title.trim(),
			url: url.trim(),
			publish_date: publishDate.trim() || undefined,
			point_supported: pointSupported.trim(),
			relevant_quote: relevantQuote.trim(),
			author: author.trim() || undefined
		};

		const citation: Citation = {
			...baseData,
			page_number: pageNumber.trim() || undefined,
			publisher: publisher.trim() || undefined,
			accessed_date: accessed.trim() || undefined // Include accessed date for journalistic sources
		};

		console.log('[CitationForm] Submitting citation:', citation);
		onAdd(citation);

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
		accessed = '';
		errors = {};
	}
</script>

<div class="citation-form">
	<h4>{editingItem ? 'Edit' : 'Add'} Citation</h4>

	<div class="form-field full-width">
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

	<div class="form-grid">
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
			<input id="author" type="text" bind:value={author} placeholder="Author name (optional)" />
		</div>

		<div class="form-field">
			<label for="publishDate">Publish Date</label>
			<input id="publishDate" type="date" bind:value={publishDate} />
			<div class="field-help">Optional - leave blank if unknown</div>
		</div>

		<div class="form-field">
			<label for="publisher">Publisher</label>
			<input
				id="publisher"
				type="text"
				bind:value={publisher}
				placeholder="Publisher name (optional, for academic sources)"
			/>
		</div>

		<div class="form-field">
			<label for="pageNumber">Page Number</label>
			<input
				id="pageNumber"
				type="text"
				bind:value={pageNumber}
				placeholder="e.g., 42, 15-18 (optional, for academic sources)"
			/>
		</div>

		<div class="form-field">
			<label for="accessed">Access Date</label>
			<input
				id="accessed"
				type="text"
				bind:value={accessed}
				placeholder="e.g., March 15, 2024 (optional, for web sources)"
			/>
		</div>
	</div>

	<div class="form-field">
		<label for="pointSupported">Point Being Supported *</label>
		<textarea
			id="pointSupported"
			bind:value={pointSupported}
			rows="5"
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
			rows="5"
			placeholder="Copy the exact text from the source that supports your point"
			class:error={errors.relevantQuote}
		></textarea>
		{#if errors.relevantQuote}<div class="error-text">{errors.relevantQuote}</div>{/if}
	</div>

	<div class="form-actions">
		<Button type="button" variant="secondary" onclick={handleSubmit}>
			{editingItem ? 'Update' : 'Add'} Citation
		</Button>
		<Button type="button" variant="secondary" onclick={onCancel}>Cancel</Button>
	</div>
</div>

<style>
	.citation-form {
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 1.5rem;
		margin: 1rem 0;
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 10%, transparent);
	}

	.citation-form h4 {
		margin: 0 0 1rem 0;
		color: var(--color-text-primary);
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

	.form-field.full-width {
		margin-bottom: 1rem;
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
		padding: 0.875rem 1rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 16px;
		font: inherit;
		background: color-mix(in srgb, var(--color-input-bg) 60%, transparent);
		color: var(--color-text-primary);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.form-field input:focus,
	.form-field textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-input-bg) 80%, transparent);
		box-shadow:
			0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent),
			0 4px 12px color-mix(in srgb, var(--color-primary) 8%, transparent);
		transform: translateY(-1px);
	}

	.form-field input.error,
	.form-field textarea.error {
		border-color: var(--color-error);
	}

	.field-help {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.error-text {
		font-size: 0.75rem;
		color: var(--color-error);
		margin-top: 0.25rem;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	@media (max-width: 768px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
