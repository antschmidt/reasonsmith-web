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
	import Button from '$lib/components/Button.svelte';
	import OutOfCreditsModal from '$lib/components/OutOfCreditsModal.svelte';
	import {
		canUseAnalysis,
		getMonthlyCreditsRemaining,
		getPurchasedCreditsRemaining,
		checkAndResetMonthlyCredits
	} from '$lib/creditUtils';
	import { INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';

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
	let isAnalyzing = $state(false);
	let analysisCollapsed = $state(false);
	let analysisResultsDismissed = $state(false);

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
		// Load draft once user is authenticated (handles direct navigation to draft URL)
		if (user && !loadAttempted) {
			loadDraft();
		}
	});

	// Credits and modal state
	let contributor = $state<any>(null);
	let showOutOfCreditsModal = $state(false);
	let analysisBlockedReason = $state<string | null>(null);

	// Computed properties for publish logic
	let isPublishedVersion = $derived.by(() => {
		if (!draft || !discussion?.current_version?.[0]) return false;
		const publishedVersion = discussion.current_version[0];

		// Check if this draft ID matches the published version ID
		if (draft.id === publishedVersion.id) return true;

		// Also check if the content is identical to the published version
		const titleMatches = title.trim() === (publishedVersion.title || '').trim();
		const descriptionMatches = description.trim() === (publishedVersion.description || '').trim();

		return titleMatches && descriptionMatches;
	});

	let canPublish = $derived.by(() => {
		if (!draft) return false;
		// If no analysis has been run yet, can't publish
		if (!draft.good_faith_last_evaluated) return false;
		// If no edits have been made, can publish
		if (!draft.edited_at) return true;
		// If analysis is more recent than last edit, can publish
		return new Date(draft.good_faith_last_evaluated) > new Date(draft.edited_at);
	});

	let analysisPassedCriteria = $derived.by(() => {
		if (!draft?.good_faith_label) return false;
		// Pass criteria: constructive, exemplary, or neutral (score >= 0.4)
		return ['constructive', 'exemplary', 'neutral'].includes(draft.good_faith_label);
	});

	let analysisIsOutdated = $derived.by(() => {
		if (!draft?.good_faith_last_evaluated || !draft?.edited_at) return false;
		return new Date(draft.edited_at) > new Date(draft.good_faith_last_evaluated);
	});

	let hasCredits = $derived.by(() => {
		if (!contributor) return false;
		return canUseAnalysis(contributor);
	});

	async function loadDraft() {
		try {
			loading = true;
			error = null;
			loadAttempted = true;

			// Load the discussion, draft, and contributor data
			const [discussionResult, draftResult, contributorResult] = await Promise.all([
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
							good_faith_analysis
							edited_at
							created_at
						}
					}
				`,
					{ draftId }
				),

				nhost.graphql.request(
					`
					query GetContributor($userId: uuid!) {
						contributor(where: { user_id: { _eq: $userId } }, limit: 1) {
							id
							user_id
							monthly_credits_remaining
							purchased_credits_remaining
							monthly_credits_reset_at
							account_disabled
						}
					}
				`,
					{ userId: user?.id }
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
			contributor = contributorResult.data?.contributor?.[0] || null;

			if (!discussion) {
				throw new Error('Discussion not found');
			}

			if (!draft) {
				throw new Error('Draft not found');
			}

			// Check and reset monthly credits if needed
			if (contributor) {
				await checkAndResetMonthlyCredits(nhost, contributor);
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

			// Load existing good faith analysis if available
			if (draft.good_faith_score !== null && draft.good_faith_label) {
				goodFaithResult = {
					good_faith_score: draft.good_faith_score,
					good_faith_label: draft.good_faith_label,
					rationale: draft.good_faith_analysis?.rationale || null,
					claims: draft.good_faith_analysis?.claims || [],
					provider: draft.good_faith_analysis?.provider || 'claude'
				};
				analysisCollapsed = true;
			}

			// Check if analysis was in progress when user navigated away
			const analysisInProgress = sessionStorage.getItem(`analysis-${draftId}`);
			if (analysisInProgress === 'true') {
				// Check if analysis has completed
				const analysisDate = draft.good_faith_last_evaluated
					? new Date(draft.good_faith_last_evaluated)
					: null;
				const editDate = draft.edited_at ? new Date(draft.edited_at) : null;

				if (analysisDate && editDate && analysisDate > editDate) {
					// Analysis completed while away
					sessionStorage.removeItem(`analysis-${draftId}`);
				} else {
					// Analysis still in progress, start polling
					startPollingForAnalysis();
				}
			}
		} catch (err: any) {
			console.error('Error loading draft:', err);
			error = err.message || 'Failed to load draft';
		} finally {
			loading = false;
		}
	}

	let pollingInterval: ReturnType<typeof setInterval> | null = null;

	function startPollingForAnalysis() {
		// Clear any existing interval
		if (pollingInterval) {
			clearInterval(pollingInterval);
		}

		goodFaithTesting = true;

		// Poll every 2 seconds for up to 2 minutes
		let pollCount = 0;
		const maxPolls = 60; // 2 minutes

		pollingInterval = setInterval(async () => {
			pollCount++;

			try {
				// Refetch the draft to check for updated analysis
				const result = await nhost.graphql.request(
					`
					query GetDraftAnalysis($draftId: uuid!) {
						discussion_version_by_pk(id: $draftId) {
							id
							good_faith_score
							good_faith_label
							good_faith_last_evaluated
							good_faith_analysis
							edited_at
						}
					}
				`,
					{ draftId: draft.id }
				);

				const updatedDraft = result.data?.discussion_version_by_pk;

				if (updatedDraft && updatedDraft.good_faith_last_evaluated) {
					const analysisDate = new Date(updatedDraft.good_faith_last_evaluated);
					const editDate = updatedDraft.edited_at ? new Date(updatedDraft.edited_at) : null;

					// Check if analysis is newer than edit (or no edit date)
					if (!editDate || analysisDate > editDate) {
						// Analysis completed!
						draft.good_faith_score = updatedDraft.good_faith_score;
						draft.good_faith_label = updatedDraft.good_faith_label;
						draft.good_faith_last_evaluated = updatedDraft.good_faith_last_evaluated;

						goodFaithResult = {
							good_faith_score: updatedDraft.good_faith_score,
							good_faith_label: updatedDraft.good_faith_label,
							rationale: updatedDraft.good_faith_analysis?.rationale || null,
							claims: updatedDraft.good_faith_analysis?.claims || [],
							provider: updatedDraft.good_faith_analysis?.provider || 'claude'
						};

						goodFaithTesting = false;
						isAnalyzing = true;
						analysisCollapsed = true;

						// Clear the analysis flag
						sessionStorage.removeItem(`analysis-${draftId}`);

						// Stop polling
						if (pollingInterval) {
							clearInterval(pollingInterval);
							pollingInterval = null;
						}
					}
				}

				// Stop after max polls
				if (pollCount >= maxPolls) {
					goodFaithTesting = false;
					if (pollingInterval) {
						clearInterval(pollingInterval);
						pollingInterval = null;
					}
					console.log('Analysis polling timed out');
				}
			} catch (err) {
				console.error('Error polling for analysis:', err);
			}
		}, 2000);
	}

	async function saveDraft() {
		if (!draft || !user) return;

		try {
			saving = true;
			error = null;

			const result = await nhost.graphql.request(
				`
				mutation UpdateDraft($draftId: uuid!, $title: String!, $description: String!, $editedAt: timestamptz!) {
					update_discussion_version_by_pk(
						pk_columns: { id: $draftId }
						_set: {
							title: $title
							description: $description
							edited_at: $editedAt
						}
					) {
						id
						title
						description
						edited_at
					}
				}
			`,
				{
					draftId: draft.id,
					title: title.trim(),
					description: description.trim(),
					editedAt: new Date().toISOString()
				}
			);

			if (result.error) {
				throw new Error('Failed to save draft');
			}

			// Update local state
			draft.title = title.trim();
			draft.description = description.trim();
			draft.edited_at = new Date().toISOString();
		} catch (err: any) {
			console.error('Error saving draft:', err);
			error = err.message || 'Failed to save draft';
		} finally {
			saving = false;
		}
	}

	async function analyzeGoodFaith() {
		if (!draft || !user || !contributor) return null;

		// Check if user can use analysis (has credits and account not disabled)
		const canAnalyze = canUseAnalysis(contributor);
		if (!canAnalyze) {
			analysisBlockedReason = contributor.account_disabled
				? 'Your account has been disabled. Please contact support.'
				: 'You do not have enough credits to run analysis.';
			showOutOfCreditsModal = true;
			return null;
		}

		goodFaithError = null;
		goodFaithResult = null;
		isAnalyzing = false;
		analysisResultsDismissed = false;

		// Set flag so we know analysis is in progress (for polling if user navigates away)
		sessionStorage.setItem(`analysis-${draftId}`, 'true');

		try {
			goodFaithTesting = true;
			let goodFaithData;

			try {
				const content = `${title.trim()}\n\n${description.trim()}`.trim();

				// Get the access token for authentication
				const accessToken = nhost.auth.getAccessToken();
				const headers: Record<string, string> = { 'Content-Type': 'application/json' };
				if (accessToken) {
					headers['Authorization'] = `Bearer ${accessToken}`;
				}

				const response = await fetch('/api/goodFaithClaude', {
					method: 'POST',
					headers,
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
					label: data.good_faith_label
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
				const { error: saveError } = await nhost.graphql.request(
					UPDATE_DISCUSSION_VERSION_GOOD_FAITH,
					{
						versionId: draft.id,
						score: goodFaithData.score,
						label: goodFaithData.label,
						analysis: data // Save the complete analysis response
					}
				);

				if (saveError) {
					console.error('Failed to save good faith analysis to database:', saveError);
					goodFaithError = 'Analysis completed but failed to save to database';
					return null;
				}

				// Update local draft state with analysis results
				draft.good_faith_score = goodFaithData.score;
				draft.good_faith_label = goodFaithData.label;
				draft.good_faith_last_evaluated = new Date().toISOString();

				console.log('Good faith analysis saved to database successfully');

				// Decrement credits
				if (contributor) {
					const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
					const purchasedRemaining = getPurchasedCreditsRemaining(contributor);

					if (monthlyRemaining > 0) {
						// Use monthly credit
						contributor.monthly_credits_remaining = monthlyRemaining - 1;
					} else if (purchasedRemaining > 0) {
						// Use purchased credit
						await nhost.graphql.request(INCREMENT_PURCHASED_CREDITS_USED, {
							contributorId: contributor.id
						});
						contributor.purchased_credits_remaining = purchasedRemaining - 1;
					}
				}

				// Keep isAnalyzing true - user must click "Continue Editing" or "Publish"
				isAnalyzing = true;

				// Clear the analysis flag
				sessionStorage.removeItem(`analysis-${draftId}`);

				return goodFaithData;
			} catch (e: any) {
				console.error('Good faith analysis failed:', e);
				goodFaithError = e?.message || 'Failed to analyze discussion for good faith.';
				isAnalyzing = false;
				// Clear the analysis flag on error too
				sessionStorage.removeItem(`analysis-${draftId}`);
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

			// Save current changes only if there are unsaved changes
			const hasUnsavedChanges = title !== (draft.title ?? '') || description !== (draft.description ?? '');
			if (hasUnsavedChanges) {
				await saveDraft();
			}

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

	function continueEditing() {
		isAnalyzing = false;
		analysisCollapsed = true;
		analysisResultsDismissed = true;
	}

	function toggleAnalysis() {
		analysisCollapsed = !analysisCollapsed;
	}

	onMount(() => {
		if (user) {
			loadDraft();
		}

		// Cleanup on unmount
		return () => {
			if (pollingInterval) {
				clearInterval(pollingInterval);
			}
			if (autoSaveInterval) {
				clearInterval(autoSaveInterval);
			}
		};
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
			<Button variant="secondary" onclick={() => goto(`/discussions/${discussionId}`)}>
				Back to Discussion
			</Button>
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
					<!-- Button 1: Continue Editing (shown only when form is disabled) -->
					{#if !analysisResultsDismissed && isAnalyzing}
						<Button variant="secondary" onclick={continueEditing}>Continue Editing</Button>
					{/if}

					<!-- Button 2: Analysis/Publish -->
					{#if isPublishedVersion}
						<!-- State: Already Published -->
						<Button variant="secondary" disabled>Published Version</Button>
					{:else if !canPublish}
						<!-- State A: Need Analysis -->
						{#if !hasCredits}
							<Button
								variant="secondary"
								onclick={() => goto('/profile')}
								title="You need credits to run analysis"
							>
								Out of Credits. Buy More or Subscribe
							</Button>
						{:else}
							<Button
								variant="secondary"
								class="logo-btn"
								onclick={analyzeGoodFaith}
								disabled={goodFaithTesting || saving || publishing}
								title="Run good faith analysis to enable publishing"
							>
								{#if goodFaithTesting}
									<AnimatedLogo size="20px" isAnimating={true} />
									<div>Analyzing...</div>
								{:else}
									<img src="/logo-only-transparent.svg" alt="" width="40" height="40" />
									<div>Run Analysis to Enable Publishing</div>
								{/if}
							</Button>
						{/if}
					{:else if publishing}
						<!-- State B: Publishing -->
						<Button variant="accent" disabled>
							<AnimatedLogo size="20px" isAnimating={true} /> Publishing...
						</Button>
					{:else if analysisPassedCriteria}
						<!-- State C: Analysis Passed - Can Publish -->
						<Button type="button" variant="accent" onclick={publishDraft} disabled={saving}>
							<span class="check-icon">✓</span> Publish
						</Button>
					{:else}
						<!-- State D: Analysis Failed - Return to Forge -->
						<Button variant="secondary" onclick={continueEditing}>
							<span class="x-icon">✗</span> Return to the Forge
						</Button>
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
					<div class="analysis-header">
						<div class="analysis-summary">
							<div class="analysis-badge {goodFaithResult.good_faith_label}">
								<span class="analysis-score"
									>{(goodFaithResult.good_faith_score * 100).toFixed(0)}%</span
								>
								<span class="analysis-label">{goodFaithResult.good_faith_label}</span>
							</div>
							{#if analysisIsOutdated}
								<span class="outdated-badge">Outdated - Content edited since analysis</span>
							{/if}
						</div>
						{#if analysisCollapsed}
							<Button type="button" variant="ghost" size="sm" onclick={toggleAnalysis}>
								Expand Analysis
							</Button>
						{:else}
							<Button type="button" variant="ghost" size="sm" onclick={toggleAnalysis}>
								Collapse
							</Button>
						{/if}
					</div>
					{#if !analysisCollapsed && goodFaithResult.rationale}
						<div class="analysis-section">
							<strong>Analysis Summary:</strong>
							{goodFaithResult.rationale}
						</div>
					{/if}
					{#if !analysisCollapsed && goodFaithResult.claims && goodFaithResult.claims.length > 0}
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
													<div class="improvements">
														<strong>Improvements:</strong>
														{arg.improvements}
													</div>
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
						disabled={isAnalyzing || goodFaithTesting}
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
						disabled={isAnalyzing || goodFaithTesting}
					></textarea>
				</div>

				<!-- Citations Section -->
				<div class="form-group">
					<div class="citations-header">
						<label>Citations</label>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onclick={() => {
								editingCitation = null;
								showCitationForm = true;
							}}
						>
							Add Citation
						</Button>
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
										<Button
											variant="ghost"
											size="sm"
											onclick={() => insertCitationReference(citation.id)}
											title="Insert citation reference"
										>
											Insert
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => startEditCitation(citation.id)}
											title="Edit citation"
										>
											Edit
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => removeCitation(citation.id)}
											title="Remove citation"
										>
											Remove
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="no-citations">
							<p>
								No citations added yet. Citations help support your arguments and improve
								credibility.
							</p>
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
							<Button
								type="button"
								variant="ghost"
								onclick={() => {
									showCitationForm = false;
									editingCitation = null;
								}}
							>
								✕
							</Button>
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

<!-- Out of Credits Modal -->
<OutOfCreditsModal
	bind:show={showOutOfCreditsModal}
	{analysisBlockedReason}
	onClose={() => (showOutOfCreditsModal = false)}
/>

<style>
	/* Import sophisticated fonts */
	@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap');

	.draft-editor-container {
		min-height: 100vh;
		background: var(--color-surface-alt);
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		font-size: 15px;
		line-height: 1.6;
		color: var(--color-text-primary);
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
		background: var(--color-surface);
		box-shadow: 0 0 0 1px var(--color-border);
		border-left: 1px solid var(--color-border);
		border-right: 1px solid var(--color-border);
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--color-border);
	}

	.header-content h1 {
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 2.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
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

	.header-actions button {
		gap: 0.5rem;
	}

	.header-actions button {
		max-width: 12rem;
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
		color: var(--color-text-secondary);
		font-size: 15px;
		letter-spacing: 0.025em;
	}

	input,
	textarea {
		width: 100%;
		padding: 0.875rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: var(--color-input-bg);
		color: var(--color-text-primary);
		font-family: inherit;
		font-size: 15px;
		line-height: 1.5;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent);
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
		background: var(--color-primary);
		color: var(--color-surface);
		border-color: var(--color-primary);
	}

	.btn-primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 80%, black);
		border-color: color-mix(in srgb, var(--color-primary) 80%, black);
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border-color: var(--color-border);
	}

	.btn-secondary:hover:not(:disabled) {
		border-color: var(--color-primary);
		background: var(--color-surface-alt);
	}

	.btn-accent {
		padding: 0.625rem 1.25rem;
		border: 1px solid #10b981;
		background: transparent;
		color: var(--color-text-primary);
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 14px;
		font-weight: 500;
		font-family: inherit;
		letter-spacing: 0.025em;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
	}

	.btn-accent:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.05);
		border-color: #10b981;
		color: #10b981;
		box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
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

	.analysis-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.analysis-summary {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
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

	/* Checkmark and X icons for publish states */
	.check-icon {
		color: #10b981;
		font-weight: 600;
		margin-right: 0.5rem;
	}

	.x-icon {
		color: #ef4444;
		font-weight: 600;
		margin-right: 0.5rem;
	}

	.btn-disabled {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-color: var(--color-border);
		padding: 0.625rem 1.25rem;
		border-radius: 3px;
		font-weight: 500;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
		letter-spacing: 0.025em;
		opacity: 0.7;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-disabled:hover {
		background: var(--color-surface-alt);
		border-color: var(--color-primary);
		opacity: 1;
	}

	/* Outdated badge */
	.outdated-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background: color-mix(in srgb, #f59e0b 15%, transparent);
		color: #d97706;
		font-size: 0.85rem;
		font-weight: 500;
		border-radius: var(--border-radius-sm);
		border: 1px solid color-mix(in srgb, #f59e0b 25%, transparent);
	}

	/* Expand/Collapse buttons */
	.expand-btn,
	.collapse-btn {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 0.85rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.expand-btn:hover,
	.collapse-btn:hover {
		background: var(--color-surface-alt);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}
</style>
