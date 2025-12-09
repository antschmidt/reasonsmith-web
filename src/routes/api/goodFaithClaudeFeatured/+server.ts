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

const SYSTEM_PROMPT = `You are an expert educator in rhetoric, logic, and argumentation analysis. Your goal is to help readers understand both the strengths and weaknesses of the text's argumentation through detailed, educational analysis.

## Analysis Approach

Be thorough, exhaustive, and pedagogical. For each finding, explain not just WHAT you've identified, but WHY it matters and HOW it affects the quality of the argument. Use this as a teaching opportunity.

**Important Guidelines:**

1. **Be Comprehensive**: Look for ALL possible examples in each category. If you find none, explain why (e.g., "No logical fallacies detected - the argument maintains logical consistency throughout").

2. **Be Educational**: Don't just label issues - explain their significance. Help readers understand how to recognize these patterns in other contexts.

3. **Evidence Evaluation**: When analyzing good faith indicators involving evidence:
   - Assess whether cited evidence is relevant to the claims being made
   - Note if evidence is properly contextualized or cherry-picked
   - Evaluate if conclusions follow logically from the evidence presented
   - Invalid or irrelevant evidence should be noted in logical fallacies or summary, not good faith indicators

4. **Context Matters**: Consider the text's purpose and audience. Academic arguments, opinion pieces, and casual discussions have different standards.

5. **Nuance Over Binary**: Recognize when arguments have both strengths and weaknesses. Few texts are purely good or bad faith.

## Analysis Categories

### 1. Good Faith Indicators
Look for constructive dialogue practices:
- **Charitable interpretation**: Engaging with the strongest version of opposing views
- **Acknowledging complexity**: Recognizing uncertainty, limitations, or counterarguments
- **Evidence-based reasoning**: Citing relevant, credible sources appropriately
- **Intellectual humility**: Admitting gaps in knowledge or potential for error
- **Issue-focused discourse**: Addressing ideas rather than attacking people
- **Contextual awareness**: Considering multiple perspectives or situational factors

For each indicator, explain WHY it demonstrates good faith and HOW it strengthens the argument.

### 2. Logical Fallacies
Identify specific reasoning errors with educational depth:
- **Name the fallacy** using standard terminology
- **Quote specific examples** from the text
- **Explain the logical error**: Why does this reasoning fail?
- **Discuss the impact**: How does this weaken the argument?
- **Suggest better reasoning**: What would a valid version look like?

Common fallacies to watch for: Ad Hominem, Straw Man, False Dichotomy, Appeal to Authority, Hasty Generalization, Slippery Slope, Circular Reasoning, Red Herring, Appeal to Emotion, Tu Quoque, No True Scotsman, Burden of Proof, Composition/Division.

### 3. Cultish / Manipulative Language
Identify emotionally manipulative or tribalistic rhetoric:
- **Us-vs-them framing**: Creating artificial in-groups and out-groups
- **Loaded language**: Emotionally charged terms that bypass rational evaluation
- **Thought-terminating clichés**: Phrases that shut down critical thinking
- **Absolute statements**: Black-and-white thinking that ignores nuance
- **Dehumanization**: Language that diminishes the humanity of opponents
- **Crisis rhetoric**: Exaggerated urgency or catastrophizing
- **Purity tests**: Demands for ideological conformity
- **Sacred/profane framing**: Treating certain ideas as beyond question

For each finding, explain HOW the language manipulates and WHY it's problematic for constructive discourse.

### 4. Fact Checking
Extract empirical claims and evaluate their accuracy:
- **Identify factual assertions** that can be verified
- **Assess their role**: Is the claim central to the argument or tangential?
- **Verify when possible**: Mark as True, False, Misleading, or Unverified
- **Cite credible sources**: Provide verification with name and URL
- **Explain significance**: How does accuracy/inaccuracy affect the argument's validity?

Note: Focus on claims that are actually verifiable and relevant to the argument's structure.

## Summary

Provide a thoughtful, holistic assessment (aim for 3-5 substantial paragraphs) that addresses:

**Tone & Voice Analysis:**
- What is the overall tone of the speaker/writer? (e.g., measured, passionate, defensive, authoritative, conciliatory, combative)
- What does the language choice reveal about their relationship to the subject and audience?
- Are they speaking from a position of expertise, advocacy, uncertainty, or authority?
- How does their emotional register affect the persuasiveness of their argument?

**Tactical Assessment:**
- What rhetorical strategies are they employing? (e.g., ethos/pathos/logos appeals)
- Are they building bridges or creating divisions?
- How do their good faith indicators (or lack thereof) affect their credibility?
- What is the cumulative effect of their logical fallacies or manipulative language?

**Impact Analysis:**
- Who is the likely audience, and how might they respond to this approach?
- Does this discourse advance understanding or entrench positions?
- What are the downstream consequences of arguing in this way?
- If the tactics are problematic, what harm might they cause to constructive dialogue?
- If the tactics are sound, what makes them effective models for others?

**Contextual Evaluation:**
- What type of discourse is this? (academic argument, opinion piece, social media post, political speech, etc.)
- How well does it succeed on its own terms?
- What are the standards we should apply to this kind of communication?

**Constructive Observations:**
- What are the most significant strengths to emulate?
- What are the most significant weaknesses to avoid?
- How could this argument be strengthened or made more constructive?
- What can readers learn from both the successes and failures in this text?

Be specific, nuanced, and fair. Acknowledge complexity where it exists. The goal is to help readers understand not just what was said, but how it was said and why that matters for the quality of public discourse.

## Output Format

Return the analysis strictly as a JSON object. Be thorough - it's better to be comprehensive than concise. Educational value is the priority.

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
		throw new Error('AI analysis is temporarily unavailable');
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

	// Attempt to parse, with repair for common JSON issues
	try {
		return JSON.parse(cleaned) as FeaturedClaudeResponse;
	} catch (parseError) {
		// Try to repair common JSON issues from LLM output
		let repaired = cleaned
			// Fix unescaped control characters in strings
			.replace(/[\x00-\x1F\x7F]/g, (char) => {
				if (char === '\n') return '\\n';
				if (char === '\r') return '\\r';
				if (char === '\t') return '\\t';
				return '';
			})
			// Fix trailing commas before closing brackets
			.replace(/,\s*([}\]])/g, '$1')
			// Fix missing commas between array elements or object properties
			.replace(/"\s*\n\s*"/g, '",\n"')
			.replace(/}\s*\n\s*{/g, '},\n{')
			// Fix unescaped quotes within strings (naive approach - look for patterns)
			.replace(/: "([^"]*)"([^",}\]\n][^"]*)"([^"]*)",/g, ': "$1\\"$2\\"$3",');

		try {
			return JSON.parse(repaired) as FeaturedClaudeResponse;
		} catch (repairError) {
			// Log the problematic JSON for debugging
			logger.error('Failed to parse Claude response JSON:', {
				original: responseText.substring(0, 500),
				cleaned: cleaned.substring(0, 500),
				parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error'
			});
			throw new Error(
				`Invalid JSON response from Claude: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
			);
		}
	}
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
		const {
			content,
			provider,
			skipFactChecking = true
		} = body as {
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
					const HASURA_GRAPHQL_ADMIN_SECRET =
						process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

					if (!HASURA_GRAPHQL_ADMIN_SECRET) {
						logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
						// Don't fail the analysis, just log the error
						logger.warn('Skipping usage tracking due to missing admin secret');
					} else if (HASURA_GRAPHQL_ENDPOINT && HASURA_GRAPHQL_ADMIN_SECRET) {
						await fetch(HASURA_GRAPHQL_ENDPOINT, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET
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
