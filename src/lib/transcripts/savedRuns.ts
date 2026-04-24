/**
 * Remote persistence for the video-anchored prototype.
 *
 * Saved runs live in the `prototype_video_anchored_run` Hasura table
 * and are scoped to the signed-in user via a creator column + Hasura
 * permission rules (`creator = X-Hasura-User-Id`). Dedup per video is
 * enforced by a unique constraint on (creator, video_id); upserts
 * replace the previous row rather than accumulating duplicates.
 *
 * We split the shape in two:
 *
 * - `SavedRunSummary` — what's returned by `listSavedRuns()`. Cheap
 *   metadata only; no analysis or annotated JSON. Safe to render in
 *   the panel list without pulling megabytes per reload.
 * - `SavedRun` — the full row (including analysis + annotated),
 *   fetched lazily by `getSavedRun(id)` when the user clicks "Load".
 *
 * Transcripts themselves are still NOT persisted — they're multi-MB
 * and can be re-uploaded if the user wants to re-align. Analysis +
 * annotated are the only durable state.
 */

import { nhost } from '$lib/nhostClient';
import type { StructuredAnalysis, AnnotatedAnalysis } from './annotate.ts';
import {
	LIST_PROTOTYPE_VIDEO_RUNS,
	GET_PROTOTYPE_VIDEO_RUN,
	UPSERT_PROTOTYPE_VIDEO_RUN,
	DELETE_PROTOTYPE_VIDEO_RUN,
	DELETE_ALL_PROTOTYPE_VIDEO_RUNS
} from '$lib/graphql/queries/prototype-video-runs';

export interface SavedRunStats {
	aligned: number;
	failed: number;
	total: number;
}

/** Metadata-only view returned by listSavedRuns(). */
export interface SavedRunSummary {
	id: string;
	/** ISO timestamp — prefer updated_at so upserts bubble to the top. */
	savedAt: string;
	videoId: string;
	title: string;
	meta: string;
	stats?: SavedRunStats;
	modelUsed?: string | null;
	inputTokens?: number | null;
	outputTokens?: number | null;
	estimatedCostCents?: number | null;
	flattenedChars?: number | null;
}

/** Full row, including the heavy analysis + annotated payloads. */
export interface SavedRun extends SavedRunSummary {
	analysis: StructuredAnalysis;
	annotated: AnnotatedAnalysis;
}

export interface SaveRunInput {
	videoId: string;
	title: string;
	meta: string;
	analysis: StructuredAnalysis;
	annotated: AnnotatedAnalysis;
	stats?: SavedRunStats;
	modelUsed?: string | null;
	inputTokens?: number | null;
	outputTokens?: number | null;
	estimatedCostCents?: number | null;
	flattenedChars?: number | null;
}

/** Raw row shape returned by the GraphQL API (snake_case). */
interface PrototypeRunRow {
	id: string;
	video_id: string;
	title: string;
	meta: string;
	analysis?: StructuredAnalysis;
	annotated?: AnnotatedAnalysis;
	stats?: SavedRunStats | null;
	model_used?: string | null;
	input_tokens?: number | null;
	output_tokens?: number | null;
	estimated_cost_cents?: number | string | null;
	flattened_chars?: number | null;
	created_at: string;
	updated_at: string;
}

