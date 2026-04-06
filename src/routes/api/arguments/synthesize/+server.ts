import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import type { ArgumentNodeType, ArgumentEdgeType } from '$lib/types/argument';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

const SYNTHESIS_SYSTEM_PROMPT = `You are an expert academic writer. Given a structured argument graph, your task is to synthesize it into a clear, well-organized written draft.

The argument graph contains:
- Claims (thesis statements and sub-assertions)
- Evidence (data, statistics, examples)
- Sources (citations and references)
- Warrants (logical bridges between evidence and claims)
- Qualifiers (scope limiters)
- Counter-arguments (objections)
- Rebuttals (responses to counters)

Guidelines:
1. Open with the root claim as the thesis statement
2. Organize supporting evidence under relevant claims
3. Integrate warrants as explanatory reasoning
4. Address counter-arguments and rebuttals fairly
5. Include qualifiers where they appear
6. Cite sources where they exist
7. Use clear, academic prose with logical transitions
8. Maintain the author's argument structure and reasoning
9. Output the draft in Markdown format`;

const SYNTHESIS_TOOL = {
	name: 'synthesize_draft',
	description: 'Synthesize a structured argument graph into a coherent written draft',
	input_schema: {
		type: 'object' as const,
		properties: {
			draft: {
				type: 'string',
				description: 'The synthesized draft in Markdown format'
			},
			outline: {
				type: 'array',
				items: { type: 'string' },
				description: 'Section headings/outline of the draft'
			},
			suggestions: {
				type: 'array',
				items: { type: 'string' },
				description: 'Suggestions for improving the argument'
			}
		},
		required: ['draft', 'outline', 'suggestions']
	}
};

const VALID_NODE_TYPES: ArgumentNodeType[] = [
	'claim',
	'evidence',
	'source',
	'warrant',
	'qualifier',
	'counter',
	'rebuttal'
];

const VALID_EDGE_TYPES: ArgumentEdgeType[] = [
	'supports',
	'contradicts',
	'rebuts',
	'warrants',
	'cites',
	'qualifies',
	'derives_from'
];

interface SynthesizeNode {
	id: string;
	type: ArgumentNodeType;
	content: string;
	is_root: boolean;
	implied: boolean;
}

interface SynthesizeEdge {
	id: string;
	from_node: string;
	to_node: string;
	type: ArgumentEdgeType;
}

interface SynthesizeRequestBody {
	nodes: SynthesizeNode[];
	edges: SynthesizeEdge[];
	title?: string;
}

function buildUserPrompt(nodes: SynthesizeNode[], edges: SynthesizeEdge[], title?: string): string {
	const lines: string[] = [];

	// Title
	if (title) {
		lines.push(`Title: ${title}`);
		lines.push('');
	}

	// Root claim
	const rootNode = nodes.find((n) => n.is_root);
	if (rootNode) {
		lines.push('ROOT CLAIM:');
		lines.push(rootNode.content);
		lines.push('');
	}

	// Build a map from node ID to node for edge descriptions
	const nodeMap = new Map<string, SynthesizeNode>();
	for (const node of nodes) {
		nodeMap.set(node.id, node);
	}

	// All nodes grouped by type
	lines.push('NODES:');
	for (const node of nodes) {
		const impliedTag = node.implied ? ' (implied)' : '';
		const rootTag = node.is_root ? ' (ROOT)' : '';
		lines.push(`- [${node.type}${rootTag}${impliedTag}] ${node.content}`);
	}
	lines.push('');

	// Relationships
	if (edges.length > 0) {
		lines.push('RELATIONSHIPS:');
		for (const edge of edges) {
			const fromNode = nodeMap.get(edge.from_node);
			const toNode = nodeMap.get(edge.to_node);
			if (fromNode && toNode) {
				// Truncate long content for readability in the prompt
				const fromContent =
					fromNode.content.length > 120
						? fromNode.content.substring(0, 120) + '...'
						: fromNode.content;
				const toContent =
					toNode.content.length > 120
						? toNode.content.substring(0, 120) + '...'
						: toNode.content;
				lines.push(`- "${fromContent}" --${edge.type}--> "${toContent}"`);
			}
		}
		lines.push('');
	}

	lines.push('Please synthesize this argument graph into a well-structured written draft.');

	return lines.join('\n');
}

