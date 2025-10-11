import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { print } from 'graphql';
import { INCREMENT_ANALYSIS_USAGE, INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';
import { checkAndResetMonthlyCredits, getMonthlyCreditsRemaining } from '$lib/creditUtils';
import { logger } from '$lib/logger';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

interface ClaudeClaimArgument {
	argument: string;
	score: number; // 1-10
	fallacies: string[];
	improvements: string;
}

interface ClaudeClaim {
	claim: string;
	supportingArguments: ClaudeClaimArgument[];
}

interface ClaudeScoreResponse {
	claims: ClaudeClaim[];
	fallacyOverload: boolean;
	goodFaithScore: number; // 0-100
	cultishPhrases: string[];
	overallAnalysis: string;
	tags?: string[]; // Topic tags extracted from claims

	// Legacy fields for backward compatibility
	good_faith_score?: number;
	good_faith_label?: string;
	rationale?: string;

	// Flag to indicate if this used Claude or fell back to heuristic
	usedClaude?: boolean;
}

function getLabel(score: number): string {
	if (score >= 0.8) return 'exemplary';
	if (score >= 0.6) return 'constructive';
	if (score >= 0.4) return 'neutral';
	if (score >= 0.2) return 'questionable';
	return 'hostile';
}

async function analyzeWithClaude(content: string): Promise<ClaudeScoreResponse> {
	try {
		logger.info('Starting Claude API call...');

		if (!process.env.ANTHROPIC_API_KEY) {
			throw new Error('ANTHROPIC_API_KEY not set');
		}

		const msg = await anthropic.messages.create({
			model: 'claude-sonnet-4-5-20250929',
			max_tokens: 20000,
			temperature: 0.2,
			system:
				'You are a meticulous analyst specializing in logic, rhetoric, and critical discourse analysis. Your expertise lies in dissecting arguments to identify their structure, validity, and intent.\n\nYour task is to analyze the provided text for logical fallacies, manipulative rhetoric, and indicators of good or bad faith argumentation. You will then synthesize your findings into a single, valid JSON object.\n\n**Critical Rule: Differentiating Author vs. Quote**\nBefore analysis, you MUST distinguish between the author\'s original text and any text they are quoting.\n* Quoted text is often indicated by markdown `>` characters, quotation marks (`""`), or phrases like "You wrote:".\n* **Do not attribute the fallacies or claims within the quoted text to the author.** Analyze ONLY the author\'s original response. The quoted text serves as the context for the author\'s claims, not as part of their argument.\n\n**Execution Process:**\n1.  **Isolate & Deconstruct:** First, identify and separate any quoted text from the author\'s original statements. Then, deconstruct the **author\'s statements** into every distinct claim they are making.\n2.  **Map Arguments:** For each of the author\'s claims, identify their supporting arguments or note their absence.\n3.  **Analyze & Score:** Evaluate each of the author\'s arguments against the `Analytical Framework` below. Assign a score based on the `Scoring Rubric`.\n4.  **Synthesize:** After analyzing all of the author\'s arguments, calculate the aggregate scores (`fallacyOverload`, `goodFaithScore`) and write the `overallAnalysis`.\n5.  **Generate Tags:** Extract 3-5 topic tags that represent the main subject areas discussed in the content. Use lowercase, hyphenated format (e.g., "political-discourse", "climate-change", "economic-policy").\n6.  **Construct JSON:** Assemble the final JSON object. Your output must *only* be this JSON object.\n\n---\n\n### **Analytical Framework**\n\n**1. Logical Fallacies to Identify:**\n* Unsubstantiated Claim, Ad Hominem, Straw Man, False Dichotomy, Hasty Generalization, Appeal to Fear.\n\n**2. Manipulative Language to Identify:**\n* Emotionally Loaded Terms, Us-vs-Them Framing, Thought-Terminating Clichés, Dehumanizing Language, Absolute Statements.\n\n**3. Handling Compound Arguments:**\n* Recognize that a single argument may contain both a fallacy and a substantive point (e.g., "That\'s wrong, you\'re a shill! The data from the CBO says otherwise."). Identify the "Ad Hominem" fallacy, but score the argument based on the merit of the substantive point. The `improvements` suggestion should focus on removing the fallacious part.\n\n---\n\n### **Output Requirements**\n\n**CRITICAL: You must return EXACTLY this JSON structure. Do not add extra fields like \'label\', \'score\', \'rationale\', \'provider\', \'analyzedAt\', etc. The field names and types must match exactly as shown below.**\n\nReturn **ONLY** a valid JSON object with this exact structure:\n\n{\n  "claims": [\n    {\n      "claim": "The exact claim made in the author\'s original text.",\n      "supportingArguments": [\n        {\n          "argument": "Description of how the author supports their claim (or if it\'s unsubstantiated).",\n          "score": 7,\n          "fallacies": ["Array of specific fallacy names found, or empty array if none"],\n          "improvements": "Specific suggestion for how to make this argument stronger, such as removing fallacious components while retaining the substantive points."\n        }\n      ]\n    }\n  ],\n  "fallacyOverload": false,\n  "goodFaithScore": 75,\n  "cultishPhrases": ["Array of exact manipulative/loaded phrases found in the author\'s original text"],\n  "tags": ["array", "of", "3-5", "topic-tags"],\n  "overallAnalysis": "A comprehensive paragraph summarizing the author\'s rhetorical strategy, primary weaknesses, and overall trustworthiness based on the detailed analysis."\n}\n\n---\n\n### **Scoring Rubric**\n\n* **1-2 (Highly Fallacious):** Pure fallacy, manipulation, or personal attack **without any supporting argument**.\n* **3-4 (Mostly Fallacious):** A claim with no supporting evidence, or an argument that relies heavily on fallacies.\n* **5-6 (Mixed Validity):** A mix of logical reasoning and significant fallacies. Includes arguments where a valid point is marred by a fallacy like an ad hominem.\n* **7-8 (Mostly Valid):** A logically sound argument with minor issues or weaknesses. Provides some form of evidence.\n* **9-10 (Highly Valid):** Logically sound, well-supported with evidence, acknowledges nuance, and uses clear, good-faith language.',
			messages: [
				{
					role: 'user',
					content: content
				}
			]
		});

		logger.info('Claude API response received');

		const responseText = msg.content[0]?.type === 'text' ? msg.content[0].text : '';

		if (!responseText) {
			throw new Error('No response from Claude');
		}

		// Strip markdown code blocks if present
		let cleanedResponse = responseText.trim();
		if (cleanedResponse.startsWith('```json')) {
			cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		} else if (cleanedResponse.startsWith('```')) {
			cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
		}

		// Try to extract JSON if Claude included extra text
		// Look for JSON object pattern
		const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			cleanedResponse = jsonMatch[0];
		}

		logger.info('Claude cleaned response length:', cleanedResponse.length);
		logger.info('Claude response preview:', cleanedResponse.substring(0, 200));

		// Parse the JSON response
		const result: ClaudeScoreResponse = JSON.parse(cleanedResponse);
		logger.info('Claude parsed result successfully');

		// Add backward compatibility fields
		result.good_faith_score = result.goodFaithScore / 100; // Convert 0-100 to 0-1
		result.good_faith_label = getLabel(result.good_faith_score); // Use 0-1 scale
		result.rationale = result.overallAnalysis;
		result.usedClaude = true; // Mark that Claude analysis was successful

		return result;
	} catch (error: any) {
		logger.error('Claude API error:', error);
		logger.error('Error details:', error.message, error.stack);
		// Fallback to heuristic scoring if Claude fails
		return heuristicScore(content);
	}
}

