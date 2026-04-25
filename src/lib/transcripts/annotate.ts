/**
 * Annotate a structured featured-analysis with timestamps and audience
 * reactions by aligning each example text to an ElevenLabs Scribe
 * transcript of the source video.
 *
 * Design notes:
 *
 * - The annotated output extends the existing shape rather than
 *   replacing it. Each finding keeps its original `examples: string[]`
 *   and gains an `annotatedExamples: AnnotatedExample[]` field. This
 *   lets the old categorical dossier UI keep working unchanged while
 *   the new video-anchored prototype consumes the richer field.
 *
 * - Alignment is best-effort. If a quote can't be located (the LLM
 *   paraphrased, or the transcript and the quote diverge too much),
 *   the annotated example is still included with `alignmentFailed:
 *   true` and no timestamps — the UI can fall back to text-only for
 *   those cases.
 *
 * - By default we restrict alignment to the primary speaker (longest
 *   total speaking time). This avoids matching on music lyrics, MC
 *   introductions, or hecklers. Callers who want to analyze multiple
 *   speakers can pass an explicit speakerId or `null` for no filter.
 */

import { alignQuote, primarySpeaker } from './align.ts';
import { reactionsAfterQuote } from './reactions.ts';
import type { Reaction, ScribeTranscript } from './types.ts';

// ------------------------------------------------------------------
// Input types — mirror src/lib/goodFaith/types.ts so we don't create
// a circular dependency between `transcripts` and `goodFaith`. Kept
// structurally identical; the shared types live there.
// ------------------------------------------------------------------

export interface AnalysisFinding {
	name: string;
	description: string;
	examples: string[];
	why: string;
	[k: string]: unknown;
}

export interface FactCheckFinding {
	claim: string;
	verdict: 'True' | 'False' | 'Misleading' | 'Unverified';
	source: { name: string; url: string } | null;
	relevance: string;
	[k: string]: unknown;
}

export interface StructuredAnalysis {
	good_faith?: AnalysisFinding[];
	logical_fallacies?: AnalysisFinding[];
	cultish_language?: AnalysisFinding[];
	fact_checking?: FactCheckFinding[];
	[k: string]: unknown;
}

// ------------------------------------------------------------------
// Output types
// ------------------------------------------------------------------

export interface AnnotatedExample {
	text: string;
	startSec?: number;
	endSec?: number;
	reactions?: Reaction[];
	alignmentFailed?: boolean;
}

export interface AnnotatedFinding extends AnalysisFinding {
	annotatedExamples: AnnotatedExample[];
}

export interface AnnotatedFactCheck extends FactCheckFinding {
	annotatedClaim: AnnotatedExample;
}

export interface AnnotatedAnalysis extends StructuredAnalysis {
	good_faith?: AnnotatedFinding[];
	logical_fallacies?: AnnotatedFinding[];
	cultish_language?: AnnotatedFinding[];
	fact_checking?: AnnotatedFactCheck[];
	/** Summary of the alignment pass — useful for diagnostics in the admin UI. */
	_alignment?: {
		speakerId: string | null;
		totalExamples: number;
		aligned: number;
		failed: number;
	};
}

// ------------------------------------------------------------------
// Options
// ------------------------------------------------------------------

export interface AnnotateOptions {
	/**
	 * Restrict alignment to a specific speaker. Defaults to the primary
	 * speaker (longest total speaking time). Pass `null` to disable the
	 * filter entirely.
	 */
	speakerId?: string | null;
	/**
	 * Seconds after a quote in which a reaction counts as a response to it.
	 */
	reactionWindowSec?: number;
	/**
	 * Minimum normalized quote length — shorter examples are skipped
	 * (too promiscuous to match reliably).
	 */
	minChars?: number;
}

// ------------------------------------------------------------------
// Core
// ------------------------------------------------------------------

function annotateOne(
	transcript: ScribeTranscript,
	text: string,
	opts: { speakerId?: string; reactionWindowSec: number; minChars: number }
): AnnotatedExample {
	if (!text || !text.trim()) {
		return { text, alignmentFailed: true };
	}

	const aligned = alignQuote(transcript, text, {
		speakerId: opts.speakerId,
		minChars: opts.minChars
	});

	if (!aligned) {
		return { text, alignmentFailed: true };
	}

	const reactions = reactionsAfterQuote(
		transcript,
		{ startSec: aligned.startSec, endSec: aligned.endSec },
		{ windowSec: opts.reactionWindowSec }
	);

	const out: AnnotatedExample = {
		text,
		startSec: aligned.startSec,
		endSec: aligned.endSec
	};
	if (reactions.length > 0) out.reactions = reactions;
	return out;
}

function annotateFinding(
	transcript: ScribeTranscript,
	finding: AnalysisFinding,
	opts: { speakerId?: string; reactionWindowSec: number; minChars: number },
	stats: { aligned: number; failed: number; total: number }
): AnnotatedFinding {
	const examples = Array.isArray(finding.examples) ? finding.examples : [];
	const annotatedExamples: AnnotatedExample[] = examples.map((ex) => {
		const ann = annotateOne(transcript, ex, opts);
		stats.total++;
		if (ann.alignmentFailed) stats.failed++;
		else stats.aligned++;
		return ann;
	});
	return { ...finding, annotatedExamples };
}

function annotateFactCheck(
	transcript: ScribeTranscript,
	fc: FactCheckFinding,
	opts: { speakerId?: string; reactionWindowSec: number; minChars: number },
	stats: { aligned: number; failed: number; total: number }
): AnnotatedFactCheck {
	const annotatedClaim = annotateOne(transcript, fc.claim, opts);
	stats.total++;
	if (annotatedClaim.alignmentFailed) stats.failed++;
	else stats.aligned++;
	return { ...fc, annotatedClaim };
}

/**
 * Walk a structured analysis and attach timestamps + audience
 * reactions to every example and fact-check claim. The original
 * fields are preserved; annotated data is added alongside.
 */
export function annotateAnalysis(
	transcript: ScribeTranscript,
	analysis: StructuredAnalysis,
	options: AnnotateOptions = {}
): AnnotatedAnalysis {
	const speakerId =
		options.speakerId === null
			? undefined
			: options.speakerId ?? primarySpeaker(transcript) ?? undefined;
	const reactionWindowSec = options.reactionWindowSec ?? 5;
	const minChars = options.minChars ?? 12;

	const opts = { speakerId, reactionWindowSec, minChars };
	const stats = { aligned: 0, failed: 0, total: 0 };

	const out: AnnotatedAnalysis = { ...analysis };

	if (Array.isArray(analysis.good_faith)) {
		out.good_faith = analysis.good_faith.map((f) =>
			annotateFinding(transcript, f, opts, stats)
		);
	}
	if (Array.isArray(analysis.logical_fallacies)) {
		out.logical_fallacies = analysis.logical_fallacies.map((f) =>
			annotateFinding(transcript, f, opts, stats)
		);
	}
	if (Array.isArray(analysis.cultish_language)) {
		out.cultish_language = analysis.cultish_language.map((f) =>
			annotateFinding(transcript, f, opts, stats)
		);
	}
	if (Array.isArray(analysis.fact_checking)) {
		out.fact_checking = analysis.fact_checking.map((f) =>
			annotateFactCheck(transcript, f, opts, stats)
		);
	}

	out._alignment = {
		speakerId: speakerId ?? null,
		totalExamples: stats.total,
		aligned: stats.aligned,
		failed: stats.failed
	};

	return out;
}
