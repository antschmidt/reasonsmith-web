import { gql } from '@apollo/client/core';
import { CONTRIBUTOR_FIELDS } from '../fragments';

// ============================================
// Contributor Queries
// ============================================

export const GET_CONTRIBUTOR = gql`
	query GetContributor($userId: uuid!) {
		contributor_by_pk(id: $userId) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const SEARCH_CONTRIBUTORS = gql`
	query SearchContributors($searchTerm: String!) {
		contributor(
			where: {
				_or: [
					{ display_name: { _ilike: $searchTerm } }
					{ handle: { _ilike: $searchTerm } }
					{ auth_email: { _ilike: $searchTerm } }
				]
			}
			limit: 20
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// ============================================
// Contributor Mutations - Settings
// ============================================

export const UPDATE_CONTRIBUTOR_ANALYSIS_SETTINGS = gql`
	mutation UpdateContributorAnalysisSettings(
		$contributorId: uuid!
		$analysisEnabled: Boolean!
		$analysisLimit: Int
	) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { analysis_enabled: $analysisEnabled, analysis_limit: $analysisLimit }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const UPDATE_CONTRIBUTOR_ROLE = gql`
	mutation UpdateContributorRole($contributorId: uuid!, $role: String!) {
		update_contributor_by_pk(pk_columns: { id: $contributorId }, _set: { role: $role }) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const UPDATE_CONTRIBUTOR_AVATAR = gql`
	mutation UpdateContributorAvatar($contributorId: uuid!, $avatarUrl: String) {
		update_contributor_by_pk(pk_columns: { id: $contributorId }, _set: { avatar_url: $avatarUrl }) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const UPDATE_CONTRIBUTOR_INTERESTS = gql`
	mutation UpdateContributorInterests($userId: uuid!, $interests: _text!) {
		update_contributor_by_pk(pk_columns: { id: $userId }, _set: { interests: $interests }) {
			id
			interests
		}
	}
`;

// ============================================
// Contributor Mutations - Reviewer & A11y Preferences (Plans 7 + 8)
// ============================================

// Narrowly-typed single-field mutation for the register picker. Written as its
// own mutation (rather than a merged preferences mutation) so optimistic UI
// and Apollo cache updates stay simple on the settings card that owns it.
export const UPDATE_CONTRIBUTOR_REVIEWER_REGISTER = gql`
	mutation UpdateContributorReviewerRegister(
		$contributorId: uuid!
		$register: reviewer_register!
	) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { reviewer_register: $register }
		) {
			id
			reviewer_register
		}
	}
`;

// Merged mutation for the cognitive-accessibility trio (Plan 7). All three
// preferences are exposed on a single settings card, so we save them together.
export const UPDATE_CONTRIBUTOR_PREFERENCES = gql`
	mutation UpdateContributorPreferences(
		$contributorId: uuid!
		$prefersPlainLanguage: Boolean
		$growthVisibility: String
		$levelDisplayMode: String
	) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: {
				prefers_plain_language: $prefersPlainLanguage
				growth_visibility: $growthVisibility
				level_display_mode: $levelDisplayMode
			}
		) {
			id
			prefers_plain_language
			growth_visibility
			level_display_mode
		}
	}
`;

// Onboarding state transitions (Plan 1). Stored on the contributor row so the
// tour survives sessions without cookies. Allowed values are enforced by the
// CHECK constraint in the 1798000000000_add_onboarding_state migration
// (column is `text`, so Hasura exposes it as a String scalar).
export const UPDATE_CONTRIBUTOR_ONBOARDING_STATE = gql`
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

// ============================================
// Contributor Mutations - Credits
// ============================================

