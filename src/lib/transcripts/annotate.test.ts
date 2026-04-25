import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { annotateAnalysis } from './annotate.ts';
import type { StructuredAnalysis } from './annotate.ts';
import type { ScribeTranscript } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const nrcc = JSON.parse(
	readFileSync(resolve(here, '__fixtures__/nrcc.json'), 'utf-8')
) as ScribeTranscript;

function sampleAnalysis(): StructuredAnalysis {
	return {
		good_faith: [
			{
				name: 'Acknowledging the audience',
				description: 'Names the room.',
				examples: [
					// verbatim from speaker_2 ~624s, followed by laughter within ~5s
					"I can't see a thing in the audience, but what the hell? I know you're all friends."
				],
				why: 'Grounds the remarks in the live audience.'
			}
		],
		logical_fallacies: [
			{
				name: 'Ad hominem',
				description: 'Attacks the person, not the argument.',
				examples: [
					// deliberately crafted to not exist in the transcript
					'These people are low-IQ and nothing they say should ever be taken seriously.'
				],
				why: 'Substitutes the speaker for the argument.'
			}
		],
		cultish_language: [
			{
				name: 'In-group framing',
				description: 'Uses us-vs-them language.',
				examples: [
					// verbatim from speaker_2 ~476s
					'we have a group that likes to see our country in trouble'
				],
				why: 'Consolidates the out-group into a single hostile entity.'
			}
		],
		fact_checking: [
			{
				claim: "They're also afraid they'll be killed by us.",
				verdict: 'Unverified',
				source: null,
				relevance: 'Characterization of adversary psychology without sourcing.'
			}
		]
	};
}

describe('annotateAnalysis', () => {
	it('attaches timestamps to verbatim examples and records failure for fabricated ones', () => {
		const result = annotateAnalysis(nrcc, sampleAnalysis());

		// Good faith example should align.
		const gf = result.good_faith![0].annotatedExamples[0];
		expect(gf.alignmentFailed).toBeFalsy();
		expect(gf.startSec).toBeGreaterThan(620);
		expect(gf.startSec).toBeLessThan(640);

		// Fabricated ad-hominem should fail alignment.
		const fallacy = result.logical_fallacies![0].annotatedExamples[0];
		expect(fallacy.alignmentFailed).toBe(true);
		expect(fallacy.startSec).toBeUndefined();

		// Cultish example should align to the opening stretch of speaker_2.
		const cult = result.cultish_language![0].annotatedExamples[0];
		expect(cult.alignmentFailed).toBeFalsy();
		expect(cult.startSec).toBeGreaterThan(470);
		expect(cult.startSec).toBeLessThan(520);

		// Fact-check claim should align (close to the original wording).
		const fc = result.fact_checking![0].annotatedClaim;
		expect(fc.alignmentFailed).toBeFalsy();
		expect(fc.startSec).toBeGreaterThan(570);
		expect(fc.startSec).toBeLessThan(585);
	});

	it('defaults to the primary speaker and records diagnostics', () => {
		const result = annotateAnalysis(nrcc, sampleAnalysis());
		expect(result._alignment?.speakerId).toBe('speaker_2');
		expect(result._alignment?.totalExamples).toBe(4);
		// Three of the four sample examples are verbatim.
		expect(result._alignment?.aligned).toBe(3);
		expect(result._alignment?.failed).toBe(1);
	});

	it('preserves the original examples array alongside annotatedExamples', () => {
		const input = sampleAnalysis();
		const result = annotateAnalysis(nrcc, input);
		expect(result.good_faith![0].examples).toEqual(input.good_faith![0].examples);
	});

	it('can be restricted to a non-primary speaker', () => {
		// Song lyrics only exist in speaker_1.
		const songAnalysis: StructuredAnalysis = {
			good_faith: [
				{
					name: 'Patriotic framing',
					description: '',
					examples: ["proud to be an American where at least I know I'm free"],
					why: ''
				}
			]
		};
		// Default (primary) speaker is speaker_2 → alignment should fail.
		const defaultResult = annotateAnalysis(nrcc, songAnalysis);
		expect(defaultResult.good_faith![0].annotatedExamples[0].alignmentFailed).toBe(true);

		// Override to speaker_1 → should succeed.
		const songResult = annotateAnalysis(nrcc, songAnalysis, { speakerId: 'speaker_1' });
		expect(songResult.good_faith![0].annotatedExamples[0].alignmentFailed).toBeFalsy();
	});
});
