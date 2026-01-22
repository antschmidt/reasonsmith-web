/**
 * Token estimation utilities for Claude API
 * Uses a rough approximation of ~4 characters per token for English text
 */

/**
 * Estimate the number of tokens in a text string
 * @param text The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
	if (!text) return 0;
	// Rough estimate: ~4 chars per token for English
	return Math.ceil(text.length / 4);
}

/**
 * Format a token count for display
 * @param tokens The number of tokens
 * @returns Formatted string like "~245 tokens" or "~2.1k tokens"
 */
export function formatTokenCount(tokens: number): string {
	if (tokens < 1000) return `~${tokens}`;
	return `~${(tokens / 1000).toFixed(1)}k`;
}

/**
 * Get a compact token info string showing breakdown
 * @param contentTokens Tokens from user content
 * @param contextTokens Tokens from discussion context (optional)
 * @param systemTokens Tokens from system prompt (optional, typically cached)
 * @returns Formatted string like "~2.7k tokens (system: 2k cached, context: 450, content: 245)"
 */
export function formatTokenBreakdown(
	contentTokens: number,
	contextTokens?: number,
	systemTokens?: number
): string {
	const total = contentTokens + (contextTokens ?? 0) + (systemTokens ?? 0);
	const parts: string[] = [];

	if (systemTokens && systemTokens > 0) {
		parts.push(`system: ${formatTokenCount(systemTokens)} cached`);
	}
	if (contextTokens && contextTokens > 0) {
		parts.push(`context: ${formatTokenCount(contextTokens)}`);
	}
	parts.push(`content: ${formatTokenCount(contentTokens)}`);

	return `${formatTokenCount(total)} tokens (${parts.join(', ')})`;
}
