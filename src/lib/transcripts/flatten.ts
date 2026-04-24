/**
 * Flatten a Scribe transcript to a plain text string suitable for
 * feeding into an LLM analysis prompt.
 *
 * This differs from `buildNormalizedStream` in `align.ts`: that one
 * normalizes for substring matching (lowercased, punctuation soft-
 * ened, brackets stripped). Here we preserve the original casing and
 * punctuation so the LLM returns examples that can be fed back into
 * `alignQuote` — which does its own normalization — and still match.
 *
 * Bracketed audio events (`[applause]`, `[laughter]`, …) are dropped
 * because they aren't speech and would clutter the analysis prompt.
 */

import { primarySpeaker } from './align.ts';
import type { ScribeTranscript } from './types.ts';

const BRACKETED_RE = /\[[^\]]*\]/g;

export interface FlattenOptions {
	/**
	 * Restrict to a single speaker. Defaults to the primary speaker
	 * (longest total speaking time). Pass `null` to include everyone
	 * (useful for panels or debates).
	 */
	speakerId?: string | null;
}

export function flattenTranscript(
	transcript: ScribeTranscript,
	opts: FlattenOptions = {}
): string {
	const speakerId =
		opts.speakerId === null
			? null
			: opts.speakerId ?? primarySpeaker(transcript) ?? null;

	const parts: string[] = [];
	for (const seg of transcript.segments) {
		if (speakerId && seg.speaker?.id !== speakerId) continue;
		// Prefer segment.text (preserves the author's casing/punctuation)
		// over rejoining words — the latter gives you fragment-y output.
		const cleaned = seg.text.replace(BRACKETED_RE, '').replace(/\s+/g, ' ').trim();
		if (cleaned) parts.push(cleaned);
	}
	return parts.join(' ');
}
