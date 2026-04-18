<!--
  /editors-desk/[id] — Plan 5 curated showcase view.

  Renders a single Editors' Desk pick with inline curator annotations and
  optional curator note. Falls back to excerpt + editor_note if the pick is
  attached to a discussion rather than a specific post (annotations are only
  meaningful over a post's content).

  Auth: viewable by anyone who can see the pick per Hasura row-level rules
  (public/approved picks are readable by anonymous + public roles).
-->
<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import { GET_EDITORS_DESK_SHOWCASE } from '$lib/graphql/queries';
	import AnnotatedShowcaseView from '$lib/components/showcase/AnnotatedShowcaseView.svelte';
	import { getCuratorName } from '$lib/utils/editorsDeskUtils';

	type ShowcasePick = {
		id: string;
		title: string;
		excerpt: string | null;
		editor_note: string | null;
		curator_note: string | null;
		annotations: any[] | null;
		created_at: string;
		post_id: string | null;
		discussion_id: string | null;
		post?: {
			id: string;
			content: string | null;
			created_at: string | null;
			contributor?: {
				id: string;
				display_name: string | null;
				handle: string | null;
			} | null;
		} | null;
		userByCuratorId?: { display_name?: string | null } | null;
		discussion?: {
			id: string;
			discussion_versions?: Array<{
				title?: string | null;
				description?: string | null;
			}>;
		} | null;
	};

	let loading = $state(true);
	let error = $state<string | null>(null);
	let pick = $state<ShowcasePick | null>(null);

	const pickId = $derived($page.params.id);

	const authorName = $derived(
		pick?.post?.contributor?.display_name ||
			pick?.post?.contributor?.handle ||
			'Unknown author'
	);
	const curatorName = $derived(getCuratorName(pick?.userByCuratorId));
	const discussionTitle = $derived(
		pick?.discussion?.discussion_versions?.[0]?.title ?? null
	);
	const postContent = $derived(pick?.post?.content ?? '');

	onMount(async () => {
		try {
			const result: any = await nhost.graphql.request(GET_EDITORS_DESK_SHOWCASE, {
				id: pickId
			});
			if (result?.error) {
				error = Array.isArray(result.error)
					? result.error.map((e: any) => e.message).join('; ')
					: result.error?.message || 'Failed to load showcase.';
				return;
			}
			const data = result?.data?.editors_desk_pick_by_pk;
			if (!data) {
				error = 'Showcase not found — it may have been unpublished.';
				return;
			}
			pick = data;
		} catch (e: any) {
			error = e?.message || 'Failed to load showcase.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>{pick?.title ? `${pick.title} — Editors' Desk` : "Editors' Desk"}</title>
</svelte:head>

<main class="showcase-page">
	{#if loading}
		<p class="state-msg">Loading showcase…</p>
	{:else if error}
		<p class="state-msg error">{error}</p>
	{:else if pick}
		<header class="showcase-header">
			<p class="eyebrow">From the Editors' Desk</p>
			<h1 class="showcase-title">{pick.title}</h1>
			<p class="showcase-byline">
				By <strong>{authorName}</strong>
				· Curated by <strong>{curatorName}</strong>
			</p>
			{#if discussionTitle && pick.discussion_id}
				<p class="discussion-link">
					In reply to
					<a href={`/discussions/${pick.discussion_id}`}>{discussionTitle}</a>
				</p>
			{/if}
			{#if pick.editor_note}
				<aside class="editor-note" aria-label="Editor's note">
					<p class="label">Editor's note</p>
					<p class="body">{pick.editor_note}</p>
				</aside>
			{/if}
		</header>

		{#if postContent}
			<AnnotatedShowcaseView
				content={postContent}
				annotations={pick.annotations ?? []}
				curatorNote={pick.curator_note}
			/>
		{:else}
			<!-- No attached post content — fall back to the excerpt. Annotations
			     require post content to anchor to, so we skip them here. -->
			<section class="excerpt-fallback">
				{#if pick.curator_note}
					<aside class="curator-note-block" aria-label="Curator's note">
						<p class="label">Curator's note</p>
						<p class="body">{pick.curator_note}</p>
					</aside>
				{/if}
				{#if pick.excerpt}
					<p class="excerpt">{pick.excerpt}</p>
				{/if}
				{#if pick.discussion_id}
					<p class="view-original">
						<a href={`/discussions/${pick.discussion_id}`}>View the full discussion →</a>
					</p>
				{/if}
			</section>
		{/if}

		<footer class="showcase-footer">
			{#if pick.discussion_id}
				<a class="back-link" href={`/discussions/${pick.discussion_id}`}>
					← Back to the discussion
				</a>
			{:else}
				<a class="back-link" href="/">← Back to home</a>
			{/if}
		</footer>
	{/if}
</main>

<style>
	.showcase-page {
		max-width: 820px;
		margin: 0 auto;
		padding: clamp(1.25rem, 3vw, 2.5rem) clamp(1rem, 3vw, 2rem) 4rem;
	}

	.state-msg {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--color-text-secondary);
	}

	.state-msg.error {
		color: var(--color-danger, #b91c1c);
	}

	.showcase-header {
		margin-bottom: 2rem;
	}

	.eyebrow {
		margin: 0 0 0.35rem;
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-primary);
		font-weight: 600;
	}

	.showcase-title {
		margin: 0 0 0.6rem;
		font-family: var(--font-family-display, Georgia, serif);
		font-size: clamp(1.6rem, 3.5vw, 2.3rem);
		line-height: 1.15;
		color: var(--color-text-primary);
	}

	.showcase-byline {
		margin: 0 0 0.3rem;
		font-size: 0.95rem;
		color: var(--color-text-secondary);
	}

	.discussion-link {
		margin: 0 0 1.25rem;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
	}

	.discussion-link a {
		color: var(--color-primary);
		text-decoration: underline;
	}

	.editor-note {
		margin-top: 1.25rem;
		background: color-mix(in srgb, var(--color-accent, var(--color-primary)) 6%, transparent);
		border-left: 3px solid var(--color-accent, var(--color-primary));
		padding: 0.9rem 1rem;
		border-radius: var(--border-radius-md, 8px);
	}

	.editor-note .label,
	.curator-note-block .label {
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-primary);
		font-weight: 600;
	}

	.editor-note .body,
	.curator-note-block .body {
		margin: 0;
		font-style: italic;
		color: var(--color-text-primary);
	}

	.excerpt-fallback {
		padding: 1rem 0;
	}

	.excerpt {
		font-size: 1.05rem;
		line-height: 1.65;
		color: var(--color-text-primary);
	}

	.view-original {
		margin-top: 1.5rem;
	}

	.view-original a {
		color: var(--color-primary);
		font-weight: 600;
	}

	.showcase-footer {
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
	}

	.back-link {
		color: var(--color-text-secondary);
		font-size: 0.95rem;
		text-decoration: none;
	}

	.back-link:hover,
	.back-link:focus {
		color: var(--color-primary);
		text-decoration: underline;
	}
</style>
