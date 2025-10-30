<script lang="ts">
	import type { User } from '@nhost/nhost-js';
	// Avoid importing gql to prevent type resolution issues; use plain strings
	import { nhost } from '$lib/nhostClient';
	import { GET_DASHBOARD_DATA, GET_SAVED_ITEMS, REMOVE_SAVED_ITEM } from '$lib/graphql/queries';
	import DashboardNotifications from './ui/DashboardNotifications.svelte';
	import CollaborationInvites from './CollaborationInvites.svelte';
	import { BookOpen, Link2, Users } from '@lucide/svelte';

	let { user } = $props<{ user: User }>();

	// Track user's curator permissions
	let canCurate = $state(false);

	// Focus on active work only

	let drafts = $state<
		Array<{
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
		}>
	>([]);

	let loading = $state(true);
	let error = $state<string | null>(null);

	// Saved Items state
	let savedItems = $state<any[]>([]);
	let savedItemsLoading = $state(false);

	// Collaboration state
	let collaborationInvites = $state<any[]>([]);
	let collaborativeDrafts = $state<any[]>([]);

	async function fetchSavedItems() {
		if (!user?.id) return;

		savedItemsLoading = true;
		try {
			const { data, error: gqlError } = await nhost.graphql.request(GET_SAVED_ITEMS, {
				contributorId: user.id
			});
			if (gqlError) {
				console.error('Error loading saved items:', gqlError);
			} else {
				savedItems = (data as any)?.saved_item ?? [];
			}
		} catch (e: any) {
			console.error('Failed to load saved items:', e);
		} finally {
			savedItemsLoading = false;
		}
	}

	async function handleRemoveSavedItem(savedItemId: string) {
		try {
			const result = await nhost.graphql.request(REMOVE_SAVED_ITEM, {
				savedItemId
			});

			if (result.error) {
				console.error('Error removing saved item:', result.error);
			} else {
				// Remove from local state
				savedItems = savedItems.filter((item) => item.id !== savedItemId);
			}
		} catch (e: any) {
			console.error('Failed to remove saved item:', e);
		}
	}

	async function loadData() {
		loading = true;
		error = null;

		try {
			// Check if user session is valid
			const session = nhost.getUserSession();
			if (!session || !session.user) {
				console.log('No active session, skipping dashboard load');
				loading = false;
				return;
			}

			// Wait for authentication to be ready
			await nhost.auth.isAuthenticatedAsync();

			// Load dashboard data
			const dashboardResult = await nhost.graphql.request(GET_DASHBOARD_DATA, {
				userId: user.id as unknown as string
			});

			// Handle dashboard data
			if (dashboardResult.error) {
				const errorMsg = Array.isArray(dashboardResult.error)
					? dashboardResult.error.map((e: any) => e.message ?? String(e)).join('; ')
					: ((dashboardResult.error as any).message ?? 'Failed to load dashboard data');

				// Check if it's a JWT error - if so, silently skip and let token refresh
				if (errorMsg.includes('JWT') || errorMsg.includes('JWTExpired')) {
					console.log('JWT expired, skipping dashboard load - will retry');
					loading = false;
					return;
				}

				error = errorMsg;
			} else if (dashboardResult.data) {
				// Check user role for curator permissions
				const userRole = dashboardResult.data.contributor_by_pk?.role;
				canCurate = userRole === 'slartibartfast' || userRole === 'admin';

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

				// Extract collaboration data
				collaborationInvites = dashboardResult.data.myCollaborationInvites ?? [];

				// Extract collaborative drafts
				collaborativeDrafts = (dashboardResult.data.collaborativeDrafts ?? []).map(
					(collab: any) => ({
						id: collab.post.id,
						draft_content: collab.post.draft_content,
						discussion_id: collab.post.discussion_id,
						updated_at: collab.post.updated_at,
						discussion_title: collab.post.discussion?.discussion_versions?.[0]?.title ?? null,
						status: collab.post.status,
						type: 'comment',
						role: collab.role,
						author: collab.post.contributor,
						good_faith_score: collab.post.good_faith_score,
						good_faith_label: collab.post.good_faith_label,
						good_faith_last_evaluated: collab.post.good_faith_last_evaluated,
						good_faith_analysis: collab.post.good_faith_analysis
					})
				);
			}
		} catch (err: any) {
			// Check if it's a JWT error - if so, silently skip
			const errorMsg = err?.message || String(err);
			if (errorMsg.includes('JWT') || errorMsg.includes('JWTExpired')) {
				console.log('JWT expired during dashboard load, will retry');
			} else {
				error = `Failed to load data: ${err}`;
				console.error('Error loading dashboard data:', err);
			}
		}

		loading = false;
	}

	$effect(() => {
		// Only run on client side
		if (typeof window !== 'undefined') {
			loadData();
			fetchSavedItems();
		}
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
			<!-- Notifications & Messages -->
			<DashboardNotifications userId={user.id as unknown as string} />

			<!-- Collaboration Invites -->
			{#if collaborationInvites.length > 0}
				<section class="card collaboration-section">
					<CollaborationInvites onInviteResponded={loadData} />
				</section>
			{/if}

			<!-- Pinned Threads, Leaderboard remain placeholders for now -->
			<!-- ...existing code... -->
		</aside>
		<!-- Main Content (Left Column) -->
		<main class="main-content">
			{#if savedItemsLoading}
				<section class="saved-items-section">
					<h3 class="subsection-title">Saved for Later</h3>
					<p>Loading saved items…</p>
				</section>
			{:else if savedItems.length > 0}
				<section class="saved-items-section">
					<h3 class="subsection-title">Saved for Later</h3>
					<div class="saved-items-list">
						{#each savedItems as item}
							<article class="saved-item-card">
								{#if item.discussion}
									<a href="/discussions/{item.discussion.id}" class="saved-item-link">
										<div class="saved-item-header">
											<span class="saved-item-type">Discussion</span>
											<span class="saved-item-date"
												>{new Date(item.created_at).toLocaleDateString()}</span
											>
										</div>
										{#if item.discussion.current_version?.[0]}
											<h4 class="saved-item-title">{item.discussion.current_version[0].title}</h4>
											{#if item.discussion.current_version[0].description}
												<p class="saved-item-excerpt">
													{item.discussion.current_version[0].description.substring(0, 200)}...
												</p>
											{/if}
										{:else}
											<h4 class="saved-item-title">Discussion</h4>
										{/if}
										{#if item.discussion.contributor}
											<p class="saved-item-author">
												By {item.discussion.contributor.display_name ||
													item.discussion.contributor.handle}
											</p>
										{/if}
									</a>
								{:else if item.post}
									<a
										href="/discussions/{item.post.discussion_id}#post-{item.post.id}"
										class="saved-item-link"
									>
										<div class="saved-item-header">
											<span class="saved-item-type">Comment</span>
											<span class="saved-item-date"
												>{new Date(item.created_at).toLocaleDateString()}</span
											>
										</div>
										<p class="saved-item-excerpt">{item.post.content.substring(0, 200)}...</p>
										{#if item.post.discussion?.current_version?.[0]}
											<p class="saved-item-context">
												In: {item.post.discussion.current_version[0].title}
											</p>
										{/if}
										{#if item.post.contributor}
											<p class="saved-item-author">
												By {item.post.contributor.display_name || item.post.contributor.handle}
											</p>
										{/if}
									</a>
								{:else if item.editors_desk_pick}
									<a
										href={item.editors_desk_pick.discussion_id
											? `/discussions/${item.editors_desk_pick.discussion_id}`
											: '/discussions'}
										class="saved-item-link"
									>
										<div class="saved-item-header">
											<span class="saved-item-type">Featured</span>
											<span class="saved-item-date"
												>{new Date(item.created_at).toLocaleDateString()}</span
											>
										</div>
										<h4 class="saved-item-title">{item.editors_desk_pick.title}</h4>
										{#if item.editors_desk_pick.excerpt}
											<p class="saved-item-excerpt">{item.editors_desk_pick.excerpt}</p>
										{/if}
										{#if item.editors_desk_pick.editor_note}
											<p class="saved-item-note">
												<strong>Editor's Note:</strong>
												{item.editors_desk_pick.editor_note}
											</p>
										{/if}
									</a>
								{/if}
								<button
									class="saved-item-remove"
									onclick={(e) => {
										e.preventDefault();
										handleRemoveSavedItem(item.id);
									}}
									title="Remove from saved items"
									aria-label="Remove from saved items"
								>
									×
								</button>
							</article>
						{/each}
					</div>
				</section>
			{/if}

			{#if loading}
				<p>Loading…</p>
			{:else if error}
				<p style="color: var(--color-accent)">{error}</p>
			{:else if drafts.length === 0 && collaborativeDrafts.length === 0}
				<div class="welcome-card">
					<h3 class="welcome-title">Ready to practice constructive dialogue?</h3>
					<p class="welcome-text">
						Start by exploring discussions to see examples of good-faith reasoning, or jump in and
						begin crafting your own contribution.
					</p>
					<div class="welcome-actions">
						<a href="/discussions" class="welcome-button primary">Explore Discussions</a>
						<a href="/discussions/new" class="welcome-button secondary">Start a Discussion</a>
					</div>
					<div class="welcome-resources">
						<p class="resources-intro">New to constructive dialogue?</p>
						<a href="/resources/good-faith-arguments" class="resource-link"
							>→ Learn the fundamentals</a
						>
					</div>
				</div>
			{:else if drafts.length > 0 || collaborativeDrafts.length > 0}
				<div class="drafts-focus">
					<h3 class="subsection-title">Your Active Work</h3>
					<p class="section-description">
						Continue developing your arguments, refining your reasoning, and practicing constructive
						dialogue.
					</p>
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
											{(draft.good_faith_score * 100).toFixed(0)}% {draft.good_faith_label ||
												'unrated'}
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

				<!-- Collaborative Drafts Section -->
				{#if collaborativeDrafts.length > 0}
					<div class="collaborative-drafts-section">
						<h3 class="subsection-title">Collaborative Drafts</h3>
						<p class="section-description">
							Drafts you're collaborating on with other contributors.
						</p>

						<div class="drafts-list">
							{#each collaborativeDrafts as draft}
								<article class="draft-item collaborative">
									<div class="draft-content">
										<a href={getDraftHref(draft)} class="draft-title">
											{extractSnippet(draft.draft_content || '')}
										</a>

										<div class="draft-meta">
											<span>Collaborating as {draft.role}</span>
											<span class="meta-separator">·</span>
											<span
												>By {draft.author?.display_name ||
													draft.author?.handle ||
													'Anonymous'}</span
											>
											{#if draft.discussion_id}
												<span class="meta-separator">·</span>
												<span>Reply to</span>
												{#if draft.discussion_title}
													<span class="meta-separator">·</span>
													<span class="discussion-ref">{draft.discussion_title}</span>
												{/if}
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
													{(draft.good_faith_score * 100).toFixed(0)}% {draft.good_faith_label ||
														'unrated'}
												</span>
											</div>
										{/if}
									</div>

									<div class="collab-badge" title="Collaborative draft">
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
											<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
											<circle cx="9" cy="7" r="4"></circle>
											<path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
											<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
										</svg>
									</div>
								</article>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</main>
	</div>

	<!-- Learning & Resources -->
	<footer class="dashboard-footer">
		<div class="footer-header">
			<h3 class="footer-title">Develop Your Skills</h3>
			<p class="footer-subtitle">
				Master the art of constructive dialogue through our educational resources.
			</p>
		</div>
		<div class="footer-links">
			<a href="/resources/good-faith-arguments" class="resource-card">
				<div class="resource-icon">
					<BookOpen size={28} strokeWidth={1.5} />
				</div>
				<div class="resource-info">
					<strong>Good-Faith Arguments</strong>
					<span>Learn to reason better and avoid logical fallacies</span>
				</div>
			</a>
			<a href="/resources/citation-best-practices" class="resource-card">
				<div class="resource-icon">
					<Link2 size={28} strokeWidth={1.5} />
				</div>
				<div class="resource-info">
					<strong>Citation Best Practices</strong>
					<span>Build research skills with proper sourcing</span>
				</div>
			</a>
			<a href="/resources/community-guidelines" class="resource-card">
				<div class="resource-icon">
					<Users size={28} strokeWidth={1.5} />
				</div>
				<div class="resource-info">
					<strong>Community Guidelines</strong>
					<span>Understand our principles for respectful dialogue</span>
				</div>
			</a>
		</div>
	</footer>
</div>

<style>
	.dashboard-container {
		padding: 2rem 1rem;
		max-width: 96vw;
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

	/* Welcome Card (Empty State) */
	.welcome-card {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 5%, var(--color-surface)),
			color-mix(in srgb, var(--color-accent) 3%, var(--color-surface))
		);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-xl);
		padding: clamp(2rem, 5vw, 3rem);
		margin-bottom: 2rem;
		text-align: center;
	}

	.welcome-title {
		font-size: clamp(1.5rem, 3vw, 2rem);
		font-weight: 700;
		font-family: var(--font-family-display);
		color: var(--color-text-primary);
		margin-bottom: 1rem;
	}

	.welcome-text {
		font-size: 1.05rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin-bottom: 2rem;
		max-width: 600px;
		margin-left: auto;
		margin-right: auto;
	}

	.welcome-actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		flex-wrap: wrap;
		margin-bottom: 2rem;
	}

	.welcome-button {
		padding: 0.875rem 1.75rem;
		border-radius: var(--border-radius-md);
		font-weight: 600;
		text-decoration: none;
		transition: all 0.3s ease;
		display: inline-block;
	}

	.welcome-button.primary {
		background: var(--color-primary);
		color: white;
		border: 1px solid var(--color-primary);
	}

	.welcome-button.primary:hover {
		background: color-mix(in srgb, var(--color-primary) 90%, black);
		transform: translateY(-2px);
		box-shadow: 0 8px 20px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.welcome-button.secondary {
		background: transparent;
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.welcome-button.secondary:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.welcome-resources {
		padding-top: 1.5rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.resources-intro {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
	}

	.resource-link {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 500;
		transition: color 0.2s ease;
	}

	.resource-link:hover {
		color: var(--color-accent);
	}

	/* Footer */
	.dashboard-footer {
		margin-top: var(--space-2xl);
		padding: clamp(2rem, 4vw, 3rem);
		background: var(--color-surface);
		border-radius: var(--border-radius-xl);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		box-shadow: 0 8px 25px rgba(15, 23, 42, 0.08);
	}

	.footer-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.footer-title {
		font-size: 1.75rem;
		font-weight: 700;
		font-family: var(--font-family-display);
		color: var(--color-text-primary);
		margin-bottom: 0.5rem;
	}

	.footer-subtitle {
		font-size: 1rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	.footer-links {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.resource-card {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		border-radius: var(--border-radius-lg);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		text-decoration: none;
		transition: all 0.3s ease;
	}

	.resource-card:hover {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		border-color: var(--color-primary);
		transform: translateY(-4px);
		box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
	}

	.resource-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-primary);
	}

	.resource-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.resource-info strong {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		display: block;
	}

	.resource-info span {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
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

	.draft-item.collaborative {
		background-color: color-mix(in srgb, var(--color-primary) 3%, transparent);
	}

	.draft-item.collaborative:hover {
		background-color: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.collab-badge {
		flex-shrink: 0;
		color: var(--color-primary);
		padding: 0.5rem;
		opacity: 0.7;
	}

	.collaborative-drafts-section {
		margin-top: 2rem;
	}

	.section-description {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin-bottom: 1rem;
		line-height: 1.6;
	}

	.collaboration-section {
		margin-bottom: 1.5rem;
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

	/* Editors' Desk Section */
	.editors-desk-section {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: var(--color-surface);
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
	}

	.editors-desk-section .subsection-title {
		margin-top: 0;
		margin-bottom: 1rem;
	}

	/* Saved Items Section */
	.saved-items-section {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: var(--color-surface);
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
	}

	.saved-items-section .subsection-title {
		margin-top: 0;
		margin-bottom: 1rem;
	}

	.saved-items-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.saved-item-card {
		position: relative;
		padding: 1.25rem;
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		transition: all 0.2s ease;
	}

	.saved-item-card:hover {
		border-color: var(--color-accent);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-accent) 10%, transparent);
	}

	.saved-item-link {
		display: block;
		color: inherit;
		text-decoration: none;
	}

	.saved-item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.saved-item-type {
		padding: 0.25rem 0.625rem;
		background: color-mix(in srgb, var(--color-accent) 15%, transparent);
		color: var(--color-accent);
		border-radius: var(--border-radius-sm);
		font-weight: 600;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.05em;
	}

	.saved-item-date {
		color: var(--color-text-secondary);
	}

	.saved-item-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		line-height: 1.4;
	}

	.saved-item-excerpt {
		margin: 0.5rem 0;
		color: var(--color-text-secondary);
		line-height: 1.6;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
	}

	.saved-item-context {
		margin: 0.5rem 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.saved-item-author {
		margin: 0.5rem 0 0 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.saved-item-note {
		margin: 0.75rem 0 0 0;
		padding: 0.75rem;
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		border-left: 3px solid var(--color-primary);
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.saved-item-remove {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--border-radius-md);
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
		color: var(--color-text-secondary);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		font-size: 1.25rem;
		font-weight: 300;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 0.6;
	}

	.saved-item-card:hover .saved-item-remove {
		opacity: 1;
	}

	.saved-item-remove:hover {
		background: color-mix(in srgb, #ef4444 90%, transparent);
		color: white;
		border-color: #ef4444;
		transform: translateY(-2px);
		box-shadow: 0 8px 20px color-mix(in srgb, #ef4444 25%, transparent);
	}

	.saved-item-remove:active {
		transform: translateY(0);
	}
</style>
