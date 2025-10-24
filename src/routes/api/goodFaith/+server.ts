import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { print } from 'graphql';
import { INCREMENT_ANALYSIS_USAGE, INCREMENT_PURCHASED_CREDITS_USED } from '$lib/graphql/queries';
import { checkAndResetMonthlyCredits, getMonthlyCreditsRemaining } from '$lib/creditUtils';
import { logger } from '$lib/logger';

// Import the same function from the Vercel function
// We'll copy the logic here for local development
import OpenAI from 'openai';

interface Claim {
	claim: string;
	arguments: Array<{
		text: string;
		score: number; // 1-10
		fallacies: string[];
		manipulativeLanguage: string[];
		suggestions: string[];
	}>;
}

interface ScoreResponse {
	claims: Claim[];
	fallacyOverload: boolean;
	goodFaithScore: number; // 0-100
	goodFaithDescriptor?: string; // 1-2 word contextual descriptor
	cultishPhrases: string[];
	summary: string;

	// Growth-focused scores
	steelmanScore?: number; // 0-10 scale
	steelmanNotes?: string;
	understandingScore?: number; // 0-10 scale
	intellectualHumilityScore?: number; // 0-10 scale

	// On-topic relevance scoring
	relevanceScore?: number; // 0-10 scale
	relevanceNotes?: string;

	// Legacy fields for backward compatibility
	good_faith_score?: number;
	good_faith_label?: string;
	rationale?: string;
}

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build'
});

// Define the JSON schema for structured output
const goodFaithSchema = {
	type: 'object',
	properties: {
		claims: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					claim: {
						type: 'string',
						description: 'The main claim or assertion being made'
					},
					arguments: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								text: {
									type: 'string',
									description: 'The supporting argument text or quote'
								},
								score: {
									type: 'number',
									minimum: 1,
									maximum: 10,
									description: 'Quality score of the argument (1-10)'
								},
								fallacies: {
									type: 'array',
									items: {
										type: 'string'
									},
									description: 'List of logical fallacies found in this argument'
								},
								manipulativeLanguage: {
									type: 'array',
									items: {
										type: 'string'
									},
									description: 'Specific manipulative phrases or language patterns found'
								},
								suggestions: {
									type: 'array',
									items: {
										type: 'string'
									},
									description: 'Suggestions for improving this argument'
								}
							},
							required: ['text', 'score', 'fallacies', 'manipulativeLanguage', 'suggestions'],
							additionalProperties: false
						}
					}
				},
				required: ['claim', 'arguments'],
				additionalProperties: false
			}
		},
		fallacyOverload: {
			type: 'boolean',
			description: 'True if most arguments are fallacy-laden'
		},
		goodFaithScore: {
			type: 'number',
			minimum: 0,
			maximum: 100,
			description:
				'Overall good faith score (0-100) based on percentage of claims made in good faith'
		},
		goodFaithDescriptor: {
			type: 'string',
			description:
				'A concise 1-2 word descriptor capturing the overall quality/tone (e.g., "Constructive", "Hostile", "Off-Topic", "Manipulative", "Evidence-Based")'
		},
		cultishPhrases: {
			type: 'array',
			items: {
				type: 'string'
			},
			description: 'List of cultish or manipulative phrases found throughout the text'
		},
		summary: {
			type: 'string',
			description:
				'Comprehensive textual summary of the analysis including patterns found and recommendations'
		},
		steelmanScore: {
			type: 'number',
			minimum: 0,
			maximum: 10,
			description: 'Quality of steelmanning opponent views (0-10 scale)'
		},
		steelmanNotes: {
			type: 'string',
			description: 'Feedback on steelman quality and suggestions'
		},
		understandingScore: {
			type: 'number',
			minimum: 0,
			maximum: 10,
			description: 'Demonstration of understanding opposing positions (0-10 scale)'
		},
		intellectualHumilityScore: {
			type: 'number',
			minimum: 0,
			maximum: 10,
			description: 'Openness to being wrong, acknowledging valid opposing points (0-10 scale)'
		},
		relevanceScore: {
			type: 'number',
			minimum: 0,
			maximum: 10,
			description: 'How relevant the comment is to the discussion topic (0-10 scale)'
		},
		relevanceNotes: {
			type: 'string',
			description: 'Explanation of relevance or derailment tactics detected'
		}
	},
	required: [
		'claims',
		'fallacyOverload',
		'goodFaithScore',
		'goodFaithDescriptor',
		'cultishPhrases',
		'summary',
		'steelmanScore',
		'steelmanNotes',
		'understandingScore',
		'intellectualHumilityScore',
		'relevanceScore',
		'relevanceNotes'
	],
	additionalProperties: false
};