export const POST: RequestHandler = async ({ request }) => {
	logger.info('=== Argument synthesis API endpoint called ===');

	try {
		// 1. Validate API key exists
		if (!process.env.ANTHROPIC_API_KEY) {
			logger.error('ANTHROPIC_API_KEY is not configured');
			return json(
				{ error: 'AI service is not configured. Please contact the administrator.' },
				{ status: 503 }
			);
		}

		// 2. Parse and validate request body
		const body = (await request.json()) as SynthesizeRequestBody;
		const { nodes, edges, title } = body;

		if (!Array.isArray(nodes) || nodes.length === 0) {
			return json(
				{ error: 'A non-empty nodes array is required for synthesis.' },
				{ status: 400 }
			);
		}

		if (!Array.isArray(edges)) {
			return json(
				{ error: 'An edges array is required for synthesis (can be empty).' },
				{ status: 400 }
			);
		}

		// 4. Validate reasonable limits
		if (nodes.length > 200) {
			return json(
				{
					error: `Too many nodes (${nodes.length}). Maximum is 200 nodes for synthesis.`
				},
				{ status: 400 }
			);
		}

		// Validate node structure
		for (const node of nodes) {
			if (!node.id || typeof node.id !== 'string') {
				return json({ error: 'Each node must have a string id.' }, { status: 400 });
			}
			if (!node.content || typeof node.content !== 'string') {
				return json(
					{ error: `Node "${node.id}" is missing content.` },
					{ status: 400 }
				);
			}
			if (!VALID_NODE_TYPES.includes(node.type)) {
				return json(
					{
						error: `Node "${node.id}" has invalid type "${node.type}". Valid types: ${VALID_NODE_TYPES.join(', ')}`
					},
					{ status: 400 }
				);
			}
		}

		// Validate edge structure
		const nodeIds = new Set(nodes.map((n) => n.id));
		for (const edge of edges) {
			if (!edge.id || typeof edge.id !== 'string') {
				return json({ error: 'Each edge must have a string id.' }, { status: 400 });
			}
			if (!edge.from_node || !nodeIds.has(edge.from_node)) {
				return json(
					{
						error: `Edge "${edge.id}" references unknown from_node "${edge.from_node}".`
					},
					{ status: 400 }
				);
			}
			if (!edge.to_node || !nodeIds.has(edge.to_node)) {
				return json(
					{
						error: `Edge "${edge.id}" references unknown to_node "${edge.to_node}".`
					},
					{ status: 400 }
				);
			}
			if (!VALID_EDGE_TYPES.includes(edge.type)) {
				return json(
					{
						error: `Edge "${edge.id}" has invalid type "${edge.type}". Valid types: ${VALID_EDGE_TYPES.join(', ')}`
					},
					{ status: 400 }
				);
			}
		}

		// 3. Find the root claim node
		const rootNode = nodes.find((n) => n.is_root === true);
		if (!rootNode) {
			return json(
				{
					error:
						'No root claim found. At least one node must have is_root set to true.'
				},
				{ status: 400 }
			);
		}

		if (rootNode.type !== 'claim') {
			logger.warn(
				`Root node "${rootNode.id}" has type "${rootNode.type}" instead of "claim". Proceeding anyway.`
			);
		}

		logger.info(
			`Synthesis request: ${nodes.length} nodes, ${edges.length} edges, title="${title || '(none)'}"`
		);

		// 5. Build the user prompt
		const userPrompt = buildUserPrompt(nodes, edges, title);

		logger.debug(`User prompt length: ${userPrompt.length} characters`);

		// 6. Call Claude
		const message = await anthropic.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 8192,
			temperature: 0.4,
			system: SYNTHESIS_SYSTEM_PROMPT,
			tools: [SYNTHESIS_TOOL],
			tool_choice: { type: 'tool', name: 'synthesize_draft' },
			messages: [
				{
					role: 'user',
					content: userPrompt
				}
			]
		});

		logger.info(
			`Claude response: stop_reason=${message.stop_reason}, usage=${JSON.stringify(message.usage)}`
		);

		// Check for truncation
		if (message.stop_reason === 'max_tokens') {
			logger.warn(
				'Claude response was truncated due to max_tokens. The synthesis may be incomplete.'
			);
		}

		// Find the tool_use block
		const toolUseBlock = message.content.find((block) => block.type === 'tool_use');

		if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
			logger.error('No tool_use block found in Claude response');
			logger.error(
				'Response content types:',
				message.content.map((b) => b.type)
			);
			return json(
				{ error: 'AI did not return a structured synthesis. Please try again.' },
				{ status: 502 }
			);
		}

		const rawInput = toolUseBlock.input as Record<string, unknown>;

		// Validate the response structure
		if (typeof rawInput.draft !== 'string' || !rawInput.draft.trim()) {
			logger.error('Claude returned empty or invalid draft');
			return json(
				{ error: 'AI returned an empty draft. Please try again.' },
				{ status: 502 }
			);
		}

		const draft = rawInput.draft as string;

		const outline: string[] = Array.isArray(rawInput.outline)
			? (rawInput.outline as unknown[])
					.filter((item): item is string => typeof item === 'string')
			: [];

		const suggestions: string[] = Array.isArray(rawInput.suggestions)
			? (rawInput.suggestions as unknown[])
					.filter((item): item is string => typeof item === 'string')
			: [];

		logger.info(
			`Synthesis complete: draft=${draft.length} chars, ${outline.length} outline sections, ${suggestions.length} suggestions`
		);

		return json({
			draft,
			outline,
			suggestions
		});
	} catch (err: any) {
		// Handle specific Anthropic API errors
		if (err?.status === 429) {
			logger.warn('Anthropic rate limit hit');
			return json(
				{ error: 'AI service is temporarily rate-limited. Please wait a moment and try again.' },
				{ status: 429 }
			);
		}

		if (err?.status === 401 || err?.status === 403) {
			logger.error('Anthropic authentication error');
			return json(
				{ error: 'AI service authentication failed. Please contact the administrator.' },
				{ status: 503 }
			);
		}

		if (err?.error?.type === 'overloaded_error') {
			logger.warn('Anthropic API overloaded');
			return json(
				{ error: 'AI service is currently overloaded. Please try again in a few moments.' },
				{ status: 503 }
			);
		}

		logger.error('Argument synthesis endpoint error:', err);
		return json(
			{ error: err?.message || 'An unexpected error occurred during synthesis.' },
			{ status: 500 }
		);
	}
};
