/**
 * Cost Estimation Utilities
 *
 * Calculates estimated costs for multi-pass analysis based on
 * token usage and model pricing.
 */

import type { MultiPassTokenUsage, MultiPassModels, TokenUsage } from '../types';

/**
 * Model pricing in dollars per million tokens
 * Prices as of January 2025
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	// Haiku 4.5
	'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
	'claude-haiku-4-5': { input: 1.0, output: 5.0 },

	// Sonnet 4.5
	'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
	'claude-sonnet-4-5': { input: 3.0, output: 15.0 },

	// Opus 4.5
	'claude-opus-4-5-20251101': { input: 5.0, output: 25.0 },
	'claude-opus-4-5': { input: 5.0, output: 25.0 },

	// Legacy models (fallback)
	'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
	'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
	'claude-3-opus-20240229': { input: 15.0, output: 75.0 }
};

/**
 * Cache pricing discount (tokens read from cache cost 90% less)
 */
export const CACHE_DISCOUNT = 0.1;

/**
 * Calculate cost for a single pass in cents
 */
export function calculatePassCost(usage: TokenUsage, model: string): number {
	const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-5'];

	// Base cost
	let inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
	let outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

	// Apply cache discount for cached tokens
	if (usage.cacheReadTokens && usage.cacheReadTokens > 0) {
		// Cached tokens cost 90% less
		const cachedInputCost = (usage.cacheReadTokens / 1_000_000) * pricing.input * CACHE_DISCOUNT;
		const regularInputTokens = usage.inputTokens - usage.cacheReadTokens;
		inputCost = (regularInputTokens / 1_000_000) * pricing.input + cachedInputCost;
	}

	// Convert to cents
	return (inputCost + outputCost) * 100;
}

/**
 * Calculate total cost for multi-pass analysis in cents
 */
export function calculateCost(usage: MultiPassTokenUsage, models: MultiPassModels): number {
	// Pass 1: Extraction (Haiku)
	const pass1Cost = calculatePassCost(usage.pass1, models.extraction);

	// Pass 2: Individual claim analyses (mixed models)
	// For simplicity, assume average of Sonnet pricing
	// In practice, we'd need to track which model was used for each claim
	const pass2Cost = usage.pass2.reduce((sum, u) => {
		// Assume Sonnet as average (most claims will use Sonnet)
		return sum + calculatePassCost(u, models.moderate);
	}, 0);

	// Pass 3: Synthesis (Sonnet)
	const pass3Cost = calculatePassCost(usage.pass3, models.synthesis);

	return pass1Cost + pass2Cost + pass3Cost;
}

/**
 * Estimate cost before running analysis
 */
export function estimateCost(
	contentLength: number,
	estimatedClaims: number,
	models: MultiPassModels
): {
	estimated: number;
	breakdown: {
		pass1: number;
		pass2: number;
		pass3: number;
	};
	assumptions: string[];
} {
	// Rough token estimates based on content length
	// ~4 characters per token on average
	const contentTokens = Math.ceil(contentLength / 4);

	// Pass 1: System prompt (~2000 tokens) + content
	const pass1Input = 2000 + contentTokens;
	const pass1Output = Math.min(500 + estimatedClaims * 100, 2000);
	const pass1Cost = calculatePassCost(
		{ inputTokens: pass1Input, outputTokens: pass1Output, totalTokens: pass1Input + pass1Output },
		models.extraction
	);

	// Pass 2: For each claim
	// System prompt (~1500) + content (~contentTokens) + claim context (~200)
	const pass2InputPerClaim = 1500 + contentTokens + 200;
	const pass2OutputPerClaim = 400;
	const pass2CostPerClaim = calculatePassCost(
		{
			inputTokens: pass2InputPerClaim,
			outputTokens: pass2OutputPerClaim,
			totalTokens: pass2InputPerClaim + pass2OutputPerClaim
		},
		models.moderate // Assume average complexity
	);
	const pass2Cost = pass2CostPerClaim * estimatedClaims;

	// Pass 3: System prompt (~1500) + content + all claim analyses
	const pass3Input = 1500 + contentTokens + estimatedClaims * 300;
	const pass3Output = 800 + estimatedClaims * 50;
	const pass3Cost = calculatePassCost(
		{ inputTokens: pass3Input, outputTokens: pass3Output, totalTokens: pass3Input + pass3Output },
		models.synthesis
	);

	return {
		estimated: pass1Cost + pass2Cost + pass3Cost,
		breakdown: {
			pass1: pass1Cost,
			pass2: pass2Cost,
			pass3: pass3Cost
		},
		assumptions: [
			`Content length: ${contentLength} chars (~${contentTokens} tokens)`,
			`Estimated claims: ${estimatedClaims}`,
			`Assumes average complexity (Sonnet) for claim analysis`,
			`Does not account for cache hits`
		]
	};
}

/**
 * Format cost for display
 */
export function formatCost(costInCents: number): string {
	if (costInCents < 1) {
		return `<1¢`;
	}
	if (costInCents < 10) {
		return `${costInCents.toFixed(1)}¢`;
	}
	return `${Math.round(costInCents)}¢`;
}

/**
 * Check if estimated cost exceeds budget
 */
export function isWithinBudget(
	estimatedCost: number,
	budgetCents: number = 10 // Default 10¢ budget
): boolean {
	return estimatedCost <= budgetCents;
}
