/**
 * Analysis cache interface
 */
export interface CachedAnalysis {
	contentHash: string;
	timestamp: number;
	openaiResult?: any;
	claudeResult?: any;
}

/**
 * Simple hash function for content
 */
export function hashContent(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(36);
}

/**
 * Get cached analysis for current content
 * @param discussionId - The discussion ID to use as cache key
 * @param content - The content to check cache for
 * @param type - The analysis provider type
 * @returns Cached analysis result or null
 */
export function getCachedAnalysis(
	discussionId: string | null,
	content: string,
	type: 'openai' | 'claude'
): any | null {
	if (!discussionId) return null;

	const cacheKey = `analysis_cache:${discussionId}`;
	try {
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return null;

		const cache: CachedAnalysis = JSON.parse(cached);
		const currentHash = hashContent(content.trim());

		// Check if content matches and cache is not too old (24 hours)
		const isExpired = Date.now() - cache.timestamp > 24 * 60 * 60 * 1000;
		if (cache.contentHash === currentHash && !isExpired) {
			return type === 'openai' ? cache.openaiResult : cache.claudeResult;
		}
	} catch (e) {
		console.error('Failed to read analysis cache:', e);
	}
	return null;
}

/**
 * Store analysis in cache
 * @param discussionId - The discussion ID to use as cache key
 * @param content - The content being analyzed
 * @param type - The analysis provider type
 * @param result - The analysis result to cache
 */
export function cacheAnalysis(
	discussionId: string | null,
	content: string,
	type: 'openai' | 'claude',
	result: any
): void {
	if (!discussionId) return;

	const cacheKey = `analysis_cache:${discussionId}`;
	const contentHash = hashContent(content.trim());

	try {
		// Get existing cache or create new one
		let cache: CachedAnalysis;
		const existing = localStorage.getItem(cacheKey);
		if (existing) {
			cache = JSON.parse(existing);
			// If content hash changed, reset the cache
			if (cache.contentHash !== contentHash) {
				cache = {
					contentHash,
					timestamp: Date.now(),
					openaiResult: undefined,
					claudeResult: undefined
				};
			}
		} else {
			cache = {
				contentHash,
				timestamp: Date.now(),
				openaiResult: undefined,
				claudeResult: undefined
			};
		}

		// Update the specific analysis result
		if (type === 'openai') {
			cache.openaiResult = result;
		} else {
			cache.claudeResult = result;
		}
		cache.timestamp = Date.now();

		localStorage.setItem(cacheKey, JSON.stringify(cache));
	} catch (e) {
		console.error('Failed to cache analysis:', e);
	}
}
