/**
 * Argument Graph Utility Functions
 *
 * Pure functions for computing completeness scores, structural flags,
 * and coach prompts based on the current argument graph state.
 */

import type {
	ArgumentNode,
	ArgumentEdge,
	ArgumentNodeType,
	CompletenessScore,
	StructuralFlag,
	StructuralFlagType,
	CoachPrompt,
	NODE_TYPE_CONFIGS
} from '$lib/types/argument';

// ============================================
// Completeness Score
// ============================================

/**
 * Calculate the completeness score for an argument based on node types present.
 * Each type present adds 20 points (5 types × 20 = 100 max).
 */
export function computeCompletenessScore(nodes: ArgumentNode[]): CompletenessScore {
	const hasEvidence = nodes.some((n) => n.type === 'evidence');
	const hasSource = nodes.some((n) => n.type === 'source');
	const hasCounter = nodes.some((n) => n.type === 'counter');
	const hasRebuttal = nodes.some((n) => n.type === 'rebuttal');
	const hasWarrant = nodes.some((n) => n.type === 'warrant');

	const score =
		(hasEvidence ? 20 : 0) +
		(hasSource ? 20 : 0) +
		(hasCounter ? 20 : 0) +
		(hasRebuttal ? 20 : 0) +
		(hasWarrant ? 20 : 0);

	return {
		score,
		hasEvidence,
		hasSource,
		hasCounter,
		hasRebuttal,
		hasWarrant
	};
}

// ============================================
// Structural Flags
// ============================================

/**
 * Compute structural flags for an argument graph.
 * Returns an array of issues that should be addressed.
 */
export function computeStructuralFlags(
	nodes: ArgumentNode[],
	edges: ArgumentEdge[]
): StructuralFlag[] {
	const flags: StructuralFlag[] = [];

	// Build lookup maps for efficient querying
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const incomingEdges = new Map<string, ArgumentEdge[]>();
	const outgoingEdges = new Map<string, ArgumentEdge[]>();

	for (const edge of edges) {
		// Incoming edges (edges pointing TO a node)
		if (!incomingEdges.has(edge.to_node)) {
			incomingEdges.set(edge.to_node, []);
		}
		incomingEdges.get(edge.to_node)!.push(edge);

		// Outgoing edges (edges going FROM a node)
		if (!outgoingEdges.has(edge.from_node)) {
			outgoingEdges.set(edge.from_node, []);
		}
		outgoingEdges.get(edge.from_node)!.push(edge);
	}

	// Check each node for structural issues
	for (const node of nodes) {
		const incoming = incomingEdges.get(node.id) || [];
		const outgoing = outgoingEdges.get(node.id) || [];

		// 1. Unsupported claim: claim with no incoming supports/derives_from edges
		if (node.type === 'claim' && !node.is_root) {
			const hasSupportOrDerivation = incoming.some(
				(e) => e.type === 'supports' || e.type === 'derives_from'
			);
			if (!hasSupportOrDerivation) {
				flags.push({
					type: 'unsupported_claim',
					nodeId: node.id,
					message: `Claim "${truncate(node.content)}" has no supporting evidence or derivation`,
					severity: 'warning'
				});
			}
		}

		// 2. Uncited evidence: evidence with no outgoing cites edge
		if (node.type === 'evidence') {
			const hasCitation = outgoing.some((e) => e.type === 'cites');
			if (!hasCitation) {
				flags.push({
					type: 'uncited_evidence',
					nodeId: node.id,
					message: `Evidence "${truncate(node.content)}" has no cited source`,
					severity: 'warning'
				});
			}
		}

		// 3. Unaddressed counter: counter with no incoming rebuts edge
		if (node.type === 'counter') {
			const hasRebuttal = incoming.some((e) => e.type === 'rebuts');
			if (!hasRebuttal) {
				flags.push({
					type: 'unaddressed_counter',
					nodeId: node.id,
					message: `Counter-argument "${truncate(node.content)}" has not been addressed`,
					severity: 'error'
				});
			}
		}
	}

	// 4. Missing warrant: supports edge with no warrant bridging that exact pair
	const supportsEdges = edges.filter((e) => e.type === 'supports');
	for (const supportsEdge of supportsEdges) {
		const fromNode = nodeMap.get(supportsEdge.from_node);
		const toNode = nodeMap.get(supportsEdge.to_node);

		if (fromNode && toNode) {
			// Check if there's a warrant that draws_from the evidence and justifies the claim
			const hasWarrant = nodes.some(
				(n) =>
					n.type === 'warrant' &&
					n.draws_from === supportsEdge.from_node &&
					n.justifies === supportsEdge.to_node
			);

			if (!hasWarrant) {
				flags.push({
					type: 'missing_warrant',
					edgeId: supportsEdge.id,
					message: `No warrant explains why "${truncate(fromNode.content)}" supports "${truncate(toNode.content)}"`,
					severity: 'warning'
				});
			}
		}
	}

	// 5. Speculation chain: 3+ derives_from edges with no evidence anchor
	const speculationChains = findSpeculationChains(nodes, edges);
	for (const chain of speculationChains) {
		flags.push({
			type: 'speculation_chain',
			nodeId: chain[chain.length - 1], // The end of the chain
			message: `Chain of ${chain.length} claims with no evidence anchor`,
			severity: 'error'
		});
	}

	return flags;
}

