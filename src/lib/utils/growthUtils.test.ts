/**
 * Tests for growth and gamification utilities
 */

import { describe, it, expect } from 'vitest';
import {
	calculateLevelFromXP,
	getXPForNextLevel,
	getLevelProgress,
	getLevelTitle,
	calculatePostXP,
	checkAchievementProgress,
	calculateSteelmanAverage,
	formatXP,
	getCategoryColor,
	getTierColor,
	calculateGrowthTrajectory,
	getEncouragementMessage,
	XP_VALUES,
	LEVEL_TITLES
} from './growthUtils';
import type { Achievement } from './growthUtils';

describe('calculateLevelFromXP', () => {
	it('returns level 1 for 0 XP', () => {
		expect(calculateLevelFromXP(0)).toBe(1);
	});

	it('returns level 1 for XP below 100', () => {
		expect(calculateLevelFromXP(50)).toBe(1);
		expect(calculateLevelFromXP(99)).toBe(1);
	});

	it('returns level 2 for 100 XP', () => {
		expect(calculateLevelFromXP(100)).toBe(2);
	});

	it('returns level 2 for 100-299 XP', () => {
		expect(calculateLevelFromXP(100)).toBe(2);
		expect(calculateLevelFromXP(200)).toBe(2);
		expect(calculateLevelFromXP(299)).toBe(2);
	});

	it('returns level 3 for 300-599 XP', () => {
		// Level 3 requires 100 + 200 = 300 total XP
		expect(calculateLevelFromXP(300)).toBe(3);
		expect(calculateLevelFromXP(450)).toBe(3);
		expect(calculateLevelFromXP(599)).toBe(3);
	});

	it('returns level 4 for 600-999 XP', () => {
		// Level 4 requires 100 + 200 + 300 = 600 total XP
		expect(calculateLevelFromXP(600)).toBe(4);
		expect(calculateLevelFromXP(999)).toBe(4);
	});

	it('returns level 5 for 1000-1499 XP', () => {
		// Level 5 requires 100 + 200 + 300 + 400 = 1000 total XP
		expect(calculateLevelFromXP(1000)).toBe(5);
		expect(calculateLevelFromXP(1499)).toBe(5);
	});

	it('handles high XP values', () => {
		// Level 10 requires sum(100..900) = 4500 total XP
		expect(calculateLevelFromXP(4500)).toBe(10);
		expect(calculateLevelFromXP(10000)).toBeGreaterThan(10);
	});

	it('handles negative XP (treats as 0)', () => {
		expect(calculateLevelFromXP(-100)).toBe(1);
	});
});

describe('getXPForNextLevel', () => {
	it('returns 100 for level 1', () => {
		expect(getXPForNextLevel(1)).toBe(100);
	});

	it('returns 200 for level 2', () => {
		expect(getXPForNextLevel(2)).toBe(200);
	});

	it('returns level * 100', () => {
		expect(getXPForNextLevel(5)).toBe(500);
		expect(getXPForNextLevel(10)).toBe(1000);
		expect(getXPForNextLevel(50)).toBe(5000);
	});
});

describe('getLevelProgress', () => {
	it('returns correct progress for level 1 with 0 XP', () => {
		const progress = getLevelProgress(0);
		expect(progress.currentLevel).toBe(1);
		expect(progress.currentXP).toBe(0);
		expect(progress.xpForNextLevel).toBe(100);
		expect(progress.xpToNextLevel).toBe(100);
		expect(progress.percentage).toBe(0);
	});

	it('returns correct progress for level 1 with 50 XP', () => {
		const progress = getLevelProgress(50);
		expect(progress.currentLevel).toBe(1);
		expect(progress.currentXP).toBe(50);
		expect(progress.xpForNextLevel).toBe(100);
		expect(progress.xpToNextLevel).toBe(50);
		expect(progress.percentage).toBe(50);
	});

	it('returns correct progress for level 2 with 150 XP', () => {
		const progress = getLevelProgress(150);
		expect(progress.currentLevel).toBe(2);
		expect(progress.currentXP).toBe(50); // 150 - 100 (XP at level 2 start)
		expect(progress.xpForNextLevel).toBe(200);
		expect(progress.xpToNextLevel).toBe(150);
		expect(progress.percentage).toBe(25);
	});

	it('clamps percentage between 0 and 100', () => {
		const progress = getLevelProgress(0);
		expect(progress.percentage).toBeGreaterThanOrEqual(0);
		expect(progress.percentage).toBeLessThanOrEqual(100);
	});

	it('includes title', () => {
		const progress = getLevelProgress(0);
		expect(progress.title).toBe('Novice');
	});
});