export const INCREMENT_ANALYSIS_USAGE = gql`
	mutation IncrementAnalysisUsage($contributorId: uuid!) {
		update_contributor_by_pk(pk_columns: { id: $contributorId }, _inc: { analysis_count_used: 1 }) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const RESET_ANALYSIS_USAGE = gql`
	mutation ResetAnalysisUsage($contributorId: uuid!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { analysis_count_used: 0, analysis_count_reset_at: "now()" }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const ADD_PURCHASED_CREDITS = gql`
	mutation AddPurchasedCredits($contributorId: uuid!, $creditsToAdd: Int!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_inc: { purchased_credits_total: $creditsToAdd, purchased_credits_remaining: $creditsToAdd }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const SET_PURCHASED_CREDITS = gql`
	mutation SetPurchasedCredits($contributorId: uuid!, $totalCredits: Int!, $usedCredits: Int!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { purchased_credits_total: $totalCredits, purchased_credits_used: $usedCredits }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const INCREMENT_PURCHASED_CREDITS_USED = gql`
	mutation IncrementPurchasedCreditsUsed($contributorId: uuid!) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_inc: { purchased_credits_used: 1 }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

// ============================================
// Contributor Mutations - Subscription
// ============================================

export const UPDATE_SUBSCRIPTION_TIER = gql`
	mutation UpdateSubscriptionTier(
		$contributorId: uuid!
		$tier: subscription_tier_enum!
		$analysisLimit: Int!
	) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: { subscription_tier: $tier, analysis_limit: $analysisLimit }
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const UPDATE_ANALYSIS_LIMIT_BY_TIER = gql`
	mutation UpdateAnalysisLimitByTier($contributorId: uuid!, $limit: Int) {
		update_contributor_by_pk(pk_columns: { id: $contributorId }, _set: { analysis_limit: $limit }) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;

export const UPDATE_CONTRIBUTOR_SUBSCRIPTION = gql`
	mutation UpdateContributorSubscription(
		$id: uuid!
		$realtimeEnabled: Boolean!
		$expiresAt: timestamptz
	) {
		update_contributor_by_pk(
			pk_columns: { id: $id }
			_set: {
				realtime_collaboration_enabled: $realtimeEnabled
				subscription_expires_at: $expiresAt
			}
		) {
			id
			realtime_collaboration_enabled
			subscription_expires_at
		}
	}
`;

// ============================================
// Contributor Mutations - Account Management
// ============================================

export const ANONYMIZE_AND_DELETE_USER = gql`
	mutation AnonymizeAndDeleteUser($userId: uuid!) {
		update_discussion(where: { created_by: { _eq: $userId } }, _set: { is_anonymous: true }) {
			affected_rows
		}
		update_post(where: { author_id: { _eq: $userId } }, _set: { is_anonymous: true }) {
			affected_rows
		}
		delete_contributor(where: { id: { _eq: $userId } }) {
			affected_rows
			returning {
				id
			}
		}
	}
`;

// ============================================
// Contributor Mutations - Growth Metrics
// ============================================

export const UPDATE_CONTRIBUTOR_GROWTH_METRICS = gql`
	mutation UpdateContributorGrowthMetrics(
		$contributorId: uuid!
		$totalXP: Int
		$currentLevel: Int
		$steelmanCount: Int
		$steelmanQualityAvg: numeric
		$synthesisCount: Int
		$acknowledgmentCount: Int
		$positionsChangedCount: Int
		$clarifyingQuestionsCount: Int
		$mindsOpenedCount: Int
	) {
		update_contributor_by_pk(
			pk_columns: { id: $contributorId }
			_set: {
				total_xp: $totalXP
				current_level: $currentLevel
				steelman_count: $steelmanCount
				steelman_quality_avg: $steelmanQualityAvg
				synthesis_count: $synthesisCount
				acknowledgment_count: $acknowledgmentCount
				positions_changed_count: $positionsChangedCount
				clarifying_questions_count: $clarifyingQuestionsCount
				minds_opened_count: $mindsOpenedCount
			}
		) {
			...ContributorFields
		}
	}
	${CONTRIBUTOR_FIELDS}
`;