function heuristicScore(content: string): ClaudeScoreResponse {
	const lower = content.toLowerCase();
	let score = 50; // 0-100 scale

	// Basic heuristic analysis
	if (/(thank|appreciate)/.test(lower)) score += 10;
	if (/(evidence|source|reference)/.test(lower)) score += 15;
	if (/(idiot|stupid|hate|moron|trash)/.test(lower)) score -= 30;
	if (/(I understand|I see your point|you might be right)/.test(lower)) score += 10;
	if (/(always|never|all|none|everyone|no one)/.test(lower)) score -= 5; // Absolute statements

	score = Math.max(0, Math.min(100, score));

	// Create basic structured response
	const claims: ClaudeClaim[] = [
		{
			claim: content.length > 100 ? content.substring(0, 100) + '...' : content,
			supportingArguments: [
				{
					argument: 'Heuristic analysis of overall content',
					score: Math.round(score / 10), // Convert to 1-10 scale
					fallacies: score < 40 ? ['Potential logical issues detected'] : [],
					improvements:
						score < 60
							? 'Consider providing more evidence and using more respectful language'
							: 'Content appears reasonable'
				}
			]
		}
	];

	return {
		claims,
		fallacyOverload: score < 30,
		goodFaithScore: score,
		cultishPhrases: [],
		overallAnalysis: 'Heuristic fallback analysis. Claude analysis unavailable.',
		good_faith_score: score / 100,
		good_faith_label: getLabel(score / 100),
		rationale: 'Heuristic fallback score.',
		usedClaude: false // Mark that heuristic fallback was used
	};
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	logger.info('=== Claude API endpoint called ===');
	try {
		const body = await request.json();
		const { postId, content } = body as {
			postId?: string;
			content?: string;
		};

		if (typeof content !== 'string' || !content.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		// Get user from session to track usage
		let accessToken = cookies.get('nhost.accessToken');
		logger.debug('[DEBUG] Cookie access token:', !!accessToken);
		// Also check Authorization header if cookie not found
		if (!accessToken) {
			const authHeader = request.headers.get('authorization');
			logger.debug('[DEBUG] Authorization header:', authHeader?.substring(0, 30) + '...');
			if (authHeader && authHeader.startsWith('Bearer ')) {
				accessToken = authHeader.substring(7);
			}
		}
		logger.info('Access token found:', !!accessToken);
		let contributorId: string | null = null;
		let contributor: any = null;

		if (accessToken) {
			let HASURA_GRAPHQL_ENDPOINT =
				process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
			const HASURA_GRAPHQL_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

			if (!HASURA_GRAPHQL_ADMIN_SECRET) {
				logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
				return json({ error: 'Server configuration error' }, { status: 500 });
			}

			// Try alternative endpoint URL if the first one doesn't work
			const alternativeEndpoint = HASURA_GRAPHQL_ENDPOINT.replace('.graphql.', '.hasura.');
			logger.debug('[DEBUG] Primary endpoint:', HASURA_GRAPHQL_ENDPOINT);
			logger.debug('[DEBUG] Alternative endpoint:', alternativeEndpoint);
			logger.debug('[DEBUG] Admin secret present:', !!HASURA_GRAPHQL_ADMIN_SECRET);

			if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
				logger.debug('[DEBUG] Starting contributor lookup...');
				try {
					// Decode JWT token to get user ID
					const tokenPayload = JSON.parse(atob(accessToken.split('.')[1]));
					const userId =
						tokenPayload.sub || tokenPayload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];
					logger.debug('[DEBUG] JWT payload:', tokenPayload);
					logger.debug('[DEBUG] JWT payload user ID:', userId);

					// Test admin access first with primary endpoint
					let testResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET,
							'x-hasura-role': 'admin'
						},
						body: JSON.stringify({
							query: `query { contributor(limit: 1) { id } }`
						})
					});
					let testResult = await testResponse.json();
					logger.debug('[DEBUG] Primary endpoint test:', testResult);

					// If primary fails, try alternative endpoint
					if (testResult.error) {
						logger.debug('[DEBUG] Trying alternative endpoint...');
						HASURA_GRAPHQL_ENDPOINT = alternativeEndpoint;
						testResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET,
								'x-hasura-role': 'admin'
							},
							body: JSON.stringify({
								query: `query { contributor(limit: 1) { id } }`
							})
						});
						testResult = await testResponse.json();
						logger.debug('[DEBUG] Alternative endpoint test:', testResult);
					}

					if (userId) {
						// Get contributor info using admin access
						const contributorResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET,
								'x-hasura-role': 'admin'
							},
							body: JSON.stringify({
								query: `
									query GetContributor($userId: uuid!) {
										contributor_by_pk(id: $userId) {
											id
											role
											analysis_enabled
											analysis_limit
											analysis_count_used
										}
									}
								`,
								variables: { userId }
							})
						});

						const contributorResult = await contributorResponse.json();
						logger.debug('[DEBUG] Contributor lookup result:', contributorResult);
						contributor = contributorResult.data?.contributor_by_pk;
						contributorId = contributor?.id;
						logger.debug('[DEBUG] Found contributor:', !!contributor, contributorId);

						// Check permissions only if we found a contributor
						if (contributor) {
							// Check if analysis is enabled
							if (!contributor.analysis_enabled) {
								return json(
									{ error: 'Analysis access is disabled for this account' },
									{ status: 403 }
								);
							}

							// Check if user has reached their limit (unless they're admin/slartibartfast role)
							if (
								!['admin', 'slartibartfast'].includes(contributor.role) &&
								contributor.analysis_limit !== null
							) {
								if (contributor.analysis_count_used >= contributor.analysis_limit) {
									return json(
										{
											error: 'Analysis limit reached',
											limit: contributor.analysis_limit,
											used: contributor.analysis_count_used
										},
										{ status: 429 }
									);
								}
							}
						}
					}
				} catch (dbError) {
					logger.error('Database check failed:', dbError);
					// Continue with analysis but log the error
				}
			}
		}

		try {
			logger.info('Claude API key present:', !!process.env.ANTHROPIC_API_KEY);
			logger.info('Processing request for content length:', content.length);

			// Use Claude analysis
			const scored = await analyzeWithClaude(content);

			// Increment appropriate credit type only if Claude was actually used (not heuristic fallback)
			logger.info('Checking credit consumption:', {
				contributorId: !!contributorId,
				contributor: !!contributor,
				usedClaude: scored.usedClaude
			});
			if (contributorId && contributor && scored.usedClaude) {
				try {
					// Use the working endpoint URL that was discovered during contributor lookup
					let CREDIT_ENDPOINT =
						process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL || '';
					const alternativeEndpoint = CREDIT_ENDPOINT.replace('.graphql.', '.hasura.');

					// Test which endpoint works for credit operations
					const testResponse = await fetch(CREDIT_ENDPOINT, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET,
							'x-hasura-role': 'admin'
						},
						body: JSON.stringify({ query: `query { contributor(limit: 1) { id } }` })
					});
					const testResult = await testResponse.json();

					if (testResult.error) {
						logger.debug('[DEBUG] Using alternative endpoint for credits');
						CREDIT_ENDPOINT = alternativeEndpoint;
					}

					const HASURA_GRAPHQL_ADMIN_SECRET_CREDIT = process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;
					logger.debug('[DEBUG] Credit endpoint:', CREDIT_ENDPOINT);

					if (!HASURA_GRAPHQL_ADMIN_SECRET_CREDIT) {
						logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
						// Don't fail the analysis, just log the error
						logger.warn('Skipping usage tracking due to missing admin secret');
					} else if (CREDIT_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET_CREDIT) {
						// Determine which credit type to use\n\t\t\t\t\t\tlogger.info('Contributor for credit check:', contributor);
						const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
						const shouldUseMonthlyCredit =
							monthlyRemaining > 0 || ['admin', 'slartibartfast'].includes(contributor.role);

						const mutation = shouldUseMonthlyCredit
							? INCREMENT_ANALYSIS_USAGE
							: INCREMENT_PURCHASED_CREDITS_USED;

						logger.debug('[DEBUG] Executing credit mutation...');
						const creditResponse = await fetch(CREDIT_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET_CREDIT,
								'x-hasura-role': 'admin'
							},
							body: JSON.stringify({
								query: print(mutation),
								variables: { contributorId }
							})
						});

						const creditResult = await creditResponse.json();
						logger.debug('[DEBUG] Credit mutation result:', creditResult);

						if (creditResult.errors) {
							logger.error('[DEBUG] Credit mutation failed:', creditResult.errors);
						} else {
							logger.debug('[DEBUG] Credit mutation successful');
						}
					}
				} catch (usageError) {
					logger.error('Failed to increment usage count:', usageError);
					// Don't fail the request if usage tracking fails
				}
			}

			return json({ ...scored, postId: postId || null });
		} catch (error) {
			logger.error('Good faith analysis failed:', error);
			const message = error instanceof Error ? error.message : 'Analysis request failed';
			return json({ error: message }, { status: 502 });
		}
	} catch (e: any) {
		return json({ error: e?.message || 'Internal error' }, { status: 500 });
	}
};
