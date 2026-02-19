/**
 * Resume Endpoint for Interrupted Analyses
 *
 * Resumes an interrupted multi-pass analysis from where it left off.
 * Supports three actions:
 * - 'continue': Resume processing remaining claims (SSE streaming)
 * - 'retry_failed': Re-analyze failed claims (SSE streaming)
 * - 'resynthesize': Run synthesis on existing claim analyses (non-streaming)
 *
 * POST /api/analysis/resume
 * Body: { showcaseItemId, content, action }
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import { logApiUsageAsync } from '$lib/server/apiUsageLogger';
import {
	runClaimAnalysisPassWithProgress,
	retryFailedClaims,
	runSynthesisPass,
	formatSSEMessage,
	createProgressEvent,
	FEATURED_CONFIG,
	DEFAULT_MULTIPASS_MODELS,
	DEFAULT_RATE_LIMIT_CONFIG
} from '$lib/multipass';
import type {
	ProgressEvent,
	AnalysisSession,
	AnalysisContext,
	ExtractedClaim,
	ClaimAnalysisResult,
	MultiPassConfig,
	MultiPassResult,
	TokenUsage,
	ResumeAction
} from '$lib/multipass';
import type { GoodFaithResult } from '$lib/goodFaith/types';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-build'
});

/**
 * Get Hasura GraphQL endpoint with /v1/graphql path ensured
 */
function getHasuraEndpoint(): string | undefined {
	let endpoint = process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
	if (endpoint && !endpoint.includes('/v1/graphql')) {
		endpoint = endpoint.replace(/\/?$/, '/v1/graphql');
	}
	return endpoint;
}

/**
 * Get Hasura admin secret
 */
function getHasuraAdminSecret(): string | undefined {
	return process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;
}

/**
 * Fetch the analysis session for a showcase item
 */
async function fetchAnalysisSession(showcaseItemId: string): Promise<AnalysisSession | null> {
	const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
	const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
		return null;
	}

	try {
		const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					query GetAnalysisSession($showcaseItemId: uuid!) {
						analysis_session(
							where: { showcase_item_id: { _eq: $showcaseItemId } }
							order_by: { started_at: desc }
							limit: 1
						) {
							id
							showcase_item_id
							status
							current_pass
							extracted_claims
							total_claims
							claims_completed
							claims_failed
							last_batch_index
							content_hash
							started_at
							updated_at
							error_message
							error_phase
						}
					}
				`,
				variables: { showcaseItemId }
			})
		});

		const result = await response.json();
		return result.data?.analysis_session?.[0] || null;
	} catch (err) {
		logger.error('[Resume] Failed to fetch session:', err);
		return null;
	}
}

/**
 * Fetch existing claim analyses for a showcase item
 */
async function fetchClaimAnalyses(showcaseItemId: string): Promise<ClaimAnalysisResult[]> {
	const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
	const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
		return [];
	}

	try {
		const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					query GetClaimAnalyses($showcaseItemId: uuid!) {
						claim_analysis(
							where: { showcase_item_id: { _eq: $showcaseItemId } }
							order_by: { claim_index: asc }
						) {
							id
							claim_index
							claim_text
							claim_type
							complexity_level
							complexity_confidence
							is_explicit
							depends_on
							analysis
							model_used
							status
							error_message
							input_tokens
							output_tokens
						}
					}
				`,
				variables: { showcaseItemId }
			})
		});

		const result = await response.json();
		const rows = result.data?.claim_analysis || [];

		// Convert database rows to ClaimAnalysisResult format
		return rows.map((row: any) => ({
			claimIndex: row.claim_index,
			claim: {
				index: row.claim_index,
				text: row.claim_text,
				type: row.claim_type,
				explicit: row.is_explicit,
				complexity: row.complexity_level,
				complexityConfidence: row.complexity_confidence,
				dependsOn: row.depends_on || []
			} as ExtractedClaim,
			status: row.status,
			validityScore: row.analysis?.validityScore,
			evidenceScore: row.analysis?.evidenceScore,
			fallacies: row.analysis?.fallacies,
			fallacyExplanations: row.analysis?.fallacyExplanations,
			assumptions: row.analysis?.assumptions,
			counterArguments: row.analysis?.counterArguments,
			improvements: row.analysis?.improvements,
			modelUsed: row.model_used,
			inputTokens: row.input_tokens || 0,
			outputTokens: row.output_tokens || 0,
			error: row.error_message
		}));
	} catch (err) {
		logger.error('[Resume] Failed to fetch claim analyses:', err);
		return [];
	}
}

