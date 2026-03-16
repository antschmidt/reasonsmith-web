<script lang="ts">
	import { onMount } from 'svelte';
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
		created_at: string;
		updated_at: string;
	} | null>(null);
	let nodes = $state<ArgumentNode[]>([]);
	let edges = $state<ArgumentEdge[]>([]);

	// UI state
	let showAddNode = $state(false);
	let addNodeDefaultType = $state<ArgumentNodeType | null>(null);
	let selectedNodeId = $state<string | null>(null);
	let filterType = $state<ArgumentNodeType | 'all'>('all');
	let showGraph = $state(true);
	let coachDismissed = $state(false);

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

			if (arg.user_id !== user?.id) {
				throw new Error('You do not have permission to edit this argument');
			}

			argumentData = {
				id: arg.id,
				user_id: arg.user_id,
				title: arg.title,
				description: arg.description ?? null,
				created_at: arg.created_at,
				updated_at: arg.updated_at
			};
			nodes = arg.argument_nodes || [];
			edges = arg.argument_edges || [];
		} catch (err: any) {
			error = err.message || 'Failed to load argument';
		} finally {
			loading = false;
		}
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

	function handleNodeAdded(event: { node: ArgumentNode; edges: ArgumentEdge[] }) {
		nodes = [...nodes, event.node];
		edges = [...edges, ...event.edges];
		closeAddNode();
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
		try {
			const result = await nhost.graphql.request(UPDATE_NODE, {
				id: nodeId,
				...(updates.content !== undefined ? { content: updates.content } : {}),
				...(updates.type !== undefined ? { type: updates.type } : {})
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

			{#if visibleFlags.length > 0}
				<div class="structural-flags">
					{#each visibleFlags as flag}
						<div class="flag-item flag-{flag.severity}">
							<span class="flag-icon">{flag.severity === 'error' ? '⚠' : '💡'}</span>
							<span class="flag-message">{flag.message}</span>
							<button
								class="flag-dismiss"
								onclick={() => dismissFlag(getFlagKey(flag))}
								title="Dismiss"
							>
								×
							</button>
						</div>
					{/each}
				</div>
			{/if}

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
		<div class="builder-panels" class:graph-hidden={!showGraph}>
			<!-- Left Panel: Node List -->
			<div class="panel-left" class:mobile-hidden={mobileTab !== 'list'}>
				<div class="panel-header">
					<TypeFilterTabs
						{typesPresent}
						{nodeTypeCounts}
						activeFilter={filterType}
						onFilterChange={(type) => (filterType = type)}
					/>
					<Button variant="primary" size="sm" onclick={() => openAddNode()}>
						{#snippet icon()}<Plus size={16} />{/snippet}
						Add Node
					</Button>
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
							<NodeCard
								{node}
								{nodes}
								{edges}
								isSelected={selectedNodeId === node.id}
								connectionCount={getConnectionCount(node.id, edges)}
								onSelect={() => selectNode(node.id)}
								onDelete={() => handleDeleteNode(node.id)}
								onEdit={handleEditNode}
								onEditEdge={handleEditEdge}
							/>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Right Panel: Graph Visualization -->
			{#if showGraph}
				<div class="panel-right" class:mobile-hidden={mobileTab !== 'graph'}>
					<ArgumentGraph {nodes} {edges} {selectedNodeId} onNodeSelect={selectNode} />
				</div>
			{/if}
		</div>
	</div>

	<!-- Add Node Sheet -->
	<AddNodeSheet
		show={showAddNode}
		{argumentId}
		{nodes}
		{edges}
		defaultType={addNodeDefaultType}
		onClose={closeAddNode}
		onNodeAdded={handleNodeAdded}
	/>
{/if}

<style>
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

	/* Structural Flags */
	.structural-flags {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: var(--space-xs);
	}

	.flag-item {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: 6px var(--space-sm);
		border-radius: var(--border-radius-sm);
		font-size: 0.8rem;
		line-height: 1.3;
	}

	.flag-warning {
		background: color-mix(in srgb, var(--color-warning) 8%, transparent);
		color: var(--color-warning);
	}

	.flag-error {
		background: color-mix(in srgb, var(--color-error) 8%, transparent);
		color: var(--color-error);
	}

	.flag-icon {
		flex-shrink: 0;
		font-size: 0.9rem;
	}

	.flag-message {
		flex: 1;
		min-width: 0;
	}

	.flag-dismiss {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		opacity: 0.6;
		font-size: 1rem;
		padding: 0 4px;
		line-height: 1;
	}

	.flag-dismiss:hover {
		opacity: 1;
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
		overflow: auto;
	}

	.graph-hidden .panel-left {
		flex: 1;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.node-list {
		flex: 1;
		min-height: fit-content;
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

		.panel-header {
			padding: var(--space-xs);
		}

		.builder-status {
			padding: var(--space-xs) var(--space-sm);
		}

		.structural-flags {
			max-height: 80px;
			overflow-y: auto;
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
