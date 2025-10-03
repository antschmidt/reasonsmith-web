<script lang="ts">
	import type { User } from '@nhost/nhost-js';
	// Avoid importing gql to prevent type resolution issues; use plain strings
	import { nhost } from '$lib/nhostClient';
	import { GET_DASHBOARD_DATA } from '$lib/graphql/queries';
	import Notifications from './Notifications.svelte';

	let { user } = $props<{ user: User }>();


	// Focus on active work only

	let drafts = $state<Array<{
		id: string;
		draft_content?: string | null;
		discussion_id?: string | null;
		updated_at?: string | null;
		discussion_title?: string | null;
		status?: string | null;
		type?: string;
		original_discussion_id?: string;
		good_faith_score?: number | null;
		good_faith_label?: string | null;
		good_faith_last_evaluated?: string | null;
		good_faith_analysis?: any;
	}>>([]);

	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadData() {
		loading = true;
		error = null;

		try {
			// Load dashboard data
			const dashboardResult = await nhost.graphql.request(GET_DASHBOARD_DATA, {
				userId: user.id as unknown as string
			});

			// Handle dashboard data
			if (dashboardResult.error) {
				error = Array.isArray(dashboardResult.error)
					? dashboardResult.error.map((e: any) => e.message ?? String(e)).join('; ')
					: ((dashboardResult.error as any).message ?? 'Failed to load dashboard data');
			} else if (dashboardResult.data) {
				// Focus on drafts and active work only

				// Get database drafts (comment drafts)
				const dbDrafts = (dashboardResult.data.myPostDrafts ?? []).map((draft: any) => ({
					id: draft.id,
					draft_content: draft.draft_content,
					discussion_id: draft.discussion_id,
					updated_at: draft.updated_at,
					discussion_title: draft.discussion?.discussion_versions?.[0]?.title ?? null,
					status: draft.status,
					type: 'comment',
					good_faith_score: draft.good_faith_score,
					good_faith_label: draft.good_faith_label,
					good_faith_last_evaluated: draft.good_faith_last_evaluated,
					good_faith_analysis: draft.good_faith_analysis
				}));

				// Get discussion drafts from database
				const dbDiscussionDrafts = (dashboardResult.data.myDiscussionDrafts ?? []).map(
					(draft: any) => ({
						id: `discussion_version_${draft.id}`,
						draft_content: `${draft.title}\n\n${draft.description || ''}`,
						discussion_id: draft.discussion_id,
						updated_at: draft.created_at,
						discussion_title: draft.title,
						status: 'draft',
						type: 'discussion',
						good_faith_score: draft.good_faith_score,
						good_faith_label: draft.good_faith_label,
						good_faith_last_evaluated: draft.good_faith_last_evaluated,
						original_discussion_id: draft.discussion_id
					})
				);

				// Get discussion description drafts from localStorage (legacy)
				// Combine database drafts
				drafts = [...dbDrafts, ...dbDiscussionDrafts].sort((a, b) => {
					const dateA = new Date(a.updated_at || 0).getTime();
					const dateB = new Date(b.updated_at || 0).getTime();
					return dateB - dateA; // Most recent first
				});
			}
		} catch (err) {
			error = `Failed to load data: ${err}`;
			console.error('Error loading dashboard data:', err);
		}

		loading = false;
	}

	$effect(() => {
		loadData();
	});

	function getDraftHref(d: {
		id: string;
		discussion_id?: string | null;
		type?: string;
		original_discussion_id?: string;
	}) {
		if (d.type === 'discussion' && d.original_discussion_id) {
			// Check if this is a database draft (starts with discussion_version_) or localStorage draft (starts with discussion_)
			if (d.id.startsWith('discussion_version_')) {
				// Database draft - use dedicated draft editing page
				const draftVersionId = d.id.replace('discussion_version_', '');
				return `/discussions/${d.original_discussion_id}/draft/${draftVersionId}`;
			} else if (d.id.startsWith('discussion_')) {
				// localStorage draft - just go to the discussion page, it will load from localStorage
				return `/discussions/${d.original_discussion_id}`;
			} else {
				// Unknown draft type - fallback
				return `/discussions/${d.original_discussion_id}`;
			}
		} else if (d.discussion_id) {
			return `/discussions/${d.discussion_id}?replyDraftId=${d.id}`;
		} else {
			return `/discussions/new?draftId=${d.id}`;
		}
	}

	function extractSnippet(html: string, max = 80) {
		if (!html) return 'Untitled draft';
		const txt = html
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<[^>]+>/g, ' ') // remove tags
			.replace(/&nbsp;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&quot;/gi, '"')
			.replace(/&#39;/gi, "'")
			.replace(/\s+/g, ' ') // collapse whitespace
			.trim();
		if (!txt) return 'Untitled draft';
		return txt.length > max ? txt.slice(0, max) + '…' : txt;
	}

	const DELETE_DRAFT = `mutation DeleteDraft($id: uuid!, $authorId: uuid!) { delete_post(where:{id:{_eq:$id}, author_id:{_eq:$authorId}, status:{_eq:"draft"}}){ affected_rows } }`;
	const DELETE_DISCUSSION_DRAFT = `
		mutation DeleteDiscussionDraft($versionId: uuid!, $discussionId: uuid!, $createdBy: uuid!) {
			# Delete the draft version
			delete_discussion_version(where:{id:{_eq:$versionId}, created_by:{_eq:$createdBy}, version_type:{_eq:"draft"}}) {
				affected_rows
			}
			# Delete the discussion if it has no published versions (i.e., it was never published)
			delete_discussion(where:{
				id:{_eq:$discussionId},
				created_by:{_eq:$createdBy},
				status:{_eq:"draft"}
			}) {
				affected_rows
			}
		}
	`;

	async function deleteDraft(d: { id: string; type?: string; original_discussion_id?: string }) {
		if (!user) return;
		const ok = typeof window !== 'undefined' ? confirm('Delete this draft?') : true;
		if (!ok) return;

		if (d.type === 'discussion' && d.original_discussion_id) {
			// Check if this is a database draft (starts with discussion_version_) or localStorage draft
			if (d.id.startsWith('discussion_version_')) {
				// Delete discussion version draft and discussion from database
				const draftVersionId = d.id.replace('discussion_version_', '');
				const { error: delErr } = await nhost.graphql.request(DELETE_DISCUSSION_DRAFT, {
					versionId: draftVersionId,
					discussionId: d.original_discussion_id,
					createdBy: user.id as unknown as string
				});
				if (delErr) {
					console.warn('Failed to delete discussion draft', delErr);
					return;
				}
				drafts = drafts.filter((dr) => dr.id !== d.id);
			} else {
				// Delete discussion description draft from localStorage (legacy)
				const draftKey = `discussion_draft:${d.original_discussion_id}`;
				localStorage.removeItem(draftKey);
				drafts = drafts.filter((dr) => dr.id !== d.id);
			}
		} else {
			// Delete comment draft from database
			const { error: delErr } = await nhost.graphql.request(DELETE_DRAFT, {
				id: d.id,
				authorId: user.id as unknown as string
			});
			if (delErr) {
				// simple inline fallback; could add toast later
				console.warn('Failed to delete draft', delErr);
				return;
			}
			drafts = drafts.filter((dr) => dr.id !== d.id);
		}
	}

