<script lang="ts">
	import { scale, slide } from 'svelte/transition';
	import PostTypeSelector from './PostTypeSelector.svelte';
	import CitationForm from '../citations/CitationForm.svelte';
	import Button from '../ui/Button.svelte';
	import RichTextEditor from '../RichTextEditor.svelte';
	import CollaboratorInviteButton from '../CollaboratorInviteButton.svelte';
	import CollaborationControls from '../CollaborationControls.svelte';
	import { nhost } from '$lib/nhostClient';
	import {
		GET_EDIT_LOCK_STATUS,
		ACQUIRE_EDIT_LOCK,
		RELEASE_EDIT_LOCK,
		TOGGLE_COLLABORATION,
		SUBSCRIBE_TO_DRAFT_UPDATES,
		SUBSCRIBE_TO_EDIT_LOCK_STATUS
	} from '$lib/graphql/queries';
	import { apolloClient } from '$lib/apolloClient';
	import type { ObservableSubscription } from '@apollo/client';

	type Citation = {
		id: string;
		title: string;
		url: string;
		author?: string;
		publisher?: string;
		publish_date?: string;
		accessed_date?: string;
		page_number?: string;
		point_supported: string;
		relevant_quote: string;
	};

	type StyleMetadata = {
		citations?: Citation[];
	};

	type PostType = 'response' | 'counter_argument' | 'supporting_evidence' | 'question';

	type ReplyingToPost = {
		id: string;
		contributor?: {
			display_name?: string;
		};
	};

	type GoodFaithAnalysis = {
		good_faith_score: number;
		good_faith_label: string;
		good_faith_last_evaluated: string;
		good_faith_analysis?: {
			claims?: Array<{
				claim: string;
				supportingArguments?: Array<{
					argument: string;
					score: number;
					fallacies?: string[];
					improvements?: string;
				}>;
			}>;
			cultishPhrases?: string[];
			overallAnalysis?: string;
			summary?: string;
			rationale?: string;
		};
	};

	type CommentGoodFaithResult = {
		good_faith_score: number;
		good_faith_label: string;
		claims?: Array<{
			claim: string;
			supportingArguments?: Array<{
				argument: string;
				score: number;
				fallacies?: string[];
				improvements?: string;
			}>;
		}>;
		cultishPhrases?: string[];
		rationale?: string;
	};

	let {
		user,
		expanded = $bindable(false),
		comment = $bindable(''),
		postType = $bindable<PostType>('response'),
		postTypeExpanded = $bindable(false),
		showAdvancedFeatures = $bindable(false),
		wordCount = 0,
		selectedStyle = 'quick_point',
		styleMetadata = $bindable<StyleMetadata>({ citations: [] }),
		showCitationForm = $bindable(false),
		showCitationEditForm = $bindable(false),
		editingCitation = $bindable<Citation | null>(null),
		showCitationReminder = false,
		showCitationPicker = $bindable(false),
		heuristicScore = 0,
		heuristicPassed = true,
		draftPostId = null,
		draftGoodFaithAnalysis = null as GoodFaithAnalysis | null,
		draftAnalysisExpanded = $bindable(false),
		goodFaithResult = null as CommentGoodFaithResult | null,
		goodFaithError = null as string | null,
		submitError = null as string | null,
		hasPending = false,
		lastSavedAt = null as number | null,
		contributor = null,
		replyingToPost = null as ReplyingToPost | null,
		analysisBlockedReason = null as string | null,
		canUserUseAnalysis = true,
		submitting = false,
		onInput,
		onFocus,
		onAddCitation,
		onUpdateCitation,
		onCancelCitationEdit,
		onInsertCitationReference,
		onOpenCitationPicker,
		onPublish,
		onClearReplying,
		getStyleConfig,
		getPostTypeConfig,
		getAnalysisLimitText,
		formatChicagoCitation,
		assessContentQuality
	} = $props<{
		user: any;
		expanded?: boolean;
		comment?: string;
		postType?: PostType;
		postTypeExpanded?: boolean;
		showAdvancedFeatures?: boolean;
		wordCount?: number;
		selectedStyle?: string;
		styleMetadata?: StyleMetadata;
		showCitationForm?: boolean;
		showCitationEditForm?: boolean;
		editingCitation?: Citation | null;
		showCitationReminder?: boolean;
		showCitationPicker?: boolean;
		heuristicScore?: number;
		heuristicPassed?: boolean;
		draftPostId?: string | null;
		draftGoodFaithAnalysis?: GoodFaithAnalysis | null;
		draftAnalysisExpanded?: boolean;
		goodFaithResult?: CommentGoodFaithResult | null;
		goodFaithError?: string | null;
		submitError?: string | null;
		hasPending?: boolean;
		lastSavedAt?: number | null;
		contributor?: any;
		replyingToPost?: ReplyingToPost | null;
		analysisBlockedReason?: string | null;
		canUserUseAnalysis?: boolean;
		submitting?: boolean;
		onInput?: (e: Event) => void;
		onFocus?: () => void;
		onAddCitation?: (citation: Citation) => void;
		onUpdateCitation?: (citation: Citation) => void;
		onCancelCitationEdit?: () => void;
		onInsertCitationReference?: (id: string) => void;
		onOpenCitationPicker?: () => void;
		onPublish?: () => void;
		onClearReplying?: () => void;
		getStyleConfig: (style: string) => { label: string };
		getPostTypeConfig: (type: PostType) => { icon: string; label: string; description: string };
		getAnalysisLimitText: () => string;
		formatChicagoCitation: (citation: Citation) => string;
		assessContentQuality: (content: string, title?: string) => { score: number; issues: string[] };
	}>();

	// Edit Lock Collaboration State
	let editLockStatus = $state<any>(null);
	let isLoadingLock = $state(false);
	let lockError = $state<string | null>(null);
	let draftUpdateSubscription: ObservableSubscription | null = null;
	let lockStatusSubscription: ObservableSubscription | null = null;

	// Derived state
	const isAuthor = $derived(draftPostId && user?.id && editLockStatus?.author_id === user.id);

	const isCoAuthor = $derived(
		editLockStatus?.post_collaborators?.some(
			(pc: any) => pc.contributor.id === user?.id && pc.role === 'co-author'
		) || false
	);

	const canEdit = $derived(
		!editLockStatus ||
			isAuthor ||
			(editLockStatus.current_editor_id === user?.id && editLockStatus.collaboration_enabled)
	);

	const isReadOnly = $derived(
		editLockStatus &&
			!isAuthor &&
			editLockStatus.current_editor_id !== user?.id &&
			editLockStatus.collaboration_enabled
	);

	// Function to load edit lock status
	async function loadEditLockStatus() {
		if (!draftPostId || !user?.id) {
			editLockStatus = null;
			return;
		}

		try {
			const result = await nhost.graphql.request(GET_EDIT_LOCK_STATUS, {
				postId: draftPostId
			});

			if (result.error) {
				console.error('Error loading edit lock status:', result.error);
				return;
			}

			editLockStatus = result.data?.post_by_pk;
		} catch (error) {
			console.error('Error loading edit lock status:', error);
		}
	}

	// Load edit lock status when draft is created
	$effect(() => {
		if (typeof window === 'undefined') return;
		loadEditLockStatus();
	});

	// Subscribe to draft updates for real-time content changes
	$effect(() => {
		if (typeof window === 'undefined' || !draftPostId) return;

		// Clean up previous subscription
		if (draftUpdateSubscription) {
			draftUpdateSubscription.unsubscribe();
		}

		draftUpdateSubscription = apolloClient
			.subscribe({
				query: SUBSCRIBE_TO_DRAFT_UPDATES,
				variables: { postId: draftPostId }
			})
			.subscribe({
				next: (result: any) => {
					if (result.data?.post_by_pk) {
						const updatedPost = result.data.post_by_pk;

						// Only update content if someone else is editing
						if (updatedPost.current_editor_id && updatedPost.current_editor_id !== user?.id) {
							comment = updatedPost.draft_content || '';
							console.log('Draft updated by another user');
						}
					}
				},
				error: (error: any) => {
					console.error('Draft update subscription error:', error);
				}
			});

		return () => {
			if (draftUpdateSubscription) {
				draftUpdateSubscription.unsubscribe();
			}
		};
	});

	// Subscribe to edit lock status changes
	$effect(() => {
		if (typeof window === 'undefined' || !draftPostId) return;

		// Clean up previous subscription
		if (lockStatusSubscription) {
			lockStatusSubscription.unsubscribe();
		}

		lockStatusSubscription = apolloClient
			.subscribe({
				query: SUBSCRIBE_TO_EDIT_LOCK_STATUS,
				variables: { postId: draftPostId }
			})
			.subscribe({
				next: (result: any) => {
					console.log('[Subscription] Edit lock status update:', result.data?.post_by_pk);
					if (result.data?.post_by_pk) {
						// Force reactivity by creating a new object
						editLockStatus = { ...result.data.post_by_pk };
						console.log('[Subscription] Updated editLockStatus:', editLockStatus);
					}
				},
				error: (error: any) => {
					console.error('Lock status subscription error:', error);
				}
			});

		return () => {
			if (lockStatusSubscription) {
				lockStatusSubscription.unsubscribe();
			}
		};
	});

	// Handle acquiring edit lock
	async function handleAcquireEditLock() {
		if (!draftPostId || !user?.id) return;

		isLoadingLock = true;
		lockError = null;

		try {
			const result = await nhost.graphql.request(ACQUIRE_EDIT_LOCK, {
				postId: draftPostId,
				userId: user.id,
				now: new Date().toISOString()
			});

			if (result.error) {
				console.error('Error acquiring edit lock:', result.error);
				lockError = 'Failed to acquire edit control';
				return;
			}

			// Check if mutation succeeded (direct mutation returns post object, not success/error)
			if (!result.data?.update_post_by_pk) {
				lockError = 'Failed to acquire edit control';
			}
		} catch (error) {
			console.error('Error acquiring edit lock:', error);
			lockError = 'Failed to acquire edit control';
		} finally {
			isLoadingLock = false;
		}
	}

	// Handle releasing edit lock
	async function handleReleaseEditLock() {
		if (!draftPostId || !user?.id) return;

		isLoadingLock = true;
		lockError = null;

		try {
			const result = await nhost.graphql.request(RELEASE_EDIT_LOCK, {
				postId: draftPostId,
				userId: user.id
			});

			if (result.error) {
				console.error('Error releasing edit lock:', result.error);
				lockError = 'Failed to release edit control';
				return;
			}

			// Check if mutation succeeded
			if (!result.data?.update_post_by_pk) {
				lockError = 'Failed to release edit control';
			}
		} catch (error) {
			console.error('Error releasing edit lock:', error);
			lockError = 'Failed to release edit control';
		} finally {
			isLoadingLock = false;
		}
	}

	// Handle toggling collaboration (author only)
	async function handleToggleCollaboration(enabled: boolean) {
		if (!draftPostId || !user?.id || !isAuthor) return;

		isLoadingLock = true;
		lockError = null;

		try {
			const result = await nhost.graphql.request(TOGGLE_COLLABORATION, {
				postId: draftPostId,
				enabled
			});

			if (result.error) {
				console.error('Error toggling collaboration:', result.error);
				lockError = 'Failed to toggle collaboration';
				return;
			}

			// Check if mutation succeeded
			if (!result.data?.update_post_by_pk) {
				lockError = 'Failed to toggle collaboration';
			}
		} catch (error) {
			console.error('Error toggling collaboration:', error);
			lockError = 'Failed to toggle collaboration';
		} finally {
			isLoadingLock = false;
		}
	}
