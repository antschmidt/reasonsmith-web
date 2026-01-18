/**
 * Tests for heuristic fallback scoring
 */

import { describe, it, expect } from 'vitest';
import { heuristicScore } from './heuristics';

describe('heuristicScore', () => {
	describe('baseline scoring', () => {
		it('returns a neutral score for neutral content', () => {
			const result = heuristicScore('This is a simple statement about a topic.');
			// Base 50 - 5 (short length < 50) = 45, normalized to 0.45
			expect(result.good_faith_score).toBeGreaterThanOrEqual(0.4);
			expect(result.good_faith_score).toBeLessThanOrEqual(0.6);
		});

		it('returns correct structure', () => {
			const result = heuristicScore('This is test content.');
			expect(result).toHaveProperty('good_faith_score');
			expect(result).toHaveProperty('good_faith_label');
			expect(result).toHaveProperty('claims');
			expect(result).toHaveProperty('fallacyOverload');
			expect(result).toHaveProperty('cultishPhrases');
			expect(result).toHaveProperty('summary');
			expect(result).toHaveProperty('provider', 'heuristic');
			expect(result).toHaveProperty('usedAI', false);
		});

		it('includes legacy fields for compatibility', () => {
			const result = heuristicScore('Test content here.');
			expect(result).toHaveProperty('goodFaithScore');
			expect(result).toHaveProperty('goodFaithDescriptor');
			expect(result).toHaveProperty('overallAnalysis');
		});
	});

	describe('positive pattern detection', () => {
		it('increases score for evidence-based language', () => {
			const withEvidence = heuristicScore(
				'According to the research and evidence from multiple studies, this appears to be accurate. The source material provides citations.'
			);
			const neutral = heuristicScore(
				'This is just a simple statement without any particular indicators one way or another here.'
			);
			expect(withEvidence.good_faith_score).toBeGreaterThan(neutral.good_faith_score);
		});

		it('increases score for acknowledgment language', () => {
			const result = heuristicScore(
				'I understand your perspective and I see your point. That is a valid point and a fair point to make.'
			);
			expect(result.good_faith_score).toBeGreaterThan(0.5);
		});

		it('increases score for hedging language', () => {
			const result = heuristicScore(
				'In my opinion, this might be the case. I think we should consider alternatives, although there are other views. However, I believe this approach works.'
			);
			expect(result.good_faith_score).toBeGreaterThan(0.5);
		});

		it('increases score for appreciative language', () => {
			const result = heuristicScore(
				'Thank you for sharing this. I appreciate the thoughtful response and agree with several points.'
			);
			expect(result.good_faith_score).toBeGreaterThan(0.5);
		});
	});

	describe('negative pattern detection', () => {
		it('decreases score for insults', () => {
			const withInsults = heuristicScore('You are an idiot and stupid for believing this.');
			const neutral = heuristicScore('I disagree with this perspective for several reasons.');
			expect(withInsults.good_faith_score).toBeLessThan(neutral.good_faith_score);
		});

		it('decreases score for absolute statements', () => {
			const result = heuristicScore(
				'Everyone always does this and no one ever thinks otherwise. All people believe the same thing.'
			);
			expect(result.good_faith_score).toBeLessThan(0.5);
		});

		it('decreases score for thought-terminating clichés', () => {
			const result = heuristicScore(
				'Obviously this is correct. It is clearly the only option and everyone knows it.'
			);
			expect(result.good_faith_score).toBeLessThan(0.5);
		});

		it('decreases score for tribal signaling', () => {
			const result = heuristicScore('You people always do this. Those people never understand.');
			expect(result.good_faith_score).toBeLessThan(0.5);
		});

		it('decreases score for dismissive language', () => {
			const result = heuristicScore(
				'Wake up sheeple! You have been brainwashed by fake news and propaganda.'
			);
			expect(result.good_faith_score).toBeLessThan(0.3);
		});
	});

	describe('manipulative phrase detection', () => {
		it('detects cultish phrases', () => {
			const result = heuristicScore("Wake up sheeple! They don't want you to know the truth.");
			expect(result.cultishPhrases).toContain('wake up');
			expect(result.cultishPhrases).toContain('sheeple');
			expect(result.cultishPhrases).toContain("they don't want you to know");
		});

		it('detects "everyone knows" as manipulative', () => {
			const result = heuristicScore("Everyone knows this is true, it's obvious.");
			expect(result.cultishPhrases).toContain('everyone knows');
			expect(result.cultishPhrases).toContain("it's obvious");
		});

		it('detects "real Americans" as manipulative', () => {
			const result = heuristicScore('Real Americans understand what this country needs.');
			expect(result.cultishPhrases).toContain('real American(s)');
		});

		it('detects "fake news" as manipulative', () => {
			const result = heuristicScore('This is just fake news from the elite.');
			expect(result.cultishPhrases).toContain('fake news');
			expect(result.cultishPhrases).toContain('the elite');
		});

		it('returns empty array when no manipulative phrases', () => {
			const result = heuristicScore(
				'I think this policy has merit based on the available evidence and research.'
			);
			expect(result.cultishPhrases).toHaveLength(0);
		});
	});

	describe('fallacy detection', () => {
		it('detects ad hominem attacks', () => {
			const result = heuristicScore("You're an idiot who doesn't understand.");
			expect(result.claims[0].supportingArguments[0].fallacies).toContain('Ad Hominem');
		});

		it('detects whataboutism', () => {
			const result = heuristicScore('What about the other side? They do the same thing.');
			expect(result.claims[0].supportingArguments[0].fallacies).toContain('Whataboutism');
		});

		it('detects appeal to popularity', () => {
			const result = heuristicScore('Everyone agrees that this is the best approach.');
			expect(result.claims[0].supportingArguments[0].fallacies).toContain('Appeal to Popularity');
		});

		it('detects appeal to authority', () => {
			const result = heuristicScore('Experts say this is correct, so it must be true.');
			expect(result.claims[0].supportingArguments[0].fallacies).toContain('Appeal to Authority');
		});

		it('sets fallacyOverload when 3+ fallacies detected', () => {
			const result = heuristicScore(
				"You're an idiot. What about them? Everyone knows this. Scientists say so."
			);
			expect(result.fallacyOverload).toBe(true);
		});

		it('does not set fallacyOverload for fewer than 3 fallacies', () => {
			const result = heuristicScore('What about the other issue?');
			expect(result.fallacyOverload).toBe(false);
		});
	});

	describe('length-based adjustments', () => {
		it('penalizes very short content', () => {
			const short = heuristicScore('No.');
			const medium = heuristicScore(
				'I disagree with this perspective because it lacks supporting evidence.'
			);
			expect(short.good_faith_score).toBeLessThan(medium.good_faith_score);
		});

		it('rewards longer detailed content', () => {
			const longContent =
				'This is a detailed response that explores the nuances of the topic at hand. ' +
				'I think we need to consider multiple perspectives when evaluating this issue. ' +
				'The evidence suggests that there are valid points on both sides of the debate. ' +
				'In my opinion, we should approach this with intellectual humility and openness. ' +
				'I appreciate the opportunity to engage in this discussion and share my thoughts. ' +
				'However, I acknowledge that my understanding may be incomplete and I remain open to other views. ' +
				'The research in this area provides some useful insights that we can apply here.';
			const result = heuristicScore(longContent);
			expect(result.good_faith_score).toBeGreaterThan(0.6);
		});
	});

	describe('formatting-based adjustments', () => {
		it('penalizes excessive exclamation marks', () => {
			const shouty = heuristicScore('This is wrong!!!! I cannot believe it!!!! Outrageous!!!!');
			const calm = heuristicScore('This is wrong. I cannot believe it. This is outrageous.');
			expect(shouty.good_faith_score).toBeLessThan(calm.good_faith_score);
		});

		it('penalizes excessive caps (shouting)', () => {
			const allCaps = heuristicScore('THIS IS COMPLETELY WRONG AND EVERYONE SHOULD KNOW IT');
			const normal = heuristicScore('This is completely wrong and everyone should know it');
			expect(allCaps.good_faith_score).toBeLessThan(normal.good_faith_score);
		});

		it('does not penalize short caps content', () => {
			// Short content shouldn't trigger caps penalty
			const result = heuristicScore('OK');
			expect(result.good_faith_score).toBeGreaterThanOrEqual(0.4);
		});
	});

	describe('score boundaries', () => {
		it('clamps score to minimum 0', () => {
			// Extremely negative content
			const result = heuristicScore(
				"You're an idiot! Stupid moron! Everyone knows you're wrong! Wake up sheeple! " +
					"Fake news from the elite! What about them? It's obvious! They don't want you to know!"
			);
			expect(result.good_faith_score).toBeGreaterThanOrEqual(0);
		});

		it('clamps score to maximum 1', () => {
			// Extremely positive content with many signals
			const result = heuristicScore(
				'Thank you for this excellent point. I appreciate and agree with your perspective. ' +
					'The evidence and research supports this view. I understand your point and I see your reasoning. ' +
					'You make a valid point and a fair point. In my opinion, this is well-reasoned. ' +
					'However, there are nuances to consider. On the other hand, I believe we should examine this further. ' +
					'I think this is a good approach. That said, we should remain open to other evidence.'
			);
			expect(result.good_faith_score).toBeLessThanOrEqual(1);
		});
	});

	describe('claims structure', () => {
		it('creates a single claim with supporting argument', () => {
			const result = heuristicScore('This is a test of the heuristic analysis system.');
			expect(result.claims).toHaveLength(1);
			expect(result.claims[0].supportingArguments).toHaveLength(1);
		});

		it('truncates long content in claim text', () => {
			const longContent = 'A'.repeat(200);
			const result = heuristicScore(longContent);
			expect(result.claims[0].claim.length).toBeLessThanOrEqual(103); // 100 + '...'
			expect(result.claims[0].claim).toContain('...');
		});

		it('does not truncate short content', () => {
			const result = heuristicScore('Short content here.');
			expect(result.claims[0].claim).toBe('Short content here.');
			expect(result.claims[0].claim).not.toContain('...');
		});

		it('provides appropriate improvement suggestions based on score', () => {
			const lowScore = heuristicScore('You idiot! This is stupid trash and everyone knows it.');
			const midScore = heuristicScore('I think this might be wrong but I am not entirely sure.');
			const highScore = heuristicScore(
				'Thank you for sharing. The evidence supports this, and I appreciate your valid point. ' +
					'In my opinion, this is reasonable, although we should consider other perspectives.'
			);

			expect(lowScore.claims[0].supportingArguments[0].improvements).toContain('personal attacks');
			expect(midScore.claims[0].supportingArguments[0].improvements).toContain(
				'examples or sources'
			);
			expect(highScore.claims[0].supportingArguments[0].improvements).toContain(
				'Continue engaging'
			);
		});
	});

	describe('summary generation', () => {
		it('indicates constructive engagement for high scores', () => {
			const result = heuristicScore(
				'Thank you for this perspective. I appreciate the research and evidence you provided. ' +
					'I agree this is a valid point, although we should consider other views.'
			);
			expect(result.summary).toContain('constructively');
		});

		it('indicates mixed quality for medium scores', () => {
			const result = heuristicScore(
				'This is an okay point but I am not entirely convinced by the argument presented here.'
			);
			expect(result.summary).toContain('mixed');
		});

		it('indicates concerning patterns for low scores', () => {
			// Score between 30-50 to get "concerning" message
			const result = heuristicScore('This seems stupid to me. Obviously wrong in my opinion.');
			expect(result.summary).toContain('concerning');
		});

		it('indicates significant issues for very low scores', () => {
			const result = heuristicScore(
				"You're an idiot! Fake news! Wake up sheeple! Everyone knows this is propaganda!"
			);
			expect(result.summary).toContain('significant issues');
		});

		it('includes detected fallacies in summary', () => {
			const result = heuristicScore('What about the other side? They do the same things.');
			expect(result.summary).toContain('Whataboutism');
		});

		it('includes manipulative language in summary', () => {
			const result = heuristicScore('Wake up! The elite control everything.');
			expect(result.summary).toContain('wake up');
		});

		it('includes heuristic disclaimer', () => {
			const result = heuristicScore('Any content here.');
			expect(result.summary).toContain('heuristic analysis');
		});
	});

	describe('tag extraction', () => {
		it('extracts politics tag', () => {
			const result = heuristicScore('The political situation in Congress affects the Senate.');
			expect(result.tags).toContain('politics');
		});

		it('extracts economics tag', () => {
			const result = heuristicScore('The economy is affected by inflation and market trends.');
			expect(result.tags).toContain('economics');
		});

		it('extracts climate tag', () => {
			const result = heuristicScore('Climate change and carbon emissions affect the environment.');
			expect(result.tags).toContain('climate');
		});

		it('extracts health tag', () => {
			const result = heuristicScore('The medical community and doctors recommend this vaccine.');
			expect(result.tags).toContain('health');
		});

		it('extracts technology tag', () => {
			const result = heuristicScore(
				'AI and software technology are changing how we use computers.'
			);
			expect(result.tags).toContain('technology');
		});

		it('extracts education tag', () => {
			const result = heuristicScore(
				'Students at the university and schools need better education.'
			);
			expect(result.tags).toContain('education');
		});

		it('extracts foreign-policy tag', () => {
			const result = heuristicScore('International diplomacy and foreign treaties are important.');
			expect(result.tags).toContain('foreign-policy');
		});

		it('extracts military tag', () => {
			const result = heuristicScore('The military and defense budget affects the army and navy.');
			expect(result.tags).toContain('military');
		});

		it('extracts immigration tag', () => {
			const result = heuristicScore(
				'Immigration policy affects the border and refugee asylum seekers.'
			);
			expect(result.tags).toContain('immigration');
		});

		it('extracts criminal-justice tag', () => {
			const result = heuristicScore('Crime rates and police law enforcement affect prisons.');
			expect(result.tags).toContain('criminal-justice');
		});

		it('extracts multiple tags', () => {
			const result = heuristicScore(
				'Congress passed a bill about the economy and inflation affecting market trends.'
			);
			expect(result.tags.length).toBeGreaterThan(1);
			expect(result.tags).toContain('politics');
			expect(result.tags).toContain('economics');
		});

		it('limits tags to 5 maximum', () => {
			const result = heuristicScore(
				'Politics and economics affect climate, health, technology, education, foreign policy, military, immigration, and criminal justice.'
			);
			expect(result.tags.length).toBeLessThanOrEqual(5);
		});

		it('returns empty array for content without topic keywords', () => {
			const result = heuristicScore('This is a simple statement about nothing in particular.');
			expect(result.tags).toHaveLength(0);
		});
	});

	describe('label assignment', () => {
		it('assigns hostile label for very low scores', () => {
			const result = heuristicScore(
				"You idiot! Stupid moron! Everyone knows you're wrong! Fake news! What about them?"
			);
			expect(result.good_faith_label).toBe('hostile');
		});

		it('assigns constructive label for high scores', () => {
			const result = heuristicScore(
				'Thank you for this thoughtful analysis. I appreciate the research and evidence you cited. ' +
					'I agree with your valid points. In my opinion, this is well-reasoned. ' +
					'However, we should consider other perspectives as well.'
			);
			expect(['constructive', 'exemplary']).toContain(result.good_faith_label);
		});
	});
});
