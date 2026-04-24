<script lang="ts">
	/**
	 * PROTOTYPE — Video-anchored featured analysis view
	 *
	 * Split in two:
	 *
	 * 1. A hardcoded mock (kept intact for design iteration and for
	 *    reviewers who don't have admin credentials) — this is what
	 *    renders by default.
	 *
	 * 2. A "Dev: load real data" panel that lets an admin paste a
	 *    Scribe transcript JSON + a structured analysis JSON, POSTs
	 *    them to `/api/transcripts/annotate`, and swaps the returned
	 *    annotated analysis through `annotatedToExcerpts()` into the
	 *    same renderer. This is the first end-to-end exercise of the
	 *    transcript alignment pipeline.
	 *
	 * No scores, no band labels. "Characterize, don't score" — see
	 * content-guideline-characterize-not-score.md.
	 */
	import { onMount } from 'svelte';
	import VideoAnchoredAnalysis from '$lib/components/transcripts/VideoAnchoredAnalysis.svelte';
	import { annotatedToExcerpts } from '$lib/transcripts/toExcerpts';
	import type { Excerpt } from '$lib/transcripts/toExcerpts';
	import type { AnnotatedAnalysis, StructuredAnalysis } from '$lib/transcripts/annotate';
	import {
		listSavedRuns,
		getSavedRun,
		saveRun,
		deleteSavedRun,
		clearAllSavedRuns,
		type SavedRunSummary
	} from '$lib/transcripts/savedRuns';
	import { nhost } from '$lib/nhostClient';

	// ------------------------------------------------------------------
	// Mock data — illustrative only. Swap VIDEO_ID with a real source
	// once the pipeline is producing real annotated analyses.
	// ------------------------------------------------------------------

	const MOCK_VIDEO_ID = 'dQw4w9WgXcQ';
	const MOCK_TITLE = 'Trump Speaks at TPUSA Event';
	const MOCK_META = 'Turning Point USA — Charlie Kirk Tribute · October 2025';
	const MOCK_BLURB = 'Excerpt-anchored walkthrough. Click any finding to jump to that moment in the video.';

	const mockExcerpts: Excerpt[] = [
		{
			id: 'e1',
			category: 'good_faith',
			findingTitle: 'Acknowledgment of specific individuals',
			quote:
				'Thank you, Erika — you are an incredible woman, and Charlie would be so proud of the strength you are showing.',
			highlight: 'Charlie would be so proud',
			startSec: 42,
			endSec: 58,
			whyItMatters:
				'Naming and addressing real people grounds the remarks in concrete relationships rather than pure abstraction — a signal of good-faith engagement.'
		},
		{
			id: 'e2',
			category: 'cultish',
			findingTitle: 'In-group / out-group dichotomy',
			quote:
				'We love our country and they hate our country. It is really that simple — they hate everything we stand for.',
			highlight: 'they hate everything we stand for',
			startSec: 127,
			endSec: 141,
			whyItMatters:
				'Collapsing a diverse opposition into a single group that "hates" what "we" love is the classic in-group / out-group frame. It short-circuits policy disagreement into identity conflict.'
		},
		{
			id: 'e3',
			category: 'fallacy',
			findingTitle: 'Appeal to emotion',
			quote:
				'If we do not act now, everything your parents built — everything your grandparents fought for — will be gone. Gone forever.',
			highlight: 'will be gone. Gone forever',
			startSec: 214,
			endSec: 228,
			whyItMatters:
				'The argument moves by emotional stakes (loss of heritage) rather than evidence about what any specific policy would do. The feeling is the premise.'
		},
		{
			id: 'e4',
			category: 'fact',
			findingTitle: 'Claim: "crime is at a record high"',
			quote: 'Crime in our cities is at a record high — the highest it has ever been in American history.',
			highlight: 'highest it has ever been',
			startSec: 305,
			endSec: 316,
			whyItMatters:
				'FBI UCR data for the most recent reporting period shows violent crime trending down from its 2020 peak, not at a historic high. The framing is contradicted by the primary source the claim implicitly invokes.'
		},
		{
			id: 'e5',
			category: 'cultish',
			findingTitle: 'Loaded / sacred language',
			quote:
				'This is a movement — a righteous movement — and nothing, nothing, can stop what is coming.',
			highlight: 'nothing, nothing, can stop what is coming',
			startSec: 402,
			endSec: 415,
			whyItMatters:
				'Language borrowed from prophetic / inevitabilist registers ("righteous movement", "what is coming") treats the political project as a matter of destiny rather than choice. That frame makes disagreement feel like apostasy.'
		},
		{
			id: 'e6',
			category: 'fallacy',
			findingTitle: 'Ad hominem',
			quote:
				'These are not serious people. They are low-IQ, they are corrupt, and frankly most of them are not very smart.',
			highlight: 'low-IQ',
			startSec: 488,
			endSec: 499,
			whyItMatters:
				'The argument against the opposing position is replaced with an attack on the people holding it. The listener is given no reason to reject the underlying idea — only the speaker.'
		},
		{
			id: 'e7',
			category: 'good_faith',
			findingTitle: 'Concession of limits',
			quote:
				'I do not have all the answers on this one — nobody does. But we have to try something, because what we are doing now is not working.',
			highlight: 'I do not have all the answers',
			startSec: 573,
			endSec: 588,
			whyItMatters:
				'Admitting uncertainty about a difficult question is a good-faith move — it invites the audience into the problem rather than demanding trust in a fixed answer.'
		},
		{
			id: 'e8',
			category: 'fallacy',
			findingTitle: 'False dichotomy',
			quote: 'You either stand with us, or you stand with the people who want to destroy this country.',
			highlight: 'either stand with us, or',
			startSec: 651,
			endSec: 662,
			whyItMatters:
				'Two options are presented as the only options, but the space of actual positions — disagreement on specific policy, partial agreement, indifference, different priorities — is much larger. The construction pressures the listener past reasoning.'
		}
	];

	// ------------------------------------------------------------------
	// Live data state — populated when the admin panel successfully
	// fetches /api/transcripts/annotate. Falls back to the mock.
	// ------------------------------------------------------------------

	type Mode = 'mock' | 'live';

	let mode = $state<Mode>('mock');
	let liveVideoId = $state('');
	let liveTitle = $state('');
	let liveMeta = $state('');
	let liveExcerpts = $state<Excerpt[]>([]);
	let liveStats = $state<{
		aligned: number;
		failed: number;
		total: number;
	} | null>(null);

	const activeExcerpts = $derived(mode === 'live' ? liveExcerpts : mockExcerpts);
	const activeVideoId = $derived(mode === 'live' ? liveVideoId : MOCK_VIDEO_ID);
	const activeTitle = $derived(mode === 'live' ? liveTitle || 'Live analysis' : MOCK_TITLE);
	const activeMeta = $derived(mode === 'live' ? liveMeta : MOCK_META);

	// ------------------------------------------------------------------
	// Saved runs (remote — public.prototype_video_anchored_run). Scoped
	// to the signed-in user via Hasura permissions. We hit the DB lazily
	// so reloads / second looks don't re-incur Claude cost.
	// ------------------------------------------------------------------

	let savedRuns = $state<SavedRunSummary[]>([]);
	let savedRunsLoading = $state(false);
	let savedRunsError = $state<string | null>(null);
	let justSavedId = $state<string | null>(null);
	let isSignedIn = $state(false);

	async function refreshSavedRuns() {
		savedRunsLoading = true;
		savedRunsError = null;
		try {
			savedRuns = await listSavedRuns();
		} catch (err) {
			savedRunsError = err instanceof Error ? err.message : 'Failed to load saved runs';
			savedRuns = [];
		} finally {
			savedRunsLoading = false;
		}
	}

	onMount(() => {
		isSignedIn = !!nhost.getUserSession()?.user;
		// React to sign-in events so the list appears without a reload.
		const unsubscribe = nhost.sessionStorage.onChange((newSession) => {
			const nowSignedIn = !!newSession?.user;
			if (nowSignedIn !== isSignedIn) {
				isSignedIn = nowSignedIn;
				if (nowSignedIn) {
					refreshSavedRuns();
				} else {
					savedRuns = [];
				}
			}
		});
		if (isSignedIn) {
			refreshSavedRuns();
		}
		return () => {
			try {
				unsubscribe?.();
			} catch {
				/* ignore */
			}
		};
	});

	async function loadSavedRun(summary: SavedRunSummary) {
		savedRunsError = null;
		try {
			const run = await getSavedRun(summary.id);
			if (!run) {
				savedRunsError = 'Saved run not found (it may have been deleted).';
				await refreshSavedRuns();
				return;
			}
			const result = annotatedToExcerpts(run.annotated);
			liveExcerpts = result.excerpts;
			liveStats = {
				aligned: result.stats.aligned,
				failed: result.stats.failed,
				total: result.stats.totalExamples
			};
			liveVideoId = run.videoId;
			liveTitle = run.title;
			liveMeta = run.meta;
			mode = 'live';
			// Rehydrate the analysis field too so the user can re-run alignment
			// with tweaked options if they still have the transcript on hand.
			analysisText = JSON.stringify(run.analysis, null, 2);
			videoIdInput = run.videoId;
			titleInput = run.title;
			metaInput = run.meta;
			panelOpen = false;
			justSavedId = null;
		} catch (err) {
			savedRunsError = err instanceof Error ? err.message : 'Failed to load run';
		}
	}

	async function removeSavedRun(id: string) {
		if (!confirm('Remove this saved run? This cannot be undone.')) return;
		savedRunsError = null;
		try {
			await deleteSavedRun(id);
			await refreshSavedRuns();
		} catch (err) {
			savedRunsError = err instanceof Error ? err.message : 'Failed to delete run';
		}
	}

	async function clearSavedRuns() {
		if (!confirm(`Clear all ${savedRuns.length} saved runs?`)) return;
		savedRunsError = null;
		try {
			await clearAllSavedRuns();
			await refreshSavedRuns();
		} catch (err) {
			savedRunsError = err instanceof Error ? err.message : 'Failed to clear runs';
		}
	}

	function formatSavedAt(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	// ------------------------------------------------------------------
	// Dev loader panel — admin-gated on the server side. Here we just
	// collect the header and POST; the endpoint will 401 otherwise.
	// ------------------------------------------------------------------

	let panelOpen = $state(false);
	let adminSecret = $state('');
	let videoIdInput = $state('');
	let titleInput = $state('');
	let metaInput = $state('');
	let transcriptText = $state('');
	let analysisText = $state('');
	let panelError = $state<string | null>(null);
	let loading = $state(false);
	let analyzing = $state(false);
	let analyzeStatus = $state<string | null>(null);

	// Placeholders are lifted here because Svelte parses `{…}` in template
	// attribute values as expressions — literal braces in the placeholder
	// text would break compilation.
	const TRANSCRIPT_PLACEHOLDER =
		'{"language_code":"en","segments":[…]}';
	const ANALYSIS_PLACEHOLDER =
		'{"good_faith":[…],"logical_fallacies":[…],"cultish_language":[…],"fact_checking":[…]}';

	async function handleTranscriptFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		transcriptText = await file.text();
	}

	async function handleAnalysisFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		analysisText = await file.text();
	}

	/**
	 * Call /api/transcripts/analyze with the transcript and stuff the
	 * returned analysis into the analysis textarea. Separate from the
	 * full pipeline so the user can review/edit the analysis before
	 * running alignment.
	 */
	async function runAnalyze(): Promise<unknown | null> {
		panelError = null;
		analyzeStatus = null;
		let transcript: unknown;
		try {
			transcript = JSON.parse(transcriptText);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'parse failed';
			panelError = `Transcript JSON didn't parse (${msg}).`;
			return null;
		}
		if (!adminSecret.trim()) {
			panelError = 'Admin secret is required — this endpoint is admin-gated.';
			return null;
		}
		analyzing = true;
		try {
			const res = await fetch('/api/transcripts/analyze', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-admin-secret': adminSecret
				},
				body: JSON.stringify({ transcript })
			});
			if (!res.ok) {
				const body = await res.text();
				panelError = `Analyze server returned ${res.status}: ${body}`;
				return null;
			}
			const data = (await res.json()) as {
				analysis: unknown;
				flattenedChars?: number;
				usage?: { inputTokens: number; outputTokens: number };
			};
			analysisText = JSON.stringify(data.analysis, null, 2);
			const tokens = data.usage
				? ` · ${data.usage.inputTokens + data.usage.outputTokens} tokens`
				: '';
			analyzeStatus = `Analyzed ${data.flattenedChars ?? 0} chars of primary-speaker text${tokens}.`;
			return data.analysis;
		} catch (err) {
			panelError = err instanceof Error ? err.message : 'Unknown error';
			return null;
		} finally {
			analyzing = false;
		}
	}

	/** Convenience: analyze then immediately align + render. */
	async function runFullPipeline() {
		if (!videoIdInput.trim()) {
			panelError = 'Add a YouTube video ID first so we can render the player.';
			return;
		}
		const analysis = await runAnalyze();
		if (!analysis) return;
		await submit();
	}

	async function submit() {
		panelError = null;
		let transcript: unknown;
		let analysis: unknown;
		try {
			transcript = JSON.parse(transcriptText);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'parse failed';
			const snippet = transcriptText.slice(0, 60).replace(/\s+/g, ' ');
			panelError = `Transcript JSON didn't parse (${msg}). First chars seen: "${snippet}…"`;
			return;
		}
		try {
			analysis = JSON.parse(analysisText);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'parse failed';
			const snippet = analysisText.slice(0, 60).replace(/\s+/g, ' ');
			panelError = `Analysis JSON didn't parse (${msg}). First chars seen: "${snippet}…"`;
			return;
		}
		if (!videoIdInput.trim()) {
			panelError = 'A YouTube video ID is required so we can render the player.';
			return;
		}
		if (!adminSecret.trim()) {
			panelError = 'Admin secret is required — this endpoint is admin-gated.';
			return;
		}

		loading = true;
		try {
			const res = await fetch('/api/transcripts/annotate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-admin-secret': adminSecret
				},
				body: JSON.stringify({ transcript, analysis })
			});
			if (!res.ok) {
				const body = await res.text();
				panelError = `Server returned ${res.status}: ${body}`;
				return;
			}
			const data = (await res.json()) as { analysis: AnnotatedAnalysis };
			const result = annotatedToExcerpts(data.analysis);

			liveExcerpts = result.excerpts;
			liveStats = {
				aligned: result.stats.aligned,
				failed: result.stats.failed,
				total: result.stats.totalExamples
			};
			liveVideoId = videoIdInput.trim();
			liveTitle = titleInput.trim();
			liveMeta = metaInput.trim();
			mode = 'live';
			panelOpen = false;

			// Persist to the DB so we don't re-pay for this analysis next time.
			// Saves are scoped to the signed-in user; if nobody's signed in we
			// quietly skip (the mock + live excerpts still render either way).
			if (isSignedIn) {
				try {
					const saved = await saveRun({
						videoId: liveVideoId,
						title: liveTitle,
						meta: liveMeta,
						analysis: analysis as StructuredAnalysis,
						annotated: data.analysis,
						stats: liveStats ?? undefined
					});
					justSavedId = saved.id;
					await refreshSavedRuns();
				} catch (saveErr) {
					console.error('[prototype] failed to save run:', saveErr);
					savedRunsError =
						saveErr instanceof Error
							? `Saved to view but not to DB: ${saveErr.message}`
							: 'Saved to view but not to DB';
				}
			}
		} catch (err) {
			panelError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	function resetToMock() {
		mode = 'mock';
		liveStats = null;
	}
</script>

<svelte:head>
	<title>Prototype — Video-anchored featured analysis</title>
</svelte:head>

<div class="proto-shell">
	<div class="proto-strip">
		<span class="proto-label">PROTOTYPE</span>
		<span class="mode-indicator" class:live={mode === 'live'}>
			{mode === 'live' ? 'LIVE data' : 'MOCK data'}
		</span>
		<button
			type="button"
			class="proto-btn"
			onclick={() => (panelOpen = !panelOpen)}
			aria-expanded={panelOpen}
		>
			{panelOpen ? 'Hide dev loader' : 'Dev: load real data'}
		</button>
		{#if mode === 'live'}
			<button type="button" class="proto-btn subtle" onclick={resetToMock}>Back to mock</button>
		{/if}
		{#if liveStats}
			<span class="stats" aria-live="polite">
				{liveStats.aligned} aligned / {liveStats.total} examples
				{#if liveStats.failed > 0}
					<span class="warn">({liveStats.failed} unaligned, hidden)</span>
				{/if}
			</span>
		{/if}
	</div>

	{#if isSignedIn}
		<section class="saved-panel" aria-label="Saved runs">
			<header class="saved-header">
				<h2>
					Saved runs
					{#if savedRuns.length > 0}<span class="saved-count">({savedRuns.length})</span>{/if}
				</h2>
				{#if savedRuns.length > 0}
					<button type="button" class="proto-btn subtle small" onclick={clearSavedRuns}>
						Clear all
					</button>
				{/if}
			</header>
			{#if savedRunsError}
				<p class="saved-error" role="alert">{savedRunsError}</p>
			{/if}
			{#if savedRunsLoading && savedRuns.length === 0}
				<p class="saved-empty">Loading your saved runs…</p>
			{:else if savedRuns.length === 0}
				<p class="saved-empty">
					No saved runs yet. Run an analysis below — we'll auto-save it so you don't pay twice for
					the same video.
				</p>
			{:else}
				<ul class="saved-list">
					{#each savedRuns as run (run.id)}
						<li class="saved-item" class:just-saved={justSavedId === run.id}>
							<button type="button" class="saved-load" onclick={() => loadSavedRun(run)}>
								<span class="saved-title">{run.title || 'Untitled'}</span>
								<span class="saved-meta">
									{#if run.meta}<span>{run.meta}</span>{/if}
									<span class="saved-time">{formatSavedAt(run.savedAt)}</span>
									{#if run.stats}
										<span class="saved-stats">
											{run.stats.aligned}/{run.stats.total} aligned
										</span>
									{/if}
								</span>
							</button>
							<button
								type="button"
								class="proto-btn subtle small"
								onclick={() => removeSavedRun(run.id)}
								aria-label="Delete saved run"
							>
								×
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{:else}
		<section class="saved-panel saved-panel--signin" aria-label="Saved runs">
			<p class="saved-empty">
				Sign in to save runs to the database — otherwise analyses will live only in this tab.
			</p>
		</section>
	{/if}

	{#if panelOpen}
		<section class="dev-panel" aria-label="Load real transcript + analysis">
			<p class="panel-intro">
				Paste an ElevenLabs Scribe transcript JSON and a structured analysis JSON. We'll POST them
				to <code>/api/transcripts/annotate</code>, run forced alignment, and render the result
				here. Admin-only — your secret never leaves the browser except in the <code
					>x-admin-secret</code
				>
				request header.
			</p>

			<div class="field-grid">
				<label class="field">
					<span>Admin secret</span>
					<input type="password" bind:value={adminSecret} autocomplete="off" />
				</label>
				<label class="field">
					<span>YouTube video ID</span>
					<input type="text" bind:value={videoIdInput} placeholder="dQw4w9WgXcQ" />
				</label>
				<label class="field">
					<span>Title (optional)</span>
					<input type="text" bind:value={titleInput} />
				</label>
				<label class="field">
					<span>Meta line (optional)</span>
					<input type="text" bind:value={metaInput} placeholder="Venue · Date" />
				</label>
			</div>

			<div class="field">
				<div class="field-label-row">
					<span>Scribe transcript JSON</span>
					<input type="file" accept="application/json,.json" onchange={handleTranscriptFile} />
				</div>
				<textarea
					bind:value={transcriptText}
					rows="6"
					placeholder={TRANSCRIPT_PLACEHOLDER}
				></textarea>
			</div>

			<div class="field">
				<div class="field-label-row">
					<span>Structured analysis JSON</span>
					<input type="file" accept="application/json,.json" onchange={handleAnalysisFile} />
				</div>
				<textarea
					bind:value={analysisText}
					rows="6"
					placeholder={ANALYSIS_PLACEHOLDER}
				></textarea>
			</div>

			{#if analyzeStatus}
				<p class="panel-status" aria-live="polite">{analyzeStatus}</p>
			{/if}
			{#if panelError}
				<p class="panel-error" role="alert">{panelError}</p>
			{/if}

			<div class="panel-actions">
				<button
					type="button"
					class="proto-btn"
					onclick={runAnalyze}
					disabled={analyzing || loading}
				>
					{analyzing ? 'Analyzing…' : '1 · Run analysis'}
				</button>
				<button type="button" class="proto-btn" onclick={submit} disabled={loading || analyzing}>
					{loading ? 'Aligning…' : '2 · Align and render'}
				</button>
				<button
					type="button"
					class="proto-btn primary"
					onclick={runFullPipeline}
					disabled={loading || analyzing}
				>
					{analyzing ? 'Analyzing…' : loading ? 'Aligning…' : 'Run full pipeline'}
				</button>
			</div>
		</section>
	{/if}
</div>

{#key mode + liveExcerpts.length}
	<VideoAnchoredAnalysis
		excerpts={activeExcerpts}
		videoId={activeVideoId}
		sourceTitle={activeTitle}
		sourceMeta={activeMeta}
		blurb={mode === 'mock' ? MOCK_BLURB : ''}
	/>
{/key}

<style>
	.proto-shell {
		max-width: 1280px;
		margin: 0 auto;
		padding: var(--space-sm) var(--space-fluid-sm) 0;
		font-family: var(--font-family-ui);
	}

	.proto-strip {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--color-surface-alt);
		border: 1px dashed var(--color-border);
		border-radius: 6px;
		font-size: var(--font-size-sm);
	}

	.proto-label {
		display: inline-block;
		font-size: var(--font-size-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		padding: 0.15rem 0.4rem;
		border: 1px dashed var(--color-border);
		border-radius: 4px;
		color: var(--color-text-tertiary);
	}

	.mode-indicator {
		font-size: var(--font-size-xs);
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		letter-spacing: 0.05em;
	}
	.mode-indicator.live {
		background: rgba(16, 185, 129, 0.12);
		color: #10b981;
	}

	.proto-btn {
		appearance: none;
		font-family: inherit;
		font-size: var(--font-size-sm);
		padding: 0.3rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-surface);
		color: var(--color-text-primary);
		cursor: pointer;
	}
	.proto-btn.primary {
		background: var(--color-link);
		border-color: var(--color-link);
		color: #fff;
	}
	.proto-btn.primary:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.proto-btn.subtle {
		background: transparent;
		color: var(--color-text-secondary);
	}
	.proto-btn:hover {
		border-color: var(--color-link);
	}

	.stats {
		margin-left: auto;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.stats .warn {
		color: #f59e0b;
		margin-left: 0.25rem;
	}

	.dev-panel {
		margin-top: var(--space-sm);
		padding: var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
	}

	.panel-intro {
		margin: 0 0 var(--space-sm);
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		line-height: 1.5;
	}
	.panel-intro code {
		font-family: var(--font-family-mono, monospace);
		font-size: var(--font-size-xs);
		background: var(--color-surface-alt);
		padding: 0.05rem 0.3rem;
		border-radius: 3px;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
		margin-bottom: var(--space-sm);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: var(--space-sm);
	}
	.field > span {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		letter-spacing: 0.02em;
		font-weight: 600;
	}
	.field-label-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	.field-label-row > span {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		letter-spacing: 0.02em;
		font-weight: 600;
	}
	.field input[type='text'],
	.field input[type='password'],
	.field textarea {
		font-family: var(--font-family-mono, monospace);
		font-size: var(--font-size-sm);
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-surface);
		color: var(--color-text-primary);
		width: 100%;
		box-sizing: border-box;
	}
	.field textarea {
		resize: vertical;
		min-height: 100px;
	}

	.panel-error {
		margin: var(--space-sm) 0 0;
		padding: 0.5rem 0.75rem;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: #ef4444;
		border-radius: 4px;
		font-size: var(--font-size-sm);
	}

	.panel-status {
		margin: var(--space-sm) 0 0;
		padding: 0.4rem 0.75rem;
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.3);
		color: #10b981;
		border-radius: 4px;
		font-size: var(--font-size-sm);
	}

	.panel-actions {
		margin-top: var(--space-sm);
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	/* ---------- saved runs panel ---------- */

	.saved-panel {
		margin-top: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
	}
	.saved-panel--signin {
		border-style: dashed;
		background: transparent;
	}

	.saved-error {
		margin: 0.25rem 0 0.5rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--color-danger, #d33);
		border-radius: 6px;
		background: color-mix(in srgb, var(--color-danger, #d33) 8%, transparent);
		color: var(--color-danger, #a00);
		font-size: var(--font-size-sm);
	}

	.saved-empty {
		margin: 0.25rem 0 0;
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
	}

	.saved-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.saved-header h2 {
		margin: 0;
		font-size: var(--font-size-sm);
		font-family: var(--font-family-ui);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		font-weight: 600;
	}
	.saved-count {
		color: var(--color-text-tertiary);
		font-weight: 400;
	}

	.saved-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.saved-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-surface);
		transition: border-color 0.15s ease, background 0.3s ease;
	}
	.saved-item.just-saved {
		border-color: #10b981;
		background: rgba(16, 185, 129, 0.06);
	}
	.saved-item:hover {
		border-color: var(--color-link);
	}

	.saved-load {
		appearance: none;
		background: transparent;
		border: none;
		padding: 0.1rem 0.25rem;
		flex: 1;
		min-width: 0;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.saved-title {
		font-weight: 600;
		font-size: var(--font-size-sm);
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.saved-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
	}
	.saved-time {
		font-variant-numeric: tabular-nums;
	}
	.saved-stats {
		color: #10b981;
	}

	.proto-btn.small {
		padding: 0.15rem 0.5rem;
		font-size: var(--font-size-xs);
	}
</style>
