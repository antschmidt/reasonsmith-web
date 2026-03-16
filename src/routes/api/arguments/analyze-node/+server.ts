import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import type { ArgumentNodeType } from '$lib/types/argument';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-build'
});

// Use Haiku for fast, cheap per-node analysis
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are an expert in argumentation theory, informal logic, and rhetorical analysis. Your task is to analyze a single node from a structured argument graph and identify any rhetorical issues.

You will receive:
- The node's content (the text to analyze)
- The node's type (claim, evidence, source, warrant, qualifier, counter, or rebuttal)
- Optional context: surrounding nodes in the argument graph

## What to look for

1. **Logical Fallacies**: Ad hominem, straw man, false dilemma, appeal to authority, appeal to emotion, slippery slope, circular reasoning, hasty generalization, red herring, tu quoque, bandwagon, false cause, equivocation, etc.

2. **Manipulative Language**: Loaded language, thought-terminating clichés, false urgency, fear-based framing, us-vs-them framing, emotional blackmail, gaslighting language.

3. **Cultish / High-Control Patterns**: In-group/out-group language, absolute certainty without evidence, demand for loyalty over reason, demonization of questioning, black-and-white thinking.

4. **Weak Reasoning**: Weasel words, excessive hedging, anecdotal evidence presented as proof, unfalsifiable claims, circular definitions, unsubstantiated generalizations.

5. **Type-Specific Issues**:
   - **claim**: Is it specific enough to be evaluated? Is it unfalsifiable?
   - **evidence**: Is it anecdotal? Does it actually support the connected claim?
   - **warrant**: Does the reasoning logically connect evidence to claim? Is it a non-sequitur?
   - **counter**: Does it address the actual argument or a straw man?
   - **rebuttal**: Does it actually neutralize the counter, or just dismiss it?
   - **qualifier**: Is it too vague to meaningfully scope the claim?
   - **source**: Is the attribution specific enough to verify?

## Important Guidelines

