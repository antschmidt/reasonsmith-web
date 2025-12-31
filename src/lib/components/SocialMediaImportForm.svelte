<svelte:options runes={true} />

<script lang="ts">
	/**
	 * SocialMediaImportForm - Component for importing social media posts as discussion context
	 *
	 * Allows users to quote contentious social media content that will be displayed as context
	 * but not subject to good-faith scoring. The user's response will still be evaluated.
	 */

	interface ImportData {
		source: string;
		url: string;
		content: string;
		author: string;
		date: string;
	}

	const props = $props<{
		initialData?: Partial<ImportData>;
		onSubmit?: (data: ImportData) => void;
		onCancel?: () => void;
		disabled?: boolean;
	}>();

	// Form state
	let source = $state(props.initialData?.source || '');
	let url = $state(props.initialData?.url || '');
	let content = $state(props.initialData?.content || '');
	let author = $state(props.initialData?.author || '');
	let date = $state(props.initialData?.date || '');

	// Only expand initially if there's actual data in initialData
	const hasInitialData =
		!!props.initialData?.source?.trim() ||
		!!props.initialData?.content?.trim() ||
		!!props.initialData?.author?.trim();
	let expanded = $state(false); // Always start collapsed - user clicks to open

	// Validation state
	let errors = $state<Partial<Record<keyof ImportData, string>>>({});

	// Derived state
	const isValid = $derived(
		source.trim().length > 0 && content.trim().length > 0 && author.trim().length > 0
	);

	const hasData = $derived(
		source.trim().length > 0 ||
			url.trim().length > 0 ||
			content.trim().length > 0 ||
			author.trim().length > 0 ||
			date.trim().length > 0
	);

	function validateForm(): boolean {
		errors = {};
		let valid = true;

		if (!source.trim()) {
			errors.source = 'Platform/source is required';
			valid = false;
		}

		if (!content.trim()) {
			errors.content = 'Content is required';
			valid = false;
		}

		if (!author.trim()) {
			errors.author = 'Author/username is required';
			valid = false;
		}

		if (url.trim() && !isValidUrl(url)) {
			errors.url = 'Please enter a valid URL';
			valid = false;
		}

		return valid;
	}

	function isValidUrl(urlString: string): boolean {
		try {
			new URL(urlString);
			return true;
		} catch {
			return false;
		}
	}

	function handleSubmit() {
		if (!validateForm()) return;

		const data: ImportData = {
			source: source.trim(),
			url: url.trim(),
			content: content.trim(),
			author: author.trim(),
			date: date.trim()
		};

		props.onSubmit?.(data);

		// Collapse the form after successful submission
		expanded = false;
	}

	function handleCancel() {
		// Just collapse the form without clearing data
		expanded = false;
		errors = {};
	}

	function handleRemove() {
		// Clear all data and notify parent
		clearForm();
		props.onCancel?.();
	}

	function clearForm() {
		source = '';
		url = '';
		content = '';
		author = '';
		date = '';
		errors = {};
		expanded = false;
	}
</script>

