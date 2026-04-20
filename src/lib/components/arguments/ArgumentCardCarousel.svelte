<script lang="ts">
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType
	} from '$lib/types/argument';
	import ArgumentCard from './ArgumentCard.svelte';
	import ArgumentBuilder from './ArgumentBuilder.svelte';
	import { ChevronLeft, ChevronRight, List, Square } from '@lucide/svelte';

	type NodeOrigin = 'author' | 'mine' | 'other';
	type GraphMode = 'author-edit' | 'author-view' | 'commenter' | 'viewer';

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
		getNodeOrigin?: (node: ArgumentNode) => NodeOrigin;
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

	// Adaptive: below 10 nodes → carousel; 10+ → fall back to outline.
	const AUTO_OUTLINE_THRESHOLD = 10;
	let displayMode = $state<'card' | 'outline' | 'auto'>('auto');

	const effectiveMode = $derived.by<'card' | 'outline'>(() => {
		if (displayMode === 'card') return 'card';
		if (displayMode === 'outline') return 'outline';
		return nodes.length >= AUTO_OUTLINE_THRESHOLD ? 'outline' : 'card';
	});

	// The "current" card in carousel mode = selectedNodeId, falling back to root.
	const currentNode = $derived.by(() => {
		if (selectedNodeId) {
			const n = nodes.find((x) => x.id === selectedNodeId);
			if (n) return n;
		}
		const root = nodes.find((n) => n.is_root);
		return root ?? nodes[0] ?? null;
	});

	// Connections for the current card
	const currentConnections = $derived.by(() => {
		if (!currentNode) return [];
		const result: Array<{
			node: ArgumentNode;
			edgeType: string;
			direction: 'incoming' | 'outgoing';
		}> = [];
		for (const edge of edges) {
			if (edge.from_node === currentNode.id) {
				const target = nodes.find((n) => n.id === edge.to_node);
				if (target) result.push({ node: target, edgeType: edge.type, direction: 'outgoing' });
			}
			if (edge.to_node === currentNode.id) {
				const source = nodes.find((n) => n.id === edge.from_node);
				if (source) result.push({ node: source, edgeType: edge.type, direction: 'incoming' });
			}
		}
		return result;
	});

	// Siblings for swipe navigation: nodes at the same "level" — i.e. connected
	// to any of the current node's connection targets. Simplified: use all nodes
	// that share at least one edge endpoint with the current node.
	const siblings = $derived.by(() => {
		if (!currentNode) return [];
		const neighbours = new Set<string>();
		for (const edge of edges) {
			if (edge.from_node === currentNode.id) neighbours.add(edge.to_node);
			if (edge.to_node === currentNode.id) neighbours.add(edge.from_node);
		}
		// A "sibling" shares any neighbour with the current node, other than itself.
		const siblingSet = new Set<string>();
		for (const n of nodes) {
			if (n.id === currentNode.id) continue;
			for (const edge of edges) {
				if (
					(edge.from_node === n.id && neighbours.has(edge.to_node)) ||
					(edge.to_node === n.id && neighbours.has(edge.from_node))
				) {
					siblingSet.add(n.id);
					break;
				}
			}
		}
		const arr = [...siblingSet].map((id) => nodes.find((n) => n.id === id)!).filter(Boolean);
		return arr;
	});

	const currentIndex = $derived.by(() => {
		if (!currentNode) return 0;
		const all = [currentNode, ...siblings];
		return all.findIndex((n) => n.id === currentNode.id);
	});

	function navigatePrev() {
		if (siblings.length === 0) return;
		const all = [currentNode!, ...siblings];
		const prev = all[(currentIndex - 1 + all.length) % all.length];
		onSelect(prev.id);
	}

	function navigateNext() {
		if (siblings.length === 0) return;
		const all = [currentNode!, ...siblings];
		const next = all[(currentIndex + 1) % all.length];
		onSelect(next.id);
	}

	function navigateTo(nodeId: string) {
		onSelect(nodeId);
	}

	// Swipe detection
	let touchStartX = 0;
	let touchStartY = 0;
	function onTouchStart(e: TouchEvent) {
		touchStartX = e.changedTouches[0].clientX;
		touchStartY = e.changedTouches[0].clientY;
	}
	function onTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		// Only count as swipe if horizontal movement dominates vertical
		if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
		if (dx < 0) navigateNext();
		else navigatePrev();
	}
</script>

<div class="card-carousel">
	{#if effectiveMode === 'card' && currentNode}
		<header class="carousel-head">
			<button
				class="nav-btn"
				onclick={navigatePrev}
				disabled={siblings.length === 0}
				aria-label="Previous node"
			>
				<ChevronLeft size={18} />
			</button>
			<div class="carousel-position">
				<span class="pos-index">{currentIndex + 1}</span>
				<span class="pos-sep">of</span>
				<span class="pos-total">{nodes.length}</span>
			</div>
			<button
				class="nav-btn"
				onclick={navigateNext}
				disabled={siblings.length === 0}
				aria-label="Next node"
			>
				<ChevronRight size={18} />
			</button>
			<button
				class="mode-btn"
				onclick={() => (displayMode = displayMode === 'outline' ? 'card' : 'outline')}
				aria-label="Switch to outline view"
				title="Switch to outline view"
			>
				<List size={14} />
			</button>
		</header>

		<div
			class="carousel-card"
			ontouchstart={onTouchStart}
			ontouchend={onTouchEnd}
		>
			<ArgumentCard
				node={currentNode}
				connections={currentConnections}
				{nodes}
				{argumentId}
				{onEdit}
				{onDelete}
				onNavigate={navigateTo}
				{onNodeAdded}
				{canEditNode}
				{getOwnerName}
				{getNodeOrigin}
				{graphMode}
				{isSharedGraph}
				{canAdd}
			/>
		</div>
	{:else if effectiveMode === 'outline'}
		<header class="carousel-head">
			<span class="outline-label">Outline view ({nodes.length} nodes)</span>
			<button
				class="mode-btn"
				onclick={() => (displayMode = 'card')}
				aria-label="Switch to card view"
				title="Switch to card view"
			>
				<Square size={14} />
			</button>
		</header>

		<div class="carousel-outline">
			<ArgumentBuilder
				{nodes}
				{edges}
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
		</div>
	{:else}
		<p class="empty">No nodes yet.</p>
	{/if}
</div>

<style>
	.card-carousel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		height: 100%;
		overflow-y: auto;
	}

	.carousel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		background: var(--color-surface-elevated, #141414);
		border: 1px solid var(--color-border, #2a2a2a);
		border-radius: 6px;
	}

	.nav-btn,
	.mode-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		color: var(--color-text-secondary, #aaa);
		cursor: pointer;
	}

	.nav-btn:hover:not(:disabled),
	.mode-btn:hover {
		background: var(--color-surface-hover, #1e1e1e);
	}

	.nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.carousel-position {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		font-size: 0.82rem;
		color: var(--color-text-secondary, #aaa);
	}

	.pos-index {
		font-weight: 700;
		color: var(--color-text-primary, #e0e0e0);
	}

	.pos-sep,
	.pos-total {
		color: var(--color-text-tertiary, #666);
	}

	.outline-label {
		flex: 1;
		font-size: 0.82rem;
		color: var(--color-text-secondary, #aaa);
	}

	.carousel-card {
		flex: 1;
		padding: 0.5rem;
		touch-action: pan-y;
	}

	.carousel-outline {
		flex: 1;
	}

	.empty {
		margin: 0;
		padding: 2rem 1rem;
		text-align: center;
		color: var(--color-text-tertiary, #666);
		font-style: italic;
	}
</style>
