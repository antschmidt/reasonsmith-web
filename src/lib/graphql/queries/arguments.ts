import { gql } from '@apollo/client/core';

// ============================================
// Fragments
// ============================================

export const ARGUMENT_NODE_FIELDS = gql`
	fragment ArgumentNodeFields on argument_node {
		id
		argument_id
		type
		content
		is_root
		implied
		verbatim_span
		score
		metadata
		draws_from
		justifies
		created_at
	}
`;

export const ARGUMENT_EDGE_FIELDS = gql`
	fragment ArgumentEdgeFields on argument_edge {
		id
		argument_id
		from_node
		to_node
		type
		confidence
		weight
		metadata
		created_at
	}
`;

export const ARGUMENT_FIELDS = gql`
	fragment ArgumentFields on argument {
		id
		user_id
		title
		description
		created_at
		updated_at
	}
`;

// ============================================
// Queries
// ============================================

/**
 * Get a single argument with all its nodes and edges
 */
export const GET_ARGUMENT = gql`
	query GetArgument($id: uuid!) {
		argument_by_pk(id: $id) {
			...ArgumentFields
			argument_nodes(order_by: { created_at: asc }) {
				...ArgumentNodeFields
				outgoing_edges: argument_edges_by_from_node {
					...ArgumentEdgeFields
				}
				incoming_edges: argument_edges_by_to_node {
					...ArgumentEdgeFields
				}
			}
			argument_edges(order_by: { created_at: asc }) {
				...ArgumentEdgeFields
			}
		}
	}
	${ARGUMENT_FIELDS}
	${ARGUMENT_NODE_FIELDS}
	${ARGUMENT_EDGE_FIELDS}
`;

/**
 * List all arguments for the current user
 */
export const LIST_ARGUMENTS = gql`
	query ListArguments($limit: Int = 50, $offset: Int = 0) {
		argument(order_by: { updated_at: desc }, limit: $limit, offset: $offset) {
			...ArgumentFields
			argument_nodes_aggregate {
				aggregate {
					count
				}
			}
			root_node: argument_nodes(where: { is_root: { _eq: true } }, limit: 1) {
				id
				content
			}
		}
	}
	${ARGUMENT_FIELDS}
`;

/**
 * Get argument node counts by type for statistics
 */
export const GET_ARGUMENT_STATS = gql`
	query GetArgumentStats($argumentId: uuid!) {
		argument_by_pk(id: $argumentId) {
			id
			argument_nodes_aggregate {
				aggregate {
					count
				}
			}
		}
		claims: argument_node_aggregate(
			where: { argument_id: { _eq: $argumentId }, type: { _eq: "claim" } }
		) {
			aggregate {
				count
			}
		}
		evidence: argument_node_aggregate(
			where: { argument_id: { _eq: $argumentId }, type: { _eq: "evidence" } }
		) {
			aggregate {
				count
			}
		}
		sources: argument_node_aggregate(
			where: { argument_id: { _eq: $argumentId }, type: { _eq: "source" } }
		) {
			aggregate {
				count
			}
		}
		warrants: argument_node_aggregate(
			where: { argument_id: { _eq: $argumentId }, type: { _eq: "warrant" } }
		) {
			aggregate {
				count
			}
		}
		counters: argument_node_aggregate(
			where: { argument_id: { _eq: $argumentId }, type: { _eq: "counter" } }
		) {
			aggregate {
				count
			}
		}
		rebuttals: argument_node_aggregate(
			where: { argument_id: { _eq: $argumentId }, type: { _eq: "rebuttal" } }
		) {
			aggregate {
				count
			}
		}
		qualifiers: argument_node_aggregate(
			where: { argument_id: { _eq: $argumentId }, type: { _eq: "qualifier" } }
		) {
			aggregate {
				count
			}
		}
	}
`;

// ============================================
// Mutations
// ============================================

/**
 * Create a new argument with an initial root claim node
 */
