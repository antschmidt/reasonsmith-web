/**
 * Status Endpoint for Checking Interrupted Analyses
 *
 * Returns the current state of an analysis session for a showcase item,
 * allowing the client to determine if a previous analysis was interrupted
 * and what resume options are available.
 *
 * GET /api/analysis/status/:showcaseItemId
 *
 * Returns: AnalysisStatusResponse
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/logger';
import type {
	AnalysisSession,
	AnalysisPhase,
	AnalysisStatusResponse,
	ResumeAction
} from '$lib/multipass';

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

export const GET: RequestHandler = async ({ params, cookies, request }) => {
	const { showcaseItemId } = params;

	if (!showcaseItemId) {
		return json({ error: 'showcaseItemId is required' }, { status: 400 });
	}

	// Verify authentication - check cookie first, then Authorization header
	let accessToken = cookies.get('nhost.accessToken');
	if (!accessToken) {
		const authHeader = request.headers.get('authorization');
		if (authHeader?.startsWith('Bearer ')) {
			accessToken = authHeader.substring(7);
		}
	}

	if (!accessToken) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const HASURA_GRAPHQL_ENDPOINT = getHasuraEndpoint();
	const HASURA_GRAPHQL_ADMIN_SECRET = getHasuraAdminSecret();

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
		logger.error('[Status] Missing Hasura configuration');
		return json({ error: 'Server configuration error' }, { status: 500 });
	}

	try {
		// Fetch the most recent analysis session for this showcase item
		const sessionResult = await fetch(HASURA_GRAPHQL_ENDPOINT, {
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
							completed_at
							error_message
							error_phase
						}
					}
				`,
				variables: { showcaseItemId }
			})
		});

		const sessionData = await sessionResult.json();

		if (sessionData.errors) {
			logger.error('[Status] GraphQL error:', sessionData.errors);
			return json({ error: 'Failed to fetch session status' }, { status: 500 });
		}

		const session: AnalysisSession | undefined = sessionData.data?.analysis_session?.[0];

		// No session found
		if (!session) {
			// No session found - but check if there are claim analyses directly
			// (e.g., from jobs-worker that might not have created a session)
			let hasClaimAnalyses = false;
			let claimCount = 0;
			try {
				const claimCountResult = await fetch(HASURA_GRAPHQL_ENDPOINT, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
					},
					body: JSON.stringify({
						query: `
							query GetClaimAnalysisCount($showcaseItemId: uuid!) {
								claim_analysis_aggregate(
									where: {
										showcase_item_id: { _eq: $showcaseItemId },
										status: { _eq: "completed" }
									}
								) {
									aggregate {
										count
									}
								}
							}
						`,
						variables: { showcaseItemId }
					})
				});

				const claimCountData = await claimCountResult.json();
				claimCount = claimCountData.data?.claim_analysis_aggregate?.aggregate?.count || 0;
				hasClaimAnalyses = claimCount > 0;
				if (hasClaimAnalyses) {
					logger.info(
						`[Status] No session but found ${claimCount} claim analyses for ${showcaseItemId}`
					);
				}
			} catch (claimErr) {
				logger.warn('[Status] Failed to check claim_analysis table:', claimErr);
			}

			const response: AnalysisStatusResponse = {
				hasSession: false,
				phase: hasClaimAnalyses ? 'ready_for_synthesis' : 'not_started',
				canResume: false,
				canRetryFailed: false,
				canResynthesize: hasClaimAnalyses,
				claimsTotal: claimCount,
				claimsCompleted: claimCount,
				claimsFailed: 0,
				resumeActions: hasClaimAnalyses ? ['resynthesize', 'start_fresh'] : ['start_fresh']
			};
			return json(response);
		}

		// Determine phase and available actions based on session state
		let phase: AnalysisPhase;
		const resumeActions: ResumeAction[] = [];

		if (session.status === 'completed') {
			// Analysis completed successfully
			phase = 'completed';
			// Allow resynthesize for completed sessions (to re-run Pass 3 with new analyst notes)
			if (session.claims_completed > 0) {
				resumeActions.push('resynthesize');
			}
			resumeActions.push('start_fresh');
		} else if (session.status === 'failed') {
			// Analysis failed
			phase = 'failed';
			resumeActions.push('start_fresh');

			// If we have some completed claims, offer retry/resynthesize options
			if (session.current_pass >= 2 && session.claims_completed > 0) {
				if (session.claims_failed > 0) {
					resumeActions.push('retry_failed');
				}
				resumeActions.push('resynthesize');
			}
		} else if (session.status === 'abandoned') {
			// Previous session was abandoned (new one started)
			phase = 'not_started';
			resumeActions.push('start_fresh');
		} else if (session.status === 'in_progress') {
			// Session is still in progress (likely interrupted)
			if (session.current_pass === 1) {
				// Interrupted during Pass 1 - can't resume mid-extraction
				phase = 'pass1';
				resumeActions.push('start_fresh');
			} else if (session.current_pass === 2) {
				const totalClaims = session.total_claims || 0;
				const allProcessed = session.claims_completed + session.claims_failed >= totalClaims;

				if (allProcessed) {
					// All claims processed
					if (session.claims_failed > 0) {
						phase = 'pass2_complete';
						resumeActions.push('retry_failed');
					} else {
						phase = 'ready_for_synthesis';
					}
					resumeActions.push('resynthesize');
					resumeActions.push('start_fresh');
				} else {
					// Still have claims to process
					phase = 'pass2_incomplete';
					resumeActions.push('continue');
					if (session.claims_failed > 0) {
						resumeActions.push('retry_failed');
					}
					resumeActions.push('start_fresh');
				}
			} else if (session.current_pass === 3) {
				// Interrupted during synthesis
				phase = 'ready_for_synthesis';
				resumeActions.push('resynthesize');
				resumeActions.push('start_fresh');
			} else {
				// Unknown state
				phase = 'not_started';
				resumeActions.push('start_fresh');
			}
		} else {
			// Unknown status
			phase = 'not_started';
			resumeActions.push('start_fresh');
		}

		// Also check claim_analysis table directly in case session doesn't reflect actual claims
		// (e.g., if jobs-worker stored claims but session wasn't updated properly)
		let actualClaimsCompleted = session.claims_completed;
		if (actualClaimsCompleted === 0) {
			try {
				const claimCountResult = await fetch(HASURA_GRAPHQL_ENDPOINT, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
					},
					body: JSON.stringify({
						query: `
							query GetClaimAnalysisCount($showcaseItemId: uuid!) {
								claim_analysis_aggregate(
									where: {
										showcase_item_id: { _eq: $showcaseItemId },
										status: { _eq: "completed" }
									}
								) {
									aggregate {
										count
									}
								}
							}
						`,
						variables: { showcaseItemId }
					})
				});

				const claimCountData = await claimCountResult.json();
				const count = claimCountData.data?.claim_analysis_aggregate?.aggregate?.count || 0;
				if (count > 0) {
					actualClaimsCompleted = count;
					// Add resynthesize option if we found claims but session didn't show them
					if (!resumeActions.includes('resynthesize')) {
						resumeActions.push('resynthesize');
					}
					logger.info(
						`[Status] Found ${count} claim analyses directly (session showed ${session.claims_completed})`
					);
				}
			} catch (claimErr) {
				logger.warn('[Status] Failed to check claim_analysis table:', claimErr);
			}
		}

		const response: AnalysisStatusResponse = {
			hasSession: true,
			session,
			phase,
			canResume: resumeActions.includes('continue'),
			canRetryFailed: resumeActions.includes('retry_failed'),
			canResynthesize: resumeActions.includes('resynthesize'),
			claimsTotal: session.total_claims || 0,
			claimsCompleted: actualClaimsCompleted,
			claimsFailed: session.claims_failed,
			resumeActions
		};

		logger.info(
			`[Status] Session ${session.id}: phase=${phase}, ` +
				`claims=${session.claims_completed}/${session.total_claims || 0}, ` +
				`actions=[${resumeActions.join(', ')}]`
		);

		return json(response);
	} catch (err) {
		logger.error('[Status] Error fetching session:', err);
		return json({ error: 'Failed to fetch analysis status' }, { status: 500 });
	}
};
