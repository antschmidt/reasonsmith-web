/**
 * Multi-Pass Analysis API Endpoint
 *
 * POST /api/analysis/multipass
 *
 * Runs the three-pass analysis pipeline for deep content evaluation.
 * Used for featured analyses and academic posts with 4+ claims.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { print } from 'graphql';
import { logger } from '$lib/logger';
import { logApiUsageAsync } from '$lib/server/apiUsageLogger';
import { getMonthlyCreditsRemaining } from '$lib/creditUtils';
import type { UserRole } from '$lib/permissions';
import { INCREMENT_ANALYSIS_USAGE, INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';
import {
	runMultiPassAnalysis,
	FEATURED_CONFIG,
	ACADEMIC_CONFIG,
	DEFAULT_MULTIPASS_MODELS
} from '$lib/multipass';
import type {
	MultiPassConfig,
	AnalysisStrategy,
	AnalysisContext,
	MultiPassResult
} from '$lib/multipass';
import type { PromptCacheTTL } from '$lib/graphql/queries/site-settings';

// Initialize Anthropic client
const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Strategy configurations
 */
const STRATEGY_CONFIGS: Record<'featured' | 'academic', Partial<MultiPassConfig>> = {
	featured: {
		...FEATURED_CONFIG,
		models: DEFAULT_MULTIPASS_MODELS
	},
	academic: {
		...ACADEMIC_CONFIG,
		models: DEFAULT_MULTIPASS_MODELS
	}
};

/**
 * Fetch prompt cache TTL setting from database
 */
async function getPromptCacheTTL(): Promise<PromptCacheTTL> {
	try {
		const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
		const HASURA_GRAPHQL_ADMIN_SECRET =
			process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
			return '5m'; // Default to 5m for multi-pass (benefits from caching)
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

		return '5m';
	} catch (err) {
		logger.error('Failed to fetch prompt cache TTL:', err);
		return '5m';
	}
}

/**
 * Store claim analyses in database
 */