</script>

<section class="add-comment">
	{#if !user}
		<p class="signin-hint">Please sign in to participate.</p>
	{:else if !expanded}
		<button class="leave-comment-btn" onclick={() => (expanded = true)}>💬 Leave a Comment</button>
	{:else}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				onPublish?.();
			}}
			class="comment-form"
		>
			<!-- Post Type Selection and Advanced Features Toggle -->
			<div class="post-type-row">
				<PostTypeSelector bind:selected={postType} bind:expanded={postTypeExpanded} />

				{#if !postTypeExpanded}
					<button
						type="button"
						class="toggle-advanced-btn"
						onclick={() => (showAdvancedFeatures = !showAdvancedFeatures)}
					>
						{#if showAdvancedFeatures}
							▲ Hide Citations & Analysis
						{:else}
							▼ Show Citations & Analysis
						{/if}
					</button>
				{/if}
			</div>

			<!-- Citations & Analysis Section -->
			{#if showAdvancedFeatures && !postTypeExpanded}
				<div class="comment-writing-info" transition:scale={{ duration: 200 }}>
					<div class="word-count">
						<span class="word-count-label">Words: {wordCount}</span>
						<span class="style-indicator">({getStyleConfig(selectedStyle).label})</span>
					</div>

					{#if !showCitationForm && !showCitationEditForm}
						<div
							class="citation-reminder"
							class:active={showCitationReminder}
							transition:scale={{ duration: 200 }}
						>
							<div class="reminder-icon">📚</div>
							<div class="reminder-text">
								<strong>{showCitationReminder ? 'Add citations' : 'Cite your sources'}</strong>
								<span>
									{showCitationReminder
										? 'Support your claims with references for better credibility.'
										: 'Adding sources now makes it easier to reference them later.'}
								</span>
							</div>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onclick={() => (showCitationForm = true)}
							>
								Add Citation
							</Button>
						</div>
					{:else}
						<div class="citation-section-inline" transition:scale={{ duration: 200 }}>
							<div class="citation-header">
								<h4>Add Reference</h4>
							</div>

							{#if showCitationForm && !editingCitation}
								<CitationForm onAdd={onAddCitation} onCancel={() => (showCitationForm = false)} />
							{/if}

							{#if showCitationEditForm && editingCitation}
								<CitationForm
									editingItem={editingCitation}
									onAdd={onUpdateCitation}
									onCancel={onCancelCitationEdit}
								/>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Collaboration Controls -->
			{#if draftPostId && editLockStatus && user?.id}
				<CollaborationControls
					lockStatus={editLockStatus}
					currentUserId={user.id}
					{isAuthor}
					postId={draftPostId}
					onAcquireLock={handleAcquireEditLock}
					onReleaseLock={handleReleaseEditLock}
					onToggleCollaboration={handleToggleCollaboration}
					onUpdate={loadEditLockStatus}
					isLoading={isLoadingLock}
				/>
			{/if}

			{#if lockError}
				<div class="lock-error">
					<p>{lockError}</p>
				</div>
			{/if}

			{#if canEdit}
				<!-- Rich Text Editor (only for active editor) -->
				<RichTextEditor
					bind:content={comment}
					onUpdate={(html) => {
						comment = html;
						// Create a synthetic event for onInput handler
						if (onInput) {
							const syntheticEvent = {
								target: { value: html }
							} as Event;
							onInput(syntheticEvent);
						}
					}}
					placeholder="Add your comment... (Style will be automatically determined by length)"
					minHeight="300px"
					readonly={false}
				/>
			{:else if isReadOnly}
				<!-- Read-only preview for viewers -->
				<div class="draft-preview">
					<div class="preview-label">
						<span>Draft Preview (Read-only)</span>
					</div>
					<div class="preview-content">
						{@html comment}
					</div>
				</div>
			{/if}

			{#if showAdvancedFeatures}
				<!-- Insert Citation Reference Button -->
				<button type="button" class="insert-citation-btn" onclick={onOpenCitationPicker}>
					📎 Insert Citation Reference
				</button>

				<!-- Citation Picker Modal -->
				{#if showCitationPicker}
					{@const allCitations = styleMetadata.citations || []}
					<div class="citation-picker-overlay">
						<div class="citation-picker-modal">
							<div class="citation-picker-header">
								<h4>Insert Citation Reference</h4>
								<button type="button" class="close-btn" onclick={() => (showCitationPicker = false)}
									>✕</button
								>
							</div>
							<div class="citation-picker-content">
								<p>Click on a reference below to insert it at your cursor position:</p>
								<div class="picker-references-list">
									{#each allCitations as item, index}
										<button
											type="button"
											class="picker-reference-item"
											onclick={() => {
												onInsertCitationReference?.(item.id);
												showCitationPicker = false;
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

			<!-- Heuristic Quality Assessment -->
			{#if comment.trim().length > 0 || draftPostId}
				{#if heuristicScore < 50}
					{@const assessment = assessContentQuality(comment)}
					<div class="heuristic-quality-indicator">
						<h5>Comment Quality: {heuristicScore}% (50% required)</h5>
						<div class="quality-progress">
							<div class="quality-bar" style="width: {heuristicScore}%"></div>
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
				{:else if heuristicScore > 0}
					<div class="heuristic-quality-indicator passed">
						<h5>✅ Comment Quality: {heuristicScore}% - Ready for analysis and publishing</h5>
						<div class="quality-progress">
							<div class="quality-bar passed" style="width: {heuristicScore}%"></div>
						</div>
					</div>
				{/if}
			{/if}

			<!-- Existing Draft Good-Faith Analysis -->
			{#if draftGoodFaithAnalysis && !goodFaithResult}
				<div class="draft-good-faith-analysis good-faith-result claude-result">
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
								<small>
									<em>
										This analysis was performed on a previous version of your draft. The score may
										change if you edit and republish.
									</em>
								</small>
							</div>

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

							{#if draftGoodFaithAnalysis.good_faith_analysis?.cultishPhrases && draftGoodFaithAnalysis.good_faith_analysis.cultishPhrases.length > 0}
								<div class="cultish-phrases">
									<strong>Manipulative Language:</strong>
									{draftGoodFaithAnalysis.good_faith_analysis.cultishPhrases.join(', ')}
								</div>
							{/if}

							{#if draftGoodFaithAnalysis.good_faith_analysis?.overallAnalysis || draftGoodFaithAnalysis.good_faith_analysis?.summary || draftGoodFaithAnalysis.good_faith_analysis?.rationale}
								<div class="good-faith-rationale">
									<strong>Analysis:</strong>
									{draftGoodFaithAnalysis.good_faith_analysis.overallAnalysis ||
										draftGoodFaithAnalysis.good_faith_analysis.summary ||
										draftGoodFaithAnalysis.good_faith_analysis.rationale}
								</div>
							{/if}

							<div class="analysis-date" style="margin-top: 1rem; text-align: right;">
								<small>
									Analyzed: {new Date(
										draftGoodFaithAnalysis.good_faith_last_evaluated
									).toLocaleString()}
								</small>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Comment Good-Faith Result -->
			{#if goodFaithResult}
				<div class="good-faith-result claude-result">
					<div class="good-faith-header">
						<h4>Comment Analysis</h4>
						<div class="good-faith-score">
							<span class="score-value">{(goodFaithResult.good_faith_score * 100).toFixed(0)}%</span
							>
							<span class="score-label {goodFaithResult.good_faith_label}"
								>{goodFaithResult.good_faith_label}</span
							>
						</div>
					</div>

					{#if goodFaithResult.claims && goodFaithResult.claims.length > 0}
						<div class="claude-claims">
							<strong>Claims Analysis:</strong>
							{#each goodFaithResult.claims as claim}
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

					{#if goodFaithResult.cultishPhrases && goodFaithResult.cultishPhrases.length > 0}
						<div class="cultish-phrases">
							<strong>Manipulative Language:</strong>
							{goodFaithResult.cultishPhrases.join(', ')}
						</div>
					{/if}

					<div class="good-faith-rationale">
						<strong>Analysis:</strong>
						{goodFaithResult.rationale}
					</div>
				</div>
			{/if}

			{#if goodFaithError}
				<div class="good-faith-error">
					<strong>Analysis Error:</strong>
					{goodFaithError}
				</div>
			{/if}

			{#if submitError}
				<p class="error-message">{submitError}</p>
			{/if}

			<!-- Comment Actions -->
			<div class="comment-actions">
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

				{#if draftPostId && user?.id}
					<CollaboratorInviteButton postId={draftPostId} ownerId={user.id} />
				{/if}

				{#if replyingToPost}
					<div class="replying-indicator">
						Replying to <a href={`#post-${replyingToPost.id}`}
							>@{replyingToPost.contributor?.display_name || 'comment'}</a
						>
						<button type="button" class="btn-link" onclick={onClearReplying}>Cancel</button>
					</div>
				{/if}

				{#if !canUserUseAnalysis && analysisBlockedReason}
					<div class="analysis-blocked-message">
						<p class="error-message">{analysisBlockedReason}</p>
						{#if analysisBlockedReason.includes('disabled')}
							<p class="help-text">Contact support for assistance.</p>
						{:else if analysisBlockedReason.includes('credits')}
							<p class="help-text">
								Check your <a href="/profile">profile page</a> for credit information.
							</p>
						{/if}
					</div>
				{/if}

				<button
					type="submit"
					class="btn-secondary"
					disabled={submitting || !comment.trim() || !heuristicPassed}
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

<style>
	.add-comment {
		margin-top: 2rem;
	}

	.signin-hint {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.leave-comment-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: 3px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		margin: 0 auto;
		min-width: 200px;
		justify-content: center;
		font-family: inherit;
		letter-spacing: 0.025em;
	}

	.leave-comment-btn:hover {
		border-color: var(--color-primary);
		background: var(--color-surface-alt);
	}

	.comment-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.post-type-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.post-type-row :global(.post-type-selector) {
		flex: 1;
		min-width: 200px;
	}

	.toggle-advanced-btn {
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.toggle-advanced-btn:hover {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		color: var(--color-primary);
	}

	.comment-writing-info {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border);
	}

	.word-count {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.word-count-label {
		font-weight: 600;
	}

	.style-indicator {
		font-style: italic;
	}

	.citation-reminder {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
	}

	.citation-reminder.active {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
	}

	.reminder-icon {
		font-size: 1.5rem;
	}

	.reminder-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.reminder-text strong {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.reminder-text span {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.citation-section-inline {
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
	}

	.citation-header {
		margin-bottom: 1rem;
	}

	.citation-header h4 {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text-primary);
	}

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
		align-self: flex-start;
	}

	.insert-citation-btn:hover {
		opacity: 0.8;
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

	/* Quality Indicator */
	.heuristic-quality-indicator {
		padding: 1rem;
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
	}

	.heuristic-quality-indicator.passed {
		border-color: #10b981;
		background: color-mix(in srgb, #10b981 5%, var(--color-surface-alt));
	}

	.heuristic-quality-indicator h5 {
		margin: 0 0 0.5rem 0;
		font-size: 0.9rem;
		color: var(--color-text-primary);
	}

	.quality-progress {
		height: 8px;
		background: var(--color-surface);
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.quality-bar {
		height: 100%;
		background: #ef4444;
		transition: width 0.3s ease;
	}

	.quality-bar.passed {
		background: #10b981;
	}

	.quality-issues {
		margin: 0.5rem 0 0 0;
		padding-left: 1.5rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.quality-note {
		margin: 0.5rem 0 0 0;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	/* Good Faith Analysis */
	.draft-good-faith-analysis,
	.good-faith-result {
		padding: 1rem;
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		border-left: 4px solid var(--color-primary);
	}

	.claude-result {
		border-left-color: #d97706;
	}

	.collapsible-header {
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}

	.good-faith-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-content h4 {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text-primary);
	}

	.expand-icon {
		transition: transform 0.2s ease;
	}

	.expand-icon.expanded {
		transform: rotate(180deg);
	}

	.good-faith-score {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.score-value {
		font-weight: 600;
		font-size: 1.1rem;
		color: var(--color-text-primary);
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

	.analysis-content {
		margin-top: 1rem;
	}

	.analysis-note {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.claude-claims {
		margin: 0.75rem 0;
		font-size: 0.9rem;
	}

	.claim-item {
		margin: 0.75rem 0;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
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

	.cultish-phrases {
		margin: 0.75rem 0;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, #dc2626 5%, var(--color-surface-alt));
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
		color: #dc2626;
	}

	.error-message {
		color: #ef4444;
		font-size: 0.875rem;
	}

	.analysis-blocked-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		padding: 12px;
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

	.lock-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: var(--border-radius-md);
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
	}

	.lock-error p {
		color: #dc2626;
		font-size: 0.875rem;
		margin: 0;
	}

	/* Comment Actions */
	.comment-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.4rem;
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

	.replying-indicator {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.replying-indicator a {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 600;
	}

	.replying-indicator a:hover {
		text-decoration: underline;
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--color-primary);
		cursor: pointer;
		font-size: 0.875rem;
		text-decoration: underline;
		margin-left: 0.5rem;
	}

	.btn-link:hover {
		opacity: 0.8;
	}

	.btn-primary {
		background: var(--color-primary);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 1rem;
		transition: all 0.2s ease;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-accent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Draft Preview Styles */
	.draft-preview {
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-background-secondary);
		overflow: hidden;
	}

	.preview-label {
		padding: 0.5rem 1rem;
		background: var(--color-background-tertiary);
		border-bottom: 1px solid var(--color-border);
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.preview-content {
		padding: 1.5rem;
		min-height: 300px;
		color: var(--color-text);
		line-height: 1.6;
	}

	.preview-content :global(p) {
		margin-bottom: 1em;
	}

	.preview-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.preview-content :global(strong) {
		font-weight: 600;
	}

	.preview-content :global(em) {
		font-style: italic;
	}

	.preview-content :global(a) {
		color: var(--color-primary);
		text-decoration: underline;
	}
</style>