describe('getLevelTitle', () => {
	it('returns Novice for level 1', () => {
		expect(getLevelTitle(1)).toBe('Novice');
	});

	it('returns Novice for levels 1-4', () => {
		expect(getLevelTitle(2)).toBe('Novice');
		expect(getLevelTitle(3)).toBe('Novice');
		expect(getLevelTitle(4)).toBe('Novice');
	});

	it('returns Apprentice Reasoner for level 5', () => {
		expect(getLevelTitle(5)).toBe('Apprentice Reasoner');
	});

	it('returns Reasoning Adept for level 10', () => {
		expect(getLevelTitle(10)).toBe('Reasoning Adept');
	});

	it('returns Journeyman Dialectician for level 15', () => {
		expect(getLevelTitle(15)).toBe('Journeyman Dialectician');
	});

	it('returns Skilled Debater for level 20', () => {
		expect(getLevelTitle(20)).toBe('Skilled Debater');
	});

	it('returns Master Reasonsmith for level 25', () => {
		expect(getLevelTitle(25)).toBe('Master Reasonsmith');
	});

	it('returns Grandmaster for level 35', () => {
		expect(getLevelTitle(35)).toBe('Grandmaster');
	});

	it('returns Legendary Sage for level 50+', () => {
		expect(getLevelTitle(50)).toBe('Legendary Sage');
		expect(getLevelTitle(100)).toBe('Legendary Sage');
	});

	it('uses highest applicable title for intermediate levels', () => {
		expect(getLevelTitle(7)).toBe('Apprentice Reasoner');
		expect(getLevelTitle(12)).toBe('Reasoning Adept');
		expect(getLevelTitle(30)).toBe('Master Reasonsmith');
	});
});

