/**
 * Growth & Gamification Utilities
 * Handles XP calculations, leveling, and intellectual growth tracking
 */

import type { PostType } from '$lib/types/writingStyle';
import { POST_TYPE_CONFIG } from '$lib/types/writingStyle';

// ============================================================================
// XP & Leveling Constants
// ============================================================================

export const XP_VALUES = {
	// Post type base XP (can be multiplied by quality)
	STEELMAN: 30,
	SYNTHESIS: 50,
	ACKNOWLEDGMENT: 25,
	COUNTER_WITH_STEELMAN: 20,
	CLARIFYING_QUESTION: 15,
	SUPPORTING_EVIDENCE: 15,
	COUNTER_ARGUMENT: 10,
	RESPONSE: 5,
	QUESTION: 5,

	// Additional XP bonuses
	CITATION: 5,
	POSITION_CHANGED: 50,
	MIND_OPENED: 15, // When someone acknowledges your point
	HIGH_QUALITY_STEELMAN: 20, // Bonus for steelman score 8+
	QUALITY_MULTIPLIER: 1.5 // Multiplier for exceptional posts
} as const;

export const LEVEL_TITLES = {
	1: 'Novice',
	5: 'Apprentice Reasoner',
	10: 'Reasoning Adept',
	15: 'Journeyman Dialectician',
	20: 'Skilled Debater',
	25: 'Master Reasonsmith',
	35: 'Grandmaster',
	50: 'Legendary Sage'
} as const;

// ============================================================================
// Level Calculations
// ============================================================================

/**
 * Calculate level from total XP using progressive formula
 * Level 1: 0 XP
 * Level 2: 100 XP
 * Level 3: 300 XP (100 + 200)
 * Level 4: 600 XP (100 + 200 + 300)
 */
export function calculateLevelFromXP(totalXP: number): number {
	let level = 1;
	let xpRemaining = totalXP;

	while (xpRemaining > 0) {
		const xpNeeded = level * 100;
		if (xpRemaining >= xpNeeded) {
			xpRemaining -= xpNeeded;
			level++;
		} else {
			break;
		}
	}

	return level;
}

/**
 * Get XP required to reach next level from current level
 */
export function getXPForNextLevel(currentLevel: number): number {
	return currentLevel * 100;
}

/**
 * Get XP progress toward next level
 * Returns { current, needed, percentage }
 */
export function getLevelProgress(totalXP: number): {
	currentLevel: number;
	currentXP: number;
	xpForNextLevel: number;
	xpToNextLevel: number;
	percentage: number;
	title: string;
} {
	const currentLevel = calculateLevelFromXP(totalXP);
	const xpForNextLevel = getXPForNextLevel(currentLevel);

	// Calculate XP at start of current level
	let xpAtLevelStart = 0;
	for (let i = 1; i < currentLevel; i++) {
		xpAtLevelStart += i * 100;
	}

	const currentXP = totalXP - xpAtLevelStart;
	const xpToNextLevel = xpForNextLevel - currentXP;
	const percentage = (currentXP / xpForNextLevel) * 100;

	// Get level title
	const title = getLevelTitle(currentLevel);

	return {
		currentLevel,
		currentXP,
		xpForNextLevel,
		xpToNextLevel,
		percentage: Math.min(100, Math.max(0, percentage)),
		title
	};
}

/**
 * Get title for a given level
 */
export function getLevelTitle(level: number): string {
	// Find the highest level title <= current level
	const titles = Object.entries(LEVEL_TITLES)
		.map(([lvl, title]) => ({ level: parseInt(lvl), title }))
		.sort((a, b) => b.level - a.level);

	for (const { level: titleLevel, title } of titles) {
		if (level >= titleLevel) {
			return title;
		}
	}

	return 'Novice';
}

// ============================================================================
// XP Calculation
// ============================================================================

/**
 * Calculate XP earned for a post
 */
export function calculatePostXP(params: {
	postType: PostType;
	citationCount?: number;
	steelmanScore?: number;
	understandingScore?: number;
	intellectualHumilityScore?: number;
}): {
	baseXP: number;
	bonusXP: number;
	totalXP: number;
	breakdown: Array<{ source: string; xp: number }>;
} {
	const breakdown: Array<{ source: string; xp: number }> = [];

	// Base XP from post type
	const config = POST_TYPE_CONFIG[params.postType];
	const baseXP = config?.xp || XP_VALUES.RESPONSE;
	breakdown.push({ source: `${config?.label || 'Post'}`, xp: baseXP });

	let bonusXP = 0;

	// Citation bonus
	if (params.citationCount && params.citationCount > 0) {
		const citationBonus = params.citationCount * XP_VALUES.CITATION;
		bonusXP += citationBonus;
		breakdown.push({ source: `${params.citationCount} citations`, xp: citationBonus });
	}

	// High-quality steelman bonus
	if (params.steelmanScore && params.steelmanScore >= 8.0) {
		bonusXP += XP_VALUES.HIGH_QUALITY_STEELMAN;
		breakdown.push({ source: 'Excellent steelman', xp: XP_VALUES.HIGH_QUALITY_STEELMAN });
	}

	// Understanding score bonus
	if (params.understandingScore && params.understandingScore >= 8.0) {
		const understandingBonus = 10;
		bonusXP += understandingBonus;
		breakdown.push({ source: 'Deep understanding', xp: understandingBonus });
	}

	// Intellectual humility bonus
	if (params.intellectualHumilityScore && params.intellectualHumilityScore >= 8.0) {
		const humilityBonus = 10;
		bonusXP += humilityBonus;
		breakdown.push({ source: 'Intellectual humility', xp: humilityBonus });
	}

	const totalXP = baseXP + bonusXP;

	return {
		baseXP,
		bonusXP,
		totalXP,
		breakdown
	};
}

