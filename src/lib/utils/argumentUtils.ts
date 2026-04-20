/**
 * Argument Graph Utility Functions
 *
 * Pure functions for computing completeness scores, structural flags,
 * and coach prompts based on the current argument graph state.
 */

import type {
	ArgumentNode,
	ArgumentEdge,
	ArgumentEdgeType,
	ArgumentNodeType,
	ArgumentTreeNode,
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
	edges: ArgumentEdge[],
	options?: { maxCols?: number; nodeWidth?: number; nodeHeight?: number }
): Map<string, { x: number; y: number }> {
	const positions = new Map<string, { x: number; y: number }>();
	if (nodes.length === 0) return positions;

	const NODE_W = options?.nodeWidth ?? 280;
	const NODE_H = options?.nodeHeight ?? 140;
	const H_GAP = 60; // horizontal gap between nodes
	const V_GAP = NODE_H + 60; // vertical gap between tiers (scales with node height)
	const MAX_COLS = Math.max(1, options?.maxCols ?? 3); // max nodes per row before wrapping
	const ROW_GAP = 30; // vertical gap between wrapped rows within a tier

	// Build lookup structures
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const outgoing = new Map<string, Array<{ target: string; type: string }>>();
	const incoming = new Map<string, Array<{ source: string; type: string }>>();

	for (const edge of edges) {
		if (!outgoing.has(edge.from_node)) outgoing.set(edge.from_node, []);
		outgoing.get(edge.from_node)!.push({ target: edge.to_node, type: edge.type });
		if (!incoming.has(edge.to_node)) incoming.set(edge.to_node, []);
		incoming.get(edge.to_node)!.push({ source: edge.from_node, type: edge.type });
	}

	// Find root node
	const rootNode = nodes.find((n) => n.is_root);

	if (!rootNode) {
		// No root — arrange in a responsive grid
		const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
		nodes.forEach((node, i) => {
			positions.set(node.id, {
				x: (i % cols) * (NODE_W + H_GAP),
				y: Math.floor(i / cols) * V_GAP
			});
		});
		return positions;
	}

	// ── Assign nodes to semantic tiers ──────────────────────────

	// Tier 0: Root claim
	// Tier 1: Claims that derive from root or are directly connected to root
	// Tier 2: Evidence / counter / qualifier for tier 0-1 claims
	// Tier 3: Sources (under evidence), warrants (between evidence/claim), rebuttals (under counters)
	// Tier 4: Remaining connected nodes + orphans

	const placed = new Set<string>();
	const tiers: Array<Array<{ id: string; parentId?: string; group?: string }>> = [
		[],
		[],
		[],
		[],
		[]
	];

	// Tier 0: root
	tiers[0].push({ id: rootNode.id });
	placed.add(rootNode.id);

	// Helper: find nodes connected to `targetId` with a specific incoming edge type
	function getConnectedByEdgeType(targetId: string, edgeType: string): string[] {
		return (incoming.get(targetId) || [])
			.filter((e) => e.type === edgeType && !placed.has(e.source))
			.map((e) => e.source);
	}

	function getOutgoingByType(sourceId: string, edgeType: string): string[] {
		return (outgoing.get(sourceId) || [])
			.filter((e) => e.type === edgeType && !placed.has(e.target))
			.map((e) => e.target);
	}

	// Tier 1: Claims deriving from root, or connected directly
	const tier1Claims = getConnectedByEdgeType(rootNode.id, 'supports')
		.concat(getConnectedByEdgeType(rootNode.id, 'derives_from'))
		.filter((id) => nodeMap.get(id)?.type === 'claim');

	// Also add non-claim nodes directly supporting/contradicting root
	const rootDirectSupport = getConnectedByEdgeType(rootNode.id, 'supports').filter(
		(id) => nodeMap.get(id)?.type !== 'claim'
	);
	const rootCounters = getConnectedByEdgeType(rootNode.id, 'contradicts');
	const rootQualifiers = getConnectedByEdgeType(rootNode.id, 'qualifies');

	for (const id of tier1Claims) {
		tiers[1].push({ id, parentId: rootNode.id, group: 'claim' });
		placed.add(id);
	}

	// All tier-0 and tier-1 claims that we should attach children to
	const allClaims = [rootNode.id, ...tier1Claims];

	// Tier 2: Evidence, counters, qualifiers for all claims
	for (const claimId of allClaims) {
		const evidence = getConnectedByEdgeType(claimId, 'supports').filter(
			(id) => nodeMap.get(id)?.type === 'evidence' || nodeMap.get(id)?.type !== 'claim'
		);
		const counters = getConnectedByEdgeType(claimId, 'contradicts');
		const qualifiers = getConnectedByEdgeType(claimId, 'qualifies');

		for (const id of evidence) {
			tiers[2].push({ id, parentId: claimId, group: 'evidence' });
			placed.add(id);
		}
		for (const id of counters) {
			tiers[2].push({ id, parentId: claimId, group: 'counter' });
			placed.add(id);
		}
		for (const id of qualifiers) {
			tiers[2].push({ id, parentId: claimId, group: 'qualifier' });
			placed.add(id);
		}
	}

	// Also add root-direct non-claim nodes to tier 2
	for (const id of rootDirectSupport) {
		if (!placed.has(id)) {
			tiers[2].push({ id, parentId: rootNode.id, group: 'evidence' });
			placed.add(id);
		}
	}
	for (const id of rootCounters) {
		if (!placed.has(id)) {
			tiers[2].push({ id, parentId: rootNode.id, group: 'counter' });
			placed.add(id);
		}
	}
	for (const id of rootQualifiers) {
		if (!placed.has(id)) {
			tiers[2].push({ id, parentId: rootNode.id, group: 'qualifier' });
			placed.add(id);
		}
	}

	// Tier 3: Sources under evidence, warrants, rebuttals under counters
	for (const entry of tiers[2]) {
		const node = nodeMap.get(entry.id);
		if (!node) continue;

		if (node.type === 'evidence' || entry.group === 'evidence') {
			// Sources cited by this evidence
			const sources = getOutgoingByType(entry.id, 'cites');
			for (const id of sources) {
				tiers[3].push({ id, parentId: entry.id, group: 'source' });
				placed.add(id);
			}
		}
		if (node.type === 'counter' || entry.group === 'counter') {
			// Rebuttals that rebut this counter
			const rebuttals = getConnectedByEdgeType(entry.id, 'rebuts');
			for (const id of rebuttals) {
				tiers[3].push({ id, parentId: entry.id, group: 'rebuttal' });
				placed.add(id);
			}
		}
	}

	// Find warrants — they connect evidence to claims, place them in tier 3
	for (const node of nodes) {
		if (node.type === 'warrant' && !placed.has(node.id)) {
			// Place warrants in tier 3
			const warrantEdges = outgoing.get(node.id) || [];
			const parentEvidence = warrantEdges.find(
				(e) => e.type === 'warrants' && placed.has(e.target)
			);
			tiers[3].push({
				id: node.id,
				parentId: parentEvidence?.target || undefined,
				group: 'warrant'
			});
			placed.add(node.id);
		}
	}

	// Tier 4: Any remaining connected nodes via BFS
	const frontier = [...placed];
	for (const nodeId of frontier) {
		const outs = outgoing.get(nodeId) || [];
		const ins = incoming.get(nodeId) || [];
		for (const e of [...outs.map((o) => o.target), ...ins.map((i) => i.source)]) {
			if (!placed.has(e) && nodeMap.has(e)) {
				tiers[4].push({ id: e, parentId: nodeId });
				placed.add(e);
				frontier.push(e);
			}
		}
	}

	// Orphan nodes (completely disconnected)
	for (const node of nodes) {
		if (!placed.has(node.id)) {
			tiers[4].push({ id: node.id });
			placed.add(node.id);
		}
	}

	// ── Position each tier ─────────────────────────────────────

	// For each tier, group nodes by parentId, and position groups under their parent
	// Tier 0 is special: just the root

	let tierY = 0;
	const parentCenterX = new Map<string, number>();

	// Root position: centered at 0
	positions.set(rootNode.id, { x: 0, y: tierY });
	parentCenterX.set(rootNode.id, NODE_W / 2);

	for (let t = 1; t < tiers.length; t++) {
		const tier = tiers[t];
		if (tier.length === 0) continue;

		tierY += V_GAP;

		// Group by parentId
		const groups = new Map<string, typeof tier>();
		const noParent: typeof tier = [];
		for (const entry of tier) {
			if (entry.parentId && parentCenterX.has(entry.parentId)) {
				if (!groups.has(entry.parentId)) groups.set(entry.parentId, []);
				groups.get(entry.parentId)!.push(entry);
			} else {
				noParent.push(entry);
			}
		}

		// Helper: lay out a list of entries in wrapped rows of MAX_COLS,
	// centered around parentCenterX, returning positioned items and
	// the total height consumed (including extra rows).
		const allPositioned: Array<{ id: string; x: number; y: number }> = [];
		let tierExtraHeight = 0; // extra height from wrapped rows

		function layoutGroup(
			entries: typeof tier,
			centerX: number,
			baseY: number
		) {
			// Sort entries: evidence/support left, counters right
			entries.sort((a, b) => {
				const order: Record<string, number> = {
					evidence: 0,
					source: 0,
					warrant: 1,
					qualifier: 2,
					claim: 2,
					counter: 3,
					rebuttal: 3
				};
				return (order[a.group || ''] ?? 2) - (order[b.group || ''] ?? 2);
			});

			const rows: typeof entries[] = [];
			for (let i = 0; i < entries.length; i += MAX_COLS) {
				rows.push(entries.slice(i, i + MAX_COLS));
			}

			for (let r = 0; r < rows.length; r++) {
				const row = rows[r];
				const rowWidth = row.length * NODE_W + (row.length - 1) * H_GAP;
				const startX = centerX - rowWidth / 2;
				const rowY = baseY + r * (NODE_H + ROW_GAP);

				for (let i = 0; i < row.length; i++) {
					const x = startX + i * (NODE_W + H_GAP);
					allPositioned.push({ id: row[i].id, x, y: rowY });
				}

				const rowExtra = r * (NODE_H + ROW_GAP);
				if (rowExtra > tierExtraHeight) tierExtraHeight = rowExtra;
			}
		}

		// Merge all groups + orphans into one flat list for the tier,
		// then lay them out together so they stay compact.
		const allEntries: typeof tier = [];

		// Collect from groups in order: sort groups by parent X so
		// left-parent children appear left.
		const sortedGroupIds = [...groups.keys()].sort(
			(a, b) => (parentCenterX.get(a) ?? 0) - (parentCenterX.get(b) ?? 0)
		);
		for (const pid of sortedGroupIds) {
			const entries = groups.get(pid)!;
			// Sort within group
			entries.sort((a, b) => {
				const order: Record<string, number> = {
					evidence: 0, source: 0, warrant: 1,
					qualifier: 2, claim: 2, counter: 3, rebuttal: 3
				};
				return (order[a.group || ''] ?? 2) - (order[b.group || ''] ?? 2);
			});
			allEntries.push(...entries);
		}
		allEntries.push(...noParent);

		// Find the center point for this tier (average of parent centers, or root center)
		let tierCenterX = NODE_W / 2;
		if (sortedGroupIds.length > 0) {
			const parentXs = sortedGroupIds.map((pid) => parentCenterX.get(pid)!);
			tierCenterX = (Math.min(...parentXs) + Math.max(...parentXs)) / 2;
		}

		layoutGroup(allEntries, tierCenterX, tierY);

		// Set positions and track centers for next tier
		for (const p of allPositioned) {
			positions.set(p.id, { x: p.x, y: p.y });
			parentCenterX.set(p.id, p.x + NODE_W / 2);
		}

		// Advance tierY past any extra wrapped rows
		tierY += tierExtraHeight;
	}

	// ── Final centering pass ──
	// Shift everything so there's no negative x values
	let globalMinX = Infinity;
	for (const pos of positions.values()) {
		globalMinX = Math.min(globalMinX, pos.x);
	}
	if (globalMinX < 0) {
		const shift = -globalMinX + H_GAP;
		for (const [id, pos] of positions) {
			positions.set(id, { x: pos.x + shift, y: pos.y });
		}
	}

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

/**
 * Given a target node type, return the node types that can be created and
 * connected TO it (the reverse of getValidTargetNodes).
 *
 * For example, a `claim` node can receive edges from evidence, qualifier,
 * counter, warrant, and other claims. A `counter` node can receive a rebuttal.
 */
export function getValidSourceTypesForTarget(targetType: ArgumentNodeType): ArgumentNodeType[] {
	switch (targetType) {
		case 'claim':
			return ['evidence', 'qualifier', 'counter', 'warrant', 'claim'];
		case 'counter':
			return ['rebuttal'];
		case 'evidence':
			return ['source', 'warrant'];
		case 'source':
			return [];
		case 'warrant':
			return [];
		case 'qualifier':
			return [];
		case 'rebuttal':
			return [];
		default:
			return [];
	}
}

/**
 * Given a new source node type and the existing target node type, return the
 * edge type and direction label for the relationship.
 */
export function getEdgeTypeForConnection(
	sourceType: ArgumentNodeType,
	targetType: ArgumentNodeType
): { edgeType: string; label: string } | null {
	if (sourceType === 'evidence' && targetType === 'claim')
		return { edgeType: 'supports', label: 'supports' };
	if (sourceType === 'counter' && targetType === 'claim')
		return { edgeType: 'contradicts', label: 'contradicts' };
	if (sourceType === 'qualifier' && targetType === 'claim')
		return { edgeType: 'qualifies', label: 'qualifies' };
	if (sourceType === 'claim' && targetType === 'claim')
		return { edgeType: 'derives_from', label: 'derives from' };
	if (sourceType === 'rebuttal' && targetType === 'counter')
		return { edgeType: 'rebuts', label: 'rebuts' };
	if (sourceType === 'source' && targetType === 'evidence')
		return { edgeType: 'cites', label: 'cited by' };
	if (sourceType === 'warrant' && targetType === 'evidence')
		return { edgeType: 'warrants', label: 'warrants' };
	if (sourceType === 'warrant' && targetType === 'claim')
		return { edgeType: 'warrants', label: 'warrants' };
	return null;
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

// ============================================
// Tree Derivation (Builder / Card views)
// ============================================

/**
 * Ordering of edge types when grouping children under a parent in the tree.
 * Matches the plan's intended reading order in the Builder view.
 */
const EDGE_TYPE_ORDER: ArgumentEdgeType[] = [
	'supports',
	'warrants',
	'cites',
	'contradicts',
	'rebuts',
	'qualifies',
	'derives_from'
];

function edgeOrderIndex(t: ArgumentEdgeType): number {
	const i = EDGE_TYPE_ORDER.indexOf(t);
	return i === -1 ? EDGE_TYPE_ORDER.length : i;
}

/**
 * Derive a tree structure from a flat nodes[] + edges[] graph.
 *
 * The tree is rooted at the `is_root` node. Children of a parent are the
 * nodes that have an INCOMING edge from the parent (i.e. edge.to_node ===
 * parent.id), which matches how the graph is modelled in AI extraction:
 * evidence → supports → claim (evidence is "under" the claim).
 *
 * When no root node exists, or when disconnected components are present,
 * a synthetic root may be returned containing the isolated subgraphs as
 * top-level children with edgeType=null.
 */
export function buildArgumentTree(
	nodes: ArgumentNode[],
	edges: ArgumentEdge[]
): ArgumentTreeNode | null {
	if (nodes.length === 0) return null;

	const nodeMap = new Map(nodes.map((n) => [n.id, n]));

	// Index edges by to_node so we can quickly find children of a parent
	// (a child's outgoing edge points at its parent: e.g. evidence->claim).
	const incomingByTarget = new Map<string, ArgumentEdge[]>();
	for (const edge of edges) {
		if (!incomingByTarget.has(edge.to_node)) incomingByTarget.set(edge.to_node, []);
		incomingByTarget.get(edge.to_node)!.push(edge);
	}

	const root = nodes.find((n) => n.is_root) ?? nodes[0];
	const visited = new Set<string>();

	function build(nodeId: string, edge: ArgumentEdge | null, depth: number): ArgumentTreeNode | null {
		if (visited.has(nodeId)) return null;
		const node = nodeMap.get(nodeId);
		if (!node) return null;
		visited.add(nodeId);

		const childEdges = incomingByTarget.get(nodeId) || [];
		// Sort children deterministically: by edge-type order, then created_at.
		const sortedChildEdges = [...childEdges].sort((a, b) => {
			const byType = edgeOrderIndex(a.type) - edgeOrderIndex(b.type);
			if (byType !== 0) return byType;
			return (a.created_at || '').localeCompare(b.created_at || '');
		});

		const children: ArgumentTreeNode[] = [];
		for (const e of sortedChildEdges) {
			const child = build(e.from_node, e, depth + 1);
			if (child) children.push(child);
		}

		return {
			node,
			edgeType: edge?.type ?? null,
			edge,
			depth,
			children
		};
	}

	const tree = build(root.id, null, 0);
	if (!tree) return null;

	// Attach any unvisited (disconnected) nodes as extra top-level branches
	// under the root so the user can still see and edit them.
	for (const n of nodes) {
		if (!visited.has(n.id)) {
			const orphan = build(n.id, null, 1);
			if (orphan) tree.children.push(orphan);
		}
	}

	return tree;
}

// ============================================
// Progressive Disclosure (which actions to show)
// ============================================

export interface AvailableAddActions {
	canAddEvidence: boolean;
	canAddSource: boolean;
	canAddWarrant: boolean;
	canAddCounter: boolean;
	canAddRebuttal: boolean;
	canAddQualifier: boolean;
	canAddClaim: boolean;
}

/**
 * Compute which "add node" actions should be available to the user given
 * the current state of the argument. Implements the progressive disclosure
 * rules from docs/argument-graph-redesign.md:
 *
 *   Just started (claim only)    → Evidence
 *   Has evidence                 → Source, Warrant  (and keeps Evidence)
 *   Has warrant                  → Counter         (and keeps above)
 *   Has counter                  → Rebuttal, Qualifier
 *   Complete                     → All
 */
export function getAvailableAddActions(nodes: ArgumentNode[]): AvailableAddActions {
	const hasEvidence = nodes.some((n) => n.type === 'evidence');
	const hasWarrant = nodes.some((n) => n.type === 'warrant');
	const hasCounter = nodes.some((n) => n.type === 'counter');

	return {
		canAddClaim: true,
		canAddEvidence: true,
		canAddSource: hasEvidence,
		canAddWarrant: hasEvidence,
		canAddCounter: hasEvidence && hasWarrant,
		canAddRebuttal: hasCounter,
		canAddQualifier: hasCounter
	};
}

/**
 * For a specific target node (the one the user clicked "+ Add" on), return
 * the node types that are most contextually useful to add as children of it.
 * This is used to populate the inline "+ Add X" buttons on each row.
 */
export function getContextualAddTypesForNode(
	target: ArgumentNode,
	nodes: ArgumentNode[]
): ArgumentNodeType[] {
	const available = getAvailableAddActions(nodes);

	switch (target.type) {
		case 'claim': {
			const actions: ArgumentNodeType[] = [];
			if (available.canAddEvidence) actions.push('evidence');
			if (available.canAddCounter) actions.push('counter');
			if (available.canAddQualifier) actions.push('qualifier');
			if (available.canAddWarrant) actions.push('warrant');
			return actions;
		}
		case 'evidence': {
			const actions: ArgumentNodeType[] = [];
			if (available.canAddSource) actions.push('source');
			if (available.canAddWarrant) actions.push('warrant');
			return actions;
		}
		case 'counter':
			return available.canAddRebuttal ? ['rebuttal'] : [];
		case 'warrant':
		case 'source':
		case 'rebuttal':
		case 'qualifier':
		default:
			return [];
	}
}