async function scoreWithOpenAI(content: string): Promise<ScoreResponse> {
	try {
		// Check if using custom prompt or fallback to chat completion
		if (process.env.OPENAI_PROMPT_ID) {
			// Note: OpenAI doesn't have a responses.create API
			// This should use chat.completions.create instead
			const response = await openai.chat.completions.create({
				model: 'gpt-4',
				messages: [
					{
						role: 'system',
						content:
							'You are a good faith analyzer. Analyze the following content and return a structured response.'
					},
					{
						role: 'user',
						content: content
					}
				]
			});

			// Parse the response
			const result = response.choices[0]?.message?.content || '';
			return parseOpenAIResponse(result);
		} else {
			// Use structured outputs with chat completion API
			const response = await openai.chat.completions.create({
				model: 'gpt-5',
				messages: [
					{
						role: 'system',
						content: `You are an expert in logic, rhetoric, argumentation, and intellectual growth assessment. Analyze the given text with rigorous academic precision.

**CRITICAL REQUIREMENTS:**
1. **Extract specific claims** - Each distinct assertion or position stated in the text
2. **Identify supporting arguments** - Direct quotes or reasoning used to support each claim
3. **List specific fallacies by name** - Use precise logical fallacy terminology
4. **Extract manipulative language** - Quote specific phrases that use emotional manipulation
5. **Provide detailed suggestions** - Concrete, actionable improvements for each argument
6. **Assess steelmanning quality** - Does the author accurately represent opposing views?
7. **Evaluate understanding** - Does the author demonstrate comprehension of other positions?
8. **Measure intellectual humility** - Does the author acknowledge valid opposing points or concede when appropriate?
9. **Check on-topic relevance** - Is the comment relevant to the discussion topic, or is it a derailment/distraction?

**Analysis Format:**

For each claim, find its supporting arguments and analyze them with this structure:
- **text**: The exact quote or paraphrase of the supporting argument
- **score**: 1-10 quality rating (1=fallacious/manipulative, 10=excellent logic/evidence)
- **fallacies**: Array of specific fallacy names (e.g., "Ad Hominem", "Straw Man", "False Dichotomy", "Appeal to Fear", "Hasty Generalization", "Cherry-Picking", "Appeal to Authority", "Red Herring")
- **manipulativeLanguage**: Array of specific quoted phrases that use emotional manipulation, loaded language, or tribal signaling
- **suggestions**: Array of specific, actionable improvements

**Manipulative Language Patterns to Identify:**
- **Emotional appeals**: Fear-mongering phrases, rage-inducing terms
- **Tribal signaling**: "Real Americans", "liberal media", "they want to destroy us"
- **Loaded language**: Words chosen for emotional impact rather than accuracy
- **Absolute statements**: "always", "never", "all", "completely", "totally"
- **Dehumanizing terms**: Language that reduces people to objects or stereotypes
- **Thought-terminating clichés**: "Common sense", "everyone knows", "obvious to anyone"

**Growth-Focused Scoring:**

**Steelman Score (0-10):** How well does the author represent opposing viewpoints?
- 10: Presents opposing views in their strongest, most charitable form
- 7-9: Generally fair representation with minor weaknesses
- 4-6: Some strawmanning or misrepresentation
- 1-3: Significant distortion of opposing views
- 0: Complete strawman, no attempt at fair representation

**Understanding Score (0-10):** Does the author demonstrate genuine comprehension of opposing positions?
- 10: Deep understanding, can explain why people hold different views
- 7-9: Good understanding with minor gaps
- 4-6: Surface-level understanding
- 1-3: Minimal understanding, relies on stereotypes
- 0: No demonstrated understanding

**Intellectual Humility Score (0-10):** Openness to being wrong, acknowledging valid opposing points
- 10: Explicitly acknowledges valid points, concedes where appropriate
- 7-9: Shows some openness, admits uncertainty
- 4-6: Neutral, doesn't concede but doesn't claim certainty
- 1-3: Displays certainty with little room for doubt
- 0: Absolute certainty, no acknowledgment of complexity

**CRITICAL - On-Topic Relevance Score (0-10):**
**When DISCUSSION CONTEXT is provided, you MUST evaluate relevance to that context.**

Does the comment directly address the discussion topic, or is it a derailment/distraction?

**Relevance Scoring Guidelines:**
* **10:** Directly addresses the core topic with substantive engagement
* **7-9:** Related to the topic with clear connection, may touch on tangential but relevant points
* **4-6:** Partially related, makes some connection but wanders significantly or focuses on minor tangents
* **1-3:** Minimally related, primarily discusses unrelated topics, or uses weak/forced connections to claim relevance
* **0:** Completely off-topic, no genuine connection to the discussion

**Red Flags for Topic Derailment:**
* **Whataboutism**: Deflecting to an unrelated issue (e.g., "What about [unrelated person/event]?")
* **False Equivalence**: Comparing the discussion topic to something superficially similar but fundamentally different
* **Topic Switching**: Changing the subject without explaining relevance
* **Tangent Hijacking**: Seizing on a minor detail to avoid the main topic
* **Historical Distraction**: Bringing up past events without clear relevance to current topic

**Example of Poor Relevance:**
* Discussion Topic: "Evidence that Donald Trump is pushing the US toward authoritarian rule"
* Off-topic Comment: "What about when Barack Obama wore a tan suit? Wasn't that bad?"
* Score: 0-1 (No genuine connection; classic whataboutism)

**When to Score High:**
* Comment engages with the specific evidence/arguments presented
* Builds on discussion context (references provided citations, responds to specific points)
* Even if disagreeing, addresses the actual topic rather than deflecting

**Important:** The author has the burden to explain relevance. If connection is unclear, score low and note in relevanceNotes that they should explain how their point relates to the discussion topic.

**CRITICAL - Off-Topic Comment Handling:**
When relevanceScore is 3 or below (minimally related or off-topic), your relevanceNotes MUST include:
"This comment appears to be off-topic or largely unrelated to the discussion. Please start a new discussion if you'd like to explore this topic instead."

**Example Analysis:**

Text: "The liberal media is destroying our country with their constant lies and fake news. Everyone knows they hate America."

{
  "claims": [
    {
      "claim": "The liberal media is destroying our country",
      "arguments": [
        {
          "text": "with their constant lies and fake news",
          "score": 2,
          "fallacies": ["Hasty Generalization", "Ad Hominem", "Loaded Language"],
          "manipulativeLanguage": ["liberal media", "destroying our country", "constant lies", "fake news"],
          "suggestions": ["Cite specific examples with sources", "Avoid broad generalizations about entire media organizations", "Use neutral language to describe news outlets"]
        },
        {
          "text": "Everyone knows they hate America",
          "score": 1,
          "fallacies": ["Appeal to Common Belief", "Mind Reading", "Poisoning the Well"],
          "manipulativeLanguage": ["Everyone knows", "they hate America"],
          "suggestions": ["Provide evidence for claims about motivations", "Avoid absolute statements like 'everyone knows'", "Focus on specific policies rather than attributing emotions"]
        }
      ]
    }
  ],
  "goodFaithDescriptor": "Inflammatory",
  "steelmanScore": 0,
  "steelmanNotes": "No attempt to represent media outlets' actual motivations or reasoning. Uses strawman characterization.",
  "understandingScore": 1,
  "intellectualHumilityScore": 0,
  "relevanceScore": 5,
  "relevanceNotes": "Relevance depends on discussion context. If discussing media bias, somewhat relevant. If discussing other topics, this would be a deflection."
}

**IMPORTANT DESCRIPTOR GUIDANCE:**
- goodFaithDescriptor: Choose a concise 1-2 word descriptor that captures the overall quality/tone. Examples: "Constructive", "Hostile", "Off-Topic", "Manipulative", "Evidence-Based", "Dismissive", "Thoughtful", "Inflammatory", "Respectful", "Combative". Choose words that best describe what you found in the analysis.

**Critical: Always provide this level of detail for EVERY argument in the text. Extract specific quotes and name precise fallacies. Always include all growth-focused scores, relevance assessment, and the descriptor.**`
					},
					{
						role: 'user',
						content: content
					}
				],
				temperature: 1,
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'good_faith_analysis',
						schema: goodFaithSchema,
						strict: true
					}
				}
			});

			const responseText = response.choices[0]?.message?.content;
			if (!responseText) {
				throw new Error('No response from OpenAI');
			}

			// With structured outputs, we can safely parse the JSON
			const result = JSON.parse(responseText);

			// Add backward compatibility fields
			result.good_faith_score = result.goodFaithScore / 100; // Convert 0-100 to 0-1
			result.good_faith_label = result.goodFaithDescriptor || getLabel(result.good_faith_score); // Use AI descriptor, fallback to old label
			result.rationale = result.summary;

			return result;
		}
	} catch (error: any) {
		logger.error('OpenAI API error:', error);
		// Fallback to heuristic scoring if OpenAI fails
		return heuristicScore(content);
	}
}

