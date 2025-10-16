import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Only apply strict CSP in production
	if (!dev) {
		response.headers.set(
			'Content-Security-Policy',
			[
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline' https://vercel.live https://va.vercel-scripts.com blob:", // Allow inline scripts for SvelteKit, Vercel live feedback, Analytics, and blob workers
				"worker-src 'self' blob:", // Allow web workers from blob URLs (for HEIC conversion)
				"style-src 'self' 'unsafe-inline'", // Allow inline styles
				"img-src 'self' data: https: blob:", // Allow images from self, data URLs, HTTPS, and blobs
				"font-src 'self' https:", // Allow fonts from self and HTTPS
				"media-src 'self' https://*.nhost.run https://storage.reasonsmith.com", // Allow audio/video from Nhost storage
				"connect-src 'self' https://*.nhost.run https://hasura.reasonsmith.com https://auth.reasonsmith.com https://storage.reasonsmith.com https://functions.reasonsmith.com https://api.vercel.com", // API connections (Nhost subdomain + custom domains)
				"frame-src 'none'", // No frames
				"object-src 'none'" // No objects
			].join('; ')
		);
	} else {
		// Development mode - more permissive CSP to allow hot reloading and dev tools
		response.headers.set(
			'Content-Security-Policy',
			[
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com blob:", // Allow eval in development, Vercel Analytics, and blob workers
				"worker-src 'self' blob:", // Allow web workers from blob URLs
				"style-src 'self' 'unsafe-inline'",
				"img-src 'self' data: https: blob:",
				"font-src 'self' https: data:",
				"media-src 'self' https: blob:", // Allow audio/video in development
				"connect-src 'self' ws: wss: https: http:", // Allow WebSocket for HMR
				"frame-src 'none'",
				"object-src 'none'"
			].join('; ')
		);
	}

	return response;
};
