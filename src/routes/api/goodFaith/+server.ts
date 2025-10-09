import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { print } from 'graphql';
import { INCREMENT_ANALYSIS_USAGE, INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';
import { checkAndResetMonthlyCredits, getMonthlyCreditsRemaining } from '$lib/creditUtils';
import { logger } from '$lib/logger';

// Import the same function from the Vercel function
// We'll copy the logic here for local development
import OpenAI from 'openai';

interface Claim {
	claim: string;
	arguments: Array<{
		text: string;
		score: number; // 1-10
		fallacies: string[];
		manipulativeLanguage: string[];
		suggestions: string[];
	}>;
}

interface ScoreResponse {
	claims: Claim[];
	fallacyOverload: boolean;
	goodFaithScore: number; // 0-100
	cultishPhrases: string[];
	summary: string;

	// Legacy fields for backward compatibility
	good_faith_score?: number;
	good_faith_label?: string;
	rationale?: string;
}

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build'
});

// Define the JSON schema for structured output
const goodFaithSchema = {
	type: 'object',
	properties: {
		claims: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					claim: {
						type: 'string',
						description: 'The main claim or assertion being made'
					},
					arguments: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								text: {
									type: 'string',
									description: 'The supporting argument text or quote'
								},
								score: {
									type: 'number',
									minimum: 1,
									maximum: 10,
									description: 'Quality score of the argument (1-10)'
								},
								fallacies: {
									type: 'array',
									items: {
										type: 'string'
									},
									description: 'List of logical fallacies found in this argument'
								},
								manipulativeLanguage: {
									type: 'array',
									items: {
										type: 'string'
									},
									description: 'Specific manipulative phrases or language patterns found'
								},
								suggestions: {
									type: 'array',
									items: {
										type: 'string'
									},
									description: 'Suggestions for improving this argument'
								}
							},
							required: ['text', 'score', 'fallacies', 'manipulativeLanguage', 'suggestions'],
							additionalProperties: false
						}
					}
				},
				required: ['claim', 'arguments'],
				additionalProperties: false
			}
		},
		fallacyOverload: {
			type: 'boolean',
			description: 'True if most arguments are fallacy-laden'
		},
		goodFaithScore: {
			type: 'number',
			minimum: 0,
			maximum: 100,
			description:
				'Overall good faith score (0-100) based on percentage of claims made in good faith'
		},
		cultishPhrases: {
			type: 'array',
			items: {
				type: 'string'
			},
			description: 'List of cultish or manipulative phrases found throughout the text'
		},
		summary: {
			type: 'string',
			description:
				'Comprehensive textual summary of the analysis including patterns found and recommendations'
		}
	},
	required: ['claims', 'fallacyOverload', 'goodFaithScore', 'cultishPhrases', 'summary'],
	additionalProperties: false
};

