/**
 * Standalone assertion runner — sandbox fallback when vitest can't
 * boot (pnpm/rollup native-binding issue). Delete when the env is
 * fixed and `npm run test:unit` can resolve the transcripts tests.
 *
 * Run with: node --experimental-strip-types src/lib/transcripts/_runner.mts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { alignQuote, primarySpeaker, buildNormalizedStream } from './align.ts';
import { extractReactions, reactionsAfterQuote } from './reactions.ts';
import { annotateAnalysis } from './annotate.ts';
import type { StructuredAnalysis } from './annotate.ts';
import { annotatedToExcerpts } from './toExcerpts.ts';
import type { ScribeTranscript } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const hegseth = JSON.parse(
	readFileSync(resolve(here, '__fixtures__/hegseth.json'), 'utf-8')
) as ScribeTranscript;
const nrcc = JSON.parse(
	readFileSync(resolve(here, '__fixtures__/nrcc.json'), 'utf-8')
) as ScribeTranscript;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, note = '') {
	if (cond) {
		passed++;
		console.log(`  ✓ ${name}`);
	} else {
		failed++;
		failures.push(`${name} ${note}`);
		console.log(`  ✗ ${name} ${note}`);
	}
}

// --- primarySpeaker ---
console.log('\nprimarySpeaker');
check('hegseth → speaker_0', primarySpeaker(hegseth) === 'speaker_0');
check('nrcc → speaker_2', primarySpeaker(nrcc) === 'speaker_2');

// --- buildNormalizedStream ---
console.log('\nbuildNormalizedStream');
{
	const s = buildNormalizedStream(hegseth);
	check('starts with "wars of the past"', s.text.startsWith('wars of the past'));
	check('no bracketed audio events leak in', !s.text.includes('['));
}
{
	const full = buildNormalizedStream(nrcc);
	const only2 = buildNormalizedStream(nrcc, { speakerId: 'speaker_2' });
	check('speaker filter shrinks stream', only2.text.length < full.text.length);
	check('song in full stream', full.text.includes('proud to be an american'));
	check('song excluded from speaker_2', !only2.text.includes('proud to be an american'));
}

// --- alignQuote ---
console.log('\nalignQuote');
{
	const r = alignQuote(hegseth, 'Wars of the past that dragged on for years and for decades');
	check('verbatim quote found', r !== null);
	if (r) {
		check(`startSec ≈ 0.24 (got ${r.startSec.toFixed(2)})`, Math.abs(r.startSec - 0.24) < 0.5);
		check(`endSec < 5 (got ${r.endSec.toFixed(2)})`, r.endSec < 5);
		check('speaker attribution', r.speakerId === 'speaker_0');
	}
}
{
	const r = alignQuote(
		hegseth,
		'"Operation Epic Fury has delivered a decisive military result — in just weeks."'
	);
	check('stylized punctuation handled', r !== null);
	if (r) check(`in first segment (${r.startSec.toFixed(2)})`, r.startSec >= 0 && r.startSec < 35);
}
check('missing quote → null', alignQuote(hegseth, 'not in the transcript whatsoever') === null);
check('too-short quote → null', alignQuote(hegseth, 'the') === null);
{
	const whole = alignQuote(nrcc, 'proud to be an american');
	check('lyric found in full', whole !== null);
	if (whole) check(`lyric speaker = speaker_1`, whole.speakerId === 'speaker_1');
	check(
		'lyric blocked when restricted to speaker_2',
		alignQuote(nrcc, 'proud to be an american', { speakerId: 'speaker_2' }) === null
	);
}

// --- extractReactions ---
console.log('\nextractReactions');
check('hegseth has no reactions', extractReactions(hegseth).length === 0);
{
	const rs = extractReactions(nrcc);
	const types = new Set(rs.map((r) => r.type));
	check(`captures applause (${rs.length} total)`, types.has('applause'));
	check('captures cheering', types.has('cheering'));
	check('captures clapping', types.has('clapping'));
	check('captures laughs', types.has('laughs'));
	let ordered = true;
	for (let i = 1; i < rs.length; i++) if (rs[i].startSec < rs[i - 1].startSec) ordered = false;
	check('sorted by start time', ordered);
	check('every reaction has a speakerId', rs.every((r) => r.speakerId !== null));
}

// --- reactionsAfterQuote ---
console.log('\nreactionsAfterQuote');
{
	const aligned = alignQuote(nrcc, 'the mutilation of our children should not be allowed');
	check('aligned test quote', aligned !== null);
	if (aligned) {
		const rs = reactionsAfterQuote(nrcc, aligned, { windowSec: 5 });
		check(`found ${rs.length} reaction(s) in window`, rs.length > 0);
		if (rs.length > 0) {
			check(
				`reaction gap ${(rs[0].startSec - aligned.endSec).toFixed(2)}s ≤ 5`,
				rs[0].startSec - aligned.endSec <= 5
			);
			check(`first reaction is applause (${rs[0].type})`, rs[0].type === 'applause');
		}
	}
}
{
	const aligned = alignQuote(hegseth, 'Wars of the past that dragged on');
	check('aligned hegseth opener', aligned !== null);
	if (aligned) check('no reactions near opener', reactionsAfterQuote(hegseth, aligned).length === 0);
}

// --- annotateAnalysis ---
console.log('\nannotateAnalysis');
function sampleAnalysis(): StructuredAnalysis {
	return {
		good_faith: [
			{
				name: 'Acknowledging the audience',
				description: '',
				examples: ["I can't see a thing in the audience, but what the hell? I know you're all friends."],
				why: ''
			}
		],
		logical_fallacies: [
			{
				name: 'Ad hominem',
				description: '',
				examples: ['These people are low-IQ and nothing they say should ever be taken seriously.'],
				why: ''
			}
		],
		cultish_language: [
			{
				name: 'In-group framing',
				description: '',
				examples: ['we have a group that likes to see our country in trouble'],
				why: ''
			}
		],
		fact_checking: [
			{
				claim: "They're also afraid they'll be killed by us.",
				verdict: 'Unverified',
				source: null,
				relevance: ''
			}
		]
	};
}
{
	const r = annotateAnalysis(nrcc, sampleAnalysis());
	const gf = r.good_faith![0].annotatedExamples[0];
	check(`good_faith aligned (startSec=${gf.startSec?.toFixed(1)})`, !gf.alignmentFailed);
	if (!gf.alignmentFailed) {
		check('good_faith startSec in right window', gf.startSec! > 620 && gf.startSec! < 640);
	}

	const fallacy = r.logical_fallacies![0].annotatedExamples[0];
	check('fabricated fallacy fails alignment', fallacy.alignmentFailed === true);
	check('fabricated fallacy has no startSec', fallacy.startSec === undefined);

	const cult = r.cultish_language![0].annotatedExamples[0];
	check(`cultish aligned (startSec=${cult.startSec?.toFixed(1)})`, !cult.alignmentFailed);
	if (!cult.alignmentFailed) {
		check('cultish startSec in right window', cult.startSec! > 470 && cult.startSec! < 520);
	}

	const fc = r.fact_checking![0].annotatedClaim;
	check(`fact_check aligned (startSec=${fc.startSec?.toFixed(1)})`, !fc.alignmentFailed);
	if (!fc.alignmentFailed) {
		check('fact_check startSec in right window', fc.startSec! > 570 && fc.startSec! < 585);
	}

	check(`diagnostics speakerId = speaker_2`, r._alignment?.speakerId === 'speaker_2');
	check(`diagnostics totalExamples = 4`, r._alignment?.totalExamples === 4);
	check(`diagnostics aligned = 3`, r._alignment?.aligned === 3);
	check(`diagnostics failed = 1`, r._alignment?.failed === 1);
	check(
		'original examples preserved',
		Array.isArray(r.good_faith![0].examples) &&
			r.good_faith![0].examples[0].startsWith("I can't see")
	);
}
{
	const songOnly: StructuredAnalysis = {
		good_faith: [
			{
				name: 'Patriotic framing',
				description: '',
				examples: ["proud to be an American where at least I know I'm free"],
				why: ''
			}
		]
	};
	const def = annotateAnalysis(nrcc, songOnly);
	check('song fails under default primary speaker', def.good_faith![0].annotatedExamples[0].alignmentFailed === true);
	const withSpeaker = annotateAnalysis(nrcc, songOnly, { speakerId: 'speaker_1' });
	check(
		'song aligns when speaker_1 is specified',
		!withSpeaker.good_faith![0].annotatedExamples[0].alignmentFailed
	);
}

// --- annotatedToExcerpts ---
console.log('\nannotatedToExcerpts');
{
	const annotated = annotateAnalysis(nrcc, sampleAnalysis());
	const { excerpts, failed: failedList, stats } = annotatedToExcerpts(annotated);
	check(`aligned excerpts length = 3 (got ${excerpts.length})`, excerpts.length === 3);
	check(`failed list length = 1 (got ${failedList.length})`, failedList.length === 1);
	check(`stats aligned = 3 (got ${stats.aligned})`, stats.aligned === 3);
	check(`stats failed = 1 (got ${stats.failed})`, stats.failed === 1);
	check(`stats total = 4 (got ${stats.totalExamples})`, stats.totalExamples === 4);
	let ordered = true;
	for (let i = 1; i < excerpts.length; i++) {
		if (excerpts[i].startSec < excerpts[i - 1].startSec) ordered = false;
	}
	check('excerpts sorted by startSec', ordered);
	check('good_faith excerpt present', excerpts.some((e) => e.category === 'good_faith'));
	check('fact excerpt present', excerpts.some((e) => e.category === 'fact'));
	check('cultish excerpt present', excerpts.some((e) => e.category === 'cultish'));
	check('fallacy excerpt absent (fabricated)', !excerpts.some((e) => e.category === 'fallacy'));
	const gf = excerpts.find((e) => e.category === 'good_faith')!;
	check('good_faith id follows pattern', /^good_faith-\d+-\d+$/.test(gf.id));
	check('good_faith has a highlight', !!gf.highlight && gf.highlight.length > 0);
	const fact = excerpts.find((e) => e.category === 'fact')!;
	check('fact findingTitle starts with "Claim:"', fact.findingTitle.startsWith('Claim:'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
	for (const f of failures) console.log(`  - ${f}`);
	process.exit(1);
}
