<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	// Avoid importing gql to prevent type resolution issues; use plain string
	import { nhost } from '$lib/nhostClient';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import {
		CREATE_POST_DRAFT,
		CREATE_POST_DRAFT_WITH_STYLE,
		UPDATE_DISCUSSION_VERSION_GOOD_FAITH,
		UPDATE_POST_GOOD_FAITH,
		GET_DISCUSSION_DETAILS as IMPORTED_GET_DISCUSSION_DETAILS,
		GET_CONTRIBUTOR,
		INCREMENT_PURCHASED_CREDITS_USED,
		ANONYMIZE_POST,
		ANONYMIZE_DISCUSSION,
		UNANONYMIZE_POST,
		UNANONYMIZE_DISCUSSION
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
	import CitationForm from '$lib/components/CitationForm.svelte';
	import {
		canUseAnalysis,
		getMonthlyCreditsRemaining,
		getPurchasedCreditsRemaining,
		willUsePurchasedCredit,
		checkAndResetMonthlyCredits
	} from '$lib/creditUtils';
	import AnimatedLogo from '$lib/components/AnimatedLogo.svelte';
	import {
		checkPostDeletable,
		deletePost,
		checkDiscussionDeletable,
		deleteDiscussion,
		confirmDeletion
	} from '$lib/utils/deletePost';

	let discussion = $state<any>(null);
	let loading = $state(true);
	let error = $state<Error | null>(null);
	let authReady = $state(false);
	let contributor = $state<any>(null);

	// Helper functions to handle versioned discussion data
	function getDiscussionTitle(): string {
		if (!discussion) return 'Untitled Discussion';
		const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
		return version?.title || 'Untitled Discussion';
	}

	function getDiscussionDescription(): string {
		if (!discussion) return '';
		const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
		return version?.description || '';
	}

	function getDiscussionTags(): string[] {
		if (!discussion) return [];
		const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
		return version?.tags || [];
	}

	function getDiscussionGoodFaithScore(): number | null {
		if (!discussion) return null;
		const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
		return version?.good_faith_score || null;
	}

	function getDiscussionGoodFaithLabel(): string | null {
		if (!discussion) return null;
		const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
		return version?.good_faith_label || null;
	}

	function getDiscussionGoodFaithLastEvaluated(): string | null {
		if (!discussion) return null;
		const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
		return version?.good_faith_last_evaluated || null;
	}

	function getDiscussionGoodFaithAnalysis(): any | null {
		if (!discussion) return null;
		// For analysis, we check the versioned data first, then fall back to local state
		const version = discussion.current_version?.[0] || discussion.draft_version?.[0];
		return version?.good_faith_analysis || discussion.good_faith_analysis || null;
	}

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

	let historicalVersion = $state<any>(null);
	let versionLoading = $state(false);
	let versionError = $state<string | null>(null);

	$effect(() => {
		const versionRef = $page.url.searchParams.get('versionRef');
		if (versionRef) {
			versionLoading = true;
			versionError = null;
			nhost.graphql
				.request(GET_DISCUSSION_VERSION, { versionId: versionRef })
				.then(({ data, error }) => {
					if (error) {
						// error could be array or object; attempt to normalize
						versionError = Array.isArray(error)
							? error.map((e) => (e as any).message || 'Error').join(', ')
							: (error as any).message || 'Error';
					} else {
						historicalVersion = (data as any)?.discussion_version_by_pk;
					}
				})
				.finally(() => {
					versionLoading = false;
				});
		} else {
			historicalVersion = null;
			versionError = null;
			versionLoading = false;
		}
	});


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
	let commentGoodFaithTesting = $state(false);
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
	const analysisBlockedReason = $derived(!contributor
		? 'Unable to load account information'
		: !contributor.analysis_enabled
		? 'Good-faith analysis has been disabled for your account'
		: getMonthlyCreditsRemaining(contributor) === 0 && getPurchasedCreditsRemaining(contributor) === 0
		? 'No analysis credits remaining. Monthly credits reset at the end of the month, or you can purchase additional credits.'
		: null);

	// Automatically infer comment writing style based on content length
	function getInferredCommentStyle(): WritingStyle {
		if (commentWordCount <= 100) return 'quick_point';
		if (commentWordCount <= 500) return 'journalistic';
		return 'academic';
	}

	// Heuristic pre-screening function
	function assessContentQuality(
		content: string,
		title?: string
	): { score: number; passed: boolean; issues: string[] } {
		const issues: string[] = [];
		let score = 0;

		// Word count assessment (0-25 points)
		const wordCount = content.trim().split(/\s+/).length;
		if (wordCount >= 50) score += 25;
		else if (wordCount >= 25) score += 15;
		else if (wordCount >= 10) score += 10;
		else issues.push(`Content too short (${wordCount} words, minimum 25 recommended)`);

		// Structure assessment (0-25 points)
		const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
		if (sentences.length >= 3) score += 25;
		else if (sentences.length >= 2) score += 15;
		else issues.push('Content needs more detailed explanation (at least 2-3 sentences)');

		// Title assessment for discussions (0-15 points)
		if (title) {
			const titleWords = title.trim().split(/\s+/).length;
			if (titleWords >= 3 && titleWords <= 15) score += 15;
			else if (titleWords >= 2) score += 10;
			else issues.push('Title should be 3-15 words for clarity');
		}

		// Basic grammar/formatting (0-20 points)
		const hasCapitalization = /[A-Z]/.test(content);
		const hasPunctuation = /[.!?]/.test(content);
		const notAllCaps = content !== content.toUpperCase();

		if (hasCapitalization && hasPunctuation && notAllCaps) score += 20;
		else if (hasCapitalization && hasPunctuation) score += 15;
		else if (hasCapitalization || hasPunctuation) score += 10;
		else issues.push('Content needs proper capitalization and punctuation');

		// Substance assessment (0-15 points)
		const hasQuestionWords = /\b(what|why|how|when|where|who)\b/i.test(content);
		const hasReasoningWords = /\b(because|since|therefore|however|although|while)\b/i.test(content);
		const hasEvidence = /\b(study|research|data|evidence|example|according to)\b/i.test(content);

		if (hasEvidence) score += 15;
		else if (hasReasoningWords) score += 10;
		else if (hasQuestionWords) score += 5;
		else issues.push('Content could benefit from more reasoning, evidence, or specific examples');

		const passed = score >= 50; // 50% threshold
		return { score, passed, issues };
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

	// Good faith analysis visibility toggle for published posts
	let showGoodFaithAnalysis = $state(false);

	// Good faith analysis visibility toggle for discussion description
	let showDiscussionGoodFaithAnalysis = $state(false);

	// Analysis cache
	interface CachedAnalysis {
		contentHash: string;
		timestamp: number;
		openaiResult?: typeof goodFaithResult;
		claudeResult?: typeof claudeGoodFaithResult;
	}

	// Simple hash function for content
	function hashContent(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash).toString(36);
	}

	// Get cached analysis for current content
	function getCachedAnalysis(content: string, type: 'openai' | 'claude'): any | null {
		if (!discussion) return null;

		const cacheKey = `analysis_cache:${discussion.id}`;
		try {
			const cached = localStorage.getItem(cacheKey);
			if (!cached) return null;

			const cache: CachedAnalysis = JSON.parse(cached);
			const currentHash = hashContent(content.trim());

			// Check if content matches and cache is not too old (24 hours)
			const isExpired = Date.now() - cache.timestamp > 24 * 60 * 60 * 1000;
			if (cache.contentHash === currentHash && !isExpired) {
				return type === 'openai' ? cache.openaiResult : cache.claudeResult;
			}
		} catch (e) {
			console.error('Failed to read analysis cache:', e);
		}
		return null;
	}

	// Store analysis in cache
	function cacheAnalysis(content: string, type: 'openai' | 'claude', result: any): void {
		if (!discussion) return;

		const cacheKey = `analysis_cache:${discussion.id}`;
		const contentHash = hashContent(content.trim());

		try {
			// Get existing cache or create new one
			let cache: CachedAnalysis;
			const existing = localStorage.getItem(cacheKey);
			if (existing) {
				cache = JSON.parse(existing);
				// If content hash changed, reset the cache
				if (cache.contentHash !== contentHash) {
					cache = {
						contentHash,
						timestamp: Date.now(),
						openaiResult: undefined,
						claudeResult: undefined
					};
				}
			} else {
				cache = {
					contentHash,
					timestamp: Date.now(),
					openaiResult: undefined,
					claudeResult: undefined
				};
			}

			// Update the specific analysis result
			if (type === 'openai') {
				cache.openaiResult = result;
			} else {
				cache.claudeResult = result;
			}
			cache.timestamp = Date.now();

			localStorage.setItem(cacheKey, JSON.stringify(cache));
		} catch (e) {
			console.error('Failed to cache analysis:', e);
		}
	}

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
				submitError = 'Good-faith analysis has been disabled for your account. Please contact support.';
				return;
			}

			const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
			const purchasedRemaining = getPurchasedCreditsRemaining(contributor);

			if (monthlyRemaining === 0 && purchasedRemaining === 0) {
				submitError = 'You have no analysis credits remaining. Monthly credits reset at the end of the month, or you can purchase additional credits.';
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
			commentGoodFaithTesting = true;
			try {
				const user = nhost.auth.getUser();
				const accessToken = nhost.auth.getAccessToken();
				console.log('[DEBUG] User authenticated:', !!user, user?.id);
				console.log('[DEBUG] Frontend access token:', !!accessToken, accessToken?.substring(0, 20) + '...');
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
				commentGoodFaithTesting = false;
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
				const HASURA_GRAPHQL_ENDPOINT = 'https://graphql.reasonsmith.com/v1/graphql';
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
		if (['admin', 'slartibartfast'].includes(contributor.role)) return 'Unlimited analysis';

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
			editTitle = getDiscussionTitle();

			// Extract citation data from discussion description if it exists
			const extraction = extractCitationData(getDiscussionDescription());
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
				// Draft already exists, navigate to it
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
				editTitle = draft.title || getDiscussionTitle();
				editDescription = draft.description || getDiscussionDescription();
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
				editTitle.trim() === getDiscussionTitle() &&
				editDescription.trim() === getDiscussionDescription()
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

			if ((updated as any).error) throw (updated as any).error;
			const versionId = draftVersion.id;

			// Update the discussion status and current version
			const upd = await nhost.graphql.request(UPDATE_DISCUSSION_CURRENT_VERSION, {
				discussionId,
				versionId
			});
			if ((upd as any).error) throw (upd as any).error;

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
						publish_date: legacyCitation.publishDate || null,
						accessed_date: legacyCitation.accessed || null,
						page_number: legacyCitation.pageNumber || null,
						point_supported: legacyCitation.pointSupported,
						relevant_quote: legacyCitation.relevantQuote
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

		if (!confirmDeletion('discussion', getDiscussionTitle())) return;

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
		const userPosts = discussion.posts.filter((post) => post.contributor.id === user.id);
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
				discussion.posts = discussion.posts.map((p) =>
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
				discussion.posts = discussion.posts.map((p) =>
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

	// Ensure all citations and sources have IDs
	function ensureIdsForCitationData(metadata: StyleMetadata): StyleMetadata {
		const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 9);

		return {
			...metadata,
			citations:
				metadata.citations?.map(
					(citation) =>
						({
							...citation,
							id: (citation as any).id || generateId()
						}) as Citation
				) || []
		};
	}

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
		const cachedResult = getCachedAnalysis(editDescription, 'openai');
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
			cacheAnalysis(editDescription, 'openai', goodFaithResult);

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
		const cachedResult = getCachedAnalysis(editDescription, 'claude');
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
			cacheAnalysis(editDescription, 'claude', claudeGoodFaithResult);

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

	// Extract citation data from post content (temporary solution until database migration)
	function extractCitationData(content: string): {
		cleanContent: string;
		citationData?: { writing_style: WritingStyle; style_metadata: StyleMetadata };
	} {
		const citationMatch = content.match(/<!-- CITATION_DATA:(.*?)-->/s);
		if (citationMatch) {
			try {
				const parsed = JSON.parse(citationMatch[1]);
				const cleanContent = content.replace(/\n\n?<!-- CITATION_DATA:.*?-->/s, '');

				// Handle both comment format and discussion format
				if (parsed.writing_style && parsed.style_metadata) {
					// Discussion format - ensure IDs exist
					return {
						cleanContent,
						citationData: {
							writing_style: parsed.writing_style,
							style_metadata: ensureIdsForCitationData(parsed.style_metadata)
						}
					};
				} else if (parsed.style && parsed.metadata) {
					// Comment format - convert to discussion format and ensure IDs exist
					return {
						cleanContent,
						citationData: {
							writing_style: parsed.style,
							style_metadata: ensureIdsForCitationData(parsed.metadata)
						}
					};
				}

				// Fallback if format doesn't match either expected structure
				return { cleanContent };
			} catch (e) {
				// If parsing fails, return original content
				return { cleanContent: content };
			}
		}
		return { cleanContent: content };
	}

	// Extract reply reference from post content
	function extractReplyRef(content: string): { cleanContent: string; replyRef?: any } {
		const match = content.match(/<!-- REPLY_TO:(.*?)-->/s);
		if (match) {
			try {
				const parsed = JSON.parse(match[1]);
				const cleanContent = content.replace(/\n\n?<!-- REPLY_TO:.*?-->/s, '');
				return { cleanContent, replyRef: parsed };
			} catch (e) {
				return { cleanContent: content };
			}
		}
		return { cleanContent: content };
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
			<h1 class="discussion-title">{getDiscussionTitle()}</h1>
			{#if getDiscussionTags().length > 0}
				<div class="discussion-tags">
					{#each getDiscussionTags() as tag}
						<span class="tag">{tag}</span>
					{/each}
				</div>
			{/if}
			<p class="discussion-meta">
				<span>
					Started by {#if discussion.is_anonymous}
						<span class="anonymous-author">Anonymous</span>
					{:else}
						<a href={`/u/${discussion.contributor.handle || discussion.contributor.id}`}
							>{displayName(discussion.contributor.display_name)}</a
						>
					{/if} on {new Date(discussion.created_at).toLocaleDateString()}
				</span>
				{#if user && user.id === discussion.contributor.id}
					<span class="discussion-actions">
						<button class="edit-btn" onclick={startEdit} title="Edit discussion">
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
								<path d="m18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
							</svg>
						</button>
						{#if discussion.is_anonymous}
							<button
								class="reveal-identity-btn"
								onclick={handleUnanonymizeDiscussion}
								title="Reveal your identity"
							>
								Reveal Identity
							</button>
						{:else}
							<button
								class="delete-discussion-btn"
								onclick={discussionCanDelete ? handleDeleteDiscussion : handleAnonymizeDiscussion}
								title={discussionCanDelete
									? 'Delete discussion'
									: 'Make anonymous - others have replied'}
							>
								{#if discussionCanDelete}
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="#ef4444"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="3,6 5,6 21,6" />
										<path
											d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"
										/>
										<line x1="10" y1="11" x2="10" y2="17" />
										<line x1="14" y1="11" x2="14" y2="17" />
									</svg>
								{:else}
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M2 3s3-1 10-1 10 1 10 1v18s-3-1-10-1-10 1-10 1V3z" />
										<path d="M8 12h4" />
										<path d="M8 16h4" />
										<path d="M12 8v8" />
									</svg>
								{/if}
							</button>
						{/if}
					</span>
				{/if}
			</p>
			{#if editing}
				<form
					class="edit-form"
					onsubmit={(e) => {
						e.preventDefault();
						publishDraftChanges();
					}}
				>
					<label>
						Title
						<input type="text" bind:value={editTitle} oninput={onEditTitleInput} />
					</label>
					<label>
						Description
						<textarea
							id="edit-description"
							rows="30"
							bind:value={editDescription}
							oninput={onEditDescriptionInput}
						></textarea>
					</label>

					<!-- Analysis limit display -->
					{#if contributor}
						<div class="analysis-limit-info">
							{getAnalysisLimitText()}
						</div>
					{/if}

					<!-- Good Faith Testing and Citation Buttons -->
					<div style="display: flex; gap: 0.5rem; align-items: flex-start; margin: 0.5rem 0;">
						<button
							type="button"
							class="good-faith-test-btn openai"
							onclick={testGoodFaith}
							disabled={goodFaithTesting || !editDescription.trim() || !editHeuristicPassed}
						>
							{#if goodFaithTesting}
								<AnimatedLogo size="16px" isAnimating={true} />
								OpenAI...
							{:else}
								🤔 OpenAI Test
							{/if}
						</button>
						<button
							type="button"
							class="good-faith-test-btn claude"
							onclick={testGoodFaithClaude}
							disabled={claudeGoodFaithTesting || !editDescription.trim() || !editHeuristicPassed}
						>
							{#if claudeGoodFaithTesting}
								<AnimatedLogo size="16px" isAnimating={true} />
								Claude...
							{:else}
								🧠 Claude Test
							{/if}
						</button>
						<button type="button" class="insert-citation-btn" onclick={openEditCitationPicker}>
							📎 Insert Citation Reference
						</button>
					</div>

					<!-- Good Faith Test Results -->
					{#if goodFaithResult}
						<div class="analysis-panel">
							<div class="analysis-summary">
								<div class="analysis-badge {goodFaithResult.good_faith_label}">
									<span class="analysis-score"
										>{(goodFaithResult.good_faith_score * 100).toFixed(0)}%</span
									>
									<span class="analysis-label">{goodFaithResult.good_faith_label}</span>
								</div>
								<div class="analysis-meta">
									<span class="analysis-provider">OpenAI Analysis</span>
									{#if goodFaithResult.fromCache}
										<span class="cache-indicator" title="Loaded from cache">💾</span>
									{/if}
								</div>
							</div>

							{#if goodFaithResult.claims && goodFaithResult.claims.length > 0}
								<div class="analysis-content">
									{#each goodFaithResult.claims as claim}
										<div class="claim-analysis">
											<div class="claim-statement">{claim.claim}</div>
											{#if claim.arguments}
												{#each claim.arguments as arg}
													<div class="argument-card">
														<div class="argument-content">
															<div class="argument-text">{arg.text}</div>
															<div class="argument-metrics">
																<span
																	class="argument-score"
																	class:strong={arg.score >= 7}
																	class:moderate={arg.score >= 4 && arg.score < 7}
																	class:weak={arg.score < 4}
																>
																	{arg.score}/10
																</span>
															</div>
														</div>

														{#if arg.suggestions && arg.suggestions.length > 0}
															<div class="improvements-section">
																<div class="improvements-label">💡 Suggested improvements</div>
																<ul class="improvements-list">
																	{#each arg.suggestions as suggestion}
																		<li>{suggestion}</li>
																	{/each}
																</ul>
															</div>
														{/if}

														{#if (arg.fallacies && arg.fallacies.length > 0) || (arg.manipulativeLanguage && arg.manipulativeLanguage.length > 0)}
															<div class="issues-section">
																{#if arg.fallacies && arg.fallacies.length > 0}
																	<div class="issue-item">
																		<span class="issue-label">⚠️ Logical issues:</span>
																		<span class="issue-text">{arg.fallacies.join(', ')}</span>
																	</div>
																{/if}
																{#if arg.manipulativeLanguage && arg.manipulativeLanguage.length > 0}
																	<div class="issue-item">
																		<span class="issue-label">🚩 Language concerns:</span>
																		<span class="issue-text"
																			>{arg.manipulativeLanguage.join(', ')}</span
																		>
																	</div>
																{/if}
															</div>
														{/if}
													</div>
												{/each}
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							{#if goodFaithResult.rationale}
								<div class="analysis-summary-text">
									{goodFaithResult.rationale}
								</div>
							{/if}

							<button
								type="button"
								class="analysis-close-btn"
								onclick={() => (goodFaithResult = null)}
								aria-label="Close analysis"
							>
								✕
							</button>
						</div>
					{/if}

					{#if goodFaithError}
						<div class="good-faith-error">
							<strong>OpenAI Error:</strong>
							{goodFaithError}
							<button type="button" class="close-result-btn" onclick={() => (goodFaithError = null)}
								>✕</button
							>
						</div>
					{/if}

					<!-- Claude Good Faith Test Results -->
					{#if claudeGoodFaithResult}
						<div class="good-faith-result claude-result">
							<div class="good-faith-header">
								<h4>
									Claude Analysis
									{#if claudeGoodFaithResult.fromCache}
										<span class="cache-indicator" title="Loaded from cache">💾</span>
									{/if}
								</h4>
								<div class="good-faith-score">
									<span class="score-value"
										>{(claudeGoodFaithResult.good_faith_score * 100).toFixed(0)}%</span
									>
									<span class="score-label {claudeGoodFaithResult.good_faith_label}"
										>{claudeGoodFaithResult.good_faith_label}</span
									>
								</div>
							</div>

							{#if claudeGoodFaithResult.claims && claudeGoodFaithResult.claims.length > 0}
								<div class="claude-claims">
									<strong>Claims Analysis:</strong>
									{#each claudeGoodFaithResult.claims as claim}
										<div class="claim-item">
											<div class="claim-text"><strong>Claim:</strong> {claim.claim}</div>
											{#if claim.supportingArguments}
												{#each claim.supportingArguments as arg}
													<div class="argument-item">
														<div class="argument-text">{arg.argument}</div>
														<div class="argument-details">
															<span class="argument-score">Score: {arg.score}/10</span>
															{#if arg.fallacies && arg.fallacies.length > 0}
																<span class="fallacies">Fallacies: {arg.fallacies.join(', ')}</span>
															{/if}
														</div>
														{#if arg.improvements}
															<div class="improvements">Improvement: {arg.improvements}</div>
														{/if}
													</div>
												{/each}
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							{#if claudeGoodFaithResult.cultishPhrases && claudeGoodFaithResult.cultishPhrases.length > 0}
								<div class="cultish-phrases">
									<strong>Manipulative Language:</strong>
									{claudeGoodFaithResult.cultishPhrases.join(', ')}
								</div>
							{/if}

							<div class="good-faith-rationale">
								<strong>Analysis:</strong>
								{claudeGoodFaithResult.rationale}
							</div>
							<button
								type="button"
								class="close-result-btn"
								onclick={() => (claudeGoodFaithResult = null)}>✕</button
							>
						</div>
					{/if}

					{#if claudeGoodFaithError}
						<div class="good-faith-error">
							<strong>Claude Error:</strong>
							{claudeGoodFaithError}
							<button
								type="button"
								class="close-result-btn"
								onclick={() => (claudeGoodFaithError = null)}>✕</button
							>
						</div>
					{/if}

					<!-- Citation/Source Management -->
					<div class="citation-section">
						<div class="citation-header">
							<h4>References</h4>
							<div class="citation-buttons">
								<button
									type="button"
									class="btn-secondary"
									onclick={() => {
										showEditCitationForm = true;
									}}
								>
									Add Citation
								</button>
							</div>
						</div>

						<!-- Add Citation Form -->
						{#if showEditCitationForm && !editingEditCitation}
							<CitationForm
								onAdd={addEditCitation}
								onCancel={() => (showEditCitationForm = false)}
							/>
						{/if}

						<!-- Edit Citation Form -->
						{#if showEditCitationForm && editingEditCitation}
							<CitationForm
								editingItem={editingEditCitation}
								onAdd={updateEditCitation}
								onCancel={cancelEditCitation}
							/>
						{/if}

						<!-- Display existing citations -->
						{#if editStyleMetadata.citations?.length}
							<div class="citations-list">
								<h5>Citations:</h5>
								{#each editStyleMetadata.citations as citation}
									<div class="citation-item">
										<div class="citation-content">
											<div class="citation-title">{citation.title}</div>
											<div class="citation-url">
												<a href={citation.url} target="_blank">{citation.url}</a>
											</div>
											{#if citation.author}<div class="source-author">
													Author: {citation.author}
												</div>{/if}
											{#if citation.publishDate}<div class="source-date">
													Published: {citation.publishDate}
												</div>{/if}
											{#if citation.accessed}<div class="source-accessed">
													Accessed: {citation.accessed}
												</div>{/if}
											<details class="citation-details">
												<summary>
													<span class="summary-arrow">▶</span>
													<span class="summary-text">Context</span>
												</summary>
												<div class="citation-context">
													<div class="citation-point">
														<strong>Supports:</strong>
														{citation.pointSupported}
													</div>
													<div class="citation-quote">
														<strong>Quote:</strong> "{citation.relevantQuote}"
													</div>
												</div>
											</details>
										</div>
										<div class="citation-actions">
											<button
												type="button"
												class="insert-ref-btn"
												onclick={() => insertEditCitationReference(citation.id)}
												title="Insert source reference at cursor"
											>
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="1.5"
													stroke-linecap="round"
													stroke-linejoin="round"
												>
													<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
													<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
												</svg>
											</button>
											<button
												type="button"
												class="edit-btn"
												onclick={() => startEditCitation(citation.id)}
												title="Edit citation"
											>
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="1.5"
													stroke-linecap="round"
													stroke-linejoin="round"
												>
													<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
													<path d="m18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
												</svg>
											</button>
											<button
												type="button"
												class="remove-btn"
												onclick={() => removeEditCitation(citation.id)}
												title="Remove citation"
											>
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="1.5"
													stroke-linecap="round"
													stroke-linejoin="round"
												>
													<polyline points="3,6 5,6 21,6" />
													<path
														d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"
													/>
													<line x1="10" y1="11" x2="10" y2="17" />
													<line x1="14" y1="11" x2="14" y2="17" />
												</svg>
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Citation Picker Modal -->
					{#if showEditCitationPicker}
						{@const allEditCitations = editStyleMetadata.citations || []}
						<div class="citation-picker-overlay">
							<div class="citation-picker-modal">
								<div class="citation-picker-header">
									<h4>Insert Citation Reference</h4>
									<button
										type="button"
										class="close-btn"
										onclick={() => (showEditCitationPicker = false)}>✕</button
									>
								</div>
								<div class="citation-picker-content">
									<p>Click on a reference below to insert it at your cursor position:</p>
									<div class="picker-references-list">
										{#each allEditCitations as item, index}
											<button
												type="button"
												class="picker-reference-item"
												onclick={() => {
													insertEditCitationReference(item.id);
													showEditCitationPicker = false;
												}}
											>
												<div class="picker-citation-number">[{index + 1}]</div>
												<div class="picker-citation-preview">
													{@html formatChicagoCitation(item)}
												</div>
											</button>
										{/each}
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- Heuristic Quality Assessment -->
					{#if editHeuristicScore < 50}
						{@const assessment = assessContentQuality(editDescription, editTitle)}
						<div class="heuristic-quality-indicator">
							<h5>Content Quality: {editHeuristicScore}% (50% required)</h5>
							<div class="quality-progress">
								<div class="quality-bar" style="width: {editHeuristicScore}%"></div>
							</div>
							{#if assessment.issues.length > 0}
								<ul class="quality-issues">
									{#each assessment.issues as issue}
										<li>{issue}</li>
									{/each}
								</ul>
							{/if}
							<p class="quality-note">
								Good faith analysis and publishing are disabled until 50% quality threshold is met.
							</p>
						</div>
					{:else}
						<div class="heuristic-quality-indicator passed">
							<h5>✅ Content Quality: {editHeuristicScore}% - Ready for analysis and publishing</h5>
							<div class="quality-progress">
								<div class="quality-bar passed" style="width: {editHeuristicScore}%"></div>
							</div>
						</div>
					{/if}

					<div class="edit-autosave-indicator">
						<div class="autosave-status">
							{#if editLastSavedAt}
								Auto-saved {new Date(editLastSavedAt).toLocaleTimeString()}
							{/if}
						</div>
						{#if contributor && editing}
							<div class="credit-status-inline">
								Credits: {getAnalysisLimitText()}
							</div>
						{/if}
					</div>

					{#if editError}<p class="error-message">{editError}</p>{/if}
					<div style="display:flex; gap:0.5rem;">
						<button
							class="btn-primary"
							type="submit"
							disabled={publishLoading || !hasUnsavedChanges || !editHeuristicPassed}
							>{publishLoading ? 'Publishing…' : 'Publish Changes'}</button
						>
						<button type="button" class="btn-secondary" onclick={cancelEdit}>Cancel</button>
						{#if draftLastSavedAt}
							<small class="draft-status"
								>Draft saved {new Date(draftLastSavedAt).toLocaleTimeString()}</small
							>
						{/if}
					</div>
				</form>
			{/if}
			{#if getDiscussionDescription()}
				{@const extraction = extractCitationData(getDiscussionDescription())}
				{@const jsonCitations = extraction.citationData?.style_metadata?.citations || []}
				{@const tableCitations = discussion?.current_version?.[0]?.citationsFromTable || []}
				{@const allCitations = [...tableCitations, ...jsonCitations]}
				{@const processedContent = processCitationReferences(extraction.cleanContent, allCitations)}
				<div class="discussion-description">{@html processedContent.replace(/\n/g, '<br>')}</div>

				<!-- Display unified reference list if citations exist -->
				{#if allCitations.length > 0}
					<div class="discussion-metadata">
						<div class="references-section">
							<h5>References</h5>
							<div class="references-list">
								{#each allCitations as item, index}
									<div class="reference-item" id="citation-{index + 1}">
										<details class="citation-details">
											<summary>
												<div class="chicago-citation">
													<span class="citation-number">{index + 1}.</span>
													{@html formatChicagoCitation(item)}
												</div>
												<span class="summary-arrow">▶</span>
												<span class="summary-text">Context</span>
											</summary>
											<div class="citation-context">
												<div class="citation-point">
													<strong>Supports:</strong>
													{item.pointSupported}
												</div>
												<div class="citation-quote">
													<strong>Quote:</strong> "{item.relevantQuote}"
												</div>
											</div>
										</details>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<!-- Good Faith Analysis Display for Discussion Description -->
				{#if getDiscussionGoodFaithScore() != null && typeof getDiscussionGoodFaithScore() === 'number' && getDiscussionGoodFaithLabel() && !editing}
					<div class="good-faith-analysis-section">
						<button
							type="button"
							class="good-faith-toggle"
							onclick={() => (showDiscussionGoodFaithAnalysis = !showDiscussionGoodFaithAnalysis)}
							aria-expanded={showDiscussionGoodFaithAnalysis}
						>
							<span class="toggle-icon">{showDiscussionGoodFaithAnalysis ? '▼' : '▶'}</span>
							Good Faith Analysis
							<span class="good-faith-score-inline">
								<span class="score-value">{(getDiscussionGoodFaithScore() * 100).toFixed(0)}%</span>
								<span class="score-label {getDiscussionGoodFaithLabel()}"
									>{getDiscussionGoodFaithLabel()}</span
								>
							</span>
						</button>

						{#if showDiscussionGoodFaithAnalysis}
							<div class="good-faith-details">
								<div class="score-breakdown">
									{#if getDiscussionGoodFaithLastEvaluated()}
										<div class="evaluation-date">
											Evaluated: {new Date(getDiscussionGoodFaithLastEvaluated()).toLocaleString()}
										</div>
									{/if}
								</div>

								<!-- Full Analysis Breakdown -->
								{#if getDiscussionGoodFaithAnalysis()}
									{@const analysis = getDiscussionGoodFaithAnalysis()}
									<!-- Debug: {console.log('Analysis data:', analysis)} -->

									{#if analysis.claims && analysis.claims.length > 0}
										<div class="analysis-section">
											<strong>Claims Analysis:</strong>
											{#each analysis.claims as claim}
												<div class="claim-item">
													<div class="claim-text"><strong>Claim:</strong> {claim.claim}</div>
													{#if claim.supportingArguments || claim.arguments}
														{#each (claim.supportingArguments || claim.arguments) as arg}
															<div class="argument-item">
																{#if arg.argument}
																	<div class="argument-text"><strong>Analysis:</strong> {arg.argument}</div>
																{/if}
																<span class="argument-score">Score: {arg.score}/10</span>
																{#if arg.fallacies && arg.fallacies.length > 0}
																	<span class="fallacies"
																		>Fallacies: {arg.fallacies.join(', ')}</span
																	>
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

									{#if analysis.cultishPhrases && analysis.cultishPhrases.length > 0}
										<div class="analysis-section">
											<strong>Manipulative Language:</strong>
											{analysis.cultishPhrases.join(', ')}
										</div>
									{/if}

									{#if analysis.fallacyOverload}
										<div class="analysis-section fallacy-warning">
											<strong>⚠️ Fallacy Overload:</strong> This content contains a high proportion of
											fallacious arguments.
										</div>
									{/if}

									{#if analysis.rationale}
										<div class="analysis-section">
											<strong>Analysis Summary:</strong>
											{analysis.rationale}
										</div>
									{/if}

									{#if analysis.provider}
										<div class="analysis-meta">
											<small
												>Analyzed by: {analysis.provider.charAt(0).toUpperCase() +
													analysis.provider.slice(1)}</small
											>
										</div>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</header>

		{#if historicalVersion}
			<div class="historical-version-banner">
				<div class="historical-header">
					<strong>📚 Viewing Archived Version #{historicalVersion.version_number}</strong>
					<a href={`/discussions/${discussion.id}`} class="return-current-btn"
						>↩️ Return to Current Version</a
					>
				</div>
				<div class="historical-content">
					<h3 class="historical-title">{historicalVersion.title}</h3>
					<div class="historical-description">
						{@html historicalVersion.description.replace(/\n/g, '<br>')}
					</div>
				</div>
			</div>
		{:else if versionLoading}
			<div class="historical-version-banner">Loading historical version…</div>
		{:else if versionError}
			<div class="historical-version-banner error-message">{versionError}</div>
		{/if}

		<div class="posts-list">
			{#each discussion.posts as post}
				<div
					id={`post-${post.id}`}
					class="post-card"
					class:journalistic-post={post.writing_style === 'journalistic'}
					class:academic-post={post.writing_style === 'academic'}
				>
					<div class="post-meta">
						<strong
							>{#if post.is_anonymous}
								<span class="anonymous-author">Anonymous</span>
							{:else}
								<a href={`/u/${post.contributor.handle || post.contributor.id}`}
									>{displayName(post.contributor.display_name)}</a
								>
							{/if}</strong
						>
						<span>&middot;</span>
						<time>{new Date(post.created_at).toLocaleString()}</time>
						<span
							class="writing-style-badge"
							class:journalistic={post.writing_style === 'journalistic'}
							class:academic={post.writing_style === 'academic'}
						>
							{getStyleConfig(post.writing_style || 'quick_point').label}
						</span>
						{#if post.context_version_id}
							<a class="post-version-link" href={`?versionRef=${post.context_version_id}`}
								>📖 view original context</a
							>
						{/if}
						<span class="spacer"></span>
						<button
							type="button"
							class="reply-post-btn"
							onclick={() => startReply(post)}
							title="Reply to this comment">↳</button
						>
						{#if user && post.contributor.id === user.id}
							<button
								type="button"
								class="edit-post-btn"
								onclick={() => startEditPost(post)}
								title="Edit post">✎</button
							>
							{#if post.is_anonymous}
								<button
									type="button"
									class="reveal-identity-btn"
									onclick={() => handleUnanonymizePost(post)}
									title="Reveal your identity"
								>
									Reveal Identity
								</button>
							{:else}
								<button
									type="button"
									class="delete-post-btn"
									onclick={() =>
										postDeletionStatus[post.id]?.canDelete !== false
											? handleDeletePost(post)
											: handleAnonymizePost(post)}
									title={postDeletionStatus[post.id]?.canDelete !== false
										? 'Delete post'
										: 'Make anonymous - ' +
											(postDeletionStatus[post.id]?.reason || 'cannot delete')}
								>
									{postDeletionStatus[post.id]?.canDelete !== false ? 'Delete' : '👻'}
								</button>
							{/if}
						{/if}
					</div>
					<!-- Extract and display post content with citations -->
					{#snippet postWithCitations()}
						{@const { cleanContent: withoutReply, replyRef } = extractReplyRef(post.content)}
						{@const { cleanContent, citationData } = extractCitationData(withoutReply)}
						{@const allPostCitations = citationData?.style_metadata?.citations || []}
						{@const processedPostContent = processCitationReferences(
							cleanContent,
							allPostCitations
						)}
						<div class="post-content">
							{#if replyRef}
								<div class="reply-context">
									Replying to <a href={`#post-${replyRef.post_id}`}>this comment</a>
									{#if replyRef.snapshot?.content}
										<details class="snapshot-details">
											<summary>View snapshot at time of reply</summary>
											<div class="snapshot-content">
												{@html replyRef.snapshot.content.replace(/\n/g, '<br>')}
											</div>
										</details>
									{/if}
								</div>
							{/if}
							{@html processedPostContent}
						</div>

						<!-- Display citations if they exist (either from database or extracted from content) -->
						{@const displayMetadata = ensureIdsForCitationData(
							post.style_metadata || citationData?.style_metadata || { citations: [] }
						)}
						{@const allPostReferences = displayMetadata.citations || []}
						{#if displayMetadata && allPostReferences.length > 0}
							<div class="post-metadata">
								<div class="references-section">
									<h5>References</h5>
									<div class="references-list">
										{#each allPostReferences as item, index}
											<div class="reference-item" id="citation-{index + 1}">
												<div class="chicago-citation">
													<span class="citation-number">{index + 1}.</span>
													{@html formatChicagoCitation(item)}
												</div>
												<details class="citation-details">
													<summary>
														<span class="summary-arrow">▶</span>
														<span class="summary-text">Context</span>
													</summary>
													<div class="citation-context">
														<div class="citation-point">
															<strong>Supports:</strong>
															{item.pointSupported}
														</div>
														<div class="citation-quote">
															<strong>Quote:</strong> "{item.relevantQuote}"
														</div>
													</div>
												</details>
											</div>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					{/snippet}
					{#if editingPostId === post.id}
						<div class="post-edit-block">
							<textarea id="post-edit-textarea" rows="10" bind:value={editingPostContent}></textarea>
							{#if editPostError}<div class="error-message" style="margin-top:0.25rem;">
									{editPostError}
								</div>{/if}
							<div class="post-edit-actions">
								<button
									type="button"
									class="btn-secondary"
									onclick={cancelEditPost}
									disabled={editPostSaving}>Cancel</button
								>
								<button
									type="button"
									class="btn-primary"
									onclick={() => savePostEdit(post)}
									disabled={editPostSaving || !editingPostContent.trim()}
									>{editPostSaving ? 'Saving…' : 'Save Changes'}</button
								>
							</div>
						</div>
					{:else}
						{@render postWithCitations()}
					{/if}

					<!-- Good Faith Analysis Display -->
					{#if post?.good_faith_score != null && typeof post.good_faith_score === 'number' && post.good_faith_label}
						<div class="good-faith-analysis-section">
							<button
								type="button"
								class="good-faith-toggle"
								onclick={() => (showGoodFaithAnalysis = !showGoodFaithAnalysis)}
								aria-expanded={showGoodFaithAnalysis}
							>
								<span class="toggle-icon">{showGoodFaithAnalysis ? '▼' : '▶'}</span>
								Good Faith Analysis
								<span class="good-faith-score-inline">
									<span class="score-value">{(post.good_faith_score * 100).toFixed(0)}%</span>
									<span class="score-label {post.good_faith_label}">{post.good_faith_label}</span>
								</span>
							</button>

							{#if showGoodFaithAnalysis}
								<div class="good-faith-details">
									<div class="score-breakdown">
										<div class="score-row">
											<span class="score-label-text">Score:</span>
											<span class="score-value-large"
												>{(post.good_faith_score * 100).toFixed(0)}%</span
											>
											<span class="score-label-badge {post.good_faith_label}"
												>{post.good_faith_label}</span
											>
										</div>
										{#if post.good_faith_last_evaluated}
											<div class="evaluation-date">
												Evaluated: {new Date(post.good_faith_last_evaluated).toLocaleString()}
											</div>
										{/if}
									</div>

									<!-- Full Analysis Breakdown for Post -->
									{#if post.good_faith_analysis && typeof post.good_faith_analysis === 'object'}
										{@const analysis = post.good_faith_analysis}

										<!-- Claims Analysis -->
										{#if analysis.claims_analysis?.claims && Array.isArray(analysis.claims_analysis.claims)}
											<div class="analysis-section">
												<h4>Claims Analysis</h4>
												<div class="claims-list">
													{#each analysis.claims_analysis.claims as claim, index}
														<div class="claim-item">
															<div class="claim-header">
																<strong>Claim {index + 1}:</strong>
																{claim.claim}
															</div>
															{#if claim.supporting_arguments && Array.isArray(claim.supporting_arguments)}
																<div class="supporting-args">
																	<h5>Supporting Arguments:</h5>
																	{#each claim.supporting_arguments as arg}
																		<div class="argument-item">
																			<div class="argument-text">{arg.argument}</div>
																			<div class="argument-meta">
																				<span class="score">Score: {arg.good_faith_score}/10</span>
																				{#if arg.fallacies && Array.isArray(arg.fallacies) && arg.fallacies.length > 0}
																					<span class="fallacies"
																						>Fallacies: {arg.fallacies.join(', ')}</span
																					>
																				{/if}
																			</div>
																		</div>
																	{/each}
																</div>
															{/if}
														</div>
													{/each}
												</div>
											</div>
										{/if}

										<!-- Manipulative Language -->
										{#if analysis.manipulative_language && Array.isArray(analysis.manipulative_language) && analysis.manipulative_language.length > 0}
											<div class="analysis-section warning">
												<h4>Manipulative Language Detected</h4>
												<div class="manipulative-phrases">
													{#each analysis.manipulative_language as phrase}
														<span class="phrase-badge">{phrase}</span>
													{/each}
												</div>
											</div>
										{/if}

										<!-- Fallacy Overload Warning -->
										{#if analysis.fallacy_overload}
											<div class="analysis-section critical">
												<h4>⚠️ Fallacy Overload Detected</h4>
												<p>
													This content contains an unusually high concentration of logical
													fallacies, which may indicate bad-faith argumentation.
												</p>
											</div>
										{/if}

										<!-- Analysis Rationale -->
										{#if analysis.rationale || analysis.summary}
											<div class="analysis-section">
												<h4>Analysis Summary</h4>
												<p class="rationale-text">{analysis.rationale || analysis.summary}</p>
											</div>
										{/if}

										<!-- Provider Attribution -->
										{#if analysis.provider}
											<div class="analysis-attribution">
												<small
													>Analysis by: {analysis.provider === 'openai'
														? 'OpenAI'
														: 'Claude'}</small
												>
											</div>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<p>No posts in this discussion yet. Be the first to contribute!</p>
			{/each}
		</div>

		<section class="add-comment">
			{#if !user}
				<p class="signin-hint">Please sign in to participate.</p>
			{:else if !commentFormExpanded}
				<button
					class="leave-comment-btn"
					onclick={() => {
						commentFormExpanded = true;
					}}
				>
					💬 Leave a Comment
				</button>
			{:else}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						publishDraft();
					}}
					class="comment-form"
				>

					<!-- Post Type Selection -->
					<div class="post-type-selection">
						{#if postTypeExpanded}
							<!-- <div class="post-type-label">Choose Post Type:</div> -->
							<div class="post-type-buttons" transition:slide={{ duration: 300 }}>
								{#each ['response', 'counter_argument', 'supporting_evidence', 'question'] as type}
									{@const config = getPostTypeConfig(type as any)}
									<button
										type="button"
										class="post-type-btn"
										class:selected={commentPostType === type}
										onclick={() => {
											commentPostType = type as typeof commentPostType;
											postTypeExpanded = false;
										}}
									>
										<span class="post-type-icon">{config.icon}</span>
										<span class="post-type-text">
											<span class="post-type-title">{config.label}</span>
											<span class="post-type-desc">{config.description}</span>
										</span>
									</button>
								{/each}
							</div>
						{:else}
							{@const config = getPostTypeConfig(commentPostType as any)}
							<div class="post-type-selected">
								<!-- <span class="post-type-label">Post Type:</span> -->
								<button
									type="button"
									class="post-type-btn selected compact"
									onclick={() => {
										postTypeExpanded = true;
									}}
								>
									<span class="post-type-icon">{config.icon}</span>
									<span class="post-type-text">
										<span class="post-type-title">{config.label}</span>
									</span>
								</button>

								<!-- Advanced Features Toggle - Next to Post Type button -->
								<button
									type="button"
									class="toggle-advanced-btn compact"
									onclick={() => {
										showAdvancedFeatures = !showAdvancedFeatures;
									}}
								>
									{#if showAdvancedFeatures}
										▲ Hide Citations & Analysis
									{:else}
										▼ Show Citations & Analysis
									{/if}
								</button>
							</div>
						{/if}
					</div>

					<!-- Citations & Analysis Section - Appears above textarea when activated -->
					{#if showAdvancedFeatures && !postTypeExpanded}
						<div class="comment-writing-info">
							<div class="word-count">
								<span class="word-count-label">Words: {commentWordCount}</span>
								<span class="style-indicator">({getStyleConfig(commentSelectedStyle).label})</span>
							</div>

							<div class="citation-reminder" class:active={showCommentCitationReminder}>
								<div class="reminder-icon">📚</div>
								<div class="reminder-text">
									<strong
										>{showCommentCitationReminder ? 'Add citations' : 'Cite your sources'}</strong
									>
									<span
										>{showCommentCitationReminder
											? 'Support your claims with references for better credibility.'
											: 'Adding sources now makes it easier to reference them later.'}</span
									>
								</div>
								<button
									type="button"
									class="btn-add-citation-inline"
									onclick={() => (showCommentCitationForm = true)}
								>
									Add Citation
								</button>
							</div>
						</div>
					{/if}

					<textarea
						bind:value={newComment}
						oninput={(e) => {
							onCommentInput(e);
							validateCommentContent();
						}}
						onfocus={loadExistingDraft}
						rows="25"
						placeholder="Add your comment... (Style will be automatically determined by length)"
						aria-label="New comment"
					></textarea>

					{#if showAdvancedFeatures}
						<!-- Insert Citation Reference Button -->
						<button type="button" class="insert-citation-btn" onclick={openCommentCitationPicker}>
							📎 Insert Citation Reference
						</button>

						<!-- Citation/Source Management for Comments -->
						<div class="citation-section">
							<div class="citation-header">
								<h4>References</h4>
							</div>

							<!-- Add Comment Citation Form -->
							{#if showCommentCitationForm && !editingCommentCitation}
								<CitationForm
									onAdd={addCommentCitation}
									onCancel={() => (showCommentCitationForm = false)}
								/>
							{/if}

							<!-- Edit Comment Citation Form -->
							{#if showCommentCitationEditForm && editingCommentCitation}
								<CitationForm
									editingItem={editingCommentCitation}
									onAdd={updateCommentCitation}
									onCancel={cancelCommentCitationEdit}
								/>
							{/if}

							<!-- Display existing citations -->
							{#if commentStyleMetadata.citations?.length}
								<div class="citations-list">
									<h5>Citations:</h5>
									{#each commentStyleMetadata.citations as Citation[] as citation}
										<div class="citation-item">
											<div class="citation-content">
												<div class="citation-title">{citation.title}</div>
												<div class="citation-url">
													<a href={citation.url} target="_blank">{citation.url}</a>
												</div>
												{#if citation.author}<div class="citation-author">
														Author: {citation.author}
													</div>{/if}
												{#if citation.publishDate}<div class="citation-date">
														Published: {citation.publishDate}
													</div>{/if}
												{#if citation.publisher}<div class="citation-publisher">
														Publisher: {citation.publisher}
													</div>{/if}
												{#if citation.pageNumber}<div class="citation-page">
														Page: {citation.pageNumber}
													</div>{/if}
												<details class="citation-details">
													<summary>
														<span class="summary-arrow">▶</span>
														<span class="summary-text">Context</span>
													</summary>
													<div class="citation-context">
														<div class="citation-point">
															<strong>Supports:</strong>
															{citation.pointSupported}
														</div>
														<div class="citation-quote">
															<strong>Quote:</strong> "{citation.relevantQuote}"
														</div>
													</div>
												</details>
											</div>
											<div class="citation-actions">
												<button
													type="button"
													class="insert-ref-btn"
													onclick={() => insertCommentCitationReference(citation.id)}
													title="Insert citation reference at cursor">Insert Ref</button
												>
												<button
													type="button"
													class="edit-btn"
													onclick={() => startEditCommentCitation(citation.id)}
													title="Edit citation">Edit</button
												>
												<button
													type="button"
													class="remove-btn"
													onclick={() => removeCommentCitation(citation.id)}>Remove</button
												>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Citation Picker Modal for Comments -->
						{#if showCommentCitationPicker}
							{@const allCommentCitations = commentStyleMetadata.citations || []}
							<div class="citation-picker-overlay">
								<div class="citation-picker-modal">
									<div class="citation-picker-header">
										<h4>Insert Citation Reference</h4>
										<button
											type="button"
											class="close-btn"
											onclick={() => (showCommentCitationPicker = false)}>✕</button
										>
									</div>
									<div class="citation-picker-content">
										<p>Click on a reference below to insert it at your cursor position:</p>
										<div class="picker-references-list">
											{#each allCommentCitations as item, index}
												<button
													type="button"
													class="picker-reference-item"
													onclick={() => {
														insertCommentCitationReference(item.id);
														showCommentCitationPicker = false;
													}}
												>
													<div class="picker-citation-number">[{index + 1}]</div>
													<div class="picker-citation-preview">
														{@html formatChicagoCitation(item)}
													</div>
												</button>
											{/each}
										</div>
									</div>
								</div>
							</div>
						{/if}
					{/if}

					<!-- Heuristic Quality Assessment for Comments -->
					{#if newComment.trim().length > 0 || draftPostId}
						{#if commentHeuristicScore < 50}
							{@const assessment = assessContentQuality(newComment)}
							<div class="heuristic-quality-indicator">
								<h5>Comment Quality: {commentHeuristicScore}% (50% required)</h5>
								<div class="quality-progress">
									<div class="quality-bar" style="width: {commentHeuristicScore}%"></div>
								</div>
								{#if assessment.issues.length > 0}
									<ul class="quality-issues">
										{#each assessment.issues as issue}
											<li>{issue}</li>
										{/each}
									</ul>
								{/if}
								<p class="quality-note">
									Good faith analysis and publishing are disabled until 50% quality threshold is
									met.
								</p>
							</div>
						{:else if commentHeuristicScore > 0}
							<div class="heuristic-quality-indicator passed">
								<h5>
									✅ Comment Quality: {commentHeuristicScore}% - Ready for analysis and publishing
								</h5>
								<div class="quality-progress">
									<div class="quality-bar passed" style="width: {commentHeuristicScore}%"></div>
								</div>
							</div>
						{/if}
					{/if}

					<!-- Existing Draft Good-Faith Analysis -->
					{#if draftGoodFaithAnalysis && !commentGoodFaithResult}
						<div
							class="draft-good-faith-analysis good-faith-result claude-result"
							style="margin-top:0.5rem;"
						>
							<button
								type="button"
								class="collapsible-header"
								onclick={() => (draftAnalysisExpanded = !draftAnalysisExpanded)}
							>
								<div class="good-faith-header">
									<div class="header-content">
										<h4>Saved Draft Analysis</h4>
										<div class="expand-icon" class:expanded={draftAnalysisExpanded}>
											<svg
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<polyline points="6,9 12,15 18,9"></polyline>
											</svg>
										</div>
									</div>
									<div class="good-faith-score">
										<span class="score-value"
											>{(draftGoodFaithAnalysis.good_faith_score * 100).toFixed(0)}%</span
										>
										<span class="score-label {draftGoodFaithAnalysis.good_faith_label}"
											>{draftGoodFaithAnalysis.good_faith_label}</span
										>
									</div>
								</div>
							</button>

							{#if draftAnalysisExpanded}
								<div class="analysis-content">
									<div class="analysis-note" style="margin-bottom: 1rem;">
										<small
											><em
												>This analysis was performed on a previous version of your draft. The score
												may change if you edit and republish.</em
											></small
										>
									</div>

									<!-- Full Claims Analysis -->
									{#if draftGoodFaithAnalysis.good_faith_analysis?.claims && draftGoodFaithAnalysis.good_faith_analysis.claims.length > 0}
										<div class="claude-claims">
											<strong>Claims Analysis:</strong>
											{#each draftGoodFaithAnalysis.good_faith_analysis.claims as claim}
												<div class="claim-item">
													<div class="claim-text"><strong>Claim:</strong> {claim.claim}</div>
													{#if claim.supportingArguments}
														{#each claim.supportingArguments as arg}
															<div class="argument-item">
																<div class="argument-text">{arg.argument}</div>
																<div class="argument-details">
																	<span class="argument-score">Score: {arg.score}/10</span>
																	{#if arg.fallacies && arg.fallacies.length > 0}
																		<span class="fallacies"
																			>Fallacies: {arg.fallacies.join(', ')}</span
																		>
																	{/if}
																</div>
																{#if arg.improvements}
																	<div class="improvements">Improvement: {arg.improvements}</div>
																{/if}
															</div>
														{/each}
													{/if}
												</div>
											{/each}
										</div>
									{/if}

									<!-- Cultish/Manipulative Phrases -->
									{#if draftGoodFaithAnalysis.good_faith_analysis?.cultishPhrases && draftGoodFaithAnalysis.good_faith_analysis.cultishPhrases.length > 0}
										<div class="cultish-phrases">
											<strong>Manipulative Language:</strong>
											{draftGoodFaithAnalysis.good_faith_analysis.cultishPhrases.join(', ')}
										</div>
									{/if}

									<!-- Overall Analysis/Rationale -->
									{#if draftGoodFaithAnalysis.good_faith_analysis?.overallAnalysis || draftGoodFaithAnalysis.good_faith_analysis?.summary || draftGoodFaithAnalysis.good_faith_analysis?.rationale}
										<div class="good-faith-rationale">
											<strong>Analysis:</strong>
											{draftGoodFaithAnalysis.good_faith_analysis.overallAnalysis ||
												draftGoodFaithAnalysis.good_faith_analysis.summary ||
												draftGoodFaithAnalysis.good_faith_analysis.rationale}
										</div>
									{/if}

									<div class="analysis-date" style="margin-top: 1rem; text-align: right;">
										<small
											>Analyzed: {new Date(
												draftGoodFaithAnalysis.good_faith_last_evaluated
											).toLocaleString()}</small
										>
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Comment Good-Faith Result / Error -->
					{#if commentGoodFaithResult}
						<div class="good-faith-result claude-result" style="margin-top:0.5rem;">
							<div class="good-faith-header">
								<h4>Comment Analysis</h4>
								<div class="good-faith-score">
									<span class="score-value"
										>{(commentGoodFaithResult.good_faith_score * 100).toFixed(0)}%</span
									>
									<span class="score-label {commentGoodFaithResult.good_faith_label}"
										>{commentGoodFaithResult.good_faith_label}</span
									>
								</div>
							</div>

							{#if commentGoodFaithResult.claims && commentGoodFaithResult.claims.length > 0}
								<div class="claude-claims">
									<strong>Claims Analysis:</strong>
									{#each commentGoodFaithResult.claims as claim}
										<div class="claim-item">
											<div class="claim-text"><strong>Claim:</strong> {claim.claim}</div>
											{#if claim.supportingArguments}
												{#each claim.supportingArguments as arg}
													<div class="argument-item">
														<div class="argument-text">{arg.argument}</div>
														<div class="argument-details">
															<span class="argument-score">Score: {arg.score}/10</span>
															{#if arg.fallacies && arg.fallacies.length > 0}
																<span class="fallacies">Fallacies: {arg.fallacies.join(', ')}</span>
															{/if}
														</div>
														{#if arg.improvements}
															<div class="improvements">Improvement: {arg.improvements}</div>
														{/if}
													</div>
												{/each}
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							{#if commentGoodFaithResult.cultishPhrases && commentGoodFaithResult.cultishPhrases.length > 0}
								<div class="cultish-phrases">
									<strong>Manipulative Language:</strong>
									{commentGoodFaithResult.cultishPhrases.join(', ')}
								</div>
							{/if}

							<div class="good-faith-rationale">
								<strong>Analysis:</strong>
								{commentGoodFaithResult.rationale}
							</div>
						</div>
					{/if}
					{#if commentGoodFaithError}
						<div class="good-faith-error" style="margin-top:0.5rem;">
							<strong>Analysis Error:</strong>
							{commentGoodFaithError}
						</div>
					{/if}

					{#if submitError}<p class="error-message" style="margin-top:0.5rem;">
							{submitError}
						</p>{/if}

					<div
						class="comment-actions"
						style="flex-direction:column; align-items:flex-end; gap:0.4rem;"
					>
						<div class="autosave-indicator" aria-live="polite">
							{#if draftPostId}
								<div class="autosave-status">
									{#if hasPending}
										<span class="pending-dot" aria-hidden="true"></span> Saving…
									{:else if lastSavedAt}
										Saved {new Date(lastSavedAt).toLocaleTimeString()}
									{:else}
										Draft created
									{/if}
								</div>
								{#if contributor}
									<div class="credit-status">
										{getAnalysisLimitText()}
									</div>
								{/if}
							{/if}
						</div>
						{#if replyingToPost}
							<div class="replying-indicator">
								Replying to <a href={`#post-${replyingToPost.id}`}
									>@{replyingToPost.contributor?.display_name || 'comment'}</a
								>
								<button type="button" class="btn-link" onclick={clearReplying}>Cancel</button>
							</div>
						{/if}
						{#if !canUserUseAnalysis && analysisBlockedReason}
							<div class="analysis-blocked-message">
								<p class="error-message">{analysisBlockedReason}</p>
								{#if analysisBlockedReason.includes('disabled')}
									<p class="help-text">Contact support for assistance.</p>
								{:else if analysisBlockedReason.includes('credits')}
									<p class="help-text">Check your <a href="/profile">profile page</a> for credit information.</p>
								{/if}
							</div>
						{/if}
						<button
							type="button"
							class="btn-primary"
							disabled={submitting || !newComment.trim()}
							onclick={() => {
								if (!commentHeuristicPassed) {
									// Let normal validation messages show for content issues
									return;
								}
								if (!canUserUseAnalysis) {
									showOutOfCreditsModal = true;
								} else {
									publishDraft();
								}
							}}
						>
							{#if submitting}
								Publishing…
							{:else}
								Publish Comment
							{/if}
						</button>
					</div>
				</form>
			{/if}
		</section>
	{:else}
		<p>Discussion not found.</p>
	{/if}
</article>

<!-- Out of Credits Modal -->
{#if showOutOfCreditsModal}
	<div class="modal-overlay" onclick={() => (showOutOfCreditsModal = false)}>
		<div class="modal-content out-of-credits-modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>🚫 Out of Credits</h3>
				<button
					type="button"
					class="modal-close-btn"
					onclick={() => (showOutOfCreditsModal = false)}
					aria-label="Close modal"
				>
					×
				</button>
			</div>
			<div class="modal-body">
				<p class="modal-main-message">
					You don't have enough credits to publish this comment with analysis.
				</p>
				{#if analysisBlockedReason}
					<div class="analysis-blocked-details">
						<p class="error-message">{analysisBlockedReason}</p>
						{#if analysisBlockedReason.includes('credits')}
							<p class="help-text">Check your <a href="/profile">profile page</a> for credit information and options to purchase more credits.</p>
						{:else if analysisBlockedReason.includes('disabled')}
							<p class="help-text">Visit your <a href="/profile">profile page</a> to enable analysis features.</p>
						{/if}
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button
					type="button"
					class="btn-secondary"
					onclick={() => (showOutOfCreditsModal = false)}
				>
					Close
				</button>
				<a href="/profile" class="btn-primary">
					View Profile
				</a>
			</div>
		</div>
	</div>
{/if}

<style>
	.discussion-article {
		max-width: 680px;
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

	.discussion-title {
		font-family: var(--font-family-display);
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		font-weight: 700;
		line-height: var(--line-height-tight);
		color: var(--color-text-primary);
		margin-bottom: 1rem;
		letter-spacing: -0.01em;
	}

	.discussion-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.discussion-tags .tag {
		display: inline-block;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 15%, var(--color-surface)),
			color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))
		);
		color: var(--color-primary);
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.875rem;
		font-weight: 500;
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		transition: all 0.2s ease;
	}

	.discussion-tags .tag:hover {
		background: var(--color-primary);
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 25%, transparent);
		cursor: pointer;
	}

	.discussion-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: 0;
		line-height: var(--line-height-normal);
	}

	.discussion-meta a {
		color: var(--color-link);
		font-weight: 600;
	}

	.discussion-actions {
		display: flex;
		flex-direction: row;
		display: flex;
		gap: 0.5rem;
		width: fit-content;
	}

	.anonymous-author {
		color: var(--color-text-primary);
		font-weight: 600;
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

	/* Editorial-style paragraph formatting for descriptions */
	.discussion-description p {
		margin-bottom: 1.5rem;
	}

	.discussion-description p:first-child {
		font-size: 1.25rem;
		line-height: var(--line-height-normal);
		margin-bottom: 2rem;
		color: var(--color-text-secondary);
	}

	.discussion-metadata {
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 1rem;
		margin-top: 1rem;
	}

	.chicago-citation {
		font-size: 0.8rem;
		line-height: 1.5;
		margin-bottom: 0.75rem;
	}

	.citation-number {
		font-weight: 600;
		color: var(--color-primary);
		margin-right: 0.5rem;
	}

	.citation-context {
		margin-left: 1.5rem;
		padding: 0.5rem;
		background: var(--color-surface-alt);
		border-left: 3px solid var(--color-border);
		font-size: 0.85rem;
	}

	.citation-context .citation-point {
		margin-bottom: 0.25rem;
	}

	.citation-context .citation-quote {
		font-style: italic;
		color: var(--color-text-secondary);
	}

	.citation-actions {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.insert-ref-btn {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		width: 100%;
		text-align: center;
		transition: all 0.2s ease;
	}

	.insert-ref-btn:hover {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.insert-ref-btn:active {
		background: color-mix(in srgb, var(--color-primary) 85%, black);
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

	/* Insert Citation Button */
	.insert-citation-btn {
		background: var(--color-secondary, #6b7280);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
		cursor: pointer;
		transition: opacity 0.2s;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.insert-citation-btn:hover {
		opacity: 0.8;
	}

	/* Good Faith Testing Buttons */
	.good-faith-test-btn {
		border: none;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: white;
	}

	.good-faith-test-btn.openai {
		background: #3b82f6;
	}

	.good-faith-test-btn.openai:hover:not(:disabled) {
		background: #2563eb;
	}

	.good-faith-test-btn.claude {
		background: #d97706;
	}

	.good-faith-test-btn.claude:hover:not(:disabled) {
		background: #b45309;
	}

	.good-faith-test-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Analysis Limit Info */
	.analysis-limit-info {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
		font-style: italic;
	}

	/* Analysis Panel - Sleek Design */
	.analysis-panel {
		background: transparent;
		border: none;
		border-radius: 0;
		padding: 1rem 0;
		margin: 1rem 0;
		position: relative;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.analysis-summary {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.25rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.analysis-badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem;
		min-width: 70px;
		color: var(--color-text-secondary);
	}

	.analysis-score {
		font-size: 1.1rem;
		font-weight: 500;
		line-height: 1;
	}

	.analysis-label {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--color-text-secondary);
		text-transform: capitalize;
		margin-top: 0.25rem;
		opacity: 0.7;
	}

	.analysis-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}

	.analysis-provider {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	/* Analysis Content */
	.analysis-content {
		margin-top: 1rem;
	}

	.claim-analysis {
		margin-bottom: 1.5rem;
	}

	.claim-statement {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 1rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-bg-primary));
		border-left: 3px solid var(--color-primary);
		border-radius: 0 var(--border-radius-sm) var(--border-radius-sm) 0;
	}

	.argument-card {
		background: var(--color-bg-secondary);
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		border-radius: var(--border-radius-sm);
		padding: 1rem;
		margin: 0.75rem 0;
	}

	.argument-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.argument-text {
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--color-text-primary);
		flex: 1;
		margin-right: 1rem;
	}

	.argument-metrics {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.argument-score {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: var(--border-radius-sm);
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border);
	}

	.argument-score.strong {
		background: color-mix(in srgb, #10b981 15%, var(--color-bg-primary));
		border-color: color-mix(in srgb, #10b981 30%, transparent);
		color: #059669;
	}

	.argument-score.moderate {
		background: color-mix(in srgb, #f59e0b 15%, var(--color-bg-primary));
		border-color: color-mix(in srgb, #f59e0b 30%, transparent);
		color: #d97706;
	}

	.argument-score.weak {
		background: color-mix(in srgb, #ef4444 15%, var(--color-bg-primary));
		border-color: color-mix(in srgb, #ef4444 30%, transparent);
		color: #dc2626;
	}

	.improvements-section {
		border-top: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		padding-top: 0.75rem;
		margin-top: 0.75rem;
	}

	.improvements-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.5rem;
	}

	.improvements-list {
		margin: 0;
		padding-left: 1.25rem;
		list-style: none;
	}

	.improvements-list li {
		font-size: 0.8rem;
		line-height: 1.4;
		color: var(--color-text-secondary);
		margin-bottom: 0.25rem;
		position: relative;
	}

	.improvements-list li::before {
		content: '→';
		position: absolute;
		left: -1rem;
		color: var(--color-primary);
		font-weight: 600;
	}

	.issues-section {
		border-top: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		padding-top: 0.75rem;
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.issue-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.issue-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.issue-text {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.3;
	}

	.analysis-summary-text {
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--color-text-secondary);
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.analysis-close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 1.25rem;
		padding: 0.25rem;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.analysis-close-btn:hover {
		background: color-mix(in srgb, var(--color-text-secondary) 10%, transparent);
		color: var(--color-text-primary);
	}

	.score-value {
		font-weight: 600;
		font-size: 1.1rem;
		color: var(--color-text-primary);
	}

	.argument-text {
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	.improvements {
		margin-top: 0.5rem;
		padding: 0.75rem;
		border-radius: var(--border-radius-sm);
		border-left: 3px solid var(--color-primary);
		color: var(--color-text-primary);
		line-height: 1.5;
	}

	.score-label {
		padding: 0.25rem 0.5rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.8rem;
		font-weight: 500;
		text-transform: uppercase;
	}

	.score-label.hostile {
		background: color-mix(in srgb, #ef4444 8%, transparent);
		color: #f87171;
	}

	.score-label.questionable {
		background: color-mix(in srgb, #f59e0b 8%, transparent);
		color: #fbbf24;
	}

	.score-label.neutral {
		background: color-mix(in srgb, #6b7280 8%, transparent);
		color: #9ca3af;
	}

	.score-label.constructive {
		background: color-mix(in srgb, #10b981 8%, transparent);
		color: #34d399;
	}

	.score-label.exemplary {
		background: color-mix(in srgb, #059669 8%, transparent);
		color: #34d399;
	}

	.good-faith-rationale {
		font-size: 0.9rem;
		line-height: 1.4;
		color: var(--color-text-secondary);
	}

	.good-faith-error {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border: 1px solid #ef4444;
		border-radius: var(--border-radius-md);
		padding: 1rem;
		margin: 1rem 0;
		color: #dc2626;
		position: relative;
	}

	.close-result-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		font-size: 1rem;
		padding: 0.25rem;
		border-radius: 4px;
		transition: color 0.2s;
	}

	.close-result-btn:hover {
		color: var(--color-text-primary);
	}

	/* Claude-specific styling */
	.claude-result {
		border-left: 4px solid #d97706;
	}

	.claude-claims {
		margin: 0.75rem 0;
		font-size: 0.9rem;
	}

	.claim-item {
		margin: 0.75rem 0;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		/* background: color-mix(in srgb, var(--color-primary) 3%, var(--color-surface-alt)); */
	}

	.claim-text {
		font-weight: 500;
		margin-bottom: 0.5rem;
	}

	.argument-item {
		margin: 0.5rem 0;
		padding-left: 1rem;
		border-left: 2px solid var(--color-border);
	}

	.argument-text {
		margin-bottom: 0.25rem;
	}

	.argument-details {
		display: flex;
		gap: 1rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.argument-score {
		font-weight: 600;
	}

	.fallacies {
		color: #dc2626;
	}

	.improvements {
		margin-top: 0.25rem;
		font-size: 0.8rem;
		font-style: italic;
		color: var(--color-text-secondary);
	}

	/* OpenAI-specific styling */
	.openai-result {
		border-left: 4px solid #10b981;
	}
	.openai-claims {
		margin: 0.75rem 0;
		font-size: 0.9rem;
	}
	.manipulative-language {
		color: #dc2626;
	}
	.cultish-phrases {
		margin: 0.75rem 0;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, #dc2626 5%, var(--color-surface-alt));
	}
	.cultish-phrases ul {
		margin: 0.5rem 0 0 0;
		padding-left: 1.5rem;
	}
	.fallacy-warning {
		margin: 0.75rem 0;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, #f59e0b 10%, var(--color-surface-alt));
		border-left: 3px solid #f59e0b;
	}
	.improvements ul {
		margin: 0.25rem 0 0 0;
		padding-left: 1.5rem;
	}
	.improvements li {
		margin: 0.125rem 0;
	}

	.cache-indicator {
		font-size: 0.8rem;
		margin-left: 0.5rem;
		opacity: 0.7;
	}

	/* Citation Picker Modal */
	.citation-picker-overlay {
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
	}

	.citation-picker-modal {
		background: var(--color-surface);
		border-radius: var(--border-radius-md);
		padding: 1.5rem;
		max-width: 600px;
		max-height: 70vh;
		overflow: auto;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
	}

	.citation-picker-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.citation-picker-header h4 {
		margin: 0;
		color: var(--color-text-primary);
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.2rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0.25rem;
	}

	.close-btn:hover {
		color: var(--color-text-primary);
	}

	.citation-picker-content p {
		margin: 0 0 1rem 0;
		color: var(--color-text-secondary);
	}

	.reference-item {
		margin-bottom: 1rem;
	}

	.picker-references-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.picker-reference-item {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: background-color 0.2s;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		width: 100%;
	}

	.picker-reference-item:hover {
		background: var(--color-surface-alt);
	}

	.picker-citation-number {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 2rem;
	}

	.picker-citation-preview {
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.historical-description {
		line-height: 1.6;
		white-space: pre-wrap;
		word-wrap: break-word;
		margin-top: 0.5rem;
	}

	.posts-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.post-card {
		background-color: var(--color-surface);
		padding: 1.5rem;
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border);
	}
	.post-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: 1rem;
	}
	.post-meta .spacer {
		flex: 1 1 auto;
	}
	/* Modern Action Button Base Styles */
	.reply-post-btn,
	.edit-post-btn,
	.delete-post-btn {
		background: transparent;
		border: 1px solid transparent;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 400;
		padding: 0.3rem 0.6rem;
		border-radius: var(--border-radius-sm);
		transition: all 0.15s ease;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		text-decoration: none;
		color: var(--color-text-secondary);
	}

	.reply-post-btn:hover {
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 4%, var(--color-bg-primary));
	}

	.edit-post-btn:hover {
		color: #059669;
		background: color-mix(in srgb, #059669 4%, var(--color-bg-primary));
	}

	.delete-post-btn:hover {
		color: #dc2626;
		background: color-mix(in srgb, #dc2626 4%, var(--color-bg-primary));
	}
	.post-content {
		line-height: 1.6;
	}
	.reply-context {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
	}
	.snapshot-details {
		margin-top: 0.25rem;
	}
	.snapshot-content {
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
	}
	.post-edit-block {
		margin-top: 0.5rem;
	}
	.post-edit-block textarea {
		width: 100%;
	}
	.post-edit-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.4rem;
	}
	.add-comment {
		margin-top: 3rem;
	}
	.add-comment-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}
	.signin-hint {
		color: var(--color-text-secondary);
	}
	.leave-comment-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: var(--border-radius-sm);
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		margin: 0 auto;
		min-width: 200px;
		justify-content: center;
	}
	.leave-comment-btn:hover {
		background: color-mix(in srgb, var(--color-primary) 90%, black);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 30%, transparent);
	}
	.comment-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.comment-form textarea {
		width: 100%;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		background-color: var(--color-input-bg);
		color: var(--color-text-primary);
		resize: vertical;
	}
	.comment-form textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}
	.comment-actions {
		display: flex;
		justify-content: flex-end;
	}

	/* Post Type Selection */
	.post-type-selection {
		margin: 0.5rem 0;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.post-type-label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
		font-size: 0.9rem;
	}
	.post-type-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.post-type-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 2px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		background: var(--color-bg-primary);
		text-align: left;
		font-family: inherit;
	}
	.post-type-btn:hover {
		border-color: var(--color-primary);
		background: var(--color-bg-secondary);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}
	.post-type-btn.selected {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-primary));
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.post-type-btn.compact {
		display: inline-flex;
		width: auto;
		font-size: 0.9rem;
		padding: 0.5rem 0.75rem;
	}

	.post-type-selected {
		display: flex;
    justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.post-type-selected .post-type-label {
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.toggle-advanced-btn.compact {
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		border: 2px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-bg-primary);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.toggle-advanced-btn.compact:hover {
		border-color: var(--color-primary);
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
	}
	.post-type-icon {
		font-size: 1.2rem;
		min-width: 1.5rem;
		text-align: center;
	}
	.post-type-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}
	.post-type-title {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.85rem;
	}
	.post-type-desc {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.3;
	}

	/* Advanced Features Toggle */
	.advanced-features-toggle {
		margin: 0.75rem 0 0.5rem 0;
		text-align: center;
	}

	/* Advanced Features Content */
	.comment-writing-info,
	.citation-section {
		animation: expandIn 0.3s ease-out;
		overflow: hidden;
	}

	@keyframes expandIn {
		from {
			opacity: 0;
			max-height: 0;
			margin-top: 0;
			margin-bottom: 0;
		}
		to {
			opacity: 1;
			max-height: 500px;
			margin-top: inherit;
			margin-bottom: inherit;
		}
	}
	.toggle-advanced-btn {
		background: none;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 0.85rem;
		font-family: inherit;
	}
	.toggle-advanced-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: var(--color-bg-secondary);
	}

	.replying-indicator {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		align-self: flex-start;
	}
	.btn-link {
		background: none;
		border: none;
		padding: 0;
		margin-left: 0.5rem;
		color: var(--color-primary);
		cursor: pointer;
	}
	.btn-primary {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		padding: 0.6rem 1.2rem;
		border-radius: var(--border-radius-md);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		cursor: pointer;
		font-weight: 600;
	}
	.btn-primary:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}
	.btn-primary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	/* Modern Secondary Button Styling */
	.btn-secondary {
		background: transparent;
		color: var(--color-primary);
		padding: 0.6rem 1.2rem;
		border: 1.5px solid var(--color-primary);
		border-radius: var(--border-radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		transition: all 0.2s ease;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
	}

	.btn-secondary:hover {
		background: var(--color-primary);
		color: var(--color-surface);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.btn-secondary:active {
		transform: translateY(0);
		box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	/* Modern Inline Citation Button */
	.btn-add-citation-inline {
		background: linear-gradient(
			135deg,
			var(--color-primary) 0%,
			color-mix(in srgb, var(--color-primary) 80%, #8b5cf6) 100%
		);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
		transition: all 0.25s ease;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
		position: relative;
		overflow: hidden;
	}

	.btn-add-citation-inline::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
		transition: left 0.5s ease;
	}

	.btn-add-citation-inline:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 30%, transparent);
		filter: brightness(1.1);
	}

	.btn-add-citation-inline:hover::before {
		left: 100%;
	}

	.btn-add-citation-inline:active {
		transform: translateY(-1px);
		box-shadow: 0 3px 10px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	/* Add icon styling */
	.btn-add-citation-inline::after {
		content: '📚';
		font-size: 0.9rem;
	}

	.error-message {
		color: #ef4444;
	}

	.analysis-blocked-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		padding: 12px;
		margin: 8px 0;
	}

	.analysis-blocked-message .error-message {
		margin: 0 0 4px 0;
		font-weight: 500;
	}

	.analysis-blocked-message .help-text {
		margin: 0;
		font-size: 0.9rem;
		color: #6b7280;
	}

	.analysis-blocked-message .help-text a {
		color: #3b82f6;
		text-decoration: none;
	}

	.analysis-blocked-message .help-text a:hover {
		text-decoration: underline;
	}
	.draft-status {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-style: italic;
		margin-left: auto;
		align-self: center;
	}
	.autosave-indicator {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		min-height: 0.9rem;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.2rem;
	}

	.autosave-status {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.credit-status {
		font-size: 0.6rem;
		color: var(--color-text-tertiary);
		opacity: 0.8;
		font-style: italic;
	}

	.credit-status-inline {
		font-size: 0.6rem;
		color: var(--color-text-tertiary);
		opacity: 0.8;
		font-style: italic;
		margin-top: 0.2rem;
	}
	.pending-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-accent);
		display: inline-block;
		animation: pulse 1s linear infinite;
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
	.post-version-link {
		font-size: 0.65rem;
		color: var(--color-primary);
		margin-left: 0.5rem;
	}
	.post-version-link:hover {
		text-decoration: underline;
	}
	/* Editorial Edit Button */
	.edit-btn {
		font-size: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.25rem 0.75rem;
		border-radius: var(--border-radius-sm);
		font-weight: 500;
		transition: all var(--transition-speed) ease;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: var(--font-family-ui);
	}

	.edit-btn:hover,
	.edit-btn:focus {
		color: var(--color-primary);
		border-color: var(--color-primary);
		outline: none;
	}
	.edit-form {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
		padding: 1rem;
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border);
	}
	.edit-form label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-bottom: 0.25rem;
	}
	.edit-form input[type='text'],
	.edit-form textarea {
		width: 100%;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-input-bg);
		color: var(--color-text-primary);
		font: inherit;
	}
	.edit-form input:focus,
	.edit-form textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}
	.edit-autosave-indicator {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin: 0.5rem 0;
		min-height: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.edit-autosave-indicator .autosave-status {
		display: flex;
		align-items: center;
	}

	.edit-autosave-indicator .credit-status-inline {
		font-size: 0.65rem;
	}
	.historical-version-banner {
		background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-alt));
		border: 2px solid var(--color-accent);
		border-radius: var(--border-radius-md);
		padding: 1.5rem;
		margin-bottom: 2rem;
		font-size: 0.95rem;
		color: var(--color-text-primary);
	}

	.historical-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.historical-header strong {
		color: var(--color-accent);
		font-size: 1.1rem;
	}

	.return-current-btn {
		background: var(--color-primary);
		color: var(--color-surface);
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.9rem;
		transition: background var(--transition-speed) ease;
	}

	.return-current-btn:hover {
		background: var(--color-accent);
	}

	.historical-content {
		border-top: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent);
		padding-top: 1rem;
	}

	.historical-title {
		font-weight: 700;
		font-size: 1.2rem;
		color: var(--color-text-primary);
		margin: 0 0 0.75rem 0;
	}

	.historical-description {
		line-height: 1.6;
		color: var(--color-text-primary);
	}

	.post-version-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 0.85rem;
		opacity: 0.8;
		transition: opacity var(--transition-speed) ease;
	}

	.post-version-link:hover {
		opacity: 1;
		text-decoration: underline;
	}

	/* Legacy styles for compatibility */
	.return-current {
		margin-top: 0.75rem;
		display: inline-block;
		color: var(--color-primary);
		font-size: 0.85rem;
	}
	.return-current:hover {
		text-decoration: underline;
	}

	/* Writing Style Post Display */
	.writing-style-badge {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		border-radius: var(--border-radius-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
	}

	.writing-style-badge.journalistic {
		background: color-mix(in srgb, #3b82f6 10%, transparent);
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.writing-style-badge.academic {
		background: color-mix(in srgb, #7c3aed 10%, transparent);
		border-color: #7c3aed;
		color: #7c3aed;
	}

	.journalistic-post {
		border-left: 4px solid #3b82f6;
	}

	.academic-post {
		border-left: 4px solid #7c3aed;
	}

	.post-metadata {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.post-metadata h5 {
		margin: 0 0 0.5rem 0;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.sources-list,
	.citations-list {
		margin: 0;
		font-size: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.source-item,
	.citation-item {
		padding: 0.75rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
	}

	.source-header,
	.citation-header {
		margin-bottom: 0.5rem;
		line-height: 1.3;
	}

	.source-title,
	.citation-title {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.source-title {
		color: var(--color-primary);
		text-decoration: none;
	}

	.source-title:hover {
		text-decoration: underline;
	}

	.source-author,
	.citation-author,
	.source-date,
	.citation-date,
	.citation-publisher,
	.citation-page {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.source-point,
	.citation-point {
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
	}

	.source-quote,
	.citation-quote {
		font-style: italic;
		color: var(--color-text-secondary);
		padding-left: 0.5rem;
		border-left: 3px solid var(--color-border);
		margin-bottom: 0.5rem;
	}

	.citation-url {
		font-size: 0.75rem;
	}

	.citation-url a {
		color: var(--color-primary);
		text-decoration: none;
		word-break: break-all;
	}

	.citation-url a:hover {
		text-decoration: underline;
	}

	.access-date {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-style: italic;
		margin-left: 0.5rem;
	}

	/* Writing Style Selector */
	.writing-style-selector {
		margin-bottom: 1rem;
	}

	.style-label {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.5rem;
	}

	.style-options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.75rem;
	}

	.style-option {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 2px solid var(--color-border);
		border-radius: var(--border-radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		background: var(--color-surface);
	}

	.style-option:hover {
		border-color: color-mix(in srgb, var(--color-primary) 50%, transparent);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.style-option.selected {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
	}

	.style-content {
		flex: 1;
	}

	/* Citation Section */
	.citation-section {
		margin-bottom: 1rem;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		background: var(--color-surface-alt);
	}

	.citation-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.citation-header h4 {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text-primary);
	}

	.citations-list {
		margin-top: 1rem;
	}

	.citation-item {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		margin-bottom: 0.75rem;
	}

	.citation-content {
		flex: 1;
	}

	.citation-title {
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.25rem;
	}

	.citation-url a {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 0.875rem;
	}

	.citation-url a:hover {
		text-decoration: underline;
	}

	.edit-btn {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		width: 100%;
		text-align: center;
		transition: all 0.2s ease;
	}

	.edit-btn:hover {
		background: var(--color-accent);
		color: white;
		border-color: var(--color-accent);
	}

	.edit-btn:active {
		background: color-mix(in srgb, var(--color-accent) 90%, black);
	}

	.remove-btn {
		background: var(--color-surface);
		color: red;
		border: 1px solid var(--color-border);
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		width: 100%;
		text-align: center;
		transition: all 0.2s ease;
	}

	.remove-btn:hover {
		background: var(--color-danger);
		color: white;
		border-color: var(--color-danger);
	}

	.remove-btn:active {
		background: color-mix(in srgb, var(--color-danger) 90%, black);
	}

	/* Heuristic Quality Indicator */
	.heuristic-quality-indicator {
		margin-top: 1rem;
		padding: 0.75rem;
		background: color-mix(in srgb, #f59e0b 10%, transparent);
		border: 1px solid #f59e0b;
		border-radius: var(--border-radius-sm);
	}

	.heuristic-quality-indicator.passed {
		background: color-mix(in srgb, #10b981 10%, transparent);
		border-color: #10b981;
	}

	.heuristic-quality-indicator h5 {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		color: #d97706;
	}

	.heuristic-quality-indicator.passed h5 {
		color: #059669;
	}

	.quality-progress {
		width: 100%;
		height: 8px;
		background: color-mix(in srgb, #6b7280 20%, transparent);
		border-radius: 4px;
		overflow: hidden;
		margin: 0.5rem 0;
	}

	.quality-bar {
		height: 100%;
		background: #f59e0b;
		transition: width 0.3s ease;
	}

	.quality-bar.passed {
		background: #10b981;
	}

	.quality-issues {
		margin: 0.5rem 0;
		padding-left: 1.25rem;
		color: #b45309;
	}

	.quality-issues li {
		font-size: 0.8rem;
		margin-bottom: 0.25rem;
	}

	.quality-note {
		margin: 0.5rem 0 0 0;
		font-size: 0.8rem;
		color: #b45309;
		font-style: italic;
	}

	/* Additional source-specific styles */
	.source-accessed {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	/* Citation Details Collapsible Styling */
	.citation-details {
		margin-top: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		overflow: hidden;
	}

	.citation-details summary {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface-alt);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		border: none;
		outline: none;
		user-select: none;
		transition: background-color 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.citation-details summary:hover {
		background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-alt));
		color: var(--color-text-primary);
	}

	.citation-details summary::-webkit-details-marker {
		display: none;
	}

	.summary-arrow {
		font-size: 0.75rem;
		color: var(--color-primary);
		transition: transform 0.2s;
		font-family: monospace;
	}

	.citation-details[open] .summary-arrow {
		transform: rotate(90deg);
	}

	.summary-text {
		font-weight: 500;
	}

	.citation-details[open] summary {
		background: color-mix(in srgb, var(--color-primary) 15%, var(--color-surface-alt));
		color: var(--color-text-primary);
		border-bottom: 1px solid var(--color-border);
	}

	.citation-context {
		padding: 0.75rem;
		background: var(--color-surface);
	}

	.citation-point,
	.citation-quote {
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.citation-point:last-child,
	.citation-quote:last-child {
		margin-bottom: 0;
	}

	.citation-point strong,
	.citation-quote strong {
		color: var(--color-primary);
		font-weight: 600;
	}

	.citation-quote {
		font-style: italic;
		color: var(--color-text-secondary);
	}

	/* Auto-resizing textarea styles */
	#edit-description {
		min-height: 80px;
		resize: none;
		transition: height 0.1s ease-out;
		overflow-y: hidden;
		box-sizing: border-box;
	}

	/* Delete Discussion Button - Match the modern style */
	.delete-discussion-btn {
		background: color-mix(in srgb, var(--color-surface) 40%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.4rem 0.75rem;
		border-radius: 8px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		text-decoration: none;
		margin-left: 0.5rem;
		opacity: 0.6;
		box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary) 4%, transparent);
	}

	.delete-discussion-btn:hover {
		background: color-mix(in srgb, #dc2626 8%, var(--color-surface));
		border-color: color-mix(in srgb, #dc2626 30%, transparent);
		color: #dc2626;
		opacity: 1;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, #dc2626 15%, transparent);
	}

	/* Reveal Identity Button */
	.reveal-identity-btn {
		background: color-mix(in srgb, var(--color-surface) 40%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.4rem 0.75rem;
		border-radius: 8px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		text-decoration: none;
		margin-left: 0.5rem;
		opacity: 0.6;
		box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary) 4%, transparent);
	}

	.reveal-identity-btn:hover {
		background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));
		border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
		color: var(--color-accent);
		opacity: 1;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-accent) 15%, transparent);
	}

	/* Good faith analysis toggle styles */
	/* Anonymous author styling */
	.anonymous-author {
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.good-faith-analysis-section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.good-faith-toggle {
		width: 100%;
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		padding: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--color-text-primary);
		transition: background-color 0.2s;
	}

	.good-faith-toggle:hover {
		background: var(--color-input-bg);
	}

	.toggle-icon {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		transition: transform 0.2s;
	}

	.good-faith-score-inline {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.good-faith-score-inline .score-value {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.good-faith-score-inline .score-label {
		padding: 0.2rem 0.5rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.good-faith-details {
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-top: none;
		border-radius: 0 0 var(--border-radius-sm) var(--border-radius-sm);
	}

	.score-breakdown {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.score-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.score-label-text {
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.score-value-large {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text-primary);
	}

	.score-label-badge {
		padding: 0.3rem 0.7rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.evaluation-date {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	/* Score label colors (reusing existing styles) */
	.score-label.hostile,
	.score-label-badge.hostile {
		background: color-mix(in srgb, #ef4444 8%, transparent);
		color: #f87171;
	}

	.score-label.questionable,
	.score-label-badge.questionable {
		background: color-mix(in srgb, #f59e0b 8%, transparent);
		color: #fbbf24;
	}

	.score-label.neutral,
	.score-label-badge.neutral {
		background: color-mix(in srgb, #6b7280 8%, transparent);
		color: #9ca3af;
	}

	.score-label.constructive,
	.score-label-badge.constructive {
		background: color-mix(in srgb, #10b981 8%, transparent);
		color: #34d399;
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
	.comment-writing-info {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.comment-writing-info .word-count {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.citation-reminder {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: var(--border-radius-md);
		border: 1px dashed color-mix(in srgb, var(--color-border) 85%, transparent);
		background: var(--color-surface-alt);
		transition:
			background 160ms ease,
			border-color 160ms ease,
			box-shadow 160ms ease;
	}

	.citation-reminder.active {
		background: linear-gradient(135deg, #fef3c7, #fde68a);
		border-color: #f59e0b;
		box-shadow: 0 6px 18px color-mix(in srgb, #f59e0b 25%, transparent);
	}

	.citation-reminder .reminder-icon {
		font-size: 1.35rem;
	}

	.citation-reminder .reminder-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
	}

	.citation-reminder .reminder-text strong {
		font-size: 1rem;
		color: var(--color-text-primary);
	}

	.citation-reminder.active .reminder-text strong {
		color: #92400e;
	}

	.citation-reminder.active .reminder-text span {
		color: #b45309;
	}

	.citation-reminder .btn-add-citation-inline {
		margin-left: auto;
	}

	@media (max-width: 640px) {
		.citation-reminder .btn-add-citation-inline {
			margin-left: 0;
			width: 100%;
			justify-content: center;
		}
	}

	.comment-writing-info .word-count-label {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.comment-writing-info .style-indicator {
		color: var(--color-text-secondary);
		font-style: italic;
	}

	/* Draft Good Faith Analysis Styles */
	.draft-good-faith-analysis {
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 1rem;
	}

	.analysis-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.good-faith-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		border-radius: 16px;
		font-size: 0.75rem;
		font-weight: 600;
		border: 1px solid;
		white-space: nowrap;
	}

	.good-faith-pill.hostile {
		background: color-mix(in srgb, #dc2626 15%, transparent);
		color: #dc2626;
		border-color: color-mix(in srgb, #dc2626 30%, transparent);
	}

	.good-faith-pill.questionable {
		background: color-mix(in srgb, #ea580c 15%, transparent);
		color: #ea580c;
		border-color: color-mix(in srgb, #ea580c 30%, transparent);
	}

	.good-faith-pill.neutral {
		background: color-mix(in srgb, #6b7280 15%, transparent);
		color: #6b7280;
		border-color: color-mix(in srgb, #6b7280 30%, transparent);
	}

	.good-faith-pill.constructive {
		background: color-mix(in srgb, #059669 15%, transparent);
		color: #059669;
		border-color: color-mix(in srgb, #059669 30%, transparent);
	}

	.good-faith-pill.exemplary {
		background: color-mix(in srgb, #0284c7 15%, transparent);
		color: #0284c7;
		border-color: color-mix(in srgb, #0284c7 30%, transparent);
	}

	.gf-score {
		font-weight: 700;
	}

	.gf-label {
		font-weight: 500;
		text-transform: capitalize;
	}

	.analysis-date {
		margin-bottom: 0.5rem;
	}

	.analysis-date small {
		color: var(--color-text-secondary);
	}

	.analysis-note {
		padding: 0.75rem;
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		border-radius: var(--border-radius-sm);
		border-left: 4px solid var(--color-primary);
		margin: 0.5rem 0;
	}

	.analysis-note small {
		color: var(--color-text-primary);
		font-weight: 500;
		font-size: 0.875rem;
	}

	/* Enhanced styling for draft analysis */
	.draft-good-faith-analysis {
		border: 2px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		overflow: hidden;
	}

	.draft-good-faith-analysis .good-faith-header h4 {
		color: var(--color-primary);
		font-weight: 600;
	}

	/* Collapsible header styles */
	.collapsible-header {
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.collapsible-header:hover {
		background-color: color-mix(in srgb, var(--color-primary) 3%, transparent);
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
	}

	.expand-icon {
		transition: transform 0.2s ease;
		display: flex;
		align-items: center;
		color: var(--color-text-secondary);
	}

	.expand-icon.expanded {
		transform: rotate(180deg);
	}

	.expand-icon svg {
		width: 16px;
		height: 16px;
	}

	/* Analysis content with smooth animation */
	.analysis-content {
		animation: slideDown 0.3s ease-out;
		padding-top: 0.5rem;
	}

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

	/* Out of Credits Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(2px);
	}

	.modal-content {
		background: var(--color-bg-primary);
		border-radius: 12px;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
		max-width: 500px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		animation: modal-appear 0.2s ease-out;
	}

	@keyframes modal-appear {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 1.5rem 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.modal-close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		line-height: 1;
		transition: all 0.2s ease;
	}

	.modal-close-btn:hover {
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.modal-main-message {
		font-size: 1.1rem;
		color: var(--color-text-primary);
		margin: 0 0 1rem 0;
		line-height: 1.5;
	}

	.analysis-blocked-details {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 1rem;
		margin-top: 1rem;
	}

	.analysis-blocked-details .error-message {
		color: var(--color-error);
		font-weight: 500;
		margin: 0 0 0.5rem 0;
	}

	.analysis-blocked-details .help-text {
		color: var(--color-text-secondary);
		margin: 0;
		font-size: 0.9rem;
	}

	.analysis-blocked-details .help-text a {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 500;
	}

	.analysis-blocked-details .help-text a:hover {
		text-decoration: underline;
	}

	.modal-footer {
		padding: 1rem 1.5rem 1.5rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.modal-footer .btn-secondary {
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		text-decoration: none;
		transition: all 0.2s ease;
	}

	.modal-footer .btn-secondary:hover {
		background: var(--color-bg-tertiary);
		border-color: var(--color-text-secondary);
	}

	.modal-footer .btn-primary {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		text-decoration: none;
		transition: all 0.2s ease;
	}

	.modal-footer .btn-primary:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 12%, transparent);
	}

	@media (max-width: 640px) {
		.modal-content {
			width: 95%;
			margin: 1rem;
		}

		.modal-header,
		.modal-body,
		.modal-footer {
			padding-left: 1rem;
			padding-right: 1rem;
		}

		.modal-footer {
			flex-direction: column;
		}

		.modal-footer .btn-secondary,
		.modal-footer .btn-primary {
			width: 100%;
			justify-content: center;
			display: flex;
		}
	}
</style>
