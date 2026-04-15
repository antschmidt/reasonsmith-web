<!--
  AnnotatedShowcaseView (Plan 5)

  Renders the full body of a featured showcase piece with inline curator
  annotations. Annotations are stored as a jsonb array on editors_desk_pick
  and keyed by character offsets into the post body (see
  editorsDeskUtils.ShowcaseAnnotation).

  Rendering approach:
    - We split the content into alternating "span" and "annotation" slices.
    - Each annotated span gets a <mark> wrapper and an inline button that
      expands the annotation body. This keeps the reading flow intact; the
      annotation lives next to the text it's about.
    - Annotations that reference ranges outside the current content are
      rendered in an appendix at the bottom so curator work isn't lost when
      the author edits after annotation.

  Accessibility:
    - Each annotation button is keyboard-focusable and labelled with the
      annotation kind ("Observation", "Question", "Steelman").
    - Expanded annotations use aria-expanded and aria-controls so assistive
      tech can navigate in and back out.

  Props:
    content      — the post's sanitized HTML string.
    annotations  — the curator's annotations (may be empty or null).
    curatorNote  — optional curator-level note to show above the body.
-->
<script lang="ts">
	import type { ShowcaseAnnotation } from '$lib/utils/editorsDeskUtils';

	let {
		content = '',
		annotations = [],
		curatorNote = null
	} = $props<{
		content?: string;
		annotations?: ShowcaseAnnotation[] | null;
		curatorNote?: string | null;
	}>();

	interface Slice {
		kind: 'text' | 'annotated';
		text: string;
		annotation?: ShowcaseAnnotation;
	}

	// Walk the annotations in order of start offset and carve the content
	// into text/annotated slices. Overlapping ranges are resolved by
	// preferring the first annotation — curators should avoid overlaps, but
	// we don't want to blow up on them.
	const slices = $derived.by<Slice[]>(() => {
		const source: (ShowcaseAnnotation | null | undefined)[] = annotations ?? [];
		const list: ShowcaseAnnotation[] = source
			.filter((a): a is ShowcaseAnnotation => Boolean(a))
			.slice()
			.sort(
				(a: ShowcaseAnnotation, b: ShowcaseAnnotation) =>
					a.target.range_start - b.target.range_start
			);

		const out: Slice[] = [];
		let cursor = 0;

		for (const ann of list) {
			const start = Math.max(cursor, ann.target.range_start);
			const end = Math.min(content.length, ann.target.range_end);
			if (end <= start) continue; // Range is out of bounds or overlapping.

			if (start > cursor) {
				out.push({ kind: 'text', text: content.slice(cursor, start) });
			}
			out.push({
				kind: 'annotated',
				text: content.slice(start, end),
				annotation: ann
			});
			cursor = end;
		}

		if (cursor < content.length) {
			out.push({ kind: 'text', text: content.slice(cursor) });
		}
		return out;
	});

	// Annotations whose ranges fall outside the (possibly edited) content are
	// preserved in an appendix so the curator's work isn't silently dropped.
	const orphanedAnnotations = $derived.by<ShowcaseAnnotation[]>(() => {
		const source: (ShowcaseAnnotation | null | undefined)[] = annotations ?? [];
		return source.filter((a): a is ShowcaseAnnotation => {
			if (!a) return false;
			const { range_start, range_end } = a.target;
			return range_end > content.length || range_start >= content.length || range_end <= range_start;
		});
	});

	const expandedIds = $state<Record<string, boolean>>({});

	function toggle(id: string) {
		expandedIds[id] = !expandedIds[id];
	}

	const kindLabel: Record<ShowcaseAnnotation['kind'], string> = {
		observation: 'Observation',
		question: 'Question',
		steelman: 'Steelman'
	};
</script>

