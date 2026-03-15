import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '$lib/logger';
import type {
	ExtractionResult,
	ArgumentNodeType,
	ArgumentEdgeType,
	StructuralFlagType
} from '$lib/types/argument';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
});

const EXTRACTION_SYSTEM_PROMPT = `You are an expert argument analyst specializing in Toulmin argumentation and informal logic. Your task is to decompose a piece of text into a structured argument graph.

## Argument Graph Model

You will extract the following node types:
- **claim**: A thesis, assertion, or conclusion the author is making. One claim must be designated the root claim.
- **evidence**: Empirical data, statistics, observations, examples, or factual statements used to support a claim.
- **source**: The origin of a piece of evidence (study, article, author, institution, publication).
- **warrant**: The logical bridge or reasoning principle that explains WHY a piece of evidence supports a claim. Warrants are often implicit/unstated.
- **qualifier**: A scope limiter or hedge on a claim ("usually", "in most cases", "for developed nations").
- **counter**: An opposing argument, objection, or challenge to a claim.
- **rebuttal**: A response that addresses or neutralizes a counter-argument.

And the following edge types:
- **supports**: Evidence or claim strengthens another claim.
- **contradicts**: A counter-argument weakens or opposes a claim.
- **rebuts**: A rebuttal neutralizes a counter-argument.
- **warrants**: A warrant justifies the logical connection between evidence and a claim.
- **cites**: Evidence traces back to a source.
- **qualifies**: A qualifier scopes or limits a claim.
- **derives_from**: A sub-claim follows logically from another claim.

## Instructions

1. Read the text carefully and identify all argumentative elements.
2. Assign each node a temporary ID like "n1", "n2", etc.
3. Identify the single root claim (the main thesis).
4. For each piece of evidence, try to identify its source. If no source is stated, do not fabricate one.
5. Identify warrants — the unstated reasoning connecting evidence to claims. Mark these as implied=true with clear articulation of the reasoning principle.
6. Look for qualifiers, counter-arguments, and rebuttals.
7. Create edges connecting the nodes with appropriate types and confidence scores.
8. For warrant nodes, specify which evidence node they draw from (draws_from) and which claim they justify (justifies).
9. Note any structural issues (unsupported claims, missing warrants, uncited evidence, unaddressed counters, speculation chains).
10. Compute a completeness score (0-100) based on how many element types are present and how well-connected the graph is.
11. If a node's content comes directly from the source text, include the verbatim span.

## Quality Guidelines

- Be thorough: extract ALL argumentative elements, including implicit ones.
- Be precise: each node should capture exactly one idea.
- Be charitable: represent the author's arguments in their strongest form.
- Mark implied elements clearly.
- Confidence scores for edges should reflect how explicitly the connection is stated (1.0 = explicit, 0.5-0.8 = strongly implied, < 0.5 = weakly implied).
- The completeness score should reflect: evidence present (+20), source present (+20), counter present (+20), rebuttal present (+20), warrant present (+20).`;