async function storeClaimAnalyses(
	result: MultiPassResult,
	postId?: string,
	discussionVersionId?: string
): Promise<void> {
	try {
		const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
		const HASURA_GRAPHQL_ADMIN_SECRET =
			process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
			logger.warn('Missing Hasura config, skipping claim analysis storage');
			return;
		}

		// Build claim analysis records
		const claimRecords = result.claimAnalyses.map((analysis) => ({
			post_id: postId || null,
			discussion_version_id: discussionVersionId || null,
			claim_index: analysis.claimIndex,
			claim_text: analysis.claim.text,
			claim_type: analysis.claim.type,
			complexity_level: analysis.claim.complexity,
			complexity_confidence: analysis.claim.complexityConfidence,
			is_explicit: analysis.claim.explicit,
			depends_on: analysis.claim.dependsOn,
			analysis:
				analysis.status === 'completed'
					? {
							validityScore: analysis.validityScore,
							evidenceScore: analysis.evidenceScore,
							fallacies: analysis.fallacies,
							fallacyExplanations: analysis.fallacyExplanations,
							assumptions: analysis.assumptions,
							counterArguments: analysis.counterArguments,
							improvements: analysis.improvements
						}
					: null,
			model_used: analysis.modelUsed,
			status: analysis.status,
			error_message: analysis.error || null,
			input_tokens: analysis.inputTokens,
			output_tokens: analysis.outputTokens
		}));

		// Insert claim analyses
		await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation InsertClaimAnalyses($objects: [claim_analysis_insert_input!]!) {
						insert_claim_analysis(objects: $objects) {
							affected_rows
						}
					}
				`,
				variables: { objects: claimRecords }
			})
		});

		// Update parent record with multi-pass metadata
		if (postId) {
			await fetch(HASURA_GRAPHQL_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
				},
				body: JSON.stringify({
					query: `
						mutation UpdatePostMultiPass(
							$postId: uuid!
							$strategy: String!
							$passCount: Int!
							$claimsTotal: Int
							$claimsAnalyzed: Int
							$claimsFailed: Int
						) {
							update_post_by_pk(
								pk_columns: { id: $postId }
								_set: {
									analysis_strategy: $strategy
									analysis_pass_count: $passCount
									claims_total: $claimsTotal
									claims_analyzed: $claimsAnalyzed
									claims_failed: $claimsFailed
								}
							) { id }
						}
					`,
					variables: {
						postId,
						strategy: result.strategy,
						passCount: result.passCount,
						claimsTotal: result.claimsTotal,
						claimsAnalyzed: result.claimsAnalyzed,
						claimsFailed: result.claimsFailed
					}
				})
			});
		}

		if (discussionVersionId) {
			await fetch(HASURA_GRAPHQL_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
				},
				body: JSON.stringify({
					query: `
						mutation UpdateDiscussionVersionMultiPass(
							$versionId: uuid!
							$strategy: String!
							$passCount: Int!
							$claimsTotal: Int
							$claimsAnalyzed: Int
							$claimsFailed: Int
						) {
							update_discussion_version_by_pk(
								pk_columns: { id: $versionId }
								_set: {
									analysis_strategy: $strategy
									analysis_pass_count: $passCount
									claims_total: $claimsTotal
									claims_analyzed: $claimsAnalyzed
									claims_failed: $claimsFailed
								}
							) { id }
						}
					`,
					variables: {
						versionId: discussionVersionId,
						strategy: result.strategy,
						passCount: result.passCount,
						claimsTotal: result.claimsTotal,
						claimsAnalyzed: result.claimsAnalyzed,
						claimsFailed: result.claimsFailed
					}
				})
			});
		}

		logger.info(`Stored ${claimRecords.length} claim analyses`);
	} catch (error) {
		logger.error('Failed to store claim analyses:', error);
		// Don't throw - analysis succeeded, just storage failed
	}
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	logger.info('=== Multi-Pass Analysis endpoint called ===');

	try {
		const body = await request.json();

		const { content, postId, discussionVersionId, strategy, writingStyle, context } = body as {
			content: string;
			postId?: string;
			discussionVersionId?: string;
			strategy: 'featured' | 'academic';
			writingStyle?: string;
			context?: AnalysisContext;
		};

		// Validate required fields
		if (!content?.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		if (!strategy || !['featured', 'academic'].includes(strategy)) {
			return json({ error: 'Invalid strategy. Must be "featured" or "academic"' }, { status: 400 });
		}

		// Get strategy config
		const strategyConfig = STRATEGY_CONFIGS[strategy];

		// Get cache TTL from settings
		const cacheTTL = await getPromptCacheTTL();

		// Build full config
		const config: Partial<MultiPassConfig> = {
			...strategyConfig,
			cacheTTL
		};

		// Get user for credit tracking
		let accessToken = cookies.get('nhost.accessToken');
		if (!accessToken) {
			const authHeader = request.headers.get('authorization');
			if (authHeader?.startsWith('Bearer ')) {
				accessToken = authHeader.substring(7);
			}
		}

		let contributorId: string | null = null;
		let contributor: {
			id: string;
			role: UserRole;
			analysis_enabled: boolean;
			analysis_limit: number | null;
			analysis_count_used: number;
		} | null = null;

		// Check user permissions and credits
		if (accessToken) {
			const HASURA_GRAPHQL_ENDPOINT =
				process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
			const HASURA_GRAPHQL_ADMIN_SECRET =
				process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

			if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
				try {
					const tokenPayload = JSON.parse(atob(accessToken.split('.')[1]));
					const userId =
						tokenPayload.sub || tokenPayload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];

					if (userId) {
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

						if (contributor) {
							if (!contributor.analysis_enabled) {
								return json(
									{ error: 'Analysis access is disabled for this account' },
									{ status: 403 }
								);
							}

							if (
								!['admin', 'slartibartfast'].includes(contributor.role) &&
								contributor.analysis_limit !== null
							) {
								// Multi-pass costs more, check if user has enough credits
								// Estimate ~3 credits for multi-pass (rough average)
								const creditsNeeded = 3;
								const creditsAvailable =
									contributor.analysis_limit - contributor.analysis_count_used;

								if (creditsAvailable < creditsNeeded) {
									return json(
										{
											error: 'Insufficient credits for multi-pass analysis',
											creditsNeeded,
											creditsAvailable
										},
										{ status: 429 }
									);
								}
							}
						}
					}
				} catch (dbError) {
					logger.error('Database check failed:', dbError);
				}
			}
		}

		// Run multi-pass analysis
		logger.info(`Running ${strategy} multi-pass analysis on ${content.length} chars`);

		const result = await runMultiPassAnalysis(content, context || {}, config, anthropic);

		// Store claim analyses in database
		if (postId || discussionVersionId) {
			await storeClaimAnalyses(result, postId, discussionVersionId);
		}

		// Increment credit usage (count as 1 analysis for now, could be adjusted)
		if (contributorId && contributor && result.result.usedAI) {
			try {
				const HASURA_GRAPHQL_ENDPOINT =
					process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
				const HASURA_GRAPHQL_ADMIN_SECRET =
					process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

				if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
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
			}
		}

		// Log API usage for each pass
		if (result.result.usedAI) {
			// Log Pass 1
			logApiUsageAsync({
				contributorId,
				provider: 'claude',
				model: config.models?.extraction || 'claude-haiku-4-5',
				endpoint: 'multipass-extraction',
				inputTokens: result.usage.pass1.inputTokens,
				outputTokens: result.usage.pass1.outputTokens,
				postId,
				discussionId: context?.discussion?.id,
				metadata: {
					strategy,
					claimsExtracted: result.claimsTotal
				}
			});

			// Log Pass 2 aggregate
			const pass2TotalInput = result.usage.pass2.reduce((sum, u) => sum + u.inputTokens, 0);
			const pass2TotalOutput = result.usage.pass2.reduce((sum, u) => sum + u.outputTokens, 0);
			logApiUsageAsync({
				contributorId,
				provider: 'claude',
				model: 'mixed', // Multiple models used
				endpoint: 'multipass-analysis',
				inputTokens: pass2TotalInput,
				outputTokens: pass2TotalOutput,
				postId,
				discussionId: context?.discussion?.id,
				metadata: {
					strategy,
					claimsAnalyzed: result.claimsAnalyzed,
					claimsFailed: result.claimsFailed
				}
			});

			// Log Pass 3
			logApiUsageAsync({
				contributorId,
				provider: 'claude',
				model: config.models?.synthesis || 'claude-sonnet-4-5',
				endpoint: 'multipass-synthesis',
				inputTokens: result.usage.pass3.inputTokens,
				outputTokens: result.usage.pass3.outputTokens,
				postId,
				discussionId: context?.discussion?.id,
				metadata: {
					strategy,
					finalScore: result.result.good_faith_score
				}
			});
		}

		// Build response
		const response = {
			...result.result,
			postId: postId || null,
			discussionVersionId: discussionVersionId || null,
			multipass: {
				strategy: result.strategy,
				passCount: result.passCount,
				claimsTotal: result.claimsTotal,
				claimsAnalyzed: result.claimsAnalyzed,
				claimsFailed: result.claimsFailed,
				claimAnalyses: result.claimAnalyses,
				extraction: result.extraction,
				passes: result.passes,
				recommendSplit: result.recommendSplit
			},
			usage: result.usage.total,
			estimatedCost: result.estimatedCost
		};

		logger.info(
			`Multi-pass analysis complete: score=${result.result.good_faith_score}, ` +
				`claims=${result.claimsAnalyzed}/${result.claimsTotal}, cost=${result.estimatedCost.toFixed(2)}¢`
		);

		return json(response);
	} catch (error) {
		logger.error('Multi-pass analysis failed:', error);
		const message = error instanceof Error ? error.message : 'Analysis failed';
		return json({ error: message }, { status: 500 });
	}
};