describe('calculatePostXP', () => {
	describe('base XP from post type', () => {
		it('returns correct XP for steelman post', () => {
			const result = calculatePostXP({ postType: 'steelman' });
			expect(result.baseXP).toBe(30);
			expect(result.totalXP).toBe(30);
		});

		it('returns correct XP for synthesis post', () => {
			const result = calculatePostXP({ postType: 'synthesis' });
			expect(result.baseXP).toBe(50);
		});

		it('returns correct XP for acknowledgment post', () => {
			const result = calculatePostXP({ postType: 'acknowledgment' });
			expect(result.baseXP).toBe(25);
		});

		it('returns correct XP for counter_with_steelman post', () => {
			const result = calculatePostXP({ postType: 'counter_with_steelman' });
			expect(result.baseXP).toBe(20);
		});

		it('returns correct XP for clarifying_question post', () => {
			const result = calculatePostXP({ postType: 'clarifying_question' });
			expect(result.baseXP).toBe(15);
		});

		it('returns correct XP for supporting_evidence post', () => {
			const result = calculatePostXP({ postType: 'supporting_evidence' });
			expect(result.baseXP).toBe(15);
		});

		it('returns correct XP for counter_argument post', () => {
			const result = calculatePostXP({ postType: 'counter_argument' });
			expect(result.baseXP).toBe(10);
		});

		it('returns correct XP for response post', () => {
			const result = calculatePostXP({ postType: 'response' });
			expect(result.baseXP).toBe(5);
		});

		it('returns correct XP for question post', () => {
			const result = calculatePostXP({ postType: 'question' });
			expect(result.baseXP).toBe(5);
		});
	});

	describe('citation bonus', () => {
		it('adds 5 XP per citation', () => {
			const result = calculatePostXP({
				postType: 'response',
				citationCount: 3
			});
			expect(result.bonusXP).toBe(15);
			expect(result.totalXP).toBe(20); // 5 base + 15 bonus
		});

		it('includes citation in breakdown', () => {
			const result = calculatePostXP({
				postType: 'response',
				citationCount: 2
			});
			expect(result.breakdown).toContainEqual({ source: '2 citations', xp: 10 });
		});

		it('ignores 0 citations', () => {
			const result = calculatePostXP({
				postType: 'response',
				citationCount: 0
			});
			expect(result.bonusXP).toBe(0);
		});
	});

	describe('steelman quality bonus', () => {
		it('adds 20 XP for steelman score >= 8', () => {
			const result = calculatePostXP({
				postType: 'steelman',
				steelmanScore: 8.5
			});
			expect(result.bonusXP).toBe(20);
			expect(result.breakdown).toContainEqual({ source: 'Excellent steelman', xp: 20 });
		});

		it('adds bonus at exactly 8.0', () => {
			const result = calculatePostXP({
				postType: 'steelman',
				steelmanScore: 8.0
			});
			expect(result.bonusXP).toBe(20);
		});

		it('does not add bonus for score below 8', () => {
			const result = calculatePostXP({
				postType: 'steelman',
				steelmanScore: 7.9
			});
			expect(result.bonusXP).toBe(0);
		});
	});

	describe('understanding score bonus', () => {
		it('adds 10 XP for understanding score >= 8', () => {
			const result = calculatePostXP({
				postType: 'response',
				understandingScore: 9.0
			});
			expect(result.bonusXP).toBe(10);
			expect(result.breakdown).toContainEqual({ source: 'Deep understanding', xp: 10 });
		});

		it('does not add bonus for score below 8', () => {
			const result = calculatePostXP({
				postType: 'response',
				understandingScore: 7.5
			});
			expect(result.bonusXP).toBe(0);
		});
	});

	describe('intellectual humility bonus', () => {
		it('adds 10 XP for humility score >= 8', () => {
			const result = calculatePostXP({
				postType: 'response',
				intellectualHumilityScore: 8.5
			});
			expect(result.bonusXP).toBe(10);
			expect(result.breakdown).toContainEqual({ source: 'Intellectual humility', xp: 10 });
		});

		it('does not add bonus for score below 8', () => {
			const result = calculatePostXP({
				postType: 'response',
				intellectualHumilityScore: 7.0
			});
			expect(result.bonusXP).toBe(0);
		});
	});

	describe('combined bonuses', () => {
		it('stacks all bonuses correctly', () => {
			const result = calculatePostXP({
				postType: 'steelman',
				citationCount: 2,
				steelmanScore: 9.0,
				understandingScore: 8.5,
				intellectualHumilityScore: 8.0
			});
			// Base: 30 + Citations: 10 + Steelman: 20 + Understanding: 10 + Humility: 10 = 80
			expect(result.baseXP).toBe(30);
			expect(result.bonusXP).toBe(50);
			expect(result.totalXP).toBe(80);
		});

		it('includes all bonuses in breakdown', () => {
			const result = calculatePostXP({
				postType: 'synthesis',
				citationCount: 1,
				steelmanScore: 8.0,
				understandingScore: 8.0,
				intellectualHumilityScore: 8.0
			});
			expect(result.breakdown.length).toBe(5);
		});
	});
});

