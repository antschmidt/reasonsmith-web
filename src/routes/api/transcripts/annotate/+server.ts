/**
 * POST /api/transcripts/annotate
 *
 * Body: { transcript: ScribeTranscript, analysis: StructuredAnalysis, options?: AnnotateOptions }
 * Returns: { analysis: AnnotatedAnalysis }
 *
 * Pure, stateless endpoint. The caller owns storage — this route
 * runs alignment + reaction extraction and returns the annotated
 * analysis. Admin-gated via x-admin-secret so we can safely expose
 * it to the admin UI without opening it to the public.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { annotateAnalysis } from '$lib/transcripts/annotate';
import type {
	AnnotateOptions,
	StructuredAnalysis
} from '$lib/transcripts/annotate';
import type { ScribeTranscript } from '$lib/transcripts/types';

interface AnnotateRequestBody {
	transcript: ScribeTranscript;
	analysis: StructuredAnalysis;
	options?: AnnotateOptions;
}

function isScribeTranscript(v: unknown): v is ScribeTranscript {
	if (!v || typeof v !== 'object') return false;
	const t = v as Record<string, unknown>;
	return typeof t.language_code === 'string' && Array.isArray(t.segments);
}

function isStructuredAnalysis(v: unknown): v is StructuredAnalysis {
	if (!v || typeof v !== 'object') return false;
	// Lax check — we just need it to be an object. The annotate function
	// tolerates missing category arrays.
	return true;
}

export const POST: RequestHandler = async ({ request }) => {
	const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET || env.HASURA_ADMIN_SECRET;
	if (!adminSecret) {
		logger.error('[transcripts/annotate] admin secret not configured');
		throw error(500, 'Server configuration error');
	}

	const presented = request.headers.get('x-admin-secret');
	if (presented !== adminSecret) {
		throw error(401, 'Unauthorized');
	}

	let body: AnnotateRequestBody;
	try {
		body = (await request.json()) as AnnotateRequestBody;
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (!isScribeTranscript(body.transcript)) {
		throw error(400, 'Missing or invalid "transcript" — expected an ElevenLabs Scribe JSON');
	}
	if (!isStructuredAnalysis(body.analysis)) {
		throw error(400, 'Missing or invalid "analysis"');
	}

	try {
		const annotated = annotateAnalysis(body.transcript, body.analysis, body.options ?? {});
		logger.info(
			`[transcripts/annotate] aligned ${annotated._alignment?.aligned}/${annotated._alignment?.totalExamples} examples (speaker=${annotated._alignment?.speakerId})`
		);
		return json({ analysis: annotated });
	} catch (err) {
		logger.error('[transcripts/annotate] annotation failed:', err);
		const message = err instanceof Error ? err.message : 'Annotation failed';
		return json({ error: message }, { status: 500 });
	}
};