const EXTRACTION_TOOL = {
	name: 'extract_argument_graph',
	description:
		'Extract a structured argument graph from text, identifying claims, evidence, warrants, sources, counters, rebuttals, qualifiers, and the relationships between them.',
	input_schema: {
		type: 'object' as const,
		properties: {
			root_claim: {
				type: 'string',
				description: 'The temporary node ID (e.g., "n1") of the root/main claim'
			},
			nodes: {
				type: 'array',
				description: 'All argument nodes extracted from the text',
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							description: 'Temporary node ID (e.g., "n1", "n2")'
						},
						type: {
							type: 'string',
							enum: [
								'claim',
								'evidence',
								'source',
								'warrant',
								'qualifier',
								'counter',
								'rebuttal'
							],
							description: 'The type of argument element'
						},
						content: {
							type: 'string',
							description:
								'The content of this node. For implied elements, articulate what is being assumed.'
						},
						verbatim_span: {
							type: 'string',
							description:
								'The exact text from the source document, if this node maps directly to source text. Omit for implied/synthesized nodes.'
						},
						implied: {
							type: 'boolean',
							description:
								'Whether this element is implicit/unstated in the original text'
						}
					},
					required: ['id', 'type', 'content', 'implied']
				}
			},
			edges: {
				type: 'array',
				description: 'Directed edges connecting nodes',
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							description: 'Temporary edge ID (e.g., "e1", "e2")'
						},
						from: {
							type: 'string',
							description: 'Source node temporary ID'
						},
						to: {
							type: 'string',
							description: 'Target node temporary ID'
						},
						type: {
							type: 'string',
							enum: [
								'supports',
								'contradicts',
								'rebuts',
								'warrants',
								'cites',
								'qualifies',
								'derives_from'
							],
							description: 'The type of relationship'
						},
						confidence: {
							type: 'number',
							description:
								'How confident you are in this edge (0-1). 1.0 = explicitly stated, lower = implied'
						}
					},
					required: ['id', 'from', 'to', 'type', 'confidence']
				}
			},
			warrant_connections: {
				type: 'array',
				description:
					'For each warrant node, specify which evidence it draws from and which claim it justifies',
				items: {
					type: 'object',
					properties: {
						warrant_node_id: {
							type: 'string',
							description: 'The temporary ID of the warrant node'
						},
						draws_from: {
							type: 'string',
							description:
								'The temporary ID of the evidence node this warrant draws from'
						},
						justifies: {
							type: 'string',
							description: 'The temporary ID of the claim node this warrant justifies'
						}
					},
					required: ['warrant_node_id', 'draws_from', 'justifies']
				}
			},
			structural_flags: {
				type: 'array',
				description: 'Structural issues identified in the argument',
				items: {
					type: 'string',
					enum: [
						'unsupported_claim',
						'missing_warrant',
						'uncited_evidence',
						'unaddressed_counter',
						'speculation_chain'
					]
				}
			},
			completeness_score: {
				type: 'number',
				description:
					'Overall completeness score 0-100 based on variety and connectivity of elements'
			},
			notes: {
				type: 'string',
				description:
					'Brief analyst notes about the argument structure, strengths, and weaknesses'
			}
		},
		required: [
			'root_claim',
			'nodes',
			'edges',
			'warrant_connections',
			'structural_flags',
			'completeness_score',
			'notes'
		]
	}
};

const VALID_NODE_TYPES: Set<string> = new Set([
	'claim',
	'evidence',
	'source',
	'warrant',
	'qualifier',
	'counter',
	'rebuttal'
]);

const VALID_EDGE_TYPES: Set<string> = new Set([
	'supports',
	'contradicts',
	'rebuts',
	'warrants',
	'cites',
	'qualifies',
	'derives_from'
]);

const VALID_FLAG_TYPES: Set<string> = new Set([
	'unsupported_claim',
	'missing_warrant',
	'uncited_evidence',
	'unaddressed_counter',
	'speculation_chain'
]);

