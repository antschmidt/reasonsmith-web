import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { alignQuote, primarySpeaker, buildNormalizedStream } from './align.ts';
import type { ScribeTranscript } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const hegseth = JSON.parse(
	readFileSync(resolve(here, '__fixtures__/hegseth.json'), 'utf-8')
) as ScribeTranscript;
const nrcc = JSON.parse(
	readFileSync(resolve(here, '__fixtures__/nrcc.json'), 'utf-8')
) as ScribeTranscript;

describe('primarySpeaker', () => {
	it('identifies the solo speaker in a single-speaker transcript', () => {
		expect(primarySpeaker(hegseth)).toBe('speaker_0');
	});

	it('picks the highest-duration speaker in a multi-speaker transcript', () => {
		// speaker_2 dominates the NRCC recording (~290 of 322 segments)
		expect(primarySpeaker(nrcc)).toBe('speaker_2');
	});
});

describe('buildNormalizedStream', () => {
	it('produces a lowercased, punctuation-stripped stream', () => {
		const stream = buildNormalizedStream(hegseth);
		expect(stream.text).toMatch(/^wars of the past/);
		// No bracketed audio events should leak through.
		expect(stream.text).not.toMatch(/\[/);
	});

	it('filters by speaker when requested', () => {
		const only2 = buildNormalizedStream(nrcc, { speakerId: 'speaker_2' });
		const full = buildNormalizedStream(nrcc);
		expect(only2.text.length).toBeLessThan(full.text.length);
		// speaker_1 is a song; its lyric "proud to be an american" should NOT
		// appear in the speaker_2-only stream.
		expect(full.text).toMatch(/proud to be an american/);
		expect(only2.text).not.toMatch(/proud to be an american/);
	});
});

describe('alignQuote', () => {
	it('locates a verbatim quote and returns correct timestamps', () => {
		const result = alignQuote(
			hegseth,
			'Wars of the past that dragged on for years and for decades'
		);
		expect(result).not.toBeNull();
		// The sample starts with this exact phrase at ~0.24s.
		expect(result!.startSec).toBeCloseTo(0.24, 1);
		expect(result!.endSec).toBeLessThan(5);
		expect(result!.speakerId).toBe('speaker_0');
	});

	it('tolerates punctuation and quote-mark drift from the LLM', () => {
		// LLM might quote with stylized punctuation the transcript lacks.
		const result = alignQuote(
			hegseth,
			'"Operation Epic Fury has delivered a decisive military result — in just weeks."'
		);
		expect(result).not.toBeNull();
		// The phrase appears early in the first segment (0.24–35.38).
		expect(result!.startSec).toBeGreaterThan(0);
		expect(result!.startSec).toBeLessThan(35);
	});

	it('returns null for a quote that is not in the transcript', () => {
		const result = alignQuote(hegseth, 'this phrase definitely does not appear in the transcript');
		expect(result).toBeNull();
	});

	it('rejects quotes that are too short to align uniquely', () => {
		const result = alignQuote(hegseth, 'the');
		expect(result).toBeNull();
	});

	it('can restrict alignment to a specific speaker', () => {
		// "proud to be an american" only appears in speaker_1 (the song).
		const whole = alignQuote(nrcc, 'proud to be an american');
		expect(whole).not.toBeNull();
		expect(whole!.speakerId).toBe('speaker_1');

		// Searching in speaker_2 only should fail.
		const restricted = alignQuote(nrcc, 'proud to be an american', {
			speakerId: 'speaker_2'
		});
		expect(restricted).toBeNull();
	});
});
