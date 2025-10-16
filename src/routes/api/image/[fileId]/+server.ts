import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';

export async function GET({ params, request }) {
	try {
		const { fileId } = params;

		if (!fileId) {
			throw error(400, 'File ID is required');
		}

		// Use admin secret for server-side authentication
		const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

		if (!adminSecret) {
			logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
			throw error(500, 'Server configuration error');
		}

		logger.info('Fetching file:', fileId);

		// Get the file using admin authentication
		const response = await fetch(
			`https://cgjvstxytfoblxzoljqz.storage.us-east-1.nhost.run/v1/files/${fileId}`,
			{
				headers: {
					'x-hasura-admin-secret': adminSecret
				}
			}
		);

		logger.info('Storage response status:', response.status);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('Storage API error:', response.status, errorText);
			throw error(response.status, `Failed to fetch image: ${errorText}`);
		}

		// Get the image data and content type
		const imageBuffer = await response.arrayBuffer();
		let contentType = response.headers.get('content-type') || 'image/jpeg';

		// HEIC files are not supported by most browsers - log a warning
		if (contentType === 'image/heic' || contentType === 'image/heif') {
			logger.warn('HEIC/HEIF image detected - browsers may not support this format:', fileId);
			logger.warn('Client should convert HEIC to JPEG/PNG before upload');
		}

		logger.info('Successfully fetched image, size:', imageBuffer.byteLength, 'type:', contentType);

		// Return the image with proper headers
		return new Response(imageBuffer, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': 'inline', // Display inline, not as download
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
				'Content-Length': imageBuffer.byteLength.toString()
			}
		});
	} catch (err) {
		logger.error('Image proxy error:', err);
		throw error(500, 'Failed to load image');
	}
}
