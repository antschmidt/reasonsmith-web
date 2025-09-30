<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import { onMount } from 'svelte';

	// Get parameters
	const discussionId = $page.params.id;
	const draftId = $page.params.draft_id;

	// State
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);
	let publishing = $state(false);
	let loadAttempted = $state(false);

	// Draft data
	let draft = $state<any>(null);
	let discussion = $state<any>(null);

	// Form data
	let title = $state('');
	let description = $state('');

	// User
	let user = $state(nhost.auth.getUser());
	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
	});

	async function loadDraft() {
		try {
			loading = true;
			error = null;
			loadAttempted = true;

			// Load both the discussion and the specific draft
			const [discussionResult, draftResult] = await Promise.all([
				nhost.graphql.request(
					`
					query GetDiscussion($discussionId: uuid!) {
						discussion_by_pk(id: $discussionId) {
							id
							status
							created_by
							created_at
							is_anonymous
							contributor {
								id
								handle
								display_name
							}
							current_version: discussion_versions(
								where: { version_type: { _eq: "published" } }
								order_by: { version_number: desc }
								limit: 1
							) {
								id
								title
								description
								good_faith_score
								good_faith_label
								good_faith_last_evaluated
							}
						}
					}
				`,
					{ discussionId }
				),

				nhost.graphql.request(
					`
					query GetDraft($draftId: uuid!) {
						discussion_version_by_pk(id: $draftId) {
							id
							title
							description
							created_by
							version_type
							discussion_id
							good_faith_score
							good_faith_label
							good_faith_last_evaluated
						}
					}
				`,
					{ draftId }
				)
			]);

			if (discussionResult.error) {
				console.error('Discussion query error:', discussionResult.error);
				throw new Error(`Failed to load discussion: ${JSON.stringify(discussionResult.error)}`);
			}

			if (draftResult.error) {
				console.error('Draft query error:', draftResult.error);
				throw new Error(`Failed to load draft: ${JSON.stringify(draftResult.error)}`);
			}

			discussion = discussionResult.data?.discussion_by_pk;
			draft = draftResult.data?.discussion_version_by_pk;

			if (!discussion) {
				throw new Error('Discussion not found');
			}

			if (!draft) {
				throw new Error('Draft not found');
			}

			// Check permissions
			if (draft.created_by !== user?.id) {
				throw new Error('You do not have permission to edit this draft');
			}

			if (draft.discussion_id !== discussionId) {
				throw new Error('Draft does not belong to this discussion');
			}

			// Initialize form
			title = draft.title || '';
			description = draft.description || '';
		} catch (err: any) {
			console.error('Error loading draft:', err);
			error = err.message || 'Failed to load draft';
		} finally {
			loading = false;
		}
	}

	async function saveDraft() {
		if (!draft || !user) return;

		try {
			saving = true;
			error = null;

			const result = await nhost.graphql.request(
				`
				mutation UpdateDraft($draftId: uuid!, $title: String!, $description: String!) {
					update_discussion_version_by_pk(
						pk_columns: { id: $draftId }
						_set: {
							title: $title
							description: $description
						}
					) {
						id
						title
						description
					}
				}
			`,
				{
					draftId: draft.id,
					title: title.trim(),
					description: description.trim()
				}
			);

			if (result.error) {
				throw new Error('Failed to save draft');
			}

			// Update local state
			draft.title = title.trim();
			draft.description = description.trim();
		} catch (err: any) {
			console.error('Error saving draft:', err);
			error = err.message || 'Failed to save draft';
		} finally {
			saving = false;
		}
	}

	async function publishDraft() {
		if (!draft || !discussion || !user) return;

		try {
			publishing = true;
			error = null;

			// First save current changes
			await saveDraft();

			// Step 1: Check if current published version has comments (posts)
			const commentsCheck = await nhost.graphql.request(
				`
				query CheckVersionComments($discussionId: uuid!) {
					discussion_version(
						where: {
							discussion_id: { _eq: $discussionId }
							version_type: { _eq: "published" }
						}
					) {
						id
						version_number
					}
					post_aggregate(
						where: {
							discussion_id: { _eq: $discussionId }
							context_version_id: { _is_null: false }
						}
					) {
						aggregate {
							count
						}
						nodes {
							context_version_id
						}
					}
				}
			`,
				{
					discussionId: discussion.id
				}
			);

			if (commentsCheck.error) {
				console.error('Comments check GraphQL error:', commentsCheck.error);
				throw new Error(`Failed to check for comments: ${JSON.stringify(commentsCheck.error)}`);
			}

			const currentPublished = commentsCheck.data?.discussion_version?.[0];
			const allPosts = commentsCheck.data?.post_aggregate?.nodes || [];

			console.log('Comments check result:', {
				currentPublished,
				allPostsCount: allPosts.length,
				allPosts
			});

			// Check if current published version has comments on it specifically
			const commentsOnCurrentVersion = allPosts.filter(
				(post) => post.context_version_id === currentPublished?.id
			).length;

			console.log('Publishing analysis:', {
				currentPublishedId: currentPublished?.id,
				commentsOnCurrentVersion,
				hasComments: commentsOnCurrentVersion > 0,
				action: commentsOnCurrentVersion > 0 ? 'archive' : 'archive',
				commentsData: allPosts.map((p) => ({ id: p.context_version_id }))
			});

			// Step 2: Handle existing published version
			if (currentPublished) {
				if (commentsOnCurrentVersion > 0) {
					console.log('Archiving version with comments:', {
						versionId: currentPublished.id,
						commentsCount: commentsOnCurrentVersion
					});

					// Archive current published version if it has comments
					const archiveResult = await nhost.graphql.request(
						`
						mutation ArchiveVersion($versionId: uuid!) {
							update_discussion_version_by_pk(
								pk_columns: { id: $versionId }
								_set: { version_type: "archived" }
							) {
								id
								version_type
							}
						}
					`,
						{
							versionId: currentPublished.id
						}
					);

					console.log('Archive result for version with comments:', archiveResult);

					if (archiveResult.error) {
						console.error('Archive version GraphQL error:', archiveResult.error);
						throw new Error(
							`Failed to archive existing version: ${JSON.stringify(archiveResult.error)}`
						);
					}

					// Verify the archive actually worked
					if (!archiveResult.data?.update_discussion_version_by_pk) {
						console.error('Archive operation returned no data, likely permissions issue');
						throw new Error(
							'Archive operation failed - likely insufficient permissions to update published versions'
						);
					}

					console.log('Successfully archived published version with comments:', {
						versionId: currentPublished.id,
						newVersionType: archiveResult.data.update_discussion_version_by_pk.version_type
					});
				} else {
					// Archive current published version (can't delete published versions due to permissions)
					const archiveResult = await nhost.graphql.request(
						`
						mutation ArchiveVersion($versionId: uuid!) {
							update_discussion_version_by_pk(
								pk_columns: { id: $versionId }
								_set: { version_type: "archived" }
							) {
								id
								version_type
							}
						}
					`,
						{
							versionId: currentPublished.id
						}
					);

					if (archiveResult.error) {
						console.error('Archive version GraphQL error:', archiveResult.error);
						throw new Error(
							`Failed to archive existing version: ${JSON.stringify(archiveResult.error)}`
						);
					}

					// Verify the archive actually worked
					if (!archiveResult.data?.update_discussion_version_by_pk) {
						console.error('Archive operation returned no data, likely permissions issue');
						throw new Error(
							'Archive operation failed - likely insufficient permissions to update published versions'
						);
					}

					console.log('Archived published version without comments:', currentPublished.id);
				}
			}

			// Step 3: Verify no published version exists before publishing
			const verifyCheck = await nhost.graphql.request(
				`
				query VerifyNoPublished($discussionId: uuid!) {
					discussion_version(
						where: {
							discussion_id: { _eq: $discussionId }
							version_type: { _eq: "published" }
						}
					) {
						id
						version_number
						version_type
					}
				}
			`,
				{
					discussionId: discussion.id
				}
			);

			const remainingPublished = verifyCheck.data?.discussion_version || [];
			console.log('Verification before publish:', {
				remainingPublished,
				shouldBeEmpty: remainingPublished.length === 0,
				detailedVersions: remainingPublished.map((v) => ({
					id: v.id,
					version_number: v.version_number,
					version_type: v.version_type,
					isCurrentPublished: v.id === currentPublished?.id
				}))
			});

			// Step 4: Publish the draft
			const result = await nhost.graphql.request(
				`
				mutation PublishDraft($draftId: uuid!) {
					update_discussion_version_by_pk(
						pk_columns: { id: $draftId }
						_set: {
							version_type: "published"
						}
					) {
						id
						version_type
					}
				}
			`,
				{
					draftId: draft.id
				}
			);

			if (result.error) {
				console.error('Publish draft GraphQL error:', result.error);
				throw new Error(`Failed to publish draft: ${JSON.stringify(result.error)}`);
			}

			// Redirect to the published discussion
			await goto(`/discussions/${discussionId}`);
		} catch (err: any) {
			console.error('Error publishing draft:', err);
			error = err.message || 'Failed to publish draft';
		} finally {
			publishing = false;
		}
	}

	function cancel() {
		goto(`/discussions/${discussionId}`);
	}

	onMount(() => {
		if (user) {
			loadDraft();
		}
	});

	// Reload when user changes
	$effect(() => {
		if (user && !loading && !draft && !loadAttempted) {
			loadDraft();
		}
	});

	// Auto-save every 10 seconds
	let autoSaveInterval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (draft && !loading) {
			// Set up auto-save
			autoSaveInterval = setInterval(() => {
				if (
					!saving &&
					!publishing &&
					(title !== draft.title || description !== draft.description)
				) {
					saveDraft();
				}
			}, 10000);

			return () => {
				if (autoSaveInterval) {
					clearInterval(autoSaveInterval);
				}
			};
		}
	});
