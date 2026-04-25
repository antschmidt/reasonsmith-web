/**
 * POST /api/transcripts/analyze
 *
 * Body: { transcript: ScribeTranscript, options?: { speakerId?: string | null } }
 * Returns: { analysis: StructuredAnalysis }
 *
 * Admin-gated via `x-admin-secret`. Takes a Scribe transcript, flattens
 * it to plain text (primary speaker by default so songs/MCs don't leak
 * in), and runs the same featured-content Claude prompt used by
 * `/api/goodFaithClaudeFeatured` — minus the usage tracking, showcase
 * persistence, and multipass machinery.
 *
 * The system prompt and tool schema are duplicated here on purpose for
 * now: the existing featured endpoint has a lot of side-effects we
 * don't want in this lightweight admin path. When we're sure this
 * shape is stable we can lift both into a shared module and have both
 * endpoints import it.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { flattenTranscript } from '$lib/transcripts/flatten';
import type { ScribeTranscript } from '$lib/transcripts/types';
import type { StructuredAnalysis } from '$lib/transcripts/annotate';

const CLAUDE_MODEL = env.ANTHROPIC_MODEL ?? 'claude-opus-4-5';

const FEATURED_ANALYSIS_TOOL: Anthropic.Tool = {
	name: 'submit_analysis',
	description: 'Submit the complete rhetorical and argumentation analysis',
	input_schema: {
		type: 'object' as const,
		properties: {
			good_faith: {
				type: 'array',
				description: 'Good faith indicators found in the text',
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						description: { type: 'string' },
						examples: { type: 'array', items: { type: 'string' } },
						why: { type: 'string' }
					},
					required: ['name', 'description', 'examples', 'why']
				}
			},
			logical_fallacies: {
				type: 'array',
				description: 'Logical fallacies identified in the text',
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						description: { type: 'string' },
						examples: { type: 'array', items: { type: 'string' } },
						why: { type: 'string' }
					},
					required: ['name', 'description', 'examples', 'why']
				}
			},
			cultish_language: {
				type: 'array',
				description: 'Cultish or manipulative language patterns',
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						description: { type: 'string' },
						examples: { type: 'array', items: { type: 'string' } },
						why: { type: 'string' }
					},
					required: ['name', 'description', 'examples', 'why']
				}
			},
			fact_checking: {
				type: 'array',
				description: 'Fact-checking results for verifiable claims',
				items: {
					type: 'object',
					properties: {
						claim: { type: 'string' },
						verdict: { type: 'string', enum: ['True', 'False', 'Misleading', 'Unverified'] },
						relevance: { type: 'string' },
						source: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								url: { type: 'string' }
							},
							required: ['name', 'url']
						}
					},
					required: ['claim', 'verdict', 'relevance']
				}
			},
			summary: {
				type: 'string',
				description: 'Comprehensive summary of the analysis (3-5 paragraphs)'
			}
		},
		required: ['good_faith', 'logical_fallacies', 'cultish_language', 'fact_checking', 'summary']
	}
};

// Trimmed version of the full featured system prompt. Keeps the
// educational framing and output format but drops the bulkier
// "summary" / "contextual evaluation" sections since we don't render
// summary in the video-anchored view. For the video-anchored prototype
// the important bit is: **quote examples verbatim from the source so
// alignment succeeds**.
const SYSTEM_PROMPT = `You are an expert educator in rhetoric, logic, and argumentation analysis. Your job is to surface good-faith moves, logical fallacies, cultish/manipulative language, and checkable factual claims in a transcript of a speech.

## CRITICAL: verbatim examples

The examples field in each finding MUST be quoted word-for-word from the source transcript. Downstream tooling performs forced alignment of every example back onto the audio timeline — paraphrased, reworded, or invented examples will fail alignment and be hidden. Copy the exact wording the speaker used, including any disfluencies or fragments. Short verbatim excerpts (one clause to one sentence) are ideal.

## Categories

### 1. Good faith indicators
Constructive moves: charitable interpretation, acknowledgment of complexity, evidence-based reasoning, intellectual humility, issue-focused discourse, contextual awareness. For each, say WHY it demonstrates good faith.

### 2. Logical fallacies
Name the fallacy with standard terminology, quote specific examples verbatim, explain the logical error, discuss the impact. Watch for: Ad Hominem, Straw Man, False Dichotomy, Appeal to Authority, Hasty Generalization, Slippery Slope, Circular Reasoning, Red Herring, Appeal to Emotion, Tu Quoque, No True Scotsman, Burden of Proof, Composition/Division.

### 3. Cultish / manipulative language
Us-vs-them framing, loaded language, thought-terminating clichés, absolute statements, dehumanization, crisis rhetoric, purity tests, sacred/profane framing. Explain HOW the language manipulates.

### 4. Fact checking
Identify verifiable empirical claims, assess centrality to the argument, mark True/False/Misleading/Unverified, cite a credible source when possible, explain why it matters.

## Output

Use the submit_analysis tool. Be comprehensive. Remember: examples must be verbatim from the transcript.`;

interface AnalyzeBody {
	transcript: ScribeTranscript;
	options?: { speakerId?: string | null };
}

function isScribeTranscript(v: unknown): v is ScribeTranscript {
	if (!v || typeof v !== 'object') return false;
	const t = v as Record<string, unknown>;
	return typeof t.language_code === 'string' && Array.isArray(t.segments);
}

export const POST: RequestHandler = async ({ request }) => {
	const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET || env.HASURA_ADMIN_SECRET;
	if (!adminSecret) {
		logger.error('[transcripts/analyze] admin secret not configured');
		throw error(500, 'Server configuration error');
	}
	if (request.headers.get('x-admin-secret') !== adminSecret) {
		throw error(401, 'Unauthorized');
	}

	if (!env.ANTHROPIC_API_KEY) {
		throw error(500, 'ANTHROPIC_API_KEY is not configured on the server');
	}

	let body: AnalyzeBody;
	try {
		body = (await request.json()) as AnalyzeBody;
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (!isScribeTranscript(body.transcript)) {
		throw error(400, 'Missing or invalid "transcript" — expected an ElevenLabs Scribe JSON');
	}

	const text = flattenTranscript(body.transcript, body.options ?? {});
	if (!text.trim()) {
		throw error(400, 'Transcript produced no analyzable text (try options.speakerId: null)');
	}

	logger.info(
		`[transcripts/analyze] flattened ${text.length} chars; calling ${CLAUDE_MODEL}`
	);

	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

	try {
		const message = await anthropic.messages.create({
			model: CLAUDE_MODEL,
			max_tokens: 16000,
			temperature: 0.2,
			system: SYSTEM_PROMPT,
			tools: [FEATURED_ANALYSIS_TOOL],
			tool_choice: { type: 'tool', name: 'submit_analysis' },
			messages: [
				{
					role: 'user',
					content: `Analyze the following speech transcript thoroughly using the submit_analysis tool. Remember: every example must be quoted VERBATIM from the text below so downstream alignment succeeds.\n\nTranscript:\n${text}`
				}
			]
		});

		const toolUse = message.content.find(
			(b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
		);
		if (!toolUse) {
			logger.error('[transcripts/analyze] no tool_use block in response');
			throw error(502, 'Claude did not return a tool_use response');
		}

		const analysis = toolUse.input as StructuredAnalysis;
		logger.info(
			`[transcripts/analyze] got ${(analysis.good_faith ?? []).length} good_faith, ${(analysis.logical_fallacies ?? []).length} fallacies, ${(analysis.cultish_language ?? []).length} cultish, ${(analysis.fact_checking ?? []).length} fact checks`
		);

		return json({
			analysis,
			usage: message.usage
				? {
						inputTokens: message.usage.input_tokens,
						outputTokens: message.usage.output_tokens
					}
				: undefined,
			flattenedChars: text.length
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		logger.error('[transcripts/analyze] Claude call failed:', err);
		const message = err instanceof Error ? err.message : 'Analysis failed';
		return json({ error: message }, { status: 502 });
	}
};
