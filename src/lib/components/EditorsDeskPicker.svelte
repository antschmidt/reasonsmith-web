<svelte:options runes={true} />

<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { CREATE_EDITORS_DESK_PICK } from '$lib/graphql/queries';
	import { getInitialPickStatus, generateExcerpt } from '$lib/utils/editorsDeskUtils';

	const props = $props<{
		isOpen: boolean;
		onClose: () => void;
		discussionId?: string;
		discussionTitle?: string;
		discussionDescription?: string;
		discussionAuthorId?: string;
		postId?: string;
		postContent?: string;
		postAuthorId?: string;
	}>();

	let title = $state('');
	let excerpt = $state('');
	let editorNote = $state('');
	let displayOrder = $state(0);
	let published = $state(false);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);

	const user = $derived(nhost.auth.getUser());
	const curatorId = $derived(user?.id);

	// Auto-populate fields when dialog opens
	$effect(() => {
		if (props.isOpen) {
			// Reset state
			success = false;
			error = null;
			submitting = false;

			// Set title based on content type
			if (props.discussionTitle) {
				title = props.discussionTitle;
			} else if (props.postContent) {
				// Extract first line or generate title from post
				const firstLine = props.postContent.split('\n')[0].substring(0, 100);
				title = firstLine || 'Featured Post';
			} else {
				title = '';
			}

			// Generate excerpt
			if (props.discussionDescription) {
				excerpt = generateExcerpt(props.discussionDescription, 200);
			} else if (props.postContent) {
				excerpt = generateExcerpt(props.postContent, 200);
			} else {
				excerpt = '';
			}

			editorNote = '';
			displayOrder = 0;

			// Default to published if curator is the author (no approval needed)
			// Otherwise default to unpublished until approved
			const authorId = props.discussionAuthorId || props.postAuthorId || curatorId;
			published = curatorId === authorId;
		}
	});

	const authorId = $derived(props.discussionAuthorId || props.postAuthorId || curatorId);
	const needsApproval = $derived(curatorId && authorId ? curatorId !== authorId : false);

	async function handleSubmit() {
		if (!curatorId || !authorId) {
			error = 'User not authenticated';
			return;
		}

		if (!title.trim()) {
			error = 'Title is required';
			return;
		}

		if (!props.discussionId && !props.postId) {
			error = 'No content selected';
			return;
		}

		submitting = true;
		error = null;

		try {
			const status = getInitialPickStatus(curatorId, authorId);

			const result = await nhost.graphql.request(CREATE_EDITORS_DESK_PICK, {
				title: title.trim(),
				excerpt: excerpt.trim() || null,
				editorNote: editorNote.trim() || null,
				displayOrder,
				discussionId: props.discussionId || null,
				postId: props.postId || null,
				authorId,
				curatorId,
				status,
				published
			});

			if (result.error) {
				throw new Error(
					Array.isArray(result.error)
						? result.error.map((e: any) => e.message).join('; ')
						: 'Failed to create pick'
				);
			}

			success = true;
			setTimeout(() => {
				props.onClose();
			}, 1500);
		} catch (err: any) {
			error = err.message || "Failed to create Editors' Desk pick";
		} finally {
			submitting = false;
		}
	}

	function handleClose() {
		if (!submitting) {
			props.onClose();
		}
	}
</script>

