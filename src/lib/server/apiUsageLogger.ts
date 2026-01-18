/**
 * API Usage Logger
 *
 * Logs API token usage to the database for tracking and billing purposes.
 * Uses fire-and-forget pattern to avoid blocking API responses.
 */

import { logger } from '$lib/logger';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string | null | undefined): boolean {
	if (!value) return false;
	return UUID_REGEX.test(value);
}

export interface ApiUsageParams {
	contributorId: string | null;
	provider: string;
	model: string;
	endpoint: string;
	inputTokens: number;
	outputTokens: number;
	postId?: string | null;
	discussionId?: string | null;
	metadata?: Record<string, unknown>;
}

export interface TokenUsage {
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
}

const LOG_API_USAGE_MUTATION = `
	mutation LogApiUsage(
		$contributorId: uuid,
		$provider: String!,
		$model: String!,
		$endpoint: String!,
		$inputTokens: Int!,
		$outputTokens: Int!,
		$postId: uuid,
		$discussionId: uuid,
		$metadata: jsonb
	) {
		insert_api_usage_log_one(object: {
			contributor_id: $contributorId,
			provider: $provider,
			model: $model,
			endpoint: $endpoint,
			input_tokens: $inputTokens,
			output_tokens: $outputTokens,
			post_id: $postId,
			discussion_id: $discussionId,
			request_metadata: $metadata
		}) {
			id
			total_tokens
		}
	}
`;

/**
 * Log API usage to the database.
 * This function is non-blocking and will not throw errors to the caller.
 * Any errors are logged but don't affect the main API response.
 */
export async function logApiUsage(params: ApiUsageParams): Promise<void> {
	const {
		contributorId,
		provider,
		model,
		endpoint,
		inputTokens,
		outputTokens,
		postId,
		discussionId,
		metadata
	} = params;

	logger.info(
		`[API Usage] Attempting to log usage: ${endpoint}, ${provider}, ${inputTokens}/${outputTokens} tokens, contributor: ${contributorId}`
	);

	// Fire and forget - don't await in calling code if you want non-blocking
	try {
		let HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
		const HASURA_ADMIN_SECRET =
			process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_ADMIN_SECRET) {
			logger.warn('[API Usage] Logging skipped: Missing Hasura configuration', {
				hasEndpoint: !!HASURA_GRAPHQL_ENDPOINT,
				hasSecret: !!HASURA_ADMIN_SECRET
			});
			return;
		}

		// Try alternative endpoint if primary uses .graphql. subdomain
		const alternativeEndpoint = HASURA_GRAPHQL_ENDPOINT.replace('.graphql.', '.hasura.');

		// Validate UUIDs - only include if they're valid UUIDs, otherwise pass null
		const validatedPostId = isValidUuid(postId) ? postId : null;
		const validatedDiscussionId = isValidUuid(discussionId) ? discussionId : null;
		const validatedContributorId = isValidUuid(contributorId) ? contributorId : null;

		if (postId && !validatedPostId) {
			logger.debug(`[API Usage] postId "${postId}" is not a valid UUID, skipping`);
		}
		if (discussionId && !validatedDiscussionId) {
			logger.debug(`[API Usage] discussionId "${discussionId}" is not a valid UUID, skipping`);
		}

		const variables = {
			contributorId: validatedContributorId,
			provider,
			model,
			endpoint,
			inputTokens,
			outputTokens,
			postId: validatedPostId,
			discussionId: validatedDiscussionId,
			metadata: metadata || null
		};

		logger.debug('[API Usage] Sending mutation to:', HASURA_GRAPHQL_ENDPOINT);

		let response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: LOG_API_USAGE_MUTATION,
				variables
			})
		});

		let result = await response.json();

		// If we get a connection error or the table doesn't exist, try alternative endpoint
		if (result.errors && alternativeEndpoint !== HASURA_GRAPHQL_ENDPOINT) {
			logger.debug('[API Usage] Primary endpoint failed, trying alternative:', alternativeEndpoint);
			response = await fetch(alternativeEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-hasura-admin-secret': HASURA_ADMIN_SECRET
				},
				body: JSON.stringify({
					query: LOG_API_USAGE_MUTATION,
					variables
				})
			});
			result = await response.json();
		}

		if (result.errors) {
			logger.error('[API Usage] Failed to log usage:', JSON.stringify(result.errors, null, 2));
		} else {
			const totalTokens = result.data?.insert_api_usage_log_one?.total_tokens;
			logger.info(
				`[API Usage] Successfully logged: ${totalTokens} tokens (${inputTokens} in, ${outputTokens} out) for ${endpoint}`
			);
		}
	} catch (error) {
		// Log error but don't throw - this is a non-critical operation
		logger.error('[API Usage] Error logging usage:', error);
	}
}

/**
 * Helper to create a non-blocking usage log call.
 * Use this when you want to log usage without awaiting.
 */
export function logApiUsageAsync(params: ApiUsageParams): void {
	// Start the async operation but don't await it
	logApiUsage(params).catch((error) => {
		logger.error('Async API usage logging failed:', error);
	});
}