<div class="import-form-container">
	{#if !expanded && !hasData}
		<button
			class="expand-button"
			onclick={() => (expanded = true)}
			type="button"
			disabled={props.disabled}
		>
			<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
				<path
					d="M10 5V15M5 10H15"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
			<span>Import social media post as context</span>
		</button>
	{:else if !expanded && hasData}
		<div class="import-actions-bar">
			<div class="actions-info">
				<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
					<path
						d="M13 5L6 12L3 9"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span>Social media import added</span>
			</div>
			<div class="actions-buttons">
				<button
					class="action-btn"
					onclick={() => (expanded = true)}
					type="button"
					disabled={props.disabled}
				>
					<svg class="icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path
							d="M10 1L13 4L5 12H2V9L10 1Z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Edit
				</button>
				<button
					class="action-btn remove"
					onclick={handleRemove}
					type="button"
					disabled={props.disabled}
				>
					<svg class="icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path
							d="M11 3L3 11M3 3L11 11"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
					Remove
				</button>
			</div>
		</div>
	{:else}
		<div class="import-form" class:disabled={props.disabled}>
			<div class="form-header">
				<h3>Import Social Media Post</h3>
				<p class="form-description">
					Quote contentious content from social media to provide context for your discussion. This
					imported content will be displayed but not evaluated for good faith.
				</p>
			</div>

			<div class="form-fields">
				<div class="form-row">
					<div class="form-group">
						<label for="import-source">
							Platform/Source <span class="required">*</span>
						</label>
						<input
							id="import-source"
							type="text"
							bind:value={source}
							placeholder="e.g., Twitter, Facebook, Reddit"
							disabled={props.disabled}
							class:error={errors.source}
						/>
						{#if errors.source}
							<span class="error-message">{errors.source}</span>
						{/if}
					</div>

					<div class="form-group">
						<label for="import-author">
							Author/Username <span class="required">*</span>
						</label>
						<input
							id="import-author"
							type="text"
							bind:value={author}
							placeholder="e.g., @username"
							disabled={props.disabled}
							class:error={errors.author}
						/>
						{#if errors.author}
							<span class="error-message">{errors.author}</span>
						{/if}
					</div>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="import-url">URL (optional)</label>
						<input
							id="import-url"
							type="url"
							bind:value={url}
							placeholder="https://..."
							disabled={props.disabled}
							class:error={errors.url}
						/>
						{#if errors.url}
							<span class="error-message">{errors.url}</span>
						{/if}
					</div>

					<div class="form-group">
						<label for="import-date">Date (optional)</label>
						<input id="import-date" type="date" bind:value={date} disabled={props.disabled} />
					</div>
				</div>

				<div class="form-group full-width">
					<label for="import-content">
						Content <span class="required">*</span>
					</label>
					<textarea
						id="import-content"
						bind:value={content}
						placeholder="Paste the social media post content here..."
						rows="6"
						disabled={props.disabled}
						class:error={errors.content}
					></textarea>
					{#if errors.content}
						<span class="error-message">{errors.content}</span>
					{/if}
				</div>
			</div>

			<div class="form-actions">
				<button
					class="btn-secondary"
					onclick={handleCancel}
					type="button"
					disabled={props.disabled}
				>
					Cancel
				</button>
				<button
					class="btn-primary"
					onclick={handleSubmit}
					type="button"
					disabled={!isValid || props.disabled}
				>
					Add Import
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.import-form-container {
		margin: 1.5rem 0;
	}

	.expand-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
		border: 1px dashed var(--color-border);
		border-radius: var(--border-radius-md);
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.expand-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface) 95%, transparent);
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	.expand-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.icon {
		flex-shrink: 0;
	}

	/* Import actions bar (shown when import data exists) */
	.import-actions-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-accent) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent);
		border-radius: var(--border-radius-md);
	}

	.actions-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-accent);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.actions-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border-color: var(--color-accent);
	}

	.action-btn.remove:hover:not(:disabled) {
		border-color: var(--color-error);
		color: var(--color-error);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.import-form {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		padding: 1.5rem;
	}

	.import-form.disabled {
		opacity: 0.6;
		pointer-events: none;
	}

	.form-header {
		margin-bottom: 1.5rem;
	}

	.form-header h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 0.5rem 0;
	}

	.form-description {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.5;
	}

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-group.full-width {
		grid-column: 1 / -1;
	}

	.form-group label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.required {
		color: var(--color-error);
	}

	.form-group input,
	.form-group textarea {
		padding: 0.625rem 0.875rem;
		background: color-mix(in srgb, var(--color-background) 50%, transparent);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
		font-family: inherit;
		transition: all 0.2s ease;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--color-accent);
		background: var(--color-background);
	}

	.form-group input.error,
	.form-group textarea.error {
		border-color: var(--color-error);
	}

	.form-group input:disabled,
	.form-group textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-group textarea {
		resize: vertical;
		min-height: 8rem;
		line-height: 1.5;
	}

	.error-message {
		font-size: 0.75rem;
		color: var(--color-error);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--color-border);
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.625rem 1.25rem;
		border-radius: var(--border-radius-md);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.btn-primary {
		background: var(--color-accent);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-accent-hover);
		transform: translateY(-1px);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}

	.btn-secondary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface) 95%, transparent);
		color: var(--color-text-primary);
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.form-row {
			grid-template-columns: 1fr;
		}

		.import-form {
			padding: 1rem;
		}

		.form-actions {
			flex-direction: column-reverse;
		}

		.btn-primary,
		.btn-secondary {
			width: 100%;
		}
	}

	/* Light mode adjustments */
	:global([data-theme='light']) .expand-button {
		background: color-mix(in srgb, var(--color-surface) 85%, transparent);
	}

	:global([data-theme='light']) .expand-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
	}
</style>
