<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import {
		GET_DISCUSSION_ARGUMENT,
		CREATE_DISCUSSION_ARGUMENT,
		DELETE_NODE,
		DELETE_EDGE,
		UPDATE_NODE,
		UPDATE_EDGE,
		ADD_NODE,
		ADD_WARRANT_NODE,
		BULK_INSERT_NODES,
		BULK_INSERT_EDGES
	} from '$lib/graphql/queries';
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		ArgumentEdgeType,
		CoachPrompt,
		CompletenessScore,
		StructuralFlag,
		ExtractionResult
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import { sanitizeMultiline } from '$lib/utils/sanitize';
	import {
		computeCompletenessScore,
		computeStructuralFlags,
		getCoachPrompt,
		getConnectionCount,
		countNodesByType,
		getNodeTypesPresent
	} from '$lib/utils/argumentUtils';
	import ArgumentHeader from '$lib/components/arguments/ArgumentHeader.svelte';
	import CompletenessBar from '$lib/components/arguments/CompletenessBar.svelte';
	import CoachBanner from '$lib/components/arguments/CoachBanner.svelte';
	import TypeFilterTabs from '$lib/components/arguments/TypeFilterTabs.svelte';
	import NodeCard from '$lib/components/arguments/NodeCard.svelte';
	import AddNodeSheet from '$lib/components/arguments/AddNodeSheet.svelte';
	import AddEdgeSheet from '$lib/components/arguments/AddEdgeSheet.svelte';
	import AddConnectedNodeDialog from '$lib/components/arguments/AddConnectedNodeDialog.svelte';
	import type { AddNodeContext } from '$lib/types/argument';
	import ArgumentGraph from '$lib/components/arguments/ArgumentGraph.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		Plus,
		Link,
		List,
		Network,
		Sparkles,
		RotateCcw,
		PanelLeftClose,
		PanelLeftOpen,
		FileText
	} from '@lucide/svelte';

	interface Props {
		discussionId: string;
		discussionTitle: string;
		discussionDescription: string;
		userId: string | null;
		/** Whether the current user is the discussion author */
		isDiscussionAuthor?: boolean;
		/** Whether the author is currently in edit mode */
		isEditMode?: boolean;
		discussionPosts?: Array<{
			id: string;
			content: string;
			contributor?: { id?: string; display_name?: string; handle?: string };
		}>;
		discussionCitations?: Array<{
			id: string;
			title: string;
			url: string;
			author?: string | null;
			publisher?: string | null;
			publish_date?: string | null;
			point_supported?: string;
			relevant_quote?: string;
		}>;
		/** Callback to request the parent page start the "edit discussion" flow (creates/navigates to draft) */
		onRequestStartEdit?: () => void;
	}

	let {
		discussionId,
		discussionTitle,
		discussionDescription,
		userId,
		isDiscussionAuthor = false,
		isEditMode = false,
		discussionPosts = [],
		discussionCitations = [],
		onRequestStartEdit
	}: Props = $props();

	// Core data state
	let loading = $state(true);
	let error = $state<string | null>(null);
	let argumentData = $state<{
		id: string;
		user_id: string;
		title: string;
		description: string | null;
		discussion_id: string | null;
		post_id: string | null;
		created_at: string;
		updated_at: string;
	} | null>(null);
	let nodes = $state<ArgumentNode[]>([]);
	let edges = $state<ArgumentEdge[]>([]);

	// Multi-user shared graph state
	const isSharedGraph = $derived(argumentData?.discussion_id != null);

	// Graph permission modes
	type GraphMode = 'author-edit' | 'author-view' | 'commenter' | 'viewer';
	const graphMode = $derived<GraphMode>(
		!userId
			? 'viewer'
			: isDiscussionAuthor && isEditMode
				? 'author-edit'
				: isDiscussionAuthor
					? 'author-view'
					: 'commenter'
	);
	const canEditGraph = $derived(graphMode === 'author-edit');
	const canAddToGraph = $derived(graphMode === 'author-edit' || graphMode === 'commenter');
	const graphIsReadOnly = $derived(!canAddToGraph);

	// UI state
	let showAddNode = $state(false);
	let addNodeDefaultType = $state<ArgumentNodeType | null>(null);
	let showAddEdge = $state(false);
	let addEdgeDefaultFromId = $state<string | null>(null);
	let addEdgeDefaultToId = $state<string | null>(null);
	let selectedNodeId = $state<string | null>(null);
	let filterType = $state<ArgumentNodeType | 'all'>('all');
	let showGraph = $state(true);
	let nodeListCollapsed = $state(true);
	let coachDismissed = $state(false);

	// Node list drill-down: starts at root, click connections to navigate
	let listFocusNodeId = $state<string | null>(null);

	// Initialize to root when nodes load
	$effect(() => {
		if (listFocusNodeId === null && nodes.length > 0) {
			const root = nodes.find((n) => n.is_root);
			listFocusNodeId = root?.id ?? nodes[0]?.id ?? null;
		}
	});

	const listFocusNode = $derived(
		listFocusNodeId ? nodes.find((n) => n.id === listFocusNodeId) ?? null : null
	);

	const listFocusConnections = $derived.by(() => {
		if (!listFocusNodeId) return [];
		const result: Array<{ node: ArgumentNode; edgeType: string; direction: 'incoming' | 'outgoing' }> = [];
		for (const edge of edges) {
			if (edge.from_node === listFocusNodeId) {
				const target = nodes.find((n) => n.id === edge.to_node);
				if (target) result.push({ node: target, edgeType: edge.type, direction: 'outgoing' });
			}
			if (edge.to_node === listFocusNodeId) {
				const source = nodes.find((n) => n.id === edge.from_node);
				if (source) result.push({ node: source, edgeType: edge.type, direction: 'incoming' });
			}
		}
		return result;
	});

	function listNavigateTo(nodeId: string) {
		listFocusNodeId = nodeId;
		selectedNodeId = nodeId;
	}
	let creatingGraph = $state(false);
	let dismissedFlags = $state<Set<string>>(new Set());

	// Add Connected Node dialog state
	let showAddConnectedNode = $state(false);
	let addConnectedTargetNodeId = $state<string | null>(null);
	let addConnectedContext = $state<AddNodeContext>({ mode: 'draft' });

	/** The target node object for the add-connected-node dialog */
	const addConnectedTargetNode = $derived(
		addConnectedTargetNodeId ? (nodes.find((n) => n.id === addConnectedTargetNodeId) ?? null) : null
	);

	// AI generation state
	let generating = $state(false);
	let generateStatus = $state<string | null>(null);
	let showRegenerateConfirm = $state(false);

	// Synthesize draft state
	let synthesizing = $state(false);
	let synthesizeError = $state<string | null>(null);
	let synthesizedDraft = $state<string | null>(null);
	let synthesizedOutline = $state<string[]>([]);
	let synthesizedSuggestions = $state<string[]>([]);
	let showDraftModal = $state(false);

	// Derived values
	const completeness = $derived(computeCompletenessScore(nodes));
	const structuralFlags = $derived(computeStructuralFlags(nodes, edges));
	const coachPrompt = $derived(getCoachPrompt(nodes, edges, completeness, structuralFlags));
	const nodeTypeCounts = $derived(countNodesByType(nodes));
	const typesPresent = $derived(getNodeTypesPresent(nodes));

	function getFlagKey(flag: StructuralFlag): string {
		return `${flag.type}-${flag.nodeId || ''}-${flag.edgeId || ''}`;
	}

	const visibleFlags = $derived(structuralFlags.filter((f) => !dismissedFlags.has(getFlagKey(f))));

	const filteredNodes = $derived(
		filterType === 'all' ? nodes : nodes.filter((n) => n.type === filterType)
	);

	/**
	 * Strip HTML tags and decode entities to get plain text for AI extraction.
	 * Handles rich text editor output (TipTap HTML).
	 */
	function stripHtml(html: string): string {
		if (!html) return '';
		// Replace block-level tags with newlines for paragraph separation
		let text = html
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/p>/gi, '\n\n')
			.replace(/<\/h[1-6]>/gi, '\n\n')
			.replace(/<\/li>/gi, '\n')
			.replace(/<\/div>/gi, '\n');
		// Strip remaining tags
		text = text.replace(/<[^>]*>/g, '');
		// Decode common HTML entities
		text = text
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, ' ');
		// Collapse excessive whitespace but preserve paragraph breaks
		text = text.replace(/\n{3,}/g, '\n\n').trim();
		return text;
	}

	/** Plain text version of the description for length checks and extraction */
	const plainDescription = $derived(stripHtml(discussionDescription));

	/** Plain text from all discussion posts combined */
	const plainPostsText = $derived(
		discussionPosts
			.map((p) => stripHtml(p.content))
			.filter((t) => t.length > 0)
			.join('\n\n')
	);

	/** Title length excluding the "Untitled Discussion" placeholder */
	const effectiveTitleLength = $derived(
		discussionTitle.trim() === 'Untitled Discussion' ? 0 : discussionTitle.trim().length
	);

	/** Total combined text length for generation eligibility */
	const totalTextLength = $derived(
		plainDescription.length +
			effectiveTitleLength +
			plainPostsText.length +
			discussionCitations.reduce(
				(sum, c) => sum + (c.title?.length || 0) + (c.relevant_quote?.length || 0),
				0
			)
	);

	/** Whether there's enough discussion content to generate a graph from */
	const canGenerate = $derived(userId != null && totalTextLength >= 20);

	/** Whether the graph has real content beyond just the root claim */
	const hasExistingContent = $derived(nodes.length > 1 || edges.length > 0);

	onMount(() => {
		loadGraph();
	});

	async function loadGraph() {
		loading = true;
		error = null;
		try {
			const result = await nhost.graphql.request(GET_DISCUSSION_ARGUMENT, {
				discussionId
			});
			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				error = msg || 'Failed to load argument graph';
				return;
			}
			const args = result.data?.argument;
			if (args && args.length > 0) {
				const arg = args[0];
				argumentData = {
					id: arg.id,
					user_id: arg.user_id,
					title: arg.title,
					description: arg.description ?? null,
					discussion_id: arg.discussion_id ?? null,
					post_id: arg.post_id ?? null,
					created_at: arg.created_at,
					updated_at: arg.updated_at
				};
				nodes = arg.argument_nodes || [];
				edges = arg.argument_edges || [];
			}
			// If no graph found, argumentData stays null — show create button
		} catch (e: any) {
			error = e.message || 'Failed to load argument graph';
		} finally {
			loading = false;
		}
	}

	async function createGraph() {
		if (!userId || !canEditGraph) return;
		creatingGraph = true;
		error = null;
		try {
			const result = await nhost.graphql.request(CREATE_DISCUSSION_ARGUMENT, {
				userId,
				discussionId,
				title: discussionTitle,
				rootClaimContent: discussionTitle
			});
			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				error = msg || 'Failed to create argument graph';
				return;
			}
			const arg = result.data?.insert_argument_one;
			if (arg) {
				argumentData = {
					id: arg.id,
					user_id: arg.user_id,
					title: arg.title,
					description: arg.description ?? null,
					discussion_id: arg.discussion_id ?? null,
					post_id: arg.post_id ?? null,
					created_at: arg.created_at,
					updated_at: arg.updated_at
				};
				nodes = arg.argument_nodes || [];
				edges = [];
			}
		} catch (e: any) {
			error = e.message || 'Failed to create argument graph';
		} finally {
			creatingGraph = false;
		}
	}

	/**
	 * Generate an argument graph from the discussion content using AI extraction.
	 * If no argument container exists yet, creates one first.
	 * If one already exists, replaces its nodes/edges with the extraction result.
	 */
	async function generateGraph() {
		if (!userId || !canGenerate || !canEditGraph) return;

		generating = true;
		generateStatus = 'Analyzing discussion content...';
		error = null;
		showRegenerateConfirm = false;

		try {
			// Build the text to analyze from discussion title + description
			// Strip HTML since description may come from the rich text editor
			const textParts: string[] = [];
			if (discussionTitle.trim()) {
				textParts.push(discussionTitle.trim());
			}
			const plainDescription = stripHtml(discussionDescription);
			if (plainDescription) {
				textParts.push(plainDescription);
			}
			// Include discussion posts/comments as additional context
			if (discussionPosts.length > 0) {
				const postTexts = discussionPosts
					.map((p) => {
						const authorName = p.contributor?.display_name || p.contributor?.handle || 'Anonymous';
						const postText = stripHtml(p.content);
						return postText ? `${authorName}: ${postText}` : '';
					})
					.filter((t) => t.length > 0);
				if (postTexts.length > 0) {
					textParts.push('--- Discussion Comments ---');
					textParts.push(...postTexts);
				}
			}
			const text = textParts.join('\n\n');

			if (text.length < 20) {
				error = 'Not enough discussion content to generate a graph (minimum 20 characters).';
				return;
			}

			// Step 1: Call the extraction API
			generateStatus = 'Extracting argument structure with AI...';
			// Build citations payload for the extraction API
			const citationsPayload =
				discussionCitations.length > 0
					? discussionCitations.map((c, i) => ({
							number: i + 1,
							title: c.title,
							url: c.url,
							author: c.author || undefined,
							publisher: c.publisher || undefined,
							publish_date: c.publish_date || undefined,
							point_supported: c.point_supported || undefined,
							relevant_quote: c.relevant_quote || undefined
						}))
					: undefined;

			const response = await fetch('/api/arguments/extract', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, citations: citationsPayload })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => null);
				throw new Error(errorData?.error || `Extraction failed (${response.status})`);
			}

			const extraction: ExtractionResult = await response.json();

			if (!extraction.nodes || extraction.nodes.length === 0) {
				throw new Error(
					'AI extraction returned no argument nodes. Try adding more detail to the discussion.'
				);
			}

			// Step 2: Ensure argument container exists
			generateStatus = 'Setting up argument graph...';
			let argId = argumentData?.id;

			if (!argId) {
				// Create the argument container first
				const createResult = await nhost.graphql.request(CREATE_DISCUSSION_ARGUMENT, {
					userId,
					discussionId,
					title: discussionTitle,
					rootClaimContent: discussionTitle
				});
				if (createResult.error) {
					const msg = Array.isArray(createResult.error)
						? createResult.error[0]?.message
						: createResult.error.message;
					throw new Error(msg || 'Failed to create argument container');
				}
				const arg = createResult.data?.insert_argument_one;
				if (!arg) throw new Error('Failed to create argument container');

				argId = arg.id;
				argumentData = {
					id: arg.id,
					user_id: arg.user_id,
					title: arg.title,
					description: arg.description ?? null,
					discussion_id: arg.discussion_id ?? null,
					post_id: arg.post_id ?? null,
					created_at: arg.created_at,
					updated_at: arg.updated_at
				};
			}

			// Step 3: Delete existing nodes/edges (the creation step may have made a root node)
			generateStatus = 'Clearing existing graph...';
			await nhost.graphql.request(
				`mutation DeleteExistingGraph($argumentId: uuid!) {
					delete_argument_edge(where: { argument_id: { _eq: $argumentId } }) {
						affected_rows
					}
					delete_argument_node(where: { argument_id: { _eq: $argumentId } }) {
						affected_rows
					}
				}`,
				{ argumentId: argId }
			);

			// Step 4: Map temp IDs to real UUIDs and build node objects
			generateStatus = 'Building graph nodes...';
			const warrantConnections = extraction.warrant_connections || [];

			const nodesToInsert = extraction.nodes.map((n) => {
				const isRoot = extraction.root_claim === n.id;
				const warrantConn = warrantConnections.find((w) => w.warrant_node_id === n.id);

				return {
					id: crypto.randomUUID(),
					argument_id: argId!,
					type: n.type,
					content: n.content,
					is_root: isRoot,
					implied: n.implied || false,
					verbatim_span: n.verbatim_span || null,
					metadata: {},
					_temp_id: n.id,
					_draws_from_temp: warrantConn?.draws_from || null,
					_justifies_temp: warrantConn?.justifies || null
				};
			});

			// Build temp->real ID map
			const idMap = new Map<string, string>();
			for (const node of nodesToInsert) {
				idMap.set(node._temp_id, node.id);
			}

			// Resolve warrant draws_from/justifies to real UUIDs
			const dbNodes = nodesToInsert.map((n) => {
				const resolved: Record<string, unknown> = {
					id: n.id,
					argument_id: n.argument_id,
					type: n.type,
					content: n.content,
					is_root: n.is_root,
					implied: n.implied,
					verbatim_span: n.verbatim_span,
					metadata: n.metadata
				};

				if (n._draws_from_temp) {
					resolved.draws_from = idMap.get(n._draws_from_temp) || null;
				}
				if (n._justifies_temp) {
					resolved.justifies = idMap.get(n._justifies_temp) || null;
				}

				return resolved;
			});

			// Step 5: Insert nodes
			generateStatus = `Inserting ${dbNodes.length} nodes...`;
			const nodeResult = await nhost.graphql.request(BULK_INSERT_NODES, {
				nodes: dbNodes
			});
			if (nodeResult.error) {
				const msg = Array.isArray(nodeResult.error)
					? nodeResult.error[0]?.message
					: nodeResult.error.message;
				throw new Error(msg || 'Failed to insert nodes');
			}

			// Step 6: Build and insert edges with resolved IDs
			const dbEdges = (extraction.edges || [])
				.map((e) => {
					const fromId = idMap.get(e.from);
					const toId = idMap.get(e.to);

					if (!fromId || !toId) return null;

					return {
						argument_id: argId!,
						from_node: fromId,
						to_node: toId,
						type: e.type,
						confidence: e.confidence ?? 1.0,
						weight: 1.0,
						metadata: {}
					};
				})
				.filter(Boolean);

			if (dbEdges.length > 0) {
				generateStatus = `Inserting ${dbEdges.length} edges...`;
				const edgeResult = await nhost.graphql.request(BULK_INSERT_EDGES, {
					edges: dbEdges
				});
				if (edgeResult.error) {
					const msg = Array.isArray(edgeResult.error)
						? edgeResult.error[0]?.message
						: edgeResult.error.message;
					throw new Error(msg || 'Failed to insert edges');
				}
			}

			// Step 7: Reload the graph to get properly structured data from the server
			generateStatus = 'Loading generated graph...';
			await loadGraph();

			generateStatus = null;
		} catch (e: any) {
			error = e.message || 'Failed to generate argument graph';
			generateStatus = null;
		} finally {
			generating = false;
		}
	}

	function handleNodeAdded(event: { node: ArgumentNode; edges: ArgumentEdge[] }) {
		nodes = [...nodes, event.node];
		edges = [...edges, ...event.edges];
		showAddNode = false;
		addNodeDefaultType = null;
		coachDismissed = false;
	}

	function selectNode(nodeId: string) {
		selectedNodeId = selectedNodeId === nodeId ? null : nodeId;

		if (selectedNodeId) {
			tick().then(() => {
				const el = document.querySelector(
					`.discussion-graph-node-list [data-node-id="${selectedNodeId}"]`
				);
				if (el) {
					el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			});
		}
	}

	// Build a map of user ID → display name from available post contributors
	const contributorNameMap = $derived.by(() => {
		const map = new Map<string, string>();
		for (const post of discussionPosts) {
			const cId = post.contributor?.id;
			if (cId && !map.has(cId)) {
				map.set(cId, post.contributor?.display_name || post.contributor?.handle || 'Contributor');
			}
		}
		return map;
	});

	function isOwnNode(node: ArgumentNode): boolean {
		if (node.owner_id === userId) return true;
		// Nodes with null owner_id (e.g. auto-generated root claims)
		// should only be editable by the discussion author
		if (node.owner_id === null) return isDiscussionAuthor;
		return false;
	}

	function getNodeOwnerName(node: ArgumentNode): string | undefined {
		if (!isSharedGraph || isOwnNode(node)) return undefined;
		if (node.owner_id) {
			return contributorNameMap.get(node.owner_id) || 'Other contributor';
		}
		return 'Discussion author';
	}

	async function handleDeleteNode(nodeId: string) {
		const nodeToDelete = nodes.find((n) => n.id === nodeId);
		if (!nodeToDelete) return;

		if (nodeToDelete.is_root) {
			error = 'Cannot delete the root claim';
			return;
		}

		if (!isOwnNode(nodeToDelete)) {
			error = 'You can only delete your own nodes';
			return;
		}

		try {
			const result = await nhost.graphql.request(DELETE_NODE, { id: nodeId });

			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				throw new Error(msg || 'Failed to delete node');
			}

			// Remove node and associated edges from local state
			edges = edges.filter((e) => e.from_node !== nodeId && e.to_node !== nodeId);
			nodes = nodes.filter((n) => n.id !== nodeId);

			if (selectedNodeId === nodeId) {
				selectedNodeId = null;
			}
		} catch (err: any) {
			error = err.message || 'Failed to delete node';
		}
	}

	async function handleEditNode(
		nodeId: string,
		updates: { content?: string; type?: ArgumentNodeType }
	) {
		const nodeToEdit = nodes.find((n) => n.id === nodeId);
		if (nodeToEdit && !isOwnNode(nodeToEdit)) {
			error = 'You can only edit your own nodes';
			return;
		}

		try {
			const result = await nhost.graphql.request(UPDATE_NODE, {
				id: nodeId,
				content: updates.content !== undefined ? updates.content : nodeToEdit!.content,
				type: updates.type !== undefined ? updates.type : nodeToEdit!.type,
				implied: nodeToEdit!.implied,
				score: nodeToEdit!.score,
				metadata: nodeToEdit!.metadata
			});

			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				throw new Error(msg || 'Failed to update node');
			}

			// Update local state
			nodes = nodes.map((n) => {
				if (n.id !== nodeId) return n;
				return {
					...n,
					...(updates.content !== undefined ? { content: updates.content } : {}),
					...(updates.type !== undefined ? { type: updates.type } : {})
				};
			});
		} catch (err: any) {
			error = err.message || 'Failed to update node';
			throw err; // re-throw so NodeCard stays in edit mode
		}
	}

	async function handleEditEdge(edgeId: string, updates: { type?: ArgumentEdgeType }) {
		try {
			const result = await nhost.graphql.request(UPDATE_EDGE, {
				id: edgeId,
				...(updates.type !== undefined ? { type: updates.type } : {})
			});

			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				throw new Error(msg || 'Failed to update edge');
			}

			// Update local state
			edges = edges.map((e) => {
				if (e.id !== edgeId) return e;
				return {
					...e,
					...(updates.type !== undefined ? { type: updates.type } : {})
				};
			});
		} catch (err: any) {
			error = err.message || 'Failed to update edge';
			throw err;
		}
	}

	function handleCoachAction(type: ArgumentNodeType) {
		addNodeDefaultType = type;
		showAddNode = true;
	}

	function dismissCoach() {
		coachDismissed = true;
	}

	function dismissFlag(flagKey: string) {
		dismissedFlags = new Set([...dismissedFlags, flagKey]);
	}

	function openAddNode(defaultType?: ArgumentNodeType) {
		addNodeDefaultType = defaultType || null;
		showAddNode = true;
		coachDismissed = false;
	}

	function closeAddNode() {
		showAddNode = false;
		addNodeDefaultType = null;
	}

	function openAddEdge(fromNodeId?: string, toNodeId?: string) {
		addEdgeDefaultFromId = fromNodeId || null;
		addEdgeDefaultToId = toNodeId || null;
		showAddEdge = true;
	}

	function closeAddEdge() {
		showAddEdge = false;
		addEdgeDefaultFromId = null;
		addEdgeDefaultToId = null;
	}

	function handleEdgeAdded(edge: ArgumentEdge) {
		edges = [...edges, edge];
		showAddEdge = false;
		addEdgeDefaultFromId = null;
		addEdgeDefaultToId = null;
	}

	// ── Add Connected Node handlers ─────────────────────────────────

	/**
	 * Determine the appropriate context and open the add-connected-node dialog.
	 *
	 * Flow:
	 * - If the discussion is in edit mode (draft) → mode: 'draft', add directly
	 * - If published & user is the owner → mode: 'choose-owner', let them pick
	 * - If published & user is NOT the owner → mode: 'comment'
	 */
	function handleAddConnectedNode(targetNodeId: string) {
		if (!userId || !argumentData) return;

		addConnectedTargetNodeId = targetNodeId;

		if (isEditMode) {
			// Already editing a draft — add directly
			addConnectedContext = { mode: 'draft' };
		} else if (isDiscussionAuthor) {
			// Owner viewing a published discussion — offer a choice
			addConnectedContext = { mode: 'choose-owner' };
		} else {
			// Non-owner (commenter) on a published discussion
			// Check if they already have a comment draft on this discussion
			// For now we optimistically say false; the parent page is responsible
			// for creating the draft when needed.
			addConnectedContext = { mode: 'comment', commentDraftExists: false };
		}

		showAddConnectedNode = true;
	}

	function closeAddConnectedNode() {
		showAddConnectedNode = false;
		addConnectedTargetNodeId = null;
	}

	function handleConnectedNodeAdded(event: { node: ArgumentNode; edges: ArgumentEdge[] }) {
		nodes = [...nodes, event.node];
		edges = [...edges, ...event.edges];
		showAddConnectedNode = false;
		addConnectedTargetNodeId = null;
		coachDismissed = false;
	}

	/**
	 * Owner chose "Edit Discussion" — navigate to the draft editor.
	 * We close the dialog; the draft page already has isEditMode=true,
	 * so re-opening the add-connected-node flow there will use mode: 'draft'.
	 */
	function handleRequestEditDraft() {
		closeAddConnectedNode();
		// Delegate to the parent page which knows how to create/navigate to a draft
		if (onRequestStartEdit) {
			onRequestStartEdit();
		}
	}

	/**
	 * Owner chose "New Comment" — switch context to comment mode and re-show the form.
	 */
	function handleRequestCommentDraft() {
		addConnectedContext = { mode: 'comment', commentDraftExists: false };
		// Dialog stays open, but now in comment/form mode instead of choice mode
	}

	async function handleGraphNodeEdit(
		nodeId: string,
		updates: { content?: string; type?: ArgumentNodeType }
	) {
		await handleEditNode(nodeId, updates);
	}

	function handleGraphNodeDelete(nodeId: string) {
		handleDeleteNode(nodeId);
	}

	async function synthesizeDraft() {
		if (synthesizing || nodes.length === 0 || !canAddToGraph) return;

		synthesizing = true;
		synthesizeError = null;

		try {
			const payload = {
				nodes: nodes.map((n) => ({
					id: n.id,
					type: n.type,
					content: n.content,
					is_root: n.is_root,
					implied: n.implied
				})),
				edges: edges.map((e) => ({
					id: e.id,
					from_node: e.from_node,
					to_node: e.to_node,
					type: e.type
				})),
				title: argumentData?.title || discussionTitle
			};

			const response = await fetch('/api/arguments/synthesize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ error: 'Failed to synthesize draft' }));
				throw new Error(errorData.error || `Synthesis failed (${response.status})`);
			}

			const result = await response.json();
			synthesizedDraft = result.draft || null;
			synthesizedOutline = result.outline || [];
			synthesizedSuggestions = result.suggestions || [];
			showDraftModal = true;
		} catch (err: any) {
			synthesizeError = err.message || 'Failed to synthesize draft';
		} finally {
			synthesizing = false;
		}
	}

	function closeDraftModal() {
		showDraftModal = false;
	}

	function copyDraftToClipboard() {
		if (synthesizedDraft) {
			navigator.clipboard.writeText(synthesizedDraft).catch(() => {});
		}
	}

	function requestRegenerate() {
		if (hasExistingContent) {
			showRegenerateConfirm = true;
		} else {
			generateGraph();
		}
	}

	function confirmRegenerate() {
		showRegenerateConfirm = false;
		generateGraph();
	}

	function cancelRegenerate() {
		showRegenerateConfirm = false;
	}
