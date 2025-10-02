<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { page } from '$app/stores';
	import { nhost } from '$lib/nhostClient';
	import { goto } from '$app/navigation';
	import {
		WRITING_STYLES,
		getStyleConfig,
		validateStyleRequirements,
		type WritingStyle,
		type StyleMetadata,
		type Citation,
		COMMON_DISCUSSION_TAGS,
		validateTags,
		normalizeTag
	} from '$lib/types/writingStyle';
	import CitationForm from '$lib/components/CitationForm.svelte';
	import AnimatedLogo from '$lib/components/AnimatedLogo.svelte';
	import {
		CREATE_DISCUSSION_WITH_VERSION,
		UPDATE_DISCUSSION_VERSION,
		PUBLISH_DISCUSSION_VERSION,
		GET_DISCUSSION_DRAFT_VERSION,
		UPDATE_DISCUSSION_VERSION_GOOD_FAITH,
		GET_CONTRIBUTOR
	} from '$lib/graphql/queries';
	import {
		canUseAnalysis,
		getMonthlyCreditsRemaining,
		getPurchasedCreditsRemaining,
		checkAndResetMonthlyCredits
	} from '$lib/creditUtils';

	// --- State (Runes) ---
	let user = $state(nhost.auth.getUser());
	let contributor = $state<any>(null);
	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
		loadContributor();
	});

	let title = $state('');
	let content = $state('');
	let discussionId = $state<string | null>(null);
	let currentVersionId = $state<string | null>(null);
	let publishing = $state(false);
	let publishError = $state<string | null>(null);
	let lastSavedAt = $state<number | null>(null);
	let autoSaveTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	// Good faith validation state
	let goodFaithTesting = $state(false);
	let goodFaithResult = $state<any>(null);
	let goodFaithError = $state<string | null>(null);
	const GOOD_FAITH_THRESHOLD = 0.7;

	// Writing style state (automatically inferred)
	let styleMetadata = $state<StyleMetadata>({});
	let styleValidation = $state<{ isValid: boolean; issues: string[] }>({
		isValid: true,
		issues: []
	});
	let wordCount = $state(0);
	let showCitationReminder = $state(false);

	// Tag management
	let discussionTags = $state<string[]>([]);
	let newTag = $state('');
	let showTagSuggestions = $state(false);
	let showTagModal = $state(false);

	// Label visibility state
	let titleFocused = $state(false);
	let tagsFocused = $state(false);
	let contentFocused = $state(false);

	const showTitleLabel = $derived(titleFocused || title.length > 0);
	const showTagsLabel = $derived(tagsFocused || discussionTags.length > 0 || newTag.length > 0);
	const showContentLabel = $derived(contentFocused || content.length > 0);

	// Automatically infer writing style based on content length
	function getInferredStyle(): WritingStyle {
		if (wordCount <= 100) return 'quick_point';
		if (wordCount <= 500) return 'journalistic';
		return 'academic';
	}

	let selectedStyle = $derived(getInferredStyle());

	// Citation management
	let showCitationForm = $state(false);
	const hasCitations = $derived(
		Array.isArray(styleMetadata.citations) && styleMetadata.citations.length > 0
	);

	// Helper functions for the new versioning system

	// Load existing discussion draft if ID provided in URL
	async function loadExistingDiscussion(id: string) {
		try {
			const { data, error } = await nhost.graphql.request(GET_DISCUSSION_DRAFT_VERSION, {
				discussionId: id
			});
			if (error) {
				console.error('Failed to load discussion:', error);
				return;
			}

			const discussion = data?.discussion_by_pk;
			if (discussion && discussion.draft_version?.length > 0) {
				discussionId = discussion.id;
				const draftVersion = discussion.draft_version[0];
				currentVersionId = draftVersion.id;
				title = draftVersion.title || '';
				content = draftVersion.description || '';

				// Load existing citations and claims if available
				if (draftVersion.citations) {
					styleMetadata.citations = draftVersion.citations;
				}

				// Load existing tags if available
				if (draftVersion.tags) {
					discussionTags = draftVersion.tags;
				}

				// Load existing good faith analysis if available
				if (draftVersion.good_faith_score !== null) {
					goodFaithResult = {
						good_faith_score: draftVersion.good_faith_score,
						good_faith_label: draftVersion.good_faith_label,
						rationale: 'Previous analysis result',
						claims: draftVersion.claims || [],
						cultishPhrases: [],
						fallacyOverload: false
					};
				}

				lastSavedAt = Date.now();
				console.log('Loaded existing discussion draft:', id, 'version:', currentVersionId);
			}
		} catch (e) {
			console.error('Failed to load discussion:', e);
		}
	}

	// Check for discussion ID in URL on page load
	$effect(() => {
		if (typeof window !== 'undefined') {
			const urlParams = new URLSearchParams(window.location.search);
			const idParam = urlParams.get('id');
			if (idParam && !discussionId) {
				loadExistingDiscussion(idParam);
			}
			// Load contributor data on mount
			loadContributor();
		}
	});

	async function createDraftDiscussion() {
		if (!user || discussionId) return;
		console.log('Creating draft discussion with version...');
		try {
			const discTitle = title.trim() || 'Untitled Discussion';
			const { data: discData, error: discError } = await nhost.graphql.request(
				CREATE_DISCUSSION_WITH_VERSION,
				{
					title: discTitle,
					description: content || '',
					tags: validateTags(discussionTags),
					sections: [],
					claims: [],
					citations: styleMetadata.citations || [],
					createdBy: user.id
				}
			);
			if (discError) {
				console.error('Failed to create discussion:', discError);
				return;
			}

			const newDiscussion = (discData as any)?.insert_discussion_one;
			if (newDiscussion) {
				discussionId = newDiscussion.id;
				if (newDiscussion.discussion_versions?.length > 0) {
					currentVersionId = newDiscussion.discussion_versions[0].id;
				}
				lastSavedAt = Date.now();
				console.log('Draft discussion created:', discussionId, 'version:', currentVersionId);
			}
		} catch (e) {
			console.error('Failed to create draft discussion:', e);
		}
	}

	async function autoSaveDiscussion() {
		if (!currentVersionId || !user) return;

		try {
			const { error } = await nhost.graphql.request(UPDATE_DISCUSSION_VERSION, {
				versionId: currentVersionId,
				title: title.trim() || 'Untitled Discussion',
				description: content || '',
				tags: validateTags(discussionTags),
				sections: [],
				claims: [],
				citations: styleMetadata.citations || []
			});

			if (!error) {
				lastSavedAt = Date.now();
				console.log('Discussion version auto-saved');
			}
		} catch (e) {
			console.error('Auto-save failed:', e);
		}
	}

	function scheduleAutoSave() {
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
		}
		autoSaveTimeout = setTimeout(() => {
			if (currentVersionId) {
				autoSaveDiscussion();
			} else if (user && (title.trim() || content.trim())) {
				createDraftDiscussion();
			}
		}, 1500); // Auto-save after 1.5 seconds of no typing
	}

	function onTitleInput(e: Event) {
		title = (e.target as HTMLInputElement).value;
		scheduleAutoSave();
	}

	function onContentInput(e: Event) {
		content = (e.target as HTMLTextAreaElement).value;

		// Calculate word count
		wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

		// Show citation reminder based on content and style
		const hasNoCitations = !styleMetadata.citations || styleMetadata.citations.length === 0;
		const hasSubstantialContent = wordCount >= 50; // Any meaningful content can benefit from citations
		showCitationReminder = hasSubstantialContent && hasNoCitations;

		// Update style validation using the derived selectedStyle
		styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);

		// Schedule auto-save
		scheduleAutoSave();
	}

	function addCitation(citation: Citation) {
		if (!styleMetadata.citations) {
			styleMetadata.citations = [];
		}
		styleMetadata.citations = [...styleMetadata.citations, citation];
		showCitationForm = false;

		// Update citation reminder status
		const hasSubstantialContent = wordCount >= 50;
		showCitationReminder = hasSubstantialContent && styleMetadata.citations.length === 0;

		styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
	}

	function removeCitation(id: string) {
		if (styleMetadata.citations) {
			styleMetadata.citations = styleMetadata.citations.filter((c) => c.id !== id);

			// Update citation reminder status
			const hasSubstantialContent = wordCount >= 50;
			showCitationReminder = hasSubstantialContent && styleMetadata.citations.length === 0;

			styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
		}
	}

	function showAddCitationForm() {
		showCitationForm = true;
	}

	// Tag management functions
	function addTag(tag: string) {
		const normalized = normalizeTag(tag);
		if (normalized && !discussionTags.includes(normalized) && discussionTags.length < 10) {
			discussionTags = [...discussionTags, normalized];
			newTag = '';
			showTagSuggestions = false;
		}
	}

	function removeTag(tagToRemove: string) {
		discussionTags = discussionTags.filter((tag) => tag !== tagToRemove);
	}

	function addNewTag() {
		if (newTag.trim()) {
			addTag(newTag.trim());
		}
	}

	function handleTagInput(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addNewTag();
		}
	}

	async function publishNewDiscussion() {
		publishError = null;
		goodFaithError = null;
		goodFaithResult = null;

		if (!user) {
			publishError = 'Sign in required.';
			return;
		}
		if (!title.trim()) {
			publishError = 'Title required.';
			return;
		}
		if (!content.trim()) {
			publishError = 'Content required.';
			return;
		}

		// Check if user can use analysis (credits and permissions)
		if (!contributor) {
			publishError = 'Unable to load account information. Please try again.';
			return;
		}

		if (!canUseAnalysis(contributor)) {
			if (!contributor.analysis_enabled) {
				publishError = 'Good-faith analysis has been disabled for your account. Please contact support.';
				return;
			}

			const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
			const purchasedRemaining = getPurchasedCreditsRemaining(contributor);

			if (monthlyRemaining === 0 && purchasedRemaining === 0) {
				publishError = 'You have no analysis credits remaining. Monthly credits reset at the end of the month, or you can purchase additional credits.';
				return;
			} else {
				publishError = 'Unable to proceed with analysis. Please check your credit balance.';
				return;
			}
		}

		publishing = true;
		try {
			// Good faith analysis gate - analyze BEFORE creating discussion
			goodFaithTesting = true;
			let goodFaithData;
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
						content: content,
						title: title
					})
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

				goodFaithData = {
					provider: 'claude',
					score: score01,
					label: data.good_faith_label,
					rationale: data.rationale,
					claims: data.claims || [],
					cultishPhrases: data.cultishPhrases || [],
					fallacyOverload: data.fallacyOverload || false,
					analyzedAt: new Date().toISOString()
				};

				if (score01 < GOOD_FAITH_THRESHOLD) {
					// Show analysis and prevent publication
					goodFaithResult = {
						good_faith_score: score01,
						good_faith_label: data.good_faith_label,
						rationale: data.rationale,
						claims: data.claims,
						cultishPhrases: data.cultishPhrases,
						fallacyOverload: data.fallacyOverload
					};
					publishError = `Cannot publish discussion. Good-faith score ${(score01 * 100).toFixed(0)}% is below the 70% threshold. Please improve your content and try again.`;
					return; // Stop here, don't create discussion
				}
			} catch (e: any) {
				console.warn('Good-faith analysis failed; cannot publish discussion:', e);
				goodFaithError = e?.message || 'Failed to analyze discussion for good faith.';
				publishError = 'Could not verify good-faith score. Cannot publish discussion.';
				return; // Don't create discussion when analysis fails
			} finally {
				goodFaithTesting = false;
			}

			// Only create discussion if good faith check passes
			if (!discussionId) {
				await createDraftDiscussion();
				if (!discussionId) {
					throw new Error('Failed to create discussion');
				}
			}

			// Save content to the discussion
			await autoSaveDiscussion();

			// Save the good faith analysis to the discussion version
			if (goodFaithData && currentVersionId) {
				const { error: gfErr } = await nhost.graphql.request(UPDATE_DISCUSSION_VERSION_GOOD_FAITH, {
					versionId: currentVersionId,
					score: goodFaithData.score,
					label: goodFaithData.label
				});

				if (gfErr) {
					console.error('Failed to save discussion version good-faith analysis:', gfErr);
					throw new Error('Failed to save good faith analysis');
				}
			}

			// Sync citations to Neo4j graph database
			try {
				const citationSyncResponse = await fetch('/api/syncCitations', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						discussionId,
						title,
						authorId: user.id,
						createdAt: new Date().toISOString(),
						citations: styleMetadata.citations || [],
						goodFaithScore: goodFaithData?.score
					})
				});

				if (!citationSyncResponse.ok) {
					console.warn('Failed to sync citations to Neo4j, but discussion published successfully');
				} else {
					const syncResult = await citationSyncResponse.json();
					console.log('[Neo4j] Citations synced successfully:', syncResult);
				}
			} catch (syncError) {
				console.warn('Citation sync error (non-blocking):', syncError);
				// Don't block discussion publication if Neo4j sync fails
			}

			// Publish the discussion version (change version_type from "draft" to "published" and update discussion status)
			if (!currentVersionId || !discussionId) {
				throw new Error('Missing version or discussion ID');
			}

			const { error: publishErr } = await nhost.graphql.request(PUBLISH_DISCUSSION_VERSION, {
				versionId: currentVersionId,
				discussionId: discussionId
			});

			if (publishErr) {
				console.error('Failed to publish discussion version:', publishErr);
				throw new Error('Failed to publish discussion');
			}

			// Navigate to the discussion only if everything succeeds
			goto(`/discussions/${discussionId}`);
		} catch (e: any) {
			publishError = e.message || 'Failed to publish.';
		} finally {
			publishing = false;
		}
	}

	// Check if user can use analysis (reactive)
	const canUserUseAnalysis = $derived(contributor ? canUseAnalysis(contributor) : false);
	const analysisBlockedReason = $derived(!contributor
		? 'Unable to load account information'
		: !contributor.analysis_enabled
		? 'Good-faith analysis has been disabled for your account'
		: getMonthlyCreditsRemaining(contributor) === 0 && getPurchasedCreditsRemaining(contributor) === 0
		? 'No analysis credits remaining. Monthly credits reset at the end of the month, or you can purchase additional credits.'
		: null);

	const canPublish = $derived(
		() => !!user && title.trim().length > 0 && content.trim().length > 0 && !publishing && canUserUseAnalysis
	);

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
				try {
					const didReset = await checkAndResetMonthlyCredits(
						contributor,
						process.env.HASURA_GRAPHQL_ENDPOINT || nhost.graphql.getUrl(),
						nhost.auth.getAccessToken()
					);
					if (didReset) {
						// Reload contributor data to get updated credit count
						const updatedResult = await nhost.graphql.request(GET_CONTRIBUTOR, {
							userId: user.id
						});
						if (!(updatedResult as any).error) {
							contributor = (updatedResult as any).data?.contributor_by_pk || null;
						}
					}
				} catch (resetError) {
					console.error('Error resetting monthly credits:', resetError);
				}
			}
		} catch (error) {
			console.error('Error loading contributor:', error);
			contributor = null;
		}
	}
