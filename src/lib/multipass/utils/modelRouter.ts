/**
 * Model Router Utilities
 *
 * Routes claims to appropriate models based on complexity and confidence.
 */

import type { ExtractedClaim, MultiPassConfig, ClaimComplexity } from '../types';

/**
 * Model tiers for routing
 */
export const MODEL_TIERS: Record<ClaimComplexity, number> = {
	simple: 1,
	moderate: 2,
	complex: 3
};

/**
 * Get the next tier up for escalation
 */
export function getEscalatedComplexity(complexity: ClaimComplexity): ClaimComplexity {
	switch (complexity) {
		case 'simple':
			return 'moderate';
		case 'moderate':
			return 'complex';
		case 'complex':
			return 'complex'; // Already at highest tier
	}
}

/**
 * Determine the model to use for a claim
 */
export function routeClaimToModel(
	claim: ExtractedClaim,
	config: MultiPassConfig
): {
	model: string;
	escalated: boolean;
	reason: string;
} {
	const { complexity, complexityConfidence } = claim;

	// Check if we need to escalate due to low confidence
	if (complexityConfidence < config.complexityConfidenceThreshold) {
		const escalatedComplexity = getEscalatedComplexity(complexity);

		if (escalatedComplexity !== complexity) {
			return {
				model: config.models[escalatedComplexity],
				escalated: true,
				reason: `Low confidence (${complexityConfidence.toFixed(2)}) in ${complexity} classification, escalating to ${escalatedComplexity}`
			};
		}
	}

	return {
		model: config.models[complexity],
		escalated: false,
		reason: `${complexity} complexity with ${complexityConfidence.toFixed(2)} confidence`
	};
}

/**
 * Calculate routing statistics for a set of claims
 */
export function calculateRoutingStats(
	claims: ExtractedClaim[],
	config: MultiPassConfig
): {
	byComplexity: Record<ClaimComplexity, number>;
	byModel: Record<string, number>;
	escalatedCount: number;
	estimatedCostMultiplier: number;
} {
	const byComplexity: Record<ClaimComplexity, number> = {
		simple: 0,
		moderate: 0,
		complex: 0
	};

	const byModel: Record<string, number> = {};
	let escalatedCount = 0;

	for (const claim of claims) {
		byComplexity[claim.complexity]++;

		const { model, escalated } = routeClaimToModel(claim, config);
		byModel[model] = (byModel[model] || 0) + 1;

		if (escalated) {
			escalatedCount++;
		}
	}

	// Calculate cost multiplier based on model distribution
	// Haiku = 1x, Sonnet = 3x, Opus = 15x (relative to Haiku)
	const modelWeights: Record<string, number> = {
		[config.models.simple]: 3, // Sonnet
		[config.models.moderate]: 3, // Sonnet
		[config.models.complex]: 15 // Opus
	};

	let totalWeight = 0;
	for (const [model, count] of Object.entries(byModel)) {
		totalWeight += (modelWeights[model] || 3) * count;
	}

	const baselineWeight = claims.length * 3; // If all used Sonnet
	const estimatedCostMultiplier = claims.length > 0 ? totalWeight / baselineWeight : 1;

	return {
		byComplexity,
		byModel,
		escalatedCount,
		estimatedCostMultiplier
	};
}

/**
 * Suggest optimal batch sizes for parallel processing
 */
export function suggestBatchSize(
	claimCount: number,
	options?: {
		maxConcurrent?: number;
		preferredBatchSize?: number;
	}
): {
	batchSize: number;
	batchCount: number;
	reason: string;
} {
	const maxConcurrent = options?.maxConcurrent ?? 10;
	const preferredBatchSize = options?.preferredBatchSize ?? 5;

	// For small numbers, process all at once
	if (claimCount <= maxConcurrent) {
		return {
			batchSize: claimCount,
			batchCount: 1,
			reason: `Processing all ${claimCount} claims in parallel`
		};
	}

	// For larger numbers, use preferred batch size
	const batchSize = Math.min(preferredBatchSize, maxConcurrent);
	const batchCount = Math.ceil(claimCount / batchSize);

	return {
		batchSize,
		batchCount,
		reason: `Processing ${claimCount} claims in ${batchCount} batches of ${batchSize}`
	};
}
