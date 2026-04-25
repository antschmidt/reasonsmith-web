<script lang="ts">
	/**
	 * PROTOTYPE — Video-anchored featured analysis view
	 *
	 * Data source is the `prototype_video_anchored_run` table (scoped
	 * per-user via Hasura permissions). On mount we fetch the list of
	 * saved runs for the signed-in user and auto-load the most recent
	 * one into the viewer. The dev loader at the top of the page lets
	 * an admin paste a Scribe transcript + structured analysis, POSTs
	 * to `/api/transcripts/annotate`, saves the result, and re-renders.
	 *
	 * No mock fallback — when there are no saved runs the page shows an
	 * empty state pointing the user at the loader. Signed-out visitors
	 * see a sign-in prompt.
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
	// View state — populated from `prototype_video_anchored_run` rows,
	// either on initial load (most recent run) or when the user picks
	// a different run from the saved-runs panel, or after running the
	// dev loader to produce + save a fresh analysis.
	// ------------------------------------------------------------------

	let loadedRunId = $state<string | null>(null);
	let viewVideoId = $state('');
	let viewTitle = $state('');
	let viewMeta = $state('');
	let viewExcerpts = $state<Excerpt[]>([]);
	let viewStats = $state<{
		aligned: number;
		failed: number;
		total: number;
	} | null>(null);

	const hasLoadedRun = $derived(viewExcerpts.length > 0);

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

	async function refreshSavedRuns(): Promise<SavedRunSummary[]> {
		savedRunsLoading = true;
		savedRunsError = null;
		try {
			savedRuns = await listSavedRuns();
			return savedRuns;
		} catch (err) {
			savedRunsError = err instanceof Error ? err.message : 'Failed to load saved runs';
			savedRuns = [];
			return [];
		} finally {
			savedRunsLoading = false;
		}
	}

	function clearView() {
		loadedRunId = null;
		viewExcerpts = [];
		viewStats = null;
		viewVideoId = '';
		viewTitle = '';
		viewMeta = '';
	}

	onMount(() => {
		isSignedIn = !!nhost.getUserSession()?.user;
		// React to sign-in events so the list appears without a reload.
		const unsubscribe = nhost.sessionStorage.onChange(async (newSession) => {
			const nowSignedIn = !!newSession?.user;
			if (nowSignedIn !== isSignedIn) {
				isSignedIn = nowSignedIn;
				if (nowSignedIn) {
					const rows = await refreshSavedRuns();
					if (rows[0]) await loadSavedRun(rows[0]);
				} else {
					savedRuns = [];
					clearView();
				}
			}
		});
		if (isSignedIn) {
			// Auto-load the most recent run so the page isn't blank on arrival.
			refreshSavedRuns().then((rows) => {
				if (rows[0] && !loadedRunId) void loadSavedRun(rows[0]);
			});
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
			viewExcerpts = result.excerpts;
			viewStats = {
				aligned: result.stats.aligned,
				failed: result.stats.failed,
				total: result.stats.totalExamples
			};
			viewVideoId = run.videoId;
			viewTitle = run.title;
			viewMeta = run.meta;
			loadedRunId = run.id;
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
			const rows = await refreshSavedRuns();
			// If we just deleted what was on screen, advance to the next most
			// recent run (or clear the view entirely if there's nothing left).
			if (loadedRunId === id) {
				if (rows[0]) await loadSavedRun(rows[0]);
				else clearView();
			}
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
			clearView();
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

			viewExcerpts = result.excerpts;
			viewStats = {
				aligned: result.stats.aligned,
				failed: result.stats.failed,
				total: result.stats.totalExamples
			};
			viewVideoId = videoIdInput.trim();
			viewTitle = titleInput.trim();
			viewMeta = metaInput.trim();
			panelOpen = false;

			// Persist to the DB so we don't re-pay for this analysis next time.
			// Saves are scoped to the signed-in user; if nobody's signed in the
			// call falls through without a row, but the view still renders.
			if (isSignedIn) {
				try {
					const saved = await saveRun({
						videoId: viewVideoId,
						title: viewTitle,
						meta: viewMeta,
						analysis: analysis as StructuredAnalysis,
						annotated: data.analysis,
						stats: viewStats ?? undefined
					});
					justSavedId = saved.id;
					loadedRunId = saved.id;
					await refreshSavedRuns();
				} catch (saveErr) {
					console.error('[prototype] failed to save run:', saveErr);
					savedRunsError =
						saveErr instanceof Error
							? `Rendered but not saved: ${saveErr.message}`
							: 'Rendered but not saved';
				}
			}
		} catch (err) {
			panelError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Prototype — Video-anchored featured analysis</title>
</svelte:head>

<div class="proto-shell">
	<div class="proto-strip">
		<span class="proto-label">PROTOTYPE</span>
		<button
			type="button"
			class="proto-btn"
			onclick={() => (panelOpen = !panelOpen)}
			aria-expanded={panelOpen}
		>
			{panelOpen ? 'Hide dev loader' : 'Dev: load real data'}
		</button>
		{#if viewStats}
			<span class="stats" aria-live="polite">
				{viewStats.aligned} aligned / {viewStats.total} examples
				{#if viewStats.failed > 0}
					<span class="warn">({viewStats.failed} unaligned, hidden)</span>
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

{#if hasLoadedRun}
	{#key loadedRunId ?? viewExcerpts.length}
		<VideoAnchoredAnalysis
			excerpts={viewExcerpts}
			videoId={viewVideoId}
			sourceTitle={viewTitle || 'Analysis'}
			sourceMeta={viewMeta}
			blurb=""
		/>
	{/key}
{:else if isSignedIn && savedRunsLoading}
	<p class="empty-view">Loading your analyses…</p>
{:else if isSignedIn}
	<p class="empty-view">
		No analyses saved yet. Open the <strong>Dev: load real data</strong> panel above to run your
		first one — it'll be saved automatically so you won't re-pay for the same video.
	</p>
{:else}
	<p class="empty-view">Sign in to view saved analyses, or to run a new one.</p>
{/if}

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

	.empty-view {
		max-width: 1280px;
		margin: var(--space-md) auto;
		padding: var(--space-lg) var(--space-fluid-sm);
		border: 1px dashed var(--color-border);
		border-radius: 8px;
		background: var(--color-surface-alt);
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		text-align: center;
	}
	.empty-view strong {
		color: var(--color-text-primary);
	}
</style>
