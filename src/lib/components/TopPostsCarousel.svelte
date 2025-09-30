<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { onMount } from 'svelte';

	let loading = true;
	let error: string | null = null;
	let slides: Array<{
		id: string;
		discussion_id: string;
		discussion_title: string;
		content_html: string;
		author_name: string;
		author_id: string;
		author_handle?: string | null;
		good_faith_score: number | null;
		good_faith_label?: string | null;
		comments_count: number;
		created_at: string;
	}> = [];

	const QUERY = `
    query TopPosts($limit: Int = 25) {
      post(
        where: { status: { _eq: "approved" } }
        order_by: [{ good_faith_score: desc_nulls_last }, { created_at: desc }]
        limit: $limit
      ) {
        id
        content
        created_at
        good_faith_score
        good_faith_label
        discussion { id title posts_aggregate { aggregate { count } } }
        contributor { id handle display_name }
      }
    }
  `;

	function toTextSnippet(html: string, max = 180): string {
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

	function displayName(name?: string | null): string {
		if (!name) return '';
		const n = String(name).trim();
		const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n);
		if (isEmail) return n.split('@')[0];
		return n;
	}

	function rankScore(s: {
		good_faith_score: number | null;
		comments_count: number;
		created_at: string;
	}) {
		const gf = (s.good_faith_score ?? 0) * 100; // 0-100
		const comments = s.comments_count;
		const recencyBoost = Math.max(
			0,
			30 - Math.min(30, (Date.now() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24))
		); // up to 30 points for recency
		return gf * 1.0 + comments * 3 + recencyBoost;
	}

	onMount(async () => {
		loading = true;
		error = null;
		try {
			// Ensure auth init for role header (even for anon)
			try {
				await nhost.auth.isAuthenticatedAsync();
			} catch {}
			const { data, error: gqlError } = await nhost.graphql.request(QUERY, { limit: 25 });
			if (gqlError)
				throw Array.isArray(gqlError)
					? new Error(gqlError.map((e: any) => e.message).join('; '))
					: gqlError;
			const rows = (data as any)?.post ?? [];
			const mapped = rows.map((p: any) => ({
				id: p.id,
				discussion_id: p.discussion?.id,
				discussion_title: p.discussion?.title || 'Discussion',
				content_html: toTextSnippet(p.content || ''),
				author_name: displayName(p.contributor?.display_name),
				author_id: p.contributor?.id,
				author_handle: p.contributor?.handle,
				good_faith_score: p.good_faith_score,
				good_faith_label: p.good_faith_label,
				comments_count: p.discussion?.posts_aggregate?.aggregate?.count ?? 0,
				created_at: p.created_at
			}));
			// Sort by combined rank and take top 10
			slides = mapped
				.sort((a: (typeof mapped)[0], b: (typeof mapped)[0]) => rankScore(b) - rankScore(a))
				.slice(0, 10);
		} catch (e: any) {
			const msg = e?.message || String(e);
			if (/field\s+'?post'?\s+not\s+found\s+in\s+type/i.test(msg)) {
				error = 'Top posts are not publicly available.';
			} else {
				error = msg;
			}
		} finally {
			loading = false;
		}
	});

	// Carousel state
	let index = 0;
	let timer: any = null;
	const interval = 6000;

	function startTimer() {
		stopTimer();
		timer = setInterval(() => {
			next();
		}, interval);
	}
	function stopTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}
	function next() {
		index = (index + 1) % (slides.length || 1);
	}
	function prev() {
		index = (index - 1 + (slides.length || 1)) % (slides.length || 1);
	}

	$: if (!loading && slides.length > 1) startTimer();
</script>