async function scoreWithOpenAI(content: string): Promise<ScoreResponse> {
	try {
		// Check if using custom prompt or fallback to chat completion
		if (process.env.OPENAI_PROMPT_ID) {
			// Note: OpenAI doesn't have a responses.create API
			// This should use chat.completions.create instead
			const response = await openai.chat.completions.create({
				model: 'gpt-4',
				messages: [
					{
						role: 'system',
						content: 'You are a good faith analyzer. Analyze the following content and return a structured response.'
					},
					{
						role: 'user',
						content: content
					}
				]
			});

			// Parse the response
			const result = response.choices[0]?.message?.content || '';
			return parseOpenAIResponse(result);
		} else {
			// Use structured outputs with chat completion API
			const response = await openai.chat.completions.create({
				model: 'gpt-5',
				messages: [
					{
						role: 'system',
						content: `You are an expert in logic, rhetoric, and argumentation. Analyze the given text with rigorous academic precision.

**CRITICAL REQUIREMENTS:**
1. **Extract specific claims** - Each distinct assertion or position stated in the text
2. **Identify supporting arguments** - Direct quotes or reasoning used to support each claim
3. **List specific fallacies by name** - Use precise logical fallacy terminology
4. **Extract manipulative language** - Quote specific phrases that use emotional manipulation
5. **Provide detailed suggestions** - Concrete, actionable improvements for each argument

**Analysis Format:**

For each claim, find its supporting arguments and analyze them with this structure:
- **text**: The exact quote or paraphrase of the supporting argument
- **score**: 1-10 quality rating (1=fallacious/manipulative, 10=excellent logic/evidence)
- **fallacies**: Array of specific fallacy names (e.g., "Ad Hominem", "Straw Man", "False Dichotomy", "Appeal to Fear", "Hasty Generalization", "Cherry-Picking", "Appeal to Authority", "Red Herring")
- **manipulativeLanguage**: Array of specific quoted phrases that use emotional manipulation, loaded language, or tribal signaling
- **suggestions**: Array of specific, actionable improvements

**Manipulative Language Patterns to Identify:**
- **Emotional appeals**: Fear-mongering phrases, rage-inducing terms
- **Tribal signaling**: "Real Americans", "liberal media", "they want to destroy us"
- **Loaded language**: Words chosen for emotional impact rather than accuracy
- **Absolute statements**: "always", "never", "all", "completely", "totally"
- **Dehumanizing terms**: Language that reduces people to objects or stereotypes
- **Thought-terminating clichés**: "Common sense", "everyone knows", "obvious to anyone"

**Example Analysis:**

Text: "The liberal media is destroying our country with their constant lies and fake news. Everyone knows they hate America."

{
  "claims": [
    {
      "claim": "The liberal media is destroying our country",
      "arguments": [
        {
          "text": "with their constant lies and fake news",
          "score": 2,
          "fallacies": ["Hasty Generalization", "Ad Hominem", "Loaded Language"],
          "manipulativeLanguage": ["liberal media", "destroying our country", "constant lies", "fake news"],
          "suggestions": ["Cite specific examples with sources", "Avoid broad generalizations about entire media organizations", "Use neutral language to describe news outlets"]
        },
        {
          "text": "Everyone knows they hate America",
          "score": 1,
          "fallacies": ["Appeal to Common Belief", "Mind Reading", "Poisoning the Well"],
          "manipulativeLanguage": ["Everyone knows", "they hate America"],
          "suggestions": ["Provide evidence for claims about motivations", "Avoid absolute statements like 'everyone knows'", "Focus on specific policies rather than attributing emotions"]
        }
      ]
    }
  ]
}

**Critical: Always provide this level of detail for EVERY argument in the text. Extract specific quotes and name precise fallacies.**`
					},
					{
						role: 'user',
						content: content
					}
				],
				temperature: 1,
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'good_faith_analysis',
						schema: goodFaithSchema,
						strict: true
					}
				}
			});

			const responseText = response.choices[0]?.message?.content;
			if (!responseText) {
				throw new Error('No response from OpenAI');
			}

			// With structured outputs, we can safely parse the JSON
			const result = JSON.parse(responseText);

			// Add backward compatibility fields
			result.good_faith_score = result.goodFaithScore / 100; // Convert 0-100 to 0-1
			result.good_faith_label = getLabel(result.good_faith_score); // Use 0-1 scale
			result.rationale = result.summary;

			return result;
		}
	} catch (error: any) {
		logger.error('OpenAI API error:', error);
		// Fallback to heuristic scoring if OpenAI fails
		return heuristicScore(content);
	}
}

function parseOpenAIResponse(content: string): ScoreResponse {
	// This function needs to be implemented based on your custom prompt's output format
	// For now, try to parse as JSON or fallback to heuristic
	try {
		return JSON.parse(content);
	} catch {
		return heuristicScore(content);
	}
}

function getLabel(score: number): string {
	if (score >= 0.8) return 'exemplary';
	if (score >= 0.6) return 'constructive';
	if (score >= 0.4) return 'neutral';
	if (score >= 0.2) return 'questionable';
	return 'hostile';
}

