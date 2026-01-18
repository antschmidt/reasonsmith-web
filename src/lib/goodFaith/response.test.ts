/**
 * Tests for response normalization utilities
 */

import { describe, it, expect } from 'vitest';
import {
	normalizeScore,
	getLabel,
	extractFallacies,
	normalizeClaudeResponse,
	normalizeOpenAIResponse,
	parseClaudeJsonResponse,
	isValidResponse,
	addLegacyFields
} from './response';
import type { Claim, ClaudeRawResponse, OpenAIRawResponse, GoodFaithResult } from './types';

describe('normalizeScore', () => {
	describe('with 0-100 scale', () => {
		it('converts 0 to 0', () => {
			expect(normalizeScore(0, '0-100')).toBe(0);
		});

		it('converts 100 to 1', () => {
			expect(normalizeScore(100, '0-100')).toBe(1);
		});

		it('converts 50 to 0.5', () => {
			expect(normalizeScore(50, '0-100')).toBe(0.5);
		});

		it('converts 92 to 0.92', () => {
			expect(normalizeScore(92, '0-100')).toBe(0.92);
		});

		it('clamps values above 100 to 1', () => {
			expect(normalizeScore(150, '0-100')).toBe(1);
		});

		it('clamps negative values to 0', () => {
			expect(normalizeScore(-10, '0-100')).toBe(0);
		});
	});

	describe('with 0-1 scale', () => {
		it('preserves 0', () => {
			expect(normalizeScore(0, '0-1')).toBe(0);
		});

		it('preserves 1', () => {
			expect(normalizeScore(1, '0-1')).toBe(1);
		});

		it('preserves 0.5', () => {
			expect(normalizeScore(0.5, '0-1')).toBe(0.5);
		});

		it('clamps values above 1 to 1', () => {
			expect(normalizeScore(1.5, '0-1')).toBe(1);
		});

		it('clamps negative values to 0', () => {
			expect(normalizeScore(-0.5, '0-1')).toBe(0);
		});
	});
});

describe('getLabel', () => {
	describe('boundary values', () => {
		it('returns hostile for 0', () => {
			expect(getLabel(0)).toBe('hostile');
		});

		it('returns hostile for 0.19', () => {
			expect(getLabel(0.19)).toBe('hostile');
		});

		it('returns questionable at exactly 0.2', () => {
			expect(getLabel(0.2)).toBe('questionable');
		});

		it('returns questionable for 0.39', () => {
			expect(getLabel(0.39)).toBe('questionable');
		});

		it('returns neutral at exactly 0.4', () => {
			expect(getLabel(0.4)).toBe('neutral');
		});

		it('returns neutral for 0.59', () => {
			expect(getLabel(0.59)).toBe('neutral');
		});

		it('returns constructive at exactly 0.6', () => {
			expect(getLabel(0.6)).toBe('constructive');
		});

		it('returns constructive for 0.79', () => {
			expect(getLabel(0.79)).toBe('constructive');
		});

		it('returns exemplary at exactly 0.8', () => {
			expect(getLabel(0.8)).toBe('exemplary');
		});

		it('returns exemplary for 1.0', () => {
			expect(getLabel(1)).toBe('exemplary');
		});
	});

	describe('realistic scores', () => {
		it('returns exemplary for 92% (0.92)', () => {
			expect(getLabel(0.92)).toBe('exemplary');
		});

		it('returns constructive for 75% (0.75)', () => {
			expect(getLabel(0.75)).toBe('constructive');
		});

		it('returns neutral for 50% (0.5)', () => {
			expect(getLabel(0.5)).toBe('neutral');
		});

		it('returns questionable for 30% (0.3)', () => {
			expect(getLabel(0.3)).toBe('questionable');
		});

		it('returns hostile for 10% (0.1)', () => {
			expect(getLabel(0.1)).toBe('hostile');
		});
	});
});

