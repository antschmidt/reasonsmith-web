/**
 * API Usage Logger
 *
 * Logs API token usage to the database for tracking and billing purposes.
 * Uses fire-and-forget pattern to avoid blocking API responses.
 */

import { logger } from '$lib/logger';

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

	// Fire and forget - don't await in calling code if you want non-blocking
	try {
		const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
		const HASURA_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

		if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_ADMIN_SECRET) {
			logger.warn('API usage logging skipped: Missing Hasura configuration');
			return;
		}

		const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_ADMIN_SECRET
			},
			body: JSON.stringify({
				query: LOG_API_USAGE_MUTATION,
				variables: {
					contributorId: contributorId || null,
					provider,
					model,
					endpoint,
					inputTokens,
					outputTokens,
					postId: postId || null,
					discussionId: discussionId || null,
					metadata: metadata || null
				}
			})
		});

		const result = await response.json();

		if (result.errors) {
			logger.error('Failed to log API usage:', result.errors);
		} else {
			const totalTokens = result.data?.insert_api_usage_log_one?.total_tokens;
			logger.debug(`API usage logged: ${totalTokens} tokens (${inputTokens} in, ${outputTokens} out) for ${endpoint}`);
		}
	} catch (error) {
		// Log error but don't throw - this is a non-critical operation
		logger.error('Error logging API usage:', error);
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