function validateExtractionResult(data: Record<string, unknown>): ExtractionResult {
	// Validate root_claim
	if (typeof data.root_claim !== 'string' || !data.root_claim) {
		throw new Error('Missing or invalid root_claim');
	}

	// Validate nodes
	if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
		throw new Error('Missing or empty nodes array');
	}

	const nodeIds = new Set<string>();
	const validatedNodes = data.nodes.map((node: Record<string, unknown>, i: number) => {
		if (typeof node.id !== 'string' || !node.id) {
			throw new Error(`Node at index ${i} has missing or invalid id`);
		}
		if (nodeIds.has(node.id)) {
			throw new Error(`Duplicate node id: ${node.id}`);
		}
		nodeIds.add(node.id);

		if (typeof node.type !== 'string' || !VALID_NODE_TYPES.has(node.type)) {
			throw new Error(`Node ${node.id} has invalid type: ${node.type}`);
		}
		if (typeof node.content !== 'string' || !node.content.trim()) {
			throw new Error(`Node ${node.id} has missing or empty content`);
		}

		return {
			id: node.id,
			type: node.type as ArgumentNodeType,
			content: node.content.trim(),
			verbatim_span:
				typeof node.verbatim_span === 'string' ? node.verbatim_span : undefined,
			implied: Boolean(node.implied)
		};
	});

	// Validate root_claim references a valid node
	if (!nodeIds.has(data.root_claim as string)) {
		throw new Error(`root_claim "${data.root_claim}" does not match any node id`);
	}

	// Validate the root claim node is actually a claim type
	const rootNode = validatedNodes.find((n) => n.id === data.root_claim);
	if (rootNode && rootNode.type !== 'claim') {
		throw new Error(
			`root_claim "${data.root_claim}" points to a ${rootNode.type} node, not a claim`
		);
	}

	// Validate edges
	const validatedEdges = Array.isArray(data.edges)
		? data.edges
				.map((edge: Record<string, unknown>, i: number) => {
					if (typeof edge.id !== 'string' || !edge.id) {
						logger.warn(`Edge at index ${i} has missing id, generating one`);
						edge.id = `e${i + 1}`;
					}
					if (typeof edge.from !== 'string' || !nodeIds.has(edge.from)) {
						logger.warn(
							`Edge ${edge.id} references invalid from node: ${edge.from}, skipping`
						);
						return null;
					}
					if (typeof edge.to !== 'string' || !nodeIds.has(edge.to)) {
						logger.warn(
							`Edge ${edge.id} references invalid to node: ${edge.to}, skipping`
						);
						return null;
					}
					if (typeof edge.type !== 'string' || !VALID_EDGE_TYPES.has(edge.type)) {
						logger.warn(
							`Edge ${edge.id} has invalid type: ${edge.type}, skipping`
						);
						return null;
					}

					const confidence =
						typeof edge.confidence === 'number'
							? Math.max(0, Math.min(1, edge.confidence))
							: 1.0;

					return {
						id: edge.id as string,
						from: edge.from as string,
						to: edge.to as string,
						type: edge.type as ArgumentEdgeType,
						confidence
					};
				})
				.filter(Boolean)
		: [];

	// Validate warrant_connections
	const validatedWarrantConnections = Array.isArray(data.warrant_connections)
		? data.warrant_connections
				.map((wc: Record<string, unknown>) => {
					if (
						typeof wc.warrant_node_id !== 'string' ||
						!nodeIds.has(wc.warrant_node_id)
					) {
						logger.warn(
							`Warrant connection references invalid warrant node: ${wc.warrant_node_id}, skipping`
						);
						return null;
					}
					if (typeof wc.draws_from !== 'string' || !nodeIds.has(wc.draws_from)) {
						logger.warn(
							`Warrant connection references invalid draws_from node: ${wc.draws_from}, skipping`
						);
						return null;
					}
					if (typeof wc.justifies !== 'string' || !nodeIds.has(wc.justifies)) {
						logger.warn(
							`Warrant connection references invalid justifies node: ${wc.justifies}, skipping`
						);
						return null;
					}

					return {
						warrant_node_id: wc.warrant_node_id as string,
						draws_from: wc.draws_from as string,
						justifies: wc.justifies as string
					};
				})
				.filter(Boolean)
		: [];

	// Validate structural_flags
	const validatedFlags = Array.isArray(data.structural_flags)
		? (data.structural_flags.filter(
				(f: unknown) => typeof f === 'string' && VALID_FLAG_TYPES.has(f)
			) as StructuralFlagType[])
		: [];

	// Validate completeness_score
	const completenessScore =
		typeof data.completeness_score === 'number'
			? Math.max(0, Math.min(100, Math.round(data.completeness_score)))
			: 0;

	// Validate notes
	const notes = typeof data.notes === 'string' ? data.notes : '';

	return {
		root_claim: data.root_claim as string,
		nodes: validatedNodes,
		edges: validatedEdges as ExtractionResult['edges'],
		warrant_connections: validatedWarrantConnections as ExtractionResult['warrant_connections'],
		structural_flags: validatedFlags,
		completeness_score: completenessScore,
		notes
	};
}