describe('extractFallacies', () => {
	it('returns empty array for empty claims', () => {
		expect(extractFallacies([])).toEqual([]);
	});

	it('returns empty array for claims with no fallacies', () => {
		const claims: Claim[] = [
			{
				claim: 'Test claim',
				supportingArguments: [{ argument: 'Test arg', score: 8, fallacies: [] }]
			}
		];
		expect(extractFallacies(claims)).toEqual([]);
	});

	it('extracts fallacies from a single claim', () => {
		const claims: Claim[] = [
			{
				claim: 'Test claim',
				supportingArguments: [
					{ argument: 'Test arg', score: 5, fallacies: ['Ad Hominem', 'Straw Man'] }
				]
			}
		];
		const result = extractFallacies(claims);
		expect(result).toContain('Ad Hominem');
		expect(result).toContain('Straw Man');
		expect(result).toHaveLength(2);
	});

	it('extracts unique fallacies from multiple claims', () => {
		const claims: Claim[] = [
			{
				claim: 'Claim 1',
				supportingArguments: [{ argument: 'Arg 1', score: 5, fallacies: ['Ad Hominem'] }]
			},
			{
				claim: 'Claim 2',
				supportingArguments: [
					{ argument: 'Arg 2', score: 5, fallacies: ['Ad Hominem', 'False Dichotomy'] }
				]
			}
		];
		const result = extractFallacies(claims);
		expect(result).toContain('Ad Hominem');
		expect(result).toContain('False Dichotomy');
		expect(result).toHaveLength(2); // Ad Hominem should not be duplicated
	});

	it('trims whitespace from fallacy names', () => {
		const claims: Claim[] = [
			{
				claim: 'Test claim',
				supportingArguments: [
					{ argument: 'Test arg', score: 5, fallacies: ['  Ad Hominem  ', 'Straw Man '] }
				]
			}
		];
		const result = extractFallacies(claims);
		expect(result).toContain('Ad Hominem');
		expect(result).toContain('Straw Man');
	});

	it('filters out empty fallacy strings', () => {
		const claims: Claim[] = [
			{
				claim: 'Test claim',
				supportingArguments: [
					{ argument: 'Test arg', score: 5, fallacies: ['Ad Hominem', '', '   '] }
				]
			}
		];
		const result = extractFallacies(claims);
		expect(result).toEqual(['Ad Hominem']);
	});

	it('handles claims with missing supportingArguments', () => {
		const claims: Claim[] = [{ claim: 'Test claim', supportingArguments: [] }];
		expect(extractFallacies(claims)).toEqual([]);
	});
});

