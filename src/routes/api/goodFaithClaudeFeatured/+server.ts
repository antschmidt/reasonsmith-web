import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { print } from 'graphql';
import { INCREMENT_ANALYSIS_USAGE } from '$lib/graphql/queries';
import { logger } from '$lib/logger';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-build'
});

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build'
});

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-20250514';
const OPENAI_MODEL = process.env.OPENAI_FEATURED_MODEL ?? 'gpt-5';

type Verdict = 'True' | 'False' | 'Misleading' | 'Unverified';

interface GoodFaithFinding {
	name: string;
	description: string;
	example?: string;
	examples?: string[];
	why: string;
}

interface LogicalFallacyFinding {
	name: string;
	description: string;
	example?: string;
	examples?: string[];
	why: string;
}

interface CultishLanguageFinding {
	name: string;
	description: string;
	example?: string;
	examples?: string[];
	why: string;
}

interface FactCheckSource {
	name: string;
	url: string;
}

interface FactCheckFinding {
	claim: string;
	verdict: Verdict;
	source: FactCheckSource | null;
	relevance: string;
}

interface FeaturedClaudeResponse {
	good_faith: GoodFaithFinding[];
	logical_fallacies: LogicalFallacyFinding[];
	cultish_language: CultishLanguageFinding[];
	fact_checking: FactCheckFinding[];
	summary: string;
}

const featuredAnalysisSchema = {
	type: 'object',
	properties: {
		good_faith: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					description: { type: 'string' },
					examples: {
						type: 'array',
						items: { type: 'string' }
					},
					why: { type: 'string' }
				},
				required: ['name', 'description', 'examples', 'why'],
				additionalProperties: false
			}
		},
		logical_fallacies: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					description: { type: 'string' },
					examples: {
						type: 'array',
						items: { type: 'string' }
					},
					why: { type: 'string' }
				},
				required: ['name', 'description', 'examples', 'why'],
				additionalProperties: false
			}
		},
		cultish_language: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					description: { type: 'string' },
					examples: {
						type: 'array',
						items: { type: 'string' }
					},
					why: { type: 'string' }
				},
				required: ['name', 'description', 'examples', 'why'],
				additionalProperties: false
			}
		},
		fact_checking: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					claim: { type: 'string' },
					verdict: { type: 'string', enum: ['True', 'False', 'Misleading', 'Unverified'] },
					relevance: { type: 'string' },
					source: {
						type: ['object', 'null'],
						properties: {
							name: { type: 'string' },
							url: { type: 'string' }
						},
						required: ['name', 'url'],
						additionalProperties: false
					}
				},
				required: ['claim', 'verdict', 'relevance', 'source'],
				additionalProperties: false
			}
		},
		summary: { type: 'string' }
	},
	required: ['good_faith', 'logical_fallacies', 'cultish_language', 'fact_checking', 'summary'],
	additionalProperties: false
} as const;

const SYSTEM_PROMPT = `You are an expert in rhetoric, logic, and argumentation analysis. 
When analyzing the text, be very thorough and exhaustive. Look for all possible examples in each category. If you find none in a category, say so explicitly.

When analyzing good faith indicators, look for specific examples and explain why they qualify. If you find none, say "No good faith indicators found."

If the good faith indicator is citing evidence, check first that the evidence is valid, true, and relevant to the argument. 
If an argument is supported by false information it does not belong in the good faith indicators but rather in the summary as bad faith or fact checking sections as appropriate.
If the evidence is true but not relevant to the argument, it does not belong in the good faith indicators but rather in the summary as irrelevant evidence.

When fact checking take into account whether the claim is being used to support any argument or conclusion in the text. If so, note that connection in your analysis. If the claim is not being used to support any argument, you can just list it as a standalone fact check and note that it is not being used to support any argument.

If the text is very short or lacks sufficient content to analyze, do your best but note that the analysis may be limited by the brevity of the text.

Finally, provide a brief summary of the overall tone and quality of the argumentation in the text, noting whether it is generally constructive, fallacious, manipulative, or well-supported.

Return the analysis strictly as a JSON object with the following schema: 
Analyze the following text, thoroughly, according to four categories:  

1. **Good Faith Indicators** — Look for all signs of constructive dialogue (e.g., interpreting opponents charitably, acknowledging counterarguments, citing evidence, admitting uncertainty, focusing on ideas rather than personal attacks).  

2. **Logical Fallacies** — Identify and label all specific fallacies (e.g., Ad Hominem, Straw Man, Appeal to Fear, False Dichotomy, Hasty Generalization, Unsubstantiated Claim). Provide a short explanation of why the fallacy applies.  

3. **Cultish / Manipulative Language** — Look for all emotionally loaded rhetoric, us-vs-them framing, dehumanization, thought-terminating clichés, absolute statements, and apocalyptic or crisis rhetoric.  

4. **Fact Checking** — Pull out any and all empirical claims that can be easily checked. Mark them as **True**, **False**, **Misleading**, or **Unverified**. Provide at least one credible source (with name + URL) when possible.  

{
  "good_faith": [
    {
      "name": "Charity",
      "description": "Interpreting others' arguments in the strongest possible way.",
      "examples": ["Person A: We should have stricter gun control laws. Person B: Person A is concerned about public safety and wants to reduce gun violence.", "any other example from the source text which exemplifies this"],
      "why": "Person B interprets Person A's argument in a way that makes it stronger and more reasonable."
    }
  ],
  "logical_fallacies": [
    {
      "name": "Strawman",
      "description": "Misrepresenting someone's argument to make it easier to attack.",
      "examples": "Person A: We should have stricter gun control laws. Person B: Person A wants to take away all our guns!",
      "why": "Person B misrepresents Person A's position to make it easier to attack."
    }
  ],
  "cultish_language": [
    {
      "name": "Us vs. Them",
      "description": "Creating a division between 'us' (the in-group) and 'them' (the out-group).",
      "examples": ["'Only true believers understand the real truth, while outsiders are blind to it.'", "any other example from the source text which exemplifies this"],
      "why": "This language creates a sense of superiority among the in-group and alienates outsiders."
    }
  ],
  "fact_checking": [
    {
      "claim": "The earth is flat.",
      "verdict": "False",
      "source": {
        "name": "NASA and scientific consensus",
        "url": "https://www.nasa.gov/"
      },
      "relevance": "This claim is used to argue that mainstream science is unreliable."
    }
  ],
  "summary": "A brief summary of the overall tone and quality of the argumentation in the text."
}`;