export const CREATE_ARGUMENT = gql`
	mutation CreateArgument(
		$userId: uuid!
		$title: String!
		$rootClaimContent: String!
		$description: String
	) {
		insert_argument_one(
			object: {
				user_id: $userId
				title: $title
				description: $description
				argument_nodes: { data: { type: "claim", content: $rootClaimContent, is_root: true } }
			}
		) {
			...ArgumentFields
			argument_nodes {
				...ArgumentNodeFields
			}
		}
	}
	${ARGUMENT_FIELDS}
	${ARGUMENT_NODE_FIELDS}
`;

/**
 * Create a new argument without any nodes (for AI extraction flow)
 */
export const CREATE_ARGUMENT_SHELL = gql`
	mutation CreateArgumentShell($userId: uuid!, $title: String!, $description: String) {
		insert_argument_one(object: { user_id: $userId, title: $title, description: $description }) {
			...ArgumentFields
		}
	}
	${ARGUMENT_FIELDS}
`;

/**
 * Update argument title/description
 */
export const UPDATE_ARGUMENT = gql`
	mutation UpdateArgument($id: uuid!, $title: String, $description: String) {
		update_argument_by_pk(
			pk_columns: { id: $id }
			_set: { title: $title, description: $description }
		) {
			...ArgumentFields
		}
	}
	${ARGUMENT_FIELDS}
`;

/**
 * Delete an argument (cascades to nodes and edges)
 */
export const DELETE_ARGUMENT = gql`
	mutation DeleteArgument($id: uuid!) {
		delete_argument_by_pk(id: $id) {
			id
		}
	}
`;

/**
 * Add a node with a single edge connection (for non-warrant nodes)
 */
export const ADD_NODE = gql`
	mutation AddNode(
		$argumentId: uuid!
		$type: String!
		$content: String!
		$implied: Boolean = false
		$verbatimSpan: String
		$score: float8
		$metadata: jsonb = {}
		$connectToNodeId: uuid!
		$edgeType: String!
		$edgeConfidence: float8 = 1.0
	) {
		insert_argument_node_one(
			object: {
				argument_id: $argumentId
				type: $type
				content: $content
				implied: $implied
				verbatim_span: $verbatimSpan
				score: $score
				metadata: $metadata
				argument_edges_by_from_node: {
					data: {
						argument_id: $argumentId
						to_node: $connectToNodeId
						type: $edgeType
						confidence: $edgeConfidence
					}
				}
			}
		) {
			...ArgumentNodeFields
			outgoing_edges: argument_edges_by_from_node {
				...ArgumentEdgeFields
			}
		}
	}
	${ARGUMENT_NODE_FIELDS}
	${ARGUMENT_EDGE_FIELDS}
`;

/**
 * Add a warrant node with both draws_from (evidence) and justifies (claim) connections
 * Creates the warrant node and two edges in a single transaction
 */
export const ADD_WARRANT_NODE = gql`
	mutation AddWarrantNode(
		$argumentId: uuid!
		$content: String!
		$drawsFromNodeId: uuid!
		$justifiesNodeId: uuid!
		$implied: Boolean = false
		$verbatimSpan: String
		$score: float8
		$metadata: jsonb = {}
		$confidence: float8 = 1.0
	) {
		insert_argument_node_one(
			object: {
				argument_id: $argumentId
				type: "warrant"
				content: $content
				implied: $implied
				verbatim_span: $verbatimSpan
				score: $score
				metadata: $metadata
				draws_from: $drawsFromNodeId
				justifies: $justifiesNodeId
				argument_edges_by_from_node: {
					data: [
						{
							argument_id: $argumentId
							to_node: $drawsFromNodeId
							type: "warrants"
							confidence: $confidence
						}
						{
							argument_id: $argumentId
							to_node: $justifiesNodeId
							type: "warrants"
							confidence: $confidence
						}
					]
				}
			}
		) {
			...ArgumentNodeFields
			outgoing_edges: argument_edges_by_from_node {
				...ArgumentEdgeFields
			}
		}
	}
	${ARGUMENT_NODE_FIELDS}
	${ARGUMENT_EDGE_FIELDS}
`;

