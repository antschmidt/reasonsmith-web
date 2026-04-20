<script lang="ts">
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType
	} from '$lib/types/argument';
	import {
		buildArgumentTree,
		getAvailableAddActions
	} from '$lib/utils/argumentUtils';
	import ArgumentBuilderNode from './ArgumentBuilderNode.svelte';
	import AddNodeInline from './AddNodeInline.svelte';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import { Plus } from '@lucide/svelte';

	export type NodeOrigin = 'author' | 'mine' | 'other';
	export type GraphMode = 'author-edit' | 'author-view' | 'commenter' | 'viewer';

	interface Props {
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		argumentId: string;
		selectedNodeId: string | null;
		onSelect: (nodeId: string) => void;
		onEdit: (
			nodeId: string,
			updates: { content?: string; type?: ArgumentNodeType }
		) => Promise<void> | void;
		onDelete: (nodeId: string) => void;
		onNodeAdded: (event: { node: ArgumentNode; edges: ArgumentEdge[] }) => void;
		canEditNode: (node: ArgumentNode) => boolean;
		getOwnerName?: (node: ArgumentNode) => string | undefined;
		/** Classifies each node as 'author' (original post), 'mine' (draft), or 'other'. */
		getNodeOrigin?: (node: ArgumentNode) => NodeOrigin;
		/** Current viewer's role — affects whether 'mine' nodes are badged as "draft". */
		graphMode?: GraphMode;
		isSharedGraph?: boolean;
		canAdd?: boolean;
	}

	let {
		nodes,
		edges,
		argumentId,
		selectedNodeId,
		onSelect,
		onEdit,
		onDelete,
		onNodeAdded,
		canEditNode,
		getOwnerName,
		getNodeOrigin,
		graphMode,
		isSharedGraph = false,
		canAdd = true
	}: Props = $props();

	const tree = $derived(buildArgumentTree(nodes, edges));
	const rootNode = $derived(
		nodes.find((n) => n.is_root) ?? (nodes.length > 0 ? nodes[0] : null)
	);
	const available = $derived(getAvailableAddActions(nodes));

	// Top-level "+ Add" row at the bottom: add a node connected to the root.
	let globalAddType = $state<ArgumentNodeType | null>(null);

	function startGlobalAdd(t: ArgumentNodeType) {
		globalAddType = t;
	}

	function cancelGlobalAdd() {
		globalAddType = null;
	}

	function onGlobalAdded(event: { node: ArgumentNode; edges: ArgumentEdge[] }) {
		onNodeAdded(event);
		globalAddType = null;
	}
</script>

<div class="argument-builder">
	{#if tree}
		<ArgumentBuilderNode
			{tree}
			{nodes}
			{argumentId}
			{selectedNodeId}
			{onSelect}
			{onEdit}
			{onDelete}
			{onNodeAdded}
			{canEditNode}
			{getOwnerName}
			{getNodeOrigin}
			{graphMode}
			{isSharedGraph}
			{canAdd}
		/>
	{:else}
		<p class="builder-empty">No nodes yet. Start by adding a claim.</p>
	{/if}

	{#if canAdd && rootNode}
		<div class="builder-global-add">
			{#if globalAddType}
				<AddNodeInline
					{argumentId}
					targetNode={rootNode}
					nodeType={globalAddType}
					{nodes}
					{isSharedGraph}
					onCancel={cancelGlobalAdd}
					onNodeAdded={onGlobalAdded}
				/>
			{:else}
				<div class="builder-global-add-row">
					{#if available.canAddEvidence}
						{@const c = NODE_TYPE_CONFIGS.evidence}
						<button
							class="builder-global-btn"
							style="--add-color: {c.color}"
							onclick={() => startGlobalAdd('evidence')}
						>
							<Plus size={12} /> Add Evidence
						</button>
					{/if}
					{#if available.canAddCounter}
						{@const c = NODE_TYPE_CONFIGS.counter}
						<button
							class="builder-global-btn"
							style="--add-color: {c.color}"
							onclick={() => startGlobalAdd('counter')}
						>
							<Plus size={12} /> Add Counter
						</button>
					{/if}
					{#if available.canAddQualifier}
						{@const c = NODE_TYPE_CONFIGS.qualifier}
						<button
							class="builder-global-btn"
							style="--add-color: {c.color}"
							onclick={() => startGlobalAdd('qualifier')}
						>
							<Plus size={12} /> Add Qualifier
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.argument-builder {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 100%;
		padding: 0.75rem 1rem;
		min-height: 0;
	}

	.builder-empty {
		margin: 0;
		padding: 1rem 0;
		text-align: center;
		color: var(--color-text-tertiary, #666);
		font-size: 0.85rem;
		font-style: italic;
	}

	.builder-global-add {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px dashed var(--color-border, #333);
	}

	.builder-global-add-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.builder-global-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--add-color, var(--color-text-secondary));
		background: color-mix(in srgb, var(--add-color, #888) 8%, transparent);
		border: 1px dashed color-mix(in srgb, var(--add-color, #888) 35%, transparent);
		border-radius: 5px;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.builder-global-btn:hover {
		background: color-mix(in srgb, var(--add-color, #888) 16%, transparent);
		border-style: solid;
	}

	@media (max-width: 640px) {
		.argument-builder {
			padding: 0.5rem 0.75rem;
		}
	}
</style>
