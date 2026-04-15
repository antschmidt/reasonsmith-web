// Helpers for advancing the contributor's onboarding_state.
//
// State lifecycle (matches the CHECK constraint in the
// 1798000000000_add_onboarding_state migration):
//
//   not_started → read_prompt → drafted_reply → received_feedback
//                                             → revised → completed
//
// Advancing is monotonic: once a contributor has reached a later state we
// should never regress them to an earlier one (e.g. opening /start a second
// time after they've already drafted a reply shouldn't reset them to
// read_prompt). Callers use `advanceOnboarding` and the helper silently
// no-ops if the requested state is "behind" the current one.

import { nhost } from '$lib/nhostClient';
import { contributorStore, type OnboardingState } from '$lib/stores/contributorStore';
import { UPDATE_CONTRIBUTOR_ONBOARDING_STATE } from '$lib/graphql/queries/contributors';
import { get } from 'svelte/store';

const ORDER: OnboardingState[] = [
	'not_started',
	'read_prompt',
	'drafted_reply',
	'received_feedback',
	'revised',
	'completed'
];

function rank(state: OnboardingState | null | undefined): number {
	if (!state) return 0;
	const idx = ORDER.indexOf(state);
	return idx === -1 ? 0 : idx;
}

export interface AdvanceOptions {
	contributorId: string;
	nextState: OnboardingState;
	discussionId?: string | null;
	/** When true, writes onboarding_completed_at = now. Defaults to nextState === 'completed'. */
	markCompleted?: boolean;
}

/**
 * Advance a contributor's onboarding_state if (and only if) the requested
 * state is later than their current state. Returns the state that was
 * actually written (may equal the current state if this was a no-op).
 */
export async function advanceOnboarding(opts: AdvanceOptions): Promise<OnboardingState> {
	const { contributorId, nextState, discussionId } = opts;
	const current = get(contributorStore);
	const currentState: OnboardingState = (current?.onboarding_state as OnboardingState) ?? 'not_started';

	if (rank(nextState) <= rank(currentState)) {
		return currentState;
	}

	const markCompleted = opts.markCompleted ?? nextState === 'completed';
	const completedAt = markCompleted ? new Date().toISOString() : current?.onboarding_completed_at ?? null;

	try {
		await nhost.graphql.request(UPDATE_CONTRIBUTOR_ONBOARDING_STATE, {
			contributorId,
			state: nextState,
			discussionId: discussionId ?? current?.onboarding_discussion_id ?? null,
			completedAt
		});

		contributorStore.updatePreferences({
			onboarding_state: nextState,
			onboarding_discussion_id: discussionId ?? current?.onboarding_discussion_id ?? null,
			onboarding_completed_at: completedAt
		});

		return nextState;
	} catch (err) {
		console.warn('advanceOnboarding failed:', err);
		return currentState;
	}
}

/** Fetch the id of the single discussion flagged as is_onboarding_starter. */
export async function getStarterDiscussionId(): Promise<string | null> {
	try {
		const result = await nhost.graphql.request(
			`query GetStarterDiscussion {
				discussion(where: { is_onboarding_starter: { _eq: true } }, limit: 1) {
					id
				}
			}`
		);
		return (result as any)?.data?.discussion?.[0]?.id ?? null;
	} catch (err) {
		console.warn('getStarterDiscussionId failed:', err);
		return null;
	}
}