/**
 * Find chains of 3+ derives_from edges that don't terminate in evidence.
 */
function findSpeculationChains(nodes: ArgumentNode[], edges: ArgumentEdge[]): string[][] {
	const chains: string[][] = [];
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));

	// Build derives_from graph
	const derivesFromMap = new Map<string, string>(); // child -> parent
	for (const edge of edges) {
		if (edge.type === 'derives_from') {
			derivesFromMap.set(edge.from_node, edge.to_node);
		}
	}

	// Find chains starting from claims
	const claimNodes = nodes.filter((n) => n.type === 'claim');

	for (const claim of claimNodes) {
		const chain: string[] = [claim.id];
		let current = claim.id;

		// Follow derives_from chain
		while (derivesFromMap.has(current)) {
			const parent = derivesFromMap.get(current)!;
			chain.push(parent);
			current = parent;

			// Prevent infinite loops
			if (chain.length > 100) break;
		}

		// Check if chain is 3+ long and doesn't end in evidence
		if (chain.length >= 3) {
			const terminalNode = nodeMap.get(chain[chain.length - 1]);
			if (terminalNode && terminalNode.type !== 'evidence') {
				// Check if terminal node has any supporting evidence
				const hasEvidenceSupport = edges.some(
					(e) =>
						e.to_node === terminalNode.id &&
						e.type === 'supports' &&
						nodeMap.get(e.from_node)?.type === 'evidence'
				);

				if (!hasEvidenceSupport) {
					chains.push(chain);
				}
			}
		}
	}

	return chains;
}

// ============================================
// Coach Prompts
// ============================================

/**
 * Generate a coach prompt based on the current argument state.
 * Returns the highest-priority prompt, or null if the argument is complete.
 */
export function getCoachPrompt(
	nodes: ArgumentNode[],
	edges: ArgumentEdge[],
	completeness: CompletenessScore,
	structuralFlags: StructuralFlag[]
): CoachPrompt | null {
	// Priority order (1 = highest):
	// 1. No evidence
	// 2. No source (when evidence exists)
	// 3. No counter
	// 4. Counter exists but no rebuttal (urgent!)
	// 5. No warrant

	// Check for unaddressed counter first (urgent)
	const unaddressedCounter = structuralFlags.find((f) => f.type === 'unaddressed_counter');
	if (unaddressedCounter) {
		return {
			priority: 4,
			type: 'rebuttal',
			message: "You have a counter-argument you haven't addressed yet.",
			actionLabel: 'Add Rebuttal',
			urgent: true
		};
	}

	if (!completeness.hasEvidence) {
		return {
			priority: 1,
			type: 'evidence',
			message: "Your claim stands alone — what's your strongest piece of evidence?",
			actionLabel: 'Add Evidence'
		};
	}

	if (!completeness.hasSource) {
		return {
			priority: 2,
			type: 'source',
			message: 'You have evidence but no source cited. Where does it come from?',
			actionLabel: 'Add Source'
		};
	}

	if (!completeness.hasCounter) {
		return {
			priority: 3,
			type: 'counter',
			message: "What's the strongest objection someone would raise against this?",
			actionLabel: 'Add Counter-Argument'
		};
	}

	if (!completeness.hasWarrant) {
		return {
			priority: 5,
			type: 'warrant',
			message: 'Why does your evidence support this claim? Make the logic explicit.',
			actionLabel: 'Add Warrant'
		};
	}

	// All checks passed
	return null;
}