function parseOpenAIResponse(content: string): ScoreResponse {
	// This function needs to be implemented based on your custom prompt's output format
	// For now, try to parse as JSON or fallback to heuristic
	try {
		return JSON.parse(content);
	} catch {
		return heuristicScore(content);
	}
}

function getLabel(score: number): string {
	if (score >= 0.8) return 'exemplary';
	if (score >= 0.6) return 'constructive';
	if (score >= 0.4) return 'neutral';
	if (score >= 0.2) return 'questionable';
	return 'hostile';
}

function heuristicScore(content: string): ScoreResponse {
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
	const claims: Claim[] = [
		{
			claim: content.length > 100 ? content.substring(0, 100) + '...' : content,
			arguments: [
				{
					text: 'Heuristic analysis of overall content',
					score: Math.round(score / 10), // Convert to 1-10 scale
					fallacies: score < 40 ? ['Potential logical issues detected'] : [],
					manipulativeLanguage: [],
					suggestions:
						score < 60
							? ['Consider providing more evidence', 'Use more respectful language']
							: ['Content appears reasonable']
				}
			]
		}
	];

	// Determine descriptor based on score
	let descriptor = 'Neutral';
	if (score >= 80) descriptor = 'Constructive';
	else if (score >= 60) descriptor = 'Respectful';
	else if (score >= 40) descriptor = 'Questionable';
	else if (score >= 20) descriptor = 'Hostile';
	else descriptor = 'Inflammatory';

	return {
		claims,
		fallacyOverload: score < 30,
		goodFaithScore: score,
		goodFaithDescriptor: descriptor,
		cultishPhrases: [],
		summary: 'Heuristic fallback analysis. OpenAI analysis unavailable.',
		good_faith_score: score / 100,
		good_faith_label: descriptor, // Use the descriptor as the label
		rationale: 'Heuristic fallback score.'
	};
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await request.json();
		const { postId, content, importData, discussionContext } = body as {
			postId?: string;
			content?: string;
			importData?: {
				source?: string;
				url?: string;
				content?: string;
				author?: string;
				date?: string;
			};
			discussionContext?: {
				discussion?: {
					title?: string;
					description?: string;
					citations?: any[];
				};
				importData?: {
					source?: string;
					url?: string;
					content?: string;
					author?: string;
					date?: string;
				};
				selectedComments?: Array<{
					id: string;
					content: string;
					author: string;
					created_at: string;
					is_anonymous: boolean;
				}>;
			};
		};

		if (typeof content !== 'string' || !content.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		// Build the full content including discussion context
		let fullContent = content;

		// Use discussionContext if provided (new format), otherwise fall back to importData (old format)
		const contextImportData = discussionContext?.importData || importData;

		if (discussionContext) {
			// New context-aware format
			let contextString = '';

			// Add discussion title and description
			if (discussionContext.discussion) {
				contextString += 'DISCUSSION CONTEXT:\n';
				if (discussionContext.discussion.title) {
					contextString += `Title: ${discussionContext.discussion.title}\n`;
				}
				if (discussionContext.discussion.description) {
					contextString += `Description:\n${discussionContext.discussion.description}\n`;
				}

				// Add citations if present
				if (
					discussionContext.discussion.citations &&
					discussionContext.discussion.citations.length > 0
				) {
					contextString += '\nCITATIONS:\n';
					discussionContext.discussion.citations.forEach((cit: any, idx: number) => {
						contextString += `[${idx + 1}] ${cit.title || 'Untitled'} - ${cit.url || 'No URL'}\n`;
						if (cit.point_supported) {
							contextString += `   Supporting: ${cit.point_supported}\n`;
						}
					});
				}
				contextString += '\n---\n\n';
			}

			// Add social media import if present
			if (contextImportData?.content) {
				contextString += `IMPORTED SOCIAL MEDIA POST (for context only - not subject to good faith evaluation):\n`;
				contextString += `Platform: ${contextImportData.source || 'Unknown'}\n`;
				contextString += `Author: ${contextImportData.author || 'Unknown'}\n`;
				if (contextImportData.date) {
					contextString += `Date: ${contextImportData.date}\n`;
				}
				if (contextImportData.url) {
					contextString += `URL: ${contextImportData.url}\n`;
				}
				contextString += `\nContent:\n${contextImportData.content}\n\n---\n\n`;
			}

			// Add selected comments as context
			if (discussionContext.selectedComments && discussionContext.selectedComments.length > 0) {
				contextString += 'REFERENCED COMMENTS IN THIS DISCUSSION:\n\n';
				discussionContext.selectedComments.forEach((comment) => {
					contextString += `Comment by ${comment.author} on ${new Date(comment.created_at).toLocaleDateString()}:\n`;
					contextString += `${comment.content}\n\n---\n\n`;
				});
			}

			contextString += `USER'S NEW COMMENT (evaluate this for good faith):\n${content}`;
			fullContent = contextString;
		} else if (contextImportData?.content) {
			// Old format for backward compatibility
			const importContext = `
IMPORTED SOCIAL MEDIA POST (for context only - not subject to good faith evaluation):
Platform: ${contextImportData.source || 'Unknown'}
Author: ${contextImportData.author || 'Unknown'}
${contextImportData.date ? `Date: ${contextImportData.date}` : ''}
${contextImportData.url ? `URL: ${contextImportData.url}` : ''}

Content:
${contextImportData.content}

---

USER'S RESPONSE (evaluate this for good faith):
${content}
`;
			fullContent = importContext;
		}

		// Get user from session to track usage
		const accessToken = cookies.get('nhost.accessToken');
		let contributorId: string | null = null;
		let contributor: any = null;

		if (accessToken) {
			const HASURA_GRAPHQL_ENDPOINT =
				process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
			const HASURA_GRAPHQL_ADMIN_SECRET =
				process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

			if (!HASURA_GRAPHQL_ADMIN_SECRET) {
				logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
				return json({ error: 'Server configuration error' }, { status: 500 });
			}

			if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
				try {
					// Get user info from access token
					const userResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${accessToken}`
						},
						body: JSON.stringify({
							query: `
								query GetCurrentUser {
									auth {
										user {
											id
										}
									}
								}
							`
						})
					});

					const userResult = await userResponse.json();
					const userId = userResult.data?.auth?.user?.id;

					if (userId) {
						// Get contributor info using admin access
						const contributorResponse = await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
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
						contributor = contributorResult.data?.contributor_by_pk;
						contributorId = contributor?.id;

						// Check and reset monthly credits if needed
						if (contributor) {
							await checkAndResetMonthlyCredits(
								contributor,
								HASURA_GRAPHQL_ENDPOINT,
								undefined,
								HASURA_GRAPHQL_ADMIN_SECRET
							);
						}

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
			// Use OpenAI scoring instead of heuristic
			const scored = await scoreWithOpenAI(fullContent);

			// Increment appropriate credit type after successful analysis
			if (contributorId && contributor) {
				try {
					const HASURA_GRAPHQL_ENDPOINT =
						process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
					const HASURA_GRAPHQL_ADMIN_SECRET =
						process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

					if (!HASURA_GRAPHQL_ADMIN_SECRET) {
						logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
						// Don't fail the analysis, just log the error
						logger.warn('Skipping usage tracking due to missing admin secret');
					} else if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
						// Determine which credit type to use
						const monthlyRemaining = getMonthlyCreditsRemaining(contributor);
						const shouldUseMonthlyCredit =
							monthlyRemaining > 0 || ['admin', 'slartibartfast'].includes(contributor.role);

						const mutation = shouldUseMonthlyCredit
							? INCREMENT_ANALYSIS_USAGE
							: INCREMENT_PURCHASED_CREDITS_USED;

						await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
							},
							body: JSON.stringify({
								query: print(mutation),
								variables: { contributorId }
							})
						});
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
