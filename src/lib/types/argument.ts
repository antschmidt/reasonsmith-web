/**
 * Argument Graph Types
 *
 * Types for the structured argument builder feature.
 * Supports nodes (claims, evidence, warrants, etc.) and edges (supports, contradicts, etc.)
 */

// ============================================
// Node Types
// ============================================

export type ArgumentNodeType =
	| 'claim'
	| 'evidence'
	| 'source'
	| 'warrant'
	| 'qualifier'
	| 'counter'
	| 'rebuttal';

export interface ArgumentNode {
	id: string;
	argument_id: string;
	type: ArgumentNodeType;
	content: string;
	is_root: boolean;
	implied: boolean;
	verbatim_span: string | null;
	score: number | null;
	metadata: Record<string, unknown>;
	// Warrant-specific fields
	draws_from: string | null;
	justifies: string | null;
	// Multi-user ownership
	owner_id: string | null;
	is_published: boolean;
	created_at: string;
	// Relationships (populated by GraphQL)
	outgoing_edges?: ArgumentEdge[];
	incoming_edges?: ArgumentEdge[];
}

// ============================================
// Edge Types
// ============================================

export type ArgumentEdgeType =
	| 'supports'
	| 'contradicts'
	| 'rebuts'
	| 'warrants'
	| 'cites'
	| 'qualifies'
	| 'derives_from';

export interface ArgumentEdge {
	id: string;
	argument_id: string;
	from_node: string;
	to_node: string;
	type: ArgumentEdgeType;
	confidence: number;
	weight: number;
	metadata: Record<string, unknown>;
	// Multi-user ownership
	owner_id: string | null;
	is_published: boolean;
	created_at: string;
}

// ============================================
// Argument (Container)
// ============================================

export interface Argument {
	id: string;
	user_id: string;
	title: string;
	description: string | null;
	// Discussion/post linkage
	discussion_id: string | null;
	post_id: string | null;
	created_at: string;
	updated_at: string;
	// Relationships
	argument_nodes?: ArgumentNode[];
	argument_edges?: ArgumentEdge[];
	// Aggregates
	argument_nodes_aggregate?: {
		aggregate: {
			count: number;
		};
	};
	root_node?: { id: string; content: string }[];
}

// ============================================
// Structural Flags (computed, not stored)
// ============================================

export type StructuralFlagType =
	| 'unsupported_claim'
	| 'missing_warrant'
	| 'uncited_evidence'
	| 'unaddressed_counter'
	| 'speculation_chain';

export interface StructuralFlag {
	type: StructuralFlagType;
	nodeId?: string;
	edgeId?: string;
	message: string;
	severity: 'warning' | 'error';
}

// ============================================
// Completeness Score
// ============================================

export interface CompletenessScore {
	score: number; // 0-100
	hasEvidence: boolean;
	hasSource: boolean;
	hasCounter: boolean;
	hasRebuttal: boolean;
	hasWarrant: boolean;
}

// ============================================
// Node Type Configuration
// ============================================

export interface NodeTypeConfig {
	type: ArgumentNodeType;
	label: string;
	description: string;
	color: string;
	bgColor: string;
	placeholder: string;
	/** Edge types this node can create when connecting TO another node */
	allowedEdgeTypes: ArgumentEdgeType[];
	/** Node types this type can connect TO */
	allowedTargetTypes: ArgumentNodeType[];
}

export const NODE_TYPE_CONFIGS: Record<ArgumentNodeType, NodeTypeConfig> = {
	claim: {
		type: 'claim',
		label: 'Claim',
		description: 'A central thesis or sub-assertion',
		color: '#E8B84B',
		bgColor: '#1A1508',
		placeholder: 'State your claim clearly and specifically...',
		allowedEdgeTypes: ['derives_from'],
		allowedTargetTypes: ['claim']
	},
	evidence: {
		type: 'evidence',
		label: 'Evidence',
		description: 'Empirical data, statistics, or observations',
		color: '#4BC4E8',
		bgColor: '#08141A',
		placeholder: 'Describe the evidence that supports your claim...',
		allowedEdgeTypes: ['supports', 'cites'],
		allowedTargetTypes: ['claim', 'source']
	},
	source: {
		type: 'source',
		label: 'Source',
		description: 'Origin of evidence (study, article, institution)',
		color: '#8B8B8B',
		bgColor: '#111111',
		placeholder: 'Cite the source: author, title, publication, date...',
		allowedEdgeTypes: [],
		allowedTargetTypes: []
	},
	warrant: {
		type: 'warrant',
		label: 'Warrant',
		description: 'Logical bridge explaining WHY evidence supports a claim',
		color: '#B44BE8',
		bgColor: '#120815',
		placeholder: 'Explain the reasoning that connects your evidence to your claim...',
		allowedEdgeTypes: ['warrants'],
		allowedTargetTypes: ['evidence', 'claim']
	},
	qualifier: {
		type: 'qualifier',
		label: 'Qualifier',
		description: 'Scope limiter ("usually", "in most cases")',
		color: '#78909C',
		bgColor: '#0D1214',
		placeholder: 'Specify the conditions or limits of your claim...',
		allowedEdgeTypes: ['qualifies'],
		allowedTargetTypes: ['claim']
	},
	counter: {
		type: 'counter',
		label: 'Counter',
		description: 'Opposing claim or objection',
		color: '#E84B4B',
		bgColor: '#1A0808',
		placeholder: 'State the strongest objection to your argument...',
		allowedEdgeTypes: ['contradicts'],
		allowedTargetTypes: ['claim']
	},
	rebuttal: {
		type: 'rebuttal',
		label: 'Rebuttal',
		description: 'Response that neutralizes a counter',
		color: '#4BE87A',
		bgColor: '#081A0E',
		placeholder: 'Explain how you address or overcome this objection...',
		allowedEdgeTypes: ['rebuts'],
		allowedTargetTypes: ['counter']
	}
};