<article class="annotated-showcase">
	{#if curatorNote}
		<aside class="curator-note-block" aria-label="Curator's note">
			<p class="note-label">Curator's note</p>
			<p class="note-body">{curatorNote}</p>
		</aside>
	{/if}

	<div class="showcase-body">
		{#each slices as slice, idx (idx)}
			{#if slice.kind === 'text'}
				{@html slice.text}
			{:else if slice.annotation}
				<mark class="annotated-span" data-kind={slice.annotation.kind}>
					{@html slice.text}
					<button
						type="button"
						class="annotation-toggle"
						aria-expanded={Boolean(expandedIds[slice.annotation.id])}
						aria-controls={`annotation-${slice.annotation.id}`}
						aria-label={`${kindLabel[slice.annotation.kind]} — show curator's note`}
						onclick={() => slice.annotation && toggle(slice.annotation.id)}
					>
						{kindLabel[slice.annotation.kind]}
					</button>
					{#if expandedIds[slice.annotation.id]}
						<span
							class="annotation-body"
							id={`annotation-${slice.annotation.id}`}
							role="note"
						>
							{slice.annotation.body}
						</span>
					{/if}
				</mark>
			{/if}
		{/each}
	</div>

	{#if orphanedAnnotations.length > 0}
		<aside class="orphaned-annotations" aria-label="Additional curator notes">
			<h3>More curator notes</h3>
			<p class="orphaned-explanation">
				These notes reference passages that have been edited since they were written.
			</p>
			<ul>
				{#each orphanedAnnotations as ann (ann.id)}
					<li>
						<span class="orphan-kind">{kindLabel[ann.kind]}</span>
						<span class="orphan-body">{ann.body}</span>
					</li>
				{/each}
			</ul>
		</aside>
	{/if}
</article>

<style>
	.annotated-showcase {
		max-width: 780px;
		margin: 0 auto;
		line-height: 1.65;
	}

	.curator-note-block {
		background: color-mix(in srgb, var(--color-primary) 6%, transparent);
		border-left: 3px solid var(--color-primary);
		padding: 1rem 1.1rem;
		border-radius: var(--border-radius-md, 8px);
		margin-bottom: 1.5rem;
	}

	.curator-note-block .note-label {
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-primary);
		font-weight: 600;
	}

	.curator-note-block .note-body {
		margin: 0;
		font-style: italic;
		color: var(--color-text-primary);
	}

	.showcase-body {
		font-size: 1.05rem;
		color: var(--color-text-primary);
	}

	/*
	 * Annotation marks use a low-contrast underline by default and reveal
	 * their kind on hover/focus. This keeps the reading flow visually
	 * intact while signalling the curator's attention with a subtle cue.
	 */
	.annotated-span {
		background: transparent;
		border-bottom: 2px dotted color-mix(in srgb, var(--color-primary) 55%, transparent);
		padding-bottom: 1px;
		color: inherit;
	}

	.annotated-span[data-kind='question'] {
		border-bottom-color: color-mix(in srgb, var(--color-accent) 65%, transparent);
	}

	.annotated-span[data-kind='steelman'] {
		border-bottom-color: color-mix(in srgb, var(--color-success, #15803d) 65%, transparent);
	}

	.annotation-toggle {
		display: inline-block;
		margin-left: 0.25rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.1rem 0.45rem;
		border-radius: var(--border-radius-full, 999px);
		border: 1px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
		background: transparent;
		color: var(--color-primary);
		cursor: pointer;
		vertical-align: middle;
	}

	.annotation-toggle:hover,
	.annotation-toggle:focus {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		outline: none;
	}

	.annotation-body {
		display: block;
		margin: 0.5rem 0 0.75rem;
		padding: 0.75rem 0.9rem;
		font-size: 0.95rem;
		line-height: 1.55;
		background: var(--color-surface);
		border-left: 2px solid var(--color-primary);
		border-radius: 4px;
		color: var(--color-text-primary);
		font-style: italic;
	}

	.orphaned-annotations {
		margin-top: 2.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
	}

	.orphaned-annotations h3 {
		margin: 0 0 0.35rem;
		font-size: 1rem;
		font-family: var(--font-family-display, Georgia, serif);
	}

	.orphaned-explanation {
		margin: 0 0 1rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.orphaned-annotations ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.orphaned-annotations li {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}

	.orphan-kind {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-primary);
		flex-shrink: 0;
	}

	.orphan-body {
		color: var(--color-text-primary);
		font-style: italic;
	}
</style>
