<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import { onMount } from 'svelte';
	import AnimatedLogo from '$lib/components/ui/AnimatedLogo.svelte';
	import {
		UPDATE_DISCUSSION_VERSION_GOOD_FAITH,
		CREATE_CITATION,
		UPDATE_CITATION,
		LINK_CITATION_TO_DISCUSSION,
		UPDATE_DISCUSSION_VERSION_CITATION,
		GET_DISCUSSION_CITATIONS,
		REMOVE_CITATION_FROM_DISCUSSION
	} from '$lib/graphql/queries';
	import {
		formatChicagoCitation,
		processCitationReferences,
		type WritingStyle,
		type StyleMetadata,
		type Citation,
		getPostTypeConfig
	} from '$lib/types/writingStyle';
	import CitationForm from '$lib/components/citations/CitationForm.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import OutOfCreditsModal from '$lib/components/ui/OutOfCreditsModal.svelte';
	import GoodFaithAnalysisDisplay from '$lib/components/ui/GoodFaithAnalysisDisplay.svelte';
	import {
		canUseAnalysis,
		getMonthlyCreditsRemaining,
		getPurchasedCreditsRemaining,
		checkAndResetMonthlyCredits
	} from '$lib/creditUtils';
	import { INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import SocialMediaImportForm from '$lib/components/SocialMediaImportForm.svelte';
	import SocialMediaImportDisplay from '$lib/components/SocialMediaImportDisplay.svelte';

	// Get parameters
	const discussionId = $page.params.id;
	const draftId = $page.params.draft_id;

	// Reference to the RichTextEditor for inserting citation references
	let descriptionEditor: RichTextEditor;

	// Helper function to determine label from score
	function getLabel(score: number): string {
		if (score >= 0.8) return 'exemplary';
		if (score >= 0.6) return 'constructive';
		if (score >= 0.4) return 'neutral';
		if (score >= 0.2) return 'questionable';
		return 'hostile';
	}

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

	// Showcase item context (if this discussion is about a featured analysis)
	let showcaseItem = $derived(discussion?.showcase_item || null);

	// Form data
	let title = $state('');
	let description = $state('');

	// Social media import data
	let importSource = $state<string | null>(null);
	let importUrl = $state<string | null>(null);
	let importContent = $state<string | null>(null);
	let importAuthor = $state<string | null>(null);
	let importDate = $state<string | null>(null);

	// Writing style and citation state
	let selectedStyle = $state<WritingStyle>('journalistic');
	let styleMetadata = $state<StyleMetadata>({
		citations: []
	});
	let showCitationForm = $state(false);
	let editingCitation = $state<Citation | null>(null);
	let expandedCitationIds = $state<Set<string>>(new Set());

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
		// Bypass analysis requirement for slartibartfast and admin
		if (contributor?.role === 'slartibartfast' || contributor?.role === 'admin') {
			return true;
		}
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
							showcase_item {
								id
								title
								subtitle
								creator
								media_type
								source_url
								summary
								analysis
							}
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
							import_source
							import_url
							import_content
							import_author
							import_date
						}
					}
				`,
					{ draftId }
				),

				nhost.graphql.request(
					`
					query GetContributor($userId: uuid!) {
						contributor_by_pk(id: $userId) {
							id
							role
							analysis_enabled
							analysis_limit
							analysis_count_used
							analysis_count_reset_at
							monthly_credits_remaining
							purchased_credits_remaining
							purchased_credits_total
							purchased_credits_used
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
			contributor = contributorResult.data?.contributor_by_pk || null;

			if (!discussion) {
				throw new Error('Discussion not found');
			}

			if (!draft) {
				throw new Error('Draft not found');
			}

			// Check and reset monthly credits if needed
			if (contributor) {
				await checkAndResetMonthlyCredits(
					contributor,
					nhost.graphql.getUrl(),
					nhost.auth.getAccessToken() || undefined
				);
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

			// Initialize import data
			importSource = draft.import_source || null;
			importUrl = draft.import_url || null;
			importContent = draft.import_content || null;
			importAuthor = draft.import_author || null;
			importDate = draft.import_date || null;

			// Initialize autosave tracking
			lastSavedTitle = title;
			lastSavedDescription = description;

			// Load citations from citation table
			console.log('[loadDraft] Loading citations for draft version:', draft.id);
			const citationsResult = await nhost.graphql.request(GET_DISCUSSION_CITATIONS, {
				discussion_version_id: draft.id
			});
			console.log('[loadDraft] Citations query result:', citationsResult);

			if (!citationsResult.error && citationsResult.data?.discussion_version_citation) {
				console.log(
					'[loadDraft] Found citations:',
					citationsResult.data.discussion_version_citation.length
				);
				// Convert database citations to local format
				styleMetadata.citations = citationsResult.data.discussion_version_citation
					.sort((a: any, b: any) => a.citation_order - b.citation_order)
					.map((dc: any) => ({
						id: dc.citation.id,
						title: dc.citation.title,
						url: dc.citation.url,
						author: dc.citation.author,
						publisher: dc.citation.publisher,
						publish_date: dc.citation.publish_date,
						accessed_date: dc.citation.accessed_date,
						page_number: dc.citation.page_number,
						point_supported: dc.custom_point_supported || dc.citation.point_supported,
						relevant_quote: dc.custom_relevant_quote || dc.citation.relevant_quote
					}));
			} else {
				styleMetadata.citations = [];
			}

			// Initialize citation tracking for autosave
			lastSavedCitations = JSON.parse(JSON.stringify(styleMetadata.citations || []));

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

			// First, update the draft title and description
			const result = await nhost.graphql.request(
				`
				mutation UpdateDraft(
					$draftId: uuid!
					$title: String!
					$description: String!
					$editedAt: timestamptz!
					$importSource: String
					$importUrl: String
					$importContent: String
					$importAuthor: String
					$importDate: timestamptz
				) {
					update_discussion_version_by_pk(
						pk_columns: { id: $draftId }
						_set: {
							title: $title
							description: $description
							edited_at: $editedAt
							import_source: $importSource
							import_url: $importUrl
							import_content: $importContent
							import_author: $importAuthor
							import_date: $importDate
						}
					) {
						id
						title
						description
						edited_at
						import_source
						import_url
						import_content
						import_author
						import_date
					}
				}
			`,
				{
					draftId: draft.id,
					title: title.trim(),
					description: description.trim(),
					editedAt: new Date().toISOString(),
					importSource: importSource || null,
					importUrl: importUrl || null,
					importContent: importContent || null,
					importAuthor: importAuthor || null,
					importDate: importDate || null
				}
			);

			if (result.error) {
				throw new Error('Failed to save draft');
			}

			// Now save citations to the citation table
			const citationsToSave = styleMetadata.citations || [];

			// Get existing citations for this draft
			const existingCitationsResult = await nhost.graphql.request(GET_DISCUSSION_CITATIONS, {
				discussion_version_id: draft.id
			});

			const existingCitations = existingCitationsResult.data?.discussion_version_citation || [];
			const existingCitationIds = new Set(existingCitations.map((c: any) => c.citation.id));
			const newCitationIds = new Set(citationsToSave.map((c: Citation) => c.id));

			// Remove citations that are no longer in the list
			for (const existing of existingCitations) {
				if (!newCitationIds.has(existing.citation.id)) {
					await nhost.graphql.request(REMOVE_CITATION_FROM_DISCUSSION, {
						discussion_version_id: draft.id,
						citation_id: existing.citation.id
					});
				}
			}

			// Add or update citations
			for (let i = 0; i < citationsToSave.length; i++) {
				const citation = citationsToSave[i];

				if (!existingCitationIds.has(citation.id)) {
					// Create new citation
					const createResult = await nhost.graphql.request(CREATE_CITATION, {
						id: citation.id,
						title: citation.title,
						url: citation.url,
						author: citation.author || null,
						publisher: citation.publisher || null,
						publish_date: citation.publish_date || null,
						accessed_date: citation.accessed_date || null,
						page_number: citation.page_number || null,
						point_supported: citation.point_supported,
						relevant_quote: citation.relevant_quote,
						created_by: user.id
					});

					if (!createResult.error) {
						// Link citation to discussion version
						await nhost.graphql.request(LINK_CITATION_TO_DISCUSSION, {
							discussion_version_id: draft.id,
							citation_id: citation.id,
							citation_order: i,
							custom_point_supported: citation.point_supported,
							custom_relevant_quote: citation.relevant_quote
						});
					}
				} else {
					// Update existing citation in citation table
					const updateResult = await nhost.graphql.request(UPDATE_CITATION, {
						id: citation.id,
						title: citation.title,
						url: citation.url,
						author: citation.author || null,
						publisher: citation.publisher || null,
						publish_date: citation.publish_date || null,
						accessed_date: citation.accessed_date || null,
						page_number: citation.page_number || null,
						point_supported: citation.point_supported,
						relevant_quote: citation.relevant_quote
					});

					if (updateResult.error) {
						console.error('Failed to update citation:', updateResult.error);
						const errorMessage = Array.isArray(updateResult.error)
							? updateResult.error[0]?.message || 'Unknown error'
							: updateResult.error.message || 'Unknown error';
						throw new Error(`Failed to update citation: ${errorMessage}`);
					}

					// Also update the join table's custom fields
					const joinUpdateResult = await nhost.graphql.request(UPDATE_DISCUSSION_VERSION_CITATION, {
						discussion_version_id: draft.id,
						citation_id: citation.id,
						custom_point_supported: citation.point_supported,
						custom_relevant_quote: citation.relevant_quote
					});

					if (joinUpdateResult.error) {
						console.error('Failed to update join table:', joinUpdateResult.error);
						const errorMessage = Array.isArray(joinUpdateResult.error)
							? joinUpdateResult.error[0]?.message || 'Unknown error'
							: joinUpdateResult.error.message || 'Unknown error';
						throw new Error(`Failed to update citation link: ${errorMessage}`);
					}
				}
			}

			// Update local state
			draft.title = title.trim();
			draft.description = description.trim();
			draft.edited_at = new Date().toISOString();

			// Update autosave tracking variables
			lastSavedTitle = title;
			lastSavedDescription = description;
			lastSavedCitations = JSON.parse(JSON.stringify(styleMetadata.citations || []));
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
				// Build content with title and description
				let content = `${title.trim()}\n\n${description.trim()}`.trim();

				// Add citation information if present
				if (styleMetadata.citations && styleMetadata.citations.length > 0) {
					content += '\n\n--- CITATIONS ---\n';
					styleMetadata.citations.forEach((citation, index) => {
						content += `\n[${index + 1}] ${formatChicagoCitation(citation)}\n`;
						content += `   Point Supported: ${citation.point_supported}\n`;
						if (citation.relevant_quote) {
							content += `   Relevant Quote: "${citation.relevant_quote}"\n`;
						}
					});
				}

				// Build import data object if import fields are populated
				const hasImport = importContent && importSource && importAuthor;
				const importDataPayload = hasImport
					? {
							source: importSource,
							url: importUrl || undefined,
							content: importContent,
							author: importAuthor,
							date: importDate || undefined
						}
					: undefined;

				// Build showcase context if this discussion is about a featured analysis
				// This provides context for the AI but is not subject to analysis itself
				const showcaseContextPayload = discussion?.showcase_item
					? {
							title: discussion.showcase_item.title,
							subtitle: discussion.showcase_item.subtitle || undefined,
							creator: discussion.showcase_item.creator || undefined,
							media_type: discussion.showcase_item.media_type || undefined,
							summary: discussion.showcase_item.summary || undefined,
							analysis: discussion.showcase_item.analysis
								? (() => {
										try {
											return JSON.parse(discussion.showcase_item.analysis);
										} catch {
											return undefined;
										}
									})()
								: undefined
						}
					: undefined;

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
						content: content,
						importData: importDataPayload,
						showcaseContext: showcaseContextPayload
					})
				});

				const data = await response.json();

				// Check if this was a real Claude analysis or heuristic fallback
				if (data.usedClaude === false) {
					goodFaithError =
						'AI analysis is temporarily unavailable. Please try again later or contact support if the issue persists.';
					goodFaithTesting = false;
					return null;
				}

				// Convert score to 0-1 range if needed
				const score01 =
					typeof data.good_faith_score === 'number'
						? data.good_faith_score
						: typeof data.goodFaithScore === 'number'
							? data.goodFaithScore / 100
							: 0.5;

				// Ensure label is present, fallback to generating from score
				const label = data.good_faith_label || getLabel(score01);

				goodFaithData = {
					score: score01,
					analysis: data.good_faith_analysis,
					label: label
				};

				// Store result for UI display
				goodFaithResult = {
					good_faith_score: score01,
					good_faith_label: label,
					rationale: data.rationale,
					claims: data.claims,
					provider: data.provider,
					usedClaude: data.usedClaude
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
		// Trigger immediate save after adding citation
		saveDraft();
	}

	function removeCitation(id: string) {
		styleMetadata.citations = styleMetadata.citations?.filter((c) => c.id !== id) || [];
		// Trigger immediate save after removing citation
		saveDraft();
	}

	function startEditCitation(id: string) {
		const itemToEdit = styleMetadata.citations?.find((c) => c.id === id) || null;
		if (itemToEdit) {
			editingCitation = itemToEdit;
			showCitationForm = true;
		}
	}

	function toggleCitationExpand(citationId: string) {
		if (expandedCitationIds.has(citationId)) {
			expandedCitationIds.delete(citationId);
		} else {
			expandedCitationIds.add(citationId);
		}
		// Trigger reactivity
		expandedCitationIds = new Set(expandedCitationIds);
	}

	function updateCitation(updatedItem: Citation) {
		console.log('updateCitation called with:', updatedItem);
		const index = styleMetadata.citations?.findIndex((c) => c.id === updatedItem.id) ?? -1;
		console.log('Found citation at index:', index);
		if (index !== -1 && styleMetadata.citations) {
			styleMetadata.citations[index] = updatedItem;
			console.log('Updated citations array:', styleMetadata.citations);
		}
		showCitationForm = false;
		editingCitation = null;
		// Trigger immediate save after updating citation
		saveDraft();
	}

	function insertCitationReference(citationId: string) {
		console.log('[DRAFT INSERT] Function called with citationId:', citationId);

		if (!descriptionEditor) {
			console.error('[DRAFT INSERT] Editor reference not found');
			return;
		}

		const citationNumber =
			(styleMetadata.citations || []).findIndex((c) => c.id === citationId) + 1 || 1;

		console.log('[DRAFT INSERT] Citation number:', citationNumber);
		console.log('[DRAFT INSERT] Inserting citation reference');

		// Insert the citation reference at the current cursor position
		descriptionEditor.insertText(`[${citationNumber}]`);

		console.log('[DRAFT INSERT] Citation reference inserted');
	}

	async function publishDraft() {
		if (!draft || !discussion || !user) return;

		try {
			publishing = true;
			error = null;

			// Save current changes only if there are unsaved changes
			const hasUnsavedChanges =
				title !== (draft.title ?? '') || description !== (draft.description ?? '');
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
					post(
						where: {
							discussion_id: { _eq: $discussionId }
							context_version_id: { _is_null: false }
						}
					) {
						id
						context_version_id
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
			const allPosts = commentsCheck.data?.post || [];

			console.log('Comments check result:', {
				currentPublished,
				allPostsCount: allPosts.length,
				allPosts
			});

			// Check if current published version has comments on it specifically
			const commentsOnCurrentVersion = allPosts.filter(
				(post: any) => post.context_version_id === currentPublished?.id
			).length;

			console.log('Publishing analysis:', {
				currentPublishedId: currentPublished?.id,
				commentsOnCurrentVersion,
				hasComments: commentsOnCurrentVersion > 0,
				action: commentsOnCurrentVersion > 0 ? 'archive' : 'archive',
				commentsData: allPosts.map((p: any) => ({ id: p.context_version_id }))
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
				detailedVersions: remainingPublished.map((v: any) => ({
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

			// Step 6: Update the discussion's current_version_id
			const updateDiscussionResult = await nhost.graphql.request(
				`
				mutation UpdateDiscussionCurrentVersion($discussionId: uuid!, $versionId: uuid!) {
					update_discussion(
						where: { id: { _eq: $discussionId } }
						_set: { current_version_id: $versionId, status: "published" }
					) {
						returning {
							id
							current_version_id
							status
						}
					}
				}
			`,
				{
					discussionId: discussion.id,
					versionId: draft.id
				}
			);

			if (updateDiscussionResult.error) {
				console.error('Update discussion GraphQL error:', updateDiscussionResult.error);
				throw new Error(
					`Failed to update discussion current_version_id: ${JSON.stringify(updateDiscussionResult.error)}`
				);
			}

			if (!updateDiscussionResult.data?.update_discussion?.returning?.[0]) {
				console.error('No data returned from update_discussion mutation');
				throw new Error('Failed to update discussion current_version_id - no data returned');
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
	let lastSavedTitle = $state('');
	let lastSavedDescription = $state('');
	let lastSavedCitations = $state<Citation[]>([]);

	onMount(() => {
		// Set up auto-save interval once on mount
		autoSaveInterval = setInterval(() => {
			if (!draft || loading || saving || publishing) return;

			const citationsChanged =
				JSON.stringify(styleMetadata.citations || []) !== JSON.stringify(lastSavedCitations);
			if (title !== lastSavedTitle || description !== lastSavedDescription || citationsChanged) {
				saveDraft();
			}
		}, 10000);

		return () => {
			if (autoSaveInterval) {
				clearInterval(autoSaveInterval);
			}
		};
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

			<!-- Showcase Item Context Banner -->
			{#if showcaseItem}
				<div class="showcase-context-banner">
					<div class="showcase-context-label">This discussion is about:</div>
					<a href="/featured/{showcaseItem.id}" class="showcase-context-card">
						<div class="showcase-context-info">
							<h3 class="showcase-context-title">{showcaseItem.title}</h3>
							{#if showcaseItem.subtitle}
								<p class="showcase-context-subtitle">{showcaseItem.subtitle}</p>
							{/if}
							<div class="showcase-context-meta">
								{#if showcaseItem.creator}
									<span class="showcase-creator">By {showcaseItem.creator}</span>
								{/if}
								{#if showcaseItem.media_type}
									<span class="showcase-media-type">{showcaseItem.media_type}</span>
								{/if}
							</div>
						</div>
						<span class="view-link">View Analysis →</span>
					</a>
				</div>
			{/if}

			<!-- Social Media Import Display (read-only, shown when data exists) -->
			{#if importContent && importSource && importAuthor}
				<SocialMediaImportDisplay
					source={importSource}
					url={importUrl || ''}
					content={importContent}
					author={importAuthor}
					date={importDate || ''}
				/>
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
					<RichTextEditor
						bind:this={descriptionEditor}
						bind:content={description}
						placeholder="Describe your discussion..."
						minHeight="400px"
						showToolbar={!(isAnalyzing || goodFaithTesting)}
					/>
				</div>

				<!-- Social Media Import Form (for adding/editing) -->
				<SocialMediaImportForm
					initialData={{
						source: importSource || '',
						url: importUrl || '',
						content: importContent || '',
						author: importAuthor || '',
						date: importDate || ''
					}}
					onSubmit={(data) => {
						importSource = data.source;
						importUrl = data.url;
						importContent = data.content;
						importAuthor = data.author;
						importDate = data.date;
					}}
					onCancel={() => {
						importSource = null;
						importUrl = null;
						importContent = null;
						importAuthor = null;
						importDate = null;
					}}
					disabled={isAnalyzing || goodFaithTesting}
				/>

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
								{@const isExpanded = expandedCitationIds.has(citation.id)}
								<div class="citation-item" class:expanded={isExpanded}>
									<div class="citation-header" onclick={() => toggleCitationExpand(citation.id)}>
										<div class="citation-number">[{index + 1}]</div>
										<div class="citation-chicago">
											{@html formatChicagoCitation(citation)}
										</div>
										<button class="expand-toggle" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
											<svg
												width="16"
												height="16"
												viewBox="0 0 16 16"
												fill="none"
												style="transform: rotate({isExpanded
													? 180
													: 0}deg); transition: transform 0.2s;"
											>
												<path
													d="M4 6L8 10L12 6"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
										</button>
									</div>

									{#if isExpanded}
										<div class="citation-expanded">
											<div class="citation-meta">
												<div class="meta-section">
													<strong>Point Supported:</strong>
													<p>{citation.point_supported}</p>
												</div>
												{#if citation.relevant_quote}
													<div class="meta-section">
														<strong>Relevant Quote:</strong>
														<blockquote>"{citation.relevant_quote}"</blockquote>
													</div>
												{/if}
												{#if citation.author}
													<div class="meta-row">
														<strong>Author:</strong>
														{citation.author}
													</div>
												{/if}
												{#if citation.publisher}
													<div class="meta-row">
														<strong>Publisher:</strong>
														{citation.publisher}
													</div>
												{/if}
												{#if citation.page_number}
													<div class="meta-row">
														<strong>Page:</strong>
														{citation.page_number}
													</div>
												{/if}
											</div>
											<div class="citation-actions">
												<Button
													variant="ghost"
													size="sm"
													onclick={(e) => {
														e.stopPropagation();
														insertCitationReference(citation.id);
													}}
													title="Insert citation reference"
												>
													Insert [{index + 1}]
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onclick={(e) => {
														e.stopPropagation();
														startEditCitation(citation.id);
													}}
													title="Edit citation"
												>
													Edit
												</Button>
												<Button
													variant="danger"
													size="sm"
													onclick={(e) => {
														e.stopPropagation();
														removeCitation(citation.id);
													}}
													title="Remove citation"
												>
													Remove
												</Button>
											</div>
										</div>
									{/if}
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
							editingItem={editingCitation}
							onAdd={editingCitation ? updateCitation : addCitation}
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

	input {
		padding: 0.875rem 1rem;
		width: calc(100% - 2rem);
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

	input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent);
	}

	/* Removed textarea styles - now using RichTextEditor component */

	input[type='text'] {
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
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-lg);
		background: var(--color-surface);
	}

	.citation-item {
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		transition: background 0.2s ease;
	}

	.citation-item:last-child {
		border-bottom: none;
	}

	.citation-item.expanded {
		background: color-mix(in srgb, var(--color-primary) 3%, transparent);
	}

	.citation-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.citation-header:hover {
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.citation-number {
		font-weight: 600;
		color: var(--color-primary);
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.citation-chicago {
		flex: 1;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.expand-toggle {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: color 0.2s ease;
	}

	.expand-toggle:hover {
		color: var(--color-primary);
	}

	.citation-expanded {
		padding: 0 1rem 1rem 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
		animation: slideDown 0.2s ease;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.citation-meta {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		font-size: 0.875rem;
	}

	.meta-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.meta-section strong {
		color: var(--color-text-primary);
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.meta-section p {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.meta-section blockquote {
		margin: 0;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		border-left: 3px solid var(--color-primary);
		border-radius: 0 var(--border-radius-sm) var(--border-radius-sm) 0;
		color: var(--color-text-primary);
		font-style: italic;
		line-height: 1.6;
	}

	.meta-row {
		display: flex;
		gap: 0.5rem;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.meta-row strong {
		color: var(--color-text-primary);
		min-width: 80px;
	}

	.citation-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
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

	/* Showcase Context Banner Styles */
	.showcase-context-banner {
		margin-bottom: 2rem;
		padding: 1.25rem;
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-radius: var(--border-radius);
	}

	.showcase-context-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.75rem;
	}

	.showcase-context-card {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		text-decoration: none;
		color: inherit;
		transition: all 0.2s ease;
	}

	.showcase-context-card:hover {
		border-color: var(--color-primary);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}

	.showcase-context-info {
		flex: 1;
		min-width: 0;
	}

	.showcase-context-title {
		margin: 0 0 0.25rem 0;
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		line-height: 1.3;
	}

	.showcase-context-subtitle {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.showcase-context-meta {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.showcase-creator {
		font-weight: 500;
	}

	.showcase-media-type {
		padding: 0.125rem 0.5rem;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-radius: var(--border-radius-sm);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.view-link {
		flex-shrink: 0;
		font-size: 0.875rem;
		color: var(--color-primary);
		font-weight: 500;
		white-space: nowrap;
		align-self: center;
	}

	@media (max-width: 640px) {
		.showcase-context-card {
			flex-direction: column;
		}

		.view-link {
			align-self: flex-start;
			margin-top: 0.5rem;
		}
	}
</style>
