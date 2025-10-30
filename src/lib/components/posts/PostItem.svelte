<script lang="ts">
	import { scale } from 'svelte/transition';
	import GoodFaithBadge from '../ui/GoodFaithBadge.svelte';
	import SaveButton from '../SaveButton.svelte';
	import SteelmanBadge from '../SteelmanBadge.svelte';

	type Contributor = {
		id: string;
		handle?: string;
		display_name?: string | null;
	};

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

	type ReplyReference = {
		post_id: string;
		snapshot?: {
			content: string;
		};
	};

	type Post = {
		id: string;
		content: string;
		created_at: string;
		is_anonymous: boolean;
		contributor: Contributor;
		writing_style?: string | null;
		context_version_id?: string | null;
		good_faith_score?: number | null;
		good_faith_label?: string | null;
		style_metadata?: StyleMetadata | null;
		steelman_score?: number | null;
		steelman_quality_notes?: string | null;
		understanding_score?: number | null;
		intellectual_humility_score?: number | null;
	};

	type HistoricalVersion = {
		id: string;
		version_number: number;
		title: string;
		description: string;
		created_at: string;
	};

	let {
		post,
		isOwner = false,
		canDelete = true,
		isEditing = false,
		editContent = '',
		editError = null,
		editSaving = false,
		showGoodFaithModal = false,
		showHistoricalContext = false,
		historicalVersion = null,
		versionLoading = false,
		versionError = null,
		onReply,
		onEdit,
		onSaveEdit,
		onCancelEdit,
		onDelete,
		onAnonymize,
		onUnanonymize,
		onToggleGoodFaith,
		onToggleContext,
		displayName,
		extractReplyRef,
		extractCitationData,
		processCitationReferences,
		ensureIdsForCitationData,
		formatChicagoCitation,
		getStyleConfig
	} = $props<{
		post: Post;
		isOwner?: boolean;
		canDelete?: boolean;
		isEditing?: boolean;
		editContent?: string;
		editError?: string | null;
		editSaving?: boolean;
		showGoodFaithModal?: boolean;
		showHistoricalContext?: boolean;
		historicalVersion?: HistoricalVersion | null;
		versionLoading?: boolean;
		versionError?: string | null;
		onReply?: (post: Post) => void;
		onEdit?: (post: Post) => void;
		onSaveEdit?: (post: Post) => void;
		onCancelEdit?: () => void;
		onDelete?: (post: Post) => void;
		onAnonymize?: (post: Post) => void;
		onUnanonymize?: (post: Post) => void;
		onToggleGoodFaith?: (postId: string) => void;
		onToggleContext?: (postId: string, versionId: string | null) => void;
		displayName: (name: string | null | undefined) => string;
		extractReplyRef: (content: string) => { cleanContent: string; replyRef: ReplyReference | null };
		extractCitationData: (
			content: string
		) => { cleanContent: string; citationData: { style_metadata?: StyleMetadata } | null };
		processCitationReferences: (content: string, citations: Citation[]) => string;
		ensureIdsForCitationData: (metadata: StyleMetadata) => StyleMetadata;
		formatChicagoCitation: (citation: Citation) => string;
		getStyleConfig: (style: string) => { label: string };
	}>();
</script>

<div
	id={`post-${post.id}`}
	class="post-card"
	class:journalistic-post={post.writing_style === 'journalistic'}
	class:academic-post={post.writing_style === 'academic'}
