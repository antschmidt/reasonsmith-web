/**
 * SSE Streaming Endpoint for Multi-Pass Analysis
 *
 * Provides real-time progress updates during long-running multi-pass analysis.
 * Uses Server-Sent Events (SSE) to stream progress to the client.
 *
 * Usage:
 *   POST /api/analysis/multipass/stream
 *   Content-Type: application/json
 *   Accept: text/event-stream
 *
 *   { content: "...", showcaseItemId: "...", ... }
 */

import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { print } from 'graphql';
import { INCREMENT_ANALYSIS_USAGE } from '$lib/graphql/queries';
import { logger } from '$lib/logger';
import { logApiUsageAsync } from '$lib/server/apiUsageLogger';
import {
	runMultiPassAnalysisWithProgress,
	FEATURED_CONFIG,
	DEFAULT_MULTIPASS_MODELS,
	formatSSEMessage,
	createProgressEvent
} from '$lib/multipass';
import type {
	ProgressEvent,
	MultiPassResult,
	AnalysisContext,
	AnalysisSessionUpdateInput,
	ExtractedClaim,
	AnalysisErrorPhase
} from '$lib/multipass';

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
 * Store claim analyses in database for featured content
 */
async function storeClaimAnalyses(result: MultiPassResult, showcaseItemId?: string): Promise<void> {
	try {
		const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
		const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
			logger.warn('[Stream] Missing Hasura config, skipping claim analysis storage');
			return;
		}

		if (!showcaseItemId) {
			logger.warn('[Stream] No showcase item ID provided, skipping claim analysis storage');
			return;
		}

		// Delete existing claim analyses for this showcase item
		const deleteResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation DeleteExistingClaimAnalyses($showcaseItemId: uuid!) {
						delete_claim_analysis(where: { showcase_item_id: { _eq: $showcaseItemId } }) {
							affected_rows
						}
					}
				`,
				variables: { showcaseItemId }
			})
		});

		const deleteResult = await deleteResponse.json();
		if (deleteResult.data?.delete_claim_analysis?.affected_rows > 0) {
			logger.info(
				`[Stream] Deleted ${deleteResult.data.delete_claim_analysis.affected_rows} existing claim analyses`
			);
		}

		// Build claim analysis records
		const claimRecords = result.claimAnalyses.map((analysis) => ({
			post_id: null,
			discussion_version_id: null,
			showcase_item_id: showcaseItemId,
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
		const insertResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
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

		const insertResult = await insertResponse.json();
		if (insertResult.errors) {
			logger.error('[Stream] Failed to store claim analyses:', insertResult.errors);
		} else {
			logger.info(`[Stream] Stored ${claimRecords.length} claim analyses`);
		}
	} catch (err) {
		logger.error('[Stream] Error storing claim analyses:', err);
	}
}

/**
 * Generate a hash of the content for verification during resume
 */
function hashContent(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

/**
 * Create a new analysis session
 */
async function createAnalysisSession(
	showcaseItemId: string,
	contentHash: string
): Promise<string | null> {
	try {
		const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
		const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
			logger.warn('[Stream] Missing Hasura config, cannot create session');
			return null;
		}

		// First, abandon any existing in-progress sessions for this showcase item
		await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation AbandonExistingSessions($showcaseItemId: uuid!) {
						update_analysis_session(
							where: {
								showcase_item_id: { _eq: $showcaseItemId }
								status: { _eq: "in_progress" }
							}
							_set: { status: "abandoned" }
						) {
							affected_rows
						}
					}
				`,
				variables: { showcaseItemId }
			})
		});

		// Create new session
		const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation InsertAnalysisSession(
						$showcase_item_id: uuid!
						$status: String!
						$current_pass: Int!
						$content_hash: String
					) {
						insert_analysis_session_one(
							object: {
								showcase_item_id: $showcase_item_id
								status: $status
								current_pass: $current_pass
								content_hash: $content_hash
							}
						) {
							id
						}
					}
				`,
				variables: {
					showcase_item_id: showcaseItemId,
					status: 'in_progress',
					current_pass: 1,
					content_hash: contentHash
				}
			})
		});

		const result = await response.json();
		if (result.errors) {
			logger.error('[Stream] Failed to create session:', result.errors);
			return null;
		}

		const sessionId = result.data?.insert_analysis_session_one?.id;
		logger.info(`[Stream] Created analysis session: ${sessionId}`);
		return sessionId;
	} catch (err) {
		logger.error('[Stream] Error creating session:', err);
		return null;
	}
}

/**
 * Update an existing analysis session
 */
async function updateAnalysisSession(
	sessionId: string,
	updates: AnalysisSessionUpdateInput
): Promise<void> {
	try {
		const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
		const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
			return;
		}

		// Build the _set object dynamically from non-undefined values
		const setFields: Record<string, unknown> = {};
		if (updates.status !== undefined) setFields.status = updates.status;
		if (updates.current_pass !== undefined) setFields.current_pass = updates.current_pass;
		if (updates.extracted_claims !== undefined)
			setFields.extracted_claims = updates.extracted_claims;
		if (updates.total_claims !== undefined) setFields.total_claims = updates.total_claims;
		if (updates.claims_completed !== undefined)
			setFields.claims_completed = updates.claims_completed;
		if (updates.claims_failed !== undefined) setFields.claims_failed = updates.claims_failed;
		if (updates.last_batch_index !== undefined)
			setFields.last_batch_index = updates.last_batch_index;
		if (updates.completed_at !== undefined) setFields.completed_at = updates.completed_at;
		if (updates.error_message !== undefined) setFields.error_message = updates.error_message;
		if (updates.error_phase !== undefined) setFields.error_phase = updates.error_phase;

		await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: `
					mutation UpdateAnalysisSession(
						$id: uuid!
						$_set: analysis_session_set_input!
					) {
						update_analysis_session_by_pk(
							pk_columns: { id: $id }
							_set: $_set
						) {
							id
							updated_at
						}
					}
				`,
				variables: {
					id: sessionId,
					_set: setFields
				}
			})
		});

		logger.debug(`[Stream] Updated session ${sessionId}:`, Object.keys(setFields));
	} catch (err) {
		logger.error('[Stream] Error updating session:', err);
	}
}

/**
 * Verify user has permission to run analysis
 */
async function verifyUserPermissions(accessToken: string | undefined): Promise<{
	allowed: boolean;
	contributorId?: string;
	error?: string;
}> {
	if (!accessToken) {
		return { allowed: false, error: 'Authentication required' };
	}

	const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
	const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
		logger.error('[Stream] Missing Hasura configuration');
		return { allowed: false, error: 'Server configuration error' };
	}

	try {
		// Decode JWT to get user ID (JWT payload is base64 encoded)
		let userId: string | undefined;
		try {
			const parts = accessToken.split('.');
			if (parts.length !== 3) {
				logger.debug('[Stream] Invalid JWT format');
				return { allowed: false, error: 'Invalid token format' };
			}
			const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
			logger.debug('[Stream] JWT payload:', JSON.stringify(payload));
			// Nhost JWT has user ID in 'sub' claim or 'https://hasura.io/jwt/claims'['x-hasura-user-id']
			userId = payload.sub || payload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];
		} catch (decodeErr) {
			logger.error('[Stream] Failed to decode JWT:', decodeErr);
			return { allowed: false, error: 'Invalid token' };
		}

		if (!userId) {
			logger.debug('[Stream] No userId found in JWT');
			return { allowed: false, error: 'Invalid session' };
		}

		logger.debug('[Stream] Extracted userId from JWT:', userId);

		// Get contributor info

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
		logger.debug('[Stream] Contributor query response:', JSON.stringify(contributorResult));
		const contributor = contributorResult.data?.contributor_by_pk;

		if (!contributor) {
			return { allowed: false, error: 'Contributor not found' };
		}

		// Check permissions
		if (!contributor.analysis_enabled) {
			return { allowed: false, error: 'Analysis access is disabled for this account' };
		}

		// Check limits (admins and slartibartfast are exempt)
		if (
			!['admin', 'slartibartfast'].includes(contributor.role) &&
			contributor.analysis_limit !== null
		) {
			if (contributor.analysis_count_used >= contributor.analysis_limit) {
				return {
					allowed: false,
					error: `Analysis limit reached (${contributor.analysis_count_used}/${contributor.analysis_limit})`
				};
			}
		}

		return { allowed: true, contributorId: contributor.id };
	} catch (err) {
		logger.error('[Stream] Permission check failed:', err);
		return { allowed: false, error: 'Permission check failed' };
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
		logger.error('[Stream] Error getting next version number:', err);
		return 1;
	}
}

/**
 * Save final synthesized result as a new analysis version
 * Creates a new version and sets it as active, also updates the showcase item's analysis field
 */
async function saveFinalResultToShowcase(
	showcaseItemId: string,
	result: MultiPassResult
): Promise<void> {
	try {
		const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
		const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
			logger.warn('[Stream] Missing Hasura config, cannot save final result');
			return;
		}

		// Build combined result with multipass metadata
		const goodFaithResult = result.result;
		const combinedResult = {
			...goodFaithResult,
			multipass: {
				strategy: result.strategy,
				claimsTotal: result.claimsTotal,
				claimsAnalyzed: result.claimsAnalyzed,
				claimsFailed: result.claimsFailed
			}
		};

		// Get next version number
		const versionNumber = await getNextVersionNumber(showcaseItemId);

		// Calculate estimated cost in cents
		const totalUsage = result.usage.total;
		// Rough estimate: $3/1M input, $15/1M output for Sonnet
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
						summary: goodFaithResult.summary || null,
						analysis_strategy: result.strategy,
						claims_total: result.claimsTotal,
						claims_analyzed: result.claimsAnalyzed,
						claims_failed: result.claimsFailed,
						model_used: DEFAULT_MULTIPASS_MODELS.simple,
						input_tokens: totalUsage.inputTokens,
						output_tokens: totalUsage.outputTokens,
						estimated_cost_cents: estimatedCostCents
					}
				}
			})
		});

		const versionData = await versionResponse.json();
		if (versionData.errors) {
			logger.error('[Stream] Failed to create analysis version:', versionData.errors);
			// Fall back to direct update if version creation fails
		} else {
			logger.info(
				`[Stream] Created analysis version ${versionNumber} for showcase item ${showcaseItemId}`
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
					summary: goodFaithResult.summary || null
				}
			})
		});

		const responseData = await response.json();
		if (responseData.errors) {
			logger.error('[Stream] Failed to update showcase analysis:', responseData.errors);
		} else {
			logger.info(`[Stream] Updated showcase item ${showcaseItemId} with active analysis`);
		}
	} catch (err) {
		logger.error('[Stream] Error saving final result:', err);
	}
}

/**
 * Increment analysis usage count
 */
async function incrementUsageCount(contributorId: string): Promise<void> {
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
				query: print(INCREMENT_ANALYSIS_USAGE),
				variables: { contributorId }
			})
		});
	} catch (err) {
		logger.error('[Stream] Failed to increment usage count:', err);
	}
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	// Parse request body
	let body: {
		content?: string;
		showcaseItemId?: string;
		discussionContext?: {
			discussion?: {
				id?: string;
				title?: string;
				description?: string;
			};
		};
	};

	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const { content, showcaseItemId, discussionContext } = body;

	// Validate content
	if (typeof content !== 'string' || !content.trim()) {
		return new Response(JSON.stringify({ error: 'content required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Verify permissions - check cookie first, then Authorization header
	let accessToken = cookies.get('nhost.accessToken');
	logger.debug('[Stream] Cookie accessToken:', accessToken ? 'present' : 'missing');
	if (!accessToken) {
		const authHeader = request.headers.get('authorization');
		logger.debug(
			'[Stream] Authorization header:',
			authHeader ? authHeader.substring(0, 30) + '...' : 'missing'
		);
		if (authHeader?.startsWith('Bearer ')) {
			accessToken = authHeader.substring(7);
			logger.debug('[Stream] Extracted token from header:', accessToken ? 'present' : 'missing');
		}
	}
	const { allowed, contributorId, error: permError } = await verifyUserPermissions(accessToken);
	logger.debug('[Stream] Permission check result:', { allowed, contributorId, error: permError });

	if (!allowed) {
		return new Response(JSON.stringify({ error: permError }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	logger.info(`[Stream] Starting SSE multi-pass analysis for contributor ${contributorId}`);

	// Build analysis context
	const analysisContext: AnalysisContext = {
		discussion: discussionContext?.discussion
			? {
					id: discussionContext.discussion.id,
					title: discussionContext.discussion.title,
					description: discussionContext.discussion.description
				}
			: undefined
	};

	// Create the SSE stream
	const encoder = new TextEncoder();
	const startTime = Date.now();

	// Create content hash for session tracking
	const contentHash = hashContent(content);

	// Create analysis session if we have a showcase item ID
	let sessionId: string | null = null;
	if (showcaseItemId) {
		sessionId = await createAnalysisSession(showcaseItemId, contentHash);
	}

	// Track progress for session updates
	let currentPass: 1 | 2 | 3 = 1;
	let extractedClaims: ExtractedClaim[] = [];
	let claimsCompleted = 0;
	let claimsFailed = 0;
	let lastBatchIndex = 0;

	const stream = new ReadableStream({
		async start(controller) {
			let streamClosed = false;

			const sendEvent = (event: ProgressEvent) => {
				// Don't try to send if stream is already closed
				if (streamClosed) {
					logger.debug('[Stream] Skipping event - stream already closed:', event.type);
					return;
				}

				try {
					const message = formatSSEMessage(event);
					controller.enqueue(encoder.encode(message));

					// Update session based on event type (async, non-blocking)
					if (sessionId) {
						updateSessionFromEvent(sessionId, event);
					}
				} catch (err) {
					// Mark stream as closed if we get the controller closed error
					if (err instanceof Error && err.message.includes('Controller is already closed')) {
						streamClosed = true;
						logger.debug('[Stream] Client disconnected, marking stream as closed');
					} else {
						logger.error('[Stream] Failed to send SSE event:', err);
					}
				}
			};

			// Helper to update session from progress events
			const updateSessionFromEvent = async (sid: string, event: ProgressEvent) => {
				switch (event.type) {
					case 'pass1_complete':
						// Pass 1 done - save extracted claims
						if ('claims' in event && Array.isArray(event.claims)) {
							extractedClaims = event.claims as ExtractedClaim[];
							currentPass = 2;
							await updateAnalysisSession(sid, {
								current_pass: 2,
								extracted_claims: extractedClaims,
								total_claims: extractedClaims.length
							});
						}
						break;

					case 'pass2_batch_complete':
						// Batch complete - update progress
						// Event has: batchIndex, totalBatches, succeeded, failed, results
						if ('batchIndex' in event) {
							lastBatchIndex = event.batchIndex as number;
						}
						if ('succeeded' in event) {
							// succeeded is cumulative count of successful claims so far
							claimsCompleted += event.succeeded as number;
						}
						if ('failed' in event) {
							// failed is cumulative count of failed claims so far
							claimsFailed += event.failed as number;
						}
						await updateAnalysisSession(sid, {
							claims_completed: claimsCompleted,
							claims_failed: claimsFailed,
							last_batch_index: lastBatchIndex
						});
						break;

					case 'pass2_complete':
						// Pass 2 done
						// Event has: totalAnalyzed, totalFailed, results, usage
						currentPass = 3;
						if ('totalAnalyzed' in event) {
							claimsCompleted = event.totalAnalyzed as number;
						}
						if ('totalFailed' in event) {
							claimsFailed = event.totalFailed as number;
						}
						await updateAnalysisSession(sid, {
							current_pass: 3,
							claims_completed: claimsCompleted,
							claims_failed: claimsFailed
						});
						break;

					case 'complete':
						// Analysis complete
						await updateAnalysisSession(sid, {
							status: 'completed',
							completed_at: new Date().toISOString()
						});
						break;

					case 'error':
						// Analysis failed
						const errorPhase: AnalysisErrorPhase =
							currentPass === 1 ? 'pass1' : currentPass === 2 ? 'pass2' : 'pass3';
						await updateAnalysisSession(sid, {
							status: 'failed',
							error_message: 'error' in event ? String(event.error) : 'Unknown error',
							error_phase: errorPhase
						});
						break;
				}
			};

			try {
				// Run the analysis with progress callbacks
				const result = await runMultiPassAnalysisWithProgress(
					content,
					analysisContext,
					{
						...FEATURED_CONFIG,
						models: DEFAULT_MULTIPASS_MODELS,
						cacheTTL: '5m'
					},
					sendEvent,
					{
						showcaseItemId,
						anthropic
					}
				);

				// Store claim analyses in database
				await storeClaimAnalyses(result, showcaseItemId);

				// Save final synthesized result to showcase item
				if (showcaseItemId) {
					await saveFinalResultToShowcase(showcaseItemId, result);
				}

				// Increment usage count
				if (contributorId) {
					await incrementUsageCount(contributorId);

					// Log token usage
					const totalUsage = result.usage.total;
					logApiUsageAsync({
						contributorId,
						endpoint: 'multipass/stream',
						provider: 'claude',
						model: 'multi-pass',
						inputTokens: totalUsage.inputTokens,
						outputTokens: totalUsage.outputTokens
					});
				}

				logger.info(
					`[Stream] Analysis complete in ${Date.now() - startTime}ms. ` +
						`Claims: ${result.claimsAnalyzed}/${result.claimsTotal}. ` +
						`Cost: ${result.estimatedCost.toFixed(2)}¢`
				);
			} catch (err) {
				logger.error('[Stream] Analysis failed:', err);

				// Send error event
				const errorEvent = createProgressEvent('error', startTime, {
					error: err instanceof Error ? err.message : 'Unknown error'
				});
				sendEvent(errorEvent);
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
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};