{#if props.isOpen}
	<div class="modal-backdrop" onclick={handleClose} role="presentation">
		<div
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-labelledby="picker-title"
			aria-modal="true"
		>
			<header class="modal-header">
				<h2 id="picker-title">Add to Editors' Desk</h2>
				<button
					class="close-button"
					onclick={handleClose}
					disabled={submitting}
					aria-label="Close dialog"
				>
					×
				</button>
			</header>

			<form
				class="modal-body"
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				{#if needsApproval}
					<div class="info-banner">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="10"></circle>
							<line x1="12" y1="16" x2="12" y2="12"></line>
							<line x1="12" y1="8" x2="12.01" y2="8"></line>
						</svg>
						<span>Author approval required before this pick is published</span>
					</div>
				{/if}

				<div class="form-group">
					<label for="title">
						Title <span class="required">*</span>
					</label>
					<input
						id="title"
						type="text"
						bind:value={title}
						placeholder="Title for the featured pick"
						required
						disabled={submitting}
					/>
				</div>

				<div class="form-group">
					<label for="excerpt">Excerpt</label>
					<textarea
						id="excerpt"
						bind:value={excerpt}
						placeholder="Brief summary or key excerpt (optional)"
						rows="3"
						disabled={submitting}
					></textarea>
					<span class="help-text">{excerpt.length}/200 characters</span>
				</div>

				<div class="form-group">
					<label for="editor-note">Editor's Note</label>
					<textarea
						id="editor-note"
						bind:value={editorNote}
						placeholder="Why is this piece noteworthy? (optional)"
						rows="3"
						disabled={submitting}
					></textarea>
					<span class="help-text">Explain why this content was selected for featuring</span>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="display-order">Display Order</label>
						<input
							id="display-order"
							type="number"
							bind:value={displayOrder}
							placeholder="0"
							disabled={submitting}
						/>
						<span class="help-text">Higher numbers appear first</span>
					</div>

					<div class="form-group">
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={published} disabled={submitting} />
							<span>Publish immediately</span>
						</label>
						<span class="help-text">Show on homepage after approval</span>
					</div>
				</div>

				{#if error}
					<div class="error-message">{error}</div>
				{/if}

				{#if success}
					<div class="success-message">
						Editors' Desk pick created successfully!
						{#if needsApproval}
							<br />Notification sent to author for approval.
						{/if}
					</div>
				{/if}

				<div class="modal-actions">
					<button
						type="button"
						class="button-secondary"
						onclick={handleClose}
						disabled={submitting}
					>
						Cancel
					</button>
					<button type="submit" class="button-primary" disabled={submitting || !title.trim()}>
						{#if submitting}
							Creating...
						{:else if needsApproval}
							Request Approval
						{:else}
							Create Pick
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	/* Light theme overlay - white semi-transparent background */
	:global([data-theme='light']) .modal-backdrop {
		background: rgba(255, 255, 255, 0.8);
	}

	.modal-content {
		background: var(--color-surface);
		border-radius: var(--border-radius-xl);
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h2 {
		margin: 0;
		font-family: var(--font-family-display);
		font-size: 1.5rem;
		color: var(--color-text-primary);
	}

	.close-button {
		background: transparent;
		border: none;
		font-size: 2rem;
		line-height: 1;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.close-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-border) 50%, transparent);
		color: var(--color-text-primary);
	}

	.close-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal-body {
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.info-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-accent) 25%, transparent);
		border-radius: var(--border-radius-md);
		color: var(--color-accent);
		font-size: 0.9rem;
	}

	.info-banner svg {
		flex-shrink: 0;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	label {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.95rem;
	}

	.required {
		color: var(--color-accent);
	}

	input[type='text'],
	input[type='number'],
	textarea {
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		background: var(--color-surface);
		color: var(--color-text-primary);
		font-size: 1rem;
		font-family: inherit;
		transition: all 0.2s ease;
	}

	input[type='text']:focus,
	input[type='number']:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
	}

	input[type='text']:disabled,
	input[type='number']:disabled,
	textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	textarea {
		resize: vertical;
		min-height: 80px;
	}

	.help-text {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-weight: 500;
	}

	.checkbox-label input[type='checkbox'] {
		width: 1.25rem;
		height: 1.25rem;
		cursor: pointer;
	}

	.error-message {
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 25%, transparent);
		border-radius: var(--border-radius-md);
		color: #ef4444;
		font-size: 0.9rem;
	}

	.success-message {
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, #10b981 10%, transparent);
		border: 1px solid color-mix(in srgb, #10b981 25%, transparent);
		border-radius: var(--border-radius-md);
		color: #10b981;
		font-size: 0.9rem;
	}

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		padding-top: 0.5rem;
	}

	.button-primary,
	.button-secondary {
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-md);
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.button-primary {
		background: var(--color-accent);
		color: white;
	}

	.button-primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-accent) 85%, black);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-accent) 25%, transparent);
	}

	.button-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.button-secondary {
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.button-secondary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, var(--color-border));
	}

	.button-secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.modal-content {
			max-width: 100%;
			max-height: 100vh;
			border-radius: 0;
		}

		.form-row {
			grid-template-columns: 1fr;
		}

		.modal-actions {
			flex-direction: column-reverse;
		}

		.button-primary,
		.button-secondary {
			width: 100%;
		}
	}
</style>
