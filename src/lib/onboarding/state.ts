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

// Plain-string mutation — matches the pattern the rest of the codebase uses
// with nhost.graphql.request (the gql-tagged DocumentNode import was causing
// silent failures with this particular nhost client build).
const UPDATE_ONBOARDING = `
	mutation UpdateContributorOnboardingState(
		$contributorId: uuid!
		$state: String!
		$discussionId: uuid
		$completedAt: timestamptz
	) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: {
				onboarding_state: $state
				onboarding_discussion_id: $discussionId
				onboarding_completed_at: $completedAt
			}
		) {
			id
			onboarding_state
			onboarding_discussion_id
			onboarding_completed_at
		}
	}
`;

/**
 * Advance a contributor's onboarding_state if (and only if) the requested
 * state is later than their current state. Returns the state that was
 * actually written (may equal the current state if this was a no-op).
 */
export async function advanceOnboarding(opts: AdvanceOptions): Promise<OnboardingState> {
	const { contributorId, nextState, discussionId } = opts;
	const current = get(contributorStore);
	const currentState: OnboardingState =
		(current?.onboarding_state as OnboardingState) ?? 'not_started';

	if (rank(nextState) <= rank(currentState)) {
		return currentState;
	}

	const markCompleted = opts.markCompleted ?? nextState === 'completed';
	const completedAt = markCompleted
		? new Date().toISOString()
		: (current?.onboarding_completed_at ?? null);

	try {
		const result = await nhost.graphql.request(UPDATE_ONBOARDING, {
			contributorId,
			state: nextState,
			discussionId: discussionId ?? current?.onboarding_discussion_id ?? null,
			completedAt
		});

		// Check for GraphQL-level errors (nhost wraps them in result.error)
		if ((result as any)?.error) {
			console.error('[onboarding] mutation error:', (result as any).error);
			return currentState;
		}

		contributorStore.updatePreferences({
			onboarding_state: nextState,
			onboarding_discussion_id: discussionId ?? current?.onboarding_discussion_id ?? null,
			onboarding_completed_at: completedAt
		});

		console.log(`[onboarding] ${currentState} → ${nextState}`);
		return nextState;
	} catch (err) {
		console.error('[onboarding] advanceOnboarding failed:', err);
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

		if ((result as any)?.error) {
			console.error('[onboarding] starter discussion query error:', (result as any).error);
			return null;
		}

		return (result as any)?.data?.discussion?.[0]?.id ?? null;
	} catch (err) {
		console.error('[onboarding] getStarterDiscussionId failed:', err);
		return null;
	}
}
