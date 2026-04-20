import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import type { ArgumentNodeType, ArgumentEdgeType } from '$lib/types/argument';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

// ReasonSmith is an educator — an expert in logic, good-faith argumentation,
// logical fallacies, and online debate culture, with a talent for meeting
// people where they are. Both synthesis prompts share this persona for the
// "suggestions" field, so feedback reads like a knowledgeable friend helping
// the user shape their thinking, not a rubric-wielding grader.
const REASONSMITH_COACHING_VOICE = `
About the "suggestions" field — this is where ReasonSmith speaks directly to the user.

ReasonSmith is an expert in logic, good-faith argumentation, logical fallacies, and online debate culture, and a talented educator. Suggestions should sound like a knowledgeable, patient friend reading over the user's shoulder — not a grader, not a critic, not a third-person evaluator.

Write every suggestion with this in mind:
- Address the user directly in second person ("you", "your point", "try adding…"). Never say "the user" or "the user's response nodes" or "the counter argument lacks". Those phrases sound like a report about the user rather than a conversation with them.
- Start by acknowledging what they're doing — the move they're making, the intuition behind it — before suggesting how to sharpen it. If a point is underdeveloped, name the shape of the good-faith version they seem to be reaching for, then coach them toward it.
- Explain the *why* of the suggestion in plain language. Name the structural role at stake (e.g., "a qualifier works best when it names the specific scope you're limiting — 'in industrialized dairy contexts', not just 'it depends'"). Tie the suggestion to how the argument will land with the other side.
- If you spot a common fallacy, cult-language pattern, or bad-faith tic, name it gently and neutrally — not as an accusation, but as a pattern the user can recognize and avoid. Assume the user wants to argue honestly; help them do it better.
- Keep each suggestion to 1–3 short sentences. Be specific, concrete, and actionable. Don't pile on — a few sharp pointers beat a long list.
- If the response is very thin, say so kindly and suggest the single next move that would do the most work (e.g., "your counter is doing a lot of work without much behind it — adding even one piece of concrete evidence or a short personal example would give it real bite").

Write the draft/comment in the user's voice; write the suggestions in ReasonSmith's voice.`;

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
9. Output the draft in Markdown format
${REASONSMITH_COACHING_VOICE}`;

const COMMENT_SYNTHESIS_SYSTEM_PROMPT = `You are helping a user write a reply comment to an existing discussion.

