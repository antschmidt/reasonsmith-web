/**
 * Heuristic fallback scoring for when AI providers fail
 * This provides basic analysis without requiring API calls
 */

import type { GoodFaithResult, Claim } from './types';
import { getLabel } from './response';

/**
 * Patterns that indicate positive engagement
 */
const POSITIVE_PATTERNS = [
	/\b(thank|appreciate|agree|valid point|good point|fair point)\b/i,
	/\b(evidence|source|reference|citation|study|research)\b/i,
	/\b(I understand|I see your point|you might be right|that's fair)\b/i,
	/\b(however|although|on the other hand|that said)\b/i,
	/\b(in my opinion|I think|I believe|it seems to me)\b/i
];

/**
 * Patterns that indicate negative engagement
 */
const NEGATIVE_PATTERNS = [
	/\b(idiot|stupid|hate|moron|trash|garbage|dumb|ignorant)\b/i,
	/\b(always|never|all|none|everyone|no one)\b/i, // Absolute statements
	/\b(obviously|clearly|everyone knows|it's obvious)\b/i, // Thought-terminating
	/\b(you people|those people|your kind|their kind)\b/i, // Tribal signaling
	/\b(wake up|sheeple|brainwashed|sheep)\b/i, // Dismissive/cultish
	/\b(fake news|lies|propaganda|agenda)\b/i // Dismissive without evidence
];

/**
 * Patterns that indicate manipulative language
 */
const MANIPULATIVE_PATTERNS = [
	{ pattern: /\bsheeple\b/i, phrase: 'sheeple' },
	{ pattern: /\bwake up\b/i, phrase: 'wake up' },
	{ pattern: /\beveryone knows\b/i, phrase: 'everyone knows' },
	{ pattern: /\bit's obvious\b/i, phrase: "it's obvious" },
	{ pattern: /\breal americans?\b/i, phrase: 'real American(s)' },
	{ pattern: /\btrue (patriots?|believers?)\b/i, phrase: 'true patriot/believer' },
	{ pattern: /\bfake news\b/i, phrase: 'fake news' },
	{ pattern: /\bthe elite\b/i, phrase: 'the elite' },
	{ pattern: /\bthey don't want you to know\b/i, phrase: "they don't want you to know" }
];

/**
 * Common fallacy patterns
 */
const FALLACY_PATTERNS = [
	{ pattern: /\byou're (just |an? )?(idiot|stupid|moron)\b/i, fallacy: 'Ad Hominem' },
	{ pattern: /\bwhat about\b/i, fallacy: 'Whataboutism' },
	{ pattern: /\bslippery slope\b/i, fallacy: 'Slippery Slope' },
	{ pattern: /\bif you don't .+ then you\b/i, fallacy: 'False Dichotomy' },
	{ pattern: /\beveryone (knows|agrees|says)\b/i, fallacy: 'Appeal to Popularity' },
	{ pattern: /\b(expert|scientist|doctor)s? (say|agree|believe)\b/i, fallacy: 'Appeal to Authority' }
];

/**
 * Perform heuristic analysis on content
 */
export function heuristicScore(content: string): GoodFaithResult {
	const lower = content.toLowerCase();
	let score = 50; // Start at neutral (0-100 scale)

	// Apply positive patterns
	POSITIVE_PATTERNS.forEach((pattern) => {
		if (pattern.test(content)) {
			score += 8;
		}
	});

	// Apply negative patterns
	NEGATIVE_PATTERNS.forEach((pattern) => {
		if (pattern.test(content)) {
			score -= 12;
		}
	});

	// Detect manipulative phrases
	const cultishPhrases: string[] = [];
	MANIPULATIVE_PATTERNS.forEach(({ pattern, phrase }) => {
		if (pattern.test(content)) {
			cultishPhrases.push(phrase);
			score -= 5;
		}
	});

	// Detect fallacies
	const detectedFallacies: string[] = [];
	FALLACY_PATTERNS.forEach(({ pattern, fallacy }) => {
		if (pattern.test(content)) {
			detectedFallacies.push(fallacy);
			score -= 8;
		}
	});

	// Length-based adjustments
	if (content.length < 50) {
		score -= 5; // Very short responses often lack substance
	} else if (content.length > 500) {
		score += 5; // Longer, more detailed responses
	}

	// Check for excessive punctuation (shouting)
	const exclamationCount = (content.match(/!/g) || []).length;
	const capsRatio =
		(content.match(/[A-Z]/g) || []).length / Math.max(content.length, 1);

	if (exclamationCount > 3) score -= 5;
	if (capsRatio > 0.5 && content.length > 20) score -= 10; // Excessive caps

	// Clamp score to valid range
	score = Math.max(0, Math.min(100, score));

	// Create a basic claim structure
	const claims: Claim[] = [
		{
			claim: content.length > 100 ? content.substring(0, 100) + '...' : content,
			supportingArguments: [
				{
					argument: 'Heuristic analysis of overall content',
					score: Math.round(score / 10), // Convert to 1-10 scale
					fallacies: detectedFallacies,
					improvements:
						score < 40
							? 'Consider providing evidence for claims and avoiding personal attacks.'
							: score < 60
								? 'Adding specific examples or sources would strengthen this argument.'
								: 'Continue engaging constructively with evidence-based reasoning.'
				}
			]
		}
	];

	const normalizedScore = score / 100;

	return {
		// Core scoring
		good_faith_score: normalizedScore,
		good_faith_label: getLabel(normalizedScore),

		// Detailed analysis
		claims,
		fallacyOverload: detectedFallacies.length >= 3,
		cultishPhrases,
		summary: generateHeuristicSummary(score, detectedFallacies, cultishPhrases),
		rationale: generateHeuristicSummary(score, detectedFallacies, cultishPhrases),
		tags: extractBasicTags(content),

		// Growth metrics (not available in heuristic mode)
		steelmanScore: undefined,
		steelmanNotes: undefined,
		understandingScore: undefined,
		intellectualHumilityScore: undefined,
		relevanceScore: undefined,
		relevanceNotes: undefined,

		// Metadata
		provider: 'heuristic',
		usedAI: false,

		// Legacy compatibility
		goodFaithScore: score,
		goodFaithDescriptor: getLabel(normalizedScore),
		overallAnalysis: generateHeuristicSummary(score, detectedFallacies, cultishPhrases)
	};
}

/**
 * Generate a summary for heuristic analysis
 */
function generateHeuristicSummary(
	score: number,
	fallacies: string[],
	manipulativeLanguage: string[]
): string {
	const parts: string[] = [];

	if (score >= 70) {
		parts.push('This content appears to engage constructively.');
	} else if (score >= 50) {
		parts.push('This content shows mixed quality of engagement.');
	} else if (score >= 30) {
		parts.push('This content shows concerning patterns of engagement.');
	} else {
		parts.push('This content exhibits significant issues with good faith engagement.');
	}

	if (fallacies.length > 0) {
		parts.push(`Potential logical issues detected: ${fallacies.join(', ')}.`);
	}

	if (manipulativeLanguage.length > 0) {
		parts.push(`Loaded or manipulative language detected: ${manipulativeLanguage.join(', ')}.`);
	}

	parts.push(
		'Note: This is a heuristic analysis. AI-powered analysis provides more detailed insights.'
	);

	return parts.join(' ');
}

/**
 * Extract basic topic tags using keyword detection
 */
function extractBasicTags(content: string): string[] {
	const tags: string[] = [];
	const lower = content.toLowerCase();

	// Common topic patterns
	const topicPatterns: { pattern: RegExp; tag: string }[] = [
		{ pattern: /\b(politic|democrat|republican|congress|senate)\b/i, tag: 'politics' },
		{ pattern: /\b(econom|market|inflation|gdp|trade)\b/i, tag: 'economics' },
		{ pattern: /\b(climat|environment|carbon|emission)\b/i, tag: 'climate' },
		{ pattern: /\b(health|medical|doctor|hospital|vaccine)\b/i, tag: 'health' },
		{ pattern: /\b(tech|software|ai|computer|digital)\b/i, tag: 'technology' },
		{ pattern: /\b(education|school|university|student)\b/i, tag: 'education' },
		{ pattern: /\b(foreign|international|diplomacy|treaty)\b/i, tag: 'foreign-policy' },
		{ pattern: /\b(military|war|defense|army|navy)\b/i, tag: 'military' },
		{ pattern: /\b(immigra|border|asylum|refugee)\b/i, tag: 'immigration' },
		{ pattern: /\b(crime|police|law enforcement|prison)\b/i, tag: 'criminal-justice' }
	];

	topicPatterns.forEach(({ pattern, tag }) => {
		if (pattern.test(lower) && !tags.includes(tag)) {
			tags.push(tag);
		}
	});

	// Limit to 5 tags
	return tags.slice(0, 5);
}
