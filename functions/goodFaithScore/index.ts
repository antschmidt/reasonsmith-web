/// <reference lib="es2020" />
// Remote function: score arbitrary text for good faith and (optionally) persist to a post row.
// Input JSON:
// {
//   "content": string,                // required text to score
//   "post_id"?: string,               // optional existing post id (draft or pending)
//   "persist"?: boolean,              // if true and post_id provided, update columns
//   "approve_if"?: number,            // if provided and score >= value, set status="approved"
//   "provider"?: 'auto'|'heuristic'|'openai' // default 'auto'
// }
// Output JSON:
// { good_faith_score, good_faith_label, approved?: boolean, provider: string, rationale?: string, flags?: string[], heuristic_used?: boolean }

import { getGoodFaithScoreLLM } from '../_lib/llm';

interface ScoreResult {
	good_faith_score: number;
	good_faith_label: string;
}

function heuristicScore(content: string): ScoreResult {
	const lower = content.toLowerCase();
	let score = 0.55;
	if (/(thank|appreciate|understand)/.test(lower)) score += 0.08;
	if (/(evidence|source|reference)/.test(lower)) score += 0.12;
	if (/(idiot|stupid|hate|dumb)/.test(lower)) score -= 0.35;
	if (/(you might be right|i see your point|let's clarify)/.test(lower)) score += 0.08;
	score = Math.max(0, Math.min(1, score));
	let label = 'neutral';
	if (score >= 0.75) label = 'constructive';
	else if (score >= 0.6) label = 'mostly constructive';
	else if (score <= 0.3) label = 'hostile';
	else if (score <= 0.45) label = 'questionable';
	return { good_faith_score: score, good_faith_label: label };
}

// Access environment via globalThis to remain runtime-agnostic (Node/Edge)
const envAny: any = (globalThis as any).process?.env || {};
const HASURA_GRAPHQL_ENDPOINT = envAny.HASURA_GRAPHQL_ENDPOINT || envAny.GRAPHQL_URL || '';
const HASURA_ADMIN_SECRET = envAny.HASURA_ADMIN_SECRET || '';

async function updatePost(postId: string, fields: Record<string, any>) {
	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_ADMIN_SECRET) return { error: 'Missing Hasura env' };
	const mutation = `mutation UpdatePost($id: uuid!, $set: post_set_input!) {
  update_post(where:{id:{_eq:$id}}, _set:$set) { returning { id status good_faith_score good_faith_label good_faith_rationale good_faith_flags } }
  }`;
	const res = await fetch(HASURA_GRAPHQL_ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-hasura-admin-secret': HASURA_ADMIN_SECRET
		},
		body: JSON.stringify({ query: mutation, variables: { id: postId, set: fields } })
	});
	const json = await res.json();
	if (json.errors) return { error: json.errors[0]?.message || 'Unknown Hasura error' };
	return { data: json.data.update_post?.returning?.[0] };
}

export default async function handler(req: Request): Promise<Response> {
	// Handle CORS preflight
	if (req.method === 'OPTIONS') {
		return new Response(null, {
			status: 200,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				'Access-Control-Max-Age': '86400'
			}
		});
	}

	const corsHeaders = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization'
	};

	if (req.method !== 'POST')
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: corsHeaders
		});
	try {
		const body = await req.json().catch((e) => {
			console.error('JSON parse error:', e);
			return {};
		});
		const { content, post_id, persist, approve_if, provider } = body as {
			content?: string;
			post_id?: string;
			persist?: boolean;
			approve_if?: number;
			provider?: 'auto' | 'heuristic' | 'openai';
		};
		if (!content || typeof content !== 'string' || !content.trim()) {
			return new Response(JSON.stringify({ error: 'content required' }), {
				status: 400,
				headers: corsHeaders
			});
		}
		const mode = provider || 'auto';
		let llm: {
			score: number;
			label: string;
			rationale?: string;
			flags?: string[];
			provider: string;
		} | null = null;
		let llmError: string | null = null;
		if (mode !== 'heuristic') {
			try {
				if (mode === 'openai' || mode === 'auto') {
					llm = await getGoodFaithScoreLLM(content);
				}
			} catch (e: any) {
				llmError = e?.message || 'llm_failed';
			}
		}
		const heuristic = heuristicScore(content);
		const usedHeuristicOnly = !llm;
		const finalScore = llm?.score ?? heuristic.good_faith_score;
		const finalLabel = llm?.label ?? heuristic.good_faith_label;
		const rationale = llm?.rationale;
		const flags = llm?.flags;
		let approved = false;
		if (persist && post_id) {
			const set: Record<string, any> = {
				good_faith_score: finalScore,
				good_faith_label: finalLabel,
				good_faith_last_evaluated: new Date().toISOString()
			};
			if (rationale) set.good_faith_rationale = rationale;
			if (flags) set.good_faith_flags = JSON.stringify(flags);
			if (typeof approve_if === 'number' && finalScore >= approve_if) {
				set.status = 'approved';
				set.content = content; // ensure final content persisted
				set.draft_content = '';
				approved = true;
			}
			const upd = await updatePost(post_id, set);
			if (upd.error)
				return new Response(JSON.stringify({ error: upd.error }), {
					status: 500,
					headers: corsHeaders
				});
		}
		return new Response(
			JSON.stringify({
				good_faith_score: finalScore,
				good_faith_label: finalLabel,
				approved,
				provider: llm ? llm.provider : 'heuristic',
				rationale,
				flags,
				heuristic_used: usedHeuristicOnly,
				llm_error: llmError || undefined
			}),
			{ status: 200, headers: corsHeaders }
		);
	} catch (e: any) {
		console.error('Handler error:', e);
		return new Response(
			JSON.stringify({ error: e?.message || 'Internal error', stack: e?.stack }),
			{ status: 500, headers: corsHeaders }
		);
	}
}
