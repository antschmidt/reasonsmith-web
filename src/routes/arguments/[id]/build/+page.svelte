<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import {
		GET_ARGUMENT,
		DELETE_NODE,
		DELETE_EDGE,
		UPDATE_NODE,
		UPDATE_EDGE
	} from '$lib/graphql/queries';
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		ArgumentEdgeType,
		CoachPrompt,
		CompletenessScore,
		StructuralFlag
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
	import {
		analyzeNodeImmediate,
		buildContextForNode,
		cancelAIAnalysis,
		type AIAnalysisState
	} from '$lib/utils/aiRhetoricalAnalysis';
	import ArgumentHeader from '$lib/components/arguments/ArgumentHeader.svelte';
	import CompletenessBar from '$lib/components/arguments/CompletenessBar.svelte';
	import CoachBanner from '$lib/components/arguments/CoachBanner.svelte';
	import TypeFilterTabs from '$lib/components/arguments/TypeFilterTabs.svelte';
	import NodeCard from '$lib/components/arguments/NodeCard.svelte';
	import AddNodeSheet from '$lib/components/arguments/AddNodeSheet.svelte';
	import AddEdgeSheet from '$lib/components/arguments/AddEdgeSheet.svelte';
	import ArgumentGraph from '$lib/components/arguments/ArgumentGraph.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		Plus,
		PanelRightOpen,
		PanelRightClose,
		List,
		Network,
		ArrowLeft,
		FileText
	} from '@lucide/svelte';

	const argumentId = $derived($page.params.id);

	let user = $state(nhost.auth.getUser());
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

	// Multi-user shared graph state
	const currentUserId = $derived(user?.id ?? null);
	const isSharedGraph = $derived(argumentData?.discussion_id != null);
	let nodes = $state<ArgumentNode[]>([]);
	let edges = $state<ArgumentEdge[]>([]);

	// UI state
	let showAddNode = $state(false);
	let addNodeDefaultType = $state<ArgumentNodeType | null>(null);
	let showAddEdge = $state(false);
	let addEdgeDefaultFromId = $state<string | null>(null);
	let selectedNodeId = $state<string | null>(null);
	let filterType = $state<ArgumentNodeType | 'all'>('all');
	let showGraph = $state(true);
	let nodeListCollapsed = $state(true);
	let coachDismissed = $state(false);

	// Synthesize draft state
	let synthesizing = $state(false);
	let synthesizeError = $state<string | null>(null);
	let synthesizedDraft = $state<string | null>(null);
	let synthesizedOutline = $state<string[]>([]);
	let synthesizedSuggestions = $state<string[]>([]);
	let showDraftModal = $state(false);

	// AI analysis state per node
	let aiAnalysisStates = $state<Map<string, AIAnalysisState>>(new Map());

	function triggerAIAnalysis(nodeId: string, content: string, nodeType: ArgumentNodeType) {
		// Set pending state immediately
		aiAnalysisStates = new Map(aiAnalysisStates).set(nodeId, {
			status: 'pending',
			result: null,
			error: null
		});

		// Build context from connected nodes
		const context = buildContextForNode(nodeId, nodes, edges);

		// Fire the analysis (no debounce — content is final)
		analyzeNodeImmediate(nodeId, content, nodeType, context).then((result) => {
			if (result) {
				aiAnalysisStates = new Map(aiAnalysisStates).set(nodeId, {
					status: 'done',
					result,
					error: null
				});

				// Persist to node metadata so we don't re-run on next page load
				persistAIAnalysisToMetadata(nodeId, result);
			} else {
				aiAnalysisStates = new Map(aiAnalysisStates).set(nodeId, {
					status: 'idle',
					result: null,
					error: null
				});
			}
		});
	}

	/**
	 * Save AI analysis result into the node's metadata.ai_analysis field
	 * so it persists across page loads without re-calling the API.
	 */
	async function persistAIAnalysisToMetadata(
		nodeId: string,
		result: import('$lib/utils/aiRhetoricalAnalysis').AIAnalysisResult
	) {
		try {
			const node = nodes.find((n) => n.id === nodeId);
			if (!node) return;

			const existingMetadata =
				node.metadata && typeof node.metadata === 'object' ? node.metadata : {};

			const updatedMetadata = {
				...existingMetadata,
				ai_analysis: {
					...result,
					contentHash: hashContent(node.content)
				}
			};

			await nhost.graphql.request(UPDATE_NODE, {
				id: nodeId,
				metadata: updatedMetadata
			});

			// Update local state metadata too
			nodes = nodes.map((n) => {
				if (n.id !== nodeId) return n;
				return { ...n, metadata: updatedMetadata };
			});
		} catch {
			// Non-critical — analysis is still shown from in-memory state
		}
	}

	/**
	 * Simple content hash to detect if node content changed since last analysis.
	 * Uses a basic DJB2 hash for speed — not cryptographic, just cache-busting.
	 */
	function hashContent(content: string): string {
		let hash = 5381;
		for (let i = 0; i < content.length; i++) {
			hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
		}
		return hash.toString(36);
	}

	/**
	 * Try to load AI analysis from the node's persisted metadata.
	 * Returns the cached result if the content hasn't changed, otherwise null.
	 */
	function loadCachedAnalysis(
		node: ArgumentNode
	): import('$lib/utils/aiRhetoricalAnalysis').AIAnalysisResult | null {
		const meta = node.metadata as Record<string, unknown> | null;
		if (!meta || typeof meta !== 'object') return null;

		const cached = meta.ai_analysis as
			| (import('$lib/utils/aiRhetoricalAnalysis').AIAnalysisResult & { contentHash?: string })
			| undefined;
		if (!cached || !cached.analyzedAt || !cached.alerts) return null;

		// Check if content has changed since the analysis was cached
		if (cached.contentHash && cached.contentHash !== hashContent(node.content)) {
			return null; // Content changed — need fresh analysis
		}

		return {
			alerts: cached.alerts,
			overallQuality: cached.overallQuality,
			suggestion: cached.suggestion,
			analyzedAt: cached.analyzedAt,
			model: cached.model
		};
	}

	function triggerAIAnalysisForAllNodes() {
		for (const node of nodes) {
			if (node.content && node.content.trim().length >= 10) {
				// First check if we have a valid cached result in metadata
				const cached = loadCachedAnalysis(node);
				if (cached) {
					aiAnalysisStates = new Map(aiAnalysisStates).set(node.id, {
						status: 'done',
						result: cached,
						error: null
					});
				} else {
					triggerAIAnalysis(node.id, node.content, node.type);
				}
			}
		}
	}

	// Mobile tab state
	let mobileTab = $state<'list' | 'graph'>('list');

	// Computed values
	let completeness = $derived(computeCompletenessScore(nodes));
	let structuralFlags = $derived(computeStructuralFlags(nodes, edges));
	let coachPrompt = $derived(getCoachPrompt(nodes, edges, completeness, structuralFlags));
	let nodeTypeCounts = $derived(countNodesByType(nodes));
	let typesPresent = $derived(getNodeTypesPresent(nodes));
	let dismissedFlags = $state<Set<string>>(new Set());

	let filteredNodes = $derived(
		filterType === 'all' ? nodes : nodes.filter((n) => n.type === filterType)
	);

	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
	});

	onMount(() => {
		if (!user) {
			goto(`/login?redirectTo=/arguments/${argumentId}/build`);
			return;
		}
		loadArgument();
	});

	onDestroy(() => {
		// Cancel any in-flight AI analysis requests on unmount
		for (const nodeId of aiAnalysisStates.keys()) {
			cancelAIAnalysis(nodeId);
		}
	});

	async function loadArgument() {
		loading = true;
		error = null;

		try {
			const result = await nhost.graphql.request(GET_ARGUMENT, { id: argumentId });

			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				throw new Error(msg || 'Failed to load argument');
			}

			const arg = result.data?.argument_by_pk;
			if (!arg) {
				throw new Error('Argument not found');
			}

			// For standalone arguments, only the owner can access
			// For discussion-linked arguments, any authenticated user can view/contribute
			if (arg.user_id !== user?.id && !arg.discussion_id) {
				throw new Error('You do not have permission to edit this argument');
			}

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

			// Trigger AI analysis for all loaded nodes
			triggerAIAnalysisForAllNodes();
		} catch (err: any) {
			error = err.message || 'Failed to load argument';
		} finally {
			loading = false;
		}
	}

	function openAddNode(defaultType?: ArgumentNodeType) {
		addNodeDefaultType = defaultType || null;
		showAddNode = true;
	}

	function closeAddNode() {
		showAddNode = false;
		addNodeDefaultType = null;
	}

	function openAddEdge(fromNodeId?: string) {
		addEdgeDefaultFromId = fromNodeId || null;
		showAddEdge = true;
	}

	function closeAddEdge() {
		showAddEdge = false;
		addEdgeDefaultFromId = null;
	}

	function handleEdgeAdded(edge: ArgumentEdge) {
		edges = [...edges, edge];
		showAddEdge = false;
		addEdgeDefaultFromId = null;
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

	function handleNodeAdded(event: { node: ArgumentNode; edges: ArgumentEdge[] }) {
		nodes = [...nodes, event.node];
		edges = [...edges, ...event.edges];
		closeAddNode();
		coachDismissed = false;

		// Trigger AI analysis for the new node
		if (event.node.content && event.node.content.trim().length >= 10) {
			triggerAIAnalysis(event.node.id, event.node.content, event.node.type);
		}
	}

	function selectNode(nodeId: string) {
		selectedNodeId = selectedNodeId === nodeId ? null : nodeId;

		if (selectedNodeId) {
			tick().then(() => {
				const el = document.querySelector(`.node-list [data-node-id="${selectedNodeId}"]`);
				if (el) {
					el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			});
		}
	}

	function isOwnNode(node: ArgumentNode): boolean {
		return node.owner_id === currentUserId || node.owner_id === null;
	}

	function getNodeOwnerName(node: ArgumentNode): string | undefined {
		if (!isSharedGraph || isOwnNode(node)) return undefined;
		// In a shared graph, show a short label for other users' nodes
		return 'Other';
	}

	async function handleDeleteNode(nodeId: string) {
		const nodeToDelete = nodes.find((n) => n.id === nodeId);
		if (!nodeToDelete) return;

		if (nodeToDelete.is_root) {
			error = 'Cannot delete the root claim';
			return;
		}

		// Can only delete your own nodes
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

	async function handleNodePositionChange(nodeId: string, x: number, y: number) {
		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;
		const metadata = { ...(node.metadata || {}), position: { x, y } };
		try {
			await nhost.graphql.request(UPDATE_NODE, {
				id: nodeId,
				content: node.content,
				type: node.type,
				implied: node.implied,
				score: node.score,
				metadata
			});
			// Update local state so subsequent edits include the position
			nodes = nodes.map((n) => (n.id === nodeId ? { ...n, metadata } : n));
		} catch {
			// Position save is best-effort — don't show error to user
		}
	}

	async function handleEditNode(
		nodeId: string,
		updates: { content?: string; type?: ArgumentNodeType }
	) {
		// Can only edit your own nodes
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
			const updatedContent = updates.content ?? nodes.find((n) => n.id === nodeId)?.content ?? '';
			const updatedType = updates.type ?? nodes.find((n) => n.id === nodeId)?.type ?? 'claim';

			nodes = nodes.map((n) => {
				if (n.id !== nodeId) return n;
				return {
					...n,
					...(updates.content !== undefined ? { content: updates.content } : {}),
					...(updates.type !== undefined ? { type: updates.type } : {})
				};
			});

			// Re-trigger AI analysis after edit
			if (updatedContent.trim().length >= 10) {
				triggerAIAnalysis(nodeId, updatedContent, updatedType);
			}
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
		openAddNode(type);
	}

	function dismissCoach() {
		coachDismissed = true;
	}

	function dismissFlag(flagKey: string) {
		dismissedFlags = new Set([...dismissedFlags, flagKey]);
	}

	function getFlagKey(flag: StructuralFlag): string {
		return `${flag.type}-${flag.nodeId || ''}-${flag.edgeId || ''}`;
	}

	let visibleFlags = $derived(structuralFlags.filter((f) => !dismissedFlags.has(getFlagKey(f))));

	async function synthesizeDraft() {
		if (synthesizing || nodes.length === 0) return;

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
				title: argumentData?.title || 'Untitled Argument'
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
</script>

<svelte:head>
	<title>{argumentData?.title || 'Argument Builder'} | ReasonSmith</title>
</svelte:head>

{#if loading}
	<div class="loading-state">
		<div class="spinner"></div>
		<p>Loading argument...</p>
	</div>
{:else if error && !argumentData}
	<div class="error-state">
		<p class="error-message">{error}</p>
		<Button variant="secondary" onclick={() => goto('/arguments')}>
			{#snippet icon()}<ArrowLeft size={16} />{/snippet}
			Back to Arguments
		</Button>
	</div>
{:else if argumentData}
	<div class="builder-container">
		<!-- Top Bar -->
		<div class="builder-top-bar">
			<a href="/arguments" class="back-link">
				<ArrowLeft size={18} />
				<span class="back-text">Arguments</span>
			</a>

			<ArgumentHeader
				title={argumentData.title}
				nodeCount={nodes.length}
				updatedAt={argumentData.updated_at}
			/>

			<div class="top-bar-actions">
				<a href="/arguments/{argumentId}/analyze" class="analyze-link" title="AI extraction">
					<FileText size={18} />
					<span class="analyze-text">AI Extract</span>
				</a>
				<button
					class="toggle-graph-btn desktop-only"
					onclick={() => (showGraph = !showGraph)}
					title={showGraph ? 'Hide graph' : 'Show graph'}
				>
					{#if showGraph}
						<PanelRightClose size={20} />
					{:else}
						<PanelRightOpen size={20} />
					{/if}
				</button>
			</div>
		</div>

		<!-- Coach Banner + Completeness -->
		<div class="builder-status">
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

		<!-- Mobile Tab Switcher -->
		<div class="mobile-tabs">
			<button
				class="mobile-tab"
				class:active={mobileTab === 'list'}
				onclick={() => (mobileTab = 'list')}
			>
				<List size={16} />
				Nodes
			</button>
			<button
				class="mobile-tab"
				class:active={mobileTab === 'graph'}
				onclick={() => (mobileTab = 'graph')}
			>
				<Network size={16} />
				Graph
			</button>
		</div>

		<!-- Two-Panel Layout -->
		<div
			class="builder-panels"
			class:graph-hidden={!showGraph}
			class:node-list-collapsed={nodeListCollapsed}
		>
			<!-- Left Panel: Node List -->
			{#if !nodeListCollapsed}
				<div class="panel-left" class:mobile-hidden={mobileTab !== 'list'}>
					<div class="panel-header">
						<div class="panel-header-tabs">
							<TypeFilterTabs
								{typesPresent}
								{nodeTypeCounts}
								activeFilter={filterType}
								onFilterChange={(type) => (filterType = type)}
							/>
						</div>
						<div class="panel-header-actions">
							{#if nodes.length >= 2}
								<Button
									variant="ghost"
									size="sm"
									onclick={synthesizeDraft}
									disabled={synthesizing}
									title="Synthesize a written draft from your argument graph"
								>
									{#snippet icon()}<FileText size={14} />{/snippet}
									{synthesizing ? 'Writing…' : 'Draft'}
								</Button>
							{/if}
							<Button variant="primary" size="sm" onclick={() => openAddNode()}>
								{#snippet icon()}<Plus size={16} />{/snippet}
								Add Node
							</Button>
						</div>
					</div>

					<div class="node-list">
						{#if filteredNodes.length === 0}
							<p class="no-nodes">
								{filterType === 'all'
									? 'No nodes yet. Start by adding evidence for your claim.'
									: `No ${filterType} nodes yet.`}
							</p>
						{:else}
							{#each filteredNodes as node (node.id)}
								{@const nodeIsReadOnly = isSharedGraph && !isOwnNode(node)}
								<NodeCard
									{node}
									{nodes}
									{edges}
									isSelected={selectedNodeId === node.id}
									connectionCount={getConnectionCount(node.id, edges)}
									onSelect={() => selectNode(node.id)}
									onDelete={nodeIsReadOnly ? () => {} : () => handleDeleteNode(node.id)}
									onEdit={nodeIsReadOnly ? undefined : handleEditNode}
									onEditEdge={nodeIsReadOnly ? undefined : handleEditEdge}
									aiAnalysis={aiAnalysisStates.get(node.id)}
									isReadOnly={nodeIsReadOnly}
									ownerName={getNodeOwnerName(node)}
								/>
							{/each}
						{/if}
					</div>
				</div>
			{/if}

			<!-- Right Panel: Graph Visualization -->
			{#if showGraph}
				<div class="panel-right" class:mobile-hidden={mobileTab !== 'graph'}>
					<ArgumentGraph
						{nodes}
						{edges}
						{selectedNodeId}
						onNodeSelect={selectNode}
						{structuralFlags}
						onNodeEdit={handleGraphNodeEdit}
						onNodeDelete={handleGraphNodeDelete}
						onAddEdge={openAddEdge}
						isReadOnly={false}
						isOwnNode={(n) => isOwnNode(n)}
						onToggleNodeList={() => (nodeListCollapsed = !nodeListCollapsed)}
						nodeListVisible={!nodeListCollapsed}
						{argumentId}
						{isSharedGraph}
						onNodeAdded={handleNodeAdded}
						onNodePositionChange={handleNodePositionChange}
					/>
				</div>
			{/if}
		</div>
	</div>

	<!-- Add Edge Sheet -->
	<AddEdgeSheet
		show={showAddEdge}
		{argumentId}
		{nodes}
		{edges}
		defaultFromNodeId={addEdgeDefaultFromId}
		defaultToNodeId={null}
		onClose={closeAddEdge}
		onEdgeAdded={handleEdgeAdded}
	/>

	<!-- Add Node Sheet -->
	<AddNodeSheet
		show={showAddNode}
		{argumentId}
		{nodes}
		{edges}
		defaultType={addNodeDefaultType}
		defaultTargetNodeId={selectedNodeId}
		onClose={closeAddNode}
		onNodeAdded={handleNodeAdded}
		{isSharedGraph}
	/>

	<!-- Synthesize Draft Modal -->
	{#if showDraftModal && synthesizedDraft}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="draft-modal-backdrop"
			onclick={closeDraftModal}
			role="dialog"
			aria-modal="true"
			aria-label="Synthesized draft"
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="draft-modal" onclick={(e) => e.stopPropagation()}>
				<header class="draft-modal-header">
					<h3>Synthesized Draft</h3>
					<div class="draft-modal-actions">
						<button class="draft-copy-btn" onclick={copyDraftToClipboard} title="Copy to clipboard">
							Copy
						</button>
						<button
							class="draft-close-btn"
							onclick={closeDraftModal}
							title="Close"
							aria-label="Close">✕</button
						>
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
			<button onclick={() => (synthesizeError = null)}>✕</button>
		</div>
	{/if}
{/if}

<style>
	/* Draft modal styles */
	.draft-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.draft-modal {
		background: var(--color-surface, #1a1a1a);
		border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		border-radius: 12px;
		max-width: 720px;
		width: 100%;
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
	}

	.draft-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		position: sticky;
		top: 0;
		background: var(--color-surface, #1a1a1a);
		z-index: 1;
	}

	.draft-modal-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-ui, sans-serif);
	}

	.draft-modal-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.draft-copy-btn {
		padding: 0.25rem 0.75rem;
		font-size: 0.75rem;
		font-family: var(--font-family-ui, sans-serif);
		background: color-mix(in srgb, var(--color-primary, #cfe0e8) 10%, transparent);
		color: var(--color-primary, #cfe0e8);
		border: 1px solid color-mix(in srgb, var(--color-primary, #cfe0e8) 20%, transparent);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.draft-copy-btn:hover {
		background: color-mix(in srgb, var(--color-primary, #cfe0e8) 20%, transparent);
	}

	.draft-close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--color-text-tertiary, #607d8b);
		font-size: 1rem;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.draft-close-btn:hover {
		color: var(--color-text-primary, #eceff1);
		background: var(--color-surface-elevated, rgba(255, 255, 255, 0.05));
	}

	.draft-outline {
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
	}

	.draft-outline h4 {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary, #607d8b);
		font-family: var(--font-family-ui, sans-serif);
	}

	.draft-outline ol {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-text-secondary, #90a4ae);
		font-family: var(--font-family-ui, sans-serif);
	}

	.draft-content {
		padding: 1.25rem;
		font-size: 0.9rem;
		line-height: 1.7;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-serif, serif);
	}

	.draft-suggestions {
		padding: 0.75rem 1.25rem 1rem;
		border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
	}

	.draft-suggestions h4 {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary, #607d8b);
		font-family: var(--font-family-ui, sans-serif);
	}

	.draft-suggestions ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-text-secondary, #90a4ae);
		font-family: var(--font-family-ui, sans-serif);
	}

	.draft-suggestions li {
		margin-bottom: 0.25rem;
	}

	/* Loading & Error States */
	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		gap: var(--space-md);
		color: var(--color-text-secondary);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-message {
		color: var(--color-error);
		font-size: 1rem;
	}

	/* Builder Container */
	.builder-container {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - 50px); /* Account for top nav */
		overflow: hidden;
	}

	/* Top Bar */
	.builder-top-bar {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-md);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
		min-height: 48px;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.875rem;
		padding: 4px 8px;
		border-radius: var(--border-radius-sm);
		transition: all var(--transition-fast) ease;
		flex-shrink: 0;
	}

	.back-link:hover {
		color: var(--color-primary);
		background: var(--color-surface-alt);
	}

	.top-bar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		margin-left: auto;
		flex-shrink: 0;
	}

	.analyze-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.8rem;
		padding: 4px 10px;
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
		transition: all var(--transition-fast) ease;
	}

	.analyze-link:hover {
		color: var(--color-primary);
		border-color: var(--color-primary);
	}

	.toggle-graph-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 4px;
		width: 32px;
		height: 32px;
		transition: all var(--transition-fast) ease;
	}

	.toggle-graph-btn:hover {
		color: var(--color-primary);
		border-color: var(--color-primary);
	}

	/* Status Bar */
	.builder-status {
		flex-shrink: 0;
		padding: var(--space-xs) var(--space-md);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	/* Inline Error */
	.inline-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-xs) var(--space-md);
		background: color-mix(in srgb, var(--color-error) 8%, transparent);
		border-bottom: 1px solid var(--color-error);
		flex-shrink: 0;
	}

	.inline-error p {
		margin: 0;
		color: var(--color-error);
		font-size: 0.85rem;
	}

	.inline-error button {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-error);
		font-size: 1.1rem;
		padding: 0 4px;
	}

	/* Mobile Tabs */
	.mobile-tabs {
		display: none;
		flex-shrink: 0;
		border-bottom: 1px solid var(--color-border);
	}

	.mobile-tab {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		padding: var(--space-sm);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-tertiary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast) ease;
		justify-content: center;
	}

	.mobile-tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	/* Panels */
	.builder-panels {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.panel-left {
		flex: 0 0 420px;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		overflow: hidden;
		min-height: 0;
	}

	.graph-hidden .panel-left {
		flex: 1;
	}

	.node-list-collapsed .panel-right {
		flex: 1;
	}

	.panel-header {
		display: flex;
		flex-direction: column;
		padding: 0;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.panel-header-tabs {
		padding: var(--space-xs) var(--space-sm);
		border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.06));
	}

	.panel-header-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
	}

	.node-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.no-nodes {
		text-align: center;
		color: var(--color-text-tertiary);
		padding: var(--space-xl) var(--space-md);
		font-size: 0.9rem;
	}

	.panel-right {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		position: relative;
	}

	/* Desktop-only elements */
	.desktop-only {
		display: inline-flex;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.builder-container {
			height: calc(100dvh - 45px);
		}

		.back-text,
		.analyze-text {
			display: none;
		}

		.desktop-only {
			display: none;
		}

		.mobile-tabs {
			display: flex;
		}

		.builder-panels {
			flex-direction: column;
		}

		.panel-left,
		.panel-right {
			flex: 1;
			border-right: none;
		}

		.panel-left {
			flex: 0 0 auto;
		}

		.mobile-hidden {
			display: none !important;
		}

		.panel-header-tabs {
			padding: var(--space-xs);
		}
		.panel-header-actions {
			padding: var(--space-xs);
		}

		.builder-status {
			padding: var(--space-xs) var(--space-sm);
		}
	}

	@media (min-width: 769px) and (max-width: 1024px) {
		.panel-left {
			flex: 0 0 340px;
		}
	}

	@media (min-width: 1400px) {
		.panel-left {
			flex: 0 0 480px;
		}
	}
</style>
