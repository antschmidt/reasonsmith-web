/**
 * Smithing copy module (Plan 3)
 *
 * Single source of truth for the forge-themed verbs used throughout the UI.
 * Every user-facing string that could be "forged" instead of "analyzed"
 * should come from here.
 *
 * Rules:
 * - Smithing-inflected labels are for VISUAL display only.
 * - ARIA labels and form values MUST stay in plain English. Screen readers
 *   should hear "Analyze", not "Send to the forge".
 * - When `prefersPlainLanguage` is true, the same label function returns
 *   the plain variant. This pairs with the accessibility preference
 *   introduced in Plan 7.
 *
 * This module has zero runtime dependencies so it can be imported from
 * any Svelte component, server route, or test.
 */

export type SmithingKey =
	| 'draft'
	| 'send_for_analysis'
	| 'ai_feedback'
	| 'revise'
	| 'publish'
	| 'edit_lock'
	| 'achievements'
	| 'analysis_pending'
	| 'analysis_complete'
	| 'draft_saved';

interface SmithingEntry {
	/** The smithing-inflected label shown in the UI by default. */
	smith: string;
	/** The plain-language fallback (also used for aria-label). */
	plain: string;
	/** Optional one-liner describing the action for tooltips / hints. */
	hint?: string;
}

export const SMITHING_COPY: Record<SmithingKey, SmithingEntry> = {
	draft: {
		smith: 'Ingot',
		plain: 'Draft',
		hint: 'Your raw material — unrefined, waiting for the forge.'
	},
	send_for_analysis: {
		smith: 'Send to the forge',
		plain: 'Analyze',
		hint: 'Ask the coach to heat this up and find the weak points.'
	},
	ai_feedback: {
		smith: 'Heat',
		plain: 'Feedback',
		hint: 'What the coach sees after reading your draft.'
	},
	revise: {
		smith: 'Hammer',
		plain: 'Revise',
		hint: 'Reshape the weak spots the coach identified.'
	},
	publish: {
		smith: 'Quench',
		plain: 'Publish',
		hint: 'Lock in the shape. Published pieces enter the public record.'
	},
	edit_lock: {
		smith: 'On the anvil',
		plain: 'Currently being edited',
		hint: 'Another collaborator is actively shaping this piece.'
	},
	achievements: {
		smith: 'Marks of the maker',
		plain: 'Achievements',
		hint: 'Milestones you have reached through practice.'
	},
	analysis_pending: {
		smith: 'In the forge',
		plain: 'Analyzing',
		hint: 'The coach is reading your draft.'
	},
	analysis_complete: {
		smith: 'Cooled',
		plain: 'Feedback ready',
		hint: 'The coach has finished reading.'
	},
	draft_saved: {
		smith: 'Ingot set aside',
		plain: 'Draft saved',
		hint: 'We saved your work. You can come back to it later.'
	}
};

/**
 * Return the label for a smithing key. When `prefersPlainLanguage` is true,
 * the plain variant is returned. When false (default), the smith-inflected
 * variant is returned. Callers that need the aria-label should always use
 * `getPlainLabel` regardless of preference.
 */
export function getLabel(key: SmithingKey, prefersPlainLanguage = false): string {
	const entry = SMITHING_COPY[key];
	return prefersPlainLanguage ? entry.plain : entry.smith;
}

/**
 * Return the plain-language label for a key. Use this for aria-labels,
 * form field names, and analytics event names.
 */
export function getPlainLabel(key: SmithingKey): string {
	return SMITHING_COPY[key].plain;
}

/**
 * Return the hint (tooltip text) for a key. Not localized by register;
 * always plain-English sentence.
 */
export function getHint(key: SmithingKey): string | undefined {
	return SMITHING_COPY[key].hint;
}

/**
 * Accessor that takes a preference object, for use in Svelte components
 * where a `$contributor` store might provide `prefers_plain_language`.
 */
export function makeCopy(prefersPlainLanguage: boolean) {
	return {
		label: (key: SmithingKey) => getLabel(key, prefersPlainLanguage),
		plain: getPlainLabel,
		hint: getHint
	};
}
