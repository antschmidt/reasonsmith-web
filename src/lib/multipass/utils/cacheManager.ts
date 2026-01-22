/**
 * Cache Manager Utilities
 *
 * Manages prompt caching for multi-pass analysis to reduce token costs.
 */

import type { AnalysisContext } from '../types';

/**
 * Supported cache TTL values
 */
export type CacheTTL = 'off' | '5m' | '1h';

/**
 * Build a cacheable system prompt block
 */
export function buildCacheableSystemPrompt(
	systemPrompt: string,
	cacheTTL: CacheTTL
): string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl: string } }> {
	if (cacheTTL === 'off') {
		return systemPrompt;
	}

	return [
		{
			type: 'text' as const,
			text: systemPrompt,
			cache_control: { type: 'ephemeral' as const, ttl: cacheTTL }
		}
	];
}

/**
 * Build a user message with cacheable context
 */
export function buildCacheableUserMessage(
	content: string,
	context: AnalysisContext,
	cacheTTL: CacheTTL
): string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl: string } }> {
	if (cacheTTL === 'off') {
		return buildContextualUserMessage(content, context);
	}

	const contextSection = buildContextSection(context);
	const parts: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl: string } }> = [];

	// Cache the context section if substantial
	if (contextSection.length > 200) {
		parts.push({
			type: 'text',
			text: contextSection,
			cache_control: { type: 'ephemeral', ttl: cacheTTL }
		});
	}

	// Cache the original content (reused across all Pass 2 analyses)
	parts.push({
		type: 'text',
		text: `\n\nCONTENT TO ANALYZE:\n\n${content}`,
		cache_control: { type: 'ephemeral', ttl: cacheTTL }
	});

	return parts;
}

/**
 * Build context section from analysis context
 */
export function buildContextSection(context: AnalysisContext): string {
	const sections: string[] = [];

	if (context.discussion?.title) {
		sections.push(`## Discussion Context`);
		sections.push(`Title: ${context.discussion.title}`);
		if (context.discussion.description) {
			sections.push(`Description: ${context.discussion.description}`);
		}
	}

	if (context.citations && context.citations.length > 0) {
		sections.push(`\n## Citations Provided`);
		for (const citation of context.citations) {
			let citationText = `- ${citation.title || 'Untitled'}`;
			if (citation.url) citationText += ` (${citation.url})`;
			if (citation.author) citationText += ` by ${citation.author}`;
			sections.push(citationText);
			if (citation.relevantQuote) {
				sections.push(`  Quote: "${citation.relevantQuote}"`);
			}
		}
	}

	if (context.selectedComments && context.selectedComments.length > 0) {
		sections.push(`\n## Comments Being Responded To`);
		for (const comment of context.selectedComments) {
			sections.push(`- ${comment.author}: "${comment.content.substring(0, 200)}..."`);
		}
	}

	if (context.showcaseContext) {
		sections.push(`\n## Featured Analysis Context`);
		sections.push(`Title: ${context.showcaseContext.title}`);
		if (context.showcaseContext.subtitle) {
			sections.push(`Subtitle: ${context.showcaseContext.subtitle}`);
		}
		if (context.showcaseContext.summary) {
			sections.push(`Summary: ${context.showcaseContext.summary}`);
		}
	}

	return sections.join('\n');
}

/**
 * Build a plain user message with context (non-cached)
 */
function buildContextualUserMessage(content: string, context: AnalysisContext): string {
	const contextSection = buildContextSection(context);

	if (contextSection) {
		return `${contextSection}\n\n---\n\nCONTENT TO ANALYZE:\n\n${content}`;
	}

	return content;
}

/**
 * Calculate potential cache savings
 */
export function estimateCacheSavings(
	claimCount: number,
	contentTokens: number,
	contextTokens: number
): {
	withoutCache: number;
	withCache: number;
	savings: number;
	savingsPercent: number;
} {
	// Without cache: full content + context sent for each claim
	const tokensPerClaim = contentTokens + contextTokens + 200; // 200 for claim-specific
	const withoutCache = tokensPerClaim * claimCount;

	// With cache: content + context cached, only claim-specific sent
	const cachedTokens = contentTokens + contextTokens;
	const uncachedPerClaim = 200;
	// Cached tokens cost 10% of normal
	const withCache = cachedTokens * 0.1 * claimCount + uncachedPerClaim * claimCount;

	const savings = withoutCache - withCache;
	const savingsPercent = (savings / withoutCache) * 100;

	return {
		withoutCache,
		withCache,
		savings,
		savingsPercent
	};
}

/**
 * Determine optimal cache TTL based on analysis characteristics
 */
export function suggestCacheTTL(
	claimCount: number,
	isFeatured: boolean
): CacheTTL {
	// Featured analyses may take longer, use longer TTL
	if (isFeatured) {
		return '1h';
	}

	// Many claims benefit more from caching
	if (claimCount >= 5) {
		return '5m';
	}

	// Few claims, caching overhead may not be worth it
	if (claimCount <= 2) {
		return 'off';
	}

	return '5m';
}
