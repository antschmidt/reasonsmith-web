<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import { onMount } from 'svelte';
	import AnimatedLogo from '$lib/components/AnimatedLogo.svelte';
	import { UPDATE_DISCUSSION_VERSION_GOOD_FAITH } from '$lib/graphql/queries';
	import {
		formatChicagoCitation,
		processCitationReferences,
		type WritingStyle,
		type StyleMetadata,
		type Citation,
		getPostTypeConfig
	} from '$lib/types/writingStyle';
	import CitationForm from '$lib/components/CitationForm.svelte';

	// Get parameters
	const discussionId = $page.params.id;
	const draftId = $page.params.draft_id;

	// State
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);
	let publishing = $state(false);
	let loadAttempted = $state(false);

	// Good faith analysis state
	let goodFaithTesting = $state(false);
	let goodFaithResult = $state<any>(null);
	let goodFaithError = $state<string | null>(null);
	let lastAnalysisTime = $state<Date | null>(null);
	let lastEditTime = $state<Date | null>(null);

	// Draft data
	let draft = $state<any>(null);
	let discussion = $state<any>(null);

	// Form data
	let title = $state('');
	let description = $state('');

	// Writing style and citation state
	let selectedStyle = $state<WritingStyle>('journalistic');
	let styleMetadata = $state<StyleMetadata>({
		citations: []
	});
	let showCitationForm = $state(false);
	let editingCitation = $state<Citation | null>(null);

	// User
	let user = $state(nhost.auth.getUser());
	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
	});

	// Track content changes to determine if analysis is needed
	let initialLoadComplete = $state(false);
	let initialTitle = $state('');
	let initialDescription = $state('');

	$effect(() => {
		// Only track changes after initial load
		if (initialLoadComplete) {
			// Check if content has actually changed from initial values
			if (title !== initialTitle || description !== initialDescription) {
				console.log('Content changed, updating lastEditTime');
				lastEditTime = new Date();
			}
		}
	});

	// Computed property to check if publish should be available
	let canPublish = $derived.by(() => {
		// If no analysis has been run yet, can't publish
		if (!lastAnalysisTime) {
			console.log('canPublish: false - no analysis yet');
			return false;
		}

		// If no edits have been made since load, can publish
		if (!lastEditTime) {
			console.log('canPublish: true - analysis exists, no edits yet');
			return true;
		}

		// If analysis is more recent than last edit, can publish
		const result = lastAnalysisTime > lastEditTime;
		console.log('canPublish check:', {
			lastAnalysisTime,
			lastEditTime,
			result,
			analysisAfterEdit: result
		});
		return result;
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

			// Store initial values for change tracking
			initialTitle = title;
			initialDescription = description;

			// Mark initial load as complete to start tracking edits
			setTimeout(() => {
				initialLoadComplete = true;
			}, 100);
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

	async function analyzeGoodFaith() {
		if (!draft || !user) return null;

		goodFaithError = null;
		goodFaithResult = null;

		try {
			goodFaithTesting = true;
			let goodFaithData;

			try {
				const content = `${title.trim()}\n\n${description.trim()}`.trim();

				const response = await fetch('/api/goodFaithClaude', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						content: content
					})
				});

				const data = await response.json();

				// Convert score to 0-1 range if needed
				const score01 =
					typeof data.good_faith_score === 'number'
						? data.good_faith_score
						: typeof data.goodFaithScore === 'number'
							? data.goodFaithScore / 100
							: 0.5;

				goodFaithData = {
					score: score01,
					analysis: data.good_faith_analysis,
					label: data.good_faith_label,
				};

				// Store result for UI display
				goodFaithResult = {
					good_faith_score: score01,
					good_faith_label: data.good_faith_label,
					rationale: data.rationale,
					claims: data.claims,
					provider: data.provider
				};

				// Save to database
				const { error: saveError } = await nhost.graphql.request(UPDATE_DISCUSSION_VERSION_GOOD_FAITH, {
					versionId: draft.id,
					score: goodFaithData.score,
					label: goodFaithData.label,
					analysis: data // Save the complete analysis response
				});

				if (saveError) {
					console.error('Failed to save good faith analysis to database:', saveError);
					goodFaithError = 'Analysis completed but failed to save to database';
					return null;
				}

				// Update analysis timestamp
				lastAnalysisTime = new Date();

				console.log('Good faith analysis saved to database successfully');
				return goodFaithData;
			} catch (e: any) {
				console.error('Good faith analysis failed:', e);
				goodFaithError = e?.message || 'Failed to analyze discussion for good faith.';
				return null;
			}
		} finally {
			goodFaithTesting = false;
		}
	}

	// Citation management functions
	function addCitation(item: Citation) {
		styleMetadata.citations = [...(styleMetadata.citations || []), item];
		showCitationForm = false;
	}

	function removeCitation(id: string) {
		styleMetadata.citations = styleMetadata.citations?.filter((c) => c.id !== id) || [];
	}

	function startEditCitation(id: string) {
		const itemToEdit = styleMetadata.citations?.find((c) => c.id === id) || null;
		if (itemToEdit) {
			editingCitation = itemToEdit;
			showCitationForm = true;
		}
	}

	function updateCitation(updatedItem: Citation) {
		const index = styleMetadata.citations?.findIndex((c) => c.id === updatedItem.id) || -1;
		if (index !== -1) {
			styleMetadata.citations![index] = updatedItem;
		}
		showCitationForm = false;
		editingCitation = null;
	}

	function insertCitationReference(citationId: string) {
		const textarea = document.getElementById('draft-description') as HTMLTextAreaElement;
		if (!textarea) return;

		const cursorPos = textarea.selectionStart;
		const citationNumber = styleMetadata.citations?.findIndex((c) => c.id === citationId) + 1 || 1;

		const beforeText = description.slice(0, cursorPos);
		const afterText = description.slice(cursorPos);
		description = `${beforeText}[${citationNumber}]${afterText}`;

		// Restore cursor position after the inserted reference
		setTimeout(() => {
			textarea.focus();
			const newPosition = cursorPos + `[${citationNumber}]`.length;
			textarea.setSelectionRange(newPosition, newPosition);
		}, 0);
	}

	async function publishDraft() {
		if (!draft || !discussion || !user) return;

		try {
			publishing = true;
			error = null;

			// First save current changes
			await saveDraft();

			// Step 1: Check if we need to run good faith analysis
			let goodFaithData = null;

			if (canPublish) {
				// We already have a valid analysis, use existing data
				console.log('Using existing good faith analysis (newer than draft)');
				goodFaithData = {
					score: goodFaithResult.good_faith_score,
					label: goodFaithResult.good_faith_label,
					analysis: goodFaithResult
				};
			} else {
				// Need to run new analysis
				console.log('Running new good faith analysis for publish');
				goodFaithData = await analyzeGoodFaith();

				// Only proceed if good faith check passes
				if (!goodFaithData) {
					error = goodFaithError || 'Could not verify good-faith score. Cannot publish discussion.';
					return;
				}
			}

			// Step 2: Check if current published version has comments (posts)
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

			// Step 3: Handle existing published version
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

			// Step 4: Verify no published version exists before publishing
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

			// Step 5: Publish the draft (analysis already saved)
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
					<button
						type="button"
						class="btn-secondary logo-btn"
						onclick={analyzeGoodFaith}
						disabled={goodFaithTesting || saving || publishing}
						title={goodFaithTesting ? 'Analyzing good faith...' : 'Test good faith analysis'}
					>
						{#if goodFaithTesting}
							<AnimatedLogo size="20px" isAnimating={true} />
						{:else}
							<img src="/logo-only-transparent.svg" alt="Test Good Faith" width="20" height="20" />
						{/if}
					</button>
					{#if canPublish}
						<button
							type="button"
							class="btn-accent"
							onclick={publishDraft}
							disabled={publishing || saving}
						>
							{#if publishing}
								<AnimatedLogo size="20px" isAnimating={true} /> Publishing...
							{:else}
								Publish
							{/if}
						</button>
					{:else}
						<div class="publish-hint">
							<span class="hint-text">Run good faith analysis to enable publishing</span>
						</div>
					{/if}
				</div>
			</header>

			{#if error}
				<div class="error-banner">
					<p>{error}</p>
				</div>
			{/if}

			{#if goodFaithError}
				<div class="error-banner">
					<p>Good Faith Analysis Error: {goodFaithError}</p>
				</div>
			{/if}

			{#if goodFaithTesting}
				<div class="good-faith-analysis">
					<div class="analysis-progress">
						<AnimatedLogo size="18px" isAnimating={true} />
						<span>Analyzing content for good faith...</span>
					</div>
				</div>
			{/if}

			{#if goodFaithResult}
				<div class="good-faith-analysis">
					<div class="analysis-summary">
						<div class="analysis-badge {goodFaithResult.good_faith_label}">
							<span class="analysis-score">{(goodFaithResult.good_faith_score * 100).toFixed(0)}%</span>
							<span class="analysis-label">{goodFaithResult.good_faith_label}</span>
						</div>
					</div>
					{#if goodFaithResult.rationale}
						<div class="analysis-section">
							<strong>Analysis Summary:</strong>
							{goodFaithResult.rationale}
						</div>
					{/if}
					{#if goodFaithResult.claims && goodFaithResult.claims.length > 0}
						<div class="analysis-section">
							<strong>Claims Analysis:</strong>
							{#each goodFaithResult.claims as claimObj}
								<div class="claim-item">
									<div class="claim-text"><strong>Claim:</strong> {claimObj.claim}</div>
									{#if claimObj.supportingArguments}
										{#each claimObj.supportingArguments as arg}
											<div class="argument-item">
												{#if arg.argument}
													<div class="argument-text"><strong>Analysis:</strong> {arg.argument}</div>
												{/if}
												<span class="argument-score">Score: {arg.score}/10</span>
												{#if arg.fallacies && arg.fallacies.length > 0}
													<span class="fallacies">Fallacies: {arg.fallacies.join(', ')}</span>
												{/if}
												{#if arg.improvements}
													<div class="improvements"><strong>Improvements:</strong> {arg.improvements}</div>
												{/if}
											</div>
										{/each}
									{/if}
								</div>
							{/each}
						</div>
					{/if}
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
					<label for="draft-description">Description</label>
					<textarea
						id="draft-description"
						bind:value={description}
						placeholder="Describe your discussion..."
						rows="20"
						required
					></textarea>
				</div>

				<!-- Citations Section -->
				<div class="form-group">
					<div class="citations-header">
						<label>Citations</label>
						<button
							type="button"
							class="btn-secondary small"
							onclick={() => {
								editingCitation = null;
								showCitationForm = true;
							}}
						>
							Add Citation
						</button>
					</div>

					{#if styleMetadata.citations && styleMetadata.citations.length > 0}
						<div class="citations-list">
							{#each styleMetadata.citations as citation, index}
								<div class="citation-item">
									<div class="citation-content">
										<div class="citation-number">[{index + 1}]</div>
										<div class="citation-details">
											<div class="citation-title">{citation.title}</div>
											<div class="citation-formatted">
												{@html formatChicagoCitation(citation)}
											</div>
											<div class="citation-meta">
												<span class="point-supported">Point: {citation.point_supported}</span>
												{#if citation.relevant_quote}
													<span class="relevant-quote">Quote: "{citation.relevant_quote}"</span>
												{/if}
											</div>
										</div>
									</div>
									<div class="citation-actions">
										<button
											type="button"
											class="action-btn"
											onclick={() => insertCitationReference(citation.id)}
											title="Insert citation reference">Insert</button>
										<button
											type="button"
											class="action-btn"
											onclick={() => startEditCitation(citation.id)}
											title="Edit citation">Edit</button>
										<button
											type="button"
											class="action-btn danger"
											onclick={() => removeCitation(citation.id)}
											title="Remove citation">Remove</button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="no-citations">
							<p>No citations added yet. Citations help support your arguments and improve credibility.</p>
						</div>
					{/if}
				</div>
			</form>

			<!-- Citation Form Modal -->
			{#if showCitationForm}
				<div class="citation-modal">
					<div class="citation-modal-content">
						<div class="citation-modal-header">
							<h3>{editingCitation ? 'Edit Citation' : 'Add Citation'}</h3>
							<button
								type="button"
								class="close-btn"
								onclick={() => {
									showCitationForm = false;
									editingCitation = null;
								}}
							>
								✕
							</button>
						</div>
						<CitationForm
							citation={editingCitation}
							onAdd={addCitation}
							onUpdate={updateCitation}
							onCancel={() => {
								showCitationForm = false;
								editingCitation = null;
							}}
						/>
					</div>
				</div>
			{/if}

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
	/* Import sophisticated fonts */
	@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap');

	.draft-editor-container {
		min-height: 100vh;
		background: #fafafa;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 15px;
		line-height: 1.6;
		color: #1f2937;
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
		max-width: 800px;
		margin: 0 auto;
		padding: 3rem 2rem;
		background: #ffffff;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
		border-left: 1px solid #e5e7eb;
		border-right: 1px solid #e5e7eb;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-content h1 {
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 2.25rem;
		font-weight: 600;
		color: #111827;
		margin: 0 0 0.75rem 0;
		letter-spacing: -0.025em;
		line-height: 1.2;
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
		margin-bottom: 2.5rem;
	}

	.form-group:last-child {
		margin-bottom: 0;
	}

	label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.75rem;
		color: #374151;
		font-size: 15px;
		letter-spacing: 0.025em;
	}

	input,
	textarea {
		width: 100%;
		padding: 0.875rem 1rem;
		border: 1px solid #d1d5db;
		border-radius: 3px;
		background: #ffffff;
		color: #111827;
		font-family: inherit;
		font-size: 15px;
		line-height: 1.5;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: #6b7280;
		box-shadow: 0 0 0 3px rgba(107, 114, 128, 0.1);
	}

	textarea {
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 16px;
		line-height: 1.7;
		resize: vertical;
		min-height: 200px;
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
		padding: 0.625rem 1.25rem;
		border-radius: 3px;
		font-weight: 500;
		font-size: 14px;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
		letter-spacing: 0.025em;
	}

	.btn-primary {
		background: #374151;
		color: #ffffff;
		border-color: #374151;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1f2937;
		border-color: #1f2937;
	}

	.btn-secondary {
		background: #ffffff;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-secondary:hover:not(:disabled) {
		border-color: #374151;
		background: #f9fafb;
	}

	.btn-accent {
		background: #dc2626;
		color: #ffffff;
		border-color: #dc2626;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-accent:hover:not(:disabled) {
		background: #b91c1c;
		border-color: #b91c1c;
	}

	.logo-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.5rem;
		padding: 0.5rem;
	}

	.logo-btn img {
		opacity: 0.8;
		transition: opacity 0.2s ease;
		object-fit: contain;
		transform: none;
		filter: none;
	}

	.logo-btn:hover:not(:disabled) img {
		opacity: 1;
	}

	.publish-hint {
		display: flex;
		align-items: center;
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
		border-radius: var(--border-radius-sm);
	}

	.hint-text {
		font-size: 0.9rem;
		color: var(--color-warning);
		font-weight: 500;
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Good Faith Analysis Styles */
	.good-faith-analysis {
		margin: 1.5rem 0;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-primary) 3%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-radius: var(--border-radius);
	}

	.analysis-progress {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--color-text-secondary);
		font-size: 0.95rem;
	}

	.analysis-summary {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.analysis-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		font-weight: 500;
		font-size: 0.9rem;
	}

	.analysis-badge.constructive {
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
		border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent);
	}

	.analysis-badge.neutral {
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		color: var(--color-warning);
		border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
	}

	.analysis-badge.questionable,
	.analysis-badge.hostile {
		background: color-mix(in srgb, var(--color-error) 15%, transparent);
		color: var(--color-error);
		border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
	}

	.analysis-score {
		font-weight: 600;
		font-size: 1rem;
	}

	.analysis-section {
		margin-bottom: 1rem;
		color: var(--color-text-primary);
		line-height: 1.6;
	}

	.claim-item {
		margin: 1rem 0;
		padding: 1rem;
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		border-radius: var(--border-radius-sm);
		border-left: 3px solid var(--color-primary);
	}

	.claim-text {
		margin-bottom: 0.75rem;
		font-weight: 500;
	}

	.argument-item {
		margin: 0.75rem 0;
		padding: 0.75rem;
		background: var(--color-surface);
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
	}

	.argument-text {
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	.argument-score {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		font-size: 0.85rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
		margin-right: 0.5rem;
	}

	.fallacies {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		color: var(--color-error);
		font-size: 0.85rem;
		border-radius: var(--border-radius-sm);
	}

	.improvements {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		border-radius: var(--border-radius-sm);
		border-left: 3px solid var(--color-primary);
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	/* Citation Management Styles */
	.citations-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.citations-header label {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.btn-secondary.small {
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
	}

	.citations-list {
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius);
		background: var(--color-surface);
	}

	.citation-item {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.citation-item:last-child {
		border-bottom: none;
	}

	.citation-content {
		display: flex;
		gap: 1rem;
		flex: 1;
	}

	.citation-number {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 2rem;
	}

	.citation-details {
		flex: 1;
	}

	.citation-title {
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
	}

	.citation-formatted {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
		line-height: 1.4;
	}

	.citation-meta {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.point-supported {
		font-style: italic;
	}

	.relevant-quote {
		font-style: italic;
		color: var(--color-text-primary);
	}

	.citation-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.action-btn {
		padding: 0.25rem 0.75rem;
		font-size: 0.8rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-primary);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.action-btn:hover {
		background: var(--color-surface-alt);
		border-color: var(--color-primary);
	}

	.action-btn.danger:hover {
		background: var(--color-error);
		color: white;
		border-color: var(--color-error);
	}

	.no-citations {
		padding: 2rem;
		text-align: center;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: var(--border-radius);
	}

	.citation-modal {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.citation-modal-content {
		background: var(--color-surface);
		border-radius: var(--border-radius);
		box-shadow: var(--shadow-large);
		width: 100%;
		max-width: 600px;
		max-height: 90vh;
		overflow-y: auto;
	}

	.citation-modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.citation-modal-header h3 {
		margin: 0;
		color: var(--color-text-primary);
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0.25rem;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
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
