<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import {
		GET_DISCUSSION_ARGUMENT,
		CREATE_DISCUSSION_ARGUMENT,
		DELETE_NODE,
		UPDATE_NODE,
		BULK_INSERT_NODES,
		BULK_INSERT_EDGES
	} from '$lib/graphql/queries';
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		CompletenessScore,
		StructuralFlag,
		ExtractionResult,
		AddNodeContext
	} from '$lib/types/argument';
	import { sanitizeMultiline } from '$lib/utils/sanitize';
	import {
		computeCompletenessScore,
		computeStructuralFlags,
		getCoachPrompt
	} from '$lib/utils/argumentUtils';
	import CompletenessBar from '$lib/components/arguments/CompletenessBar.svelte';
	import CoachBanner from '$lib/components/arguments/CoachBanner.svelte';
	import ArgumentGraph from '$lib/components/arguments/ArgumentGraph.svelte';
	import ArgumentBuilder from '$lib/components/arguments/ArgumentBuilder.svelte';
	import ArgumentCardCarousel from '$lib/components/arguments/ArgumentCardCarousel.svelte';
	import ArgumentViewToggle, {
		type ArgumentView
	} from '$lib/components/arguments/ArgumentViewToggle.svelte';
	import AddConnectedNodeDialog from '$lib/components/arguments/AddConnectedNodeDialog.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Sparkles, RotateCcw, FileText, Network } from '@lucide/svelte';

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
		/** Callback to request the parent page start the "edit discussion" flow */
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

	// ── Core data state ────────────────────────────────────────────
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

	// ── Multi-user shared-graph state ──────────────────────────────
	const isSharedGraph = $derived(argumentData?.discussion_id != null);

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

	// ── UI state ───────────────────────────────────────────────────
	let selectedNodeId = $state<string | null>(null);
	let view = $state<ArgumentView>('builder');
	let coachDismissed = $state(false);
	let creatingGraph = $state(false);
	let dismissedFlags = $state<Set<string>>(new Set());

	// Viewport detection — drives which surface we render
	let isMobile = $state(false);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 768px)');
		const update = () => {
			isMobile = mq.matches;
		};
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	});

	// Add-connected-node dialog (only used for shared-graph comment/author choice flow)
	let showAddConnectedNode = $state(false);
	let addConnectedTargetNodeId = $state<string | null>(null);
	let addConnectedContext = $state<AddNodeContext>({ mode: 'draft' });

	const addConnectedTargetNode = $derived(
		addConnectedTargetNodeId
			? (nodes.find((n) => n.id === addConnectedTargetNodeId) ?? null)
			: null
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
	let draftMode = $state<'full' | 'comment'>('full');

	// ── Derived coach / completeness ──────────────────────────────
	const completeness = $derived<CompletenessScore>(computeCompletenessScore(nodes));
	const structuralFlags = $derived(computeStructuralFlags(nodes, edges));
	const coachPrompt = $derived(getCoachPrompt(nodes, edges, completeness, structuralFlags));

	function getFlagKey(flag: StructuralFlag): string {
		return `${flag.type}-${flag.nodeId || ''}-${flag.edgeId || ''}`;
	}
	const visibleFlags = $derived(
		structuralFlags.filter((f) => !dismissedFlags.has(getFlagKey(f)))
	);

	// ── Content-eligibility derivations for AI generation ──────────
	function stripHtml(html: string): string {
		if (!html) return '';
		let text = html
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/p>/gi, '\n\n')
			.replace(/<\/h[1-6]>/gi, '\n\n')
			.replace(/<\/li>/gi, '\n')
			.replace(/<\/div>/gi, '\n');
		text = text.replace(/<[^>]*>/g, '');
		text = text
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, ' ');
		text = text.replace(/\n{3,}/g, '\n\n').trim();
		return text;
	}

	const plainDescription = $derived(stripHtml(discussionDescription));
	const plainPostsText = $derived(
		discussionPosts
			.map((p) => stripHtml(p.content))
			.filter((t) => t.length > 0)
			.join('\n\n')
	);
	const effectiveTitleLength = $derived(
		discussionTitle.trim() === 'Untitled Discussion' ? 0 : discussionTitle.trim().length
	);
	const totalTextLength = $derived(
		plainDescription.length +
			effectiveTitleLength +
			plainPostsText.length +
			discussionCitations.reduce(
				(sum, c) => sum + (c.title?.length || 0) + (c.relevant_quote?.length || 0),
				0
			)
	);
	const canGenerate = $derived(userId != null && totalTextLength >= 20);
	const hasExistingContent = $derived(nodes.length > 1 || edges.length > 0);

	// ── Owner / permissions ────────────────────────────────────────
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

	/**
	 * Every node in a shared graph falls into one of three origins, relative to
	 * the current viewer:
	 *   - 'author' — belongs to the discussion author (part of the original post)
	 *   - 'mine'   — belongs to the current user (in-progress comment draft)
	 *   - 'other'  — belongs to some other contributor (someone else's comment)
	 *
	 * A null owner_id is treated as the argument's owner (legacy/pre-multi-user
	 * graphs attribute the whole graph to the argument's author).
	 */
	type NodeOrigin = 'author' | 'mine' | 'other';

	function getNodeOrigin(node: ArgumentNode): NodeOrigin {
		const argAuthorId = argumentData?.user_id ?? null;
		const effectiveOwner = node.owner_id ?? argAuthorId;
		if (userId && effectiveOwner === userId) return 'mine';
		if (effectiveOwner != null && effectiveOwner === argAuthorId) return 'author';
		return 'other';
	}

	function isOwnNode(node: ArgumentNode): boolean {
		return getNodeOrigin(node) === 'mine';
	}

	function getNodeOwnerName(node: ArgumentNode): string | undefined {
		if (!isSharedGraph) return undefined;
		const origin = getNodeOrigin(node);
		if (origin === 'mine') return undefined;
		if (origin === 'author') return 'Discussion author';
		if (node.owner_id) {
			return contributorNameMap.get(node.owner_id) || 'Other contributor';
		}
		return 'Other contributor';
	}

	function canEditNode(node: ArgumentNode): boolean {
		if (!canAddToGraph) return false;
		return isOwnNode(node);
	}

	// Count of the current user's own (non-root) nodes — used to gate the
	// "Synthesize Draft" action in commenter mode.
	const myNodeCount = $derived(
		userId ? nodes.filter((n) => getNodeOrigin(n) === 'mine' && !n.is_root).length : 0
	);

	// ── Data loading / creation ────────────────────────────────────
	onMount(() => {
		loadGraph();
	});

	async function loadGraph() {
		loading = true;
		error = null;
		try {
			const result = await nhost.graphql.request(GET_DISCUSSION_ARGUMENT, { discussionId });
			if (result.error) {
				const msg = Array.isArray(result.error)
					? result.error[0]?.message
					: result.error.message;
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
				const msg = Array.isArray(result.error)
					? result.error[0]?.message
					: result.error.message;
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

	async function generateGraph() {
		if (!userId || !canGenerate || !canEditGraph) return;

		generating = true;
		generateStatus = 'Analyzing discussion content...';
		error = null;
		showRegenerateConfirm = false;

		try {
			const textParts: string[] = [];
			if (discussionTitle.trim()) textParts.push(discussionTitle.trim());
			const pd = stripHtml(discussionDescription);
			if (pd) textParts.push(pd);
			if (discussionPosts.length > 0) {
				const postTexts = discussionPosts
					.map((p) => {
						const authorName =
							p.contributor?.display_name || p.contributor?.handle || 'Anonymous';
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

			generateStatus = 'Extracting argument structure with AI...';
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

			generateStatus = 'Setting up argument graph...';
			let argId = argumentData?.id;
			if (!argId) {
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

			const idMap = new Map<string, string>();
			for (const node of nodesToInsert) idMap.set(node._temp_id, node.id);

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
				if (n._draws_from_temp) resolved.draws_from = idMap.get(n._draws_from_temp) || null;
				if (n._justifies_temp) resolved.justifies = idMap.get(n._justifies_temp) || null;
				return resolved;
			});

			generateStatus = `Inserting ${dbNodes.length} nodes...`;
			const nodeResult = await nhost.graphql.request(BULK_INSERT_NODES, { nodes: dbNodes });
			if (nodeResult.error) {
				const msg = Array.isArray(nodeResult.error)
					? nodeResult.error[0]?.message
					: nodeResult.error.message;
				throw new Error(msg || 'Failed to insert nodes');
			}

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
				const edgeResult = await nhost.graphql.request(BULK_INSERT_EDGES, { edges: dbEdges });
				if (edgeResult.error) {
					const msg = Array.isArray(edgeResult.error)
						? edgeResult.error[0]?.message
						: edgeResult.error.message;
					throw new Error(msg || 'Failed to insert edges');
				}
			}

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

	// ── Node add / edit / delete handlers ──────────────────────────
	function handleNodeAdded(event: { node: ArgumentNode; edges: ArgumentEdge[] }) {
		nodes = [...nodes, event.node];
		edges = [...edges, ...event.edges];
		coachDismissed = false;
	}

	function selectNode(nodeId: string) {
		selectedNodeId = selectedNodeId === nodeId ? null : nodeId;
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
				const msg = Array.isArray(result.error)
					? result.error[0]?.message
					: result.error.message;
				throw new Error(msg || 'Failed to delete node');
			}
			edges = edges.filter((e) => e.from_node !== nodeId && e.to_node !== nodeId);
			nodes = nodes.filter((n) => n.id !== nodeId);
			if (selectedNodeId === nodeId) selectedNodeId = null;
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
				const msg = Array.isArray(result.error)
					? result.error[0]?.message
					: result.error.message;
				throw new Error(msg || 'Failed to update node');
			}
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
			throw err;
		}
	}

	function handleCoachAction(type: ArgumentNodeType) {
		// Coach just hints which type to add; actual adding happens via the builder's inline actions.
		coachDismissed = true;
	}

	function dismissCoach() {
		coachDismissed = true;
	}

	function dismissFlag(flagKey: string) {
		dismissedFlags = new Set([...dismissedFlags, flagKey]);
	}

	// ── Add Connected Node dialog (for published-discussion flow) ──
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

	function handleRequestEditDraft() {
		closeAddConnectedNode();
		onRequestStartEdit?.();
	}

	function handleRequestCommentDraft() {
		addConnectedContext = { mode: 'comment', commentDraftExists: false };
	}

	// ── Synthesize draft ───────────────────────────────────────────
	/**
	 * Gate for the Synthesize Draft action.
	 * - Author (edit or view): can always synthesize a full draft from any
	 *   graph with at least 2 nodes.
	 * - Commenter: must have at least one of their own (non-root) nodes to
	 *   synthesize — otherwise there's nothing to synthesize from their side.
	 */
	const canSynthesize = $derived(
		canAddToGraph &&
			nodes.length >= 2 &&
			(graphMode === 'commenter' ? myNodeCount >= 1 : true)
	);

	async function synthesizeDraft() {
		if (synthesizing || nodes.length === 0 || !canSynthesize) return;
		synthesizing = true;
		synthesizeError = null;
		try {
			// Commenter → synthesize their draft as a comment responding to the
			// existing argument. Author → synthesize the whole graph as a draft.
			const mode: 'full' | 'comment' = graphMode === 'commenter' ? 'comment' : 'full';
			draftMode = mode;

			const responseNodeIds =
				mode === 'comment'
					? nodes.filter((n) => getNodeOrigin(n) === 'mine').map((n) => n.id)
					: undefined;

			const payload: Record<string, unknown> = {
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
				title: argumentData?.title || discussionTitle,
				mode
			};
			if (responseNodeIds && responseNodeIds.length > 0) {
				payload.response_node_ids = responseNodeIds;
			}

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
	<div class="graph-empty">
		{#if totalTextLength >= 20}
			<div class="empty-icon">
				<Sparkles size={48} />
			</div>
			<h3>Generate Argument Graph</h3>
			<p class="empty-description">
				Analyze this discussion's content and automatically map out the claims, evidence, sources,
				and reasoning.
			</p>
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
	<!-- ── Primary graph UI ────────────────────────────────────── -->
	<div class="graph-shell">
		<!-- Top bar: view toggle + generate action -->
		<header class="graph-topbar">
			<ArgumentViewToggle
				value={view}
				onChange={(v) => (view = v)}
				hideMap={isMobile}
			/>
			<div class="graph-topbar-actions">
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
			</div>
		</header>

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
						<strong>Regenerate graph?</strong> This will replace all {nodes.length} existing nodes
						and {edges.length} edges with a new AI-generated graph.
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

		<!-- Main surface — picks between mobile carousel, desktop builder, or map -->
		<div class="graph-surface" class:surface-map={!isMobile && view === 'map'}>
			{#if isMobile}
				<ArgumentCardCarousel
					{nodes}
					{edges}
					argumentId={argumentData.id}
					{selectedNodeId}
					onSelect={selectNode}
					onEdit={handleEditNode}
					onDelete={handleDeleteNode}
					onNodeAdded={handleNodeAdded}
					{canEditNode}
					getOwnerName={getNodeOwnerName}
					{getNodeOrigin}
					{graphMode}
					{isSharedGraph}
					canAdd={canAddToGraph}
				/>
			{:else if view === 'map'}
				<ArgumentGraph
					{nodes}
					{edges}
					{selectedNodeId}
					onNodeSelect={selectNode}
				/>
			{:else}
				<ArgumentBuilder
					{nodes}
					{edges}
					argumentId={argumentData.id}
					{selectedNodeId}
					onSelect={selectNode}
					onEdit={handleEditNode}
					onDelete={handleDeleteNode}
					onNodeAdded={handleNodeAdded}
					{canEditNode}
					getOwnerName={getNodeOwnerName}
					{getNodeOrigin}
					{graphMode}
					{isSharedGraph}
					canAdd={canAddToGraph}
				/>
			{/if}
		</div>

		<!-- Sticky footer: completeness bar + coach + synthesize draft -->
		<footer class="graph-footer">
			<div class="graph-footer-main">
				<CompletenessBar {completeness} />
			</div>
			{#if coachPrompt && !coachDismissed}
				<div class="graph-footer-coach">
					<CoachBanner
						prompt={coachPrompt}
						onAction={handleCoachAction}
						onDismiss={dismissCoach}
					/>
				</div>
			{/if}
			{#if canAddToGraph && nodes.length >= 2}
				<div class="graph-footer-actions">
					{#if graphMode === 'commenter' && myNodeCount === 0}
						<span class="footer-hint" title="Add at least one node (e.g. a counter or evidence) to synthesize a comment">
							Add a node to synthesize a comment
						</span>
					{/if}
					<Button
						variant="ghost"
						size="sm"
						onclick={synthesizeDraft}
						disabled={synthesizing || !canSynthesize}
						title={graphMode === 'commenter'
							? 'Synthesize a comment from the nodes you have added'
							: 'Synthesize a written draft from your argument graph'}
					>
						{#snippet icon()}
							<FileText size={14} />
						{/snippet}
						{synthesizing
							? 'Writing…'
							: graphMode === 'commenter'
								? 'Synthesize Comment'
								: 'Synthesize Draft'}
					</Button>
				</div>
			{/if}
		</footer>
	</div>

	<!-- Add Connected Node Dialog (shared-graph comment / choose-owner flow) -->
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
				role="document"
			>
				<header class="draft-modal-header">
					<h3>{draftMode === 'comment' ? 'Synthesized Comment' : 'Synthesized Draft'}</h3>
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
	/* ── Loading / generating / error / empty states ───────────── */
	.graph-loading,
	.graph-generating,
	.graph-error,
	.graph-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		gap: 1rem;
		text-align: center;
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

	.graph-generating h3,
	.graph-empty h3 {
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

	.graph-error .error-message {
		color: var(--color-error, #ef4444);
		font-size: 0.9rem;
	}

	.retry-btn {
		background: var(--color-surface-elevated, #1e1e1e);
		color: var(--color-text-primary, #e0e0e0);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.retry-btn:hover {
		background: var(--color-surface-hover, #2a2a2a);
	}

	.empty-icon {
		color: var(--color-text-tertiary, #666);
		opacity: 0.6;
	}

	.empty-description {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary, #888);
		max-width: 400px;
		line-height: 1.5;
	}

	.empty-actions-stacked {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.5rem;
	}

	.empty-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
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
	}
	.text-link:hover {
		color: var(--color-text-secondary, #aaa);
	}
	.text-link:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sign-in-prompt {
		font-size: 0.85rem;
		color: var(--color-text-tertiary, #666);
		font-style: italic;
	}

	/* ── Primary shell ────────────────────────────────────────── */
	.graph-shell {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 400px;
		height: calc(100dvh - 160px);
	}

	.graph-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.6rem 0.9rem;
		border-bottom: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.graph-topbar-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.inline-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.9rem;
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

	.regenerate-confirm {
		padding: 0.75rem 0.9rem;
		background: color-mix(in srgb, var(--color-warning, #eab308) 8%, transparent);
		border-bottom: 1px solid
			color-mix(in srgb, var(--color-warning, #eab308) 25%, transparent);
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
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.graph-surface {
		flex: 1 1 0%;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.graph-surface.surface-map {
		overflow: hidden;
	}

	.graph-footer {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.6rem 0.9rem;
		background: var(--color-surface-elevated, #0f0f0f);
		border-top: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.graph-footer-main {
		display: flex;
		align-items: center;
	}

	.graph-footer-coach {
		display: flex;
	}

	.graph-footer-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.6rem;
	}

	.footer-hint {
		font-size: 0.78rem;
		color: var(--color-text-tertiary, #777);
		font-style: italic;
	}

	/* ── Synthesize draft modal ───────────────────────────────── */
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
	.draft-copy-btn,
	.draft-close-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		color: var(--color-text-secondary, #666);
	}
	.draft-copy-btn {
		font-size: 1.125rem;
	}
	.draft-close-btn {
		font-size: 1.25rem;
	}
	.draft-copy-btn:hover,
	.draft-close-btn:hover {
		background: var(--color-surface-hover, #f0f0f0);
	}

	.draft-outline {
		margin-bottom: 1rem;
	}
	.draft-outline h4,
	.draft-suggestions h4 {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
		color: var(--color-text-secondary, #666);
	}
	.draft-outline ol,
	.draft-suggestions ul {
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
	.draft-suggestions li {
		margin-bottom: 0.25rem;
	}

	@media (max-width: 768px) {
		.graph-shell {
			height: calc(100dvh - 140px);
		}
		.graph-topbar {
			padding: 0.5rem 0.75rem;
		}
		.draft-modal-backdrop {
			padding: 0.5rem;
		}
		.draft-modal {
			max-height: 90vh;
		}
		.regenerate-confirm-content {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
