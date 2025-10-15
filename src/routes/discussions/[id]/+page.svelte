<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	// Avoid importing gql to prevent type resolution issues; use plain string
	import { nhost } from '$lib/nhostClient';
	import { hasAdminAccess } from '$lib/permissions';
	import { onMount } from 'svelte';
	import {
		CREATE_POST_DRAFT_WITH_STYLE,
		UPDATE_DISCUSSION_VERSION_GOOD_FAITH,
		UPDATE_POST_GOOD_FAITH,
		GET_DISCUSSION_DETAILS as IMPORTED_GET_DISCUSSION_DETAILS,
		GET_CONTRIBUTOR,
		INCREMENT_PURCHASED_CREDITS_USED,
		ANONYMIZE_POST,
		ANONYMIZE_DISCUSSION,
		UNANONYMIZE_POST,
		UNANONYMIZE_DISCUSSION,
		GET_MY_PENDING_EDITORS_DESK_APPROVALS,
		GET_DISCUSSION_CITATIONS,
		LINK_CITATION_TO_DISCUSSION,
		UPDATE_DISCUSSION_VERSION_AUDIO
	} from '$lib/graphql/queries';
	import { createDraftAutosaver, type DraftAutosaver } from '$lib';
	import {
		getStyleConfig,
		formatChicagoCitation,
		processCitationReferences,
		type WritingStyle,
		type StyleMetadata,
		type Citation,
		getPostTypeConfig
	} from '$lib/types/writingStyle';
	import {
		extractCitationData,
		extractReplyRef,
		ensureIdsForCitationData
	} from '$lib/utils/contentExtraction';
	import {
		getCachedAnalysis,
		cacheAnalysis,
		hashContent
	} from '$lib/utils/analysisCache';
	import { assessContentQuality } from '$lib/utils/contentQuality';
	import {
		getDiscussionTitle,
		getDiscussionDescription,
		getDiscussionTags,
		getDiscussionGoodFaithScore,
		getDiscussionGoodFaithLabel,
		getDiscussionGoodFaithLastEvaluated,
		getDiscussionGoodFaithAnalysis
	} from '$lib/utils/discussionHelpers';
	import DiscussionReferencesDisplay from '$lib/components/discussion/DiscussionReferencesDisplay.svelte';
	import DiscussionGoodFaithBadge from '$lib/components/discussion/DiscussionGoodFaithBadge.svelte';
	import DiscussionHeader from '$lib/components/discussion/DiscussionHeader.svelte';
	import PostItem from '$lib/components/posts/PostItem.svelte';
	import CommentComposer from '$lib/components/posts/CommentComposer.svelte';
	import DiscussionEditForm from '$lib/components/discussion/DiscussionEditForm.svelte';
	import GoodFaithModal from '$lib/components/ui/GoodFaithModal.svelte';
	import EditorsDeskApprovalCard from '$lib/components/EditorsDeskApprovalCard.svelte';
	import {
		canUseAnalysis,
		getMonthlyCreditsRemaining,
		getPurchasedCreditsRemaining,
		willUsePurchasedCredit,
		checkAndResetMonthlyCredits
	} from '$lib/creditUtils';
	import {
		checkPostDeletable,
		deletePost,
		checkDiscussionDeletable,
		deleteDiscussion,
		confirmDeletion
	} from '$lib/utils/deletePost';
	import OutOfCreditsModal from '$lib/components/ui/OutOfCreditsModal.svelte';

	let discussion = $state<any>(null);
	let loading = $state(true);
	let error = $state<Error | null>(null);
	let authReady = $state(false);
	let contributor = $state<any>(null);

	// Editors' Desk approval state
	let editorsDeskApprovals = $state<any[]>([]);
	let pendingApprovalForThisDiscussion = $derived(
		editorsDeskApprovals.find(pick => pick.discussion_id === discussion?.id)
	);

	// New comment form state
	let newComment = $state('');
	let commentPostType = $state<
		'response' | 'counter_argument' | 'supporting_evidence' | 'question'
	>('response');
	let commentFormExpanded = $state(false);
	let postTypeExpanded = $state(true);
	let showAdvancedFeatures = $state(false);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let showOutOfCreditsModal = $state(false);
	let user = $state(nhost.auth.getUser());
	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
		authReady = true;
	});

	// Audio upload state
	let audioUploading = $state(false);
	let audioUploadProgress = $state(0);
	let audioUploadError = $state<string | null>(null);

	let draftPostId = $state<string | null>(null);
	let draftAutosaver = $state<DraftAutosaver | null>(null);
	let draftLoaded = $state(false); // prevents duplicate fetch
	let lastSavedAt = $state<number | null>(null);
	let hasPending = $state(false);
	let focusReplyOnMount = $state(false);

	// Track which posts can be deleted vs need ghosting
	let postDeletionStatus = $state<Record<string, { canDelete: boolean; reason?: string }>>({});
	let discussionCanDelete = $state(true);

	const GET_EXISTING_DRAFT = `
    query GetExistingDraft($discussionId: uuid!, $authorId: uuid!) {
      post(where: {discussion_id: {_eq: $discussionId}, author_id: {_eq: $authorId}, status: {_eq: "draft"}}, limit: 1, order_by: {updated_at: desc}) {
        id
        draft_content
        updated_at
        good_faith_score
        good_faith_label
        good_faith_last_evaluated
        good_faith_analysis
      }
    }
  `;

	const UPDATE_DISCUSSION_CURRENT_VERSION = `
    mutation UpdateDiscussionCurrentVersion($discussionId: uuid!, $versionId: uuid!) {
      update_discussion(where: {id: {_eq: $discussionId}}, _set: {current_version_id: $versionId, status: "published"}) { returning { id current_version_id status } }
    }
  `;

	const GET_DISCUSSION_VERSION = `
    query GetDiscussionVersion($versionId: uuid!) {
      discussion_version_by_pk(id: $versionId) {
        id
        version_number
        title
        description
        created_at
      }
    }
  `;

	// Track which post is showing historical context
	let showingContextForPost = $state<string | null>(null);
	let historicalVersions = $state<Record<string, any>>({});
	let versionLoading = $state<Record<string, boolean>>({});
	let versionError = $state<Record<string, string>>({});

	// Function to load and show historical context for a post
	async function toggleHistoricalContext(postId: string, versionId: string) {
		if (showingContextForPost === postId) {
			// Hide if already showing
			showingContextForPost = null;
			return;
		}

		// Show for this post
		showingContextForPost = postId;

		// Load if not already cached
		if (!historicalVersions[versionId]) {
			versionLoading[versionId] = true;
			versionError[versionId] = '';

			try {
				const { data, error } = await nhost.graphql.request(GET_DISCUSSION_VERSION, { versionId });
				if (error) {
					versionError[versionId] = Array.isArray(error)
						? error.map((e: any) => e.message || 'Error').join(', ')
						: (error as any).message || 'Error';
				} else {
					historicalVersions[versionId] = (data as any)?.discussion_version_by_pk;
				}
			} catch (e: any) {
				versionError[versionId] = e.message || 'Failed to load context';
			} finally {
				versionLoading[versionId] = false;
			}
		}
	}

	let editing = $state(false);
	let editTitle = $state('');
	let editDescription = $state('');
	let editError = $state<string | null>(null);
	let editAutoSaveTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
	let editLastSavedAt = $state<number | null>(null);

	// Revision draft state
	let hasUnsavedChanges = $state(false);
	let draftLastSavedAt = $state<number | null>(null);
	let publishLoading = $state(false);

	// Writing style and citation state for editing
	let editSelectedStyle = $state<WritingStyle>('journalistic');
	let editStyleMetadata = $state<StyleMetadata>({
		citations: []
	});
	let showEditCitationForm = $state(false);

	// Heuristic pre-screening state
	let editHeuristicScore = $state<number>(0);
	let editHeuristicPassed = $state<boolean>(false);

	// Comment writing style state (automatically inferred)
	let commentStyleMetadata = $state<StyleMetadata>({
		citations: []
	});
	let commentWordCount = $state(0);

	// Heuristic pre-screening state for comments
	let commentHeuristicScore = $state<number>(0);
	let commentHeuristicPassed = $state<boolean>(false);
	let showCommentCitationReminder = $state(false);
	let showCommentCitationForm = $state(false);

	// Comment good-faith gating state
	let commentGoodFaithResult = $state<{
		good_faith_score: number;
		good_faith_label: string;
		rationale: string;
		claims?: any[];
		cultishPhrases?: string[];
		fallacyOverload?: boolean;
	} | null>(null);
	let commentGoodFaithError = $state<string | null>(null);
	let draftGoodFaithAnalysis = $state<{
		good_faith_score: number;
		good_faith_label: string;
		good_faith_last_evaluated: string;
		good_faith_analysis: any;
	} | null>(null);
	let draftAnalysisExpanded = $state(false);
	const COMMENT_GOOD_FAITH_THRESHOLD = 0.7; // 70%

	// Check if user can use analysis (reactive)
	const canUserUseAnalysis = $derived(contributor ? canUseAnalysis(contributor) : false);
	const analysisBlockedReason = $derived(
		!contributor
			? 'Unable to load account information'
			: !contributor.analysis_enabled
				? 'Good-faith analysis has been disabled for your account'
				: getMonthlyCreditsRemaining(contributor) === 0 &&
					  getPurchasedCreditsRemaining(contributor) === 0
					? 'No analysis credits remaining. Monthly credits reset at the end of the month, or you can purchase additional credits.'
					: null
	);

	// Automatically infer comment writing style based on content length
	function getInferredCommentStyle(): WritingStyle {
		if (commentWordCount <= 100) return 'quick_point';
		if (commentWordCount <= 500) return 'journalistic';
		return 'academic';
	}

	let commentSelectedStyle = $derived(getInferredCommentStyle());

	// Good faith testing state
	let goodFaithTesting = $state(false);
	let goodFaithResult = $state<{
		good_faith_score: number;
		good_faith_label: string;
		rationale: string;
		claims?: any[];
		cultishPhrases?: string[];
		fallacyOverload?: boolean;
		fromCache?: boolean;
	} | null>(null);
	let goodFaithError = $state<string | null>(null);

	// Claude good faith testing state
	let claudeGoodFaithTesting = $state(false);
	let claudeGoodFaithResult = $state<{
		good_faith_score: number;
		good_faith_label: string;
		rationale: string;
		claims?: any[];
		cultishPhrases?: string[];
		fromCache?: boolean;
	} | null>(null);
	let claudeGoodFaithError = $state<string | null>(null);

	// Good faith analysis visibility - track which item is showing analysis
	let showGoodFaithAnalysisFor = $state<string | null>(null); // Stores 'discussion' or post ID

	function updateAutosaveStatus() {
		if (!draftAutosaver) return;
		const st = draftAutosaver.getState();
		lastSavedAt = st.lastSavedAt;
		hasPending = st.hasPending;
	}

	function initAutosaver() {
		if (!draftPostId) return;
		if (draftAutosaver) draftAutosaver.destroy();
		draftAutosaver = createDraftAutosaver({
			postId: draftPostId,
			initialContent: newComment,
			delay: 700,
			minInterval: 2500,
			onSaved: () => {
				updateAutosaveStatus();
			}
		});
		updateAutosaveStatus();
	}

	async function loadExistingDraft() {
		if (!user || draftLoaded) return;
		draftLoaded = true;
		const discussionId = $page.params.id as string;
		const qp = $page.url.searchParams;
		const replyDraftParam = qp.get('replyDraftId');
		if (replyDraftParam) {
			// fetch that specific draft id if belongs to this discussion & user
			const { data, error } = await nhost.graphql.request(
				`query GetDraftById($id: uuid!, $authorId: uuid!, $discussionId: uuid!) {
					post(where: {
						id: {_eq: $id},
						author_id: {_eq: $authorId},
						discussion_id: {_eq: $discussionId}
					}) {
						id
						draft_content
						discussion_id
						author_id
						post_type
					}
				}`,
				{ id: replyDraftParam, authorId: user.id, discussionId }
			);
			if (!error) {
				const posts = (data as any)?.post;
				const candidate = posts?.[0];
				if (
					candidate &&
					candidate.author_id === user.id &&
					candidate.discussion_id === discussionId
				) {
					draftPostId = candidate.id;
					newComment = candidate.draft_content || '';
					// Calculate word count for the loaded draft content
					commentWordCount = newComment.trim() ? newComment.trim().split(/\s+/).length : 0;
					// Validate the loaded content
					validateCommentContent();
					// Set the post type from the draft
					if (candidate.post_type) {
						commentPostType = candidate.post_type;
						postTypeExpanded = false; // Keep the post type collapsed since it's already selected
					}
					initAutosaver();
					focusReplyOnMount = true;
					commentFormExpanded = true; // Expand the comment form

					// Focus and scroll immediately since onMount already ran
					setTimeout(() => {
						const ta = document.querySelector(
							'textarea[aria-label="New comment"]'
						) as HTMLTextAreaElement | null;
						if (ta) {
							ta.focus();
						}

						// Scroll to the comment section
						const commentSection = document.querySelector('.add-comment');
						if (commentSection) {
							commentSection.scrollIntoView({
								behavior: 'smooth',
								block: 'center'
							});
						}
					}, 500); // Longer delay to ensure DOM updates are complete

					// Load citation data from localStorage (until database migration is applied)
					if (typeof localStorage !== 'undefined' && draftPostId) {
						const citationKey = `citations:${draftPostId}`;
						const savedCitations = localStorage.getItem(citationKey);
						if (savedCitations) {
							try {
								const parsed = JSON.parse(savedCitations);
								commentSelectedStyle = parsed.style || 'quick_point';
								commentStyleMetadata = parsed.metadata || {
									citations: [],
									sources: []
								};
								validateCommentContent();
							} catch (e) {
								// Ignore invalid JSON
							}
						}
					}
					return;
				}
			}
		}
		// fallback to existing most recent draft lookup
		const { data, error } = await nhost.graphql.request(GET_EXISTING_DRAFT, {
			discussionId,
			authorId: user.id
		});
		if (error) return; // silent
		const existing = (data as any)?.post?.[0];
		if (existing) {
			draftPostId = existing.id;
			newComment = existing.draft_content || '';
			// Calculate word count for the loaded draft content
			commentWordCount = newComment.trim() ? newComment.trim().split(/\s+/).length : 0;
			// Validate the loaded content
			validateCommentContent();
			initAutosaver();

			// Load existing good faith analysis if available
			if (existing.good_faith_score !== null && existing.good_faith_score !== undefined) {
				draftGoodFaithAnalysis = {
					good_faith_score: existing.good_faith_score,
					good_faith_label: existing.good_faith_label,
					good_faith_last_evaluated: existing.good_faith_last_evaluated,
					good_faith_analysis: existing.good_faith_analysis
				};
			}

			// Load citation data from localStorage (until database migration is applied)
			if (typeof localStorage !== 'undefined' && draftPostId) {
				const citationKey = `citations:${draftPostId}`;
				const savedCitations = localStorage.getItem(citationKey);
				if (savedCitations) {
					try {
						const parsed = JSON.parse(savedCitations);
						commentSelectedStyle = parsed.style || 'quick_point';
						commentStyleMetadata = parsed.metadata || {
							citations: [],
							sources: []
						};
						validateCommentContent();
					} catch (e) {
						// Ignore invalid JSON
					}
				}
			}
		}
	}

	async function ensureDraftCreated() {
		if (!user || draftPostId) return;
		const discussionId = $page.params.id as string;
		const currentVersionId = discussion.current_version?.[0]?.id || null;
		// create empty draft row immediately
		const { data, error } = await nhost.graphql.request(CREATE_POST_DRAFT_WITH_STYLE, {
			discussionId,
			authorId: user.id,
			draftContent: newComment || '',
			postType: commentPostType,
			contextVersionId: currentVersionId
		});
		if (error) return; // silent fail; user can still post normally
		draftPostId = (data as any)?.insert_post_one?.id || null;
		initAutosaver();
		// push initial content through autosaver
		if (draftPostId && newComment) draftAutosaver?.handleChange(newComment);
	}

	function onCommentInput(e: Event) {
		newComment = (e.target as HTMLTextAreaElement).value;

		// Calculate word count for comments
		commentWordCount = newComment.trim() ? newComment.trim().split(/\s+/).length : 0;

		// Show citation reminder for comments with substantial content but no citations
		const hasNoCitations =
			!commentStyleMetadata.citations || commentStyleMetadata.citations.length === 0;
		const hasSubstantialContent = commentWordCount >= 50;
		showCommentCitationReminder = hasSubstantialContent && hasNoCitations;

		if (!draftPostId) {
			ensureDraftCreated();
		} else {
			draftAutosaver?.handleChange(newComment);
			updateAutosaveStatus();
		}
	}

	async function publishDraft() {
		submitError = null;
		commentGoodFaithError = null;
		commentGoodFaithResult = null;
		draftGoodFaithAnalysis = null;
		if (!user) {
			submitError = 'You must be signed in to comment.';
			return;
		}
		if (!newComment.trim()) {
			submitError = 'Comment cannot be empty.';
			return;
		}

		// Check if user can use analysis (credits and permissions)
		if (!contributor) {
			submitError = 'Unable to load account information. Please try again.';
			return;
		}

		if (!canUseAnalysis(contributor)) {
			if (!contributor.analysis_enabled) {
				submitError =
					'Good-faith analysis has been disabled for your account. Please contact support.';
				return;
			}

			const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
			const purchasedRemaining = getPurchasedCreditsRemaining(contributor);

			if (monthlyRemaining === 0 && purchasedRemaining === 0) {
				submitError =
					'You have no analysis credits remaining. Monthly credits reset at the end of the month, or you can purchase additional credits.';
				return;
			} else {
				submitError = 'Unable to proceed with analysis. Please check your credit balance.';
				return;
			}
		}

		submitting = true;
		try {
			// Ensure draft exists
			if (!draftPostId) {
				await ensureDraftCreated();
			}
			if (!draftPostId) throw new Error('Failed to create draft.');

			// Flush current content through autosaver logic
			draftAutosaver?.handleChange(newComment);

			// Good-faith analysis gate
			goodFaithTesting = true;
			try {
				const user = nhost.auth.getUser();
				const accessToken = nhost.auth.getAccessToken();
				console.log('[DEBUG] User authenticated:', !!user, user?.id);
				console.log(
					'[DEBUG] Frontend access token:',
					!!accessToken,
					accessToken?.substring(0, 20) + '...'
				);
				const headers: Record<string, string> = { 'Content-Type': 'application/json' };
				if (accessToken) {
					headers['Authorization'] = `Bearer ${accessToken}`;
				}
				console.log('[DEBUG] Headers being sent:', Object.keys(headers));
				const response = await fetch('/api/goodFaithClaude', {
					method: 'POST',
					headers,
					body: JSON.stringify({ postId: draftPostId, content: newComment })
				});
				if (!response.ok) {
					throw new Error(`Analysis failed with status ${response.status}`);
				}
				const data = await response.json();

				// Check if this was a real Claude analysis or heuristic fallback
				if (data.usedClaude === false) {
					throw new Error('Claude API is not available. Heuristic scoring cannot be used for publishing.');
				}

				const score01 =
					typeof data.good_faith_score === 'number'
						? data.good_faith_score
						: typeof data.goodFaithScore === 'number'
							? data.goodFaithScore / 100
							: 0;
				const analysisData = {
					provider: 'claude',
					score: score01,
					label: data.good_faith_label,
					rationale: data.rationale,
					claims: data.claims || [],
					cultishPhrases: data.cultishPhrases || [],
					fallacyOverload: data.fallacyOverload || false,
					analyzedAt: new Date().toISOString()
				} as any;
				const { error: gfErr } = await nhost.graphql.request(UPDATE_POST_GOOD_FAITH, {
					postId: draftPostId,
					score: analysisData.score,
					label: analysisData.label,
					analysis: analysisData
				});
				if (gfErr) console.warn('Failed to save post good-faith analysis (GraphQL):', gfErr);

				if (score01 < COMMENT_GOOD_FAITH_THRESHOLD) {
					// Keep as draft and show analysis
					commentGoodFaithResult = {
						good_faith_score: score01,
						good_faith_label: data.good_faith_label,
						rationale: data.rationale,
						claims: data.claims,
						cultishPhrases: data.cultishPhrases,
						fallacyOverload: data.fallacyOverload
					};
					submitError = `Comment saved as draft. Good-faith score ${(score01 * 100).toFixed(0)}% is below the 70% threshold.`;
					return; // Don't publish
				}
			} catch (e: any) {
				console.warn('Good-faith analysis failed; keeping comment as draft:', e);
				commentGoodFaithError = e?.message || 'Failed to analyze comment for good faith.';
				submitError = 'Could not verify good-faith score. Comment saved as draft.';
				return; // Don't publish when analysis fails
			} finally {
				goodFaithTesting = false;
			}

			// Prepare content with citations included (until database migration is applied)
			let contentWithCitations = newComment;

			// If replying to a post, embed a hidden reply reference with snapshot
			if (replyingToPost) {
				const { cleanContent: parentNoReply } = extractReplyRef(replyingToPost.content || '');
				const { cleanContent: parentClean, citationData: parentCitations } =
					extractCitationData(parentNoReply);
				const replyRef = {
					post_id: replyingToPost.id,
					author_id: replyingToPost.contributor?.id,
					created_at: replyingToPost.created_at,
					content_hash: hashContent(parentClean || ''),
					snapshot: {
						content: parentClean || '',
						writing_style: replyingToPost.writing_style || null,
						style_metadata: parentCitations?.style_metadata || null
					}
				};
				contentWithCitations += `\n\n<!-- REPLY_TO:${JSON.stringify(replyRef)} -->`;
			}
			const hasCitations =
				commentStyleMetadata.citations && commentStyleMetadata.citations.length > 0;

			if (hasCitations) {
				contentWithCitations +=
					'\n\n<!-- CITATION_DATA:' +
					JSON.stringify({
						style: commentSelectedStyle,
						metadata: commentStyleMetadata
					}) +
					'-->';
			}

			// Get the current published version ID to set as context
			const currentVersionId = discussion.current_version?.[0]?.id || null;

			// Publish the draft directly (without good faith scoring)
			const { error } = await nhost.graphql.request(
				`
        mutation PublishDraft($postId: uuid!, $content: String!, $contextVersionId: uuid) {
          update_post(where: {id: {_eq: $postId}}, _set: {status: "approved", content: $content, draft_content: "", context_version_id: $contextVersionId}) {
            returning { id status context_version_id }
          }
        }`,
				{
					postId: draftPostId,
					content: contentWithCitations,
					contextVersionId: currentVersionId
				}
			);

			if (error) throw error;

			// Clear composer & reload posts
			newComment = '';
			draftAutosaver?.destroy();
			draftAutosaver = null;

			// Clean up citation data from localStorage
			if (typeof localStorage !== 'undefined' && draftPostId) {
				const citationKey = `citations:${draftPostId}`;
				localStorage.removeItem(citationKey);
			}

			draftPostId = null;
			draftLoaded = false;
			commentStyleMetadata = {
				citations: []
			};
			commentSelectedStyle = 'quick_point';
			await refreshApprovedPosts($page.params.id as string);
			clearReplying();
		} catch (e: any) {
			submitError = e.message || 'Failed to publish comment.';
		} finally {
			submitting = false;
		}
	}

	async function refreshApprovedPosts(discussionId: string) {
		const result = await nhost.graphql.request(IMPORTED_GET_DISCUSSION_DETAILS, { discussionId });
		if ((result as any).error) return;
		const fresh = (result as any).data?.discussion_by_pk;
		if (fresh) discussion.posts = fresh.posts; // only need posts
	}

	async function loadDiscussionCitations() {
		if (!discussion) return;

		try {
			// Get the current published version ID
			const currentVersion = discussion.current_version?.[0];
			if (!currentVersion?.id) {
				return;
			}

			const result = await nhost.graphql.request(
				`
				query GetDiscussionCitations($discussion_version_id: uuid!) {
					discussion_version_citation(
						where: { discussion_version_id: { _eq: $discussion_version_id } }
						order_by: { citation_order: asc }
					) {
						id
						citation_order
						custom_point_supported
						custom_relevant_quote
						citation {
							id
							title
							url
							author
							publisher
							publish_date
							accessed_date
							page_number
							point_supported
							relevant_quote
							created_at
							created_by
						}
					}
				}
				`,
				{ discussion_version_id: currentVersion.id }
			);

			if ((result as any).error) {
				console.error('Failed to load citations:', (result as any).error);
				return;
			}

			const citationLinks = (result as any).data?.discussion_version_citation || [];

			// Convert to legacy format for compatibility with existing UI
			if (citationLinks.length > 0) {
				const legacyCitations = citationLinks.map((link: any) => ({
					id: link.citation.id,
					title: link.citation.title,
					url: link.citation.url,
					author: link.citation.author,
					publisher: link.citation.publisher,
					publishDate: link.citation.publish_date,
					accessed: link.citation.accessed_date,
					pageNumber: link.citation.page_number,
					pointSupported: link.custom_point_supported || link.citation.point_supported,
					relevantQuote: link.custom_relevant_quote || link.citation.relevant_quote
				}));

				// Store citations in the current version's metadata for display
				if (currentVersion) {
					currentVersion.citationsFromTable = legacyCitations;
				}
			}
		} catch (error) {
			console.error('Error loading citations:', error);
		}
	}

	async function loadCitationsForDraftVersion(draftVersionId: string) {
		if (!draftVersionId) return;

		try {
			const result = await nhost.graphql.request(
				`
				query GetDraftVersionCitations($discussion_version_id: uuid!) {
					discussion_version_citation(
						where: { discussion_version_id: { _eq: $discussion_version_id } }
						order_by: { citation_order: asc }
					) {
						id
						citation_order
						custom_point_supported
						custom_relevant_quote
						citation {
							id
							title
							url
							author
							publisher
							publish_date
							page_number
							relevant_quote
							point_supported
						}
					}
				}`,
				{ discussion_version_id: draftVersionId }
			);

			if ((result as any).error) {
				console.error('Failed to load draft citations:', (result as any).error);
				return;
			}

			const citationLinks = (result as any).data?.discussion_version_citation || [];

			// Convert to legacy format for compatibility with existing UI
			if (citationLinks.length > 0) {
				const legacyCitations = citationLinks.map((link: any) => ({
					id: link.citation.id,
					title: link.citation.title,
					url: link.citation.url,
					author: link.citation.author,
					publisher: link.citation.publisher,
					publishDate: link.citation.publish_date,
					pageNumber: link.citation.page_number,
					pointSupported: link.custom_point_supported || link.citation.point_supported,
					relevantQuote: link.custom_relevant_quote || link.citation.relevant_quote
				}));

				editStyleMetadata.citations = legacyCitations;
			}
		} catch (error) {
			console.error('Error loading draft citations:', error);
		}
	}

	async function loadDiscussion() {
		try {
			const discussionId = $page.params.id as string;

			// Create a modified query that includes user filtering for draft versions
			const GET_DISCUSSION_WITH_USER_DRAFTS = `
				query GetDiscussionDetails($discussionId: uuid!, $userId: uuid) {
					discussion_by_pk(id: $discussionId) {
						id
						created_at
						created_by
						is_anonymous
						status
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
							citations
							audio_url
							good_faith_score
							good_faith_label
							good_faith_last_evaluated
							good_faith_analysis
						}
						draft_version: discussion_versions(
							where: {
								version_type: { _eq: "draft" }
								created_by: { _eq: $userId }
							}
							order_by: { version_number: desc }
							limit: 1
						) {
							id
							title
							description
							good_faith_score
							good_faith_label
							good_faith_last_evaluated
							good_faith_analysis
						}
						posts(where: { status: { _eq: "approved" } }, order_by: { created_at: asc }) {
							id
							content
							created_at
							is_anonymous
							context_version_id
							writing_style
							good_faith_score
							good_faith_label
							good_faith_last_evaluated
							good_faith_analysis
							contributor {
								id
								handle
								display_name
							}
						}
					}
				}
			`;

			const result = await nhost.graphql.request(GET_DISCUSSION_WITH_USER_DRAFTS, {
				discussionId,
				userId: user?.id || null
			});

			if ((result as any).error) {
				console.error('GraphQL Error:', (result as any).error);
				throw new Error(
					Array.isArray((result as any).error)
						? (result as any).error.map((e: any) => e.message || 'Unknown error').join(', ')
						: (result as any).error.message || 'GraphQL request failed'
				);
			}

			const discussionData = (result as any).data?.discussion_by_pk;
			if (!discussionData) {
				throw new Error('Discussion not found');
			}

			discussion = discussionData;

			// Load citations from the new citation tables
			await loadDiscussionCitations();

			await loadExistingDraft();
		} catch (e: any) {
			console.error('Load discussion error:', e);
			error = e;
		} finally {
			loading = false;
		}
	}

	async function loadEditorsDeskApprovals() {
		if (!user?.id) {
			editorsDeskApprovals = [];
			return;
		}

		try {
			const result = await nhost.graphql.request(GET_MY_PENDING_EDITORS_DESK_APPROVALS, {
				authorId: user.id
			});

			if ((result as any).error) {
				console.error('Error loading editors desk approvals:', (result as any).error);
				return;
			}

			editorsDeskApprovals = (result as any).data?.editors_desk_pick || [];
		} catch (err) {
			console.error('Failed to load editors desk approvals:', err);
		}
	}

	function handleApprovalStatusChange() {
		// Reload approvals to reflect the updated status
		loadEditorsDeskApprovals();
	}

	async function loadContributor() {
		if (!user?.id) {
			contributor = null;
			return;
		}

		try {
			const result = await nhost.graphql.request(GET_CONTRIBUTOR, {
				userId: user.id
			});

			if ((result as any).error) {
				console.error('Error loading contributor:', (result as any).error);
				return;
			}

			contributor = (result as any).data?.contributor_by_pk || null;

			// Check and reset monthly credits if needed
			if (contributor) {
				const HASURA_GRAPHQL_ENDPOINT = nhost.graphql.getUrl();
				const accessToken = nhost.auth.getAccessToken();

				if (accessToken) {
					const wasReset = await checkAndResetMonthlyCredits(
						contributor,
						HASURA_GRAPHQL_ENDPOINT,
						accessToken
					);

					// If credits were reset, reload contributor to get updated values
					if (wasReset) {
						const updatedResult = await nhost.graphql.request(GET_CONTRIBUTOR, {
							userId: user.id
						});
						if (!(updatedResult as any).error) {
							contributor = (updatedResult as any).data?.contributor_by_pk || null;
						}
					}
				}
			}
		} catch (error) {
			console.error('Error loading contributor:', error);
			contributor = null;
		}
	}

	onMount(() => {
		// Give auth a moment to initialize, then mark as ready
		setTimeout(() => {
			authReady = true;
		}, 100);

		if (focusReplyOnMount) {
			const ta = document.querySelector(
				'textarea[aria-label="New comment"]'
			) as HTMLTextAreaElement | null;
			if (ta) {
				setTimeout(() => {
					ta.focus();
					// Scroll to the comment section
					const commentSection = document.querySelector('.add-comment');
					if (commentSection) {
						commentSection.scrollIntoView({
							behavior: 'smooth',
							block: 'center'
						});
					}
				}, 100);
			}
		}

		// Handle window resize for auto-resizing textarea
		const handleResize = () => {
			const textarea = document.getElementById('edit-description') as HTMLTextAreaElement;
			if (textarea && editing) {
				autoResizeTextarea(textarea);
			}
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	// Reactive: load discussion when auth becomes ready
	$effect(() => {
		if (authReady && !discussion && !error) {
			loadDiscussion();
		}
	});

	// Check deletion status when discussion and user are loaded
	$effect(() => {
		if (discussion && user) {
			checkAllDeletionStatus();
		}
	});

	// Load contributor when user changes
	$effect(() => {
		if (user) {
			loadContributor();
		}
	});

	// Load editors desk approvals when user and discussion are loaded
	$effect(() => {
		if (user && discussion) {
			loadEditorsDeskApprovals();
		}
	});

	// Credit utility functions - using centralized logic
	function getTotalCreditsRemaining(): number {
		if (!contributor) return 0;
		const monthly = getMonthlyCreditsRemaining(contributor);
		const purchased = getPurchasedCreditsRemaining(contributor);

		if (monthly === Infinity) return Infinity;
		return monthly + purchased;
	}

	function getAnalysisLimitText(): string {
		if (!contributor) return '';
		if (!contributor.analysis_enabled) return 'Analysis disabled';
		if (hasAdminAccess(contributor)) return 'Unlimited analysis';

		const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
		const purchasedRemaining = getPurchasedCreditsRemaining(contributor);

		if (monthlyRemaining === Infinity) return 'Unlimited analysis';

		let text = `${monthlyRemaining}/${contributor.analysis_limit} monthly`;
		if (purchasedRemaining > 0) {
			text += ` • ${purchasedRemaining} purchased`;
		}

		return text;
	}

	async function consumeAnalysisCredit(): Promise<void> {
		if (!contributor) return;

		try {
			// Check if we should use purchased credits instead of monthly
			if (willUsePurchasedCredit(contributor)) {
				// Use purchased credit
				await nhost.graphql.request(INCREMENT_PURCHASED_CREDITS_USED, {
					contributorId: contributor.id
				});
			}
			// If using monthly credit, the existing INCREMENT_ANALYSIS_USAGE is called by the API endpoints

			// Reload contributor data to reflect the updated counts
			await loadContributor();
		} catch (error) {
			console.error('Error consuming analysis credit:', error);
		}
	}

	async function createDatabaseDraft() {
		if (!discussion || !user) return;

		try {
			// Initialize form with published content
			editTitle = getDiscussionTitle(discussion);

			// Extract citation data from discussion description if it exists
			const extraction = extractCitationData(getDiscussionDescription(discussion));
			editDescription = extraction.cleanContent;

			if (extraction.citationData) {
				editSelectedStyle = extraction.citationData.writing_style;
				editStyleMetadata = ensureIdsForCitationData(extraction.citationData.style_metadata);
			} else {
				// Reset to defaults if no citation data found
				editSelectedStyle = 'journalistic';
				editStyleMetadata = { citations: [] };
			}

			// Check if there's already a draft for this discussion through the discussion relationship
			const existingDraftCheck = await nhost.graphql.request(
				`
				query CheckExistingDraft($discussionId: uuid!, $userId: uuid!) {
					discussion_by_pk(id: $discussionId) {
						discussion_versions(
							where: {
								version_type: { _eq: "draft" }
								created_by: { _eq: $userId }
							}
						) {
							id
							title
							description
						}
					}
				}
			`,
				{
					discussionId: discussion.id,
					userId: user.id
				}
			);

			const existingDraft = existingDraftCheck.data?.discussion_by_pk?.discussion_versions?.[0];

			if (existingDraft) {
				// Update existing draft instead of creating new one
				const updateResult = await nhost.graphql.request(
					`
					mutation UpdateExistingDraft($draftId: uuid!, $title: String!, $description: String!) {
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
							created_by
							version_type
							version_number
							good_faith_score
							good_faith_label
							good_faith_last_evaluated
						}
					}
				`,
					{
						draftId: existingDraft.id,
						title: editTitle,
						description: editDescription
					}
				);

				if (updateResult.error) {
					console.error('Failed to update existing draft:', updateResult.error);
					editError = `Failed to update draft: ${JSON.stringify(updateResult.error)}`;
					return;
				}

				const updatedDraft = updateResult.data?.update_discussion_version_by_pk;
				if (updatedDraft) {
					// Check if draft already has citations
					const existingCitationsResult = await nhost.graphql.request(
						GET_DISCUSSION_CITATIONS,
						{ discussion_version_id: existingDraft.id }
					);

					// If draft has no citations, copy from published version
					if (!existingCitationsResult.data?.discussion_version_citation?.length) {
						const publishedVersion = discussion.current_version?.[0];
						if (publishedVersion) {
							console.log('Draft has no citations, copying from published version:', publishedVersion.id);

							// Get citations from published version
							const citationsResult = await nhost.graphql.request(
								GET_DISCUSSION_CITATIONS,
								{ discussion_version_id: publishedVersion.id }
							);

							if (citationsResult.data?.discussion_version_citation) {
								const citations = citationsResult.data.discussion_version_citation;
								console.log('Found', citations.length, 'citations to copy to existing draft');

								// Copy each citation link to the draft version
								for (const dc of citations) {
									await nhost.graphql.request(
										LINK_CITATION_TO_DISCUSSION,
										{
											discussion_version_id: existingDraft.id,
											citation_id: dc.citation.id,
											citation_order: dc.citation_order,
											custom_point_supported: dc.custom_point_supported,
											custom_relevant_quote: dc.custom_relevant_quote
										}
									);
								}
								console.log('Copied citations to existing draft');
							}
						}
					}

					// Add the updated draft to the discussion object
					if (!discussion.draft_version) {
						discussion.draft_version = [];
					}
					discussion.draft_version[0] = updatedDraft;
					hasUnsavedChanges = true;
					console.log('Updated existing database draft:', updatedDraft.id);
					return updatedDraft.id;
				}
				return null;
			}

			// First, get the highest version number for this discussion
			const versionQuery = await nhost.graphql.request(
				`
				query GetMaxVersionNumber($discussionId: uuid!) {
					discussion_by_pk(id: $discussionId) {
						discussion_versions(
							order_by: { version_number: desc }
							limit: 1
						) {
							version_number
						}
					}
				}
			`,
				{
					discussionId: discussion.id
				}
			);

			const maxVersion =
				versionQuery.data?.discussion_by_pk?.discussion_versions?.[0]?.version_number || 0;
			const nextVersionNumber = maxVersion + 1;

			// Create a draft version in the database
			const result = await nhost.graphql.request(
				`
				mutation CreateDiscussionDraft($discussionId: uuid!, $userId: uuid!, $title: String!, $description: String!, $versionNumber: Int!) {
					insert_discussion_version_one(object: {
						discussion_id: $discussionId
						created_by: $userId
						title: $title
						description: $description
						version_type: "draft"
						version_number: $versionNumber
					}) {
						id
						title
						description
						created_by
						version_type
						version_number
						good_faith_score
						good_faith_label
						good_faith_last_evaluated
					}
				}
			`,
				{
					discussionId: discussion.id,
					userId: user.id,
					title: editTitle,
					description: editDescription,
					versionNumber: nextVersionNumber
				}
			);

			if ((result as any).error) {
				console.error('Failed to create database draft:', (result as any).error);
				console.error('Full result:', result);
				editError = `Failed to create draft: ${JSON.stringify((result as any).error)}`;
				return;
			}

			const newDraft = (result as any).data?.insert_discussion_version_one;
			if (newDraft) {
				// Copy citations from the published version to the new draft
				const publishedVersion = discussion.current_version?.[0];
				if (publishedVersion) {
					console.log('Copying citations from published version:', publishedVersion.id);

					// Get citations from published version
					const citationsResult = await nhost.graphql.request(
						GET_DISCUSSION_CITATIONS,
						{ discussion_version_id: publishedVersion.id }
					);

					if (citationsResult.data?.discussion_version_citation) {
						const citations = citationsResult.data.discussion_version_citation;
						console.log('Found', citations.length, 'citations to copy');

						// Copy each citation link to the draft version
						for (const dc of citations) {
							await nhost.graphql.request(
								LINK_CITATION_TO_DISCUSSION,
								{
									discussion_version_id: newDraft.id,
									citation_id: dc.citation.id,
									citation_order: dc.citation_order,
									custom_point_supported: dc.custom_point_supported,
									custom_relevant_quote: dc.custom_relevant_quote
								}
							);
						}
						console.log('Copied citations to draft');
					}
				}

				// Add the new draft to the discussion object
				if (!discussion.draft_version) {
					discussion.draft_version = [];
				}
				discussion.draft_version[0] = newDraft;

				hasUnsavedChanges = true;
				console.log('Created database draft:', newDraft.id);
				return newDraft.id;
			}
		} catch (error) {
			console.error('Error creating database draft:', error);
			editError = 'Failed to create draft';
			return null;
		}
	}

	async function startEdit() {
		try {
			// Check if there's already a draft for this discussion
			const draftVersion = discussion?.draft_version?.[0];

			if (draftVersion) {
				// Draft already exists, check if it needs citations copied
				const existingCitationsResult = await nhost.graphql.request(
					GET_DISCUSSION_CITATIONS,
					{ discussion_version_id: draftVersion.id }
				);

				// If draft has no citations, copy from published version before navigating
				if (!existingCitationsResult.data?.discussion_version_citation?.length) {
					const publishedVersion = discussion.current_version?.[0];
					if (publishedVersion) {
						console.log('[startEdit] Draft has no citations, copying from published version:', publishedVersion.id);

						// Get citations from published version
						const citationsResult = await nhost.graphql.request(
							GET_DISCUSSION_CITATIONS,
							{ discussion_version_id: publishedVersion.id }
						);

						if (citationsResult.data?.discussion_version_citation) {
							const citations = citationsResult.data.discussion_version_citation;
							console.log('[startEdit] Found', citations.length, 'citations to copy to draft');

							// Copy each citation link to the draft version
							for (const dc of citations) {
								await nhost.graphql.request(
									LINK_CITATION_TO_DISCUSSION,
									{
										discussion_version_id: draftVersion.id,
										citation_id: dc.citation.id,
										citation_order: dc.citation_order,
										custom_point_supported: dc.custom_point_supported,
										custom_relevant_quote: dc.custom_relevant_quote
									}
								);
							}
							console.log('[startEdit] Copied citations to draft');
						}
					}
				}

				// Navigate to the draft (with or without newly copied citations)
				goto(`/discussions/${discussion.id}/draft/${draftVersion.id}`);
				return;
			}

			// No draft found, create a new database draft based on published content
			const draftId = await createDatabaseDraft();

			if (draftId) {
				// Redirect to the draft editing page
				goto(`/discussions/${discussion.id}/draft/${draftId}`);
			} else {
				console.error('Failed to create draft');
				editError = 'Failed to create draft for editing';
			}
		} catch (error) {
			console.error('Error starting edit:', error);
			editError = 'Failed to start editing';
		}
	}

	function cancelEdit() {
		if (hasUnsavedChanges) {
			if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
				return;
			}
			clearDraftFromLocalStorage();
		}
		editing = false;
		editError = null;
	}

	function saveDraftToLocalStorage() {
		if (!editing || !discussion) return;

		try {
			const draftData = {
				title: editTitle.trim(),
				description: editDescription.trim(),
				selectedStyle: editSelectedStyle,
				styleMetadata: editStyleMetadata,
				lastSaved: Date.now()
			};

			const draftKey = `discussion_draft:${discussion.id}`;
			localStorage.setItem(draftKey, JSON.stringify(draftData));
			draftLastSavedAt = Date.now();
			hasUnsavedChanges = true;
		} catch (e) {
			console.error('Failed to save draft:', e);
		}
	}

	function loadDraftFromLocalStorage() {
		if (!discussion) return false;

		try {
			const draftKey = `discussion_draft:${discussion.id}`;
			const draftData = localStorage.getItem(draftKey);

			if (draftData) {
				const draft = JSON.parse(draftData);
				editTitle = draft.title || getDiscussionTitle(discussion);
				editDescription = draft.description || getDiscussionDescription(discussion);
				editSelectedStyle = draft.selectedStyle || 'journalistic';
				editStyleMetadata = ensureIdsForCitationData(draft.styleMetadata || { citations: [] });
				draftLastSavedAt = draft.lastSaved;
				hasUnsavedChanges = true;
				return true;
			}
		} catch (e) {
			console.error('Failed to load draft:', e);
		}
		return false;
	}

	function clearDraftFromLocalStorage() {
		if (!discussion) return;

		try {
			const draftKey = `discussion_draft:${discussion.id}`;
			localStorage.removeItem(draftKey);
			hasUnsavedChanges = false;
			draftLastSavedAt = null;
		} catch (e) {
			console.error('Failed to clear draft:', e);
		}
	}

	async function publishDraftChanges() {
		if (!editing || !discussion || !hasUnsavedChanges) return;

		publishLoading = true;
		editError = null;

		try {
			// Validate required fields
			if (!editTitle.trim()) {
				editError = 'Title required';
				return;
			}
			if (!editDescription.trim()) {
				editError = 'Description required';
				return;
			}

			// If no meaningful change, skip
			if (
				editTitle.trim() === getDiscussionTitle(discussion) &&
				editDescription.trim() === getDiscussionDescription(discussion)
			) {
				editing = false;
				clearDraftFromLocalStorage();
				return;
			}

			// Use clean description without embedded citations (using proper citation tables now)
			let descriptionWithCitations = editDescription.trim();

			const discussionId = discussion.id;

			// Get the current draft version to update
			const draftVersion = discussion.draft_version?.[0];
			if (!draftVersion) {
				throw new Error('No draft version found to publish');
			}

			// Check for comments on current published version and handle version management
			const commentsCheck = await nhost.graphql.request(
				`
				query CheckVersionComments($discussionId: uuid!) {
					discussion_by_pk(id: $discussionId) {
						discussion_versions(where: {version_type: {_eq: "published"}}) {
							id
							version_number
						}
					}
					post_aggregate(where: {discussion_id: {_eq: $discussionId}, context_version_id: {_is_null: false}}) {
						aggregate {
							count
						}
						nodes {
							context_version_id
						}
					}
				}
			`,
				{ discussionId }
			);

			const currentPublished = commentsCheck.data?.discussion_by_pk?.discussion_versions?.[0];
			const commentsData = commentsCheck.data?.post_aggregate;
			const hasComments = commentsData?.aggregate?.count > 0;

			console.log('Version management debug:', {
				currentPublished,
				hasComments,
				commentsCount: commentsData?.aggregate?.count,
				discussionId
			});

			// If there's a published version, archive it (always archive to avoid permissions issues)
			if (currentPublished) {
				console.log('Found existing published version, archiving it...');
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
					{ versionId: currentPublished.id }
				);

				console.log('Archive result:', archiveResult);
				if (archiveResult.error) {
					console.error('Archive operation error:', archiveResult.error);
				}
				if (!archiveResult.data?.update_discussion_version_by_pk) {
					console.error('Archive operation failed. Full result:', archiveResult);
					throw new Error(
						`Failed to archive existing published version: ${JSON.stringify(archiveResult.error || 'No data returned')}`
					);
				}
				console.log('Successfully archived published version');
			}

			// Now update the draft version to published
			const updated = await nhost.graphql.request(
				`
        mutation UpdateDraftVersion($versionId: uuid!, $title: String!, $description: String!) {
          update_discussion_version_by_pk(
            pk_columns: { id: $versionId }
            _set: {
              title: $title,
              description: $description,
              version_type: "published"
            }
          ) {
            id
            version_number
            title
            description
            version_type
          }
        }
      `,
				{
					versionId: draftVersion.id,
					title: editTitle.trim(),
					description: descriptionWithCitations
				}
			);

			if ((updated as any).error) {
				console.error('Error updating draft version to published:', (updated as any).error);
				throw (updated as any).error;
			}

			if (!(updated as any).data?.update_discussion_version_by_pk) {
				console.error('No data returned from draft version update:', updated);
				throw new Error('Failed to update draft version to published - no data returned');
			}

			const versionId = draftVersion.id;

			// Update the discussion status and current version
			const upd = await nhost.graphql.request(UPDATE_DISCUSSION_CURRENT_VERSION, {
				discussionId,
				versionId
			});

			if ((upd as any).error) {
				console.error('Error updating discussion current_version_id:', (upd as any).error);
				throw (upd as any).error;
			}

			if (!(upd as any).data?.update_discussion?.returning?.[0]) {
				console.error('No data returned from update_discussion mutation:', upd);
				throw new Error('Failed to update discussion current_version_id - no data returned');
			}

			// Handle citations - create and link them to the discussion version
			if (editStyleMetadata.citations?.length) {
				for (let i = 0; i < editStyleMetadata.citations.length; i++) {
					const legacyCitation = editStyleMetadata.citations[i];

					// Convert legacy citation format to new format
					const convertedCitation = {
						title: legacyCitation.title,
						url: legacyCitation.url,
						author: legacyCitation.author || null,
						publisher: legacyCitation.publisher || null,
						publish_date: legacyCitation.publish_date || null,
						accessed_date: legacyCitation.accessed_date || null,
						page_number: legacyCitation.page_number || null,
						point_supported: legacyCitation.point_supported,
						relevant_quote: legacyCitation.relevant_quote
					};

					try {
						// Create the citation in the database

						const createResult = await nhost.graphql.request(
							`
							mutation CreateCitation(
								$title: String!
								$url: String!
								$author: String
								$publisher: String
								$publish_date: date
								$accessed_date: date
								$page_number: String
								$point_supported: String!
								$relevant_quote: String!
								$created_by: uuid!
							) {
								insert_citation_one(
									object: {
										title: $title
										url: $url
										author: $author
										publisher: $publisher
										publish_date: $publish_date
										accessed_date: $accessed_date
										page_number: $page_number
										point_supported: $point_supported
										relevant_quote: $relevant_quote
										created_by: $created_by
									}
								) {
									id
								}
							}
							`,
							{
								...convertedCitation,
								created_by: user?.id
							}
						);

						console.log('Citation creation result:', createResult);

						if ((createResult as any).error) {
							console.error('Failed to create citation:', (createResult as any).error);
							continue;
						}

						const citationId = (createResult as any).data?.insert_citation_one?.id;
						if (!citationId) {
							console.error('No citation ID returned from creation');
							continue;
						}

						// Link the citation to the discussion version

						const linkResult = await nhost.graphql.request(
							`
							mutation LinkCitationToDiscussion(
								$discussion_version_id: uuid!
								$citation_id: uuid!
								$citation_order: Int!
							) {
								insert_discussion_version_citation_one(
									object: {
										discussion_version_id: $discussion_version_id
										citation_id: $citation_id
										citation_order: $citation_order
									}
								) {
									id
								}
							}
							`,
							{
								discussion_version_id: versionId,
								citation_id: citationId,
								citation_order: i + 1
							}
						);

						console.log('Citation linking result:', linkResult);

						if ((linkResult as any).error) {
							console.error('Failed to link citation:', (linkResult as any).error);
						}
					} catch (error) {
						console.error('Error processing citation:', error);
					}
				}
			}

			// Update UI - update the current version data
			const versionToUpdate = discussion.current_version?.[0] || discussion.draft_version?.[0];
			if (versionToUpdate) {
				versionToUpdate.title = editTitle.trim();
				versionToUpdate.description = descriptionWithCitations;
			}
			discussion.current_version_id = versionId;

			// Clear draft and exit editing mode
			clearDraftFromLocalStorage();
			editing = false;
		} catch (e: any) {
			editError = e.message || 'Failed to publish changes.';
		} finally {
			publishLoading = false;
		}
	}

	async function saveDraftToDatabase() {
		if (!editing || !discussion || !user) return;

		const draftVersion = discussion?.draft_version?.[0];
		if (!draftVersion) return;

		try {
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
					draftId: draftVersion.id,
					title: editTitle.trim(),
					description: editDescription.trim()
				}
			);

			if (result.error) {
				throw new Error('Failed to save draft to database');
			}

			// Update local state
			draftVersion.title = editTitle.trim();
			draftVersion.description = editDescription.trim();
			draftLastSavedAt = Date.now();
			hasUnsavedChanges = true;
		} catch (error) {
			console.error('Error saving draft to database:', error);
			// Fall back to localStorage if database save fails
			saveDraftToLocalStorage();
		}
	}

	function scheduleEditAutoSave() {
		if (editAutoSaveTimeout) {
			clearTimeout(editAutoSaveTimeout);
		}
		editAutoSaveTimeout = setTimeout(() => {
			const draftVersion = discussion?.draft_version?.[0];
			if (draftVersion) {
				// Use database draft if it exists
				saveDraftToDatabase();
			} else {
				// Fall back to localStorage
				saveDraftToLocalStorage();
			}
		}, 1500);
	}

	function onEditTitleInput(e: Event) {
		editTitle = (e.target as HTMLInputElement).value;
		validateEditContent();
		scheduleEditAutoSave();
	}

	function onEditDescriptionInput(e: Event) {
		const textarea = e.target as HTMLTextAreaElement;
		editDescription = textarea.value;

		// Auto-resize textarea
		autoResizeTextarea(textarea);

		validateEditContent();
		scheduleEditAutoSave();
	}

	function autoResizeTextarea(textarea: HTMLTextAreaElement) {
		// Reset height to auto to get the actual scrollHeight
		textarea.style.height = 'auto';

		// Calculate new height based on content, with maximum of 80vh
		const maxHeight = Math.floor(window.innerHeight * 0.8);
		const newHeight = Math.min(textarea.scrollHeight, maxHeight);

		// Set the new height
		textarea.style.height = newHeight + 'px';

		// Add scrollbar if content exceeds max height
		if (textarea.scrollHeight > maxHeight) {
			textarea.style.overflowY = 'auto';
		} else {
			textarea.style.overflowY = 'hidden';
		}
	}

	// Note: submitEdit function removed - replaced with publishDraftChanges

	// Citation management functions for editing
	function addEditCitation(item: Citation) {
		editStyleMetadata.citations = [...(editStyleMetadata.citations || []), item];
		showEditCitationForm = false;
		validateEditContent();
		// Trigger autosave when citation is added
		scheduleEditAutoSave();
	}

	function removeEditCitation(id: string) {
		editStyleMetadata.citations = editStyleMetadata.citations?.filter((c) => c.id !== id) || [];
		validateEditContent();
		// Trigger autosave when citation is removed
		scheduleEditAutoSave();
	}

	function startEditCitation(id: string) {
		let itemToEdit: Citation | null = null;

		itemToEdit = editStyleMetadata.citations?.find((c) => c.id === id) || null;

		if (itemToEdit) {
			editingEditCitation = itemToEdit;
			showEditCitationForm = true;
		}
	}

	function updateEditCitation(updatedItem: Citation) {
		const index = editStyleMetadata.citations?.findIndex((c) => c.id === updatedItem.id) || -1;
		if (index !== -1) {
			editStyleMetadata.citations![index] = updatedItem;
		}

		showEditCitationForm = false;
		editingEditCitation = null;
		validateEditContent();
		scheduleEditAutoSave();
	}

	function cancelEditCitation() {
		showEditCitationForm = false;
		editingEditCitation = null;
	}

	function validateEditContent() {
		const assessment = assessContentQuality(editDescription, editTitle);
		editHeuristicScore = assessment.score;
		editHeuristicPassed = assessment.passed;
		return assessment;
	}

	// Citation reference insertion for editing
	function insertEditCitationReference(citationId: string) {
		const textarea = document.querySelector('#edit-description') as HTMLTextAreaElement;
		if (!textarea) return;

		const allCitations = editStyleMetadata.citations || [];
		const citationNumber = allCitations.findIndex((c) => c.id === citationId) + 1;

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const before = editDescription.substring(0, start);
		const after = editDescription.substring(end);

		editDescription = `${before}[${citationNumber}]${after}`;

		// Trigger autosave
		scheduleEditAutoSave();

		// Restore cursor position after the inserted citation
		setTimeout(() => {
			textarea.setSelectionRange(
				start + `[${citationNumber}]`.length,
				start + `[${citationNumber}]`.length
			);
			textarea.focus();
		}, 0);
	}

	// Show citation picker for editing
	let showEditCitationPicker = $state(false);

	function openEditCitationPicker() {
		const allCitations = editStyleMetadata.citations || [];
		if (allCitations.length === 0) {
			alert('Please add citations or sources first before inserting references.');
			return;
		}
		showEditCitationPicker = true;
	}

	// Citation management functions for comments
	async function addCommentCitation(item: Citation) {
		commentStyleMetadata.citations = [...(commentStyleMetadata.citations || []), item];
		showCommentCitationForm = false;

		// Update citation reminder status
		const hasSubstantialContent = commentWordCount >= 50;
		showCommentCitationReminder =
			hasSubstantialContent && commentStyleMetadata.citations.length === 0;

		validateCommentContent();

		// Ensure draft exists and save citation metadata
		await ensureDraftCreated();
		// Store citation data in localStorage for now (until database migration is applied)
		if (typeof localStorage !== 'undefined' && draftPostId) {
			const citationKey = `citations:${draftPostId}`;
			localStorage.setItem(
				citationKey,
				JSON.stringify({
					style: commentSelectedStyle,
					metadata: commentStyleMetadata
				})
			);
		}
	}

	async function removeCommentCitation(id: string) {
		commentStyleMetadata.citations =
			commentStyleMetadata.citations?.filter((c) => c.id !== id) || [];

		// Update citation reminder status
		const hasSubstantialContent = commentWordCount >= 50;
		showCommentCitationReminder =
			hasSubstantialContent && commentStyleMetadata.citations.length === 0;

		validateCommentContent();

		// Update stored citation data
		if (typeof localStorage !== 'undefined' && draftPostId) {
			const citationKey = `citations:${draftPostId}`;
			localStorage.setItem(
				citationKey,
				JSON.stringify({
					style: commentSelectedStyle,
					metadata: commentStyleMetadata
				})
			);
		}
	}

	function startEditCommentCitation(id: string) {
		let itemToEdit: Citation | null = null;
		itemToEdit = commentStyleMetadata.citations?.find((c) => c.id === id) || null;

		if (itemToEdit) {
			editingCommentCitation = itemToEdit;
			showCommentCitationEditForm = true;
		}
	}

	function updateCommentCitation(updatedItem: Citation) {
		const index = commentStyleMetadata.citations?.findIndex((c) => c.id === updatedItem.id) || -1;
		if (index !== -1) {
			commentStyleMetadata.citations![index] = updatedItem;
		}

		showCommentCitationEditForm = false;
		editingCommentCitation = null;
		validateCommentContent();

		// Update stored citation data
		if (typeof localStorage !== 'undefined' && draftPostId) {
			const citationKey = `citations:${draftPostId}`;
			localStorage.setItem(
				citationKey,
				JSON.stringify({
					style: commentSelectedStyle,
					metadata: commentStyleMetadata
				})
			);
		}
	}

	function cancelCommentCitationEdit() {
		showCommentCitationEditForm = false;
		editingCommentCitation = null;
	}

	function validateCommentContent() {
		const assessment = assessContentQuality(newComment);
		commentHeuristicScore = assessment.score;
		commentHeuristicPassed = assessment.passed;
		return assessment;
	}

	// Citation reference insertion for comments
	function insertCommentCitationReference(citationId: string) {
		const textarea = document.querySelector(
			'textarea[aria-label="New comment"]'
		) as HTMLTextAreaElement;
		if (!textarea) return;

		const allCitations = commentStyleMetadata.citations || [];
		const citationNumber = allCitations.findIndex((c) => c.id === citationId) + 1;

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const before = newComment.substring(0, start);
		const after = newComment.substring(end);

		newComment = `${before}[${citationNumber}]${after}`;

		// Trigger autosave
		if (draftAutosaver) {
			draftAutosaver.handleChange(newComment);
		}

		// Restore cursor position after the inserted citation
		setTimeout(() => {
			textarea.setSelectionRange(
				start + `[${citationNumber}]`.length,
				start + `[${citationNumber}]`.length
			);
			textarea.focus();
		}, 0);
	}

	// Show citation picker for comments
	let showCommentCitationPicker = $state(false);

	// Edit citation/source state
	let editingEditCitation = $state<Citation | null>(null);

	let editingCommentCitation = $state<Citation | null>(null);
	let showCommentCitationEditForm = $state(false);

	function openCommentCitationPicker() {
		const allCitations = commentStyleMetadata.citations || [];
		if (allCitations.length === 0) {
			alert('Please add citations or sources first before inserting references.');
			return;
		}
		showCommentCitationPicker = true;
	}

	// Delete functionality
	async function handleDeletePost(post: any) {
		if (!user) return;

		if (!confirmDeletion('post')) return;

		try {
			const deletionCheck = await checkPostDeletable(
				post.id,
				user.id,
				discussion.id,
				post.created_at
			);

			if (!deletionCheck.canDelete) {
				alert(`Cannot delete post: ${deletionCheck.reason}`);
				return;
			}

			const success = await deletePost(post.id);
			if (success) {
				// Refresh the discussion to show updated posts
				await refreshApprovedPosts(discussion.id);
				alert('Post deleted successfully');
			} else {
				alert('Failed to delete post');
			}
		} catch (error) {
			console.error('Error deleting post:', error);
			alert('Error deleting post');
		}
	}

	async function handleDeleteDiscussion() {
		if (!user || !discussion) return;

		if (!confirmDeletion('discussion', getDiscussionTitle(discussion))) return;

		try {
			const deletionCheck = await checkDiscussionDeletable(discussion.id, user.id);

			if (!deletionCheck.canDelete) {
				alert(`Cannot delete discussion: ${deletionCheck.reason}`);
				return;
			}

			const success = await deleteDiscussion(discussion.id, user.id);
			if (success) {
				// Redirect to dashboard after successful deletion
				window.location.href = '/';
			} else {
				alert('Failed to delete discussion');
			}
		} catch (error) {
			console.error('Error deleting discussion:', error);
			alert('Error deleting discussion');
		}
	}

	// Check deletion status for all posts and discussion
	async function checkAllDeletionStatus() {
		if (!user || !discussion) return;

		// Check discussion deletion status
		if (user.id === discussion.contributor.id) {
			try {
				const discussionCheck = await checkDiscussionDeletable(discussion.id, user.id);
				discussionCanDelete = discussionCheck.canDelete;
			} catch (error) {
				console.error('Error checking discussion deletion status:', error);
			}
		}

		// Check post deletion status for user's posts
		const userPosts = discussion.posts.filter((post: any) => post.contributor.id === user?.id);
		const statusChecks: Record<string, { canDelete: boolean; reason?: string }> = {};

		for (const post of userPosts) {
			try {
				const postCheck = await checkPostDeletable(
					post.id,
					user.id,
					discussion.id,
					post.created_at
				);
				statusChecks[post.id] = postCheck;
			} catch (error) {
				console.error(`Error checking deletion status for post ${post.id}:`, error);
				statusChecks[post.id] = { canDelete: false, reason: 'Error checking status' };
			}
		}

		postDeletionStatus = statusChecks;
	}

	// Anonymization functions
	async function handleAnonymizePost(post: any) {
		if (!user || post.contributor.id !== user.id) return;

		if (
			!confirm(
				`Make this post anonymous? This will hide your name from other users but cannot be undone.`
			)
		)
			return;

		try {
			const { error } = await nhost.graphql.request(ANONYMIZE_POST, { postId: post.id });
			if (error) {
				throw error;
			}

			// Update the post in the local state to reflect the change
			if (discussion) {
				discussion.posts = discussion.posts.map((p: any) =>
					p.id === post.id ? { ...p, is_anonymous: true } : p
				);
			}

			alert('Post has been made anonymous');
		} catch (error) {
			console.error('Error anonymizing post:', error);
			alert('Error making post anonymous');
		}
	}

	async function handleAnonymizeDiscussion() {
		if (!user || !discussion || discussion.contributor.id !== user.id) return;

		if (
			!confirm(
				`Make this discussion anonymous? This will hide your name from other users but cannot be undone.`
			)
		)
			return;

		try {
			const { error } = await nhost.graphql.request(ANONYMIZE_DISCUSSION, {
				discussionId: discussion.id
			});
			if (error) {
				throw error;
			}

			// Update the discussion in the local state to reflect the change
			discussion.is_anonymous = true;

			alert('Discussion has been made anonymous');
		} catch (error) {
			console.error('Error anonymizing discussion:', error);
			alert('Error making discussion anonymous');
		}
	}

	// Un-anonymization functions
	async function handleUnanonymizePost(post: any) {
		if (!user || post.contributor.id !== user.id) return;

		if (!confirm(`Reveal your identity on this post? Your name will be visible to other users.`))
			return;

		try {
			const { error } = await nhost.graphql.request(UNANONYMIZE_POST, { postId: post.id });
			if (error) {
				throw error;
			}

			// Update the post in the local state to reflect the change
			if (discussion) {
				discussion.posts = discussion.posts.map((p: any) =>
					p.id === post.id ? { ...p, is_anonymous: false } : p
				);
			}

			alert('Post identity has been revealed');
		} catch (error) {
			console.error('Error revealing post identity:', error);
			alert('Error revealing post identity');
		}
	}

	async function handleUnanonymizeDiscussion() {
		if (!user || !discussion || discussion.contributor.id !== user.id) return;

		if (
			!confirm(`Reveal your identity on this discussion? Your name will be visible to other users.`)
		)
			return;

		try {
			const { error } = await nhost.graphql.request(UNANONYMIZE_DISCUSSION, {
				discussionId: discussion.id
			});
			if (error) {
				throw error;
			}

			// Update the discussion in the local state to reflect the change
			discussion.is_anonymous = false;

			alert('Discussion identity has been revealed');
		} catch (error) {
			console.error('Error revealing discussion identity:', error);
			alert('Error revealing discussion identity');
		}
	}

	// Audio upload handler
	async function handleAudioUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		// Validate file type
		const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/x-wav'];
		if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav)$/i)) {
			audioUploadError = 'Please upload an audio file (MP3, M4A, or WAV)';
			return;
		}

		// Validate file size (max 50MB)
		const maxSize = 50 * 1024 * 1024; // 50MB
		if (file.size > maxSize) {
			audioUploadError = 'Audio file must be less than 50MB';
			return;
		}

		audioUploading = true;
		audioUploadError = null;
		audioUploadProgress = 0;

		try {
			const versionId = discussion?.current_version?.[0]?.id;
			if (!versionId) {
				throw new Error('No discussion version found');
			}

			// Upload to Nhost Storage
			const { fileMetadata, error: uploadError } = await nhost.storage.upload({
				file,
				bucketId: 'audio'
			});

			if (uploadError) {
				throw new Error(uploadError.message || 'Failed to upload audio file');
			}

			if (!fileMetadata) {
				throw new Error('No file metadata returned');
			}

			// Store the file ID to use with our API proxy
			const audioUrl = `/api/audio/${fileMetadata.id}`;

			// Save the audio URL to the database
			console.log('About to save audio URL:', { versionId, audioUrl });

			// First, verify we can read this version
			const checkResult = await nhost.graphql.request(
				`query CheckVersion($versionId: uuid!) {
					discussion_version_by_pk(id: $versionId) {
						id
						title
						created_by
						version_type
					}
				}`,
				{ versionId }
			);
			console.log('Version check result:', checkResult);
			console.log('Current user ID:', user?.id);
			console.log('Version created_by:', checkResult.data?.discussion_version_by_pk?.created_by);
			console.log('IDs match:', user?.id === checkResult.data?.discussion_version_by_pk?.created_by);
			console.log('Discussion owner ID:', discussion?.contributor?.id);
			console.log('User owns discussion:', user?.id === discussion?.contributor?.id);
			console.log('User role:', contributor?.role);
			console.log('Has admin access:', hasAdminAccess(contributor));

			const result = await nhost.graphql.request(UPDATE_DISCUSSION_VERSION_AUDIO, {
				versionId,
				audioUrl
			});

			console.log('GraphQL result:', result);

			if (result.error) {
				console.error('Audio URL update error:', result.error);
				console.error('Version ID:', versionId);
				console.error('Audio URL:', audioUrl);
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to update discussion with audio URL'
					: result.error.message || 'Failed to update discussion with audio URL';
				throw new Error(errorMessage);
			}

			if (!result.data?.update_discussion_version_by_pk) {
				console.error('No data returned from mutation');
				throw new Error('Failed to update discussion with audio URL - no data returned');
			}

			console.log('Successfully saved audio URL to database');

			// Update local discussion state
			if (discussion.current_version?.[0]) {
				discussion.current_version[0].audio_url = audioUrl;
			}

			audioUploadProgress = 100;

			// Clear file input
			input.value = '';

		} catch (err: any) {
			console.error('Error uploading audio:', err);
			audioUploadError = err.message || 'Failed to upload audio file';
		} finally {
			audioUploading = false;
			setTimeout(() => {
				audioUploadProgress = 0;
			}, 2000);
		}
	}

	// Remove audio from discussion
	async function handleRemoveAudio() {
		if (!confirm('Remove the audio from this discussion?')) return;

		audioUploading = true;
		audioUploadError = null;

		try {
			const versionId = discussion?.current_version?.[0]?.id;
			if (!versionId) {
				throw new Error('No discussion version found');
			}

			// Remove audio URL from database
			const result = await nhost.graphql.request(UPDATE_DISCUSSION_VERSION_AUDIO, {
				versionId,
				audioUrl: null
			});

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to remove audio'
					: result.error.message || 'Failed to remove audio';
				throw new Error(errorMessage);
			}

			// Update local discussion state
			if (discussion.current_version?.[0]) {
				discussion.current_version[0].audio_url = null;
			}

		} catch (err: any) {
			console.error('Error removing audio:', err);
			audioUploadError = err.message || 'Failed to remove audio';
		} finally {
			audioUploading = false;
		}
	}

	// Ensure all citations and sources have IDs
	// Good faith testing function (OpenAI)
	async function testGoodFaith() {
		if (!editDescription.trim()) {
			goodFaithError = 'Please enter some content to test';
			return;
		}

		// Check analysis limits
		if (!contributor || !canUseAnalysis(contributor)) {
			goodFaithError = getAnalysisLimitText() || 'Analysis not available';
			return;
		}

		// Check cache first
		const cachedResult = await getCachedAnalysis(discussion?.id || null, editDescription, 'openai');
		if (cachedResult) {
			goodFaithResult = { ...cachedResult, fromCache: true };
			return;
		}

		goodFaithTesting = true;
		goodFaithError = null;
		goodFaithResult = null;

		try {
			// Use local API route during development, Vercel function in production
			const endpoint = import.meta.env.DEV ? '/api/goodFaith' : '/functions/goodFaith';

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					postId: 'test',
					content: editDescription
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(data.error);
			}

			goodFaithResult = {
				good_faith_score: data.good_faith_score,
				good_faith_label: data.good_faith_label,
				rationale: data.rationale,
				claims: data.claims,
				cultishPhrases: data.cultishPhrases,
				fallacyOverload: data.fallacyOverload
			};

			// Cache the result
			await cacheAnalysis(discussion?.id || null, editDescription, 'openai', goodFaithResult);

			// Consume the appropriate credit (monthly or purchased)
			await consumeAnalysisCredit();

			// Save to database
			await saveGoodFaithAnalysisToDatabase(goodFaithResult, 'openai');
		} catch (error: any) {
			goodFaithError = error.message || 'Failed to analyze content';
		} finally {
			goodFaithTesting = false;
		}
	}

	// Claude good faith testing function
	async function testGoodFaithClaude() {
		if (!editDescription.trim()) {
			claudeGoodFaithError = 'Please enter some content to test';
			return;
		}

		// Check analysis limits
		if (!contributor || !canUseAnalysis(contributor)) {
			claudeGoodFaithError = getAnalysisLimitText() || 'Analysis not available';
			return;
		}

		// Check cache first
		const cachedResult = await getCachedAnalysis(discussion?.id || null, editDescription, 'claude');
		if (cachedResult) {
			claudeGoodFaithResult = { ...cachedResult, fromCache: true };
			return;
		}

		claudeGoodFaithTesting = true;
		claudeGoodFaithError = null;
		claudeGoodFaithResult = null;

		try {
			const accessToken = nhost.auth.getAccessToken();
			const headers: Record<string, string> = { 'Content-Type': 'application/json' };
			if (accessToken) {
				headers['Authorization'] = `Bearer ${accessToken}`;
			}
			const response = await fetch('/api/goodFaithClaude', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					postId: 'test-claude',
					content: editDescription
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();

			// Check if this was a real Claude analysis or heuristic fallback
			if (data.usedClaude === false) {
				throw new Error('Claude API is not available. Heuristic scoring cannot be used for publishing.');
			}


			if (data.error) {
				throw new Error(data.error);
			}

			claudeGoodFaithResult = {
				good_faith_score: data.good_faith_score,
				good_faith_label: data.good_faith_label,
				rationale: data.rationale,
				claims: data.claims,
				cultishPhrases: data.cultishPhrases
			};

			// Cache the result
			await cacheAnalysis(discussion?.id || null, editDescription, 'claude', claudeGoodFaithResult);

			// Consume the appropriate credit (monthly or purchased)
			await consumeAnalysisCredit();

			// Save to database
			await saveGoodFaithAnalysisToDatabase(claudeGoodFaithResult, 'claude');
		} catch (error: any) {
			claudeGoodFaithError = error.message || 'Failed to analyze content with Claude';
		} finally {
			claudeGoodFaithTesting = false;
		}
	}

	// Save good faith analysis to database
	async function saveGoodFaithAnalysisToDatabase(result: any, provider: 'openai' | 'claude') {
		if (!discussion || !result) return;

		try {
			// Create the analysis object to store
			const analysisData = {
				provider,
				score: result.good_faith_score,
				label: result.good_faith_label,
				rationale: result.rationale,
				claims: result.claims || [],
				cultishPhrases: result.cultishPhrases || [],
				fallacyOverload: result.fallacyOverload || false,
				analyzedAt: new Date().toISOString()
			};

			console.log(`📊 Saving ${provider} analysis to database for discussion ${discussion.id}`);

			// Update the current discussion version's good faith analysis
			// Use published version if it exists, otherwise use draft version
			const currentVersionId =
				discussion.current_version?.[0]?.id || discussion.draft_version?.[0]?.id;
			if (currentVersionId) {
				const { error } = await nhost.graphql.request(UPDATE_DISCUSSION_VERSION_GOOD_FAITH, {
					versionId: currentVersionId,
					score: result.good_faith_score,
					label: result.good_faith_label,
					analysis: analysisData
				});

				if (error) {
					console.error('Failed to save good faith analysis to database:', error);
					throw error;
				}
			} else {
				console.warn('No current version found, cannot save good faith analysis to database');
			}

			// Always update the local discussion object (works regardless of DB save success)
			if (discussion) {
				// Update the current version data (published version takes priority, fall back to draft)
				const versionToUpdate = discussion.current_version?.[0] || discussion.draft_version?.[0];
				if (versionToUpdate) {
					versionToUpdate.good_faith_score = result.good_faith_score;
					versionToUpdate.good_faith_label = result.good_faith_label;
					versionToUpdate.good_faith_last_evaluated = new Date().toISOString();
				}
				// Also keep local analysis data for display purposes
				discussion.good_faith_analysis = analysisData;
			}
		} catch (error) {
			console.warn(`❌ Error saving ${provider} good faith analysis:`, error);
			console.log(`💡 Database columns exist, likely a GraphQL schema refresh issue`);

			// Still update local state so UI works
			if (discussion) {
				// Update the current version data (published version takes priority, fall back to draft)
				const versionToUpdate = discussion.current_version?.[0] || discussion.draft_version?.[0];
				if (versionToUpdate) {
					versionToUpdate.good_faith_score = result.good_faith_score;
					versionToUpdate.good_faith_label = result.good_faith_label;
					versionToUpdate.good_faith_last_evaluated = new Date().toISOString();
				}
				// Also keep local analysis data for display purposes
				discussion.good_faith_analysis = {
					provider,
					score: result.good_faith_score,
					label: result.good_faith_label,
					rationale: result.rationale,
					claims: result.claims || [],
					cultishPhrases: result.cultishPhrases || [],
					fallacyOverload: result.fallacyOverload || false,
					analyzedAt: new Date().toISOString()
				};
			}
		}
	}

	// Helper function to test if GraphQL schema supports good faith fields
	// You can call this from the browser console: window.testGoodFaithSchema()
	if (typeof window !== 'undefined') {
		(window as any).testGoodFaithSchema = async () => {
			if (!discussion) {
				console.log('❌ No discussion loaded to test');
				return;
			}

			try {
				console.log('🧪 Testing if GraphQL schema supports good faith fields...');
				const currentVersionId =
					discussion.current_version?.[0]?.id || discussion.draft_version?.[0]?.id;
				if (!currentVersionId) {
					console.log('❌ No current or draft version found to test');
					return;
				}

				const { error } = await nhost.graphql.request(UPDATE_DISCUSSION_VERSION_GOOD_FAITH, {
					versionId: currentVersionId,
					score: 0.5,
					label: 'test',
					analysis: { test: true }
				});

				if (error) {
					console.log('❌ Schema not ready:', error);
					return false;
				} else {
					console.log('✅ Schema is ready! You can now re-enable database saving.');
					return true;
				}
			} catch (e) {
				console.log('❌ Schema test failed:', e);
				return false;
			}
		};
	}

	// Replying to a specific post
	let replyingToPost = $state<any | null>(null);
	function startReply(post: any) {
		replyingToPost = post;
		// Focus main comment textarea
		setTimeout(() => {
			const ta = document.querySelector(
				'textarea[aria-label="New comment"]'
			) as HTMLTextAreaElement | null;
			if (ta) ta.focus();
		}, 50);
	}

	function clearReplying() {
		replyingToPost = null;
	}

	// Editing a published post (author-only)
	let editingPostId = $state<string | null>(null);
	let editingPostContent = $state('');
	let editingPostReplyRef: any | null = $state(null);
	let editingPostCitationData: {
		writing_style: WritingStyle;
		style_metadata: StyleMetadata;
	} | null = $state(null);
	let editPostError = $state<string | null>(null);
	let editPostSaving = $state(false);

	function startEditPost(post: any) {
		editPostError = null;
		const { cleanContent: noReply, replyRef } = extractReplyRef(post.content || '');
		const { cleanContent, citationData } = extractCitationData(noReply);
		editingPostReplyRef = replyRef || null;
		editingPostCitationData = citationData || null;
		editingPostContent = cleanContent;
		editingPostId = post.id;
	}

	function cancelEditPost() {
		editingPostId = null;
		editingPostContent = '';
		editingPostReplyRef = null;
		editingPostCitationData = null;
		editPostError = null;
	}

	async function savePostEdit(post: any) {
		if (!editingPostId || editingPostId !== post.id) return;
		editPostSaving = true;
		editPostError = null;
		try {
			let updated = editingPostContent.trim();
			if (editingPostReplyRef) {
				updated += `\n\n<!-- REPLY_TO:${JSON.stringify(editingPostReplyRef)} -->`;
			}
			if (editingPostCitationData) {
				updated += `\n<!-- CITATION_DATA:${JSON.stringify(editingPostCitationData)} -->`;
			}
			const MUT = `mutation UpdatePostContent($postId: uuid!, $content: String!) { update_post_by_pk(pk_columns: {id: $postId}, _set: { content: $content }) { id content } }`;
			const { error } = await nhost.graphql.request(MUT, {
				postId: post.id,
				content: updated
			});
			if (error) throw error;
			// Update local post
			post.content = updated;
			cancelEditPost();
		} catch (e: any) {
			editPostError = e?.message || 'Failed to save edits.';
		} finally {
			editPostSaving = false;
		}
	}

	// Format contributor name to avoid showing raw emails
	function displayName(name?: string | null): string {
		if (!name) return '';
		const n = String(name).trim();
		const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n);
		if (isEmail) return n.split('@')[0];
		return n;
	}
