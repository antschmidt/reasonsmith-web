import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import sharp from 'sharp';

// Supported output formats
type OutputFormat = 'webp' | 'avif' | 'jpeg' | 'png';

export async function GET({ params, url }) {
	try {
		const { fileId } = params;

		if (!fileId) {
			throw error(400, 'File ID is required');
		}

		// Parse query parameters for resizing/format
		const width = url.searchParams.get('w') ? parseInt(url.searchParams.get('w')!) : null;
		const height = url.searchParams.get('h') ? parseInt(url.searchParams.get('h')!) : null;
		const format = url.searchParams.get('f') as OutputFormat | null;
		const quality = url.searchParams.get('q') ? parseInt(url.searchParams.get('q')!) : 80;

		// Validate parameters
		if (width && (width < 1 || width > 4096)) {
			throw error(400, 'Width must be between 1 and 4096');
		}
		if (height && (height < 1 || height > 4096)) {
			throw error(400, 'Height must be between 1 and 4096');
		}
		if (format && !['webp', 'avif', 'jpeg', 'png'].includes(format)) {
			throw error(400, 'Format must be webp, avif, jpeg, or png');
		}

		// Use admin secret for server-side authentication
		const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

		if (!adminSecret) {
			logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
			throw error(500, 'Server configuration error');
		}

		logger.info('Fetching file:', fileId, { width, height, format, quality });

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
		let outputBuffer: Buffer | Uint8Array = Buffer.from(imageBuffer);

		// Process image if resizing or format conversion is requested
		if (width || height || format) {
			try {
				let sharpInstance = sharp(Buffer.from(imageBuffer));

				// Resize if dimensions specified
				if (width || height) {
					sharpInstance = sharpInstance.resize(width, height, {
						fit: 'inside', // Maintain aspect ratio, fit within bounds
						withoutEnlargement: true // Don't upscale small images
					});
				}

				// Convert format if specified
				const outputFormat = format || 'webp'; // Default to webp for better compression
				switch (outputFormat) {
					case 'webp':
						sharpInstance = sharpInstance.webp({ quality });
						contentType = 'image/webp';
						break;
					case 'avif':
						sharpInstance = sharpInstance.avif({ quality });
						contentType = 'image/avif';
						break;
					case 'jpeg':
						sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
						contentType = 'image/jpeg';
						break;
					case 'png':
						sharpInstance = sharpInstance.png({ compressionLevel: 9 });
						contentType = 'image/png';
						break;
				}

				outputBuffer = await sharpInstance.toBuffer();
				logger.info('Image processed:', {
					originalSize: imageBuffer.byteLength,
					newSize: outputBuffer.byteLength,
					reduction: `${Math.round((1 - outputBuffer.byteLength / imageBuffer.byteLength) * 100)}%`
				});
			} catch (processingError) {
				logger.error('Image processing error:', processingError);
				// Fall back to original image if processing fails
				outputBuffer = Buffer.from(imageBuffer);
			}
		} else {
			// HEIC files are not supported by most browsers - convert to jpeg
			if (contentType === 'image/heic' || contentType === 'image/heif') {
				try {
					outputBuffer = await sharp(Buffer.from(imageBuffer)).jpeg({ quality: 85 }).toBuffer();
					contentType = 'image/jpeg';
					logger.info('Converted HEIC to JPEG');
				} catch (heicError) {
					logger.warn('Failed to convert HEIC:', heicError);
				}
			}
		}

		logger.info('Returning image, size:', outputBuffer.byteLength, 'type:', contentType);

		// Return the image with proper headers
		return new Response(outputBuffer, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': 'inline',
				'Cache-Control': 'public, max-age=31536000, immutable',
				'Content-Length': outputBuffer.byteLength.toString(),
				Vary: 'Accept' // Vary by Accept header for format negotiation
			}
		});
	} catch (err) {
		logger.error('Image proxy error:', err);
		throw error(500, 'Failed to load image');
	}
}