/**
 * Update a node's content or metadata
 */
export const UPDATE_NODE = gql`
	mutation UpdateNode(
		$id: uuid!
		$content: String
		$type: String
		$implied: Boolean
		$score: float8
		$metadata: jsonb
	) {
		update_argument_node_by_pk(
			pk_columns: { id: $id }
			_set: {
				content: $content
				type: $type
				implied: $implied
				score: $score
				metadata: $metadata
			}
		) {
			...ArgumentNodeFields
		}
	}
	${ARGUMENT_NODE_FIELDS}
`;

/**
 * Delete a node (cascades edges)
 */
export const DELETE_NODE = gql`
	mutation DeleteNode($id: uuid!) {
		delete_argument_node_by_pk(id: $id) {
			id
			argument_id
		}
	}
`;

/**
 * Add an edge between two existing nodes
 */
export const ADD_EDGE = gql`
	mutation AddEdge(
		$argumentId: uuid!
		$fromNode: uuid!
		$toNode: uuid!
		$type: String!
		$confidence: float8 = 1.0
		$weight: float8 = 1.0
		$metadata: jsonb = {}
	) {
		insert_argument_edge_one(
			object: {
				argument_id: $argumentId
				from_node: $fromNode
				to_node: $toNode
				type: $type
				confidence: $confidence
				weight: $weight
				metadata: $metadata
			}
		) {
			...ArgumentEdgeFields
		}
	}
	${ARGUMENT_EDGE_FIELDS}
`;

/**
 * Update an edge's confidence or weight
 */
export const UPDATE_EDGE = gql`
	mutation UpdateEdge(
		$id: uuid!
		$type: String
		$confidence: float8
		$weight: float8
		$metadata: jsonb
	) {
		update_argument_edge_by_pk(
			pk_columns: { id: $id }
			_set: { type: $type, confidence: $confidence, weight: $weight, metadata: $metadata }
		) {
			...ArgumentEdgeFields
		}
	}
	${ARGUMENT_EDGE_FIELDS}
`;

/**
 * Delete an edge
 */
export const DELETE_EDGE = gql`
	mutation DeleteEdge($id: uuid!) {
		delete_argument_edge_by_pk(id: $id) {
			id
		}
	}
`;

/**
 * Bulk insert nodes and edges (for AI extraction import)
 */
export const IMPORT_ARGUMENT_GRAPH = gql`
	mutation ImportArgumentGraph(
		$argumentId: uuid!
		$nodes: [argument_node_insert_input!]!
		$edges: [argument_edge_insert_input!]!
	) {
		delete_argument_edge(where: { argument_id: { _eq: $argumentId } }) {
			affected_rows
		}
		delete_argument_node(where: { argument_id: { _eq: $argumentId } }) {
			affected_rows
		}
		insert_argument_node(objects: $nodes) {
			returning {
				...ArgumentNodeFields
			}
		}
		insert_argument_edge(objects: $edges) {
			returning {
				...ArgumentEdgeFields
			}
		}
	}
	${ARGUMENT_NODE_FIELDS}
	${ARGUMENT_EDGE_FIELDS}
`;

/**
 * Bulk insert nodes only (edges added separately after node IDs are known)
 */
export const BULK_INSERT_NODES = gql`
	mutation BulkInsertNodes($nodes: [argument_node_insert_input!]!) {
		insert_argument_node(objects: $nodes) {
			returning {
				...ArgumentNodeFields
			}
		}
	}
	${ARGUMENT_NODE_FIELDS}
`;

/**
 * Bulk insert edges
 */
export const BULK_INSERT_EDGES = gql`
	mutation BulkInsertEdges($edges: [argument_edge_insert_input!]!) {
		insert_argument_edge(objects: $edges) {
			returning {
				...ArgumentEdgeFields
			}
		}
	}
	${ARGUMENT_EDGE_FIELDS}
`;