</script>

<svelte:head>
	<title>{title ? `Editing: ${title}` : 'Editing Draft'} - ReasonSmith</title>
</svelte:head>

<div class="draft-editor-container">
	{#if loading}
		<div class="loading">
			<p>Loading draft...</p>
		</div>
	{:else if error}
		<div class="error">
			<h2>Error</h2>
			<p>{error}</p>
			<button
				type="button"
				class="btn-secondary"
				onclick={() => goto(`/discussions/${discussionId}`)}
			>
				Back to Discussion
			</button>
		</div>
	{:else if draft && discussion}
		<div class="draft-editor">
			<header class="editor-header">
				<div class="header-content">
					<h1>Editing Draft</h1>
					<p class="discussion-context">
						for <a href="/discussions/{discussionId}"
							>{discussion.current_version?.[0]?.title || 'Discussion'}</a
						>
					</p>
				</div>
				<div class="header-actions">
					<button type="button" class="btn-secondary" onclick={cancel}>Cancel</button>
					<button type="button" class="btn-primary" onclick={saveDraft} disabled={saving}>
						{saving ? 'Saving...' : 'Save Draft'}
					</button>
					<button
						type="button"
						class="btn-accent"
						onclick={publishDraft}
						disabled={publishing || saving}
					>
						{publishing ? 'Publishing...' : 'Publish'}
					</button>
				</div>
			</header>

			{#if error}
				<div class="error-banner">
					<p>{error}</p>
				</div>
			{/if}

			<form
				class="editor-form"
				onsubmit={(e) => {
					e.preventDefault();
					saveDraft();
				}}
			>
				<div class="form-group">
					<label for="title">Title</label>
					<input
						id="title"
						type="text"
						bind:value={title}
						placeholder="Discussion title..."
						required
					/>
				</div>

				<div class="form-group">
					<label for="description">Description</label>
					<textarea
						id="description"
						bind:value={description}
						placeholder="Describe your discussion..."
						rows="20"
						required
					></textarea>
				</div>
			</form>

			<footer class="editor-footer">
				<div class="status-info">
					{#if saving}
						<span class="status saving">Saving...</span>
					{:else}
						<span class="status saved">Saved</span>
					{/if}
				</div>
			</footer>
		</div>
	{/if}
</div>

<style>
	.draft-editor-container {
		min-height: 100vh;
		background: var(--color-surface-alt);
	}

	.loading,
	.error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		text-align: center;
		padding: 2rem;
	}

	.error h2 {
		color: var(--color-accent);
		margin-bottom: 1rem;
	}

	.draft-editor {
		max-width: 1000px;
		margin: 0 auto;
		padding: 2rem;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.header-content h1 {
		font-size: 2rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		color: var(--color-text-primary);
	}

	.discussion-context {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.discussion-context a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.discussion-context a:hover {
		text-decoration: underline;
	}

	.header-actions {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.error-banner {
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
		border: 1px solid var(--color-accent);
		border-radius: var(--border-radius-sm);
		padding: 1rem;
		margin-bottom: 2rem;
		color: var(--color-accent);
	}

	.editor-form {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 2rem;
		margin-bottom: 2rem;
	}

	.form-group {
		margin-bottom: 2rem;
	}

	.form-group:last-child {
		margin-bottom: 0;
	}

	label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
	}

	input,
	textarea {
		width: 100%;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		background: var(--color-surface);
		color: var(--color-text-primary);
		font-family: inherit;
		font-size: 1rem;
		transition: border-color var(--transition-speed) ease;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	textarea {
		resize: vertical;
		line-height: 1.6;
	}

	.editor-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.status {
		font-size: 0.9rem;
		font-weight: 500;
	}

	.status.saving {
		color: var(--color-accent);
	}

	.status.saved {
		color: var(--color-primary);
	}

	/* Button styles */
	.btn-primary,
	.btn-secondary,
	.btn-accent {
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-sm);
		font-weight: 600;
		border: none;
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		font-size: 0.9rem;
	}

	.btn-primary {
		background: var(--color-primary);
		color: var(--color-surface);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-accent);
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.btn-secondary:hover:not(:disabled) {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.btn-accent {
		background: var(--color-accent);
		color: var(--color-surface);
	}

	.btn-accent:hover:not(:disabled) {
		background: var(--color-primary);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.draft-editor {
			padding: 1rem;
		}

		.editor-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}

		.header-actions {
			justify-content: flex-end;
		}

		.editor-form {
			padding: 1.5rem;
		}
	}
</style>