describe('normalizeClaudeResponse', () => {
	const baseResponse: ClaudeRawResponse = {
		claims: [],
		fallacyOverload: false,
		goodFaithScore: 75,
		goodFaithDescriptor: 'Thoughtful',
		cultishPhrases: [],
		overallAnalysis: 'This is a thoughtful analysis.',
		tags: ['logic', 'reasoning']
	};

	it('normalizes score from 0-100 to 0-1', () => {
		const result = normalizeClaudeResponse(baseResponse);
		expect(result.good_faith_score).toBe(0.75);
	});

	it('derives label from score, not from descriptor', () => {
		const response = { ...baseResponse, goodFaithScore: 92, goodFaithDescriptor: 'Transparent' };
		const result = normalizeClaudeResponse(response);
		// 92% = 0.92 -> exemplary (not "Transparent")
		expect(result.good_faith_label).toBe('exemplary');
	});

	it('uses default score of 50 when missing', () => {
		const response = { ...baseResponse, goodFaithScore: undefined as unknown as number };
		const result = normalizeClaudeResponse(response);
		expect(result.good_faith_score).toBe(0.5);
		expect(result.good_faith_label).toBe('neutral');
	});

	it('preserves claims array', () => {
		const claims: Claim[] = [
			{ claim: 'Test', supportingArguments: [{ argument: 'Arg', score: 8, fallacies: [] }] }
		];
		const response = { ...baseResponse, claims };
		const result = normalizeClaudeResponse(response);
		expect(result.claims).toEqual(claims);
	});

	it('defaults to empty claims array when missing', () => {
		const response = { ...baseResponse, claims: undefined as unknown as Claim[] };
		const result = normalizeClaudeResponse(response);
		expect(result.claims).toEqual([]);
	});

	it('sets provider to claude', () => {
		const result = normalizeClaudeResponse(baseResponse);
		expect(result.provider).toBe('claude');
	});

	it('sets usedAI to true', () => {
		const result = normalizeClaudeResponse(baseResponse);
		expect(result.usedAI).toBe(true);
	});

	it('preserves growth metrics', () => {
		const response = {
			...baseResponse,
			steelmanScore: 8,
			steelmanNotes: 'Good steelman',
			understandingScore: 7,
			intellectualHumilityScore: 9,
			relevanceScore: 10,
			relevanceNotes: 'On topic'
		};
		const result = normalizeClaudeResponse(response);
		expect(result.steelmanScore).toBe(8);
		expect(result.steelmanNotes).toBe('Good steelman');
		expect(result.understandingScore).toBe(7);
		expect(result.intellectualHumilityScore).toBe(9);
		expect(result.relevanceScore).toBe(10);
		expect(result.relevanceNotes).toBe('On topic');
	});

	it('preserves legacy fields', () => {
		const result = normalizeClaudeResponse(baseResponse);
		expect(result.goodFaithScore).toBe(75);
		expect(result.goodFaithDescriptor).toBe('Thoughtful');
		expect(result.overallAnalysis).toBe('This is a thoughtful analysis.');
	});
});

describe('normalizeOpenAIResponse', () => {
	const baseResponse: OpenAIRawResponse = {
		claims: [],
		fallacyOverload: false,
		goodFaithScore: 80,
		goodFaithDescriptor: 'Exemplary',
		cultishPhrases: [],
		summary: 'This is a well-reasoned argument.',
		tags: ['logic']
	};

	it('normalizes score from 0-100 to 0-1', () => {
		const result = normalizeOpenAIResponse(baseResponse);
		expect(result.good_faith_score).toBe(0.8);
	});

	it('derives label from score', () => {
		const result = normalizeOpenAIResponse(baseResponse);
		expect(result.good_faith_label).toBe('exemplary');
	});

	it('sets provider to openai', () => {
		const result = normalizeOpenAIResponse(baseResponse);
		expect(result.provider).toBe('openai');
	});

	it('uses summary field for summary and rationale', () => {
		const result = normalizeOpenAIResponse(baseResponse);
		expect(result.summary).toBe('This is a well-reasoned argument.');
		expect(result.rationale).toBe('This is a well-reasoned argument.');
	});
});

describe('parseClaudeJsonResponse', () => {
	it('parses valid JSON', () => {
		const json = '{"goodFaithScore": 75}';
		const result = parseClaudeJsonResponse(json);
		expect(result.goodFaithScore).toBe(75);
	});

	it('strips markdown json code blocks', () => {
		const json = '```json\n{"goodFaithScore": 75}\n```';
		const result = parseClaudeJsonResponse(json);
		expect(result.goodFaithScore).toBe(75);
	});

	it('strips plain markdown code blocks', () => {
		const json = '```\n{"goodFaithScore": 75}\n```';
		const result = parseClaudeJsonResponse(json);
		expect(result.goodFaithScore).toBe(75);
	});

	it('extracts JSON from text with preamble', () => {
		const json = 'Here is the analysis:\n{"goodFaithScore": 75}';
		const result = parseClaudeJsonResponse(json);
		expect(result.goodFaithScore).toBe(75);
	});

	it('handles whitespace around JSON', () => {
		const json = '  \n  {"goodFaithScore": 75}  \n  ';
		const result = parseClaudeJsonResponse(json);
		expect(result.goodFaithScore).toBe(75);
	});

	it('throws on invalid JSON', () => {
		const invalid = 'this is not json';
		expect(() => parseClaudeJsonResponse(invalid)).toThrow();
	});

	it('parses complex response with all fields', () => {
		const json = `{
			"claims": [{"claim": "Test", "supportingArguments": []}],
			"fallacyOverload": false,
			"goodFaithScore": 85,
			"goodFaithDescriptor": "Constructive",
			"cultishPhrases": [],
			"overallAnalysis": "Good analysis",
			"tags": ["logic"]
		}`;
		const result = parseClaudeJsonResponse(json);
		expect(result.goodFaithScore).toBe(85);
		expect(result.claims).toHaveLength(1);
		expect(result.overallAnalysis).toBe('Good analysis');
	});
});