function toNumberOrNull(v: number | string | null | undefined): number | null {
	if (v === null || v === undefined) return null;
	if (typeof v === 'number') return v;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function toSummary(row: PrototypeRunRow): SavedRunSummary {
	return {
		id: row.id,
		// Use updated_at so upserts bubble to the top of the list.
		savedAt: row.updated_at ?? row.created_at,
		videoId: row.video_id,
		title: row.title,
		meta: row.meta,
		stats: row.stats ?? undefined,
		modelUsed: row.model_used ?? null,
		inputTokens: row.input_tokens ?? null,
		outputTokens: row.output_tokens ?? null,
		estimatedCostCents: toNumberOrNull(row.estimated_cost_cents),
		flattenedChars: row.flattened_chars ?? null
	};
}

function toFull(row: PrototypeRunRow): SavedRun {
	if (!row.analysis || !row.annotated) {
		// Shouldn't happen — GET_PROTOTYPE_VIDEO_RUN always selects both.
		throw new Error('[savedRuns] row missing analysis/annotated');
	}
	return {
		...toSummary(row),
		analysis: row.analysis,
		annotated: row.annotated
	};
}

function extractErrorMessage(err: unknown): string {
	if (!err) return 'Unknown error';
	if (Array.isArray(err)) {
		return err[0]?.message ?? 'GraphQL error';
	}
	if (typeof err === 'object' && err !== null && 'message' in err) {
		return String((err as { message: unknown }).message);
	}
	return String(err);
}

function requireCreatorId(): string {
	const user = nhost.getUserSession()?.user;
	if (!user?.id) {
		throw new Error(
			'You must be signed in to save runs. The prototype now persists to the database.'
		);
	}
	return user.id;
}

/**
 * Shape returned by the monkey-patched `nhost.graphql.request`
 * (see `nhostClient.ts`): it converts v4 `FetchResponse` into the
 * v3-style `{ data, error }` pair. TypeScript still sees the v4
 * type on the call site, so we cast through this alias.
 */
type V3Response<TData> = { data?: TData; error?: unknown };

async function gqlRequest<TData>(
	query: unknown,
	variables?: Record<string, unknown>
): Promise<V3Response<TData>> {
	// The monkey-patched client accepts either a DocumentNode or a
	// string. Both paths funnel into the same v3-shaped response.
	const result = (await nhost.graphql.request(query as never, variables as never)) as unknown;
	return result as V3Response<TData>;
}

/**
 * List saved runs for the current user. Returns an empty array if
 * the user isn't signed in (rather than throwing) so the panel can
 * just quietly hide itself.
 */
export async function listSavedRuns(): Promise<SavedRunSummary[]> {
	const user = nhost.getUserSession()?.user;
	if (!user?.id) return [];
	const result = await gqlRequest<{ prototype_video_anchored_run: PrototypeRunRow[] }>(
		LIST_PROTOTYPE_VIDEO_RUNS
	);
	if (result.error) {
		console.error('[savedRuns] list failed:', result.error);
		throw new Error(extractErrorMessage(result.error));
	}
	const rows = result.data?.prototype_video_anchored_run ?? [];
	return rows.map(toSummary);
}

/**
 * Fetch a single run with its full payload. Returns null if the row
 * doesn't exist or isn't visible to the caller.
 */
export async function getSavedRun(id: string): Promise<SavedRun | null> {
	const result = await gqlRequest<{
		prototype_video_anchored_run_by_pk: PrototypeRunRow | null;
	}>(GET_PROTOTYPE_VIDEO_RUN, { id });
	if (result.error) {
		console.error('[savedRuns] get failed:', result.error);
		throw new Error(extractErrorMessage(result.error));
	}
	const row = result.data?.prototype_video_anchored_run_by_pk ?? null;
	return row ? toFull(row) : null;
}

/**
 * Upsert a run. If a run with the same (creator, video_id) exists,
 * it's replaced. Returns the summary for the saved row.
 */
export async function saveRun(input: SaveRunInput): Promise<SavedRunSummary> {
	const creator = requireCreatorId();
	const variables = {
		creator,
		video_id: input.videoId || 'untitled',
		title: input.title ?? '',
		meta: input.meta ?? '',
		analysis: input.analysis,
		annotated: input.annotated,
		stats: input.stats ?? null,
		model_used: input.modelUsed ?? null,
		input_tokens: input.inputTokens ?? null,
		output_tokens: input.outputTokens ?? null,
		estimated_cost_cents: input.estimatedCostCents ?? null,
		flattened_chars: input.flattenedChars ?? null
	};
	const result = await gqlRequest<{
		insert_prototype_video_anchored_run_one: PrototypeRunRow | null;
	}>(UPSERT_PROTOTYPE_VIDEO_RUN, variables);
	if (result.error) {
		console.error('[savedRuns] save failed:', result.error);
		throw new Error(extractErrorMessage(result.error));
	}
	const row = result.data?.insert_prototype_video_anchored_run_one ?? null;
	if (!row) {
		throw new Error('Save returned no row');
	}
	return toSummary(row);
}

export async function deleteSavedRun(id: string): Promise<void> {
	const result = await gqlRequest<{
		delete_prototype_video_anchored_run_by_pk: { id: string } | null;
	}>(DELETE_PROTOTYPE_VIDEO_RUN, { id });
	if (result.error) {
		console.error('[savedRuns] delete failed:', result.error);
		throw new Error(extractErrorMessage(result.error));
	}
}

export async function clearAllSavedRuns(): Promise<void> {
	const result = await gqlRequest<{
		delete_prototype_video_anchored_run: { affected_rows: number } | null;
	}>(DELETE_ALL_PROTOTYPE_VIDEO_RUNS);
	if (result.error) {
		console.error('[savedRuns] clear-all failed:', result.error);
		throw new Error(extractErrorMessage(result.error));
	}
}