</script>

<div class="dashboard-container">
	<!-- Main Content Grid -->
	<div class="dashboard-grid">
		<!-- Sidebar (Right Column) -->
		<aside class="sidebar">
			<!-- Notifications -->
			<Notifications userId={user.id as unknown as string} />

			<!-- Single Action: New Discussion -->
			<section class="card quick-discussion">
				<a href="/discussions/new" class="btn btn-secondary btn-sm">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
							clip-rule="evenodd"
						/></svg
					>
					New Discussion
				</a>
			</section>

			<!-- Pinned Threads, Leaderboard remain placeholders for now -->
			<!-- ...existing code... -->
		</aside>
		<!-- Main Content (Left Column) -->
		<main class="main-content">
			{#if loading}
				<p>Loading…</p>
			{:else if error}
				<p style="color: var(--color-accent)">{error}</p>
			{:else if drafts.length === 0}
				<div class="card" style="margin-bottom: 1rem;">
					<p>No active drafts. <a href="/discussions/new">Start a new discussion</a> or join an existing conversation.</p>
				</div>
			{:else}
				<div class="drafts-focus">
					<h3 class="subsection-title">Continue Working</h3>
					<p class="section-description">Pick up where you left off on your drafts and active discussions.</p>
				</div>

				<!-- Drafts List -->
				<div class="drafts-list">
					{#each drafts as draft}
						<article class="draft-item">
							<div class="draft-content">
								<a href={getDraftHref(draft)} class="draft-title">
									{extractSnippet(draft.draft_content || '')}
								</a>

								<div class="draft-meta">
									{#if draft.type === 'discussion'}
										<span>Discussion draft</span>
										{#if draft.discussion_title}
											<span class="meta-separator">·</span>
											<span class="discussion-ref">{draft.discussion_title}</span>
										{/if}
									{:else if draft.discussion_id}
										<span>Reply to</span>
										{#if draft.discussion_title}
											<span class="meta-separator">·</span>
											<span class="discussion-ref">{draft.discussion_title}</span>
										{/if}
									{:else}
										<span>New discussion</span>
									{/if}
									{#if draft.status === 'pending'}
										<span class="meta-separator">·</span>
										<span class="status-pending">Pending review</span>
									{/if}
								</div>

								<!-- Good Faith Score (if available) -->
								{#if draft.good_faith_score !== null && draft.good_faith_score !== undefined}
									<div class="draft-score">
										<span class="score-pill {draft.good_faith_label || 'neutral'}">
											{(draft.good_faith_score * 100).toFixed(0)}% {draft.good_faith_label || 'unrated'}
										</span>
									</div>
								{/if}
							</div>

							<button
								type="button"
								class="draft-delete-icon"
								aria-label="Delete draft"
								title="Delete draft"
								onclick={() => deleteDraft(draft)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polyline points="3,6 5,6 21,6"></polyline>
									<path d="m5,6 1,14 c0,1 1,2 2,2 h8 c1,0 2,-1 2,-2 l1,-14"></path>
									<path d="m10,11 v6"></path>
									<path d="m14,11 v6"></path>
									<path d="M7,6V4c0-1,1-2,2-2h6c0,1,1,2h-2V6"></path>
								</svg>
							</button>
						</article>
					{/each}
				</div>
			{/if}
		</main>
	</div>

	<!-- Learning & Resources -->
	<footer class="dashboard-footer">
		<h2 class="section-title">Learning & Resources</h2>
		<div class="footer-links">
			<a href="/resources/good-faith-arguments">How to Craft Good-Faith Arguments</a>
			<a href="/resources/citation-best-practices">Citation Best Practices</a>
			<a href="/resources/community-guidelines">Community Guidelines</a>
		</div>
	</footer>
</div>

<style>
	.dashboard-container {
		padding: 2rem 1rem;
		max-width: 1200px;
		margin: 0 auto;
		background: var(--color-surface-alt);
		min-height: 100vh;
	}

	@media (min-width: 640px) {
		.dashboard-container {
			padding: 2rem 1.5rem;
		}
	}
	@media (min-width: 1024px) {
		.dashboard-container {
			padding: 3rem 2rem;
		}
	}

	/* Grid */
	.dashboard-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
	}
	@media (min-width: 1024px) {
		.dashboard-grid {
			grid-template-columns: repeat(3, 1fr);
		}
		.main-content {
			grid-column: span 2 / span 2;
			order: 1;
		}
		.sidebar {
			grid-column: span 1 / span 1;
			order: 2;
		}
	}
	.main-content {
		margin-bottom: 2rem;
		order: 1; /* Main content first on mobile */
	}
	@media (min-width: 1024px) {
		.main-content {
			margin-bottom: 0;
		}
	}
	.sidebar {
		display: flex;
		flex-direction: column;
		order: 2; /* Sidebar second on mobile */
	}

	/* Editorial Cards */
	.card {
		/* background: var(--color-surface); */
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		padding: var(--space-lg);
		margin-bottom: var(--space-lg);
		transition: all var(--transition-speed) ease;
	}

	.card:hover {
		border-color: var(--color-primary);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}
	.section-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
		font-family: var(--font-family-display);
		color: var(--color-text-primary);
		text-align: left;
	}

	/* Discussion List */
	.discussions-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.discussion-card {
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(15px) saturate(1.1);
		padding: var(--space-lg);
		border-radius: var(--border-radius-xl);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 6%, transparent);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		cursor: pointer;
		position: relative;
		overflow: hidden;
	}

	.discussion-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: var(--border-radius-xl) var(--border-radius-xl) 0 0;
	}

	.discussion-card:hover {
		transform: translateY(-6px);
		box-shadow: 0 15px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
	}
	.discussion-title {
		font-size: 1.375rem;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		margin-bottom: 0.75rem;
		line-height: 1.3;
	}
	.discussion-snippet {
		color: var(--color-text-primary);
		font-size: 1rem;
		margin: 0 0 1rem 0;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		line-clamp: 2;
		line-height: 1.6;
	}
	.discussion-meta {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}
	/* .load-more removed: no longer used */

	/* Sidebar Lists */
	.list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		list-style: none;
		padding: 0;
	}
	.list-item {
		color: var(--color-text-primary);
		cursor: pointer;
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-lg);
		padding: var(--space-md);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.discussion-title {
		font-weight: 600;
	}
	.list-item:hover {
		transform: translateY(-2px);
		background: color-mix(in srgb, var(--color-surface) 70%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 12%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	/* Use global button styles from app.css */
	.full-width {
		width: 100%;
	}

	/* Footer */
	.dashboard-footer {
		margin-top: var(--space-2xl);
		padding: var(--space-lg);
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(20px);
		border-radius: var(--border-radius-xl);
		border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 8%, transparent);
	}
	.footer-links {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		text-align: center;
		gap: 1rem;
	}
	.footer-links a {
		color: var(--color-primary);
		text-decoration: none;
		padding: var(--space-sm) var(--space-md);
		background: color-mix(in srgb, var(--color-surface) 40%, transparent);
		border-radius: var(--border-radius-lg);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		font-weight: 500;
		display: block;
		backdrop-filter: blur(5px);
	}
	.footer-links a:hover {
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
		color: var(--color-accent);
		transform: translateY(-2px);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 12%, transparent);
	}

	/* Editorial-Style Drafts List (Foreign Affairs inspired) */
	.drafts-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.draft-item {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-lg) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		transition: background-color 0.2s ease;
	}

	.draft-item:hover {
		background-color: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
	}

	.draft-content {
		flex: 1;
		min-width: 0;
	}

	.draft-title {
		display: block;
		font-family: var(--font-family-display);
		font-size: 1.375rem;
		font-weight: 700;
		line-height: var(--line-height-tight);
		color: var(--color-text-primary);
		text-decoration: none;
		margin-bottom: 0.5rem;
		transition: color 0.2s ease;
	}

	.draft-title:hover {
		color: var(--color-primary);
	}

	.draft-meta {
		font-family: var(--font-family-ui);
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin-bottom: 0.5rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
	}

	.meta-separator {
		margin: 0 0.25rem;
		opacity: 0.5;
	}

	.discussion-ref {
		font-style: italic;
		color: var(--color-text-primary);
	}

	.status-pending {
		color: var(--color-accent);
		font-weight: 500;
	}

	.draft-score {
		margin-top: 0.5rem;
	}

	.score-pill {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.75rem;
		border-radius: var(--border-radius-full);
		text-transform: capitalize;
	}

	.score-pill.hostile {
		background: color-mix(in srgb, #ef4444 8%, transparent);
		color: #f87171;
	}

	.score-pill.questionable {
		background: color-mix(in srgb, #f59e0b 8%, transparent);
		color: #fbbf24;
	}

	.score-pill.neutral {
		background: color-mix(in srgb, #6b7280 8%, transparent);
		color: #9ca3af;
	}

	.score-pill.constructive {
		background: color-mix(in srgb, #10b981 8%, transparent);
		color: #34d399;
	}

	.score-pill.exemplary {
		background: color-mix(in srgb, #059669 8%, transparent);
		color: #34d399;
	}

	.draft-delete-icon {
		flex-shrink: 0;
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
		opacity: 0.5;
	}

	.draft-delete-icon:hover {
		color: #ef4444;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		opacity: 1;
	}

	.draft-item:hover .draft-delete-icon {
		opacity: 1;
	}

	/* Subsection Titles */
	.subsection-title {
		font-size: clamp(1.25rem, 2.5vw, 1.75rem);
		font-weight: 800;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		margin: 2rem 0 1.5rem 0;
		letter-spacing: -0.01em;
		position: relative;
	}

	.subsection-title::before {
		content: '';
		position: absolute;
		left: 0;
		bottom: -6px;
		width: 60px;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 2px;
	}

	/* Responsive Design */
	@media (max-width: 768px) {
		.dashboard-container {
			padding: 1rem 0.5rem;
		}

		.card {
			padding: 1.5rem;
			border-radius: 20px;
			margin-bottom: 1.5rem;
		}

		.discussion-card {
			padding: 1.5rem;
		}

		.discussion-title {
			font-size: 1.25rem;
		}

		.btn-primary {
			padding: 0.875rem 1.75rem;
			font-size: 0.9rem;
		}

		.list-item {
			padding: 1.25rem;
		}

		.dashboard-footer {
			margin-top: 3rem;
			padding: 1.5rem;
		}

		.footer-links {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 480px) {
		.dashboard-container {
			padding: 0.75rem 0.25rem;
		}

		.section-title {
			font-size: 1.5rem;
		}

		.subsection-title {
			font-size: 1.25rem;
		}

		.discussion-meta {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}
	}
</style>