/**
 * Update analysis session
 */
async function updateAnalysisSession(
	sessionId: string,
	updates: Partial<{
		status: string;
		current_pass: number;
		claims_completed: number;
		claims_failed: number;
		last_batch_index: number;
		completed_at: string;
		error_message: string;
		error_phase: string;
	}>
): Promise<void> {
	const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
	const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
		return;
	}

	try {
		await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation UpdateAnalysisSession($id: uuid!, $_set: analysis_session_set_input!) {
						update_analysis_session_by_pk(
							pk_columns: { id: $id }
							_set: $_set
						) {
							id
						}
					}
				`,
				variables: { id: sessionId, _set: updates }
			})
		});
	} catch (err) {
		logger.error('[Resume] Failed to update session:', err);
	}
}

/**
 * Store or update claim analyses in database
 */
async function storeClaimAnalyses(
	showcaseItemId: string,
	results: ClaimAnalysisResult[]
): Promise<void> {
	const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
	const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
		return;
	}

	try {
		// Use upsert to update existing or insert new
		const objects = results.map((r) => ({
			showcase_item_id: showcaseItemId,
			claim_index: r.claimIndex,
			claim_text: r.claim.text,
			claim_type: r.claim.type,
			complexity_level: r.claim.complexity,
			complexity_confidence: r.claim.complexityConfidence,
			is_explicit: r.claim.explicit,
			depends_on: r.claim.dependsOn,
			analysis:
				r.status === 'completed'
					? {
							validityScore: r.validityScore,
							evidenceScore: r.evidenceScore,
							fallacies: r.fallacies,
							fallacyExplanations: r.fallacyExplanations,
							assumptions: r.assumptions,
							counterArguments: r.counterArguments,
							improvements: r.improvements
						}
					: null,
			model_used: r.modelUsed,
			status: r.status,
			error_message: r.error || null,
			input_tokens: r.inputTokens,
			output_tokens: r.outputTokens
		}));

		await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation UpsertClaimAnalyses($objects: [claim_analysis_insert_input!]!) {
						insert_claim_analysis(
							objects: $objects
							on_conflict: {
								constraint: claim_analysis_showcase_item_id_claim_index_key
								update_columns: [analysis, status, error_message, input_tokens, output_tokens, model_used]
							}
						) {
							affected_rows
						}
					}
				`,
				variables: { objects }
			})
		});

		logger.info(`[Resume] Stored/updated ${results.length} claim analyses`);
	} catch (err) {
		logger.error('[Resume] Failed to store claim analyses:', err);
	}
}

/**
 * Get the next version number for a showcase item
 */
