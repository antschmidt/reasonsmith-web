/**
 * Adapter: AnnotatedAnalysis → Excerpt[]
 *
 * The video-anchored prototype renders a flat list of
 * category-tagged excerpts with timestamps. The annotate pipeline
 * produces a nested structure keyed by category → finding →
 * examples. This module flattens one into the other.
 *
 * Design choices:
 *
 * - Only successfully-aligned examples become excerpts. An unaligned
 *   example has no timestamp, so the "jump to moment" affordance
 *   would dead-end. The adapter reports the number of dropped
 *   examples separately so the admin UI can surface extraction
 *   quality.
 *
 * - IDs are deterministic: `{cat}-{findingIdx}-{exampleIdx}`. Stable
 *   across renders for Svelte's keyed each, and traceable back to
 *   the source finding.
 *
 * - `highlight` is inferred heuristically — we don't have phrase-
 *   level annotations yet, so the whole quote is highlighted for
 *   short examples and the first sentence for long ones. Good
 *   enough until we add a dedicated highlight field.
 */

import type {
	AnnotatedAnalysis,
	AnnotatedExample,
	AnnotatedFactCheck,
	AnnotatedFinding
} from './annotate.ts';

export type ExcerptCategory = 'good_faith' | 'fallacy' | 'cultish' | 'fact';

export interface Excerpt {
	id: string;
	category: ExcerptCategory;
	findingTitle: string;
	quote: string;
	highlight?: string;
	startSec: number;
	endSec?: number;
	whyItMatters: string;
	/** Audience reactions that followed the quote, if any. */
	reactions?: { type: string; startSec: number; endSec: number }[];
}

export interface ExcerptsResult {
	excerpts: Excerpt[];
	/** Examples that failed alignment, grouped by category. Useful for
	 * admin diagnostics — high failure rates usually mean the LLM
	 * paraphrased rather than quoting verbatim. */
	failed: { category: ExcerptCategory; findingTitle: string; text: string }[];
	stats: {
		totalExamples: number;
		aligned: number;
		failed: number;
		dropped: number; // aligned == excerpts.length, failed == failed.length, dropped === same thing, kept for readability
	};
}

const MAX_HIGHLIGHT_CHARS = 70;

function inferHighlight(quote: string): string | undefined {
	const trimmed = quote.trim();
	if (trimmed.length <= MAX_HIGHLIGHT_CHARS) {
		return trimmed;
	}
	// Prefer the first sentence if it's a reasonable length; otherwise
	// the first N chars ending at a word boundary.
	const sentenceEnd = trimmed.search(/[.!?](\s|$)/);
	if (sentenceEnd > 15 && sentenceEnd < MAX_HIGHLIGHT_CHARS) {
		return trimmed.slice(0, sentenceEnd + 1);
	}
	const cut = trimmed.slice(0, MAX_HIGHLIGHT_CHARS);
	const lastSpace = cut.lastIndexOf(' ');
	return lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
}

function toExcerpt(
	category: ExcerptCategory,
	id: string,
	findingTitle: string,
	example: AnnotatedExample,
	why: string
): Excerpt | null {
	if (example.alignmentFailed || example.startSec == null) return null;
	const excerpt: Excerpt = {
		id,
		category,
		findingTitle,
		quote: example.text,
		highlight: inferHighlight(example.text),
		startSec: example.startSec,
		endSec: example.endSec,
		whyItMatters: why
	};
	if (example.reactions && example.reactions.length > 0) {
		excerpt.reactions = example.reactions.map((r) => ({
			type: r.type,
			startSec: r.startSec,
			endSec: r.endSec
		}));
	}
	return excerpt;
}

function walkFindings(
	category: ExcerptCategory,
	findings: AnnotatedFinding[] | undefined,
	excerpts: Excerpt[],
	failed: ExcerptsResult['failed']
) {
	if (!Array.isArray(findings)) return;
	findings.forEach((finding, fi) => {
		finding.annotatedExamples.forEach((ex, ei) => {
			const id = `${category}-${fi}-${ei}`;
			const exc = toExcerpt(category, id, finding.name, ex, finding.why ?? '');
			if (exc) excerpts.push(exc);
			else failed.push({ category, findingTitle: finding.name, text: ex.text });
		});
	});
}

function walkFactChecks(
	checks: AnnotatedFactCheck[] | undefined,
	excerpts: Excerpt[],
	failed: ExcerptsResult['failed']
) {
	if (!Array.isArray(checks)) return;
	checks.forEach((fc, i) => {
		const id = `fact-0-${i}`;
		const title = `Claim: "${truncate(fc.claim, 60)}"`;
		const why = fc.relevance
			? `${verdictPrefix(fc.verdict)} ${fc.relevance}`
			: verdictPrefix(fc.verdict);
		const exc = toExcerpt('fact', id, title, fc.annotatedClaim, why);
		if (exc) excerpts.push(exc);
		else failed.push({ category: 'fact', findingTitle: title, text: fc.claim });
	});
}

function verdictPrefix(v: AnnotatedFactCheck['verdict']): string {
	switch (v) {
		case 'True':
			return 'Verified.';
		case 'False':
			return 'False.';
		case 'Misleading':
			return 'Misleading.';
		case 'Unverified':
		default:
			return 'Unverified.';
	}
}

function truncate(s: string, n: number): string {
	return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

/**
 * Flatten an AnnotatedAnalysis into the excerpt list rendered by the
 * video-anchored view, sorted by timestamp.
 */
export function annotatedToExcerpts(annotated: AnnotatedAnalysis): ExcerptsResult {
	const excerpts: Excerpt[] = [];
	const failed: ExcerptsResult['failed'] = [];

	walkFindings('good_faith', annotated.good_faith, excerpts, failed);
	walkFindings('fallacy', annotated.logical_fallacies, excerpts, failed);
	walkFindings('cultish', annotated.cultish_language, excerpts, failed);
	walkFactChecks(annotated.fact_checking, excerpts, failed);

	excerpts.sort((a, b) => a.startSec - b.startSec);

	const aligned = excerpts.length;
	return {
		excerpts,
		failed,
		stats: {
			totalExamples: aligned + failed.length,
			aligned,
			failed: failed.length,
			dropped: failed.length
		}
	};
}
