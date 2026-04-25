/**
 * ElevenLabs Scribe transcript types.
 *
 * Matches the JSON shape returned by Scribe for YouTube / file-based
 * transcription. Word-level timestamps (including whitespace tokens)
 * are what make deterministic forced alignment possible.
 */

export interface ScribeWord {
	text: string; // single word or whitespace token
	start_time: number; // seconds, float
	end_time: number; // seconds, float
}

export interface ScribeSpeaker {
	id: string; // e.g. "speaker_0"
	name: string; // e.g. "Speaker 0" — Scribe assigns generic names
}

export interface ScribeSegment {
	text: string; // concatenated segment text (may contain bracketed events)
	start_time: number;
	end_time: number;
	speaker: ScribeSpeaker | null;
	words: ScribeWord[];
}

export interface ScribeTranscript {
	language_code: string;
	segments: ScribeSegment[];
}

/**
 * Canonical set of audience-reaction tokens Scribe emits inline as
 * bracketed tokens inside segment text. Extend as we observe more.
 */
export const REACTION_TOKENS = [
	'applause',
	'applauding',
	'audience clapping',
	'clapping',
	'cheering',
	'laughs',
	'laughing',
	'chuckles'
] as const;

export type ReactionToken = (typeof REACTION_TOKENS)[number];

export interface Reaction {
	type: ReactionToken;
	startSec: number;
	endSec: number;
	speakerId: string | null;
}

export interface AlignedQuote {
	startSec: number;
	endSec: number;
	/** Index of the first matched word in the flattened word stream. */
	wordIndex: number;
	/** Segment index containing the first matched word. */
	segmentIndex: number;
	/** Speaker ID of the segment the quote was found in. */
	speakerId: string | null;
}
