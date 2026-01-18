import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { print } from 'graphql';
import { INCREMENT_ANALYSIS_USAGE, INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';
import { getMonthlyCreditsRemaining } from '$lib/creditUtils';
import { logger } from '$lib/logger';
import { logApiUsageAsync } from '$lib/server/apiUsageLogger';

// Import shared utilities
import type {
	GoodFaithInput,
	ClaudeRawResponse,
	GoodFaithResult,
	WritingStyle
} from '$lib/goodFaith';
import type { PromptCacheTTL } from '$lib/graphql/queries/site-settings';
import {
	buildFullContent,
	buildBaseSystemPrompt,
	CLAUDE_SPECIFIC_INSTRUCTIONS,
	OUTPUT_SCHEMA_DESCRIPTION,
	normalizeClaudeResponse,
	parseClaudeJsonResponse,
	heuristicScore,
	PROVIDER_CONFIGS,
	STYLE_MODEL_MAP,
	DEFAULT_CLAUDE_MODEL,
	DEFAULT_MAX_TOKENS
} from '$lib/goodFaith';

// Import multi-pass analysis
import {
	shouldUseMultiPass,
	runMultiPassAnalysis,
	FEATURED_CONFIG,
	ACADEMIC_CONFIG,
	DEFAULT_MULTIPASS_MODELS
} from '$lib/multipass';
import type { AnalysisContext } from '$lib/multipass';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Fetch prompt cache TTL setting from database
 */
async function getPromptCacheTTL(): Promise<PromptCacheTTL> {
	try {
		const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
		const HASURA_GRAPHQL_ADMIN_SECRET =
			process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
			logger.warn('Missing Hasura config for fetching cache TTL, defaulting to off');
			return 'off';
		}

		const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					query GetPromptCacheTTL {
						site_settings_by_pk(key: "prompt_cache_ttl") {
							value
						}
					}
				`
			})
		});

		const result = await response.json();
		const value = result.data?.site_settings_by_pk?.value;

		if (value && ['off', '5m', '1h'].includes(value)) {
			return value as PromptCacheTTL;
		}

		return 'off';
	} catch (err) {
		logger.error('Failed to fetch prompt cache TTL:', err);
		return 'off';
	}
}

/**
 * Analyze content using Claude API
 * @param fullContent The content to analyze
 * @param modelOverride Optional model to use instead of default (based on writing style)
 * @param maxTokensOverride Optional max tokens override for the model
 * @param cacheTTL Optional cache TTL for system prompt
 */
async function analyzeWithClaude(
	fullContent: string,
	modelOverride?: string,
	maxTokensOverride?: number,
	cacheTTL: PromptCacheTTL = 'off'
): Promise<GoodFaithResult> {
	try {
		const model = modelOverride || DEFAULT_CLAUDE_MODEL;
		const maxTokens = maxTokensOverride || DEFAULT_MAX_TOKENS;
		logger.info(
			`Starting Claude API call with model: ${model}, maxTokens: ${maxTokens}, cache TTL: ${cacheTTL}`
		);

		if (!process.env.ANTHROPIC_API_KEY) {
			throw new Error('AI analysis is temporarily unavailable');
		}

		const config = PROVIDER_CONFIGS.claude;
		const systemPrompt =
			buildBaseSystemPrompt() + CLAUDE_SPECIFIC_INSTRUCTIONS + '\n\n' + OUTPUT_SCHEMA_DESCRIPTION;

		// Build request options based on cache TTL setting
		const requestOptions: Parameters<typeof anthropic.messages.create>[0] = {
			model: model,
			max_tokens: maxTokens,
			temperature: config.temperature,
			messages: [
				{
					role: 'user',
					content: fullContent
				}
			]
		};

		// Apply caching if enabled
		if (cacheTTL !== 'off') {
			// Use array format with cache_control for caching
			requestOptions.system = [
				{
					type: 'text',
					text: systemPrompt,
					cache_control: { type: 'ephemeral', ttl: cacheTTL }
				}
			] as any; // Type cast needed for cache_control extension
			// Add beta header for extended cache TTL
			(requestOptions as any).betas = ['extended-cache-ttl-2025-04-11'];
			logger.info(`Prompt caching enabled with TTL: ${cacheTTL}`);
		} else {
			// No caching - use simple string format
			requestOptions.system = systemPrompt;
		}

		const msg = (await anthropic.messages.create(requestOptions)) as Anthropic.Message;

		logger.info('Claude API response received');

		// Capture token usage from the response (including cache stats)
		const cacheCreationTokens = (msg.usage as any).cache_creation_input_tokens || 0;
		const cacheReadTokens = (msg.usage as any).cache_read_input_tokens || 0;
		const usage = {
			input_tokens: msg.usage.input_tokens,
			output_tokens: msg.usage.output_tokens,
			total_tokens: msg.usage.input_tokens + msg.usage.output_tokens,
			cache_creation_input_tokens: cacheCreationTokens,
			cache_read_input_tokens: cacheReadTokens
		};
		logger.info(
			`Token usage: ${usage.input_tokens} in, ${usage.output_tokens} out, ${usage.total_tokens} total`
		);
		if (cacheCreationTokens > 0 || cacheReadTokens > 0) {
			logger.info(
				`Cache stats: ${cacheCreationTokens} tokens cached, ${cacheReadTokens} tokens read from cache`
			);
		}

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

		// Add token usage to the result
		return {
			...result,
			usage
		};
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

		// Extract writing style and determine model
		const writingStyle = body.writingStyle as WritingStyle | undefined;
		const modelConfig = writingStyle ? STYLE_MODEL_MAP[writingStyle] : null;
		const selectedModel = modelConfig?.model || DEFAULT_CLAUDE_MODEL;
		const selectedMaxTokens = modelConfig?.maxTokens || DEFAULT_MAX_TOKENS;
		logger.info(
			`Writing style: ${writingStyle || 'not specified'}, using model: ${selectedModel}, maxTokens: ${selectedMaxTokens}`
		);

		if (!input.content.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		// Check if multi-pass analysis should be used
		// Phase 1: Featured content always uses multi-pass
		// Phase 2: Academic posts with 4+ claims use multi-pass
		const multiPassDecision = await shouldUseMultiPass(
			input.content,
			writingStyle,
			input.showcaseContext
		);

		if (multiPassDecision.useMultiPass) {
			logger.info(`[MultiPass] Routing to multi-pass analysis: ${multiPassDecision.reason}`);

			// Build context for multi-pass
			const multiPassContext: AnalysisContext = {
				discussion: input.discussionContext?.discussion
					? {
							id: input.discussionContext.discussion.id,
							title: input.discussionContext.discussion.title,
							description: input.discussionContext.discussion.description
						}
					: undefined,
				citations: input.discussionContext?.discussion?.citations?.map((c) => ({
					title: c.title,
					url: c.url,
					author: c.author,
					relevantQuote: c.relevant_quote
				})),
				selectedComments: input.discussionContext?.selectedComments?.map((c) => ({
					id: c.id,
					content: c.content,
					author: c.author
				})),
				showcaseContext: input.showcaseContext
					? {
							title: input.showcaseContext.title,
							subtitle: input.showcaseContext.subtitle,
							summary: input.showcaseContext.summary
						}
					: undefined
			};

			// Get cache TTL for multi-pass
			const cacheTTL = await getPromptCacheTTL();

			// Build config based on strategy
			const strategyConfig =
				multiPassDecision.strategy === 'multi_featured' ? FEATURED_CONFIG : ACADEMIC_CONFIG;

			try {
				const multiPassResult = await runMultiPassAnalysis(
					input.content,
					multiPassContext,
					{
						...strategyConfig,
						models: DEFAULT_MULTIPASS_MODELS,
						cacheTTL
					},
					anthropic
				);

				// Log multi-pass usage
				logApiUsageAsync({
					contributorId: null, // Will be set after auth check if needed
					provider: 'claude',
					model: 'multipass',
					endpoint: 'goodFaithClaude-multipass',
					inputTokens: multiPassResult.usage.total.inputTokens,
					outputTokens: multiPassResult.usage.total.outputTokens,
					postId: input.postId,
					discussionId: input.discussionContext?.discussion?.id,
					metadata: {
						strategy: multiPassResult.strategy,
						claimsTotal: multiPassResult.claimsTotal,
						claimsAnalyzed: multiPassResult.claimsAnalyzed,
						estimatedCost: multiPassResult.estimatedCost
					}
				});

				// Return multi-pass result in compatible format
				return json({
					...multiPassResult.result,
					postId: input.postId || null,
					usedClaude: true,
					multipass: {
						strategy: multiPassResult.strategy,
						claimsTotal: multiPassResult.claimsTotal,
						claimsAnalyzed: multiPassResult.claimsAnalyzed,
						claimsFailed: multiPassResult.claimsFailed,
						claimAnalyses: multiPassResult.claimAnalyses,
						passes: multiPassResult.passes,
						recommendSplit: multiPassResult.recommendSplit
					},
					usage: {
						input_tokens: multiPassResult.usage.total.inputTokens,
						output_tokens: multiPassResult.usage.total.outputTokens,
						total_tokens: multiPassResult.usage.total.totalTokens
					},
					estimatedCost: multiPassResult.estimatedCost
				});
			} catch (multiPassError) {
				logger.error(
					'[MultiPass] Multi-pass analysis failed, falling back to single-pass:',
					multiPassError
				);
				// Fall through to single-pass analysis
			}
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

			// Fetch cache TTL setting from database
			const cacheTTL = await getPromptCacheTTL();

			// Use Claude analysis with the selected model, max tokens, and cache TTL
			const scored = await analyzeWithClaude(
				fullContent,
				selectedModel,
				selectedMaxTokens,
				cacheTTL
			);

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

			// Log API usage for token tracking (fire-and-forget)
			if (scored.usedAI && scored.usage) {
				logApiUsageAsync({
					contributorId,
					provider: 'claude',
					model: selectedModel,
					endpoint: 'goodFaithClaude',
					inputTokens: scored.usage.input_tokens,
					outputTokens: scored.usage.output_tokens,
					postId: input.postId,
					discussionId: input.discussionContext?.discussion?.id,
					metadata: {
						contentLength: input.content.length,
						hasImportData: !!input.importData,
						hasShowcaseContext: !!input.showcaseContext,
						writingStyle: writingStyle || null
					}
				});
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
