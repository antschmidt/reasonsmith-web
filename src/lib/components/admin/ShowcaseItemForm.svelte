<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';

	const dispatch = createEventDispatcher();

	type ShowcaseItem = {
		id: string;
		title: string;
		subtitle: string | null;
		media_type: string | null;
		creator: string | null;
		source_url: string | null;
		summary: string | null;
		analysis: any;
		tags: string[] | null;
		date_published: string | null;
		display_order: number | null;
		published: boolean;
		created_at: string;
		updated_at: string;
	};

	export let item: Partial<ShowcaseItem> | null = null;
	export let saving = false;

	// Form fields
	let title = item?.title || '';
	let subtitle = item?.subtitle || '';
	let mediaType = item?.media_type || 'article';
	let creator = item?.creator || '';
	let sourceUrl = item?.source_url || '';
	let summary = item?.summary || '';
	let analysisText = '';
	let tags = item?.tags?.join(', ') || '';
	let datePublished = item?.date_published || '';
	let displayOrder = item?.display_order || null;
	let published = item?.published || false;

	// URL import state
	let importUrl = '';
	let importing = false;
	let importError = '';

	// Discussion selection state
	type Discussion = {
		id: string;
		title: string;
		description: string;
		author: {
			display_name: string;
			handle: string;
		};
		created_at: string;
		good_faith_analysis: any;
	};

	let discussions: Discussion[] = [];
	let loadingDiscussions = false;
	let selectedDiscussionId = '';
	let discussionError = '';

	// Initialize analysis text from existing item
	if (item?.analysis) {
		if (typeof item.analysis === 'string') {
			analysisText = item.analysis;
		} else {
			try {
				analysisText = JSON.stringify(item.analysis, null, 2);
			} catch {
				analysisText = '';
			}
		}
	}

	function handleSubmit() {
		// Validate required fields
		if (!title.trim()) {
			alert('Title is required');
			return;
		}

		// Parse analysis
		let analysis = null;
		if (analysisText.trim()) {
			try {
				analysis = JSON.parse(analysisText);
			} catch {
				// If it's not valid JSON, store as string
				analysis = analysisText;
			}
		}

		// Parse tags
		const tagArray = tags
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0);

		const formData = {
			title: title.trim(),
			subtitle: subtitle.trim() || null,
			media_type: mediaType || null,
			creator: creator.trim() || null,
			source_url: sourceUrl.trim() || null,
			summary: summary.trim() || null,
			analysis,
			tags: tagArray.length > 0 ? tagArray : null,
			date_published: datePublished || null,
			display_order: displayOrder,
			published
		};

		dispatch('submit', formData);
	}

	function handleCancel() {
		dispatch('cancel');
	}

	async function loadDiscussions() {
		loadingDiscussions = true;
		discussionError = '';

		try {
			const result = await nhost.graphql.request(`
				query GetDiscussionsForShowcase {
					discussion(
						limit: 50
						order_by: { created_at: desc }
						where: {
							_and: [
								{ title: { _neq: "" } }
								{ description: { _neq: "" } }
							]
						}
					) {
						id
						title
						description
						author {
							display_name
							handle
						}
						created_at
						good_faith_analysis
					}
				}
			`);

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to load discussions'
					: result.error.message || 'Failed to load discussions';
				throw new Error(errorMessage);
			}

			discussions = result.data?.discussion || [];
		} catch (err: any) {
			discussionError = err.message || 'Failed to load discussions';
			console.error('Error loading discussions:', err);
		} finally {
			loadingDiscussions = false;
		}
	}

	async function selectDiscussion() {
		if (!selectedDiscussionId) {
			discussionError = 'Please select a discussion';
			return;
		}

		const selectedDiscussion = discussions.find((d) => d.id === selectedDiscussionId);
		if (!selectedDiscussion) {
			discussionError = 'Selected discussion not found';
			return;
		}

		// Populate form fields with discussion data
		title = selectedDiscussion.title;
		subtitle = ''; // Can be customized
		creator = selectedDiscussion.author.display_name || selectedDiscussion.author.handle;
		summary = selectedDiscussion.description;
		sourceUrl = `${window.location.origin}/discussions/${selectedDiscussion.id}`;
		mediaType = 'discussion';
		datePublished = selectedDiscussion.created_at.split('T')[0]; // Format as YYYY-MM-DD

		// Use existing good faith analysis if available
		if (selectedDiscussion.good_faith_analysis) {
			analysisText = JSON.stringify(selectedDiscussion.good_faith_analysis, null, 2);
		}

		// Clear selection
		selectedDiscussionId = '';
		discussionError = '';
	}

	async function importFromUrl() {
		if (!importUrl.trim()) {
			importError = 'Please enter a URL';
			return;
		}

		importing = true;
		importError = '';

		try {
			// Call the existing AI analysis endpoint
			const response = await fetch('/api/goodFaithClaudeFeatured', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					url: importUrl.trim()
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${await response.text()}`);
			}

			const result = await response.json();

			if (result.error) {
				throw new Error(result.error);
			}

			// Populate form fields with the imported data
			if (result.title) title = result.title;
			if (result.subtitle) subtitle = result.subtitle;
			if (result.creator) creator = result.creator;
			if (result.summary) summary = result.summary;
			if (result.analysis) {
				analysisText = JSON.stringify(result.analysis, null, 2);
			}
			if (result.sourceUrl) sourceUrl = result.sourceUrl;
			if (result.tags) tags = result.tags.join(', ');
			if (result.publishDate) datePublished = result.publishDate;

			// Clear the import URL
			importUrl = '';
		} catch (err: any) {
			importError = err.message || 'Failed to import content from URL';
			console.error('Import error:', err);
		} finally {
			importing = false;
		}
	}

	onMount(() => {
		loadDiscussions();
	});
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		handleSubmit();
	}}
	class="showcase-form"
>
	<!-- URL Import Section -->
	<div class="import-section">
		<h4>Import from URL (Optional)</h4>
		<p class="import-description">
			Automatically analyze content from a URL and populate the form fields.
		</p>
		<div class="import-controls">
			<input
				type="url"
				bind:value={importUrl}
				placeholder="https://example.com/article"
				class="import-input"
				disabled={importing || saving}
			/>
			<button
				type="button"
				class="btn-secondary import-btn"
				onclick={importFromUrl}
				disabled={importing || saving || !importUrl.trim()}
			>
				{#if importing}
					Importing...
				{:else}
					Import & Analyze
				{/if}
			</button>
		</div>
		{#if importError}
			<div class="import-error">{importError}</div>
		{/if}
	</div>

	<!-- Discussion Selection Section -->
	<div class="import-section">
		<h4>Select Existing Discussion (Optional)</h4>
		<p class="import-description">
			Choose from recent discussions to feature in the Editors' briefing room.
		</p>

		{#if loadingDiscussions}
			<div class="loading-discussions">Loading discussions...</div>
		{:else if discussions.length > 0}
			<div class="import-controls">
				<select bind:value={selectedDiscussionId} class="discussion-select" disabled={saving}>
					<option value="">Choose a discussion...</option>
					{#each discussions as discussion (discussion.id)}
						<option value={discussion.id}>
							{discussion.title} (by {discussion.author.display_name || discussion.author.handle})
						</option>
					{/each}
				</select>
				<button
					type="button"
					class="btn-secondary import-btn"
					onclick={selectDiscussion}
					disabled={saving || !selectedDiscussionId}
				>
					Use Discussion
				</button>
			</div>
		{:else}
			<div class="no-discussions">No discussions available</div>
		{/if}

		{#if discussionError}
			<div class="import-error">{discussionError}</div>
		{/if}
	</div>

	<!-- Basic Information -->
	<div class="form-section">
		<h4>Basic Information</h4>
		<div class="form-grid">
			<div class="form-group">
				<label for="title">Title *</label>
				<input
					id="title"
					type="text"
					bind:value={title}
					placeholder="Enter title"
					required
					disabled={saving}
					class="form-input"
				/>
			</div>

			<div class="form-group">
				<label for="subtitle">Subtitle</label>
				<input
					id="subtitle"
					type="text"
					bind:value={subtitle}
					placeholder="Enter subtitle"
					disabled={saving}
					class="form-input"
				/>
			</div>

			<div class="form-group">
				<label for="creator">Creator/Author</label>
				<input
					id="creator"
					type="text"
					bind:value={creator}
					placeholder="Author name"
					disabled={saving}
					class="form-input"
				/>
			</div>

			<div class="form-group">
				<label for="mediaType">Media Type</label>
				<select id="mediaType" bind:value={mediaType} disabled={saving} class="form-select">
					<option value="article">Article</option>
					<option value="discussion">Discussion</option>
					<option value="video">Video</option>
					<option value="podcast">Podcast</option>
					<option value="book">Book</option>
					<option value="paper">Research Paper</option>
					<option value="other">Other</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Content Details -->
	<div class="form-section">
		<h4>Content Details</h4>
		<div class="form-group">
			<label for="sourceUrl">Source URL</label>
			<input
				id="sourceUrl"
				type="url"
				bind:value={sourceUrl}
				placeholder="https://example.com"
				disabled={saving}
				class="form-input"
			/>
		</div>

		<div class="form-group">
			<label for="summary">Summary</label>
			<textarea
				id="summary"
				bind:value={summary}
				placeholder="Brief summary of the content..."
				rows="4"
				disabled={saving}
				class="form-textarea"
			></textarea>
		</div>

		<div class="form-group">
			<label for="analysis">Analysis (JSON)</label>
			<textarea
				id="analysis"
				bind:value={analysisText}
				placeholder={`{\"score\": 0.8, \"reasoning\": \"...\", \"highlights\": [...]}`}
				rows="8"
				disabled={saving}
				class="form-textarea code"
			></textarea>
			<div class="form-help">
				Enter structured analysis data in JSON format, or leave blank for plain text.
			</div>
		</div>
	</div>

	<!-- Metadata -->
	<div class="form-section">
		<h4>Metadata</h4>
		<div class="form-grid">
			<div class="form-group">
				<label for="tags">Tags</label>
				<input
					id="tags"
					type="text"
					bind:value={tags}
					placeholder="tag1, tag2, tag3"
					disabled={saving}
					class="form-input"
				/>
				<div class="form-help">Separate tags with commas</div>
			</div>

			<div class="form-group">
				<label for="datePublished">Date Published</label>
				<input
					id="datePublished"
					type="date"
					bind:value={datePublished}
					disabled={saving}
					class="form-input"
				/>
			</div>

			<div class="form-group">
				<label for="displayOrder">Display Order</label>
				<input
					id="displayOrder"
					type="number"
					bind:value={displayOrder}
					placeholder="1"
					min="0"
					disabled={saving}
					class="form-input"
				/>
				<div class="form-help">Lower numbers appear first in the carousel</div>
			</div>

			<div class="form-group">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={published} disabled={saving} class="form-checkbox" />
					<span class="checkbox-text">Published (visible to users)</span>
				</label>
			</div>
		</div>
	</div>

	<!-- Form Actions -->
	<div class="form-actions">
		<button type="button" class="btn-secondary" onclick={handleCancel} disabled={saving}>
			Cancel
		</button>
		<button type="submit" class="btn-primary" disabled={saving || !title.trim()}>
			{#if saving}
				Saving...
			{:else if item}
				Update Item
			{:else}
				Create Item
			{/if}
		</button>
	</div>
</form>

<style>
	.showcase-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.import-section {
		padding: 1rem;
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		border-radius: 12px;
	}

	.import-section h4 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.import-description {
		margin: 0 0 1rem 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.import-controls {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.import-input,
	.discussion-select {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		color: var(--color-text-primary);
		font-size: 0.9rem;
	}

	.discussion-select {
		cursor: pointer;
	}

	.discussion-select:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.import-btn {
		padding: 0.75rem 1rem;
		white-space: nowrap;
	}

	.import-error {
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		border-radius: 6px;
		color: #ef4444;
		font-size: 0.85rem;
	}

	.loading-discussions,
	.no-discussions {
		padding: 1rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		font-style: italic;
	}

	.form-section {
		padding: 1rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
	}

	.form-section h4 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.9rem;
	}

	.form-input,
	.form-select,
	.form-textarea {
		padding: 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		color: var(--color-text-primary);
		font-size: 0.9rem;
		transition: all 0.2s ease;
	}

	.form-input:focus,
	.form-select:focus,
	.form-textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.form-textarea {
		resize: vertical;
		min-height: 100px;
		font-family: inherit;
	}

	.form-textarea.code {
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
		font-size: 0.85rem;
	}

	.form-help {
		font-size: 0.8rem;
		color: var(--color-text-tertiary);
		margin-top: 0.25rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-weight: 500;
	}

	.form-checkbox {
		width: 1rem;
		height: 1rem;
		cursor: pointer;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		transition: all 0.2s ease;
		border: 1px solid;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: white;
		border-color: transparent;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.btn-secondary {
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		color: var(--color-text-primary);
		border-color: color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.btn-secondary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.btn-primary:disabled,
	.btn-secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	@media (max-width: 768px) {
		.form-grid {
			grid-template-columns: 1fr;
		}

		.import-controls {
			flex-direction: column;
			align-items: stretch;
		}

		.form-actions {
			flex-direction: column-reverse;
		}
	}
</style>