</script>

<article class="discussion-article">
	{#if loading}
		<p>Loading...</p>
	{:else if error}
		<p class="error-message">Error: {error.message}</p>
	{:else if discussion}
		<header class="discussion-header">
			<DiscussionHeader
				discussion={{
					id: discussion.id,
					created_at: discussion.created_at,
					is_anonymous: discussion.is_anonymous,
					contributor: discussion.contributor
				}}
				title={getDiscussionTitle(discussion)}
				tags={getDiscussionTags(discussion)}
				audioUrl={discussion?.current_version?.[0]?.audio_url}
				isOwner={user ? discussion.contributor.id === user.id : false}
				canDelete={discussionCanDelete}
				onEdit={startEdit}
				onDelete={handleDeleteDiscussion}
				onAnonymize={handleAnonymizeDiscussion}
				onRevealIdentity={handleUnanonymizeDiscussion}
			/>

			{#if pendingApprovalForThisDiscussion}
				<EditorsDeskApprovalCard
					pick={pendingApprovalForThisDiscussion}
					onResponse={handleApprovalStatusChange}
				/>
			{/if}

			{#if editing}
				<DiscussionEditForm
					bind:title={editTitle}
					bind:description={editDescription}
					bind:styleMetadata={editStyleMetadata}
					bind:showCitationForm={showEditCitationForm}
					bind:showCitationEditForm={showEditCitationForm}
					bind:editingCitation={editingEditCitation}
					bind:showCitationPicker={showEditCitationPicker}
					heuristicScore={editHeuristicScore}
					heuristicPassed={editHeuristicPassed}
					{goodFaithTesting}
					{claudeGoodFaithTesting}
					bind:goodFaithResult
					bind:goodFaithError
					bind:claudeGoodFaithResult
					bind:claudeGoodFaithError
					lastSavedAt={editLastSavedAt}
					bind:submitError={editError}
					{publishLoading}
					{hasUnsavedChanges}
					{contributor}
					onTitleInput={onEditTitleInput}
					onDescriptionInput={onEditDescriptionInput}
					onAddCitation={addEditCitation}
					onUpdateCitation={updateEditCitation}
					onRemoveCitation={removeEditCitation}
					onStartEditCitation={startEditCitation}
					onCancelCitationEdit={cancelEditCitation}
					onInsertCitationReference={insertEditCitationReference}
					onOpenCitationPicker={openEditCitationPicker}
					onTestGoodFaith={testGoodFaith}
					onTestGoodFaithClaude={testGoodFaithClaude}
					onPublish={publishDraftChanges}
					onCancel={cancelEdit}
					{getAnalysisLimitText}
					{formatChicagoCitation}
					{assessContentQuality}
				/>
			{/if}
			{#if getDiscussionDescription(discussion)}
				{@const extraction = extractCitationData(getDiscussionDescription(discussion))}
				{@const jsonCitations = extraction.citationData?.style_metadata?.citations || []}
				{@const tableCitations = discussion?.current_version?.[0]?.citationsFromTable || []}
				{@const versionCitations = discussion?.current_version?.[0]?.citations || []}
				{@const allCitations = [...tableCitations, ...versionCitations, ...jsonCitations]}
				{@const processedContent = processCitationReferences(extraction.cleanContent, allCitations)}
				<div class="discussion-description">{@html processedContent.replace(/\n/g, '<br>')}</div>

				<DiscussionReferencesDisplay citations={allCitations} {formatChicagoCitation} />

				<!-- Audio Player and Upload (Admin Only) -->
				{@const audioUrl = discussion?.current_version?.[0]?.audio_url}
				{@const hasAudioManagementAccess = hasAdminAccess(contributor)}

				{#if hasAudioManagementAccess && !editing}
					<div class="audio-admin-section">
						<h3>Audio Management</h3>

						{#if audioUrl}
							<button
								type="button"
								class="remove-audio-button"
								onclick={handleRemoveAudio}
								disabled={audioUploading}
							>
								Remove Audio
							</button>
						{:else}
							<label class="audio-upload-label">
								<input
									type="file"
									accept="audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/wav"
									onchange={handleAudioUpload}
									disabled={audioUploading}
									class="audio-file-input"
								/>
								<span class="audio-upload-button">
									{audioUploading ? 'Uploading...' : 'Upload Audio Reading'}
								</span>
							</label>

							{#if audioUploading && audioUploadProgress > 0}
								<div class="audio-upload-progress">
									<div class="progress-bar">
										<div class="progress-fill" style="width: {audioUploadProgress}%"></div>
									</div>
									<span class="progress-text">{audioUploadProgress}%</span>
								</div>
							{/if}

							{#if audioUploadError}
								<p class="audio-error">{audioUploadError}</p>
							{/if}
						{/if}
					</div>
				{/if}

				{#if !editing}
					<DiscussionGoodFaithBadge
						score={getDiscussionGoodFaithScore(discussion)}
						label={getDiscussionGoodFaithLabel(discussion)}
						onClick={() =>
							(showGoodFaithAnalysisFor =
								showGoodFaithAnalysisFor === 'discussion' ? null : 'discussion')}
					/>
				{/if}
			{/if}
		</header>

		<div class="posts-list">
			{#each discussion.posts as post}
				<PostItem
					{post}
					isOwner={user && post.contributor.id === user.id}
					canDelete={postDeletionStatus[post.id]?.canDelete !== false}
					isEditing={editingPostId === post.id}
					bind:editContent={editingPostContent}
					editError={editPostError}
					editSaving={editPostSaving}
					showGoodFaithModal={showGoodFaithAnalysisFor === post.id}
					showHistoricalContext={showingContextForPost === post.id}
					historicalVersion={post.context_version_id
						? historicalVersions[post.context_version_id]
						: null}
					versionLoading={post.context_version_id ? versionLoading[post.context_version_id] : false}
					versionError={post.context_version_id ? versionError[post.context_version_id] : null}
					onReply={startReply}
					onEdit={startEditPost}
					onSaveEdit={savePostEdit}
					onCancelEdit={cancelEditPost}
					onDelete={handleDeletePost}
					onAnonymize={handleAnonymizePost}
					onUnanonymize={handleUnanonymizePost}
					onToggleGoodFaith={(postId) =>
						(showGoodFaithAnalysisFor = showGoodFaithAnalysisFor === postId ? null : postId)}
					onToggleContext={toggleHistoricalContext}
					{displayName}
					{extractReplyRef}
					{extractCitationData}
					{processCitationReferences}
					{ensureIdsForCitationData}
					{formatChicagoCitation}
					{getStyleConfig}
				/>
			{:else}
				<p>No posts in this discussion yet. Be the first to contribute!</p>
			{/each}
		</div>

		<CommentComposer
			{user}
			bind:expanded={commentFormExpanded}
			bind:comment={newComment}
			bind:postType={commentPostType}
			bind:postTypeExpanded
			bind:showAdvancedFeatures
			wordCount={commentWordCount}
			selectedStyle={commentSelectedStyle}
			bind:styleMetadata={commentStyleMetadata}
			bind:showCitationForm={showCommentCitationForm}
			bind:showCitationEditForm={showCommentCitationEditForm}
			bind:editingCitation={editingCommentCitation}
			showCitationReminder={showCommentCitationReminder}
			bind:showCitationPicker={showCommentCitationPicker}
			heuristicScore={commentHeuristicScore}
			heuristicPassed={commentHeuristicPassed}
			{draftPostId}
			{draftGoodFaithAnalysis}
			bind:draftAnalysisExpanded
			goodFaithResult={commentGoodFaithResult}
			goodFaithError={commentGoodFaithError}
			{submitError}
			{hasPending}
			{lastSavedAt}
			{contributor}
			{replyingToPost}
			{analysisBlockedReason}
			{canUserUseAnalysis}
			{submitting}
			onInput={onCommentInput}
			onFocus={loadExistingDraft}
			onAddCitation={addCommentCitation}
			onUpdateCitation={updateCommentCitation}
			onCancelCitationEdit={cancelCommentCitationEdit}
			onInsertCitationReference={insertCommentCitationReference}
			onOpenCitationPicker={openCommentCitationPicker}
			onPublish={publishDraft}
			onClearReplying={clearReplying}
			getStyleConfig={(style: string) => getStyleConfig(style as WritingStyle)}
			{getPostTypeConfig}
			{getAnalysisLimitText}
			{formatChicagoCitation}
			{assessContentQuality}
		/>
	{:else}
		<p>Discussion not found.</p>
	{/if}

	<GoodFaithModal
		show={showGoodFaithAnalysisFor !== null}
		analysisData={showGoodFaithAnalysisFor === 'discussion'
			? {
					score: getDiscussionGoodFaithScore(discussion),
					label: getDiscussionGoodFaithLabel(discussion),
					analysis: getDiscussionGoodFaithAnalysis(discussion),
					lastEvaluated: getDiscussionGoodFaithLastEvaluated(discussion)
				}
			: discussion?.posts?.find((p: any) => p.id === showGoodFaithAnalysisFor)}
		isDiscussion={showGoodFaithAnalysisFor === 'discussion'}
		onClose={() => (showGoodFaithAnalysisFor = null)}
	/>
</article>

<OutOfCreditsModal
	bind:show={showOutOfCreditsModal}
	{analysisBlockedReason}
	onClose={() => (showOutOfCreditsModal = false)}
/>

<style>
	.discussion-article {
		max-width: 1080px;
		margin: 0 auto;
		padding: 3rem 2rem;
		background: var(--color-surface);
		min-height: 100vh;
	}

	@media (max-width: 768px) {
		.discussion-article {
			padding: 2rem 1rem;
		}
	}
	/* Editorial Article Header */
	.discussion-header {
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--color-border);
	}

	.discussion-description {
		font-size: 1.125rem;
		color: var(--color-text-primary);
		line-height: var(--line-height-relaxed);
		white-space: pre-wrap;
		word-wrap: break-word;
		margin-bottom: 2rem;
		font-family: var(--font-family-sans);
	}

	/* Superscript citation reference styling */
	:global(.citation-ref) {
		color: var(--color-primary) !important;
		text-decoration: none !important;
		font-weight: 600 !important;
		cursor: pointer !important;
	}

	:global(.citation-ref:hover) {
		text-decoration: underline !important;
	}

	.error-message {
		color: #ef4444;
	}

	@keyframes pulse {
		0% {
			opacity: 0.2;
		}
		50% {
			opacity: 1;
		}
		100% {
			opacity: 0.2;
		}
	}

	/* Nuclear approach - override ALL link colors in dark mode */
	:global([data-theme='dark'] a),
	:global([data-theme='dark'] a:link),
	:global([data-theme='dark'] a:visited),
	:global([data-theme='dark'] a:hover),
	:global([data-theme='dark'] a:active) {
		color: #a9c8ff;
	}

	/* Comment Writing Info Styles */


	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Good Faith Info Icon */
	.discussion-header {
		position: relative;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Audio Upload & Player Styles */
	.audio-section {
		margin-top: 2rem;
		padding: 1.5rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
	}

	.audio-admin-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		margin: 2rem 0;
	}

	.audio-admin-section h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
	}

	.remove-audio-button {
		align-self: flex-start;
		padding: 0.5rem 1rem;
		background: transparent;
		color: var(--color-error);
		border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
		border-radius: var(--border-radius-sm);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-speed) ease;
	}

	.remove-audio-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		border-color: var(--color-error);
		transform: translateY(-1px);
	}

	.remove-audio-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.audio-upload-hint {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.audio-upload-label {
		display: inline-block;
		cursor: pointer;
	}

	.audio-file-input {
		display: none;
	}

	.audio-upload-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
		font-weight: 500;
		transition: all var(--transition-speed) ease;
	}

	.audio-upload-label:hover .audio-upload-button {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
		transform: translateY(-1px);
	}

	.audio-upload-label:has(input:disabled) {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.audio-upload-progress {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		background: var(--color-surface-alt);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-primary);
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		min-width: 3rem;
		text-align: right;
	}

	.audio-error {
		color: var(--color-error);
		font-size: 0.875rem;
		margin: 0;
		padding: 0.5rem;
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
		border-radius: var(--border-radius-sm);
	}

</style>
