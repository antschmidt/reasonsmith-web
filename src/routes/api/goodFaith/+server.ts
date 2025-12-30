import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { print } from 'graphql';
import { INCREMENT_ANALYSIS_USAGE, INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';
import { checkAndResetMonthlyCredits, getMonthlyCreditsRemaining } from '$lib/creditUtils';
import { logger } from '$lib/logger';
import OpenAI from 'openai';

// Import shared utilities
import type { GoodFaithInput, OpenAIRawResponse } from '$lib/goodFaith';
import {
	buildFullContent,
	buildBaseSystemPrompt,
	OPENAI_SPECIFIC_INSTRUCTIONS,
	normalizeOpenAIResponse,
	heuristicScore,
	PROVIDER_CONFIGS
} from '$lib/goodFaith';

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
					supportingArguments: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								argument: {
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
								improvements: {
									type: 'string',
									description: 'Suggestions for improving this argument'
								}
							},
							required: ['argument', 'score', 'fallacies', 'improvements'],
							additionalProperties: false
						}
					}
				},
				required: ['claim', 'supportingArguments'],
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
		goodFaithDescriptor: {
			type: 'string',
			description:
				'A concise 1-2 word descriptor capturing the overall quality/tone (e.g., "Constructive", "Hostile", "Off-Topic", "Manipulative", "Evidence-Based")'
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
		},
		tags: {
			type: 'array',
			items: {
				type: 'string'
			},
			description: 'Topic tags extracted from the content (3-5 tags, lowercase, hyphenated)'
		},
		steelmanScore: {
			type: 'number',
			minimum: 0,
			maximum: 10,
			description: 'Quality of steelmanning opponent views (0-10 scale)'
		},
		steelmanNotes: {
			type: 'string',
			description: 'Feedback on steelman quality and suggestions'
		},
		understandingScore: {
			type: 'number',
			minimum: 0,
			maximum: 10,
			description: 'Demonstration of understanding opposing positions (0-10 scale)'
		},
		intellectualHumilityScore: {
			type: 'number',
			minimum: 0,
			maximum: 10,
			description: 'Openness to being wrong, acknowledging valid opposing points (0-10 scale)'
		},
		relevanceScore: {
			type: 'number',
			minimum: 0,
			maximum: 10,
			description: 'How relevant the comment is to the discussion topic (0-10 scale)'
		},
		relevanceNotes: {
			type: 'string',
			description: 'Explanation of relevance or derailment tactics detected'
		}
	},
	required: [
		'claims',
		'fallacyOverload',
		'goodFaithScore',
		'goodFaithDescriptor',
		'cultishPhrases',
		'summary',
		'steelmanScore',
		'steelmanNotes',
		'understandingScore',
		'intellectualHumilityScore',
		'relevanceScore',
		'relevanceNotes'
	],
	additionalProperties: false
};

/**
 * Analyze content using OpenAI API
 */
async function analyzeWithOpenAI(
	fullContent: string
): Promise<ReturnType<typeof normalizeOpenAIResponse>> {
	try {
		const config = PROVIDER_CONFIGS.openai;
		const systemPrompt = buildBaseSystemPrompt() + OPENAI_SPECIFIC_INSTRUCTIONS;

		// Use structured outputs with chat completion API
		const response = await openai.chat.completions.create({
			model: config.model,
			messages: [
				{
					role: 'system',
					content: systemPrompt
				},
				{
					role: 'user',
					content: fullContent
				}
			],
			temperature: config.temperature,
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
		const rawResult: OpenAIRawResponse = JSON.parse(responseText);

		// Normalize response using shared utility
		return normalizeOpenAIResponse(rawResult);
	} catch (error: unknown) {
		logger.error('OpenAI API error:', error);
		// Fallback to heuristic scoring if OpenAI fails
		return heuristicScore(fullContent);
	}
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await request.json();

		// Map incoming request to GoodFaithInput type
		const input: GoodFaithInput = {
			content: body.content || '',
			postId: body.postId,
			importData: body.importData,
			discussionContext: body.discussionContext,
			showcaseContext: body.showcaseContext
		};

		if (!input.content.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		// Build full content with context using shared utility
		const fullContent = buildFullContent(input);

		// Get user from session to track usage
		const accessToken = cookies.get('nhost.accessToken');
		let contributorId: string | null = null;
		let contributor: {
			id: string;
			role: string;
			analysis_enabled: boolean;
			analysis_limit: number | null;
			analysis_count_used: number;
		} | null = null;

		if (accessToken) {
			const HASURA_GRAPHQL_ENDPOINT =
				process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
			const HASURA_GRAPHQL_ADMIN_SECRET =
				process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

			if (!HASURA_GRAPHQL_ADMIN_SECRET) {
				logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
				return json({ error: 'Server configuration error' }, { status: 500 });
			}

			if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
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
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
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
						contributorId = contributor?.id || null;

						// Check and reset monthly credits if needed
						if (contributor) {
							await checkAndResetMonthlyCredits(
								contributor,
								HASURA_GRAPHQL_ENDPOINT,
								undefined,
								HASURA_GRAPHQL_ADMIN_SECRET
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
			// Use OpenAI scoring
			const scored = await analyzeWithOpenAI(fullContent);

			// Increment appropriate credit type after successful analysis (only if AI was used)
			if (contributorId && contributor && scored.usedAI) {
				try {
					const HASURA_GRAPHQL_ENDPOINT =
						process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
					const HASURA_GRAPHQL_ADMIN_SECRET =
						process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

					if (!HASURA_GRAPHQL_ADMIN_SECRET) {
						logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
						// Don't fail the analysis, just log the error
						logger.warn('Skipping usage tracking due to missing admin secret');
					} else if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
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
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
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

			return json({ ...scored, postId: input.postId || null });
		} catch (error) {
			logger.error('Good faith analysis failed:', error);
			const message = error instanceof Error ? error.message : 'Analysis request failed';
			return json({ error: message }, { status: 502 });
		}
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Internal error';
		return json({ error: message }, { status: 500 });
	}
};
