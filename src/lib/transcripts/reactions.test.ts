import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extractReactions, reactionsAfterQuote } from './reactions.ts';
import { alignQuote } from './align.ts';
import type { ScribeTranscript } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const hegseth = JSON.parse(
	readFileSync(resolve(here, '__fixtures__/hegseth.json'), 'utf-8')
) as ScribeTranscript;
const nrcc = JSON.parse(
	readFileSync(resolve(here, '__fixtures__/nrcc.json'), 'utf-8')
) as ScribeTranscript;

describe('extractReactions', () => {
	it('returns an empty list when the transcript has no reactions', () => {
		expect(extractReactions(hegseth)).toEqual([]);
	});

	it('captures every canonical reaction type in a multi-reaction transcript', () => {
		const reactions = extractReactions(nrcc);
		const types = new Set(reactions.map((r) => r.type));
		// Observed in the sample:
		expect(types.has('applause')).toBe(true);
		expect(types.has('cheering')).toBe(true);
		expect(types.has('clapping')).toBe(true);
		expect(types.has('laughs')).toBe(true);
	});

	it('orders reactions by start time', () => {
		const reactions = extractReactions(nrcc);
		for (let i = 1; i < reactions.length; i++) {
			expect(reactions[i].startSec).toBeGreaterThanOrEqual(reactions[i - 1].startSec);
		}
	});

	it('attaches the originating speaker to each reaction', () => {
		const reactions = extractReactions(nrcc);
		// Every reaction should have a speaker ID (no orphans).
		for (const r of reactions) {
			expect(r.speakerId).not.toBeNull();
		}
	});
});

describe('reactionsAfterQuote', () => {
	it('surfaces crowd reactions that follow a rhetorical moment', () => {
		// "the mutilation of our children should not be allowed" is spoken in
		// the NRCC sample around 811s and is immediately followed by [applause].
		const aligned = alignQuote(
			nrcc,
			'the mutilation of our children should not be allowed'
		);
		expect(aligned).not.toBeNull();

		const reactions = reactionsAfterQuote(nrcc, aligned!, { windowSec: 5 });
		expect(reactions.length).toBeGreaterThan(0);
		// The first reaction should be within our window.
		expect(reactions[0].startSec - aligned!.endSec).toBeLessThanOrEqual(5);
		expect(reactions[0].type).toBe('applause');
	});

	it('returns nothing when no reaction falls within the window', () => {
		// The very first words of the Hegseth briefing have no nearby reaction.
		const aligned = alignQuote(hegseth, 'Wars of the past that dragged on');
		expect(aligned).not.toBeNull();
		expect(reactionsAfterQuote(hegseth, aligned!)).toEqual([]);
	});
});