// ============================================
// Graph Layout Utilities
// ============================================

/**
 * Calculate initial positions for nodes in a hierarchical layout.
 * Root claim at top, evidence below, counters to the side, etc.
 */
export function calculateNodePositions(
	nodes: ArgumentNode[],
	edges: ArgumentEdge[]
): Map<string, { x: number; y: number }> {
	const positions = new Map<string, { x: number; y: number }>();

	const HORIZONTAL_SPACING = 250;
	const VERTICAL_SPACING = 150;

	// Find root node
	const rootNode = nodes.find((n) => n.is_root);
	if (!rootNode) {
		// No root, just arrange in a grid
		nodes.forEach((node, index) => {
			const col = index % 4;
			const row = Math.floor(index / 4);
			positions.set(node.id, {
				x: col * HORIZONTAL_SPACING,
				y: row * VERTICAL_SPACING
			});
		});
		return positions;
	}

	// Place root at top center
	positions.set(rootNode.id, { x: 400, y: 50 });

	// Build adjacency map
	const childMap = new Map<string, string[]>(); // parent -> children
	for (const edge of edges) {
		if (!childMap.has(edge.to_node)) {
			childMap.set(edge.to_node, []);
		}
		childMap.get(edge.to_node)!.push(edge.from_node);
	}

	// BFS to position nodes by level
	const visited = new Set<string>([rootNode.id]);
	const queue: { nodeId: string; level: number; parentX: number }[] = [];

	// Add root's children to queue
	const rootChildren = childMap.get(rootNode.id) || [];
	rootChildren.forEach((childId, index) => {
		queue.push({
			nodeId: childId,
			level: 1,
			parentX: 400
		});
	});

	// Track nodes at each level for horizontal positioning
	const levelNodes = new Map<number, string[]>();

	while (queue.length > 0) {
		const { nodeId, level, parentX } = queue.shift()!;

		if (visited.has(nodeId)) continue;
		visited.add(nodeId);

		// Track this node at its level
		if (!levelNodes.has(level)) {
			levelNodes.set(level, []);
		}
		levelNodes.get(level)!.push(nodeId);

		// Add children to queue
		const children = childMap.get(nodeId) || [];
		for (const childId of children) {
			if (!visited.has(childId)) {
				queue.push({
					nodeId: childId,
					level: level + 1,
					parentX: 0 // Will be calculated later
				});
			}
		}
	}

	// Position nodes at each level
	levelNodes.forEach((nodeIds, level) => {
		const totalWidth = (nodeIds.length - 1) * HORIZONTAL_SPACING;
		const startX = 400 - totalWidth / 2;

		nodeIds.forEach((nodeId, index) => {
			positions.set(nodeId, {
				x: startX + index * HORIZONTAL_SPACING,
				y: 50 + level * VERTICAL_SPACING
			});
		});
	});

	// Position any remaining unvisited nodes
	const unvisited = nodes.filter((n) => !visited.has(n.id));
	const maxLevel = Math.max(...Array.from(levelNodes.keys()), 0);

	unvisited.forEach((node, index) => {
		const col = index % 4;
		const row = Math.floor(index / 4);
		positions.set(node.id, {
			x: col * HORIZONTAL_SPACING,
			y: (maxLevel + 2 + row) * VERTICAL_SPACING
		});
	});

	return positions;
}