describe('checkAchievementProgress', () => {
	const createAchievement = (key: string, requirementValue: number): Achievement => ({
		key,
		name: 'Test Achievement',
		description: 'Test',
		category: 'steelman',
		tier: 'bronze',
		requirementType: 'count',
		requirementValue
	});

	describe('steelman achievements', () => {
		it('tracks steel_apprentice progress', () => {
			const achievement = createAchievement('steel_apprentice', 5);
			const result = checkAchievementProgress(achievement, { steelmanCount: 3 });
			expect(result.progress).toBe(3);
			expect(result.target).toBe(5);
			expect(result.met).toBe(false);
		});

		it('marks steel_master as met when count reached', () => {
			const achievement = createAchievement('steel_master', 10);
			const result = checkAchievementProgress(achievement, { steelmanCount: 15 });
			expect(result.met).toBe(true);
		});

		it('tracks charitable_reader by quality average', () => {
			const achievement = createAchievement('charitable_reader', 8);
			const result = checkAchievementProgress(achievement, { steelmanQualityAvg: 8.5 });
			expect(result.progress).toBe(8.5);
			expect(result.met).toBe(true);
		});
	});

	describe('synthesis achievements', () => {
		it('tracks bridge_builder progress', () => {
			const achievement = createAchievement('bridge_builder', 5);
			const result = checkAchievementProgress(achievement, { synthesisCount: 4 });
			expect(result.progress).toBe(4);
			expect(result.met).toBe(false);
		});
	});

	describe('humility achievements', () => {
		it('tracks humble_scholar progress', () => {
			const achievement = createAchievement('humble_scholar', 3);
			const result = checkAchievementProgress(achievement, { acknowledgmentCount: 5 });
			expect(result.progress).toBe(5);
			expect(result.met).toBe(true);
		});

		it('tracks question_master progress', () => {
			const achievement = createAchievement('question_master', 10);
			const result = checkAchievementProgress(achievement, { clarifyingQuestionsCount: 7 });
			expect(result.progress).toBe(7);
			expect(result.met).toBe(false);
		});
	});

	describe('growth achievements', () => {
		it('tracks perspective_shifter progress', () => {
			const achievement = createAchievement('perspective_shifter', 1);
			const result = checkAchievementProgress(achievement, { positionsChangedCount: 1 });
			expect(result.met).toBe(true);
		});

		it('tracks mind_opener progress', () => {
			const achievement = createAchievement('mind_opener', 5);
			const result = checkAchievementProgress(achievement, { mindsOpenedCount: 3 });
			expect(result.progress).toBe(3);
			expect(result.met).toBe(false);
		});

		it('tracks level-based achievements', () => {
			const achievement = createAchievement('intellectual_explorer', 10);
			const result = checkAchievementProgress(achievement, { currentLevel: 12 });
			expect(result.progress).toBe(12);
			expect(result.met).toBe(true);
		});
	});

	describe('evidence achievements', () => {
		it('tracks evidence_seeker progress', () => {
			const achievement = createAchievement('evidence_seeker', 10);
			const result = checkAchievementProgress(achievement, { citationCount: 8 });
			expect(result.progress).toBe(8);
			expect(result.met).toBe(false);
		});
	});

	describe('community achievements', () => {
		it('tracks conversation_starter progress', () => {
			const achievement = createAchievement('conversation_starter', 5);
			const result = checkAchievementProgress(achievement, { discussionCount: 5 });
			expect(result.met).toBe(true);
		});
	});

	describe('missing stats', () => {
		it('defaults to 0 for missing counts', () => {
			const achievement = createAchievement('steel_apprentice', 5);
			const result = checkAchievementProgress(achievement, {});
			expect(result.progress).toBe(0);
			expect(result.met).toBe(false);
		});

		it('defaults to level 1 for missing level', () => {
			const achievement = createAchievement('intellectual_explorer', 1);
			const result = checkAchievementProgress(achievement, {});
			expect(result.progress).toBe(1);
			expect(result.met).toBe(true);
		});
	});
});

describe('calculateSteelmanAverage', () => {
	it('returns null for 0 count', () => {
		expect(calculateSteelmanAverage(100, 0)).toBeNull();
	});

	it('calculates correct average', () => {
		expect(calculateSteelmanAverage(80, 10)).toBe(8);
		expect(calculateSteelmanAverage(85, 10)).toBe(8.5);
	});

	it('rounds to 1 decimal place', () => {
		expect(calculateSteelmanAverage(100, 3)).toBe(33.3);
		expect(calculateSteelmanAverage(200, 3)).toBe(66.7);
	});
});

describe('formatXP', () => {
	it('formats 0', () => {
		expect(formatXP(0)).toBe('0');
	});

	it('returns "0" for undefined', () => {
		expect(formatXP(undefined)).toBe('0');
	});

	it('returns "0" for null', () => {
		expect(formatXP(null)).toBe('0');
	});

	it('formats numbers with commas', () => {
		expect(formatXP(1000)).toBe('1,000');
		expect(formatXP(1000000)).toBe('1,000,000');
	});

	it('formats small numbers without commas', () => {
		expect(formatXP(100)).toBe('100');
		expect(formatXP(999)).toBe('999');
	});
});

describe('getCategoryColor', () => {
	it('returns purple for understanding', () => {
		expect(getCategoryColor('understanding')).toBe('#8b5cf6');
	});

	it('returns teal for humility', () => {
		expect(getCategoryColor('humility')).toBe('#06b6d4');
	});

	it('returns orange for reasoning', () => {
		expect(getCategoryColor('reasoning')).toBe('#f59e0b');
	});

	it('returns green for evidence', () => {
		expect(getCategoryColor('evidence')).toBe('#10b981');
	});

	it('returns gray for engagement', () => {
		expect(getCategoryColor('engagement')).toBe('#6b7280');
	});

	it('returns gray for unknown category', () => {
		expect(getCategoryColor('unknown')).toBe('#6b7280');
	});
});

