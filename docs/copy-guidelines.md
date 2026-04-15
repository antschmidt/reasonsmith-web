# ReasonSmith Copy Guidelines

These guidelines apply to every user-facing string in the product: UI labels, empty states, error messages, toasts, onboarding text, and AI coach prose.

## Core principle

ReasonSmith's users are people who value good-faith argumentation. Every string is either reinforcing that commitment or undermining it. When in doubt, write for the reader who cares about reasoning well.

## Voice

The product has three distinct voices, kept separate on purpose:

- **Product voice** — warm, editorial, lightly smith-themed. Used in UI chrome, onboarding, empty states.
- **AI coach voice** — one of three registers (coach, editor, scholar) chosen by the user. Used only in analysis output. Never bleeds into the product UI.
- **Editorial voice** — neutral, journalistic. Used for curator notes and annotations on the public showcase.

Never mix these. A button label never sounds like the AI coach. A coach response never sounds like marketing copy.

## Word-level rules

### Avoid

- **"Fail", "failed", "invalid", "error"** when a warmer alternative exists. Prefer "needs a quick fix", "doesn't meet the requirements yet", "something's off".
- **"Grade", "graded", "grading"**. We do not grade arguments; we coach them. Even internally in documentation, prefer "score" or "analysis".
- **"Users"** in user-facing copy. Prefer "you", "contributors", or a specific role name.
- **Exclamation marks** in coaching output. Warmth should come from word choice, not punctuation. At most one exclamation mark per achievement toast.
- **Hero-speak** ("Unleash your inner debater", "Crush your opponents"). We are not a battle arena.
- **Jargon without context**. If a screen mentions "steelman", link to the short primer in `/resources/good-faith-arguments`.

### Prefer

- Second person in product voice ("your draft", "you'll see…").
- Active verbs ("The coach found a false dichotomy") over passive framing ("A false dichotomy was detected").
- Specificity over hedging. "Tighten paragraph 2" beats "Consider refining your argument".
- Plain words over long ones when they carry the same meaning. "Read" over "peruse". "Fix" over "remediate".

## Smithing terms

Forge-themed terms are maintained in `src/lib/copy/smithing.ts`. Use that module rather than hard-coding the strings. Rules:

- Visual display only — never in aria-labels, form values, analytics event names, or URLs.
- Respect the user's `prefers_plain_language` preference. A user who opts out should see "Analyze" everywhere they would otherwise see "Send to the forge".
- Never invent new smithing terms on the fly. If a new action needs one, add it to `SMITHING_COPY` with a plain-language fallback.

## Analysis feedback (AI coach)

These rules are encoded in the system prompt (`src/lib/goodFaith/prompts.ts`) and also apply to any human-written examples we ship (tests, docs, placeholders).

- Lead with a single-sentence `coachingHeadline` that names the one most important thing to fix or reinforce.
- Provide a `suggestedRevision` only when a concrete rewrite would help. Never fill the field with generic advice.
- Critique *how* the argument is constructed; never moralize about *what* the author should believe.
- Respect the selected register's voice. The guardrail against moralizing applies to every register.

## Empty states

Every empty state should answer two questions:

1. What is this screen for?
2. What's the one thing I should do next?

Bad: "No discussions yet."
Better: "Nothing here yet. The first piece you publish will appear here — try starting with a quick-point response to a featured discussion."

## Error messages

Bad: "Error: Invalid input. Please correct and try again."
Better: "That didn't save. The title is empty — add one and try again."

Error copy should name what happened, where, and what the user can do.

## Achievement and growth copy

- Quieter by default. Celebration volume scales with the user's `growth_visibility` preference.
- No ranked, hierarchical language ("You outranked 80% of contributors"). Growth is personal, not comparative.
- Achievement names should describe an act, not a rank. "Read opposing views charitably for a week" beats "Steel Apprentice".

## Accessibility

- Run through `design:accessibility-review` before shipping any flow with new copy.
- Screen reader text (aria-labels) always uses plain-language terms, never smithing ones.
- Keep line lengths readable; long single-run strings break on narrow screens.

## Review checklist

Before merging any PR that adds or changes user-facing copy, confirm:

- [ ] Does it sound like the product voice, not the coach voice?
- [ ] Is there a warmer alternative to any "fail/error/invalid" language?
- [ ] Is every smithing term sourced from `smithing.ts`?
- [ ] Is the aria-label plain-language?
- [ ] Is there a clear next action in every empty state and error state?
- [ ] Would a reader who cares about reasoning well feel respected by this string?
