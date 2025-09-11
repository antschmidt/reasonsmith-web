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
        "script-src 'self' 'unsafe-inline'", // Allow inline scripts for SvelteKit
        "style-src 'self' 'unsafe-inline'",   // Allow inline styles
        "img-src 'self' data: https:",        // Allow images from self, data URLs, and HTTPS
        "font-src 'self' https:",             // Allow fonts from self and HTTPS
        "connect-src 'self' https://graphql.reasonsmith.com https://auth.reasonsmith.com https://storage.reasonsmith.com https://functions.reasonsmith.com https://api.vercel.com https://*.nhost.run", // API connections (includes fallback for Nhost subdomain)
        "frame-src 'none'",                   // No frames
        "object-src 'none'",                  // No objects
      ].join('; ')
    );
  } else {
    // Development mode - more permissive CSP to allow hot reloading and dev tools
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow eval in development
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' https: data:",
        "connect-src 'self' ws: wss: https: http:",        // Allow WebSocket for HMR
        "frame-src 'none'",
        "object-src 'none'",
      ].join('; ')
    );
  }
  
  return response;
};