function heuristicScore(content: string): ScoreResponse {
	const lower = content.toLowerCase();
	let score = 50; // 0-100 scale

	// Basic heuristic analysis
	if (/(thank|appreciate)/.test(lower)) score += 10;
	if (/(evidence|source|reference)/.test(lower)) score += 15;
	if (/(idiot|stupid|hate|moron|trash)/.test(lower)) score -= 30;
	if (/(I understand|I see your point|you might be right)/.test(lower)) score += 10;
	if (/(always|never|all|none|everyone|no one)/.test(lower)) score -= 5; // Absolute statements

	score = Math.max(0, Math.min(100, score));

	// Create basic structured response
	const claims: Claim[] = [
		{
			claim: content.length > 100 ? content.substring(0, 100) + '...' : content,
			arguments: [
				{
					text: 'Heuristic analysis of overall content',
					score: Math.round(score / 10), // Convert to 1-10 scale
					fallacies: score < 40 ? ['Potential logical issues detected'] : [],
					manipulativeLanguage: [],
					suggestions:
						score < 60
							? ['Consider providing more evidence', 'Use more respectful language']
							: ['Content appears reasonable']
				}
			]
		}
	];

	return {
		claims,
		fallacyOverload: score < 30,
		goodFaithScore: score,
		cultishPhrases: [],
		summary: 'Heuristic fallback analysis. OpenAI analysis unavailable.',
		good_faith_score: score / 100,
		good_faith_label: getLabel(score / 100),
		rationale: 'Heuristic fallback score.'
	};
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await request.json();
		const { postId, content } = body as {
			postId?: string;
			content?: string;
		};

		if (typeof content !== 'string' || !content.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		// Get user from session to track usage
		const accessToken = cookies.get('nhost.accessToken');
		let contributorId: string | null = null;
		let contributor: any = null;

		if (accessToken) {
			const HASURA_GRAPHQL_ENDPOINT =
				process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
			const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

			if (!HASURA_ADMIN_SECRET) {
				logger.error('HASURA_ADMIN_SECRET environment variable is not set');
				return json({ error: 'Server configuration error' }, { status: 500 });
			}

			if (HASURA_GRAPHQL_ENDPOINT && HASURA_ADMIN_SECRET) {
				try {
					// Get user info from access token
					const userResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${accessToken}`
						},
						body: JSON.stringify({
							query: `
								query GetCurrentUser {
									auth {
										user {
											id
										}
									}
								}
							`
						})
					});

					const userResult = await userResponse.json();
					const userId = userResult.data?.auth?.user?.id;

					if (userId) {
						// Get contributor info using admin access
						const contributorResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
								'x-hasura-role': 'admin'
							},
							body: JSON.stringify({
								query: `
									query GetContributor($userId: uuid!) {
										contributor_by_pk(id: $userId) {
											id
											role
											analysis_enabled
											analysis_limit
											analysis_count_used
										}
									}
								`,
								variables: { userId }
							})
						});

						const contributorResult = await contributorResponse.json();
						contributor = contributorResult.data?.contributor_by_pk;
						contributorId = contributor?.id;

						// Check and reset monthly credits if needed
						if (contributor) {
							await checkAndResetMonthlyCredits(
								contributor,
								HASURA_GRAPHQL_ENDPOINT,
								undefined,
								HASURA_ADMIN_SECRET
							);
						}

						// Check permissions only if we found a contributor
						if (contributor) {
							// Check if analysis is enabled
							if (!contributor.analysis_enabled) {
								return json(
									{ error: 'Analysis access is disabled for this account' },
									{ status: 403 }
								);
							}

							// Check if user has reached their limit (unless they're admin/slartibartfast role)
							if (
								!['admin', 'slartibartfast'].includes(contributor.role) &&
								contributor.analysis_limit !== null
							) {
								if (contributor.analysis_count_used >= contributor.analysis_limit) {
									return json(
										{
											error: 'Analysis limit reached',
											limit: contributor.analysis_limit,
											used: contributor.analysis_count_used
										},
										{ status: 429 }
									);
								}
							}
						}
					}
				} catch (dbError) {
					logger.error('Database check failed:', dbError);
					// Continue with analysis but log the error
				}
			}
		}

		try {
			// Use OpenAI scoring instead of heuristic
			const scored = await scoreWithOpenAI(content);

			// Increment appropriate credit type after successful analysis
			if (contributorId && contributor) {
				try {
					const HASURA_GRAPHQL_ENDPOINT =
						process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
					const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

					if (!HASURA_ADMIN_SECRET) {
						logger.error('HASURA_ADMIN_SECRET environment variable is not set');
						// Don't fail the analysis, just log the error
						logger.warn('Skipping usage tracking due to missing admin secret');
					} else if (HASURA_GRAPHQL_ENDPOINT && HASURA_ADMIN_SECRET) {
						// Determine which credit type to use
						const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
						const shouldUseMonthlyCredit =
							monthlyRemaining > 0 || ['admin', 'slartibartfast'].includes(contributor.role);

						const mutation = shouldUseMonthlyCredit
							? INCREMENT_ANALYSIS_USAGE
							: INCREMENT_PURCHASED_CREDITS_USED;

						await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
								'x-hasura-role': 'admin'
							},
							body: JSON.stringify({
								query: print(mutation),
								variables: { contributorId }
							})
						});
					}
				} catch (usageError) {
					logger.error('Failed to increment usage count:', usageError);
					// Don't fail the request if usage tracking fails
				}
			}

			return json({ ...scored, postId: postId || null });
		} catch (error) {
			logger.error('Good faith analysis failed:', error);
			const message = error instanceof Error ? error.message : 'Analysis request failed';
			return json({ error: message }, { status: 502 });
		}
	} catch (e: any) {
		return json({ error: e?.message || 'Internal error' }, { status: 500 });
	}
};
