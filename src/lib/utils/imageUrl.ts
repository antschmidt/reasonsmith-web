/**
 * Utility functions for generating optimized image URLs
 */

export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png';

export interface ImageOptions {
	width?: number;
	height?: number;
	format?: ImageFormat;
	quality?: number;
}

/**
 * Add optimization query params to an image URL
 * @param url Original image URL (e.g., /api/image/abc-123)
 * @param options Optimization options
 * @returns URL with query params for resizing/format conversion
 */
export function optimizeImageUrl(url: string | undefined | null, options: ImageOptions = {}): string {
	if (!url) return '';

	// Only process /api/image/ URLs
	if (!url.startsWith('/api/image/')) {
		return url;
	}

	const params = new URLSearchParams();

	if (options.width) params.set('w', options.width.toString());
	if (options.height) params.set('h', options.height.toString());
	if (options.format) params.set('f', options.format);
	if (options.quality) params.set('q', options.quality.toString());

	const queryString = params.toString();
	return queryString ? `${url}?${queryString}` : url;
}

/**
 * Get optimized avatar URL
 * @param avatarUrl Original avatar URL
 * @param size Display size in pixels (will use 2x for retina)
 * @returns Optimized URL
 */
export function getAvatarUrl(avatarUrl: string | undefined | null, size: number = 80): string {
	// Use 2x size for retina displays, capped at reasonable max
	const optimizedSize = Math.min(size * 2, 400);
	return optimizeImageUrl(avatarUrl, {
		width: optimizedSize,
		height: optimizedSize,
		format: 'webp'
	});
}
