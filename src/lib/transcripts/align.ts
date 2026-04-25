/**
 * Forced alignment of extracted quotes onto an ElevenLabs Scribe
 * transcript.
 *
 * The problem: our LLM extraction pipeline emits a quote as text. We
 * need to know *when* in the video it was said. Scribe gives us
 * word-level start/end times, so alignment reduces to: find the quote
 * substring in the normalized transcript, then map the matched
 * character range back to word timestamps.
 *
 * Normalization strategy: lowercase, strip bracketed events,
 * collapse whitespace, drop punctuation that LLMs commonly add/drop
 * (quotation marks, em-dashes, ellipses). Keep enough structure that
 * word order is preserved and character offsets remain meaningful.
 *
 * Each character in the normalized string is tagged with the index of
 * the original Scribe word it came from, so once we find a match we
 * can look up the first and last source words and grab their
 * timestamps.
 */

import type { AlignedQuote, ScribeTranscript, ScribeWord } from './types.ts';

// ------------------------------------------------------------------
// Normalization
// ------------------------------------------------------------------

const BRACKETED_RE = /\[[^\]]*\]/g;
const WHITESPACE_RE = /\s+/g;
// Drop quotation marks, em/en dashes, ellipses — all things LLMs
// regularly introduce or elide. Keep letters, digits, and a few
// punctuation chars that tend to be stable (apostrophes in contractions).
const STRIP_PUNCT_RE = /[\u2013\u2014\u2026"'`"'""„‟‹›«»\[\]()]/g;
// Reduce remaining punctuation (., !, ?, ,, ;, :, -) to spaces so
// punctuation differences don't break substring matches.
const SOFT_PUNCT_RE = /[.,!?;:\-\/\\]+/g;

function normalizeText(s: string): string {
	return s
		.toLowerCase()
		.replace(BRACKETED_RE, ' ')
		.replace(STRIP_PUNCT_RE, '')
		.replace(SOFT_PUNCT_RE, ' ')
		.replace(WHITESPACE_RE, ' ')
		.trim();
}

// ------------------------------------------------------------------
// Per-character → source-word index mapping
// ------------------------------------------------------------------

interface NormalizedStream {
	text: string; // the normalized concatenated text
	/** For each character in `text`, the index into the flat words array. */
	charToWord: number[];
	/** Flat list of all (non-whitespace) source words from the transcript. */
	words: ScribeWord[];
	/** For each word index, the segment it came from. */
	wordToSegment: number[];
}

/**
 * Flatten the transcript into a single normalized string plus a
 * char→word index so we can go back from a substring match to real
 * word timestamps.
 *
 * Whitespace-only Scribe "words" are skipped — they contain no
 * signal and complicate the char→word bookkeeping. Word separation
 * in the normalized output is handled uniformly by inserting a
 * single space between each kept word.
 */
export function buildNormalizedStream(
	transcript: ScribeTranscript,
	opts: { speakerId?: string } = {}
): NormalizedStream {
	const words: ScribeWord[] = [];
	const wordToSegment: number[] = [];
	const parts: string[] = [];
	const charToWord: number[] = [];

	for (let si = 0; si < transcript.segments.length; si++) {
		const seg = transcript.segments[si];
		if (opts.speakerId && seg.speaker?.id !== opts.speakerId) continue;

		for (const w of seg.words) {
			// Skip whitespace-only word tokens — they carry no lexical content.
			if (!w.text.trim()) continue;

			const normWord = normalizeText(w.text);
			if (!normWord) continue; // e.g. a pure-bracket token

			if (parts.length > 0) {
				// Separator between kept words maps to the PREVIOUS word (so a
				// match ending at the space correctly claims the previous word).
				parts.push(' ');
				charToWord.push(words.length - 1);
			}

			for (let c = 0; c < normWord.length; c++) {
				charToWord.push(words.length);
			}
			parts.push(normWord);
			words.push(w);
			wordToSegment.push(si);
		}
	}

	return {
		text: parts.join(''),
		charToWord,
		words,
		wordToSegment
	};
}

// ------------------------------------------------------------------
// Alignment
// ------------------------------------------------------------------

export interface AlignOptions {
	/** Restrict search to a single speaker (e.g. the primary speaker). */
	speakerId?: string;
	/**
	 * Minimum quote length (after normalization) required for a match.
	 * Very short quotes match too promiscuously.
	 */
	minChars?: number;
}

/**
 * Try to locate a quote within the transcript. Returns null if the
 * quote cannot be found under the current normalization.
 */
export function alignQuote(
	transcript: ScribeTranscript,
	quote: string,
	opts: AlignOptions = {}
): AlignedQuote | null {
	const { speakerId, minChars = 12 } = opts;

	const needle = normalizeText(quote);
	if (needle.length < minChars) return null;

	const stream = buildNormalizedStream(transcript, { speakerId });
	if (!stream.text) return null;

	const idx = stream.text.indexOf(needle);
	if (idx === -1) return null;

	const firstWordIdx = stream.charToWord[idx];
	const lastWordIdx = stream.charToWord[idx + needle.length - 1];

	const first = stream.words[firstWordIdx];
	const last = stream.words[lastWordIdx];
	const segmentIndex = stream.wordToSegment[firstWordIdx];
	const speaker =
		segmentIndex != null ? transcript.segments[segmentIndex].speaker?.id ?? null : null;

	return {
		startSec: first.start_time,
		endSec: last.end_time,
		wordIndex: firstWordIdx,
		segmentIndex,
		speakerId: speaker
	};
}

/**
 * Identify the primary speaker heuristically: the speaker with the
 * longest total speaking time. Good enough to default to; callers
 * can override with an explicit ID.
 */
export function primarySpeaker(transcript: ScribeTranscript): string | null {
	const totals = new Map<string, number>();
	for (const seg of transcript.segments) {
		const id = seg.speaker?.id;
		if (!id) continue;
		const dur = seg.end_time - seg.start_time;
		totals.set(id, (totals.get(id) ?? 0) + dur);
	}
	let best: string | null = null;
	let bestDur = 0;
	for (const [id, dur] of totals) {
		if (dur > bestDur) {
			bestDur = dur;
			best = id;
		}
	}
	return best;
}
