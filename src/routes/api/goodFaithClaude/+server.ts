import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { print } from 'graphql';
import { INCREMENT_ANALYSIS_USAGE, INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';
import { getMonthlyCreditsRemaining } from '$lib/creditUtils';
import { logger } from '$lib/logger';

// Import shared utilities
import type { GoodFaithInput, ClaudeRawResponse } from '$lib/goodFaith';
import {
	buildFullContent,
	buildBaseSystemPrompt,
	CLAUDE_SPECIFIC_INSTRUCTIONS,
	OUTPUT_SCHEMA_DESCRIPTION,
	normalizeClaudeResponse,
	parseClaudeJsonResponse,
	heuristicScore,
	PROVIDER_CONFIGS
} from '$lib/goodFaith';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Analyze content using Claude API
 */
async function analyzeWithClaude(
	fullContent: string
): Promise<ReturnType<typeof normalizeClaudeResponse>> {
	try {
		logger.info('Starting Claude API call...');

		if (!process.env.ANTHROPIC_API_KEY) {
			throw new Error('AI analysis is temporarily unavailable');
		}

		const config = PROVIDER_CONFIGS.claude;
		const systemPrompt =
			buildBaseSystemPrompt() + CLAUDE_SPECIFIC_INSTRUCTIONS + '\n\n' + OUTPUT_SCHEMA_DESCRIPTION;

		const msg = await anthropic.messages.create({
			model: config.model,
			max_tokens: config.maxTokens,
			temperature: config.temperature,
			system: systemPrompt,
			messages: [
				{
					role: 'user',
					content: fullContent
				}
			]
		});

		logger.info('Claude API response received');

		const responseText = msg.content[0]?.type === 'text' ? msg.content[0].text : '';

		if (!responseText) {
			throw new Error('No response from Claude');
		}

		logger.info('Claude cleaned response length:', responseText.length);
		logger.info('Claude response preview:', responseText.substring(0, 200));

		// Parse the JSON response using shared utility
		const rawResult: ClaudeRawResponse = parseClaudeJsonResponse(responseText);
		logger.info('Claude parsed result successfully');

		// Normalize response using shared utility
		const result = normalizeClaudeResponse(rawResult);

		return result;
	} catch (error: unknown) {
		logger.error('Claude API error:', error);
		if (error instanceof Error) {
			logger.error('Error details:', error.message, error.stack);
		}
		// Fallback to heuristic scoring if Claude fails
		return heuristicScore(fullContent);
	}
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	logger.info('=== Claude API endpoint called ===');
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
		let accessToken = cookies.get('nhost.accessToken');
		logger.debug('[DEBUG] Cookie access token:', !!accessToken);

		// Also check Authorization header if cookie not found
		if (!accessToken) {
			const authHeader = request.headers.get('authorization');
			logger.debug('[DEBUG] Authorization header:', authHeader?.substring(0, 30) + '...');
			if (authHeader && authHeader.startsWith('Bearer ')) {
				accessToken = authHeader.substring(7);
			}
		}
		logger.info('Access token found:', !!accessToken);
		let contributorId: string | null = null;
		let contributor: {
			id: string;
			role: string;
			analysis_enabled: boolean;
			analysis_limit: number | null;
			analysis_count_used: number;
		} | null = null;

		if (accessToken) {
			let HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
			const HASURA_GRAPHQL_ADMIN_SECRET =
				process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

			if (!HASURA_GRAPHQL_ADMIN_SECRET) {
				logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
				return json({ error: 'Server configuration error' }, { status: 500 });
			}

			// Try alternative endpoint URL if the first one doesn't work
			const alternativeEndpoint = HASURA_GRAPHQL_ENDPOINT?.replace('.graphql.', '.hasura.') || '';
			logger.debug('[DEBUG] Primary endpoint:', HASURA_GRAPHQL_ENDPOINT);
			logger.debug('[DEBUG] Alternative endpoint:', alternativeEndpoint);
			logger.debug('[DEBUG] Admin secret present:', !!HASURA_GRAPHQL_ADMIN_SECRET);

			if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
				logger.debug('[DEBUG] Starting contributor lookup...');
				try {
					// Decode JWT token to get user ID
					const tokenPayload = JSON.parse(atob(accessToken.split('.')[1]));
					const userId =
						tokenPayload.sub || tokenPayload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];
					logger.debug('[DEBUG] JWT payload:', tokenPayload);
					logger.debug('[DEBUG] JWT payload user ID:', userId);

					// Test admin access first with primary endpoint
					let testResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET || ''
						},
						body: JSON.stringify({
							query: `query { contributor(limit: 1) { id } }`
						})
					});
					let testResult = await testResponse.json();
					logger.debug('[DEBUG] Primary endpoint test:', testResult);

					// If primary fails, try alternative endpoint
					if (testResult.error) {
						logger.debug('[DEBUG] Trying alternative endpoint...');
						HASURA_GRAPHQL_ENDPOINT = alternativeEndpoint;
						testResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET || ''
							},
							body: JSON.stringify({
								query: `query { contributor(limit: 1) { id } }`
							})
						});
						testResult = await testResponse.json();
						logger.debug('[DEBUG] Alternative endpoint test:', testResult);
					}

					if (userId) {
						// Get contributor info using admin access
						const contributorResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET || ''
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
						logger.debug('[DEBUG] Contributor lookup result:', contributorResult);
						contributor = contributorResult.data?.contributor_by_pk;
						contributorId = contributor?.id || null;
						logger.debug('[DEBUG] Found contributor:', !!contributor, contributorId);

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
			logger.info('Claude API key present:', !!process.env.ANTHROPIC_API_KEY);
			logger.info('Processing request for content length:', input.content.length);

			// Use Claude analysis
			const scored = await analyzeWithClaude(fullContent);

			// Increment appropriate credit type only if Claude was actually used (not heuristic fallback)
			logger.info('Checking credit consumption:', {
				contributorId: !!contributorId,
				contributor: !!contributor,
				usedAI: scored.usedAI
			});
			if (contributorId && contributor && scored.usedAI) {
				try {
					// Use the working endpoint URL that was discovered during contributor lookup
					let CREDIT_ENDPOINT =
						process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL || '';
					const alternativeEndpoint = CREDIT_ENDPOINT.replace('.graphql.', '.hasura.');

					const HASURA_GRAPHQL_ADMIN_SECRET_CREDIT =
						process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

					// Test which endpoint works for credit operations
					const testResponse = await fetch(CREDIT_ENDPOINT, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET_CREDIT || ''
						},
						body: JSON.stringify({ query: `query { contributor(limit: 1) { id } }` })
					});
					const testResult = await testResponse.json();

					if (testResult.error) {
						logger.debug('[DEBUG] Using alternative endpoint for credits');
						CREDIT_ENDPOINT = alternativeEndpoint;
					}

					logger.debug('[DEBUG] Credit endpoint:', CREDIT_ENDPOINT);

					if (!HASURA_GRAPHQL_ADMIN_SECRET_CREDIT) {
						logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
						// Don't fail the analysis, just log the error
						logger.warn('Skipping usage tracking due to missing admin secret');
					} else if (CREDIT_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET_CREDIT) {
						// Determine which credit type to use
						logger.info('Contributor for credit check:', contributor);
						const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
						const shouldUseMonthlyCredit =
							monthlyRemaining > 0 || ['admin', 'slartibartfast'].includes(contributor.role);

						const mutation = shouldUseMonthlyCredit
							? INCREMENT_ANALYSIS_USAGE
							: INCREMENT_PURCHASED_CREDITS_USED;

						logger.debug('[DEBUG] Executing credit mutation...');
						const creditResponse = await fetch(CREDIT_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET_CREDIT || ''
							},
							body: JSON.stringify({
								query: print(mutation),
								variables: { contributorId }
							})
						});

						const creditResult = await creditResponse.json();
						logger.debug('[DEBUG] Credit mutation result:', creditResult);

						if (creditResult.errors) {
							logger.error('[DEBUG] Credit mutation failed:', creditResult.errors);
						} else {
							logger.debug('[DEBUG] Credit mutation successful');
						}
					}
				} catch (usageError) {
					logger.error('Failed to increment usage count:', usageError);
					// Don't fail the request if usage tracking fails
				}
			}

			// Add legacy usedClaude field for backward compatibility
			const response = {
				...scored,
				postId: input.postId || null,
				usedClaude: scored.provider === 'claude' && scored.usedAI
			};

			return json(response);
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
