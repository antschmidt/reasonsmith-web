/**
 * Webhook Endpoint for Jobs Worker Completion Notifications
 *
 * POST /api/analysis/webhook
 *
 * Receives job completion notifications from the external jobs worker service
 * and updates the database with the analysis results.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { logApiUsageAsync } from '$lib/server/apiUsageLogger';
import type { GoodFaithResult } from '$lib/goodFaith';

// Hasura configuration
const HASURA_GRAPHQL_ENDPOINT = env.HASURA_GRAPHQL_ENDPOINT || env.GRAPHQL_URL;
const HASURA_ADMIN_SECRET = env.HASURA_GRAPHQL_ADMIN_SECRET || env.HASURA_ADMIN_SECRET;

/**
 * Webhook payload from jobs worker
 */
interface WebhookPayload {
	jobId: string;
	status: 'completed' | 'failed';
	postId?: string;
	showcaseItemId?: string;
	discussionVersionId?: string;
	result?: {
		result: GoodFaithResult;
		strategy: string;
		claimsTotal: number;
		claimsAnalyzed: number;
		claimsFailed: number;
		claimAnalyses?: Array<{
			claimIndex: number;
			claim: {
				text: string;
				type: string;
				complexity: string;
				complexityConfidence: number;
				explicit: boolean;
				dependsOn: number[];
			};
			status: string;
			validityScore?: number;
			evidenceScore?: number;
			fallacies?: string[];
			fallacyExplanations?: Record<string, string>;
			assumptions?: string[];
			counterArguments?: string[];
			improvements?: string;
			modelUsed: string;
			inputTokens: number;
			outputTokens: number;
		}>;
		usage?: {
			inputTokens: number;
			outputTokens: number;
			estimatedCostCents?: number;
		};
	};
	error?: string;
}

/**
 * Update post with analysis results
 */
async function updatePostAnalysis(
	postId: string,
	result: GoodFaithResult,
	multipassData: {
		strategy: string;
		claimsTotal: number;
		claimsAnalyzed: number;
		claimsFailed: number;
	}
): Promise<void> {
	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_ADMIN_SECRET) {
		throw new Error('Hasura configuration missing');
	}

	const mutation = `
		mutation UpdatePostGoodFaith(
			$postId: uuid!
			$goodFaithScore: numeric!
			$goodFaithLabel: String
			$goodFaithLastEvaluated: timestamptz
			$goodFaithAnalysis: jsonb
			$analysisStrategy: String
			$claimsTotal: Int
			$claimsAnalyzed: Int
			$claimsFailed: Int
		) {
			update_post_by_pk(
				pk_columns: { id: $postId }
				_set: {
					good_faith_score: $goodFaithScore
					good_faith_label: $goodFaithLabel
					good_faith_last_evaluated: $goodFaithLastEvaluated
					good_faith_analysis: $goodFaithAnalysis
					analysis_strategy: $analysisStrategy
					claims_total: $claimsTotal
					claims_analyzed: $claimsAnalyzed
					claims_failed: $claimsFailed
				}
			) {
				id
			}
		}
	`;

	const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-hasura-admin-secret': HASURA_ADMIN_SECRET
		},
		body: JSON.stringify({
			query: mutation,
			variables: {
				postId,
				goodFaithScore: result.good_faith_score,
				goodFaithLabel: result.good_faith_label,
				goodFaithLastEvaluated: new Date().toISOString(),
				goodFaithAnalysis: result,
				analysisStrategy: multipassData.strategy,
				claimsTotal: multipassData.claimsTotal,
				claimsAnalyzed: multipassData.claimsAnalyzed,
				claimsFailed: multipassData.claimsFailed
			}
		})
	});

	const data = await response.json();
	if (data.errors) {
		logger.error('[Webhook] Failed to update post:', data.errors);
		throw new Error('Failed to update post');
	}
}

/**
 * Store claim analyses in database
 */
