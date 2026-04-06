/**
 * Web Search Verification
 *
 * Verifies claims flagged as "False" or "Unverified" using Claude's web search tool.
 * This reduces false positives by checking if there's actual coverage of the topic
 * before marking something as unsubstantiated.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import type { FactCheckFinding } from '$lib/goodFaith/types';
import type { TokenUsage } from '../types';

/**
 * Web search tool type for Claude API
 */
const WEB_SEARCH_TOOL: Anthropic.Messages.WebSearchTool20250305 = {
	type: 'web_search_20250305',
	name: 'web_search',
	max_uses: 3 // Limit searches per claim to control costs
};

/**
 * Result of verifying a single claim
 */
export interface VerificationResult {
	originalClaim: FactCheckFinding;
	updatedClaim: FactCheckFinding;
	searchPerformed: boolean;
	searchFoundRelevantResults: boolean;
	searchSummary?: string;
}

/**
 * Result of the full verification pass
 */
export interface WebSearchVerificationResult {
	verifiedFindings: FactCheckFinding[];
	verificationsPerformed: number;
	claimsUpdated: number;
	usage: TokenUsage;
}

/**
 * Configuration for web search verification
 */
export interface WebSearchVerificationConfig {
	/** Whether web search verification is enabled */
	enabled: boolean;
	/** Maximum number of claims to verify per analysis (to control costs) */
	maxClaimsToVerify: number;
	/** Domains to allow for searches (optional) */
	allowedDomains?: string[];
	/** Domains to block from searches (optional) */
	blockedDomains?: string[];
}

export const DEFAULT_VERIFICATION_CONFIG: WebSearchVerificationConfig = {
	enabled: true,
	maxClaimsToVerify: 5
};

/**
 * Verdicts that should trigger web search verification
 */
const VERDICTS_TO_VERIFY: FactCheckFinding['verdict'][] = ['False', 'Unverified'];

/**
 * Run web search verification on fact-checking findings.
 * Only verifies claims with "False" or "Unverified" verdicts.
 */
export async function runWebSearchVerification(
	factCheckFindings: FactCheckFinding[],
	config: WebSearchVerificationConfig,
	anthropic: Anthropic
): Promise<WebSearchVerificationResult> {
	const startTime = Date.now();

	// If disabled or no findings, return as-is
	if (!config.enabled || factCheckFindings.length === 0) {
		logger.info('[WebSearch] Verification disabled or no findings to verify');
		return {
			verifiedFindings: factCheckFindings,
			verificationsPerformed: 0,
			claimsUpdated: 0,
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
		};
	}

	// Find claims that need verification
	const claimsToVerify = factCheckFindings.filter((f) => VERDICTS_TO_VERIFY.includes(f.verdict));

	if (claimsToVerify.length === 0) {
		logger.info('[WebSearch] No claims need verification (no False/Unverified verdicts)');
		return {
			verifiedFindings: factCheckFindings,
			verificationsPerformed: 0,
			claimsUpdated: 0,
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
		};
	}

	// Limit the number of claims to verify
	const limitedClaims = claimsToVerify.slice(0, config.maxClaimsToVerify);
	logger.info(
		`[WebSearch] Verifying ${limitedClaims.length} of ${claimsToVerify.length} flagged claims`
	);

	// Track usage across all verifications
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let claimsUpdated = 0;

	// Create a map of original claims to updated claims
	const updatedClaimsMap = new Map<string, FactCheckFinding>();

	// Verify each claim
	for (const claim of limitedClaims) {
		try {
			const result = await verifySingleClaim(claim, config, anthropic);
			totalInputTokens += result.usage.inputTokens;
			totalOutputTokens += result.usage.outputTokens;

			if (result.wasUpdated) {
				claimsUpdated++;
				updatedClaimsMap.set(claim.claim, result.updatedClaim);
				logger.info(
					`[WebSearch] Updated claim verdict: "${claim.claim.substring(0, 50)}..." - ${claim.verdict} → ${result.updatedClaim.verdict}`
				);
			}
		} catch (error) {
			logger.error(`[WebSearch] Error verifying claim: ${error}`);
			// Keep original claim on error
		}
	}

	// Merge updated claims back into the full list
	const verifiedFindings = factCheckFindings.map((f) => updatedClaimsMap.get(f.claim) || f);

	logger.info(
		`[WebSearch] Verification complete in ${Date.now() - startTime}ms - ` +
			`${limitedClaims.length} verified, ${claimsUpdated} updated`
	);

	return {
		verifiedFindings,
		verificationsPerformed: limitedClaims.length,
		claimsUpdated,
		usage: {
			inputTokens: totalInputTokens,
			outputTokens: totalOutputTokens,
			totalTokens: totalInputTokens + totalOutputTokens
		}
	};
}

