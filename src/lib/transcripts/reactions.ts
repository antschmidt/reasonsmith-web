/**
 * Extract audience-reaction events from a Scribe transcript.
 *
 * Scribe emits events like `[applause]`, `[cheering]`, `[laughs]`
 * inline as bracketed tokens inside segment text (and as word tokens
 * in the `words` array). Each occurrence has its own start/end time
 * via the word it's anchored to, so we can surface audience response
 * right next to the quote that triggered it.
 */

import { REACTION_TOKENS, type Reaction, type ReactionToken, type ScribeTranscript } from './types.ts';

const REACTION_SET = new Set<string>(REACTION_TOKENS);

// Match a single bracketed token. The content is captured so we can
// check it against the reaction allow-list.
const BRACKET_RE = /\[([^\]]+)\]/;

/**
 * All reactions in the transcript, in time order.
 */
export function extractReactions(transcript: ScribeTranscript): Reaction[] {
	const out: Reaction[] = [];

	for (const seg of transcript.segments) {
		const speakerId = seg.speaker?.id ?? null;

		// Prefer word-level anchoring (exact start/end for the bracket token).
		// Scribe may emit the whole bracket as one word, or split as two
		// ("[audience" "clapping]"). We build a token by walking words and
		// tracking bracket depth so we capture both cases.
		let openIdx = -1;
		let openStart = 0;
		let buffer = '';

		for (let wi = 0; wi < seg.words.length; wi++) {
			const w = seg.words[wi];
			const text = w.text;
			if (!text) continue;

			if (openIdx === -1) {
				const hit = text.indexOf('[');
				if (hit === -1) continue;
				openIdx = wi;
				openStart = w.start_time;
				buffer = text.slice(hit + 1);

				const close = buffer.indexOf(']');
				if (close !== -1) {
					// Bracket opens and closes inside the same word.
					const content = buffer.slice(0, close).trim().toLowerCase();
					maybePushReaction(out, content, openStart, w.end_time, speakerId);
					openIdx = -1;
					buffer = '';
				}
			} else {
				const close = text.indexOf(']');
				if (close === -1) {
					buffer += ' ' + text;
				} else {
					buffer += ' ' + text.slice(0, close);
					const content = buffer.trim().toLowerCase();
					maybePushReaction(out, content, openStart, w.end_time, speakerId);
					openIdx = -1;
					buffer = '';
				}
			}
		}
	}

	return out;
}

function maybePushReaction(
	out: Reaction[],
	content: string,
	startSec: number,
	endSec: number,
	speakerId: string | null
): void {
	// Normalize multi-word reactions to a canonical form.
	const cleaned = content.replace(/\s+/g, ' ').trim();
	if (!REACTION_SET.has(cleaned)) return;
	out.push({
		type: cleaned as ReactionToken,
		startSec,
		endSec,
		speakerId
	});
}

export interface FindReactionsOptions {
	/**
	 * Window in seconds after the quote end in which a reaction
	 * counts as "following" the quote. Defaults to 5s — long enough
	 * that a crowd reaction has time to start, short enough that we
	 * don't attribute unrelated reactions.
	 */
	windowSec?: number;
	/**
	 * Also include reactions that overlap the quote itself (e.g. a
	 * cheer that starts while the speaker is still finishing the
	 * line). Off by default to keep attribution clean.
	 */
	includeOverlapping?: boolean;
}

/**
 * Reactions that fall within `windowSec` seconds *after* the end of
 * an aligned quote. Useful for showing "crowd cheered" badges next
 * to a finding in the UI.
 */
export function reactionsAfterQuote(
	transcript: ScribeTranscript,
	quote: { startSec: number; endSec: number },
	options: FindReactionsOptions = {}
): Reaction[] {
	const { windowSec = 5, includeOverlapping = false } = options;
	const windowEnd = quote.endSec + windowSec;

	return extractReactions(transcript).filter((r) => {
		if (includeOverlapping && r.startSec < quote.endSec && r.endSec > quote.startSec) {
			return true;
		}
		return r.startSec >= quote.endSec && r.startSec <= windowEnd;
	});
}