describe('getTierColor', () => {
	it('returns bronze color', () => {
		expect(getTierColor('bronze')).toBe('#cd7f32');
	});

	it('returns silver color', () => {
		expect(getTierColor('silver')).toBe('#c0c0c0');
	});

	it('returns gold color', () => {
		expect(getTierColor('gold')).toBe('#ffd700');
	});

	it('returns platinum color', () => {
		expect(getTierColor('platinum')).toBe('#e5e4e2');
	});

	it('returns bronze for unknown tier', () => {
		expect(getTierColor('unknown')).toBe('#cd7f32');
	});
});

describe('calculateGrowthTrajectory', () => {
	it('returns 100% for growth from 0', () => {
		expect(calculateGrowthTrajectory(50, 0)).toBe(100);
	});

	it('returns 0% for no growth from 0', () => {
		expect(calculateGrowthTrajectory(0, 0)).toBe(0);
	});

	it('calculates positive growth', () => {
		expect(calculateGrowthTrajectory(150, 100)).toBe(50);
		expect(calculateGrowthTrajectory(200, 100)).toBe(100);
	});

	it('calculates negative growth', () => {
		expect(calculateGrowthTrajectory(50, 100)).toBe(-50);
		expect(calculateGrowthTrajectory(0, 100)).toBe(-100);
	});

	it('rounds to whole number', () => {
		expect(calculateGrowthTrajectory(133, 100)).toBe(33);
	});
});

describe('getEncouragementMessage', () => {
	it('returns message for steelman', () => {
		const message = getEncouragementMessage('steelman');
		expect(message).toContain('steelmanning');
	});

	it('returns message for synthesis', () => {
		const message = getEncouragementMessage('synthesis');
		expect(message).toContain('synthesis');
	});

	it('returns message for acknowledgment', () => {
		const message = getEncouragementMessage('acknowledgment');
		expect(message).toContain('humility');
	});

	it('returns message for counter_with_steelman', () => {
		const message = getEncouragementMessage('counter_with_steelman');
		expect(message).toContain('understanding');
	});

	it('returns message for clarifying_question', () => {
		const message = getEncouragementMessage('clarifying_question');
		expect(message).toContain('question');
	});

	it('returns message for supporting_evidence', () => {
		const message = getEncouragementMessage('supporting_evidence');
		expect(message).toContain('Evidence');
	});

	it('returns message for counter_argument', () => {
		const message = getEncouragementMessage('counter_argument');
		expect(message).toContain('steelmanning');
	});

	it('returns message for question', () => {
		const message = getEncouragementMessage('question');
		expect(message).toContain('Questions');
	});

	it('returns message for response', () => {
		const message = getEncouragementMessage('response');
		expect(message).toContain('contribution');
	});
});

describe('XP_VALUES constants', () => {
	it('has all expected values', () => {
		expect(XP_VALUES.STEELMAN).toBe(30);
		expect(XP_VALUES.SYNTHESIS).toBe(50);
		expect(XP_VALUES.ACKNOWLEDGMENT).toBe(25);
		expect(XP_VALUES.COUNTER_WITH_STEELMAN).toBe(20);
		expect(XP_VALUES.CLARIFYING_QUESTION).toBe(15);
		expect(XP_VALUES.SUPPORTING_EVIDENCE).toBe(15);
		expect(XP_VALUES.COUNTER_ARGUMENT).toBe(10);
		expect(XP_VALUES.RESPONSE).toBe(5);
		expect(XP_VALUES.QUESTION).toBe(5);
		expect(XP_VALUES.CITATION).toBe(5);
		expect(XP_VALUES.POSITION_CHANGED).toBe(50);
		expect(XP_VALUES.MIND_OPENED).toBe(15);
		expect(XP_VALUES.HIGH_QUALITY_STEELMAN).toBe(20);
		expect(XP_VALUES.QUALITY_MULTIPLIER).toBe(1.5);
	});
});

describe('LEVEL_TITLES constants', () => {
	it('has all expected titles', () => {
		expect(LEVEL_TITLES[1]).toBe('Novice');
		expect(LEVEL_TITLES[5]).toBe('Apprentice Reasoner');
		expect(LEVEL_TITLES[10]).toBe('Reasoning Adept');
		expect(LEVEL_TITLES[15]).toBe('Journeyman Dialectician');
		expect(LEVEL_TITLES[20]).toBe('Skilled Debater');
		expect(LEVEL_TITLES[25]).toBe('Master Reasonsmith');
		expect(LEVEL_TITLES[35]).toBe('Grandmaster');
		expect(LEVEL_TITLES[50]).toBe('Legendary Sage');
	});
});