</script>

<div class="editorial-page">
	<div class="container">
		<div class="editorial-card main-card">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					publishNewDiscussion();
				}}
			>
				<div class="form-group">
					{#if showTitleLabel}
						<label for="title" class="floating-label" transition:fade={{ duration: 200 }}>Title</label>
					{/if}
					<input
						id="title"
						type="text"
						bind:value={title}
						placeholder="Enter a clear and concise title"
						oninput={onTitleInput}
						onfocus={() => (titleFocused = true)}
						onblur={() => (titleFocused = false)}
						required
					/>
				</div>

				<div class="form-group">
					{#if showContentLabel}
						<label for="description" class="floating-label" transition:fade={{ duration: 200 }}>Content</label>
					{/if}
					<textarea
						id="description"
						bind:value={content}
						rows="8"
						placeholder="Share your thoughts... (Style will be automatically determined by length)"
						oninput={onContentInput}
						onfocus={() => (contentFocused = true)}
						onblur={() => (contentFocused = false)}
					></textarea>
					<div class="word-count">
						<span class="word-count-label">Words: {wordCount}</span>
						<span class="style-indicator">({getStyleConfig(selectedStyle).label})</span>
					</div>

					<!-- Word Count and Style Info -->
					<div class="form-group">
						<div class="writing-info">
							<div class="citation-transition-container">
								{#if !showCitationForm}
									<div
										class="citation-reminder"
										class:active={showCitationReminder}
										transition:scale={{ duration: 300, start: 0.95 }}
									>
										<div class="reminder-icon">📚</div>
										<div class="reminder-text">
											<strong>{showCitationReminder ? 'Add citations' : 'Cite your sources'}</strong>
											<span
												>{showCitationReminder
													? 'Support your claims with references for better credibility.'
													: 'Adding sources now makes it easier to reference them later.'}</span
											>
										</div>
										<button
											type="button"
											class="btn-add-citation-inline"
											onclick={() => showAddCitationForm()}
										>
											Add Citation
										</button>
									</div>
								{/if}

								<!-- Citation Form -->
								{#if showCitationForm}
									<div class="citation-form-wrapper" transition:scale={{ duration: 300, start: 0.95 }}>
										<CitationForm onAdd={addCitation} onCancel={() => (showCitationForm = false)} />
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Citations Management -->
					{#if hasCitations}
						<div class="form-group">
							<div class="citations-section">
								<div class="citations-header">
									<h3>Citations</h3>
								</div>

								<!-- Display existing citations -->
								<div class="citations-list">
									{#each styleMetadata.citations as citation}
										<div class="citation-item">
											<div class="citation-content">
												<div class="citation-title">{citation.title}</div>
												<div class="citation-details">
													{#if citation.author}<strong>{citation.author}</strong>{/if}
													{#if citation.publishDate}({citation.publishDate}){/if}
													{#if citation.publisher}. {citation.publisher}{/if}
													{#if citation.pageNumber}, p. {citation.pageNumber}{/if}
													{#if citation.accessed}. Accessed: {citation.accessed}{/if}
												</div>
												<div class="citation-point">
													<strong>Supporting:</strong>
													{citation.pointSupported}
												</div>
												<div class="citation-quote">
													<strong>Quote:</strong> "{citation.relevantQuote}"
												</div>
												<div class="citation-url">
													<a href={citation.url} target="_blank" rel="noopener">{citation.url}</a>
												</div>
											</div>
											<button
												type="button"
												class="remove-citation"
												onclick={() => removeCitation(citation.id)}>×</button
											>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/if}

					<!-- Tags Section -->
					<div class="form-group">
						<div class="tags-display">
							{#if discussionTags.length > 0}
								<div class="current-tags">
									{#each discussionTags as tag}
										<span class="tag">
											{tag}
											<button
												type="button"
												class="remove-tag"
												onclick={() => removeTag(tag)}
												aria-label="Remove tag"
											>
												×
											</button>
										</span>
									{/each}
								</div>
							{/if}
							<button type="button" class="btn-add-tags" onclick={() => (showTagModal = true)}>
								{discussionTags.length > 0 ? 'Edit Tags' : 'Add Tags'}
							</button>
						</div>
					</div>

					<!-- Style Validation -->
					{#if !styleValidation.isValid}
						<div class="style-validation-errors">
							{#each styleValidation.issues as issue}
								<div class="validation-issue">{issue}</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="autosave-indicator" aria-live="polite">
					<div class="autosave-status">
						{#if currentVersionId && lastSavedAt}
							Draft saved {new Date(lastSavedAt).toLocaleTimeString()}
						{:else if currentVersionId}
							Draft created
						{/if}
					</div>
					{#if contributor && currentVersionId}
						<div class="credit-status-inline">
							Credits: {getAnalysisLimitText()}
						</div>
					{/if}
				</div>

				{#if publishError}
					<div class="error">
						{publishError}
					</div>
				{/if}

				{#if goodFaithError}
					<div class="error">Good Faith Analysis Error: {goodFaithError}</div>
				{/if}

				{#if goodFaithTesting}
					<div class="analysis-status">
						<div class="analysis-loading">
							<AnimatedLogo size="40px" isAnimating={true} />
							<span>Analyzing content for good faith...</span>
						</div>
					</div>
				{/if}

				{#if goodFaithResult}
					<div class="analysis-results">
						<h3>Good Faith Analysis</h3>
						<div class="score-display">
							<div class="score-value {goodFaithResult.good_faith_label}">
								{(goodFaithResult.good_faith_score * 100).toFixed(0)}%
							</div>
							<div class="score-label">{goodFaithResult.good_faith_label}</div>
						</div>
						{#if goodFaithResult.rationale}
							<div class="analysis-feedback">
								<strong>Feedback:</strong>
								{goodFaithResult.rationale}
							</div>
						{/if}
						{#if goodFaithResult.claims && goodFaithResult.claims.length > 0}
							<div class="claims-analysis">
								<strong>Claims detected:</strong>
								<ul>
									{#each goodFaithResult.claims as claimObj}
										<li>{claimObj.claim}</li>
									{/each}
								</ul>
							</div>
						{/if}
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

				<div class="form-actions">
					<button class="btn-primary" type="submit" disabled={!canPublish}>
						{publishing ? 'Publishing…' : 'Publish Discussion'}
					</button>
					<button type="button" class="btn-secondary" onclick={() => goto('/')}>Cancel</button>
				</div>
			</form>
		</div>
	</div>
</div>

<!-- Tag Modal -->
{#if showTagModal}
	<div class="modal-overlay" onclick={() => (showTagModal = false)} transition:fade={{ duration: 200 }}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()} transition:fade={{ duration: 200 }}>
			<div class="modal-header">
				<h2>Topic Tags</h2>
				<button type="button" class="modal-close" onclick={() => (showTagModal = false)}>×</button>
			</div>
			<div class="modal-body">
				<div class="current-tags">
					{#each discussionTags as tag}
						<span class="tag">
							{tag}
							<button
								type="button"
								class="remove-tag"
								onclick={() => removeTag(tag)}
								aria-label="Remove tag"
							>
								×
							</button>
						</span>
					{/each}
				</div>
				<div class="tag-input-wrapper">
					<input
						id="tags-modal"
						type="text"
						bind:value={newTag}
						placeholder="Add tags to help others discover your discussion"
						onkeydown={handleTagInput}
						onfocus={() => {
							showTagSuggestions = true;
							tagsFocused = true;
						}}
						onblur={() => {
							setTimeout(() => (showTagSuggestions = false), 150);
							tagsFocused = false;
						}}
					/>
					<button type="button" class="add-tag-btn" onclick={addNewTag}>Add</button>
				</div>
				{#if showTagSuggestions}
					<div class="tag-suggestions">
						{#each COMMON_DISCUSSION_TAGS.filter((tag) => !discussionTags.includes(tag) && tag.includes(newTag.toLowerCase())) as suggestion}
							<button type="button" class="tag-suggestion" onclick={() => addTag(suggestion)}>
								{suggestion}
							</button>
						{/each}
					</div>
				{/if}
				<div class="form-hint">
					Add up to 10 topic tags to help others discover your discussion. Press Enter or click
					Add to add a tag.
				</div>
			</div>
			<div class="modal-footer">
				<button type="button" class="btn-primary" onclick={() => (showTagModal = false)}>Done</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Immersive background */
	.page-background {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: -1;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-alt)),
			color-mix(in srgb, var(--color-accent) 6%, var(--color-surface-alt)),
			var(--color-surface-alt)
		);
	}

	.floating-gradient {
		position: absolute;
		border-radius: 50%;
		filter: blur(100px);
		opacity: 0.3;
		animation: float 20s ease-in-out infinite;
	}

	.gradient-1 {
		width: 400px;
		height: 400px;
		background: radial-gradient(circle, var(--color-primary), transparent);
		top: 10%;
		right: 10%;
		animation-delay: -5s;
	}

	.gradient-2 {
		width: 300px;
		height: 300px;
		background: radial-gradient(circle, var(--color-accent), transparent);
		bottom: 20%;
		left: 15%;
		animation-delay: -10s;
	}

	.gradient-3 {
		width: 250px;
		height: 250px;
		background: radial-gradient(
			circle,
			color-mix(in srgb, var(--color-primary) 70%, var(--color-accent)),
			transparent
		);
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		animation-delay: -15s;
	}

	@keyframes float {
		0%,
		100% {
			transform: translateY(0px) rotate(0deg);
		}
		33% {
			transform: translateY(-30px) rotate(120deg);
		}
		66% {
			transform: translateY(15px) rotate(240deg);
		}
	}

	/* Glass morphism effects */
	.glass-card {
		background: color-mix(in srgb, var(--color-surface) 40%, transparent);
		backdrop-filter: blur(20px);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 24px;
		box-shadow:
			0 8px 32px color-mix(in srgb, var(--color-primary) 8%, transparent),
			0 2px 8px color-mix(in srgb, var(--color-text-primary) 4%, transparent);
		position: relative;
		overflow: hidden;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.glass-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--color-border) 50%, transparent),
			transparent
		);
	}

	.glass-card:hover {
		transform: translateY(-2px);
		box-shadow:
			0 12px 40px color-mix(in srgb, var(--color-primary) 12%, transparent),
			0 4px 12px color-mix(in srgb, var(--color-text-primary) 6%, transparent);
	}

	/* Layout */
	.container {
		min-height: 100vh;
		/* padding: clamp(1rem, 4vw, 2rem); */
		display: flex;
		justify-content: center;
		align-items: flex-start;
		position: relative;
	}

	.main-card {
		width: 100%;
		max-width: 800px;
		padding: 2rem;
		margin-top: 2rem;
	}

	.page-title {
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		font-weight: 700;
		font-family: var(--font-family-display);
		margin: 0 0 2rem 0;
		color: var(--color-text-primary);
		text-shadow: 0 2px 4px color-mix(in srgb, var(--color-text-primary) 10%, transparent);
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		position: relative;
	}

	label {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 1rem;
	}

	.floating-label {
		position: absolute;
		top: -2px;
		right: 50%;
		transform: translateX(50%) translateY(-19px);
		margin: 0;
		padding: 0 0.5rem;
		background: transparent;
		border-radius: 4px;
		font-size: 0.875rem;
		pointer-events: none;
		z-index: 1;
	}

	input[type='text'],
	textarea {
		padding: 1rem 1.25rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 16px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		font-size: 1rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		font-family: inherit;
	}

	input[type='text']:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-surface) 80%, transparent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
		transform: translateY(-1px);
	}

	textarea {
		resize: vertical;
		min-height: 200px;
		line-height: 1.6;
	}

	.autosave-indicator {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-height: 1.5rem;
		font-weight: 500;
	}

	.autosave-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.credit-status-inline {
		font-size: 0.7rem;
		color: var(--color-text-tertiary);
		opacity: 0.8;
		font-style: italic;
		font-weight: normal;
	}

	/* Custom disabled state */
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-start;
		margin-top: 1rem;
	}

	/* Writing Info and Citation Reminder */
	.writing-info {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.word-count {
		display: flex;
		align-items: center;
		align-self: flex-end;
		gap: 0.75rem;
		font-size: 0.9rem;
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 12px;
		backdrop-filter: blur(10px);
	}

	.word-count-label {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.style-indicator {
		color: var(--color-text-secondary);
		font-style: italic;
		font-weight: 500;
	}

	.citation-transition-container {
		position: relative;
		min-height: 150px;
	}

	.citation-transition-container:has(.citation-form-wrapper) {
		min-height: 800px;
	}

	@media (max-width: 768px) {
		.citation-transition-container {
			min-height: 200px;
		}

		.citation-transition-container:has(.citation-form-wrapper) {
			min-height: 1000px;
		}
	}

	.citation-reminder {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		border-radius: 20px;
		border: 1px dashed color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 30%, transparent);
		backdrop-filter: blur(15px);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.citation-reminder.active {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, #f59e0b 20%, transparent),
			color-mix(in srgb, #f59e0b 10%, transparent)
		);
		border-color: color-mix(in srgb, #f59e0b 50%, transparent);
		box-shadow: 0 8px 24px color-mix(in srgb, #f59e0b 15%, transparent);
	}

	.citation-reminder .reminder-icon {
		font-size: 1.5rem;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
	}

	.citation-reminder .reminder-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.95rem;
		color: var(--color-text-secondary);
		flex: 1;
	}

	.citation-reminder .reminder-text strong {
		font-size: 1.05rem;
		color: var(--color-text-primary);
		font-weight: 600;
	}

	.citation-reminder.active .reminder-text strong {
		color: #92400e;
	}

	/* Good Faith Analysis Styles */
	.analysis-status {
		padding: 1rem 1.5rem;
		border-radius: 16px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 15%, transparent),
			color-mix(in srgb, var(--color-accent) 10%, transparent)
		);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		margin-bottom: 1rem;
	}

	.analysis-loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-weight: 500;
		color: var(--color-text-primary);
		font-size: 0.95rem;
	}

	.analysis-results {
		padding: 1.5rem;
		border-radius: 16px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-surface) 50%, transparent),
			color-mix(in srgb, var(--color-surface-alt) 30%, transparent)
		);
		border: 1px solid var(--color-border);
		margin-bottom: 1rem;
		backdrop-filter: blur(10px);
	}

	.analysis-results h3 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.score-display {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.score-value {
		font-size: 1.5rem;
		font-weight: 700;
		padding: 0.5rem 1rem;
		border-radius: 12px;
		min-width: 80px;
		text-align: center;
	}

	.score-value.constructive {
		background: linear-gradient(135deg, #10b981, #059669);
		color: white;
	}

	.score-value.neutral {
		background: linear-gradient(135deg, #6b7280, #4b5563);
		color: white;
	}

	.score-value.questionable {
		background: linear-gradient(135deg, #f59e0b, #d97706);
		color: white;
	}

	.score-value.hostile {
		background: linear-gradient(135deg, #ef4444, #dc2626);
		color: white;
	}

	.score-label {
		font-weight: 600;
		font-size: 1rem;
		text-transform: capitalize;
		color: var(--color-text-primary);
	}

	.analysis-feedback {
		background: color-mix(in srgb, var(--color-surface) 40%, transparent);
		padding: 1rem;
		border-radius: 12px;
		border-left: 4px solid var(--color-primary);
		margin-bottom: 1rem;
		font-size: 0.95rem;
		line-height: 1.5;
	}

	.claims-analysis {
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
		padding: 1rem;
		border-radius: 12px;
		border-left: 4px solid var(--color-accent);
	}

	.claims-analysis ul {
		margin: 0.5rem 0 0 0;
		padding-left: 1.5rem;
	}

	.claims-analysis li {
		margin-bottom: 0.25rem;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.citation-reminder.active .reminder-text span {
		color: #b45309;
		font-weight: 500;
	}

	.btn-add-citation-inline {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		text-decoration: none;
	}

	.btn-add-citation-inline:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	@media (max-width: 640px) {
		.btn-add-citation-inline {
			width: 100%;
			justify-content: center;
		}

		.citation-reminder {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}
	}

	.style-validation-errors {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		border-radius: 16px;
		padding: 1rem;
		margin-top: 1rem;
		backdrop-filter: blur(10px);
	}

	.validation-issue {
		font-size: 0.9rem;
		color: #ef4444;
		font-weight: 500;
		margin-bottom: 0.5rem;
	}

	.validation-issue:last-child {
		margin-bottom: 0;
	}

	.analysis-blocked-message {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		border-radius: 16px;
		padding: 1rem;
		margin: 1rem 0;
		backdrop-filter: blur(10px);
	}

	.analysis-blocked-message .error-message {
		margin: 0 0 0.5rem 0;
		font-weight: 500;
		color: #ef4444;
	}

	.analysis-blocked-message .help-text {
		margin: 0;
		font-size: 0.9rem;
		color: color-mix(in srgb, #ef4444 80%, white);
	}

	.analysis-blocked-message .help-text a {
		color: #3b82f6;
		text-decoration: none;
	}

	.analysis-blocked-message .help-text a:hover {
		text-decoration: underline;
	}

	/* Citations Section */
	.citations-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 1.5rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
		position: relative;
	}

	.citation-form-wrapper {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1;
	}

	.citations-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.citations-header h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		letter-spacing: -0.01em;
	}

	.citations-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.citation-item {
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 1.25rem;
		position: relative;
		transition: box-shadow 0.2s ease;
		border-left: 3px solid var(--color-primary);
	}

	.citation-item:hover {
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
	}

	.citation-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-right: 2rem;
	}

	.citation-title {
		font-weight: 600;
		color: var(--color-text-primary);
		line-height: 1.4;
		font-size: 1rem;
	}

	.citation-details {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.citation-point,
	.citation-quote {
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.citation-quote {
		font-style: italic;
		padding: 0.75rem 1rem;
		margin: 0.5rem 0;
		background: var(--color-surface);
		border-left: 3px solid var(--color-primary);
		border-radius: 0 4px 4px 0;
		font-family: var(--font-family-serif);
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.citation-url {
		font-size: 0.85rem;
	}

	.citation-url a {
		color: var(--color-primary);
		text-decoration: none;
		word-break: break-all;
		font-weight: 500;
		transition: color 0.3s ease;
	}

	.citation-url a:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.remove-citation {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		width: 32px;
		height: 32px;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.remove-citation:hover {
		background: var(--color-danger);
		color: white;
		border-color: var(--color-danger);
	}

	/* Mobile responsiveness */
	@media (max-width: 768px) {
		.main-card {
			padding: 1.5rem;
			margin-top: 1rem;
		}

		.form-actions {
			flex-direction: column;
		}

		.btn-primary,
		.btn-secondary {
			width: 100%;
			text-align: center;
		}

		.citation-content {
			padding-right: 2.5rem;
		}
	}

	@media (max-width: 480px) {
		.container {
			padding: 1rem;
		}

		.main-card {
			padding: 1rem;
			border-radius: 20px;
		}

		.citations-section {
			padding: 1rem;
		}

		.citation-item {
			padding: 1rem;
		}
	}

	/* Tags styling */
	.tags-input-container {
		position: relative;
	}

	.current-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 0.5rem 0.75rem;
		border-radius: 20px;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.remove-tag {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		margin: 0;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s ease;
		opacity: 0.7;
	}

	.remove-tag:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.tag-input-wrapper {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.tag-input-wrapper input {
		flex: 1;
	}

	.add-tag-btn {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 0.75rem 1rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.add-tag-btn:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.tag-suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--color-surface);
		backdrop-filter: blur(20px);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		box-shadow: 0 8px 24px color-mix(in srgb, var(--color-text-primary) 20%, transparent);
		z-index: 10;
		max-height: 200px;
		overflow-y: auto;
		margin-top: 0.25rem;
	}

	.tag-suggestion {
		display: block;
		width: 100%;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		text-align: left;
		font-size: 0.9rem;
		color: var(--color-text-primary);
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.tag-suggestion:hover {
		background: var(--color-surface-alt);
	}

	.tag-suggestion:first-child {
		border-radius: 8px 8px 0 0;
	}

	.tag-suggestion:last-child {
		border-radius: 0 0 8px 8px;
	}

	.form-hint {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		margin-top: 0.5rem;
		line-height: 1.4;
	}

	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: color-mix(in srgb, var(--color-text-primary) 50%, transparent);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	@media (max-width: 768px) {
		.modal-overlay {
			align-items: flex-start;
			padding: 0;
		}

		.modal-content {
			border-radius: 0;
			max-height: 100vh;
			min-height: 100vh;
		}
	}

	.modal-content {
		background: #fafafa;
		border: 1px solid var(--color-border);
		border-radius: 16px;
		max-width: 600px;
		width: 100%;
		max-height: 80vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px color-mix(in srgb, var(--color-text-primary) 30%, transparent);
	}

	:global([data-theme='dark']) .modal-content {
		background: #1a1a1a;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 2rem;
		line-height: 1;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.modal-close:hover {
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
		min-height: 300px;
	}

	.modal-body .current-tags {
		min-height: 3rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.modal-footer {
		padding: 1.5rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
	}

	.tags-display {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.btn-add-tags {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		width: 100%;
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-add-tags:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.modal-body .tag-input-wrapper {
		margin-top: 1rem;
	}

	.modal-body .tag-suggestions {
		position: relative;
		margin-top: 0.5rem;
		min-height: 150px;
		max-height: 200px;
	}

	.modal-body .tag-input-wrapper {
		position: relative;
	}
</style>
