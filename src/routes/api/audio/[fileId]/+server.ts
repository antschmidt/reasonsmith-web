import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function GET({ params, request }) {
	try {
		const { fileId } = params;

		if (!fileId) {
			throw error(400, 'File ID is required');
		}

		// Use admin secret for server-side authentication
		const adminSecret = env.HASURA_ADMIN_SECRET;

		if (!adminSecret) {
			console.error('HASURA_ADMIN_SECRET environment variable is not set');
			throw error(500, 'Server configuration error');
		}

		console.log('Fetching audio file:', fileId);

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
			throw error(response.status, `Failed to fetch audio: ${errorText}`);
		}

		// Get the audio data and content type
		const audioBuffer = await response.arrayBuffer();
		const contentType = response.headers.get('content-type') || 'audio/mpeg';

		console.log('Successfully fetched audio, size:', audioBuffer.byteLength, 'type:', contentType);

		// Return the audio with proper headers
		return new Response(audioBuffer, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
				'Content-Length': audioBuffer.byteLength.toString(),
				'Accept-Ranges': 'bytes' // Enable seeking in audio player
			}
		});
	} catch (err) {
		console.error('Audio proxy error:', err);
		throw error(500, 'Failed to load audio');
	}
}