export const POST: RequestHandler = async ({ request }) => {
	logger.info('=== Argument extraction API endpoint called ===');

	try {
		// Validate API key is configured
		if (!process.env.ANTHROPIC_API_KEY) {
			logger.error('ANTHROPIC_API_KEY is not configured');
			return json(
				{ error: 'AI service is not configured. Please contact the administrator.' },
				{ status: 503 }
			);
		}

		const body = await request.json();
		const { text } = body as { text?: string };

		if (typeof text !== 'string' || !text.trim()) {
			return json(
				{ error: 'Text content is required for extraction.' },
				{ status: 400 }
			);
		}

		const trimmedText = text.trim();
		const textLength = trimmedText.length;

		logger.info(`Extraction request received: ${textLength} characters`);

		// Enforce reasonable limits
		if (textLength < 20) {
			return json(
				{ error: 'Text is too short for meaningful argument extraction. Please provide at least a paragraph.' },
				{ status: 400 }
			);
		}

		if (textLength > 100_000) {
			return json(
				{ error: 'Text exceeds the maximum length of 100,000 characters. Please shorten your input.' },
				{ status: 400 }
			);
		}

		// Choose model and max_tokens based on content length
		const model =
			textLength > 10_000 ? 'claude-sonnet-4-20250514' : 'claude-sonnet-4-20250514';
		const maxTokens = textLength > 10_000 ? 16384 : 8192;

		logger.info(`Using model: ${model}, max_tokens: ${maxTokens}`);

		const userPrompt = `Analyze the following text and extract its complete argument structure using the extract_argument_graph tool.

Be thorough — identify every claim, piece of evidence, source, warrant (especially implied ones), qualifier, counter-argument, and rebuttal present in the text. For warrants, articulate the unstated reasoning principle that connects evidence to claims.

<text>
${trimmedText}
</text>`;

		const message = await anthropic.messages.create({
			model,
			max_tokens: maxTokens,
			temperature: 0.2,
			system: EXTRACTION_SYSTEM_PROMPT,
			tools: [EXTRACTION_TOOL],
			tool_choice: { type: 'tool', name: 'extract_argument_graph' },
			messages: [
				{
					role: 'user',
					content: userPrompt
				}
			]
		});

		logger.info(`Claude response: stop_reason=${message.stop_reason}, usage=${JSON.stringify(message.usage)}`);

		// Check for truncation
		if (message.stop_reason === 'max_tokens') {
			logger.warn(
				'Claude response was truncated due to max_tokens. The extraction may be incomplete.'
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
				{ error: 'AI did not return a structured extraction. Please try again.' },
				{ status: 502 }
			);
		}

		const rawInput = toolUseBlock.input as Record<string, unknown>;

		logger.info(
			`Extraction raw result: ${(rawInput.nodes as unknown[])?.length || 0} nodes, ${(rawInput.edges as unknown[])?.length || 0} edges`
		);

		// Validate and sanitize the extraction result
		let result: ExtractionResult;
		try {
			result = validateExtractionResult(rawInput);
		} catch (validationError: any) {
			logger.error('Extraction validation failed:', validationError.message);
			return json(
				{
					error: `Extraction produced invalid data: ${validationError.message}. Please try again.`
				},
				{ status: 502 }
			);
		}

		logger.info(
			`Extraction validated: ${result.nodes.length} nodes, ${result.edges.length} edges, completeness=${result.completeness_score}`
		);
		logger.info(
			`Node types: ${result.nodes.map((n) => n.type).join(', ')}`
		);
		logger.info(
			`Structural flags: ${result.structural_flags.length > 0 ? result.structural_flags.join(', ') : 'none'}`
		);

		return json(result);
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

		logger.error('Argument extraction endpoint error:', err);
		return json(
			{ error: err?.message || 'An unexpected error occurred during extraction.' },
			{ status: 500 }
		);
	}
};