/**
 * Result of verifying a single claim
 */
interface SingleClaimVerificationResult {
	updatedClaim: FactCheckFinding;
	wasUpdated: boolean;
	usage: TokenUsage;
}

/**
 * Verify a single claim using web search
 */
async function verifySingleClaim(
	claim: FactCheckFinding,
	config: WebSearchVerificationConfig,
	anthropic: Anthropic
): Promise<SingleClaimVerificationResult> {
	logger.debug(`[WebSearch] Verifying: "${claim.claim.substring(0, 100)}..."`);

	// Build the web search tool configuration
	const webSearchTool: Anthropic.Messages.WebSearchTool20250305 = {
		type: 'web_search_20250305',
		name: 'web_search',
		max_uses: 3
	};

	// Add domain restrictions if configured
	if (config.allowedDomains && config.allowedDomains.length > 0) {
		webSearchTool.allowed_domains = config.allowedDomains;
	} else if (config.blockedDomains && config.blockedDomains.length > 0) {
		webSearchTool.blocked_domains = config.blockedDomains;
	}

	const systemPrompt = `You are a fact-checker verifying claims. Your task is to search the web to determine if there is credible coverage or evidence related to a claim that was initially flagged as "${claim.verdict}".

Your goal is NOT to definitively prove or disprove the claim, but to determine if:
1. There is legitimate news coverage or discussion of this topic
2. The claim references real events, people, or situations that exist
3. There are credible sources that support or contradict the claim

After searching, you must provide a brief assessment.`;

	const userMessage = `Please search the web to verify this claim that was flagged as "${claim.verdict}":

Claim: "${claim.claim}"
${claim.relevance ? `Context: ${claim.relevance}` : ''}

Search for credible sources covering this topic. After searching, provide your assessment in this exact format:

VERDICT: [True/False/Misleading/Unverified/Needs Context]
CONFIDENCE: [High/Medium/Low]
SUMMARY: [1-2 sentence summary of what you found]
SOURCES: [List any relevant sources found, or "None found" if no relevant results]`;

	try {
		const response = await anthropic.messages.create({
			model: 'claude-sonnet-4-5-20250929', // Use Sonnet for verification
			max_tokens: 1024,
			system: systemPrompt,
			tools: [webSearchTool],
			messages: [{ role: 'user', content: userMessage }]
		});

		const usage: TokenUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
			totalTokens: response.usage.input_tokens + response.usage.output_tokens
		};

		// Extract text response
		const textContent = response.content
			.filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
			.map((block) => block.text)
			.join('\n');

		// Extract citations if available
		const citedSources = extractCitationsFromResponse(response);

		// Parse the verification response
		const verification = parseVerificationResponse(textContent, citedSources);

		// Determine if we should update the claim
		const shouldUpdate = shouldUpdateVerdict(claim.verdict, verification);

		if (shouldUpdate) {
			const updatedClaim: FactCheckFinding = {
				claim: claim.claim,
				verdict: verification.verdict as FactCheckFinding['verdict'],
				relevance:
					`${claim.relevance || ''} [Web search verification: ${verification.summary}]`.trim(),
				source:
					verification.sources.length > 0
						? { name: verification.sources[0].title, url: verification.sources[0].url }
						: claim.source
			};

			return { updatedClaim, wasUpdated: true, usage };
		}

		return { updatedClaim: claim, wasUpdated: false, usage };
	} catch (error) {
		logger.error(`[WebSearch] API error during verification: ${error}`);
		throw error;
	}
}

/**
 * Extract citations from Claude's web search response
 */
interface CitedSource {
	url: string;
	title: string;
}

