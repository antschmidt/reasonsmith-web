import { gql } from '@apollo/client/core';
import { ACHIEVEMENT_FIELDS, CONTRIBUTOR_ACHIEVEMENT_FIELDS, XP_ACTIVITY_FIELDS } from '../fragments';

// ============================================
// Achievement Queries
// ============================================

export const GET_ALL_ACHIEVEMENTS = gql`
	query GetAllAchievements {
		achievement(order_by: [{ category: asc }, { tier: asc }, { requirement_value: asc }]) {
			...AchievementFields
		}
	}
	${ACHIEVEMENT_FIELDS}
`;

export const GET_CONTRIBUTOR_ACHIEVEMENTS = gql`
	query GetContributorAchievements($contributorId: uuid!) {
		contributor_achievement(
			where: { contributor_id: { _eq: $contributorId } }
			order_by: { earned_at: desc }
		) {
			...ContributorAchievementFields
		}
	}
	${CONTRIBUTOR_ACHIEVEMENT_FIELDS}
`;

// ============================================
// XP Activity Queries
// ============================================

export const GET_CONTRIBUTOR_XP_ACTIVITY = gql`
	query GetContributorXPActivity($contributorId: uuid!, $limit: Int = 50) {
		xp_activity(
			where: { contributor_id: { _eq: $contributorId } }
			order_by: { created_at: desc }
			limit: $limit
		) {
			...XPActivityFields
			post {
				id
				content
				discussion_id
			}
			discussion {
				id
				discussion_versions(
					where: { version_type: { _eq: "published" } }
					order_by: { version_number: desc }
					limit: 1
				) {
					title
				}
			}
		}
	}
	${XP_ACTIVITY_FIELDS}
`;

// ============================================
// Growth Metrics Queries
// ============================================

export const GET_CONTRIBUTOR_GROWTH_METRICS = gql`
	query GetContributorGrowthMetrics($contributorId: uuid!) {
		contributor_by_pk(id: $contributorId) {
			id
			total_xp
			current_level
			steelman_count
			steelman_quality_avg
			synthesis_count
			acknowledgment_count
			positions_changed_count
			clarifying_questions_count
			minds_opened_count
		}
		contributor_achievement(
			where: { contributor_id: { _eq: $contributorId } }
			order_by: { earned_at: desc }
		) {
			...ContributorAchievementFields
		}
		xp_activity(
			where: { contributor_id: { _eq: $contributorId } }
			order_by: { created_at: desc }
			limit: 10
		) {
			...XPActivityFields
		}
	}
	${CONTRIBUTOR_ACHIEVEMENT_FIELDS}
	${XP_ACTIVITY_FIELDS}
`;

// ============================================
// Growth Mutations
// ============================================

export const AWARD_ACHIEVEMENT = gql`
	mutation AwardAchievement($contributorId: uuid!, $achievementId: uuid!) {
		insert_contributor_achievement_one(
			object: { contributor_id: $contributorId, achievement_id: $achievementId }
		) {
			...ContributorAchievementFields
		}
	}
	${CONTRIBUTOR_ACHIEVEMENT_FIELDS}
`;

export const AWARD_XP = gql`
	mutation AwardXP(
		$contributorId: uuid!
		$activityType: String!
		$xpAmount: Int!
		$relatedPostId: uuid
		$notes: String
	) {
		award_xp(
			args: {
				p_contributor_id: $contributorId
				p_activity_type: $activityType
				p_xp_amount: $xpAmount
				p_related_post_id: $relatedPostId
				p_notes: $notes
			}
		) {
			new_total_xp
			new_level
			level_up
		}
	}
`;