>
	<!-- Post Meta Header -->
	<div class="post-meta">
		<strong>
			{#if post.is_anonymous}
				<span class="anonymous-author">Anonymous</span>
			{:else}
				<a href={`/u/${post.contributor.handle || post.contributor.id}`}
					>{displayName(post.contributor.display_name)}</a
				>
			{/if}
		</strong>
		<span>&middot;</span>
		<time>{new Date(post.created_at).toLocaleString()}</time>
		<span class="spacer"></span>

		<!-- Action Buttons -->
		<SaveButton postId={post.id} size="small" />
		{#if onReply}
			<button
				type="button"
				class="reply-post-btn"
				onclick={() => onReply?.(post)}
				title="Reply to this comment">↳</button
			>
		{/if}

		{#if isOwner}
			{#if onEdit}
				<button type="button" class="edit-post-btn" onclick={() => onEdit?.(post)} title="Edit post"
					>✎</button
				>
			{/if}
			{#if post.is_anonymous}
				{#if onUnanonymize}
					<button
						type="button"
						class="reveal-identity-btn"
						onclick={() => onUnanonymize?.(post)}
						title="Reveal your identity"
					>
						Reveal Identity
					</button>
				{/if}
			{:else if onDelete || onAnonymize}
				<button
					type="button"
					class="delete-post-btn"
					onclick={() => (canDelete ? onDelete?.(post) : onAnonymize?.(post))}
					title={canDelete ? 'Delete post' : 'Make anonymous - cannot delete'}
				>
					{canDelete ? 'Delete' : '👻'}
				</button>
			{/if}
		{/if}
	</div>

	{#if isEditing}
		<!-- Edit Mode -->
		<div class="post-edit-block">
			<textarea id="post-edit-textarea" rows="10" bind:value={editContent}></textarea>
			{#if editError}
				<div class="error-message" style="margin-top:0.25rem;">
					{editError}
				</div>
			{/if}
			<div class="post-edit-actions">
				<button type="button" class="btn-secondary" onclick={onCancelEdit} disabled={editSaving}
					>Cancel</button
				>
				<button
					type="button"
					class="btn-primary"
					onclick={() => onSaveEdit?.(post)}
					disabled={editSaving || !editContent.trim()}
				>
					{editSaving ? 'Saving…' : 'Save Changes'}
				</button>
			</div>
		</div>
	{:else}
		<!-- Display Mode -->
		{@const { cleanContent: withoutReply, replyRef } = extractReplyRef(post.content)}
		{@const { cleanContent, citationData } = extractCitationData(withoutReply)}
		{@const allPostCitations = citationData?.style_metadata?.citations || []}
		{@const processedPostContent = processCitationReferences(cleanContent, allPostCitations)}

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

		<!-- Display citations if they exist -->
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
											{item.point_supported}
										</div>
										<div class="citation-quote">
											<strong>Quote:</strong> "{item.relevant_quote}"
										</div>
									</div>
								</details>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Inline Historical Context Display -->
		{#if showHistoricalContext && post.context_version_id}
			<div class="historical-context-inline" transition:scale={{ duration: 300, start: 0.95 }}>
				{#if versionLoading}
					<div class="context-loading">
						<span class="loading-spinner">⟳</span> Loading original context...
					</div>
				{:else if versionError}
					<div class="context-error">
						<strong>Error:</strong>
						{versionError}
					</div>
				{:else if historicalVersion}
					<div class="context-header">
						<span class="context-label"
							>📚 Original Context (Version #{historicalVersion.version_number})</span
						>
						<button
							type="button"
							class="context-close-btn"
							onclick={() => onToggleContext?.(post.id, post.context_version_id || null)}
						>
							✕
						</button>
					</div>
					<div class="context-content">
						<h4 class="context-title">{historicalVersion.title}</h4>
						<div class="context-description">
							{@html historicalVersion.description.replace(/\n/g, '<br>')}
						</div>
						{#if historicalVersion.created_at}
							<div class="context-meta">
								Version created: {new Date(historicalVersion.created_at).toLocaleDateString(
									'en-US',
									{
										year: 'numeric',
										month: 'long',
										day: 'numeric'
									}
								)}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Post Badges Container (lower right) -->
		<div class="post-badges-container">
			<!-- Steelman Badge -->
			{#if post.steelman_score !== null && post.steelman_score !== undefined}
				<SteelmanBadge
					score={post.steelman_score}
					qualityNotes={post.steelman_quality_notes}
					size="small"
					showLabel={true}
					showTooltip={true}
				/>
			{/if}

			<!-- Writing Style Badge -->
			<span
				class="writing-style-badge"
				class:journalistic={post.writing_style === 'journalistic'}
				class:academic={post.writing_style === 'academic'}
			>
				{getStyleConfig(post.writing_style || 'quick_point').label}
			</span>

			<!-- View Original Context Link -->
			{#if post.context_version_id}
				<button
					type="button"
					class="post-version-link"
					class:active={showHistoricalContext}
					onclick={() => onToggleContext?.(post.id, post.context_version_id || null)}
				>
					📖 {showHistoricalContext ? 'hide' : 'context'}
				</button>
			{/if}

			<!-- Good Faith Badge -->
			{#if post?.good_faith_score != null && typeof post.good_faith_score === 'number' && post.good_faith_label}
				<button
					type="button"
					class="good-faith-info-icon"
					onclick={() => onToggleGoodFaith?.(post.id)}
					title="View Good Faith Analysis"
					aria-label="View Good Faith Analysis"
				>
					<span class="icon-symbol">ℹ</span>
					<span class="good-faith-pill {post.good_faith_label}">
						{(post.good_faith_score * 100).toFixed(0)}%
					</span>
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.post-card {
		background-color: var(--color-surface);
		padding: 1.5rem;
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border);
		position: relative;
	}

	.journalistic-post {
		border-left: 4px solid #3b82f6;
	}

	.academic-post {
		border-left: 4px solid #7c3aed;
	}

	.post-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.post-meta .spacer {
		flex: 1 1 auto;
	}

	.post-meta strong {
		font-weight: 600;
	}

	.post-meta a {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 600;
	}

	.post-meta a:hover {
		text-decoration: underline;
	}

	.anonymous-author {
		font-style: italic;
		color: var(--color-text-secondary);
	}

	/* Action Buttons */
	.reply-post-btn,
	.edit-post-btn,
	.delete-post-btn,
	.reveal-identity-btn {
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		padding: 0.3rem 0.6rem;
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.reply-post-btn:hover,
	.edit-post-btn:hover {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		color: var(--color-primary);
	}

	.delete-post-btn:hover {
		border-color: var(--color-error, #ef4444);
		background: color-mix(in srgb, var(--color-error, #ef4444) 8%, transparent);
		color: var(--color-error, #ef4444);
	}

	.reveal-identity-btn {
		padding: 0.3rem 0.75rem;
	}

	.reveal-identity-btn:hover {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
	}

	/* Post Content */
	.post-content {
		line-height: var(--line-height-relaxed);
		color: var(--color-text-primary);
		margin-bottom: 1rem;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.reply-context {
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		border-left: 3px solid var(--color-primary);
		padding: 0.75rem;
		margin-bottom: 1rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
	}

	.reply-context a {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 600;
	}

	.reply-context a:hover {
		text-decoration: underline;
	}

	.snapshot-details {
		margin-top: 0.5rem;
		font-size: 0.85rem;
	}

	.snapshot-details summary {
		cursor: pointer;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.snapshot-details summary:hover {
		color: var(--color-primary);
	}

	.snapshot-content {
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-sm);
		color: var(--color-text-secondary);
	}

	/* Post Edit Block */
	.post-edit-block {
		margin-top: 1rem;
	}

	.post-edit-block textarea {
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		background: var(--color-input-bg);
		color: var(--color-text-primary);
		font-family: inherit;
		font-size: 1rem;
		resize: vertical;
		min-height: 150px;
	}

	.post-edit-block textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.post-edit-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.75rem;
		justify-content: flex-end;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.6rem 1.2rem;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		transition: all 0.2s ease;
	}

	.btn-primary {
		background: var(--color-primary);
		color: white;
		border: none;
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

	.btn-secondary {
		background: transparent;
		color: var(--color-primary);
		border: 1.5px solid var(--color-primary);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-primary);
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.error-message {
		color: #ef4444;
		font-size: 0.875rem;
	}

	/* Post Metadata (Citations) */
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

	.references-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.reference-item {
		padding: 0.75rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
	}

	.chicago-citation {
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.citation-number {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 1.5rem;
	}

	.citation-details {
		margin-top: 0.5rem;
		font-size: 0.85rem;
	}

	.citation-details summary {
		cursor: pointer;
		color: var(--color-text-secondary);
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.citation-details summary:hover {
		color: var(--color-primary);
	}

	.citation-details[open] .summary-arrow {
		transform: rotate(90deg);
	}

	.summary-arrow {
		transition: transform 0.2s ease;
		font-size: 0.7rem;
	}

	.citation-context {
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: var(--color-surface);
		border-radius: var(--border-radius-sm);
	}

	.citation-point,
	.citation-quote {
		margin-bottom: 0.5rem;
		line-height: 1.4;
	}

	.citation-quote {
		font-style: italic;
		color: var(--color-text-secondary);
	}

	/* Historical Context Inline */
	.historical-context-inline {
		margin-top: 1.5rem;
		margin-bottom: 3.5rem;
		padding: 1.5rem;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-accent) 8%, var(--color-surface-alt)),
			color-mix(in srgb, var(--color-primary) 5%, var(--color-surface-alt))
		);
		border: 2px solid var(--color-accent);
		border-radius: var(--border-radius-lg);
		box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
	}

	.context-loading,
	.context-error {
		padding: 1rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.context-error {
		color: #ef4444;
	}

	.loading-spinner {
		display: inline-block;
		animation: spin 1s linear infinite;
		font-size: 1.2rem;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.context-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-accent) 25%, transparent);
	}

	.context-label {
		font-weight: 600;
		color: var(--color-accent);
		font-size: 0.9rem;
		font-family: var(--font-family-display);
	}

	.context-close-btn {
		background: none;
		border: none;
		font-size: 1.25rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		transition: color 0.2s ease;
	}

	.context-close-btn:hover {
		color: var(--color-text-primary);
	}

	.context-content {
		color: var(--color-text-primary);
	}

	.context-title {
		margin: 0 0 1rem 0;
		font-family: var(--font-family-display);
		font-size: 1.25rem;
		color: var(--color-text-primary);
		font-weight: 600;
	}

	.context-description {
		line-height: var(--line-height-relaxed);
		margin-bottom: 1rem;
	}

	.context-meta {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		font-style: italic;
		padding-top: 0.75rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
	}

	/* Post Badges Container */
	.post-badges-container {
		position: absolute;
		bottom: 1rem;
		right: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.writing-style-badge {
		font-size: 0.75rem;
		padding: 0.5rem 0.875rem;
		border-radius: var(--border-radius-full);
		background: var(--color-surface);
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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

	.post-version-link {
		font-size: 0.75rem;
		padding: 0.5rem 0.875rem;
		border-radius: var(--border-radius-full);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		text-decoration: none;
		font-weight: 500;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow:
			0 1px 3px rgba(15, 23, 42, 0.08),
			0 0 0 1px color-mix(in srgb, var(--color-border) 50%, transparent);
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		cursor: pointer;
	}

	.post-version-link:hover {
		transform: translateY(-1px);
		box-shadow:
			0 4px 12px rgba(15, 23, 42, 0.12),
			0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
		color: var(--color-text-primary);
	}

	.post-version-link.active {
		background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
		border-color: var(--color-primary);
		color: var(--color-primary);
		font-weight: 600;
	}

	.good-faith-info-icon {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-full);
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow:
			0 1px 3px rgba(15, 23, 42, 0.08),
			0 0 0 1px color-mix(in srgb, var(--color-border) 50%, transparent);
		font-size: 0.75rem;
	}

	.good-faith-info-icon:hover {
		transform: translateY(-1px);
		box-shadow:
			0 4px 12px rgba(15, 23, 42, 0.12),
			0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.icon-symbol {
		font-weight: bold;
		color: var(--color-primary);
	}

	.good-faith-pill {
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: var(--border-radius-full);
		font-size: 0.7rem;
	}

	.good-faith-pill.constructive,
	.good-faith-pill.exemplary {
		background: color-mix(in srgb, #10b981 15%, transparent);
		color: #059669;
	}

	.good-faith-pill.neutral {
		background: color-mix(in srgb, #6b7280 15%, transparent);
		color: #4b5563;
	}

	.good-faith-pill.questionable {
		background: color-mix(in srgb, #f59e0b 15%, transparent);
		color: #d97706;
	}

	.good-faith-pill.hostile {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		color: #dc2626;
	}

	@media (max-width: 768px) {
		.post-card {
			padding: 1rem;
		}

		.post-badges-container {
			position: static;
			margin-top: 1rem;
			justify-content: flex-start;
		}
	}
</style>