// ============================================
// Node Filtering Utilities
// ============================================

/**
 * Get nodes that can be connected TO from a given node type.
 * Used to filter dropdown options in the AddNodeSheet.
 */
export function getValidTargetNodes(
	sourceType: ArgumentNodeType,
	nodes: ArgumentNode[]
): ArgumentNode[] {
	switch (sourceType) {
		case 'evidence':
			// Evidence can support claims
			return nodes.filter((n) => n.type === 'claim');

		case 'source':
			// Source is cited by evidence (but we're adding source, not connecting FROM source)
			return [];

		case 'warrant':
			// Warrants have special handling (two connections)
			return [];

		case 'qualifier':
			// Qualifiers qualify claims
			return nodes.filter((n) => n.type === 'claim');

		case 'counter':
			// Counters contradict claims
			return nodes.filter((n) => n.type === 'claim');

		case 'rebuttal':
			// Rebuttals rebut counters
			return nodes.filter((n) => n.type === 'counter');

		case 'claim':
			// Claims can derive from other claims
			return nodes.filter((n) => n.type === 'claim');

		default:
			return nodes;
	}
}

/**
 * Get the appropriate edge type for connecting a source node type to a target node type.
 */
export function getDefaultEdgeType(
	sourceType: ArgumentNodeType,
	targetType: ArgumentNodeType
): string {
	if (sourceType === 'evidence' && targetType === 'claim') return 'supports';
	if (sourceType === 'evidence' && targetType === 'source') return 'cites';
	if (sourceType === 'counter' && targetType === 'claim') return 'contradicts';
	if (sourceType === 'rebuttal' && targetType === 'counter') return 'rebuts';
	if (sourceType === 'qualifier' && targetType === 'claim') return 'qualifies';
	if (sourceType === 'claim' && targetType === 'claim') return 'derives_from';
	if (sourceType === 'warrant') return 'warrants';

	return 'supports';
}

/**
 * Get evidence nodes (for warrant's draws_from dropdown)
 */
export function getEvidenceNodes(nodes: ArgumentNode[]): ArgumentNode[] {
	return nodes.filter((n) => n.type === 'evidence');
}

/**
 * Get claim nodes (for warrant's justifies dropdown)
 */
export function getClaimNodes(nodes: ArgumentNode[]): ArgumentNode[] {
	return nodes.filter((n) => n.type === 'claim');
}

// ============================================
// Node Statistics
// ============================================

/**
 * Count nodes by type
 */
export function countNodesByType(nodes: ArgumentNode[]): Record<ArgumentNodeType, number> {
	const counts: Record<ArgumentNodeType, number> = {
		claim: 0,
		evidence: 0,
		source: 0,
		warrant: 0,
		qualifier: 0,
		counter: 0,
		rebuttal: 0
	};

	for (const node of nodes) {
		counts[node.type]++;
	}

	return counts;
}

/**
 * Get connection count for a node
 */
export function getConnectionCount(nodeId: string, edges: ArgumentEdge[]): number {
	return edges.filter((e) => e.from_node === nodeId || e.to_node === nodeId).length;
}

/**
 * Get nodes that have at least one node of a given type
 */
export function getNodeTypesPresent(nodes: ArgumentNode[]): Set<ArgumentNodeType> {
	return new Set(nodes.map((n) => n.type));
}

// ============================================
// Helper Functions
// ============================================

/**
 * Truncate text for display in messages
 */
function truncate(text: string, maxLength: number = 40): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a temporary ID for extracted nodes before saving
 */
export function generateTempId(prefix: string = 'n'): string {
	return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Map temporary IDs to real UUIDs after saving
 */
export function mapTempIdsToReal(
	tempIdMap: Map<string, string>,
	edges: Array<{ from: string; to: string }>
): Array<{ from_node: string; to_node: string }> {
	return edges.map((e) => ({
		from_node: tempIdMap.get(e.from) || e.from,
		to_node: tempIdMap.get(e.to) || e.to
	}));
}