// ============================================
// Edge Type Configuration
// ============================================

export interface EdgeTypeConfig {
	type: ArgumentEdgeType;
	label: string;
	description: string;
	/** Direction label for display */
	fromLabel: string;
	toLabel: string;
}

export const EDGE_TYPE_CONFIGS: Record<ArgumentEdgeType, EdgeTypeConfig> = {
	supports: {
		type: 'supports',
		label: 'Supports',
		description: 'Node strengthens a claim',
		fromLabel: 'supports',
		toLabel: 'supported by'
	},
	contradicts: {
		type: 'contradicts',
		label: 'Contradicts',
		description: 'Node weakens or refutes a claim',
		fromLabel: 'contradicts',
		toLabel: 'contradicted by'
	},
	rebuts: {
		type: 'rebuts',
		label: 'Rebuts',
		description: 'Node neutralizes a counter',
		fromLabel: 'rebuts',
		toLabel: 'rebutted by'
	},
	warrants: {
		type: 'warrants',
		label: 'Warrants',
		description: 'Warrant justifies a supports relationship',
		fromLabel: 'warrants',
		toLabel: 'warranted by'
	},
	cites: {
		type: 'cites',
		label: 'Cites',
		description: 'Evidence traces to a source',
		fromLabel: 'cites',
		toLabel: 'cited by'
	},
	qualifies: {
		type: 'qualifies',
		label: 'Qualifies',
		description: 'Qualifier scopes a claim',
		fromLabel: 'qualifies',
		toLabel: 'qualified by'
	},
	derives_from: {
		type: 'derives_from',
		label: 'Derives From',
		description: 'Claim follows logically from another claim',
		fromLabel: 'derives from',
		toLabel: 'leads to'
	}
};

// ============================================
// AI Extraction Types
// ============================================

export interface ExtractedNode {
	id: string; // Temporary ID (e.g., "n1", "n2")
	type: ArgumentNodeType;
	content: string;
	verbatim_span?: string;
	implied: boolean;
}

export interface ExtractedEdge {
	id: string;
	from: string; // Temporary node ID
	to: string; // Temporary node ID
	type: ArgumentEdgeType;
	confidence: number;
}

export interface WarrantConnection {
	warrant_node_id: string;
	draws_from: string;
	justifies: string;
}

export interface ExtractionResult {
	root_claim: string; // Temporary node ID
	nodes: ExtractedNode[];
	edges: ExtractedEdge[];
	warrant_connections: WarrantConnection[];
	structural_flags: StructuralFlagType[];
	completeness_score: number;
	notes: string;
}

// ============================================
// Coach Prompts
// ============================================

export type CoachPromptPriority = 1 | 2 | 3 | 4 | 5;

export interface CoachPrompt {
	priority: CoachPromptPriority;
	type: 'evidence' | 'source' | 'counter' | 'rebuttal' | 'warrant';
	message: string;
	actionLabel: string;
	urgent?: boolean;
}

// ============================================
// Builder State
// ============================================

export interface ArgumentBuilderState {
	argument: Argument | null;
	nodes: ArgumentNode[];
	edges: ArgumentEdge[];
	selectedNodeId: string | null;
	completeness: CompletenessScore;
	structuralFlags: StructuralFlag[];
	coachPrompt: CoachPrompt | null;
	isLoading: boolean;
	error: string | null;
}

// ============================================
// Graph Visualization (for @xyflow/svelte)
// ============================================

export interface GraphNode {
	id: string;
	type: string; // Custom node type for rendering
	position: { x: number; y: number };
	data: {
		node: ArgumentNode;
		config: NodeTypeConfig;
		isSelected: boolean;
		isRoot: boolean;
		connectionCount: number;
	};
}

// ============================================
// Add Connected Node Context
// ============================================

/**
 * Context mode for the AddConnectedNodeDialog:
 * - 'draft': Discussion is in draft mode or has a newer draft — add directly
 * - 'choose-owner': Published discussion, user is owner, no comment draft — show choice
 * - 'comment': Published discussion, user is NOT owner (or chose "comment") — add as comment draft node
 */
export type AddNodeContext =
	| { mode: 'draft' }
	| { mode: 'choose-owner' }
	| { mode: 'comment'; commentDraftExists: boolean };

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	type?: string; // Custom edge type for rendering
	data: {
		edge: ArgumentEdge;
		config: EdgeTypeConfig;
	};
	animated?: boolean;
	style?: Record<string, string>;
}