async function storeClaimAnalyses(
	postId: string | undefined,
	showcaseItemId: string | undefined,
	claimAnalyses: NonNullable<NonNullable<WebhookPayload['result']>['claimAnalyses']>
): Promise<void> {
	if (!claimAnalyses || claimAnalyses.length === 0) return;
	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_ADMIN_SECRET) {
		throw new Error('Hasura configuration missing');
	}

	const mutation = `
		mutation InsertClaimAnalyses($objects: [claim_analysis_insert_input!]!) {
			insert_claim_analysis(
				objects: $objects
				on_conflict: {
					constraint: claim_analysis_post_id_claim_index_key
					update_columns: [analysis, status, model_used, input_tokens, output_tokens, updated_at]
				}
			) {
				affected_rows
			}
		}
	`;

	const objects = claimAnalyses.map((ca) => ({
		post_id: postId || null,
		showcase_item_id: showcaseItemId || null,
		claim_index: ca.claimIndex,
		claim_text: ca.claim.text,
		claim_type: ca.claim.type,
		complexity_level: ca.claim.complexity,
		complexity_confidence: ca.claim.complexityConfidence,
		is_explicit: ca.claim.explicit,
		depends_on: ca.claim.dependsOn,
		analysis:
			ca.status === 'completed'
				? {
						validityScore: ca.validityScore,
						evidenceScore: ca.evidenceScore,
						fallacies: ca.fallacies,
						fallacyExplanations: ca.fallacyExplanations,
						assumptions: ca.assumptions,
						counterArguments: ca.counterArguments,
						improvements: ca.improvements
					}
				: null,
		model_used: ca.modelUsed,
		status: ca.status,
		input_tokens: ca.inputTokens,
		output_tokens: ca.outputTokens
	}));

	const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-hasura-admin-secret': HASURA_ADMIN_SECRET
		},
		body: JSON.stringify({
			query: mutation,
			variables: { objects }
		})
	});

	const data = await response.json();
	if (data.errors) {
		logger.error('[Webhook] Failed to store claim analyses:', data.errors);
		// Don't throw - claim storage is secondary to result storage
	}
}

export const POST: RequestHandler = async ({ request }) => {
	logger.info('[Webhook] Received job completion notification');

	// Validate webhook secret
	const webhookSecret = env.JOBS_WEBHOOK_SECRET;
	const providedSecret = request.headers.get('X-Webhook-Secret');

	if (!webhookSecret) {
		logger.warn('[Webhook] JOBS_WEBHOOK_SECRET not configured - accepting all requests');
	} else if (providedSecret !== webhookSecret) {
		logger.error('[Webhook] Invalid webhook secret');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload: WebhookPayload = await request.json();

		logger.info(`[Webhook] Processing job ${payload.jobId} with status: ${payload.status}`);

		if (payload.status === 'failed') {
			logger.error(`[Webhook] Job ${payload.jobId} failed:`, payload.error);
			// Could optionally update a job_status table or send notification
			return json({ received: true, processed: false, error: payload.error });
		}

		if (payload.status === 'completed' && payload.result) {
			const jobResult = payload.result;
			const goodFaithResult = jobResult.result;
			const claimAnalyses = jobResult.claimAnalyses;
			const usage = jobResult.usage;

			// Update the post with analysis results
			if (payload.postId) {
				await updatePostAnalysis(payload.postId, goodFaithResult, {
					strategy: jobResult.strategy,
					claimsTotal: jobResult.claimsTotal,
					claimsAnalyzed: jobResult.claimsAnalyzed,
					claimsFailed: jobResult.claimsFailed
				});
				logger.info(`[Webhook] Updated post ${payload.postId} with analysis results`);
			}

			// Store individual claim analyses
			if (claimAnalyses && claimAnalyses.length > 0) {
				await storeClaimAnalyses(payload.postId, payload.showcaseItemId, claimAnalyses);
				logger.info(`[Webhook] Stored ${claimAnalyses.length} claim analyses`);
			}

			// Log API usage (fire-and-forget)
			if (usage) {
				logApiUsageAsync({
					contributorId: null, // Jobs don't track contributor context
					provider: 'claude',
					model: 'multipass-jobs',
					endpoint: 'webhook-completion',
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					postId: payload.postId,
					metadata: {
						jobId: payload.jobId,
						strategy: jobResult.strategy,
						claimsTotal: jobResult.claimsTotal,
						claimsAnalyzed: jobResult.claimsAnalyzed,
						estimatedCostCents: usage.estimatedCostCents
					}
				});
			}

			return json({
				received: true,
				processed: true,
				postId: payload.postId,
				score: goodFaithResult.good_faith_score,
				label: goodFaithResult.good_faith_label
			});
		}

		return json({ received: true, processed: false, reason: 'Unknown status' });
	} catch (error) {
		logger.error('[Webhook] Error processing webhook:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to process webhook' },
			{ status: 500 }
		);
	}
};