</script>

{#if loading}
	<div class="graph-loading">
		<div class="spinner"></div>
		<p>Loading argument graph...</p>
	</div>
{:else if generating}
	<div class="graph-generating">
		<div class="generate-animation">
			<Sparkles size={36} />
		</div>
		<h3>Generating Argument Graph</h3>
		{#if generateStatus}
			<p class="generate-status">{generateStatus}</p>
		{/if}
		<div class="generate-progress">
			<div class="generate-progress-bar"></div>
		</div>
		<p class="generate-hint">This typically takes 10–20 seconds</p>
	</div>
{:else if error && !argumentData}
	<div class="graph-error">
		<p class="error-message">{error}</p>
		<button class="retry-btn" onclick={loadGraph}>Retry</button>
	</div>
{:else if !argumentData}
	<!-- No graph exists yet -->
	<div class="graph-empty">
		{#if totalTextLength >= 20}
			<!-- Primary path: Generate from existing content -->
			<div class="empty-icon">
				<Sparkles size={48} />
			</div>
			<h3>Generate Argument Graph</h3>
			<p class="empty-description">
				Analyze this discussion's content and automatically map out the claims, evidence, sources,
				and reasoning.
			</p>
			<div class="content-summary">
				{#if discussionTitle.trim() && discussionTitle.trim() !== 'Untitled Discussion'}
					<div class="content-summary-item">
						<span class="summary-icon">📝</span>
						<span
							>Discussion: <strong
								>{discussionTitle.trim().length > 60
									? discussionTitle.trim().slice(0, 60) + '…'
									: discussionTitle.trim()}</strong
							></span
						>
					</div>
				{/if}
				{#if plainDescription.length > 0}
					<div class="content-summary-item">
						<span class="summary-icon">📄</span>
						<span>Description ({plainDescription.length} characters)</span>
					</div>
				{/if}
				{#if discussionPosts.length > 0}
					<div class="content-summary-item">
						<span class="summary-icon">💬</span>
						<span
							>{discussionPosts.length} discussion post{discussionPosts.length === 1
								? ''
								: 's'}</span
						>
					</div>
				{/if}
				{#if discussionCitations.length > 0}
					<div class="content-summary-item">
						<span class="summary-icon">📚</span>
						<span
							>{discussionCitations.length} citation{discussionCitations.length === 1 ? '' : 's'} / reference{discussionCitations.length ===
							1
								? ''
								: 's'}</span
						>
					</div>
				{/if}
			</div>
			{#if userId}
				<div class="empty-actions-stacked">
					<Button variant="accent" onclick={generateGraph} disabled={generating || !canEditGraph}>
						{#snippet icon()}
							<Sparkles size={18} />
						{/snippet}
						Generate from Existing Content
					</Button>
					<button class="text-link" onclick={createGraph} disabled={creatingGraph || !canEditGraph}>
						{creatingGraph ? 'Creating...' : 'or start from scratch'}
					</button>
				</div>
			{:else}
				<p class="sign-in-prompt">Sign in to generate an argument graph.</p>
			{/if}
		{:else}
			<!-- Fallback: Not enough content to generate -->
			<div class="empty-icon">
				<Network size={48} />
			</div>
			<h3>No Argument Graph Yet</h3>
			<p class="empty-description">
				Create an argument graph to map out the claims, evidence, and reasoning in this discussion.
				Add more content to the discussion to enable AI generation.
			</p>
			{#if userId}
				<div class="empty-actions">
					<Button variant="secondary" onclick={createGraph} disabled={creatingGraph}>
						{creatingGraph ? 'Creating...' : 'Start from Scratch'}
					</Button>
				</div>
			{:else}
				<p class="sign-in-prompt">Sign in to create an argument graph.</p>
			{/if}
		{/if}
	</div>
{:else}
	<!-- Graph builder UI -->
	<div class="graph-builder">
		<!-- Status bar (hidden on mobile when viewing graph) -->
		<div class="graph-status">
			<CompletenessBar {completeness} />

			{#if coachPrompt && !coachDismissed}
				<CoachBanner prompt={coachPrompt} onAction={handleCoachAction} onDismiss={dismissCoach} />
			{/if}
		</div>

		{#if error}
			<div class="inline-error">
				<p>{error}</p>
				<button onclick={() => (error = null)}>×</button>
			</div>
		{/if}

		{#if showRegenerateConfirm}
			<div class="regenerate-confirm">
				<div class="regenerate-confirm-content">
					<p>
						<strong>Regenerate graph?</strong> This will replace all {nodes.length} existing nodes and
						{edges.length} edges with a new AI-generated graph.
					</p>
					<div class="regenerate-confirm-actions">
						<Button variant="danger" size="sm" onclick={confirmRegenerate}>
							{#snippet icon()}
								<RotateCcw size={14} />
							{/snippet}
							Replace Graph
						</Button>
						<Button variant="ghost" size="sm" onclick={cancelRegenerate}>Cancel</Button>
					</div>
				</div>
			</div>
		{/if}

		<div
			class="graph-panels"
			class:graph-hidden={!showGraph}
			class:node-list-collapsed={nodeListCollapsed}
		>
			<!-- Left panel: Node list -->
			<div
				class="node-list-panel discussion-graph-node-list"
					class:collapsed={nodeListCollapsed}
			>
				{#if nodeListCollapsed}
					<div class="collapsed-strip">
						<button
							class="collapse-toggle"
							onclick={() => (nodeListCollapsed = false)}
							title="Expand node list"
							aria-label="Expand node list"
						>
							<PanelLeftOpen size={16} />
						</button>
						<span class="collapsed-label">Nodes ({nodes.length})</span>
					</div>
				{:else}
					<div class="panel-header">
						<div class="panel-header-tabs">
							<TypeFilterTabs
								{typesPresent}
								{nodeTypeCounts}
								activeFilter={filterType}
								onFilterChange={(type) => (filterType = type)}
							/>
						</div>
						<div class="panel-actions">
							<button
								class="collapse-toggle"
								onclick={() => (nodeListCollapsed = true)}
								title="Collapse node list"
								aria-label="Collapse node list"
							>
								<PanelLeftClose size={16} />
							</button>
							{#if canGenerate && canEditGraph}
								<Button
									variant="ghost"
									size="sm"
									onclick={requestRegenerate}
									disabled={generating}
									title={hasExistingContent ? 'Regenerate graph with AI' : 'Generate graph with AI'}
								>
									{#snippet icon()}
										{#if hasExistingContent}
											<RotateCcw size={14} />
										{:else}
											<Sparkles size={14} />
										{/if}
									{/snippet}
									{hasExistingContent ? 'Regenerate' : 'Generate'}
								</Button>
							{/if}
							{#if canAddToGraph}
								<Button
									variant="ghost"
									size="sm"
									onclick={() => openAddEdge()}
									title="Connect two existing nodes"
								>
									{#snippet icon()}
										<Link size={14} />
									{/snippet}
									Connect
								</Button>
							{/if}
							{#if canAddToGraph && nodes.length >= 2}
								<Button
									variant="ghost"
									size="sm"
									onclick={synthesizeDraft}
									disabled={synthesizing}
									title="Synthesize a written draft from your argument graph"
								>
									{#snippet icon()}
										<FileText size={14} />
									{/snippet}
									{synthesizing ? 'Writing…' : 'Draft'}
								</Button>
							{/if}
							{#if canAddToGraph}
								<Button variant="primary" size="sm" onclick={() => openAddNode()}>
									{#snippet icon()}
										<Plus size={16} />
									{/snippet}
									Add Node
								</Button>
							{/if}
						</div>
					</div>

					<div class="node-list">
						{#if nodes.length === 0}
							<p class="no-nodes">No nodes yet. Start by adding evidence for your claim.</p>
						{:else if listFocusNode}
							{@const focusConfig = NODE_TYPE_CONFIGS[listFocusNode.type]}
							{@const focusIsReadOnly = graphIsReadOnly || (isSharedGraph && !isOwnNode(listFocusNode))}

							<!-- Breadcrumb back button -->
							{#if !listFocusNode.is_root}
								<button class="list-back-btn" onclick={() => {
									const root = nodes.find((n) => n.is_root);
									if (root) listNavigateTo(root.id);
								}}>
									← Back to root
								</button>
							{/if}

							<!-- Focused node card -->
							<div class="list-focus-card" style="--node-color: {focusConfig.color}; --node-bg: {focusConfig.bgColor}">
								<div class="list-focus-header">
									<div class="list-focus-type" style="color: {focusConfig.color}">
										<span class="list-focus-dot" style="background: {focusConfig.color}"></span>
										{focusConfig.label.toUpperCase()}
										{#if listFocusNode.is_root} ★{/if}
									</div>
									<div class="list-focus-actions">
										{#if !focusIsReadOnly && canAddToGraph}
											<button class="list-action-btn" onclick={() => handleAddConnectedNode(listFocusNode.id)}>+ Add</button>
										{/if}
										{#if !focusIsReadOnly}
											<button class="list-action-btn" onclick={() => {
												const el = document.querySelector(`[data-node-id="${listFocusNode.id}"]`);
											}}>Edit</button>
										{/if}
									</div>
								</div>
								<div class="list-focus-content">{listFocusNode.content}</div>
							</div>

							<!-- Connected from (incoming) -->
							{@const incoming = listFocusConnections.filter((c) => c.direction === 'incoming')}
							{@const outgoing = listFocusConnections.filter((c) => c.direction === 'outgoing')}

							{#if incoming.length > 0}
								<div class="list-connections-label">Connected from</div>
								<div class="list-connections">
									{#each incoming as conn}
										{@const cConfig = NODE_TYPE_CONFIGS[conn.node.type]}
										{@const neighborCount = edges.filter((e) => e.from_node === conn.node.id || e.to_node === conn.node.id).length}
										<button
											class="list-conn-badge"
											style="border-color: {cConfig.color}30; --node-color: {cConfig.color}; --node-bg: {cConfig.bgColor}"
											onclick={() => listNavigateTo(conn.node.id)}
										>
											<span class="list-conn-type" style="color: {cConfig.color}">{cConfig.label}</span>
											<span class="list-conn-edge">{conn.edgeType.replace('_', ' ')}</span>
											<span class="list-conn-content">{conn.node.content.length > 100 ? conn.node.content.slice(0, 100) + '…' : conn.node.content}</span>
											{#if neighborCount > 1}
												<span class="list-conn-count" style="background: {cConfig.color}">{neighborCount - 1}</span>
											{/if}
										</button>
									{/each}
								</div>
							{/if}

							<!-- Connects to (outgoing) -->
							{#if outgoing.length > 0}
								<div class="list-connections-label">Connects to</div>
								<div class="list-connections">
									{#each outgoing as conn}
										{@const cConfig = NODE_TYPE_CONFIGS[conn.node.type]}
										{@const neighborCount = edges.filter((e) => e.from_node === conn.node.id || e.to_node === conn.node.id).length}
										<button
											class="list-conn-badge"
											style="border-color: {cConfig.color}30; --node-color: {cConfig.color}; --node-bg: {cConfig.bgColor}"
											onclick={() => listNavigateTo(conn.node.id)}
										>
											<span class="list-conn-type" style="color: {cConfig.color}">{cConfig.label}</span>
											<span class="list-conn-edge">{conn.edgeType.replace('_', ' ')}</span>
											<span class="list-conn-content">{conn.node.content.length > 100 ? conn.node.content.slice(0, 100) + '…' : conn.node.content}</span>
											{#if neighborCount > 1}
												<span class="list-conn-count" style="background: {cConfig.color}">{neighborCount - 1}</span>
											{/if}
										</button>
									{/each}
								</div>
							{/if}

							{#if incoming.length === 0 && outgoing.length === 0}
								<p class="no-nodes">No connections yet.</p>
							{/if}
						{/if}
					</div>
				{/if}
			</div>

			<!-- Right panel: Graph visualization -->
			{#if showGraph}
				<div class="graph-viz-panel">
					<ArgumentGraph
						{nodes}
						{edges}
						{selectedNodeId}
						onNodeSelect={selectNode}
						structuralFlags={visibleFlags}
						onNodeEdit={canEditGraph ? handleGraphNodeEdit : undefined}
						onNodeDelete={canAddToGraph ? handleGraphNodeDelete : undefined}
						onAddEdge={canAddToGraph ? (fromId) => openAddEdge(fromId) : undefined}
						onAddConnectedNode={canAddToGraph
							? handleAddConnectedNode
							: userId
								? handleAddConnectedNode
								: undefined}
						isReadOnly={!canAddToGraph}
						isOwnNode={(n) => isOwnNode(n)}
						onToggleNodeList={() => (nodeListCollapsed = !nodeListCollapsed)}
						nodeListVisible={!nodeListCollapsed}
						argumentId={argumentData.id}
						{isSharedGraph}
						onNodeAdded={canAddToGraph ? handleNodeAdded : undefined}
					/>
				</div>
			{/if}
		</div>
	</div>

	<!-- Add Node Sheet -->
	<AddNodeSheet
		show={showAddNode}
		argumentId={argumentData.id}
		{nodes}
		{edges}
		defaultType={addNodeDefaultType}
		onClose={closeAddNode}
		onNodeAdded={handleNodeAdded}
		{isSharedGraph}
	/>

	<!-- Add Edge (Connection) Sheet -->
	<AddEdgeSheet
		show={showAddEdge}
		argumentId={argumentData.id}
		{nodes}
		{edges}
		defaultFromNodeId={addEdgeDefaultFromId}
		defaultToNodeId={addEdgeDefaultToId}
		onClose={closeAddEdge}
		onEdgeAdded={handleEdgeAdded}
	/>

	<!-- Add Connected Node Dialog -->
	{#if addConnectedTargetNode}
		<AddConnectedNodeDialog
			show={showAddConnectedNode}
			argumentId={argumentData.id}
			targetNode={addConnectedTargetNode}
			{nodes}
			{edges}
			context={addConnectedContext}
			{isSharedGraph}
			onClose={closeAddConnectedNode}
			onNodeAdded={handleConnectedNodeAdded}
			onRequestEditDraft={isDiscussionAuthor ? handleRequestEditDraft : undefined}
			onRequestCommentDraft={isDiscussionAuthor ? handleRequestCommentDraft : undefined}
		/>
	{/if}

	{#if showDraftModal && synthesizedDraft}
		<div
			class="draft-modal-backdrop"
			onclick={closeDraftModal}
			onkeydown={(e) => e.key === 'Escape' && closeDraftModal()}
			role="dialog"
			aria-modal="true"
			aria-label="Synthesized draft"
		>
			<div
				class="draft-modal"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<header class="draft-modal-header">
					<h3>Synthesized Draft</h3>
					<div class="draft-modal-actions">
						<button class="draft-copy-btn" onclick={copyDraftToClipboard} title="Copy to clipboard">
							📋
						</button>
						<button class="draft-close-btn" onclick={closeDraftModal} aria-label="Close draft">
							✕
						</button>
					</div>
				</header>

				{#if synthesizedOutline.length > 0}
					<div class="draft-outline">
						<h4>Outline</h4>
						<ol>
							{#each synthesizedOutline as heading}
								<li>{heading}</li>
							{/each}
						</ol>
					</div>
				{/if}

				<div class="draft-content">
					{@html sanitizeMultiline(synthesizedDraft)}
				</div>

				{#if synthesizedSuggestions.length > 0}
					<div class="draft-suggestions">
						<h4>Suggestions for Improvement</h4>
						<ul>
							{#each synthesizedSuggestions as suggestion}
								<li>{suggestion}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if synthesizeError}
		<div class="inline-error">
			<p>{synthesizeError}</p>
			<button onclick={() => (synthesizeError = null)}>Dismiss</button>
		</div>
	{/if}
{/if}

<style>
	.draft-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.draft-modal {
		background: var(--color-surface, #fff);
		border-radius: 12px;
		max-width: 720px;
		width: 100%;
		max-height: 80vh;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.draft-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.draft-modal-header h3 {
		margin: 0;
		font-size: 1.125rem;
	}

	.draft-modal-actions {
		display: flex;
		gap: 0.5rem;
	}

	.draft-copy-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.125rem;
		padding: 0.25rem;
	}

	.draft-copy-btn:hover {
		opacity: 0.7;
	}

	.draft-close-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		color: var(--color-text-secondary, #666);
	}

	.draft-close-btn:hover {
		background: var(--color-surface-hover, #f0f0f0);
	}

	.draft-outline {
		margin-bottom: 1rem;
	}

	.draft-outline h4 {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
		color: var(--color-text-secondary, #666);
	}

	.draft-outline ol {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.875rem;
	}

	.draft-content {
		font-size: 0.9375rem;
		line-height: 1.6;
		margin-bottom: 1rem;
	}

	.draft-suggestions {
		margin-top: 1rem;
	}

	.draft-suggestions h4 {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
		color: var(--color-text-secondary, #666);
	}

	.draft-suggestions ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.875rem;
	}

	.draft-suggestions li {
		margin-bottom: 0.25rem;
	}

	@media (max-width: 768px) {
		.draft-modal-backdrop {
			padding: 0.5rem;
		}
		.draft-modal {
			max-height: 90vh;
		}
	}

	/* Loading state */
	.graph-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		gap: 1rem;
		color: var(--color-text-secondary, #888);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border, #333);
		border-top-color: var(--color-primary, #6366f1);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Generating state */
	.graph-generating {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		gap: 1rem;
		text-align: center;
	}

	.generate-animation {
		color: var(--color-primary, #6366f1);
		animation: pulse-glow 2s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 0.6;
			transform: scale(1);
		}
		50% {
			opacity: 1;
			transform: scale(1.1);
		}
	}

	.graph-generating h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text-primary, #e0e0e0);
	}

	.generate-status {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-primary, #6366f1);
		font-weight: 500;
	}

	.generate-progress {
		width: 200px;
		height: 4px;
		background: var(--color-surface-elevated, #1e1e1e);
		border-radius: 2px;
		overflow: hidden;
	}

	.generate-progress-bar {
		height: 100%;
		width: 30%;
		background: var(--color-primary, #6366f1);
		border-radius: 2px;
		animation: progress-slide 1.5s ease-in-out infinite;
	}

	@keyframes progress-slide {
		0% {
			transform: translateX(-100%);
			width: 30%;
		}
		50% {
			width: 60%;
		}
		100% {
			transform: translateX(350%);
			width: 30%;
		}
	}

	.generate-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-text-tertiary, #666);
	}

	/* Error state */
	.graph-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1.5rem;
		gap: 1rem;
		text-align: center;
	}

	.graph-error .error-message {
		color: var(--color-error, #ef4444);
		font-size: 0.9rem;
	}

	.retry-btn {
		background: var(--color-surface-elevated, #1e1e1e);
		color: var(--color-text-primary, #e0e0e0);
		border: 1px solid var(--color-border, #333);
		border-radius: var(--border-radius-md, 8px);
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.retry-btn:hover {
		background: var(--color-surface-hover, #2a2a2a);
	}

	/* Empty state */
	.graph-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		gap: 1rem;
		text-align: center;
	}

	.empty-icon {
		color: var(--color-text-tertiary, #666);
		opacity: 0.6;
	}

	.graph-empty h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text-primary, #e0e0e0);
	}

	.empty-description {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary, #888);
		max-width: 400px;
		line-height: 1.5;
	}

	.content-summary {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.75rem 1rem;
		background: var(--color-surface-elevated, #1e1e1e);
		border: 1px solid var(--color-border, #333);
		border-radius: var(--border-radius-md, 8px);
		max-width: 400px;
		width: 100%;
		text-align: left;
	}

	.content-summary-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: var(--color-text-secondary, #aaa);
		line-height: 1.3;
	}

	.content-summary-item strong {
		color: var(--color-text-primary, #e0e0e0);
		font-weight: 500;
	}

	.summary-icon {
		flex-shrink: 0;
		font-size: 0.85rem;
	}

	.empty-actions-stacked {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.5rem;
	}

	.text-link {
		background: none;
		border: none;
		color: var(--color-text-tertiary, #666);
		font-size: 0.8rem;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		padding: 0.25rem;
		transition: color 0.15s;
	}

	.text-link:hover {
		color: var(--color-text-secondary, #aaa);
	}

	.text-link:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.or-divider {
		font-size: 0.8rem;
		color: var(--color-text-tertiary, #666);
		font-style: italic;
	}

	.sign-in-prompt {
		font-size: 0.85rem;
		color: var(--color-text-tertiary, #666);
		font-style: italic;
	}

	/* Graph builder */
	.graph-builder {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* Status section */
	.graph-status {
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-bottom: 1px solid var(--color-border, #333);
	}

	/* Inline error */
	.inline-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border-bottom: 1px solid rgba(239, 68, 68, 0.2);
	}

	.inline-error p {
		margin: 0;
		font-size: 0.85rem;
		color: #ef4444;
	}

	.inline-error button {
		background: none;
		border: none;
		color: #ef4444;
		cursor: pointer;
		font-size: 1.1rem;
		padding: 0 0.25rem;
		opacity: 0.7;
	}

	.inline-error button:hover {
		opacity: 1;
	}

	/* Regenerate confirmation */
	.regenerate-confirm {
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-warning, #eab308) 8%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--color-warning, #eab308) 25%, transparent);
	}

	.regenerate-confirm-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.regenerate-confirm-content p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-text-primary, #e0e0e0);
		line-height: 1.4;
	}

	.regenerate-confirm-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* Panels layout */
	.graph-panels {
		display: flex;
		flex-direction: row;
		height: clamp(420px, 70vh, 900px);
		overflow: hidden;
	}

	.node-list-panel {
		flex: 0 0 320px;
		max-width: 380px;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border, #333);
		touch-action: pan-y;
		overflow: hidden;
		transition:
			flex-basis 0.2s ease,
			max-width 0.2s ease;
	}

	.node-list-panel.collapsed {
		flex: 0 0 44px;
		max-width: 44px;
		min-width: 0;
		overflow: hidden;
	}

	.graph-hidden .node-list-panel {
		flex: 1;
		max-width: none;
		border-right: none;
	}

	.graph-viz-panel {
		flex: 1 1 0%;
		min-width: 0;
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		overscroll-behavior: contain;
		touch-action: none;
	}

	.node-list-collapsed .graph-viz-panel {
		flex: 1;
	}

	/* Collapsed strip */
	.collapsed-strip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
		height: 100%;
	}

	.collapsed-label {
		writing-mode: vertical-rl;
		text-orientation: mixed;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-tertiary, #607d8b);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	/* Collapse toggle button */
	.collapse-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--color-text-tertiary, #607d8b);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.collapse-toggle:hover {
		color: var(--color-text-primary, #eceff1);
		background: var(--color-surface-alt, #1e1e1e);
		border-color: var(--color-border, #333);
	}

	/* Panel header */
	.panel-header {
		display: flex;
		flex-direction: column;
		padding: 0;
		border-bottom: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.panel-header-tabs {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border, #333) 50%, transparent);
	}

	.panel-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
		padding: 0.375rem 0.75rem;
		justify-content: flex-end;
	}

	/* Node list */
	.node-list {
		flex: 1 1 0%;
		min-height: 0;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		touch-action: pan-y;
		overscroll-behavior: contain;
	}

	/* Drill-down list styles */
	.list-back-btn {
		background: none;
		border: none;
		color: var(--color-text-tertiary, #607d8b);
		font-size: 11px;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		padding: 4px 0;
		text-align: left;
		transition: color 0.12s;
	}

	.list-back-btn:hover {
		color: var(--color-text-primary, #eceff1);
	}

	.list-focus-card {
		background: var(--node-bg);
		border: 1px solid color-mix(in srgb, var(--node-color) 35%, var(--color-border, #333));
		border-radius: 8px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.list-focus-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}

	.list-focus-type {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-family: var(--font-family-ui, sans-serif);
	}

	.list-focus-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.list-focus-actions {
		display: flex;
		gap: 4px;
	}

	.list-action-btn {
		background: none;
		border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		border-radius: 5px;
		color: var(--color-text-secondary, #90a4ae);
		padding: 2px 8px;
		font-size: 11px;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.12s;
	}

	.list-action-btn:hover {
		color: var(--color-text-primary, #eceff1);
		border-color: var(--color-text-secondary, #90a4ae);
	}

	.list-focus-content {
		font-size: 13px;
		line-height: 1.55;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-serif, serif);
		white-space: pre-wrap;
		word-break: normal;
		overflow-wrap: break-word;
	}

	.list-connections-label {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary, #607d8b);
		font-family: var(--font-family-ui, sans-serif);
		padding: 4px 0 0;
	}

	.list-connections {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.list-conn-badge {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 8px 10px;
		border: 1px solid;
		border-radius: 7px;
		background: color-mix(in srgb, var(--node-bg) 80%, transparent);
		cursor: pointer;
		text-align: left;
		transition: all 0.12s ease;
		font-family: var(--font-family-ui, sans-serif);
	}

	.list-conn-badge:hover {
		filter: brightness(1.3);
		transform: translateX(2px);
	}

	.list-conn-type {
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.list-conn-edge {
		font-size: 9px;
		color: var(--color-text-tertiary, #607d8b);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.list-conn-content {
		font-size: 11px;
		color: var(--color-text-secondary, #90a4ae);
		line-height: 1.4;
		flex: 1;
		min-width: 0;
	}

	.list-conn-count {
		font-size: 9px;
		font-weight: 700;
		color: #fff;
		padding: 1px 5px;
		border-radius: 10px;
		flex-shrink: 0;
	}

	.no-nodes {
		text-align: center;
		padding: 2rem 1rem;
		color: var(--color-text-tertiary, #666);
		font-size: 0.85rem;
		line-height: 1.5;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.graph-panels {
			flex-direction: column;
			height: auto;
			overflow: visible;
		}

		.node-list-panel {
			flex: none;
			max-width: none;
			border-right: none;
			overflow: visible;
		}

		.node-list-panel.collapsed {
			display: none;
		}

		.graph-viz-panel {
			/* Give the graph most of the screen on mobile */
			min-height: 60vh;
			height: calc(100svh - 140px);
			flex: none;
		}

		.graph-status {
			padding: 0.5rem 0.75rem;
		}

		.panel-header-tabs {
			padding: 0.4rem 0.5rem;
		}
		.panel-actions {
			padding: 0.3rem 0.5rem;
			flex-wrap: wrap;
			gap: 0.25rem;
		}

		.node-list {
			max-height: 50vh;
			overflow-y: auto;
		}

		.empty-actions {
			flex-direction: column;
		}

		.or-divider {
			display: none;
		}

		.regenerate-confirm-content {
			flex-direction: column;
			align-items: flex-start;
		}
	}

	@media (min-width: 769px) and (max-width: 1024px) {
		.node-list-panel {
			flex: 0 0 280px;
			max-width: 340px;
		}

		.graph-panels {
			height: clamp(400px, 65vh, 700px);
		}
	}

	@media (min-width: 1025px) and (max-width: 1399px) {
		.node-list-panel {
			flex: 0 0 320px;
			max-width: 400px;
		}
	}

	@media (min-width: 1400px) {
		.node-list-panel {
			flex: 0 0 380px;
			max-width: 500px;
		}

		.graph-panels {
			height: clamp(500px, 75vh, 1000px);
		}
	}
</style>
