<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { GET_USER_STATS } from '$lib/graphql/queries';
	import { calculateUserStats, type UserStats } from '$lib/utils/userStats';

	let userId = '';
	let loading = true;
	let error: string | null = null;

	let contributor: any = null;
	let discussions: any[] = [];
	let posts: any[] = [];
	let stats: UserStats = {
		goodFaithRate: 0,
		sourceAccuracy: 0,
		reputationScore: 0,
		totalPosts: 0,
		totalDiscussions: 0,
		participatedDiscussions: 0
	};
	let statsLoading = true;

	const GET_PUBLIC_PROFILE = `
    query GetPublicProfile($id: uuid!) {
      contributor_by_pk(id: $id) {
        id
        display_name
        bio
        website
        social_links
      }
      discussion(where: { created_by: { _eq: $id } }, order_by: { created_at: desc }) {
        id
        created_at
        current_version: discussion_versions(
          where: { version_type: { _eq: "published" } }
          order_by: { version_number: desc }
          limit: 1
        ) {
          title
        }
        draft_version: discussion_versions(
          where: { version_type: { _eq: "draft" } }
          order_by: { version_number: desc }
          limit: 1
        ) {
          title
        }
      }
      post(where: { author_id: { _eq: $id }, status: { _eq: "approved" } }, order_by: { created_at: desc }) {
        id
        discussion_id
        created_at
        content
      }
    }
  `;

	function displayName(name?: string | null): string {
		if (!name) return '';
		const n = String(name).trim();
		// Only de-emailize if it looks like a full email address
		const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n);
		if (isEmail) return n.split('@')[0];
		return n;
	}

	function toTextSnippet(html: string, max = 160): string {
		if (!html) return '';
		const cleaned = html
			.replace(/<!--\s*CITATION_DATA:[\s\S]*?-->/gi, ' ')
			.replace(/<!--\s*REPLY_TO:[\s\S]*?-->/gi, ' ')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&nbsp;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&quot;/gi, '"')
			.replace(/&#39;/gi, "'")
			.replace(/\s+/g, ' ')
			.trim();
		return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
	}

	$: userId = $page.params.id as string;
	$: byHandle = !!userId && !/^[0-9a-fA-F-]{36}$/.test(userId);

	function getSocialLink(platform: string, value: string): string | null {
		if (!value) return null;
		const v = String(value).trim();
		if (!v) return null;
		const isUrl = /^https?:\/\//i.test(v);
		const stripAt = (s: string) => s.replace(/^@+/, '');
		const p = platform.toLowerCase();
		if (isUrl) return v;
		switch (p) {
			case 'twitter':
			case 'x':
				return `https://x.com/${stripAt(v)}`;
			case 'github':
				return `https://github.com/${stripAt(v)}`;
			case 'linkedin':
				if (/^(in|company)\//i.test(v)) return `https://www.linkedin.com/${v}`;
				return `https://www.linkedin.com/in/${stripAt(v)}`;
			case 'mastodon': {
				const m = v.replace(/^@/, '').split('@');
				if (m.length >= 2) return `https://${m.slice(1).join('@')}/@${m[0]}`;
				return `https://${v}`;
			}
			case 'bluesky':
				return `https://bsky.app/profile/${stripAt(v)}`;
			case 'facebook':
				return `https://www.facebook.com/${stripAt(v)}`;
			case 'instagram':
				return `https://www.instagram.com/${stripAt(v)}`;
			case 'youtube':
				if (v.startsWith('@')) return `https://www.youtube.com/${v}`;
				if (/^UC[\w-]{22}/.test(v)) return `https://www.youtube.com/channel/${v}`;
				return `https://www.youtube.com/${v}`;
			case 'tiktok':
				return `https://www.tiktok.com/@${stripAt(v)}`;
			default:
				return `https://${v}`;
		}
	}

	function websiteLabel(u: string): string {
		try {
			const s = String(u).trim();
			return s.replace(/^https?:\/\//i, '').replace(/\/$/, '');
		} catch {
			return u;
		}
	}

	function socialIcon(platform: string): string {
		const p = platform.toLowerCase();
		const base =
			'width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"';
		switch (p) {
			case 'twitter':
			case 'x':
				return `<svg ${base}><path d="M18.244 2H21.5l-7.5 8.57L22.5 22H15.93l-5.07-5.88L5 22H1.744l8.1-9.26L.5 2H7.242l4.57 5.273L18.244 2Zm-1.155 18h1.92L7.01 4h-1.92l12 16Z"/></svg>`;
			case 'github':
				return `<svg ${base}><path fill-rule="evenodd" d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.86 3.15 8.98 7.51 10.43.55.1.75-.24.75-.54v-1.9c-3.05.66-3.7-1.27-3.7-1.27-.5-1.26-1.22-1.6-1.22-1.6-1-.7.08-.68.08-.68 1.1.08 1.68 1.13 1.68 1.13.98 1.67 2.57 1.18 3.2.9.1-.7.38-1.18.68-1.45-2.43-.27-4.98-1.22-4.98-5.43 0-1.2.43-2.18 1.13-2.95-.1-.28-.5-1.43.1-2.98 0 0 .95-.3 3.1 1.13.9-.25 1.86-.38 2.82-.38.96 0 1.92.13 2.82.38 2.15-1.44 3.1-1.13 3.1-1.13.6 1.55.2 2.7.1 2.98.7.77 1.12 1.75 1.12 2.95 0 4.22-2.56 5.16-5 5.43.4.35.74 1.03.74 2.08v3.08c0 .3.2.65.76.54 4.35-1.45 7.5-5.57 7.5-10.43C23.02 5.24 18.27.5 12 .5Z" clip-rule="evenodd"/></svg>`;
			case 'linkedin':
				return `<svg ${base}><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.83v2h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.08V23h-4v-5.9c0-1.41-.03-3.22-1.96-3.22-1.96 0-2.26 1.53-2.26 3.11V23h-4V8.5z"/></svg>`;
			case 'mastodon':
				return `<svg ${base}><path d="M21.57 13.19c-.29 1.48-2.62 3.1-5.3 3.43-1.4.18-2.78.35-4.25.28-2.4-.11-4.31-.57-4.31-.57 0 .23.01.46.04.68.31 2.35 2.34 2.49 4.25 2.56 1.93.07 3.65-.47 3.65-.47l.08 1.8s-1.35.73-3.76.86c-1.33.07-2.99-.03-4.92-.52-4.18-1.06-4.9-5.35-4.99-9.69-.03-1.34-.01-2.6-.01-3.65 0-4.99 3.27-6.46 3.27-6.46 1.65-.76 4.49-1.08 7.45-1.1h.07c2.96.02 5.8.34 7.45 1.1 0 0 3.27 1.47 3.27 6.46 0 0 .04 3.02-.99 5.69zM17.55 6.6h-2.22v6.85h-2.53V6.6h-2.21V4.44h6.96V6.6z"/></svg>`;
			case 'bluesky':
				return `<svg ${base}><path d="M12 9.8C9.5 6.5 6.3 3.7 3 2c1.2 3.6 3 7.1 6 9-3 1.9-4.8 5.4-6 9 3.3-1.7 6.5-4.5 9-7.8 2.5 3.3 5.7 6.1 9 7.8-1.2-3.6-3-7.1-6-9 3-1.9 4.8-5.4 6-9-3.3 1.7-6.5 4.5-9 7.8z"/></svg>`;
			case 'facebook':
				return `<svg ${base}><path d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07C2 17.1 5.66 21.2 10.44 22v-7.02H7.9v-2.9h2.54v-2.2c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.25c-1.23 0-1.62.77-1.62 1.56v1.88h2.77l-.44 2.9h-2.33V22C18.34 21.2 22 17.1 22 12.07z"/></svg>`;
			case 'instagram':
				return `<svg ${base}><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.9.3 2.4.6.6.3 1 .6 1.5 1.1.5.5.8.9 1.1 1.5.3.5.5 1.2.6 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.9-.6 2.4-.3.6-.6 1-1.1 1.5-.5.5-.9.8-1.5 1.1-.5.3-1.2.5-2.4.6-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.9-.3-2.4-.6-.6-.3-1-.6-1.5-1.1-.5-.5-.8-.9-1.1-1.5-.3-.5-.5-1.2-.6-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.9.6-2.4.3-.6.6-1 1.1-1.5.5-.5.9-.8 1.5-1.1.5-.3 1.2-.5 2.4-.6C8.4 2.2 8.8 2.2 12 2.2m0-2.2C8.7 0 8.3 0 7 .1 5.7.2 4.8.4 4 .8 3.2 1.2 2.5 1.7 1.7 2.5 1 3.2.5 3.9.1 4.7c-.4.8-.6 1.7-.7 3C-.7 9 .7 9.4 0 12c.7 2.6.4 3 .4 5.3.1 1.3.3 2.2.7 3 .4.8.9 1.5 1.7 2.3.8.8 1.5 1.2 2.3 1.6.8.4 1.7.6 3 .7 1.3.1 1.7.1 5.3.1s4 0 5.3-.1c1.3-.1 2.2-.3 3-.7.8-.4 1.5-.9 2.3-1.6.8-.4 1.3-1.1 1.7-2.3.4-.8.6-1.7.7-3 .1-1.3.1-1.7.1-5.3s0-4-.1-5.3c-.1-1.3-.3-2.2-.7-3-.4-.8-.9-1.5-1.7-2.3C21.5.5 20.8 0 20 0c-.8-.4-1.7-.6-3-.7C15.6-.8 15.2-.8 12-.8z"/><circle cx="12" cy="12" r="3.2"/><circle cx="18.4" cy="5.6" r="1.2"/></svg>`;
			case 'youtube':
				return `<svg ${base}><path d="M23.5 6.2a3.1 3.1 0 0 0-2.2-2.2C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.3.5A3.1 3.1 0 0 0 .5 6.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 5.8 3.1 3.1 0 0 0 2.2 2.2c1.8.5 9.3.5 9.3.5s7.5 0 9.3-.5a3.1 3.1 0 0 0 2.2-2.2 32 32 0 0 0 .5-5.8 32 32 0 0 0-.5-5.8zM9.7 15.5V8.5l6.2 3.5-6.2 3.5z"/></svg>`;
			case 'tiktok':
				return `<svg ${base}><path d="M19 7.5c-2 0-3.7-1.6-3.7-3.6V3h-3.2v10.6c0 1.5-1.2 2.7-2.8 2.7S6.5 15 6.5 13.6s1.2-2.7 2.8-2.7c.3 0 .6 0 .9.1V7.7c-.3 0-.6-.1-.9-.1-3.1 0-5.6 2.4-5.6 5.4S6.2 18.5 9.3 18.5s5.6-2.4 5.6-5.4v-4c1 1 2.4 1.7 4 1.7V7.5H19z"/></svg>`;
			default:
				return `<svg ${base}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 0 1 6.32 4H12v3h6.95A7 7 0 1 1 12 5Z"/></svg>`;
		}
	}

	async function load() {
		loading = true;
		statsLoading = true;
		error = null;
		try {
			// Ensure auth is initialized so role header is applied if signed in
			try {
				await nhost.auth.isAuthenticatedAsync();
			} catch {}
			let resolved = userId;
			if (byHandle) {
				const RESOLVE = `query ($handle: String!) { contributor(where:{ handle:{ _eq: $handle } }, limit:1){ id display_name handle bio website social_links } }`;
				const { data: d1, error: e1 } = await nhost.graphql.request(RESOLVE, { handle: userId });
				if (e1) throw Array.isArray(e1) ? new Error(e1.map((e: any) => e.message).join('; ')) : e1;
				const c = (d1 as any)?.contributor?.[0];
				if (!c) throw new Error('Profile not found');
				contributor = c;
				resolved = c.id;
			}

			// Load profile data and stats in parallel
			const [profileResult, statsResult] = await Promise.all([
				nhost.graphql.request(GET_PUBLIC_PROFILE, { id: resolved }),
				nhost.graphql.request(GET_USER_STATS, { userId: resolved })
			]);

			// Handle profile data
			if (profileResult.error)
				throw Array.isArray(profileResult.error)
					? new Error(profileResult.error.map((e: any) => e.message).join('; '))
					: profileResult.error;
			contributor = contributor || (profileResult.data as any)?.contributor_by_pk || null;
			discussions = (profileResult.data as any)?.discussion || [];
			posts = (profileResult.data as any)?.post || [];
			if (!contributor) throw new Error('Profile not found');

			// Handle stats data
			if (statsResult.error) {
				console.warn('Failed to load user stats:', statsResult.error);
				// Keep default stats values
			} else if (statsResult.data) {
				stats = calculateUserStats(statsResult.data);
			}
		} catch (e: any) {
			const msg = e?.message || String(e);
			if (/field\s+'?contributor_by_pk'?\s+not\s+found\s+in\s+type/i.test(msg)) {
				error = 'Profile is not publicly available. Sign in to view.';
			} else {
				error = msg || 'Failed to load profile';
			}
		} finally {
			loading = false;
			statsLoading = false;
		}
	}

	onMount(load);
</script>

<div class="profile-public-container">
	{#if loading}
		<p>Loading…</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if contributor}
		<header class="profile-header">
			<h1>{displayName(contributor.display_name)}</h1>
			{#if contributor.bio}
				<p class="bio">{contributor.bio}</p>
			{/if}
			<div class="links">
				{#if contributor.website}
					<a class="link website" href={contributor.website} target="_blank" rel="noopener">
						{websiteLabel(contributor.website)}
					</a>
				{/if}
				{#if contributor.social_links}
					{#each Object.entries(contributor.social_links) as [key, val]}
						{#if val}
							{@const href = getSocialLink(key, String(val))}
							{#if href}
								<a
									class="link icon"
									{href}
									target="_blank"
									rel="noopener"
									title={key}
									aria-label={key}
								>
									{@html socialIcon(key)}
									<span class="sr-only">{key}</span>
								</a>
							{/if}
						{/if}
					{/each}
				{/if}
			</div>
		</header>

		<!-- Stats Section -->
		<section class="profile-section stats-section">
			<h2>Statistics</h2>
			<div class="stats-container">
				<div class="stat-item">
					<h3 class="stat-title">Good-Faith Rate</h3>
					<p class="stat-value">
						{#if statsLoading}
							<span class="loading-text">...</span>
						{:else}
							{stats.goodFaithRate}%
						{/if}
					</p>
				</div>
				<div class="stat-item">
					<h3 class="stat-title">Source Accuracy</h3>
					<p class="stat-value">
						{#if statsLoading}
							<span class="loading-text">...</span>
						{:else}
							{stats.sourceAccuracy}%
						{/if}
					</p>
				</div>
				<div class="stat-item">
					<h3 class="stat-title">Reputation Score</h3>
					<p class="stat-value">
						{#if statsLoading}
							<span class="loading-text">...</span>
						{:else}
							{stats.reputationScore.toLocaleString()}
						{/if}
					</p>
				</div>
			</div>
			<div class="activity-summary">
				<p class="activity-item">
					<span class="activity-count">{stats.totalDiscussions.toLocaleString()}</span>
					<span class="activity-label">discussions created</span>
				</p>
				<p class="activity-item">
					<span class="activity-count">{stats.totalPosts.toLocaleString()}</span>
					<span class="activity-label">comments posted</span>
				</p>
				<p class="activity-item">
					<span class="activity-count">{stats.participatedDiscussions.toLocaleString()}</span>
					<span class="activity-label">discussions joined</span>
				</p>
			</div>
		</section>

		<section class="profile-section">
			<h2>Discussions</h2>
			{#if discussions.length === 0}
				<p>No discussions yet.</p>
			{:else}
				<ul class="list">
					{#each discussions as d}
						<li class="item discussion-title">
							<a href={`/discussions/${d.id}`}>{d.current_version?.[0]?.title || d.draft_version?.[0]?.title || 'Untitled Discussion'}</a>
							<span class="meta">· {new Date(d.created_at).toLocaleString()}</span>
						</li>
						<hr />
					{/each}
				</ul>
			{/if}
		</section>

		<section class="profile-section">
			<h2>Comments</h2>
			{#if posts.length === 0}
				<p>No comments yet.</p>
			{:else}
				<ul class="list">
					{#each posts as p}
						<li class="item">
							<a href={`/discussions/${p.discussion_id}`}>{toTextSnippet(p.content)}</a>
							<span class="meta">· {new Date(p.created_at).toLocaleString()}</span>
						</li>
						<hr />
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<style>
	.profile-public-container {
		max-width: 900px;
		margin: 2rem auto;
		padding: 1rem;
	}
	.profile-header h1 {
		margin: 0 0 0.25rem 0;
	}
	.bio {
		color: var(--color-text-secondary);
		margin: 0.5rem 0 0.75rem;
	}
	.links {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.links .link {
		color: var(--color-primary);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.links .link.icon {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
	}
	.links .link.icon:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
	}
	.links .link:hover {
		text-decoration: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.profile-section {
		margin-top: 1.5rem;
	}
	.list {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.item a {
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.item a:hover {
		text-decoration: underline;
	}
	.meta {
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		margin-left: 0.35rem;
	}
	.error {
		color: var(--color-accent);
	}
	.discussion-title {
		font-weight: 600;
	}

	/* Stats Section */
	.stats-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 1.5rem;
		margin-top: 1.5rem;
	}

	.stats-container {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.stat-item {
		padding: 0.75rem;
		border-radius: var(--border-radius-sm);
		transition: background-color 150ms ease-in-out;
		background-color: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		text-align: center;
		flex: 1;
		min-width: 0;
	}

	.stat-item:hover {
		background-color: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface-alt));
	}

	.stat-title {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		margin: 0 0 0.25rem 0;
		line-height: 1.2;
	}

	.stat-value {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
		line-height: 1.2;
	}

	.loading-text {
		color: var(--color-text-secondary);
		font-weight: 400;
	}

	.activity-summary {
		display: flex;
		flex-direction: row;
		justify-content: space-around;
		gap: 1rem;
		border-top: 1px solid var(--color-border);
		padding-top: 1.5rem;
	}

	.activity-item {
		text-align: center;
		margin: 0;
	}

	.activity-count {
		display: block;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-primary);
		margin-bottom: 0.25rem;
	}

	.activity-label {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	@media (max-width: 768px) {
		.stats-container {
			flex-direction: row;
			gap: 0.5rem;
		}

		.activity-summary {
			flex-direction: row;
			gap: 0.75rem;
		}
	}

	@media (max-width: 560px) {
		.profile-public-container {
			padding: 0.75rem;
		}
		.stats-section {
			padding: 1rem;
		}
	}
</style>
