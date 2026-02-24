import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';

const STORAGE_URL = 'https://cgjvstxytfoblxzoljqz.storage.us-east-1.nhost.run/v1/files';

interface ShowcaseItem {
	id: string;
	podcast_audio_url: string;
}

interface GraphQLResponse {
	data?: {
		public_showcase_item?: ShowcaseItem[];
	};
	errors?: Array<{ message: string }>;
}

/**
 * Admin endpoint to backfill podcast_audio_size for existing showcase items.
 * This fetches the file size from Nhost storage and updates the database.
 *
 * Requires admin secret authentication via x-admin-secret header.
 */
export const POST: RequestHandler = async ({ request }) => {
	const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET || env.HASURA_ADMIN_SECRET;
	const graphqlUrl = env.GRAPHQL_URL || env.HASURA_GRAPHQL_ENDPOINT;

	if (!adminSecret) {
		logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
		throw error(500, 'Server configuration error: missing admin secret');
	}

	if (!graphqlUrl) {
		logger.error('GRAPHQL_URL environment variable is not set');
		throw error(500, 'Server configuration error: missing GraphQL URL');
	}

	// Verify admin authentication
	const requestAdminSecret = request.headers.get('x-admin-secret');
	if (requestAdminSecret !== adminSecret) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Fetch all showcase items with podcast audio
		// Note: We don't filter on podcast_audio_size here so this works even before
		// the migration is applied. We'll check the size in code instead.
		const queryResponse = await fetch(graphqlUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': adminSecret
			},
			body: JSON.stringify({
				query: `
					query GetItemsNeedingAudioSize {
						public_showcase_item(
							where: {
								podcast_audio_url: { _is_null: false }
							}
						) {
							id
							podcast_audio_url
						}
					}
				`
			})
		});

		if (!queryResponse.ok) {
			logger.error('GraphQL request failed:', queryResponse.status, await queryResponse.text());
			throw error(500, `GraphQL request failed: ${queryResponse.status}`);
		}

		const queryResult: GraphQLResponse = await queryResponse.json();

		if (queryResult.errors) {
			logger.error('GraphQL query error:', queryResult.errors);
			throw error(500, 'Failed to fetch showcase items');
		}

		const items = queryResult.data?.public_showcase_item ?? [];
		logger.info(`Found ${items.length} items needing audio size backfill`);

		const results: Array<{ id: string; success: boolean; size?: number; error?: string }> = [];

		for (const item of items) {
			try {
				// Extract file ID from the URL (e.g., /api/audio/abc-123 -> abc-123)
				const fileId = item.podcast_audio_url.replace('/api/audio/', '');

				// Make a HEAD request to get the file size without downloading
				const headResponse = await fetch(`${STORAGE_URL}/${fileId}`, {
					method: 'HEAD',
					headers: {
						'x-hasura-admin-secret': adminSecret
					}
				});

				if (!headResponse.ok) {
					results.push({
						id: item.id,
						success: false,
						error: `Storage HEAD request failed: ${headResponse.status}`
					});
					continue;
				}

				const contentLength = headResponse.headers.get('content-length');
				const fileSize = contentLength ? parseInt(contentLength, 10) : null;

				if (!fileSize) {
					results.push({
						id: item.id,
						success: false,
						error: 'Could not determine file size from Content-Length header'
					});
					continue;
				}

				// Update the database with the file size
				const updateResponse = await fetch(graphqlUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-hasura-admin-secret': adminSecret
					},
					body: JSON.stringify({
						query: `
							mutation UpdatePodcastAudioSize($id: uuid!, $size: bigint!) {
								update_public_showcase_item_by_pk(
									pk_columns: { id: $id },
									_set: { podcast_audio_size: $size }
								) {
									id
									podcast_audio_size
								}
							}
						`,
						variables: {
							id: item.id,
							size: fileSize
						}
					})
				});

				const updateResult = await updateResponse.json();

				if (updateResult.errors) {
					results.push({
						id: item.id,
						success: false,
						error: `GraphQL update error: ${updateResult.errors[0]?.message}`
					});
					continue;
				}

				logger.info(`Updated item ${item.id} with audio size: ${fileSize} bytes`);
				results.push({
					id: item.id,
					success: true,
					size: fileSize
				});
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Unknown error';
				logger.error(`Error processing item ${item.id}:`, err);
				results.push({
					id: item.id,
					success: false,
					error: errorMessage
				});
			}
		}

		const successful = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		return json({
			message: `Backfill complete: ${successful} succeeded, ${failed} failed`,
			totalProcessed: items.length,
			successful,
			failed,
			results
		});
	} catch (err) {
		logger.error('Backfill audio sizes error:', err);
		throw error(500, 'Failed to backfill audio sizes');
	}
};
