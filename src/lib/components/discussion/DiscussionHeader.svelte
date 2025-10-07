<script lang="ts">
	type Contributor = {
		id: string;
		handle?: string;
		display_name?: string | null;
	};

	type Discussion = {
		id: string;
		created_at: string;
		is_anonymous: boolean;
		contributor: Contributor;
	};

	let {
		discussion,
		title,
		tags = [],
		isOwner = false,
		canDelete = true,
		onEdit,
		onDelete,
		onAnonymize,
		onRevealIdentity
	} = $props<{
		discussion: Discussion;
		title: string;
		tags?: string[];
		isOwner?: boolean;
		canDelete?: boolean;
		onEdit?: () => void;
		onDelete?: () => void;
		onAnonymize?: () => void;
		onRevealIdentity?: () => void;
	}>();

	function displayName(name: string | null | undefined): string {
		if (!name) return 'User';
		return name.length > 20 ? `${name.slice(0, 20)}...` : name;
	}
</script>

<header class="discussion-header">
	<h1 class="discussion-title">{title}</h1>
	{#if tags.length > 0}
		<div class="discussion-tags">
			{#each tags as tag}
				<span class="tag">{tag}</span>
			{/each}
		</div>
	{/if}
	<p class="discussion-meta">
		<span class="byline">
			Started by {#if discussion.is_anonymous}
				<span class="anonymous-author">Anonymous</span>
			{:else}
				<a href={`/u/${discussion.contributor.handle || discussion.contributor.id}`}
					>{displayName(discussion.contributor.display_name)}</a
				>
			{/if} on {new Date(discussion.created_at).toLocaleDateString()}
		</span>
		{#if isOwner}
			<span class="discussion-actions">
				{#if onEdit}
					<button class="edit-btn" onclick={onEdit} title="Edit discussion">
						<svg
							width="24"
							height="24"
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
				{/if}
				{#if discussion.is_anonymous}
					{#if onRevealIdentity}
						<button
							class="reveal-identity-btn"
							onclick={onRevealIdentity}
							title="Reveal your identity"
						>
							Reveal Identity
						</button>
					{/if}
				{:else if onDelete || onAnonymize}
					<button
						class="delete-discussion-btn"
						onclick={canDelete ? onDelete : onAnonymize}
						title={canDelete ? 'Delete discussion' : 'Make anonymous - others have replied'}
					>
						{#if canDelete}
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#ef4444"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 6h18" />
								<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
								<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
								<line x1="10" y1="11" x2="10" y2="17" />
								<line x1="14" y1="11" x2="14" y2="17" />
							</svg>
						{:else}
							<svg
								width="24"
								height="24"
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
</header>

<style>
	.discussion-header {
		padding: 2rem 0;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 2rem;
	}

	.discussion-title {
		font-family: var(--font-family-display, 'Crimson Text', Georgia, serif);
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 1rem 0;
		line-height: 1.2;
		letter-spacing: -0.025em;
	}

	.discussion-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.tag {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.discussion-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.byline a {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 500;
	}

	.byline a:hover {
		text-decoration: underline;
	}

	.anonymous-author {
		font-style: italic;
		color: var(--color-text-secondary);
	}

	.discussion-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.edit-btn,
	.delete-discussion-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		color: var(--color-text-secondary);
		transition: all 0.2s ease;
	}

	.edit-btn:hover {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		color: var(--color-primary);
	}

	.delete-discussion-btn:hover {
		border-color: var(--color-error, #ef4444);
		background: color-mix(in srgb, var(--color-error, #ef4444) 8%, transparent);
	}

	.reveal-identity-btn {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		border: 1px solid var(--color-primary);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 500;
		transition: all 0.2s ease;
		font-family: inherit;
	}

	.reveal-identity-btn:hover {
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	@media (max-width: 768px) {
		.discussion-header {
			padding: 1.5rem 0;
		}

		.discussion-meta {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
