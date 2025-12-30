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
	goodFaithDescriptor?: string; // 1-2 word contextual descriptor (e.g., "Constructive", "Hostile", "Off-Topic")
	cultishPhrases: string[];
	overallAnalysis: string;
	tags?: string[]; // Topic tags extracted from claims

	// NEW: Growth-focused scores
	steelmanScore?: number; // 0-10 scale - quality of steelmanning opponent's view
	steelmanNotes?: string; // Feedback on steelman quality
	understandingScore?: number; // 0-10 scale - demonstration of understanding
	intellectualHumilityScore?: number; // 0-10 scale - acknowledging valid points, conceding

	// NEW: On-topic relevance scoring
	relevanceScore?: number; // 0-10 scale - how relevant the comment is to the discussion topic
	relevanceNotes?: string; // Explanation of why comment is or isn't relevant

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
			throw new Error('AI analysis is temporarily unavailable');
		}

		const msg = await anthropic.messages.create({
			model: 'claude-sonnet-4-5-20250929',
			max_tokens: 20000,
			temperature: 0.2,
			system:
				'You are a meticulous analyst specializing in logic, rhetoric, critical discourse analysis, and intellectual growth assessment. Your expertise lies in dissecting arguments to identify their structure, validity, intent, AND the author\'s commitment to genuine understanding over rhetorical victory.\n\nYour task is to analyze the provided text for:\n1. Logical fallacies and manipulative rhetoric\n2. Indicators of good or bad faith argumentation  \n3. **NEW: Steelmanning quality** - Does the author accurately represent opposing views?\n4. **NEW: Understanding demonstration** - Does the author show genuine comprehension of other positions?\n5. **NEW: Intellectual humility** - Does the author acknowledge valid opposing points or concede when appropriate?\n6. **NEW: On-topic relevance** - Is the comment relevant to the discussion topic, or is it a derailment/distraction?\n\nYou will then synthesize your findings into a single, valid JSON object.\n\n**Critical Rule: Differentiating Author vs. Quote**\nBefore analysis, you MUST distinguish between the author\'s original text and any text they are quoting.\n* Quoted text is often indicated by markdown `>` characters, quotation marks (`""`), or phrases like "You wrote:".\n* **Do not attribute the fallacies or claims within the quoted text to the author.** Analyze ONLY the author\'s original response. The quoted text serves as the context for the author\'s claims, not as part of their argument.\n\n**Execution Process:**\n1.  **Isolate & Deconstruct:** First, identify and separate any quoted text from the author\'s original statements. Then, deconstruct the **author\'s statements** into every distinct claim they are making.\n2.  **Map Arguments:** For each of the author\'s claims, identify their supporting arguments or note their absence.\n3.  **Analyze & Score:** Evaluate each of the author\'s arguments against the `Analytical Framework` below. Assign a score based on the `Scoring Rubric`.\n4.  **Synthesize:** After analyzing all of the author\'s arguments, calculate the aggregate scores (`fallacyOverload`, `goodFaithScore`) and write the `overallAnalysis`.\n5.  **Generate Tags:** Extract 3-5 topic tags that represent the main subject areas discussed in the content. Use lowercase, hyphenated format (e.g., "political-discourse", "climate-change", "economic-policy").\n6.  **Construct JSON:** Assemble the final JSON object. Your output must *only* be this JSON object.\n\n---\n\n### **Analytical Framework**\n\n**1. Logical Fallacies to Identify:**\n* Unsubstantiated Claim, Ad Hominem, Straw Man, False Dichotomy, Hasty Generalization, Appeal to Fear.\n\n**2. Manipulative Language to Identify:**\n* Emotionally Loaded Terms, Us-vs-Them Framing, Thought-Terminating Clichés, Dehumanizing Language, Absolute Statements.\n\n**3. Handling Compound Arguments:**\n* Recognize that a single argument may contain both a fallacy and a substantive point (e.g., "That\'s wrong, you\'re a shill! The data from the CBO says otherwise."). Identify the "Ad Hominem" fallacy, but score the argument based on the merit of the substantive point. The `improvements` suggestion should focus on removing the fallacious part.\n\n**4. NEW - Steelmanning Detection & Scoring (0-10):**\nSteelmanning is representing an opposing view in its STRONGEST, most charitable form before critique.\n\n**Indicators of Steelmanning:**\n* Explicitly restating opponent\'s position before countering\n* Using phrases like "The strongest version of this argument is...", "I understand your view as...", "To steelman this position..."\n* Presenting opposing view better than opponent might have\n* Acknowledging strongest points of opposing side\n* Correcting misunderstandings of opponent\'s actual position\n\n**Steelman Scoring:**\n* **0-2:** No attempt to understand opposing view, or strawman present\n* **3-4:** Minimal acknowledgment of opposing view, but weak representation\n* **5-6:** Fair representation but not strengthened; basic understanding\n* **7-8:** Strong, charitable representation; shows deep understanding\n* **9-10:** Exceptional steelmanning; opponent would agree with representation; makes their case stronger than they did\n\n**5. NEW - Understanding Score (0-10):**\nDoes the author demonstrate genuine comprehension of opposing positions?\n* **High (7-10):** Identifies nuances, underlying assumptions, explains reasoning behind opposing view\n* **Medium (4-6):** Surface-level understanding, some key points grasped\n* **Low (0-3):** Misrepresents position, misses key points, shows lack of engagement\n\n**6. NEW - Intellectual Humility Score (0-10):**\nDoes the author show openness to being wrong and acknowledging valid opposing points?\n* **High (7-10):** Explicitly acknowledges valid opposing points, concedes errors, updates position based on evidence, uses tentative language where appropriate\n* **Medium (4-6):** Some acknowledgment of complexity, qualified statements\n* **Low (0-3):** Absolute certainty, dismissive of opposing views, no concessions\n\n**7. NEW - On-Topic Relevance Score (0-10):**\n**CRITICAL: When DISCUSSION CONTEXT is provided, you MUST evaluate relevance to that context.**\n\nDoes the comment directly address the discussion topic, or is it a derailment/distraction?\n\n**Relevance Scoring Guidelines:**\n* **10:** Directly addresses the core topic with substantive engagement\n* **7-9:** Related to the topic with clear connection, may touch on tangential but relevant points\n* **4-6:** Partially related, makes some connection but wanders significantly or focuses on minor tangents\n* **1-3:** Minimally related, primarily discusses unrelated topics, or uses weak/forced connections to claim relevance\n* **0:** Completely off-topic, no genuine connection to the discussion\n\n**Red Flags for Topic Derailment:**\n* **Whataboutism**: Deflecting to an unrelated issue (e.g., "What about [unrelated person/event]?")\n* **False Equivalence**: Comparing the discussion topic to something superficially similar but fundamentally different\n* **Topic Switching**: Changing the subject without explaining relevance\n* **Tangent Hijacking**: Seizing on a minor detail to avoid the main topic\n* **Historical Distraction**: Bringing up past events without clear relevance to current topic\n\n**Example of Poor Relevance:**\n* Discussion Topic: "Evidence that Donald Trump is pushing the US toward authoritarian rule"\n* Off-topic Comment: "What about when Barack Obama wore a tan suit? Wasn\'t that bad?"\n* Score: 0-1 (No genuine connection; classic whataboutism)\n\n**When to Score High:**\n* Comment engages with the specific evidence/arguments presented\n* Builds on discussion context (references provided citations, responds to specific points)\n* Even if disagreeing, addresses the actual topic rather than deflecting\n\n**Important:** The author has the burden to explain relevance. If connection is unclear, score low and note in relevanceNotes that they should explain how their point relates to the discussion topic.\n\n**CRITICAL - Off-Topic Comment Handling:**\nWhen relevanceScore is 3 or below (minimally related or off-topic), your relevanceNotes MUST include:\n"This comment appears to be off-topic or largely unrelated to the discussion. Please start a new discussion if you\'d like to explore this topic instead."\n\n---\n\n### **Output Requirements**\n\n**CRITICAL: You must return EXACTLY this JSON structure. Do not add extra fields like \'label\', \'score\', \'rationale\', \'provider\', \'analyzedAt\', etc. The field names and types must match exactly as shown below.**\n\nReturn **ONLY** a valid JSON object with this exact structure:\n\n{\n  "claims": [\n    {\n      "claim": "The exact claim made in the author\'s original text.",\n      "supportingArguments": [\n        {\n          "argument": "Description of how the author supports their claim (or if it\'s unsubstantiated).",\n          "score": 7,\n          "fallacies": ["Array of specific fallacy names found, or empty array if none"],\n          "improvements": "Specific suggestion for how to make this argument stronger, such as removing fallacious components while retaining the substantive points."\n        }\n      ]\n    }\n  ],\n  "fallacyOverload": false,\n  "goodFaithScore": 75,\n  "goodFaithDescriptor": "Constructive",\n  "cultishPhrases": ["Array of exact manipulative/loaded phrases found in the author\'s original text"],\n  "tags": ["array", "of", "3-5", "topic-tags"],\n  "overallAnalysis": "A comprehensive paragraph summarizing the author\'s rhetorical strategy, primary weaknesses, and overall trustworthiness based on the detailed analysis.",\n  "steelmanScore": 0,\n  "steelmanNotes": "Brief feedback on steelmanning quality, or null if not applicable",\n  "understandingScore": 5,\n  "intellectualHumilityScore": 5,\n  "relevanceScore": 10,\n  "relevanceNotes": "Explanation of how the comment relates (or fails to relate) to the discussion topic. Note derailment tactics if present."\n}\n\n**IMPORTANT NOTES:**\n- goodFaithDescriptor: A concise 1-2 word descriptor that captures the overall quality/tone (e.g., "Constructive", "Hostile", "Off-Topic", "Manipulative", "Evidence-Based", "Dismissive", "Thoughtful", "Inflammatory"). Choose words that best describe what you found in the analysis.\n- steelmanScore: 0-10 or null if no opposing view discussed. Only score if author attempts to represent opposing position.\n- steelmanNotes: Specific feedback on quality of representation. Null if not applicable.\n- understandingScore: 0-10 for demonstration of comprehension\n- intellectualHumilityScore: 0-10 for acknowledgment of valid points, concessions, openness\n- relevanceScore: 0-10 for how relevant the comment is to the discussion topic. REQUIRED when discussion context is provided.\n- relevanceNotes: Explanation of relevance assessment. Should identify derailment tactics (whataboutism, topic switching, etc.) if present.\n\n---\n\n### **Scoring Rubric**\n\n* **1-2 (Highly Fallacious):** Pure fallacy, manipulation, or personal attack **without any supporting argument**.\n* **3-4 (Mostly Fallacious):** A claim with no supporting evidence, or an argument that relies heavily on fallacies.\n* **5-6 (Mixed Validity):** A mix of logical reasoning and significant fallacies. Includes arguments where a valid point is marred by a fallacy like an ad hominem.\n* **7-8 (Mostly Valid):** A logically sound argument with minor issues or weaknesses. Provides some form of evidence.\n* **9-10 (Highly Valid):** Logically sound, well-supported with evidence, acknowledges nuance, and uses clear, good-faith language.',
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
		result.good_faith_label = result.goodFaithDescriptor || getLabel(result.good_faith_score); // Use AI descriptor, fallback to old label
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
		overallAnalysis: 'Heuristic fallback analysis. Claude analysis unavailable.',
		good_faith_score: score / 100,
		good_faith_label: descriptor, // Use the descriptor as the label
		rationale: 'Heuristic fallback score.',
		usedClaude: false // Mark that heuristic fallback was used
	};
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	logger.info('=== Claude API endpoint called ===');
	try {
		const body = await request.json();
		const { postId, content, importData, discussionContext, showcaseContext } = body as {
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
			showcaseContext?: {
				title: string;
				subtitle?: string;
				creator?: string;
				media_type?: string;
				summary?: string;
				analysis?: {
					summary?: string;
					[key: string]: any;
				};
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

			// Add showcase context if this discussion is about a featured analysis
			// This provides reference context but is NOT subject to analysis
			if (showcaseContext?.title) {
				contextString += `FEATURED ANALYSIS CONTEXT (for reference only - DO NOT ANALYZE this content):\n`;
				contextString += `The user is writing a discussion about the following featured analysis.\n`;
				contextString += `This context is provided for reference only - analyze the user's discussion content, NOT this featured analysis.\n\n`;
				contextString += `Title: ${showcaseContext.title}\n`;
				if (showcaseContext.subtitle) {
					contextString += `Subtitle: ${showcaseContext.subtitle}\n`;
				}
				if (showcaseContext.creator) {
					contextString += `Creator: ${showcaseContext.creator}\n`;
				}
				if (showcaseContext.media_type) {
					contextString += `Media Type: ${showcaseContext.media_type}\n`;
				}
				if (showcaseContext.summary) {
					contextString += `Summary: ${showcaseContext.summary}\n`;
				}
				if (showcaseContext.analysis?.summary) {
					contextString += `Analysis Conclusion: ${showcaseContext.analysis.summary}\n`;
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
		} else if (contextImportData?.content || showcaseContext?.title) {
			// Old format for backward compatibility, or showcase-only context
			let contextString = '';

			// Add showcase context if present
			if (showcaseContext?.title) {
				contextString += `FEATURED ANALYSIS CONTEXT (for reference only - DO NOT ANALYZE this content):
The user is writing a discussion about the following featured analysis.
This context is provided for reference only - analyze the user's discussion content, NOT this featured analysis.

Title: ${showcaseContext.title}
${showcaseContext.subtitle ? `Subtitle: ${showcaseContext.subtitle}` : ''}
${showcaseContext.creator ? `Creator: ${showcaseContext.creator}` : ''}
${showcaseContext.media_type ? `Media Type: ${showcaseContext.media_type}` : ''}
${showcaseContext.summary ? `Summary: ${showcaseContext.summary}` : ''}
${showcaseContext.analysis?.summary ? `Analysis Conclusion: ${showcaseContext.analysis.summary}` : ''}

---

`;
			}

			// Add import context if present
			if (contextImportData?.content) {
				contextString += `IMPORTED SOCIAL MEDIA POST (for context only - not subject to good faith evaluation):
Platform: ${contextImportData.source || 'Unknown'}
Author: ${contextImportData.author || 'Unknown'}
${contextImportData.date ? `Date: ${contextImportData.date}` : ''}
${contextImportData.url ? `URL: ${contextImportData.url}` : ''}

Content:
${contextImportData.content}

---

`;
			}

			contextString += `USER'S RESPONSE (evaluate this for good faith):
${content}
`;
			fullContent = contextString;
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
			let HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || process.env.GRAPHQL_URL;
			const HASURA_GRAPHQL_ADMIN_SECRET =
				process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

			if (!HASURA_GRAPHQL_ADMIN_SECRET) {
				logger.error('HASURA_GRAPHQL_ADMIN_SECRET environment variable is not set');
				return json({ error: 'Server configuration error' }, { status: 500 });
			}

			// Try alternative endpoint URL if the first one doesn't work
			const alternativeEndpoint = HASURA_GRAPHQL_ENDPOINT?.replace('.graphql.', '.hasura.') || '';
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
							'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET || ''
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
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET || ''
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
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET || ''
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
			const scored = await analyzeWithClaude(fullContent);

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

					const HASURA_GRAPHQL_ADMIN_SECRET_CREDIT =
						process.env.HASURA_GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET;

					// Test which endpoint works for credit operations
					const testResponse = await fetch(CREDIT_ENDPOINT, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET_CREDIT || ''
						},
						body: JSON.stringify({ query: `query { contributor(limit: 1) { id } }` })
					});
					const testResult = await testResponse.json();

					if (testResult.error) {
						logger.debug('[DEBUG] Using alternative endpoint for credits');
						CREDIT_ENDPOINT = alternativeEndpoint;
					}

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
								'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET_CREDIT || ''
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