async function getNextVersionNumber(showcaseItemId: string): Promise<number> {
	const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
	const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
		return 1;
	}

	try {
		const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					query GetNextVersionNumber($showcaseItemId: uuid!) {
						showcase_analysis_version(
							where: { showcase_item_id: { _eq: $showcaseItemId } }
							order_by: { version_number: desc }
							limit: 1
						) {
							version_number
						}
					}
				`,
				variables: { showcaseItemId }
			})
		});

		const result = await response.json();
		const latestVersion = result.data?.showcase_analysis_version?.[0]?.version_number;
		return latestVersion ? latestVersion + 1 : 1;
	} catch (err) {
		logger.error('[Resume] Error getting next version number:', err);
		return 1;
	}
}

/**
 * Save final result as a new analysis version
 * Creates a new version and sets it as active, also updates the showcase item's analysis field
 */
async function saveFinalResult(
	showcaseItemId: string,
	result: GoodFaithResult,
	totalUsage: TokenUsage
): Promise<void> {
	const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
	const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
		return;
	}

	try {
		// Build combined result with multipass metadata
		const combinedResult = {
			...result,
			multipass: {
				strategy: 'multi_featured',
				resynthesized: true
			}
		};

		// Get next version number
		const versionNumber = await getNextVersionNumber(showcaseItemId);

		// Calculate estimated cost in cents (rough estimate for synthesis only)
		// $3/1M input, $15/1M output for Sonnet
		const estimatedCostCents =
			(totalUsage.inputTokens / 1_000_000) * 300 + (totalUsage.outputTokens / 1_000_000) * 1500;

		// Create the new version (trigger will deactivate others and set this as active)
		const versionResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation CreateAnalysisVersion($input: showcase_analysis_version_insert_input!) {
						insert_showcase_analysis_version_one(object: $input) {
							id
							version_number
							is_active
						}
					}
				`,
				variables: {
					input: {
						showcase_item_id: showcaseItemId,
						version_number: versionNumber,
						is_active: true,
						analysis: combinedResult,
						summary: result.summary || null,
						analysis_strategy: 'multi_featured',
						model_used: 'claude-sonnet-4-20250514',
						input_tokens: totalUsage.inputTokens,
						output_tokens: totalUsage.outputTokens,
						estimated_cost_cents: estimatedCostCents
					}
				}
			})
		});

		const versionData = await versionResponse.json();
		if (versionData.errors) {
			logger.error('[Resume] Failed to create analysis version:', versionData.errors);
			// Fall back to direct update if version creation fails
		} else {
			logger.info(
				`[Resume] Created analysis version ${versionNumber} for showcase item ${showcaseItemId}`
			);
		}

		// Also update the showcase item's analysis field for backward compatibility
		const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation UpdateShowcaseAnalysis(
						$id: uuid!,
						$analysis: String!,
						$summary: String
					) {
						update_public_showcase_item_by_pk(
							pk_columns: { id: $id }
							_set: {
								analysis: $analysis,
								summary: $summary,
								updated_at: "now()"
							}
						) {
							id
						}
					}
				`,
				variables: {
					id: showcaseItemId,
					analysis: JSON.stringify(combinedResult, null, 2),
					summary: result.summary || null
				}
			})
		});

		const responseData = await response.json();
		if (responseData.errors) {
			logger.error('[Resume] Failed to update showcase analysis:', responseData.errors);
		} else {
			logger.info(`[Resume] Updated showcase item ${showcaseItemId} with active analysis`);
		}
	} catch (err) {
		logger.error('[Resume] Failed to save final result:', err);
	}
}

/**
 * Verify user authentication
 */
async function verifyAuth(
	accessToken: string | undefined
): Promise<{ allowed: boolean; contributorId?: string; error?: string }> {
	if (!accessToken) {
		return { allowed: false, error: 'Authentication required' };
	}

	// For simplicity, just verify the token exists
	// The actual user validation happens in the streaming endpoint
	return { allowed: true, contributorId: 'unknown' };
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	// Parse request body
	let body: {
		showcaseItemId?: string;
		content?: string;
		action?: ResumeAction;
		analystNotes?: string;
	};

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { showcaseItemId, content, action, analystNotes } = body;

	// Validate required fields
	if (!showcaseItemId) {
		return json({ error: 'showcaseItemId is required' }, { status: 400 });
	}

	if (!action || !['continue', 'retry_failed', 'resynthesize'].includes(action)) {
		return json({ error: 'Invalid action' }, { status: 400 });
	}

	if (!content && action !== 'resynthesize') {
		return json({ error: 'content is required for this action' }, { status: 400 });
	}

	// Verify authentication - check cookie first, then Authorization header
	let accessToken = cookies.get('nhost.accessToken');
	if (!accessToken) {
		const authHeader = request.headers.get('authorization');
		if (authHeader?.startsWith('Bearer ')) {
			accessToken = authHeader.substring(7);
		}
	}
	const { allowed, error: authError } = await verifyAuth(accessToken);

	if (!allowed) {
		return json({ error: authError }, { status: 401 });
	}

	// Fetch session and existing claim analyses
	const session = await fetchAnalysisSession(showcaseItemId);
	const existingClaims = await fetchClaimAnalyses(showcaseItemId);

	// For resynthesize, we only need existing claims (session is optional)
	if (action === 'resynthesize') {
		if (existingClaims.length === 0) {
			return json({ error: 'No claim analyses found to resynthesize' }, { status: 404 });
		}
	} else if (!session) {
		// For continue/retry_failed, we need a session
		return json({ error: 'No analysis session found' }, { status: 404 });
	}

	logger.info(
		`[Resume] Action: ${action}, Session: ${session?.id || 'none'}, ` +
			`Status: ${session?.status || 'n/a'}, Pass: ${session?.current_pass || 'n/a'}, ` +
			`Claims: ${existingClaims.length}`
	);

	// Build config
	const config: MultiPassConfig = {
		...FEATURED_CONFIG,
		strategy: 'multi_featured',
		maxIndividualClaims: Infinity,
		isFeatured: true,
		models: DEFAULT_MULTIPASS_MODELS,
		complexityConfidenceThreshold: 0.65,
		cacheTTL: '5m',
		rateLimiting: DEFAULT_RATE_LIMIT_CONFIG
	};

	const analysisContext: AnalysisContext = {
		analystNotes: analystNotes || undefined
	};

	// Handle resynthesize action (non-streaming)
	if (action === 'resynthesize') {
		try {
			logger.info(`[Resume] Running synthesis on ${existingClaims.length} existing claim analyses`);

			const { result, usage } = await runSynthesisPass(
				content || '',
				existingClaims,
				analysisContext,
				config,
				anthropic
			);

			// Update session status if session exists
			if (session) {
				await updateAnalysisSession(session.id, {
					status: 'completed',
					current_pass: 3,
					completed_at: new Date().toISOString()
				});
			}

			// Save final result
			await saveFinalResult(showcaseItemId, result, usage);

			return json({ result, usage });
		} catch (err) {
			logger.error('[Resume] Resynthesize failed:', err);

			// Update session status if session exists
			if (session) {
				await updateAnalysisSession(session.id, {
					status: 'failed',
					error_message: err instanceof Error ? err.message : 'Unknown error',
					error_phase: 'pass3'
				});
			}

			return json(
				{ error: err instanceof Error ? err.message : 'Synthesis failed' },
				{ status: 500 }
			);
		}
	}

	// For 'continue' and 'retry_failed', use SSE streaming
	// At this point, session is guaranteed to exist (validated above)
	if (!session) {
		return json({ error: 'No analysis session found' }, { status: 404 });
	}

	const encoder = new TextEncoder();
	const startTime = Date.now();

	const stream = new ReadableStream({
		async start(controller) {
			const sendEvent = (event: ProgressEvent) => {
				try {
					const message = formatSSEMessage(event);
					controller.enqueue(encoder.encode(message));
				} catch (err) {
					logger.error('[Resume] Failed to send SSE event:', err);
				}
			};

			try {
				let claimsToProcess: ExtractedClaim[] = [];
				let allResults: ClaimAnalysisResult[] = [...existingClaims];

				if (action === 'retry_failed') {
					// Get failed claims from session's extracted claims
					const failedIndices = new Set(
						existingClaims.filter((c) => c.status === 'failed').map((c) => c.claimIndex)
					);

					if (session.extracted_claims) {
						claimsToProcess = (session.extracted_claims as ExtractedClaim[]).filter((ec) =>
							failedIndices.has(ec.index)
						);
					}

					logger.info(`[Resume] Retrying ${claimsToProcess.length} failed claims`);
				} else if (action === 'continue') {
					// Get claims not yet processed
					const processedIndices = new Set(existingClaims.map((c) => c.claimIndex));

					if (session.extracted_claims) {
						claimsToProcess = (session.extracted_claims as ExtractedClaim[]).filter(
							(ec) => !processedIndices.has(ec.index)
						);
					}

					logger.info(`[Resume] Continuing with ${claimsToProcess.length} remaining claims`);
				}

				if (claimsToProcess.length === 0) {
					logger.info('[Resume] No claims to process, proceeding to synthesis');
				} else {
					// Send pass2_started event
					const totalBatches = Math.ceil(
						claimsToProcess.length / (config.rateLimiting?.batchSize ?? 4)
					);
					sendEvent(
						createProgressEvent('pass2_started', startTime, {
							totalClaims: claimsToProcess.length,
							totalBatches,
							batchSize: config.rateLimiting?.batchSize ?? 4,
							estimatedTimeMs:
								claimsToProcess.length *
								((config.rateLimiting?.batchDelayMs ?? 15000) /
									(config.rateLimiting?.batchSize ?? 4))
						})
					);

					// Run claim analysis with progress
					const { results: newResults, totalUsage } = await runClaimAnalysisPassWithProgress(
						claimsToProcess,
						content || '',
						analysisContext,
						config,
						anthropic,
						({ batchIndex, totalBatches, results, succeeded, failed }) => {
							// Calculate total completed/failed across all claims
							const allCompleted =
								existingClaims.filter((c) => c.status === 'completed').length + succeeded;
							const allFailed = existingClaims.filter((c) => c.status === 'failed').length + failed;

							sendEvent(
								createProgressEvent('pass2_batch_complete', startTime, {
									batchIndex,
									totalBatches,
									succeeded: allCompleted,
									failed: allFailed,
									results
								})
							);

							// Update session progress
							updateAnalysisSession(session.id, {
								claims_completed: allCompleted,
								claims_failed: allFailed,
								last_batch_index: batchIndex
							});
						}
					);

					// Store new results
					await storeClaimAnalyses(showcaseItemId, newResults);

					// Merge new results with existing (replace retried claims)
					if (action === 'retry_failed') {
						const retriedIndices = new Set(newResults.map((r) => r.claimIndex));
						allResults = [
							...existingClaims.filter((c) => !retriedIndices.has(c.claimIndex)),
							...newResults
						];
					} else {
						allResults = [...existingClaims, ...newResults];
					}

					// Send pass2_complete event
					const completedCount = allResults.filter((r) => r.status === 'completed').length;
					const failedCount = allResults.filter((r) => r.status === 'failed').length;

					sendEvent(
						createProgressEvent('pass2_complete', startTime, {
							totalAnalyzed: completedCount,
							totalFailed: failedCount,
							results: allResults,
							usage: totalUsage
						})
					);
				}

				// Update session to pass 3
				await updateAnalysisSession(session.id, {
					current_pass: 3,
					claims_completed: allResults.filter((r) => r.status === 'completed').length,
					claims_failed: allResults.filter((r) => r.status === 'failed').length
				});

				// Run synthesis
				sendEvent(
					createProgressEvent('pass3_started', startTime, { message: 'Synthesizing results...' })
				);

				const { result, usage: synthesisUsage } = await runSynthesisPass(
					content || '',
					allResults,
					analysisContext,
					config,
					anthropic
				);

				sendEvent(
					createProgressEvent('pass3_complete', startTime, {
						usage: synthesisUsage
					})
				);

				// Update session as completed
				await updateAnalysisSession(session.id, {
					status: 'completed',
					completed_at: new Date().toISOString()
				});

				// Save final result
				await saveFinalResult(showcaseItemId, result, synthesisUsage);

				// Build a MultiPassResult compatible object for the complete event
				const multiPassResult: MultiPassResult = {
					result,
					strategy: 'multi_featured',
					passCount: 3,
					extraction: {
						claims: (session.extracted_claims as ExtractedClaim[]) || [],
						totalCount: allResults.length,
						groupedCount: 0,
						tooManyClaims: false,
						usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
					},
					claimAnalyses: allResults,
					claimsTotal: allResults.length,
					claimsAnalyzed: allResults.filter((r) => r.status === 'completed').length,
					claimsFailed: allResults.filter((r) => r.status === 'failed').length,
					usage: {
						pass1: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
						pass2: [],
						pass3: synthesisUsage,
						total: synthesisUsage
					},
					estimatedCost: 0,
					passes: []
				};

				// Send complete event
				sendEvent(
					createProgressEvent('complete', startTime, {
						result: multiPassResult
					})
				);

				logger.info(
					`[Resume] Analysis complete in ${Date.now() - startTime}ms. ` +
						`Claims: ${allResults.filter((r) => r.status === 'completed').length}/${allResults.length}`
				);
			} catch (err) {
				logger.error('[Resume] Analysis failed:', err);

				// Update session as failed
				await updateAnalysisSession(session.id, {
					status: 'failed',
					error_message: err instanceof Error ? err.message : 'Unknown error',
					error_phase: session.current_pass === 2 ? 'pass2' : 'pass3'
				});

				// Send error event
				sendEvent(
					createProgressEvent('error', startTime, {
						error: err instanceof Error ? err.message : 'Unknown error'
					})
				);
			} finally {
				controller.close();
			}
		}
	});

	// Return the SSE response
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
