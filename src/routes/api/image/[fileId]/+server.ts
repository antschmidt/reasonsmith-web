import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function GET({ params, request }) {
	try {
		const { fileId } = params;

		if (!fileId) {
			throw error(400, 'File ID is required');
		}

		// Use admin secret for server-side authentication
		const adminSecret = env.HASURA_ADMIN_SECRET || ":u5*t(oj)*'47nsYsEUrjl!3_nL&#M0E";

		console.log('Fetching file:', fileId);

		// Get the file using admin authentication
		const response = await fetch(
			`https://cgjvstxytfoblxzoljqz.storage.us-east-1.nhost.run/v1/files/${fileId}`,
			{
				headers: {
					'x-hasura-admin-secret': adminSecret
				}
			}
		);

		console.log('Storage response status:', response.status);

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Storage API error:', response.status, errorText);
			throw error(response.status, `Failed to fetch image: ${errorText}`);
		}

		// Get the image data and content type
		const imageBuffer = await response.arrayBuffer();
		const contentType = response.headers.get('content-type') || 'image/jpeg';

		console.log('Successfully fetched image, size:', imageBuffer.byteLength, 'type:', contentType);

		// Return the image with proper headers
		return new Response(imageBuffer, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
				'Content-Length': imageBuffer.byteLength.toString()
			}
		});
	} catch (err) {
		console.error('Image proxy error:', err);
		throw error(500, 'Failed to load image');
	}
}