// ============================================================================
// Achievement Checking
// ============================================================================

export interface Achievement {
	key: string;
	name: string;
	description: string;
	category: 'steelman' | 'synthesis' | 'humility' | 'growth' | 'evidence' | 'community';
	tier: 'bronze' | 'silver' | 'gold' | 'platinum';
	requirementType: 'count' | 'average' | 'streak' | 'milestone';
	requirementValue: number;
	iconName?: string;
}

/**
 * Check if user has met achievement requirement
 */
export function checkAchievementProgress(
	achievement: Achievement,
	userStats: {
		steemanCount?: number;
		steelmanQualityAvg?: number;
		synthesisCount?: number;
		acknowledgmentCount?: number;
		positionsChangedCount?: number;
		currentLevel?: number;
		clarifyingQuestionsCount?: number;
		mindsOpenedCount?: number;
		citationCount?: number;
		discussionCount?: number;
	}
): { met: boolean; progress: number; target: number } {
	const target = achievement.requirementValue;
	let progress = 0;

	switch (achievement.key) {
		// Steelman achievements
		case 'steel_apprentice':
		case 'steel_journeyman':
		case 'steel_sharpener':
		case 'steel_master':
			progress = userStats.steemanCount || 0;
			break;

		case 'charitable_reader':
			progress = userStats.steelmanQualityAvg || 0;
			break;

		// Synthesis achievements
		case 'bridge_builder':
		case 'connection_master':
			progress = userStats.synthesisCount || 0;
			break;

		// Humility achievements
		case 'humble_scholar':
		case 'growth_mindset':
			progress = userStats.acknowledgmentCount || 0;
			break;

		case 'question_master':
			progress = userStats.clarifyingQuestionsCount || 0;
			break;

		// Growth achievements
		case 'perspective_shifter':
			progress = userStats.positionsChangedCount || 0;
			break;

		case 'mind_opener':
			progress = userStats.mindsOpenedCount || 0;
			break;

		case 'intellectual_explorer':
		case 'master_reasonsmith':
		case 'grandmaster':
			progress = userStats.currentLevel || 1;
			break;

		// Evidence achievements
		case 'evidence_seeker':
		case 'source_scholar':
			progress = userStats.citationCount || 0;
			break;

		// Community achievements
		case 'conversation_starter':
		case 'community_pillar':
			progress = userStats.discussionCount || 0;
			break;
	}

	return {
		met: progress >= target,
		progress,
		target
	};
}

// ============================================================================
// Growth Metric Helpers
// ============================================================================

/**
 * Calculate average steelman quality
 */
export function calculateSteelmanAverage(totalScore: number, count: number): number | null {
	if (count === 0) return null;
	return Math.round((totalScore / count) * 10) / 10; // Round to 1 decimal
}

/**
 * Format XP with commas
 */
export function formatXP(xp: number | undefined | null): string {
	if (xp === undefined || xp === null) return '0';
	return xp.toLocaleString();
}

/**
 * Get color for post type category
 */
export function getCategoryColor(category: string): string {
	const colors: Record<string, string> = {
		understanding: '#8b5cf6', // purple
		humility: '#06b6d4', // teal
		reasoning: '#f59e0b', // orange
		evidence: '#10b981', // green
		engagement: '#6b7280' // gray
	};

	return colors[category] || colors.engagement;
}

/**
 * Get tier color for achievements
 */
export function getTierColor(tier: string): string {
	const colors: Record<string, string> = {
		bronze: '#cd7f32',
		silver: '#c0c0c0',
		gold: '#ffd700',
		platinum: '#e5e4e2'
	};

	return colors[tier] || colors.bronze;
}

/**
 * Calculate growth trajectory (percentage change over time)
 */
export function calculateGrowthTrajectory(currentValue: number, previousValue: number): number {
	if (previousValue === 0) return currentValue > 0 ? 100 : 0;
	return Math.round(((currentValue - previousValue) / previousValue) * 100);
}

/**
 * Get encouragement message based on activity
 */
export function getEncouragementMessage(activityType: PostType): string {
	const messages: Record<string, string> = {
		steelman: "Great steelmanning! You're demonstrating real understanding.",
		synthesis: "Excellent synthesis! You're building bridges between viewpoints.",
		acknowledgment: 'Intellectual humility is a rare virtue. Well done!',
		counter_with_steelman: 'Thoughtful counter-argument. You showed understanding first.',
		clarifying_question: 'Good question! Curiosity leads to growth.',
		supporting_evidence: "Evidence strengthens everyone's understanding.",
		counter_argument: 'Consider steelmanning first to show understanding.',
		question: 'Questions help explore ideas deeper.',
		response: 'Every contribution adds to the discussion.'
	};

	return messages[activityType] || 'Keep engaging in good faith!';
}