- Be concise. Each alert should be a focused, actionable observation.
- Only flag genuine issues — do not flag things that are merely stylistic preferences.
- Consider the node type when evaluating. Evidence nodes naturally contain factual claims; that's not "appeal to authority."
- Severity levels: "error" for clear fallacies/manipulation, "warning" for likely issues, "info" for subtle concerns worth noting.
- If the content is well-reasoned and has no issues, return an empty alerts array. Do NOT invent problems.
- Limit to at most 4 alerts per node — focus on the most important issues.`;

const ANALYSIS_TOOL = {
	name: 'report_analysis',
	description:
		'Report the rhetorical analysis results for the argument node. Call this with an empty alerts array if no issues are found.',
	input_schema: {
		type: 'object' as const,
		properties: {
			alerts: {
				type: 'array' as const,
				description: 'Array of rhetorical issues found. Empty if content is well-reasoned.',
				items: {
					type: 'object' as const,
					properties: {
						id: {
							type: 'string' as const,
							description:
								'A short snake_case identifier for this alert type (e.g., "ad_hominem", "vague_claim", "anecdotal_evidence")'
						},
						label: {
							type: 'string' as const,
							description: 'Human-readable label (e.g., "Ad Hominem", "Vague Claim")'
						},
						description: {
							type: 'string' as const,
							description: 'One-sentence description of the issue found'
						},
						explanation: {
							type: 'string' as const,
							description: '2-3 sentence explanation of why this is problematic and how to fix it'
						},
						category: {
							type: 'string' as const,
							enum: ['fallacy', 'manipulative', 'cultish', 'weak'],
							description: 'Category of the rhetorical issue'
						},
						severity: {
							type: 'string' as const,
							enum: ['info', 'warning', 'error'],
							description:
								'How serious this issue is: error=clear fallacy/manipulation, warning=likely issue, info=subtle concern'
						},
						matched_text: {
							type: 'string' as const,
							description:
								'The specific phrase or portion of the content that triggered this alert (verbatim from the input)'
						}
					},
					required: ['id', 'label', 'description', 'explanation', 'category', 'severity']
				}
			},
			overall_quality: {
				type: 'string' as const,
				enum: ['strong', 'adequate', 'weak', 'problematic'],
				description: 'Overall rhetorical quality assessment of this node'
			},
			suggestion: {
				type: 'string' as const,
				description:
					'Optional one-sentence suggestion for improving the node. Omit if the node is strong.'
			}
		},
		required: ['alerts', 'overall_quality']
	}
};

export interface AIAnalysisAlert {
	id: string;
	label: string;
	description: string;
	explanation: string;
	category: 'fallacy' | 'manipulative' | 'cultish' | 'weak';
	severity: 'info' | 'warning' | 'error';
	matchedText?: string;
	source: 'ai';
}

export interface AIAnalysisResult {
	alerts: AIAnalysisAlert[];
	overallQuality: 'strong' | 'adequate' | 'weak' | 'problematic';
	suggestion?: string;
	analyzedAt: string;
	model: string;
}

interface ContextNode {
	type: ArgumentNodeType;
	content: string;
	relationship?: string; // e.g., "supports", "contradicts"
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!process.env.ANTHROPIC_API_KEY) {
			logger.error('ANTHROPIC_API_KEY is not configured');
			return json(
				{ error: 'AI service is not configured. Please contact the administrator.' },
				{ status: 503 }
			);
		}

		const body = await request.json();
		const content: string = body.content;
		const nodeType: ArgumentNodeType = body.nodeType;
		const contextNodes: ContextNode[] = body.contextNodes || [];

		if (!content || typeof content !== 'string') {
			return json({ error: 'Content is required and must be a string.' }, { status: 400 });
		}

		if (!nodeType) {
			return json({ error: 'Node type is required.' }, { status: 400 });
		}

		// Don't analyze very short content — not enough to evaluate
		if (content.trim().length < 10) {
			const emptyResult: AIAnalysisResult = {
				alerts: [],
				overallQuality: 'adequate',
				analyzedAt: new Date().toISOString(),
				model: MODEL
			};
			return json(emptyResult);
		}

		// Truncate very long content to control costs
		const maxContentLength = 2000;
		const trimmedContent =
			content.length > maxContentLength ? content.slice(0, maxContentLength) + '…' : content;

		// Build user prompt
		let userPrompt = `Analyze this argument node for rhetorical issues.\n\n`;
		userPrompt += `**Node Type:** ${nodeType}\n`;
		userPrompt += `**Content:**\n${trimmedContent}\n`;

		if (contextNodes.length > 0) {
			userPrompt += `\n**Context — connected nodes in the argument graph:**\n`;
			for (const ctx of contextNodes.slice(0, 6)) {
				userPrompt += `- [${ctx.type}]${ctx.relationship ? ` (${ctx.relationship})` : ''}: ${ctx.content.slice(0, 200)}\n`;
			}
		}

		logger.info(
			`Analyzing node: type=${nodeType}, content_length=${content.length}, context_nodes=${contextNodes.length}`
		);

		const message = await anthropic.messages.create({
			model: MODEL,
			max_tokens: MAX_TOKENS,
			temperature: 0.1,
			system: SYSTEM_PROMPT,
			tools: [ANALYSIS_TOOL],
			tool_choice: { type: 'tool' as const, name: 'report_analysis' },
			messages: [
				{
					role: 'user',
					content: userPrompt
				}
			]
		});

		// Extract tool use result
		const toolUseBlock = message.content.find(
			(block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
		);

		if (!toolUseBlock) {
			logger.error('No tool use block in Claude response');
			return json({ error: 'AI analysis returned an unexpected format.' }, { status: 500 });
		}

		const rawResult = toolUseBlock.input as {
			alerts?: Array<{
				id: string;
				label: string;
				description: string;
				explanation: string;
				category: string;
				severity: string;
				matched_text?: string;
			}>;
			overall_quality?: string;
			suggestion?: string;
		};

		// Validate and normalize the response
		const validCategories = new Set(['fallacy', 'manipulative', 'cultish', 'weak']);
		const validSeverities = new Set(['info', 'warning', 'error']);
		const validQualities = new Set(['strong', 'adequate', 'weak', 'problematic']);

		const alerts: AIAnalysisAlert[] = (rawResult.alerts || [])
			.slice(0, 4) // Max 4 alerts
			.filter(
				(a) =>
					a.id &&
					a.label &&
					a.description &&
					a.explanation &&
					validCategories.has(a.category) &&
					validSeverities.has(a.severity)
			)
			.map((a) => ({
				id: `ai_${a.id}`,
				label: a.label,
				description: a.description,
				explanation: a.explanation,
				category: a.category as AIAnalysisAlert['category'],
				severity: a.severity as AIAnalysisAlert['severity'],
				matchedText: a.matched_text || undefined,
				source: 'ai' as const
			}));

		const overallQuality = validQualities.has(rawResult.overall_quality || '')
			? (rawResult.overall_quality as AIAnalysisResult['overallQuality'])
			: 'adequate';

		const result: AIAnalysisResult = {
			alerts,
			overallQuality,
			suggestion: rawResult.suggestion || undefined,
			analyzedAt: new Date().toISOString(),
			model: MODEL
		};

		logger.info(
			`Node analysis complete: ${alerts.length} alerts, quality=${overallQuality}, usage=${JSON.stringify(message.usage)}`
		);

		return json(result);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		logger.error('Node analysis error:', message);

		// Don't expose internal errors to the client
		if (message.includes('rate_limit') || message.includes('overloaded')) {
			return json(
				{ error: 'AI service is temporarily busy. Analysis will retry shortly.' },
				{ status: 429 }
			);
		}

		return json(
			{ error: 'AI analysis failed. The regex-based analysis is still available.' },
			{ status: 500 }
		);
	}
};