async function analyzeWithClaude(content: string): Promise<FeaturedClaudeResponse> {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new Error('ANTHROPIC_API_KEY not set');
	}

	const message = await anthropic.messages.create({
		model: CLAUDE_MODEL,
		// Keep max tokens below Anthropic's non-streaming threshold to avoid streaming requirement errors
		max_tokens: 6000,
		temperature: 0.2,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: `Analyze the following text.

Instructions:
- Follow the system prompt exactly.
- Respond with valid JSON matching the schema and nothing else.
- Do not include code fences, commentary, or explanations outside the JSON object.

Text to analyze:
${content}`
					}
				]
			}
		]
	});

	const responseBlocks = message.content ?? [];
	const textResponse = responseBlocks
		.filter((block) => block.type === 'text')
		.map((block) => (block as any).text)
		.join('')
		.trim();

	const responseText = textResponse;

	if (!responseText) {
		throw new Error('No response from Claude');
	}

	let cleaned = responseText.trim();
	if (cleaned.startsWith('```json')) {
		cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
	} else if (cleaned.startsWith('```')) {
		cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
	}

	if (!cleaned.trim().startsWith('{')) {
		const start = cleaned.indexOf('{');
		const end = cleaned.lastIndexOf('}');
		if (start !== -1 && end !== -1 && end > start) {
			cleaned = cleaned.slice(start, end + 1);
		}
	}

	return JSON.parse(cleaned) as FeaturedClaudeResponse;
}

async function analyzeWithOpenAI(content: string): Promise<FeaturedClaudeResponse> {
	if (!process.env.OPENAI_API_KEY) {
		throw new Error('OPENAI_API_KEY not set');
	}

	const completion = await openai.chat.completions.create({
		model: OPENAI_MODEL,
		temperature: 1,
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: 'featured_analysis',
				schema: featuredAnalysisSchema,
				strict: true
			}
		},
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{
				role: 'user',
				content: `Analyze the following text and return only JSON.\n\n${content}`
			}
		]
	});

	const responseText = completion.choices[0]?.message?.content?.trim();

	if (!responseText) {
		throw new Error('No response from OpenAI');
	}

	return JSON.parse(responseText) as FeaturedClaudeResponse;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await request.json();
		const { content, provider, skipFactChecking } = body as {
			content?: string;
			provider?: string;
			skipFactChecking?: boolean;
		};

		if (typeof content !== 'string' || !content.trim()) {
			return json({ error: 'content required' }, { status: 400 });
		}

		// Get user from session to track usage
		const accessToken = cookies.get('nhost.accessToken');
		let contributorId: string | null = null;
		let contributor: any = null;

		if (accessToken) {
			const HASURA_GRAPHQL_ENDPOINT =
				process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
			const HASURA_GRAPHQL_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

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
						contributor = contributorResult.data?.contributor_by_pk;
						contributorId = contributor?.id;

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
			const selectedProvider = provider === 'openai' ? 'openai' : 'claude';
			const analysis =
				selectedProvider === 'openai'
					? await analyzeWithOpenAI(content)
					: await analyzeWithClaude(content);

			// Remove fact checking if requested
			if (skipFactChecking) {
				analysis.fact_checking = [];
			}

			// Increment usage count after successful analysis
			if (contributorId) {
				try {
					const HASURA_GRAPHQL_ENDPOINT =
						process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
					const HASURA_GRAPHQL_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

					if (!HASURA_GRAPHQL_ADMIN_SECRET) {
						logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
						// Don't fail the analysis, just log the error
						logger.warn('Skipping usage tracking due to missing admin secret');
					} else if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
						await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET,
								'x-hasura-role': 'admin'
							},
							body: JSON.stringify({
								query: print(INCREMENT_ANALYSIS_USAGE),
								variables: { contributorId }
							})
						});
					}
				} catch (usageError) {
					logger.error('Failed to increment usage count:', usageError);
					// Don't fail the request if usage tracking fails
				}
			}

			return json(analysis);
		} catch (error) {
			logger.error('Featured analysis generation failed.', error);
			const message = error instanceof Error ? error.message : 'Analysis request failed';
			return json({ error: message }, { status: 502 });
		}
	} catch (error: any) {
		logger.error('Featured analysis endpoint error:', error);
		return json({ error: error?.message || 'Internal error' }, { status: 500 });
	}
};