describe('isValidResponse', () => {
	it('returns false for null', () => {
		expect(isValidResponse(null)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(isValidResponse(undefined)).toBe(false);
	});

	it('returns false for non-object', () => {
		expect(isValidResponse('string')).toBe(false);
		expect(isValidResponse(123)).toBe(false);
		expect(isValidResponse(true)).toBe(false);
	});

	it('returns true if goodFaithScore is a number', () => {
		expect(isValidResponse({ goodFaithScore: 75 })).toBe(true);
		expect(isValidResponse({ goodFaithScore: 0 })).toBe(true);
	});

	it('returns false if goodFaithScore is not a number', () => {
		expect(isValidResponse({ goodFaithScore: '75' })).toBe(false);
		expect(isValidResponse({ goodFaithScore: null })).toBe(false);
	});

	it('returns true if claims array is non-empty', () => {
		expect(isValidResponse({ claims: [{ claim: 'Test' }] })).toBe(true);
	});

	it('returns false if claims is empty array', () => {
		expect(isValidResponse({ claims: [] })).toBe(false);
	});

	it('returns false if neither goodFaithScore nor claims exist', () => {
		expect(isValidResponse({ overallAnalysis: 'Test' })).toBe(false);
	});

	it('returns true if both goodFaithScore and claims exist', () => {
		expect(isValidResponse({ goodFaithScore: 75, claims: [{ claim: 'Test' }] })).toBe(true);
	});
});

describe('addLegacyFields', () => {
	const baseResult: GoodFaithResult = {
		good_faith_score: 0.75,
		good_faith_label: 'constructive',
		claims: [],
		fallacyOverload: false,
		cultishPhrases: [],
		summary: 'Test summary',
		provider: 'claude',
		usedAI: true
	};

	it('preserves existing fields', () => {
		const result = addLegacyFields(baseResult);
		expect(result.good_faith_score).toBe(0.75);
		expect(result.good_faith_label).toBe('constructive');
		expect(result.summary).toBe('Test summary');
	});

	it('adds usedClaude field for claude provider', () => {
		const result = addLegacyFields(baseResult) as GoodFaithResult & { usedClaude?: boolean };
		expect(result.usedClaude).toBe(true);
	});

	it('sets usedClaude to false for non-claude provider', () => {
		const openaiResult = { ...baseResult, provider: 'openai' as const };
		const result = addLegacyFields(openaiResult) as GoodFaithResult & { usedClaude?: boolean };
		expect(result.usedClaude).toBe(false);
	});

	it('sets usedClaude to false if usedAI is false', () => {
		const heuristicResult = { ...baseResult, provider: 'claude' as const, usedAI: false };
		const result = addLegacyFields(heuristicResult) as GoodFaithResult & { usedClaude?: boolean };
		expect(result.usedClaude).toBe(false);
	});

	it('uses summary as rationale fallback', () => {
		const result = addLegacyFields(baseResult);
		expect(result.rationale).toBe('Test summary');
	});

	it('preserves existing rationale', () => {
		const withRationale = { ...baseResult, rationale: 'Custom rationale' };
		const result = addLegacyFields(withRationale);
		expect(result.rationale).toBe('Custom rationale');
	});
});