You will be given:
- The EXISTING ARGUMENT the user is responding to (the discussion's root claim, its supporting evidence, warrants, etc.). This is context only — do not rewrite or restate it in full.
- The USER'S RESPONSE NODES — claims, counters, evidence, rebuttals, etc. that the user has added to express their reply. These are what you must synthesize.

Your task: turn the user's response nodes into a coherent, well-reasoned reply comment that engages with the existing argument from the user's position.

Guidelines:
1. Write in first person, as the user — not as a neutral observer.
2. Do NOT restate the full existing argument. You may briefly reference the specific claim or evidence the user is engaging with, so the reader knows what is being responded to.
3. Integrate the user's response nodes into a natural reply — lead with their strongest point, support it with their evidence/warrants, and address their counters and rebuttals fairly.
4. Respect the structural role of each node (evidence supports a claim; a counter objects to something; a rebuttal defends against a counter; a qualifier limits scope).
5. Use a conversational but substantive tone — this is a comment, not an academic paper.
6. Keep it focused and proportionate to what the user wrote. Don't pad or invent new claims they didn't make.
7. Output the comment in Markdown.
${REASONSMITH_COACHING_VOICE}`;

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
				description:
					"Short coaching notes written directly to the user in ReasonSmith's voice (second person, warm and educator-ly). Each suggestion should acknowledge what the user is trying to do, then offer a concrete, specific way to sharpen it — never clinical third-person critique. 1–3 sentences each."
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

type SynthesizeMode = 'full' | 'comment';

interface SynthesizeRequestBody {
	nodes: SynthesizeNode[];
	edges: SynthesizeEdge[];
	title?: string;
	/**
	 * Synthesis mode:
	 *   - 'full'    (default): produce a complete written draft from the whole
	 *                graph, treating the root claim as the thesis.
	 *   - 'comment': produce a reply comment from the user's response nodes,
	 *                using the rest of the graph as context (what they're
	 *                responding to). Requires response_node_ids.
	 */
	mode?: SynthesizeMode;
	/** Required when mode === 'comment'. IDs of the user's own nodes (their draft). */
	response_node_ids?: string[];
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

/**
 * Build the user prompt for comment-mode synthesis. Partitions nodes into
 * "context" (what the user is responding to) and "response" (the user's own
 * draft nodes), and labels edges by side.
 */
function buildCommentPrompt(
	nodes: SynthesizeNode[],
	edges: SynthesizeEdge[],
	responseNodeIds: string[],
	title?: string
): string {
	const lines: string[] = [];
	const responseSet = new Set(responseNodeIds);

	const responseNodes = nodes.filter((n) => responseSet.has(n.id));
	const contextNodes = nodes.filter((n) => !responseSet.has(n.id));

	const nodeMap = new Map<string, SynthesizeNode>();
	for (const node of nodes) nodeMap.set(node.id, node);

	if (title) {
		lines.push(`Discussion: ${title}`);
		lines.push('');
	}

	// Context: the existing argument the user is responding to.
	lines.push('=== EXISTING ARGUMENT (context — do NOT rewrite) ===');
	const contextRoot = contextNodes.find((n) => n.is_root);
	if (contextRoot) {
		lines.push(`Root claim: ${contextRoot.content}`);
	}
	const nonRootContext = contextNodes.filter((n) => !n.is_root);
	if (nonRootContext.length > 0) {
		lines.push('Supporting nodes:');
		for (const n of nonRootContext) {
			const impliedTag = n.implied ? ' (implied)' : '';
			lines.push(`- [${n.type}${impliedTag}] ${n.content}`);
		}
	}
	lines.push('');

	// The user's response nodes.
	lines.push("=== USER'S RESPONSE NODES (synthesize THESE into a reply comment) ===");
	if (responseNodes.length === 0) {
		lines.push('(none — the user has not yet added any response nodes)');
	} else {
		for (const n of responseNodes) {
			const impliedTag = n.implied ? ' (implied)' : '';
			const rootTag = n.is_root ? ' (ROOT)' : '';
			lines.push(`- [${n.type}${rootTag}${impliedTag}] ${n.content}`);
		}
	}
	lines.push('');

	// Relationships. Tag each edge by how it crosses the context/response
	// boundary so the model can see what the user's response engages with.
	if (edges.length > 0) {
		lines.push('=== RELATIONSHIPS ===');
		for (const edge of edges) {
			const fromNode = nodeMap.get(edge.from_node);
			const toNode = nodeMap.get(edge.to_node);
			if (!fromNode || !toNode) continue;

			const fromSide = responseSet.has(edge.from_node) ? 'response' : 'context';
			const toSide = responseSet.has(edge.to_node) ? 'response' : 'context';
			let tag = 'context→context';
			if (fromSide === 'response' && toSide === 'context') tag = 'response→context';
			else if (fromSide === 'response' && toSide === 'response') tag = 'response→response';
			else if (fromSide === 'context' && toSide === 'response') tag = 'context→response';

			const fromContent =
				fromNode.content.length > 120
					? fromNode.content.substring(0, 120) + '...'
					: fromNode.content;
			const toContent =
				toNode.content.length > 120
					? toNode.content.substring(0, 120) + '...'
					: toNode.content;
			lines.push(`- [${tag}] "${fromContent}" --${edge.type}--> "${toContent}"`);
		}
		lines.push('');
	}

	lines.push(
		"Please synthesize the user's response nodes into a reply comment that engages with the existing argument from their position. Do not restate the existing argument; respond to it."
	);

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
		const mode: SynthesizeMode = body.mode === 'comment' ? 'comment' : 'full';
		const responseNodeIds: string[] = Array.isArray(body.response_node_ids)
			? body.response_node_ids.filter((id): id is string => typeof id === 'string')
			: [];

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

		// 3b. Comment-mode validation: response_node_ids must reference real nodes.
		if (mode === 'comment') {
			if (responseNodeIds.length === 0) {
				return json(
					{ error: 'Comment-mode synthesis requires at least one response node.' },
					{ status: 400 }
				);
			}
			const nodeIdSet = new Set(nodes.map((n) => n.id));
			const unknown = responseNodeIds.filter((id) => !nodeIdSet.has(id));
			if (unknown.length > 0) {
				return json(
					{
						error: `response_node_ids contains unknown node id(s): ${unknown.join(', ')}`
					},
					{ status: 400 }
				);
			}
		}

		logger.info(
			`Synthesis request: mode=${mode}, ${nodes.length} nodes, ${edges.length} edges, ` +
				`response_nodes=${responseNodeIds.length}, title="${title || '(none)'}"`
		);

		// 5. Build the user prompt and pick the system prompt based on mode.
		const userPrompt =
			mode === 'comment'
				? buildCommentPrompt(nodes, edges, responseNodeIds, title)
				: buildUserPrompt(nodes, edges, title);
		const systemPrompt =
			mode === 'comment' ? COMMENT_SYNTHESIS_SYSTEM_PROMPT : SYNTHESIS_SYSTEM_PROMPT;

		logger.debug(`User prompt length: ${userPrompt.length} characters`);

		// 6. Call Claude
		const message = await anthropic.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 8192,
			temperature: 0.4,
			system: systemPrompt,
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
