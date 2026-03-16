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
		ADD_WARRANT_NODE
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
	import { Plus, List, Network } from '@lucide/svelte';

	interface Props {
		discussionId: string;
		discussionTitle: string;
		userId: string | null;
	}

	let { discussionId, discussionTitle, userId }: Props = $props();

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

	// UI state
	let showAddNode = $state(false);
	let addNodeDefaultType = $state<ArgumentNodeType | null>(null);
	let selectedNodeId = $state<string | null>(null);
	let filterType = $state<ArgumentNodeType | 'all'>('all');
	let showGraph = $state(true);
	let coachDismissed = $state(false);
	let mobileView = $state<'list' | 'graph'>('list');
	let creatingGraph = $state(false);
	let dismissedFlags = $state<Set<string>>(new Set());

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
		if (!userId) return;
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

	function isOwnNode(node: ArgumentNode): boolean {
		return node.owner_id === userId || node.owner_id === null;
	}

	function getNodeOwnerName(node: ArgumentNode): string | undefined {
		if (!isSharedGraph || isOwnNode(node)) return undefined;
		return 'Other';
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
</script>

{#if loading}
	<div class="graph-loading">
		<div class="spinner"></div>
		<p>Loading argument graph...</p>
	</div>
{:else if error && !argumentData}
	<div class="graph-error">
		<p class="error-message">{error}</p>
		<button class="retry-btn" onclick={loadGraph}>Retry</button>
	</div>
{:else if !argumentData}
	<!-- No graph exists yet -->
	<div class="graph-empty">
		<div class="empty-icon">
			<Network size={48} />
		</div>
		<h3>No Argument Graph Yet</h3>
		<p class="empty-description">
			Create an argument graph to map out the claims, evidence, and reasoning in this discussion.
		</p>
		{#if userId}
			<Button onclick={createGraph} disabled={creatingGraph}>
				{creatingGraph ? 'Creating...' : 'Create Argument Graph'}
			</Button>
		{:else}
			<p class="sign-in-prompt">Sign in to create an argument graph.</p>
		{/if}
	</div>
{:else}
	<!-- Graph builder UI -->
	<div class="graph-builder">
		<!-- Status bar -->
		<div class="graph-status">
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

		<!-- Mobile view toggle -->
		<div class="mobile-tabs">
			<button
				class="mobile-tab"
				class:active={mobileView === 'list'}
				onclick={() => (mobileView = 'list')}
			>
				<List size={16} />
				Nodes
			</button>
			<button
				class="mobile-tab"
				class:active={mobileView === 'graph'}
				onclick={() => (mobileView = 'graph')}
			>
				<Network size={16} />
				Graph
			</button>
		</div>

		<div class="graph-panels" class:graph-hidden={!showGraph}>
			<!-- Left panel: Node list -->
			<div
				class="node-list-panel discussion-graph-node-list"
				class:mobile-hidden={mobileView !== 'list'}
			>
				<div class="panel-header">
					<TypeFilterTabs
						{typesPresent}
						{nodeTypeCounts}
						activeFilter={filterType}
						onFilterChange={(type) => (filterType = type)}
					/>
					<Button variant="primary" size="sm" onclick={() => openAddNode()}>
						{#snippet icon()}
							<Plus size={16} />
						{/snippet}
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
								isReadOnly={nodeIsReadOnly}
								ownerName={getNodeOwnerName(node)}
							/>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Right panel: Graph visualization -->
			{#if showGraph}
				<div class="graph-viz-panel" class:mobile-hidden={mobileView !== 'graph'}>
					<ArgumentGraph {nodes} {edges} {selectedNodeId} onNodeSelect={selectNode} />
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
{/if}

<style>
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

	.sign-in-prompt {
		margin: 0;
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

	.structural-flags {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.flag-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.6rem;
		border-radius: var(--border-radius-md, 8px);
		font-size: 0.8rem;
	}

	.flag-warning {
		background: rgba(234, 179, 8, 0.1);
		color: #eab308;
	}

	.flag-error {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	.flag-icon {
		flex-shrink: 0;
		font-size: 0.85rem;
	}

	.flag-message {
		flex: 1;
		min-width: 0;
	}

	.flag-dismiss {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		padding: 0 0.25rem;
		font-size: 1rem;
		opacity: 0.6;
		flex-shrink: 0;
	}

	.flag-dismiss:hover {
		opacity: 1;
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

	/* Mobile tabs */
	.mobile-tabs {
		display: none;
		border-bottom: 1px solid var(--color-border, #333);
	}

	.mobile-tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 0.6rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-secondary, #888);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.mobile-tab.active {
		color: var(--color-primary, #6366f1);
		border-bottom-color: var(--color-primary, #6366f1);
	}

	/* Panels layout */
	.graph-panels {
		display: flex;
		flex-direction: row;
		min-height: 400px;
	}

	.node-list-panel {
		flex: 1;
		min-width: 300px;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border, #333);
	}

	.graph-hidden .node-list-panel {
		border-right: none;
	}

	.graph-viz-panel {
		flex: 1.5;
		min-height: 400px;
		display: flex;
		flex-direction: column;
	}

	/* Panel header */
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--color-border, #333);
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	/* Node list */
	.node-list {
		flex: 1;
		overflow-y: auto;
		max-height: 600px;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
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
		.mobile-tabs {
			display: flex;
		}

		.graph-panels {
			flex-direction: column;
		}

		.node-list-panel {
			min-width: 0;
			border-right: none;
		}

		.mobile-hidden {
			display: none !important;
		}

		.graph-status {
			padding: 0.5rem 0.75rem;
		}

		.panel-header {
			padding: 0.4rem 0.5rem;
		}

		.node-list {
			max-height: 500px;
		}
	}

	@media (min-width: 769px) and (max-width: 1024px) {
		.node-list-panel {
			min-width: 280px;
			max-width: 400px;
		}
	}

	@media (min-width: 1400px) {
		.node-list-panel {
			max-width: 500px;
		}
	}
</style>