function extractCitationsFromResponse(response: Anthropic.Messages.Message): CitedSource[] {
	const sources: CitedSource[] = [];

	for (const block of response.content) {
		// Check for web search results
		if (block.type === 'web_search_tool_result') {
			const resultBlock = block as Anthropic.Messages.WebSearchToolResultBlock;
			if (Array.isArray(resultBlock.content)) {
				for (const result of resultBlock.content) {
					if (result.type === 'web_search_result') {
						sources.push({
							url: result.url,
							title: result.title
						});
					}
				}
			}
		}

		// Check for citations in text blocks
		if (block.type === 'text' && 'citations' in block) {
			const textBlock = block as Anthropic.Messages.TextBlock & {
				citations?: Array<{ url?: string; title?: string }>;
			};
			if (Array.isArray(textBlock.citations)) {
				for (const citation of textBlock.citations) {
					if (citation.url && citation.title) {
						sources.push({
							url: citation.url,
							title: citation.title
						});
					}
				}
			}
		}
	}

	// Deduplicate by URL
	const uniqueSources = new Map<string, CitedSource>();
	for (const source of sources) {
		if (!uniqueSources.has(source.url)) {
			uniqueSources.set(source.url, source);
		}
	}

	return Array.from(uniqueSources.values());
}

/**
 * Parsed verification response
 */
interface ParsedVerification {
	verdict: string;
	confidence: string;
	summary: string;
	sources: CitedSource[];
}

/**
 * Parse Claude's verification response
 */
function parseVerificationResponse(text: string, citedSources: CitedSource[]): ParsedVerification {
	const verdictMatch = text.match(/VERDICT:\s*(.+)/i);
	const confidenceMatch = text.match(/CONFIDENCE:\s*(.+)/i);
	const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);

	// Normalize verdict to our expected values
	let verdict = verdictMatch?.[1]?.trim() || 'Unverified';

	// Map "Needs Context" to "Misleading" as it's the closest match
	if (verdict.toLowerCase().includes('needs context')) {
		verdict = 'Misleading';
	}

	// Ensure verdict is one of our valid values
	const validVerdicts = ['True', 'False', 'Misleading', 'Unverified'];
	if (!validVerdicts.includes(verdict)) {
		// Try to match partial
		const lower = verdict.toLowerCase();
		if (lower.includes('true')) verdict = 'True';
		else if (lower.includes('false')) verdict = 'False';
		else if (lower.includes('misleading')) verdict = 'Misleading';
		else verdict = 'Unverified';
	}

	return {
		verdict,
		confidence: confidenceMatch?.[1]?.trim() || 'Low',
		summary: summaryMatch?.[1]?.trim() || 'Unable to verify with web search',
		sources: citedSources
	};
}

/**
 * Determine if we should update the verdict based on verification results
 */
function shouldUpdateVerdict(
	originalVerdict: FactCheckFinding['verdict'],
	verification: ParsedVerification
): boolean {
	// If we found relevant sources and the original was False/Unverified,
	// we should update if the verification suggests otherwise
	if (verification.sources.length > 0) {
		// Found sources - likely there IS coverage of this topic
		if (originalVerdict === 'False' && verification.verdict !== 'False') {
			return true;
		}
		if (originalVerdict === 'Unverified' && verification.verdict !== 'Unverified') {
			return true;
		}
	}

	// Also update if high confidence verification contradicts original
	if (verification.confidence === 'High' && verification.verdict !== originalVerdict) {
		return true;
	}

	return false;
}

/**
 * Check if web search is available for the given API key
 * (Web search must be enabled in the Anthropic Console)
 */
export async function isWebSearchAvailable(anthropic: Anthropic): Promise<boolean> {
	try {
		// Make a minimal test request with web search tool
		const response = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 50,
			tools: [WEB_SEARCH_TOOL],
			messages: [{ role: 'user', content: 'Test - do not search, just say "ok"' }]
		});

		// If we get here without error, web search is available
		return true;
	} catch (error) {
		if (error instanceof Anthropic.APIError) {
			// Check if the error is specifically about web search not being enabled
			const message = error.message.toLowerCase();
			if (
				message.includes('web_search') ||
				message.includes('tool') ||
				message.includes('not enabled')
			) {
				logger.warn('[WebSearch] Web search tool is not enabled for this API key');
				return false;
			}
		}
		// Other errors might be transient, assume available
		logger.warn(`[WebSearch] Error checking availability: ${error}`);
		return true;
	}
}
