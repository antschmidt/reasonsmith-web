/**
 * Rate Limiting Utilities
 *
 * Helpers for managing API rate limits during batch processing.
 */

/**
 * Split an array into chunks of a specified size
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
	if (chunkSize <= 0) {
		throw new Error('Chunk size must be positive');
	}

	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += chunkSize) {
		chunks.push(array.slice(i, i + chunkSize));
	}
	return chunks;
}

/**
 * Delay execution for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a rate limit error from Anthropic
 */
export function isRateLimitError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;

	// Check for Anthropic SDK error shape
	const err = error as { status?: number; error?: { type?: string } };
	if (err.status === 429) return true;
	if (err.error?.type === 'rate_limit_error') return true;

	// Check error message
	if (error instanceof Error && error.message.includes('rate_limit')) {
		return true;
	}

	return false;
}

/**
 * Extract retry-after value from rate limit error headers
 */
export function getRetryAfterMs(error: unknown): number {
	const defaultRetryMs = 20000;

	if (!error || typeof error !== 'object') return defaultRetryMs;

	// Try to get from headers
	const err = error as { headers?: { get?: (key: string) => string | null } };
	if (err.headers?.get) {
		const retryAfter = err.headers.get('retry-after');
		if (retryAfter) {
			const seconds = parseInt(retryAfter, 10);
			if (!isNaN(seconds)) {
				return seconds * 1000;
			}
		}
	}

	return defaultRetryMs;
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
	attempt: number,
	baseMs: number,
	maxMs: number = 120000
): number {
	const backoff = baseMs * Math.pow(2, attempt);
	// Add jitter (0-20% random variation)
	const jitter = backoff * 0.2 * Math.random();
	return Math.min(backoff + jitter, maxMs);
}

/**
 * Format duration in ms to human-readable string
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60000);
	const seconds = Math.round((ms % 60000) / 1000);
	return `${minutes}m ${seconds}s`;
}

/**
 * Estimate total time for batch processing
 */
export function estimateTotalTime(
	totalItems: number,
	batchSize: number,
	batchDelayMs: number,
	avgProcessingTimeMs: number = 15000
): number {
	const numBatches = Math.ceil(totalItems / batchSize);
	const processingTime = numBatches * avgProcessingTimeMs;
	const delayTime = (numBatches - 1) * batchDelayMs; // No delay after last batch
	return processingTime + delayTime;
}
