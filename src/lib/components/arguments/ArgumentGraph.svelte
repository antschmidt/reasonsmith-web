<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		StructuralFlag
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import {
		calculateNodePositions,
		computeStructuralFlags,
		getValidSourceTypesForTarget
	} from '$lib/utils/argumentUtils';
	import { analyzeNodeContent } from '$lib/utils/rhetoricalAnalysis';
	import { ZoomIn, ZoomOut, Maximize2, List, Focus, Network } from '@lucide/svelte';
	import GraphNodePopover from './GraphNodePopover.svelte';

	interface Props {
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		selectedNodeId: string | null;
		onNodeSelect: (nodeId: string) => void;
		/** Structural flags to show as badges on graph nodes */
		structuralFlags?: StructuralFlag[];
		/** Callback to edit a node (opens edit UI in parent) */
		onNodeEdit?: (
			nodeId: string,
			updates: { content?: string; type?: ArgumentNodeType }
		) => Promise<void> | void;
		/** Callback to delete a node */
		onNodeDelete?: (nodeId: string) => void;
		/** Callback to open the add-edge sheet with a from-node pre-selected */
		onAddEdge?: (fromNodeId: string) => void;
		/** Callback to add a new node connected to an existing node */
		onAddConnectedNode?: (targetNodeId: string) => void;
		/** Whether the current user can edit (false = read-only for all nodes) */
		isReadOnly?: boolean;
		/** Check if a specific node belongs to the current user (for shared graphs) */
		isOwnNode?: (node: ArgumentNode) => boolean;
		/** Callback to toggle the node list panel open */
		onToggleNodeList?: () => void;
		/** Whether the node list is currently visible */
		nodeListVisible?: boolean;
		/** Argument ID needed for add-node-from-graph */
		argumentId?: string;
		/** Whether this is a shared discussion graph (affects node publish state) */
		isSharedGraph?: boolean;
		/** Callback when a node is added from the graph add-node popover */
		onNodeAdded?: (event: { node: ArgumentNode; edges: ArgumentEdge[] }) => void;
		/** Callback to persist a node's position after drag */
		onNodePositionChange?: (nodeId: string, x: number, y: number) => void;
	}

	let {
		nodes,
		edges,
		selectedNodeId,
		onNodeSelect,
		structuralFlags = [],
		onNodeEdit,
		onNodeDelete,
		onAddEdge,
		onAddConnectedNode,
		isReadOnly = false,
		isOwnNode,
		onToggleNodeList,
		nodeListVisible = false,
		argumentId,
		isSharedGraph = false,
		onNodeAdded,
		onNodePositionChange
	}: Props = $props();

	// ── Popover state ──────────────────────────────────────────────
	let popoverNodeId = $state<string | null>(null);
	let popoverX = $state(0);
	let popoverY = $state(0);

	const popoverNode = $derived(
		popoverNodeId ? (nodes.find((n) => n.id === popoverNodeId) ?? null) : null
	);

	function openPopover(nodeId: string, screenX: number, screenY: number) {
		popoverNodeId = nodeId;
		popoverX = screenX;
		popoverY = screenY;
	}

	function closePopover() {
		popoverNodeId = null;
	}

	// ── Per-node alert badge counts ────────────────────────────────
	// Pre-compute so we can show a small indicator on each SVG node
	const nodeAlertCounts = $derived.by(() => {
		const counts = new Map<string, { errors: number; warnings: number }>();
		for (const node of nodes) {
			let errors = 0;
			let warnings = 0;
			// Structural flags for this node
			for (const f of structuralFlags) {
				if (f.nodeId === node.id) {
					if (f.severity === 'error') errors++;
					else warnings++;
				}
			}
			// Rhetorical alerts
			const rhetorical = analyzeNodeContent(node.content, node.type);
			for (const a of rhetorical) {
				if (a.severity === 'error') errors++;
				else if (a.severity === 'warning') warnings++;
			}
			if (errors > 0 || warnings > 0) {
				counts.set(node.id, { errors, warnings });
			}
		}
		return counts;
	});

	// ── Focus mode ──────────────────────────────────────────────
	// 'focus' shows only the focused node + immediate neighbors.
	// 'full' shows the entire tree (original behavior).
	let viewMode = $state<'focus' | 'full'>(nodes.length > 6 ? 'focus' : 'full');
	let focusNodeId = $state<string | null>(null);

	// Initialize focus on root node
	$effect(() => {
		if (focusNodeId === null && nodes.length > 0) {
			const root = nodes.find((n) => n.is_root);
			focusNodeId = root?.id ?? nodes[0]?.id ?? null;
		}
	});

	// Build neighbor lookup once
	const neighborMap = $derived.by(() => {
		const map = new Map<string, Set<string>>();
		for (const node of nodes) map.set(node.id, new Set());
		for (const edge of edges) {
			map.get(edge.from_node)?.add(edge.to_node);
			map.get(edge.to_node)?.add(edge.from_node);
		}
		return map;
	});

	// Visible nodes/edges in focus mode
	const visibleNodeIds = $derived.by(() => {
		if (viewMode === 'full') return new Set(nodes.map((n) => n.id));
		if (!focusNodeId) return new Set(nodes.map((n) => n.id));
		const ids = new Set<string>();
		ids.add(focusNodeId);
		const neighbors = neighborMap.get(focusNodeId);
		if (neighbors) for (const nid of neighbors) ids.add(nid);
		return ids;
	});

	const visibleNodes = $derived(nodes.filter((n) => visibleNodeIds.has(n.id)));
	const visibleEdges = $derived(
		edges.filter((e) => visibleNodeIds.has(e.from_node) && visibleNodeIds.has(e.to_node))
	);

	// Count of hidden nodes for the indicator
	const hiddenCount = $derived(nodes.length - visibleNodes.length);

	// ── Spotlight mode ─────────────────────────────────────────
	// Shows a single node large and readable with parent/child navigation badges.
	let spotlightNodeId = $state<string | null>(null);

	const spotlightNode = $derived(
		spotlightNodeId ? nodes.find((n) => n.id === spotlightNodeId) ?? null : null
	);

	// Connections pointing INTO this node
	const spotlightIncoming = $derived.by(() => {
		if (!spotlightNodeId) return [] as { node: ArgumentNode; edgeType: string }[];
		const results: { node: ArgumentNode; edgeType: string }[] = [];
		for (const e of edges) {
			if (e.to_node === spotlightNodeId) {
				const node = nodes.find((n) => n.id === e.from_node);
				if (node) results.push({ node, edgeType: e.type });
			}
		}
		return results;
	});

	// Connections pointing OUT of this node
	const spotlightOutgoing = $derived.by(() => {
		if (!spotlightNodeId) return [] as { node: ArgumentNode; edgeType: string }[];
		const results: { node: ArgumentNode; edgeType: string }[] = [];
		for (const e of edges) {
			if (e.from_node === spotlightNodeId) {
				const node = nodes.find((n) => n.id === e.to_node);
				if (node) results.push({ node, edgeType: e.type });
			}
		}
		return results;
	});

	// Spotlight editing state
	let spotlightEditing = $state(false);
	let spotlightEditContent = $state('');
	let spotlightEditSaving = $state(false);
	let spotlightEditError = $state<string | null>(null);

	function openSpotlight(nodeId: string) {
		spotlightNodeId = nodeId;
		spotlightEditing = false;
		spotlightEditError = null;
		onNodeSelect(nodeId);
		closePopover();
	}

	function closeSpotlight() {
		spotlightNodeId = null;
		spotlightEditing = false;
	}

	function startSpotlightEdit() {
		if (!spotlightNode) return;
		spotlightEditContent = spotlightNode.content;
		spotlightEditing = true;
		spotlightEditError = null;
	}

	async function saveSpotlightEdit() {
		if (!spotlightNode || !onNodeEdit) return;
		spotlightEditSaving = true;
		spotlightEditError = null;
		try {
			await onNodeEdit(spotlightNode.id, { content: spotlightEditContent });
			spotlightEditing = false;
		} catch (err: any) {
			spotlightEditError = err?.message || 'Failed to save';
		} finally {
			spotlightEditSaving = false;
		}
	}

	function cancelSpotlightEdit() {
		spotlightEditing = false;
		spotlightEditError = null;
	}

	/** Whether the current user can edit the spotlighted node */
	const canEditSpotlight = $derived.by(() => {
		if (!spotlightNode || isReadOnly || !onNodeEdit) return false;
		if (isOwnNode) return isOwnNode(spotlightNode);
		return true;
	});

	/** Whether add-node is available (for commenting / adding connected nodes) */
	const canAddFromSpotlight = $derived(!!onAddConnectedNode && !!spotlightNode);

	// Navigate focus to a new node
	function focusOn(nodeId: string) {
		focusNodeId = nodeId;
		onNodeSelect(nodeId);
		// Re-fit after the visible set changes
		setTimeout(fitToView, 50);
	}

	// Breadcrumb: path from root to focused node via BFS
	const focusBreadcrumb = $derived.by(() => {
		if (viewMode === 'full' || !focusNodeId) return [];
		const root = nodes.find((n) => n.is_root);
		if (!root || root.id === focusNodeId) return [];

		// BFS from root
		const parent = new Map<string, string>();
		const visited = new Set<string>([root.id]);
		const queue = [root.id];
		while (queue.length > 0) {
			const current = queue.shift()!;
			if (current === focusNodeId) break;
			const neighbors = neighborMap.get(current);
			if (neighbors) {
				for (const nid of neighbors) {
					if (!visited.has(nid)) {
						visited.add(nid);
						parent.set(nid, current);
						queue.push(nid);
					}
				}
			}
		}

		// Reconstruct path
		const path: Array<{ id: string; label: string }> = [];
		let cur: string | undefined = focusNodeId;
		while (cur && cur !== root.id) {
			const node = nodes.find((n) => n.id === cur);
			if (node) {
				const config = NODE_TYPE_CONFIGS[node.type];
				path.unshift({ id: node.id, label: config.label + ': ' + node.content.slice(0, 30) + (node.content.length > 30 ? '…' : '') });
			}
			cur = parent.get(cur);
		}
		// Add root at start
		if (root) {
			const config = NODE_TYPE_CONFIGS[root.type];
			path.unshift({ id: root.id, label: config.label + ': ' + root.content.slice(0, 30) + (root.content.length > 30 ? '…' : '') });
		}
		return path;
	});

	// Pan and zoom state
	let svgElement: SVGSVGElement | undefined = $state();
	let containerElement: HTMLDivElement | undefined = $state();
	let viewBox = $state({ x: -50, y: -20, w: 1000, h: 600 });
	let isPanning = $state(false);
	let panStart = $state({ x: 0, y: 0 });
	let zoom = $state(1);

	// Dragging state
	let dragNodeId = $state<string | null>(null);
	let dragOffset = $state({ x: 0, y: 0 });
	let wasDragging = $state(false);

	// Node dimensions
	const NODE_WIDTH = 280;
	const NODE_HEIGHT = 140;
	const NODE_RX = 8;

	// Compute positions reactively
	let positions = $state(new Map<string, { x: number; y: number }>());

	// Track manual positions separately so auto-layout doesn't override drags.
	// Initialize from saved positions in node metadata.
	let manualPositions = $state(new Map<string, { x: number; y: number }>());
	let restoredFromMetadata = false;

	$effect(() => {
		if (!restoredFromMetadata && nodes.length > 0) {
			restoredFromMetadata = true;
			const restored = new Map<string, { x: number; y: number }>();
			for (const node of nodes) {
				const pos = (node as any).metadata?.position;
				if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
					restored.set(node.id, { x: pos.x, y: pos.y });
				}
			}
			if (restored.size > 0) {
				manualPositions = restored;
			}
		}
	});

	$effect(() => {
		const autoPositions = calculateNodePositions(nodes, edges);
		const merged = new Map<string, { x: number; y: number }>();

		for (const [id, pos] of autoPositions) {
			if (manualPositions.has(id)) {
				merged.set(id, manualPositions.get(id)!);
			} else {
				merged.set(id, pos);
			}
		}

		// Handle nodes that have manual positions but aren't in auto (shouldn't happen, but safe)
		for (const [id, pos] of manualPositions) {
			if (!merged.has(id)) {
				merged.set(id, pos);
			}
		}

		positions = merged;
	});

	// Edge path computation
	function getEdgePath(edge: ArgumentEdge): string {
		const fromPos = positions.get(edge.from_node);
		const toPos = positions.get(edge.to_node);

		if (!fromPos || !toPos) return '';

		const fromCX = fromPos.x + NODE_WIDTH / 2;
		const fromCY = fromPos.y + NODE_HEIGHT / 2;
		const toCX = toPos.x + NODE_WIDTH / 2;
		const toCY = toPos.y + NODE_HEIGHT / 2;

		const dx = toCX - fromCX;
		const dy = toCY - fromCY;
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);

		let startX: number, startY: number, endX: number, endY: number;

		// Determine exit/entry sides based on relative position
		if (absDy > absDx) {
			// Primarily vertical — exit from top/bottom
			if (dy > 0) {
				// Target is below
				startX = fromCX;
				startY = fromPos.y + NODE_HEIGHT;
				endX = toCX;
				endY = toPos.y;
			} else {
				// Target is above
				startX = fromCX;
				startY = fromPos.y;
				endX = toCX;
				endY = toPos.y + NODE_HEIGHT;
			}
		} else {
			// Primarily horizontal — exit from left/right
			if (dx > 0) {
				startX = fromPos.x + NODE_WIDTH;
				startY = fromCY;
				endX = toPos.x;
				endY = toCY;
			} else {
				startX = fromPos.x;
				startY = fromCY;
				endX = toPos.x + NODE_WIDTH;
				endY = toCY;
			}
		}

		// Use cubic bezier for smoother curves
		const dist = Math.sqrt(dx * dx + dy * dy);
		const tension = Math.min(dist * 0.3, 80);

		if (absDy > absDx) {
			// Vertical: control points extend vertically
			const cy1 = startY + (dy > 0 ? tension : -tension);
			const cy2 = endY + (dy > 0 ? -tension : tension);
			return `M ${startX} ${startY} C ${startX} ${cy1}, ${endX} ${cy2}, ${endX} ${endY}`;
		} else {
			// Horizontal: control points extend horizontally
			const cx1 = startX + (dx > 0 ? tension : -tension);
			const cx2 = endX + (dx > 0 ? -tension : tension);
			return `M ${startX} ${startY} C ${cx1} ${startY}, ${cx2} ${endY}, ${endX} ${endY}`;
		}
	}

	// Arrow marker for edge direction
	function getEdgeColor(edgeType: string): string {
		switch (edgeType) {
			case 'supports':
				return '#4BC4E8';
			case 'contradicts':
				return '#E84B4B';
			case 'rebuts':
				return '#4BE87A';
			case 'warrants':
				return '#B44BE8';
			case 'cites':
				return '#8B8B8B';
			case 'qualifies':
				return '#78909C';
			case 'derives_from':
				return '#E8B84B';
			default:
				return '#666';
		}
	}

	function getEdgeLabel(edgeType: string): string {
		switch (edgeType) {
			case 'supports':
				return 'supports';
			case 'contradicts':
				return 'contradicts';
			case 'rebuts':
				return 'rebuts';
			case 'warrants':
				return 'warrants';
			case 'cites':
				return 'cites';
			case 'qualifies':
				return 'qualifies';
			case 'derives_from':
				return 'derives from';
			default:
				return edgeType;
		}
	}

	// Distinct dash patterns per edge type for non-color visual differentiation
	function getEdgeDash(edgeType: string): string {
		switch (edgeType) {
			case 'supports':
				return ''; // solid
			case 'contradicts':
				return '8 4'; // dashed
			case 'rebuts':
				return '8 4'; // dashed (same family as contradicts)
			case 'warrants':
				return '2 4'; // dotted
			case 'cites':
				return '4 2 1 2'; // dash-dot
			case 'qualifies':
				return '2 4'; // dotted
			case 'derives_from':
				return ''; // solid (same family as supports)
			default:
				return '';
		}
	}

	function truncate(text: string, maxLength: number = 120): string {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 1) + '…';
	}

	// Truncate text for foreignObject display (CSS handles actual wrapping)
	function getDisplayText(text: string): string {
		return truncate(text, 160);
	}

	// Estimate the height a node needs to show its full content
	function getNodeHeight(text: string, expanded: boolean): number {
		if (!expanded) return NODE_HEIGHT; // 140px default
		// At 12px serif in a (NODE_WIDTH-16)px container, roughly 35 chars per line
		const contentWidth = NODE_WIDTH - 16;
		const charsPerLine = 35;
		const lineHeight = 16.8;
		// Count explicit newlines + wrapped lines
		const paragraphs = text.split('\n');
		let totalLines = 0;
		for (const p of paragraphs) {
			totalLines += Math.max(1, Math.ceil(p.length / charsPerLine));
		}
		const textHeight = totalLines * lineHeight;
		// 30px for type label row + 16px padding
		return Math.max(NODE_HEIGHT, textHeight + 54);
	}

	// Per-node connection count for badges.
	// In focus mode: count hidden (non-visible) neighbors.
	// In full mode: count total neighbors (so user knows they can drill in).
	const childCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const node of visibleNodes) {
			const allNeighbors = neighborMap.get(node.id);
			if (!allNeighbors || allNeighbors.size === 0) continue;
			if (viewMode === 'focus') {
				// In focus mode, count hidden neighbors only, skip the focused node itself
				if (node.id === focusNodeId) continue;
				let hidden = 0;
				for (const nid of allNeighbors) {
					if (!visibleNodeIds.has(nid)) hidden++;
				}
				if (hidden > 0) counts.set(node.id, hidden);
			} else {
				// In full mode, show total connection count for all nodes
				if (allNeighbors.size > 0) counts.set(node.id, allNeighbors.size);
			}
		}
		return counts;
	});

	// Inline style for foreignObject text — Svelte scoped styles don't penetrate into
	// foreignObject HTML, so we must inline. overflow-wrap:break-word ensures long strings
	// like URLs wrap within the node rect while normal text wraps at word boundaries.
	function getNodeTextStyle(height: number, expanded: boolean): string {
		if (expanded) {
			return [
				'margin:0',
				'padding:0',
				`width:${NODE_WIDTH - 16}px`,
				'color:var(--color-text-primary,#eceff1)',
				'font-size:12px',
				'font-family:var(--font-family-serif,serif)',
				'line-height:1.4',
				'word-break:normal',
				'overflow-wrap:break-word',
				'white-space:pre-wrap',
				'overflow:visible',
				'box-sizing:border-box',
				'pointer-events:none'
			].join(';');
		}
		return [
			'margin:0',
			'padding:0',
			`width:${NODE_WIDTH - 16}px`,
			`height:${height - 38}px`,
			'color:var(--color-text-primary,#eceff1)',
			'font-size:12px',
			'font-family:var(--font-family-serif,serif)',
			'line-height:1.4',
			'word-break:normal',
			'overflow-wrap:break-word',
			'overflow:hidden',
			'display:-webkit-box',
			'-webkit-line-clamp:6',
			'-webkit-box-orient:vertical',
			'box-sizing:border-box',
			'pointer-events:none'
		].join(';');
	}

	// Pan handlers
	// Check if an event target is inside a node group (should not trigger panning)
	function isNodeTarget(target: EventTarget | null): boolean {
		let el = target as Element | null;
		while (el && el !== svgElement) {
			if (el.classList?.contains('node-group')) return true;
			el = el.parentElement;
		}
		return false;
	}

	function handleMouseDown(e: PointerEvent) {
		// Pan on any click that isn't on a node — nodes handle their own mousedown
		if (!isNodeTarget(e.target)) {
			isPanning = true;
			panStart = { x: e.clientX, y: e.clientY };
			e.preventDefault();
		}
	}

	// Touch support state
	let lastTouchDist = $state<number | null>(null);
	let lastTouchCenter = $state<{ x: number; y: number } | null>(null);
	let isTouchPanning = $state(false);

	function getTouchDistance(touches: TouchList): number {
		const dx = touches[1].clientX - touches[0].clientX;
		const dy = touches[1].clientY - touches[0].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function getTouchCenter(touches: TouchList): { x: number; y: number } {
		return {
			x: (touches[0].clientX + touches[1].clientX) / 2,
			y: (touches[0].clientY + touches[1].clientY) / 2
		};
	}

	function handleTouchStart(e: TouchEvent) {
		if (isNodeTarget(e.target)) return;

		if (e.touches.length === 1) {
			// Single touch → pan
			isTouchPanning = true;
			panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			e.preventDefault();
		} else if (e.touches.length === 2) {
			// Two-finger → pinch zoom
			isTouchPanning = false;
			lastTouchDist = getTouchDistance(e.touches);
			lastTouchCenter = getTouchCenter(e.touches);
			e.preventDefault();
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (e.touches.length === 1 && isTouchPanning) {
			const svgRect = svgElement?.getBoundingClientRect();
			if (!svgRect) return;

			const scaleX = viewBox.w / svgRect.width;
			const scaleY = viewBox.h / svgRect.height;

			const dx = (e.touches[0].clientX - panStart.x) * scaleX;
			const dy = (e.touches[0].clientY - panStart.y) * scaleY;

			viewBox = {
				...viewBox,
				x: viewBox.x - dx,
				y: viewBox.y - dy
			};

			panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			e.preventDefault();
		} else if (e.touches.length === 2 && lastTouchDist !== null) {
			const newDist = getTouchDistance(e.touches);
			const newCenter = getTouchCenter(e.touches);
			const factor = lastTouchDist / newDist;

			const svgRect = svgElement?.getBoundingClientRect();
			if (!svgRect) return;

			// Zoom center in SVG coordinates
			const cx = viewBox.x + ((newCenter.x - svgRect.left) / svgRect.width) * viewBox.w;
			const cy = viewBox.y + ((newCenter.y - svgRect.top) / svgRect.height) * viewBox.h;

			const newW = viewBox.w * factor;
			const newH = viewBox.h * factor;

			viewBox = {
				x: cx - ((cx - viewBox.x) / viewBox.w) * newW,
				y: cy - ((cy - viewBox.y) / viewBox.h) * newH,
				w: newW,
				h: newH
			};

			// Also pan with the center movement
			if (lastTouchCenter) {
				const panScaleX = viewBox.w / svgRect.width;
				const panScaleY = viewBox.h / svgRect.height;
				const pdx = (newCenter.x - lastTouchCenter.x) * panScaleX;
				const pdy = (newCenter.y - lastTouchCenter.y) * panScaleY;
				viewBox = { ...viewBox, x: viewBox.x - pdx, y: viewBox.y - pdy };
			}

			lastTouchDist = newDist;
			lastTouchCenter = newCenter;
			zoom = zoom / factor;
			e.preventDefault();
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (e.touches.length < 2) {
			lastTouchDist = null;
			lastTouchCenter = null;
		}
		if (e.touches.length === 0) {
			isTouchPanning = false;
		}
	}

	function handleMouseMove(e: PointerEvent) {
		if (dragNodeId) {
			// Node dragging
			const svgRect = svgElement?.getBoundingClientRect();
			if (!svgRect) return;

			const scaleX = viewBox.w / svgRect.width;
			const scaleY = viewBox.h / svgRect.height;

			const newX = viewBox.x + (e.clientX - svgRect.left) * scaleX - dragOffset.x;
			const newY = viewBox.y + (e.clientY - svgRect.top) * scaleY - dragOffset.y;

			const newPositions = new Map(positions);
			newPositions.set(dragNodeId, { x: newX, y: newY });
			positions = newPositions;

			// Save as manual position
			manualPositions = new Map(manualPositions).set(dragNodeId, { x: newX, y: newY });

			wasDragging = true;
			e.preventDefault();
			return;
		} else if (isPanning) {
			const svgRect = svgElement?.getBoundingClientRect();
			if (!svgRect) return;

			const scaleX = viewBox.w / svgRect.width;
			const scaleY = viewBox.h / svgRect.height;

			const dx = (e.clientX - panStart.x) * scaleX;
			const dy = (e.clientY - panStart.y) * scaleY;

			viewBox = {
				...viewBox,
				x: viewBox.x - dx,
				y: viewBox.y - dy
			};

			panStart = { x: e.clientX, y: e.clientY };
			e.preventDefault();
		}
	}

	function handleMouseUp(e: PointerEvent) {
		isPanning = false;
		// Release pointer capture and persist position if we were dragging a node
		if (dragNodeId && svgElement) {
			try {
				(svgElement as unknown as Element).releasePointerCapture(e.pointerId);
			} catch {
				// ignore — capture may already be released
			}
			// Persist the new position if it was actually dragged
			if (wasDragging && onNodePositionChange) {
				const pos = positions.get(dragNodeId);
				if (pos) {
					onNodePositionChange(dragNodeId, pos.x, pos.y);
				}
			}
		}
		dragNodeId = null;
		isTouchPanning = false;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();

		const svgRect = svgElement?.getBoundingClientRect();
		if (!svgRect) return;

		const factor = e.deltaY > 0 ? 1.1 : 0.9;

		// Mouse position relative to SVG
		const mouseX = viewBox.x + ((e.clientX - svgRect.left) / svgRect.width) * viewBox.w;
		const mouseY = viewBox.y + ((e.clientY - svgRect.top) / svgRect.height) * viewBox.h;

		const newW = viewBox.w * factor;
		const newH = viewBox.h * factor;

		// Zoom toward mouse position
		viewBox = {
			x: mouseX - ((mouseX - viewBox.x) / viewBox.w) * newW,
			y: mouseY - ((mouseY - viewBox.y) / viewBox.h) * newH,
			w: newW,
			h: newH
		};

		zoom = zoom / factor;
	}

	function handleNodeMouseDown(e: PointerEvent, nodeId: string) {
		e.stopPropagation();
		e.preventDefault();

		const svgRect = svgElement?.getBoundingClientRect();
		if (!svgRect) return;

		const pos = positions.get(nodeId);
		if (!pos) return;

		const scaleX = viewBox.w / svgRect.width;
		const scaleY = viewBox.h / svgRect.height;

		const mouseX = viewBox.x + (e.clientX - svgRect.left) * scaleX;
		const mouseY = viewBox.y + (e.clientY - svgRect.top) * scaleY;

		dragNodeId = nodeId;
		wasDragging = false;
		dragOffset = {
			x: mouseX - pos.x,
			y: mouseY - pos.y
		};

		// Capture pointer so pointermove/pointerup keep firing on the SVG
		// even when the cursor leaves its bounds during a drag
		if (svgElement) {
			(svgElement as unknown as Element).setPointerCapture(e.pointerId);
		}
	}

	function handleNodeClick(e: MouseEvent, nodeId: string) {
		// Only trigger click if we didn't drag
		if (wasDragging) {
			wasDragging = false;
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		onNodeSelect(nodeId);

		// Open the popover positioned near the click
		openPopover(nodeId, e.clientX, e.clientY);
	}

	// ── Inline node action handlers (fire directly from SVG buttons) ──

	function handleInlineEdit(e: MouseEvent, nodeId: string) {
		e.stopPropagation();
		e.preventDefault();
		// Open the popover in the center of the node so the user can edit inline
		const pos = positions.get(nodeId);
		if (!pos || !svgElement) return;
		const svgRect = svgElement.getBoundingClientRect();
		const scaleX = svgRect.width / viewBox.w;
		const scaleY = svgRect.height / viewBox.h;
		const screenX = svgRect.left + (pos.x + NODE_WIDTH / 2 - viewBox.x) * scaleX;
		const screenY = svgRect.top + (pos.y + NODE_HEIGHT / 2 - viewBox.y) * scaleY;
		onNodeSelect(nodeId);
		openPopover(nodeId, screenX, screenY);
	}

	function handleInlineAddConnectedNode(e: MouseEvent, nodeId: string) {
		e.stopPropagation();
		e.preventDefault();
		if (onAddConnectedNode) {
			onAddConnectedNode(nodeId);
		}
	}

	function handleInlineAddEdge(e: MouseEvent, nodeId: string) {
		e.stopPropagation();
		e.preventDefault();
		if (onAddEdge) {
			onAddEdge(nodeId);
		}
	}

	function handleInlineDelete(e: MouseEvent, nodeId: string) {
		e.stopPropagation();
		e.preventDefault();
		if (onNodeDelete) {
			onNodeDelete(nodeId);
		}
	}

	/** Check whether a node type can receive new connected nodes */
	function canReceiveConnections(node: ArgumentNode): boolean {
		return getValidSourceTypesForTarget(node.type).length > 0;
	}

	/** Determine if the current user can edit a specific node */
	function canEditNode(node: ArgumentNode): boolean {
		if (isReadOnly) return false;
		if (isOwnNode) return isOwnNode(node);
		return true;
	}

	// Zoom controls
	function zoomIn() {
		const factor = 0.8;
		const centerX = viewBox.x + viewBox.w / 2;
		const centerY = viewBox.y + viewBox.h / 2;
		const newW = viewBox.w * factor;
		const newH = viewBox.h * factor;

		viewBox = {
			x: centerX - newW / 2,
			y: centerY - newH / 2,
			w: newW,
			h: newH
		};

		zoom = zoom / factor;
	}

	function zoomOut() {
		const factor = 1.25;
		const centerX = viewBox.x + viewBox.w / 2;
		const centerY = viewBox.y + viewBox.h / 2;
		const newW = viewBox.w * factor;
		const newH = viewBox.h * factor;

		viewBox = {
			x: centerX - newW / 2,
			y: centerY - newH / 2,
			w: newW,
			h: newH
		};

		zoom = zoom / factor;
	}

	function fitToView() {
		if (positions.size === 0) {
			viewBox = { x: -50, y: -20, w: 1000, h: 600 };
			zoom = 1;
			return;
		}

		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;

		// Only fit to visible nodes so focus mode zooms to the neighborhood
		for (const [id, pos] of positions) {
			if (!visibleNodeIds.has(id)) continue;
			minX = Math.min(minX, pos.x);
			minY = Math.min(minY, pos.y);
			maxX = Math.max(maxX, pos.x + NODE_WIDTH);
			maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
		}

		if (minX === Infinity) return; // no visible nodes have positions yet

		const padding = 120;
		viewBox = {
			x: minX - padding,
			y: minY - padding,
			w: maxX - minX + padding * 2,
			h: maxY - minY + padding * 2
		};

		zoom = 1;
	}

	function panToNode(nodeId: string) {
		const pos = positions.get(nodeId);
		if (!pos) return;

		// Close any existing popover first
		closePopover();

		// Center the viewBox on the target node
		const centerX = pos.x + NODE_WIDTH / 2;
		const centerY = pos.y + NODE_HEIGHT / 2;

		viewBox = {
			x: centerX - viewBox.w / 2,
			y: centerY - viewBox.h / 2,
			w: viewBox.w,
			h: viewBox.h
		};

		// Select the node
		onNodeSelect(nodeId);

		// Open the popover on the target node after a brief delay
		// so the pan completes and we can compute screen coords
		requestAnimationFrame(() => {
			if (!svgElement || !containerElement) return;
			const svgRect = svgElement.getBoundingClientRect();
			const scaleX = svgRect.width / viewBox.w;
			const scaleY = svgRect.height / viewBox.h;
			const screenX = svgRect.left + (centerX - viewBox.x) * scaleX;
			const screenY = svgRect.top + (centerY - viewBox.y) * scaleY;
			openPopover(nodeId, screenX, screenY);
		});
	}

	// Fit to view on mount and when nodes change significantly
	let lastNodeCount = $state(0);

	$effect(() => {
		if (nodes.length !== lastNodeCount) {
			lastNodeCount = nodes.length;
			// Slight delay to allow positions to compute
			setTimeout(fitToView, 50);
		}
	});

	onMount(() => {
		fitToView();
	});
</script>

<div class="graph-container" bind:this={containerElement}>
	<!-- Zoom Controls -->
	<div class="graph-controls">
		{#if onToggleNodeList}
			<button
				class="control-btn"
				class:active={nodeListVisible}
				onclick={onToggleNodeList}
				title={nodeListVisible ? 'Hide node list' : 'Show node list'}
				aria-label={nodeListVisible ? 'Hide node list' : 'Show node list'}
			>
				<List size={16} />
			</button>
		{/if}
		<button
			class="control-btn"
			class:active={viewMode === 'focus'}
			onclick={() => {
				viewMode = viewMode === 'focus' ? 'full' : 'focus';
				setTimeout(fitToView, 50);
			}}
			title={viewMode === 'focus' ? 'Show full tree' : 'Focus view'}
			aria-label={viewMode === 'focus' ? 'Show full tree' : 'Focus view'}
		>
			{#if viewMode === 'focus'}
				<Network size={16} />
			{:else}
				<Focus size={16} />
			{/if}
		</button>
		<button class="control-btn" onclick={zoomIn} title="Zoom in" aria-label="Zoom in">
			<ZoomIn size={16} />
		</button>
		<button class="control-btn" onclick={zoomOut} title="Zoom out" aria-label="Zoom out">
			<ZoomOut size={16} />
		</button>
		<button class="control-btn" onclick={fitToView} title="Fit to view" aria-label="Fit to view">
			<Maximize2 size={16} />
		</button>
	</div>

	<!-- Focus mode breadcrumb & indicator -->
	{#if viewMode === 'focus'}
		<div class="focus-bar">
			<nav class="focus-breadcrumb" aria-label="Graph navigation">
				{#each focusBreadcrumb as crumb, i}
					{#if i > 0}<span class="crumb-sep">/</span>{/if}
					{#if crumb.id === focusNodeId}
						<span class="crumb current">{crumb.label}</span>
					{:else}
						<button class="crumb" onclick={() => focusOn(crumb.id)}>{crumb.label}</button>
					{/if}
				{/each}
			</nav>
			{#if hiddenCount > 0}
				<span class="focus-hidden-count">{hiddenCount} more node{hiddenCount === 1 ? '' : 's'}</span>
			{/if}
		</div>
	{/if}

	{#if nodes.length === 0}
		<div class="empty-graph">
			<p>Add nodes to see the argument graph.</p>
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<svg
			bind:this={svgElement}
			class="graph-svg"
			viewBox="{viewBox.x} {viewBox.y} {viewBox.w} {viewBox.h}"
			preserveAspectRatio="xMidYMid meet"
			onpointerdown={handleMouseDown}
			onpointermove={handleMouseMove}
			onpointerup={handleMouseUp}
			onpointerleave={(e) => {
				if (!dragNodeId) handleMouseUp(e);
			}}
			onwheel={handleWheel}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			ontouchcancel={handleTouchEnd}
			style="touch-action: none; overscroll-behavior: contain"
		>
			<!-- Background -->
			<rect
				class="graph-bg"
				x={viewBox.x - 5000}
				y={viewBox.y - 5000}
				width={viewBox.w + 10000}
				height={viewBox.h + 10000}
				fill="transparent"
			/>

			<!-- Grid pattern -->
			<defs>
				<pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
					<path
						d="M 50 0 L 0 0 0 50"
						fill="none"
						stroke="var(--color-border)"
						stroke-width="0.3"
						opacity="0.15"
					/>
				</pattern>

				<!-- Clip paths for each node -->
				{#each nodes as node (node.id)}
					<clipPath id="clip-{node.id}">
						<rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={NODE_RX} />
					</clipPath>
				{/each}

				<!-- Arrow markers for each edge type -->
				{#each ['supports', 'contradicts', 'rebuts', 'warrants', 'cites', 'qualifies', 'derives_from'] as edgeType}
					<marker
						id="arrow-{edgeType}"
						markerWidth="8"
						markerHeight="6"
						refX="7"
						refY="3"
						orient="auto"
						markerUnits="strokeWidth"
					>
						<path d="M 0 0 L 8 3 L 0 6 Z" fill={getEdgeColor(edgeType)} opacity="0.8" />
					</marker>
				{/each}
			</defs>

			<rect
				x={viewBox.x - 5000}
				y={viewBox.y - 5000}
				width={viewBox.w + 10000}
				height={viewBox.h + 10000}
				fill="url(#grid)"
			/>

			<!-- Edges -->
			<g class="edges-layer">
				{#each visibleEdges as edge (edge.id)}
					{@const path = getEdgePath(edge)}
					{@const color = getEdgeColor(edge.type)}
					{@const label = getEdgeLabel(edge.type)}
					{@const dash = getEdgeDash(edge.type)}
					{#if path}
						<!-- Edge line -->
						<path
							d={path}
							fill="none"
							stroke={color}
							stroke-width="2.5"
							stroke-opacity="0.7"
							stroke-dasharray={dash || 'none'}
							marker-end="url(#arrow-{edge.type})"
							class="edge-path"
						/>

						<!-- Edge label background + text -->
						{@const fromPos = positions.get(edge.from_node)}
						{@const toPos = positions.get(edge.to_node)}
						{#if fromPos && toPos}
							{@const labelX = (fromPos.x + NODE_WIDTH / 2 + toPos.x + NODE_WIDTH / 2) / 2}
							{@const labelY = (fromPos.y + NODE_HEIGHT / 2 + toPos.y + NODE_HEIGHT / 2) / 2 - 12}
							<g class="edge-label-group" transform="translate({labelX}, {labelY})">
								<rect
									x={-(label.length * 3.5 + 8)}
									y="-8"
									width={label.length * 7 + 16}
									height="16"
									rx="4"
									fill="var(--color-surface, #1a1a1a)"
									stroke={color}
									stroke-width="0.5"
									opacity="0.9"
								/>
								<text
									text-anchor="middle"
									dominant-baseline="central"
									fill={color}
									font-size="9"
									font-family="var(--font-family-ui, sans-serif)"
									font-weight="600"
									letter-spacing="0.04em"
								>
									{label}
								</text>
							</g>
						{/if}
					{/if}
				{/each}
			</g>

			<!-- Nodes -->
			<g class="nodes-layer">
				{#each visibleNodes as node (node.id)}
					{@const pos = positions.get(node.id)}
					{@const config = NODE_TYPE_CONFIGS[node.type]}
					{@const isSelected = selectedNodeId === node.id}
					{@const isFocused = viewMode === 'focus' && node.id === focusNodeId}
					{@const expanded = isFocused || isSelected}
					{@const nodeH = getNodeHeight(node.content, expanded)}
					{@const displayText = expanded ? node.content : getDisplayText(node.content)}
					{@const hiddenChildren = childCounts.get(node.id) ?? 0}
					{#if pos}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						{@const alertInfo = nodeAlertCounts.get(node.id)}
						<g
							class="node-group"
							class:selected={isSelected}
							class:root={node.is_root}
							transform="translate({pos.x}, {pos.y})"
							onpointerdown={(e: PointerEvent) => handleNodeMouseDown(e, node.id)}
							onclick={(e) => handleNodeClick(e, node.id)}
							style="cursor: grab"
						>
							<!-- Selection glow -->
							{#if isSelected}
								<rect
									x="-3"
									y="-3"
									width={NODE_WIDTH + 6}
									height={nodeH + 6}
									rx={NODE_RX + 2}
									fill="none"
									stroke={config.color}
									stroke-width="2"
									stroke-opacity="0.4"
									class="selection-glow"
								/>
							{/if}

							<!-- Full-content tooltip on hover -->
							<title>{config.label}: {node.content}</title>

							<!-- Node background -->
							<rect
								width={NODE_WIDTH}
								height={nodeH}
								rx={NODE_RX}
								fill={config.bgColor}
								stroke={config.color}
								stroke-width={isSelected ? 2 : 1.5}
								stroke-opacity={isSelected ? 1 : 0.6}
								class="node-rect"
							/>

							<!-- Clipped content group -->
							<g clip-path={expanded ? 'none' : `url(#clip-${node.id})`}>
								<!-- Root indicator -->
								{#if node.is_root}
									<rect
										width={NODE_WIDTH}
										height="3"
										fill={config.color}
										opacity="0.6"
										rx="0"
										class="root-indicator"
									/>
								{/if}

								<!-- Type label background -->
								<rect
									x="6"
									y="6"
									width={config.label.length * 7 + 18}
									height="18"
									rx="9"
									fill={config.color}
									opacity="0.15"
								/>

								<!-- Type dot -->
								<circle cx="15" cy="15" r="3.5" fill={config.color} opacity="0.9" />

								<!-- Type label -->
								<text
									x="24"
									y="15"
									dominant-baseline="central"
									fill={config.color}
									font-size="9.5"
									font-weight="700"
									font-family="var(--font-family-ui, sans-serif)"
									letter-spacing="0.08em"
								>
									{config.label.toUpperCase()}{#if node.is_root}
										★{/if}
								</text>

								<!-- Implied indicator -->
								{#if node.implied}
									<text
										x={NODE_WIDTH - 8}
										y="14"
										text-anchor="end"
										dominant-baseline="central"
										fill="var(--color-text-tertiary, #607d8b)"
										font-size="8"
										font-style="italic"
										font-family="var(--font-family-ui, sans-serif)"
									>
										implied
									</text>
								{/if}

								<!-- Content text via foreignObject for proper wrapping -->
								<foreignObject
									x="8"
									y="30"
									width={NODE_WIDTH - 16}
									height={nodeH - 38}
									style="pointer-events:none"
								>
									<p style={getNodeTextStyle(nodeH, expanded)}>
										{displayText}
									</p>
								</foreignObject>
							</g>

							<!-- Connection count badge — click to open spotlight -->
							{#if hiddenChildren > 0}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<g
									class="children-badge"
									transform="translate({NODE_WIDTH - 12}, {nodeH - 12})"
									onpointerdown={(e) => { e.stopPropagation(); e.preventDefault(); }}
									onclick={(e) => { e.stopPropagation(); openSpotlight(node.id); }}
									style="cursor:pointer; pointer-events:auto"
								>
									<circle r="12" fill={config.color} opacity="0.85" />
									<text
										text-anchor="middle"
										dominant-baseline="central"
										fill="#fff"
										font-size="9"
										font-weight="700"
										font-family="var(--font-family-ui, sans-serif)"
									>+{hiddenChildren}</text>
								</g>
							{/if}

							<!-- Inline action buttons (rendered outside clip at bottom of node) -->
							{#if true}
								{@const nodeEditable = canEditNode(node)}
								{@const showAddNode = onAddConnectedNode && canReceiveConnections(node)}
								{@const showConnect = !isReadOnly && nodeEditable && onAddEdge}
								{@const showEdit = !isReadOnly && nodeEditable && onNodeEdit}
								{@const showDelete = !isReadOnly && nodeEditable && onNodeDelete && !node.is_root}
								{@const actionCount =
									1 +
									(showEdit ? 1 : 0) +
									(showAddNode ? 1 : 0) +
									(showConnect ? 1 : 0) +
									(showDelete ? 1 : 0)}
								{#if actionCount > 0}
									{@const btnWidth = NODE_WIDTH / actionCount}
									{@const actions = [
										{
											key: 'expand',
											label: 'Expand',
											icon: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
											icon2: '',
											color: '#a78bfa'
										},
										...(showEdit
											? [
													{
														key: 'edit',
														label: 'Edit',
														icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
														icon2: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
														color: '#6366f1'
													}
												]
											: []),
										...(showAddNode
											? [
													{
														key: 'add',
														label: 'Add Node',
														icon: 'M12 5v14M5 12h14',
														icon2: '',
														color: '#4ade80'
													}
												]
											: []),
										...(showConnect
											? [
													{
														key: 'connect',
														label: 'Connect',
														icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
														icon2: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
														color: '#4bc4e8'
													}
												]
											: []),
										...(showDelete
											? [
													{
														key: 'delete',
														label: 'Delete',
														icon: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
														icon2: '',
														color: '#ef4444'
													}
												]
											: [])
									]}
									<g class="node-actions" transform="translate(0, {nodeH})">
										<!-- Action bar background -->
										<rect
											x="0"
											y="0"
											width={NODE_WIDTH}
											height="26"
											rx="4"
											fill={config.bgColor}
											stroke={config.color}
											stroke-width={isSelected ? 2 : 1.5}
											stroke-opacity={isSelected ? 0.8 : 0.4}
											class="action-bar-bg"
										/>
										<!-- Divider line -->
										<line
											x1="1"
											y1="0"
											x2={NODE_WIDTH - 1}
											y2="0"
											stroke={config.color}
											stroke-opacity="0.25"
											stroke-width="1"
										/>
										{#each actions as action, i}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<g
												class="node-action-btn"
												transform="translate({i * btnWidth}, 0)"
												onpointerdown={(e) => { e.stopPropagation(); e.preventDefault(); }}
												onclick={(e) => {
													e.stopPropagation();
													if (action.key === 'expand') openSpotlight(node.id);
													else if (action.key === 'edit') handleInlineEdit(e, node.id);
													else if (action.key === 'add') handleInlineAddConnectedNode(e, node.id);
													else if (action.key === 'connect') handleInlineAddEdge(e, node.id);
													else if (action.key === 'delete') handleInlineDelete(e, node.id);
												}}
												role="button"
												tabindex="-1"
												aria-label={action.label}
											>
												<rect
													x="0"
													y="0"
													width={btnWidth}
													height="26"
													fill="transparent"
													class="action-hit-area"
												/>
												<g transform="translate({btnWidth / 2 - 6}, 5)">
													<path
														d={action.icon}
														fill="none"
														stroke={action.color}
														stroke-width="1.5"
														stroke-linecap="round"
														stroke-linejoin="round"
														opacity="0.7"
														transform="scale(0.5)"
													/>
													{#if action.icon2}
														<path
															d={action.icon2}
															fill="none"
															stroke={action.color}
															stroke-width="1.5"
															stroke-linecap="round"
															stroke-linejoin="round"
															opacity="0.7"
															transform="scale(0.5)"
														/>
													{/if}
												</g>
												<text
													x={btnWidth / 2}
													y="21"
													text-anchor="middle"
													fill={action.color}
													font-size="6.5"
													font-weight="500"
													font-family="var(--font-family-ui, sans-serif)"
													opacity="0.8"
												>
													{action.label}
												</text>
											</g>
										{/each}
									</g>
								{/if}
							{/if}

							<!-- Alert badge indicator (rendered outside clip so it's always visible) -->
							{#if alertInfo}
								{#if alertInfo.errors > 0}
									<circle
										cx={NODE_WIDTH - 6}
										cy="6"
										r="7"
										fill="#ef4444"
										stroke={config.bgColor}
										stroke-width="2"
										class="alert-badge"
									/>
									<text
										x={NODE_WIDTH - 6}
										y="6"
										text-anchor="middle"
										dominant-baseline="central"
										fill="#fff"
										font-size="8"
										font-weight="700"
										font-family="var(--font-family-ui, sans-serif)"
										style="pointer-events:none"
									>
										{alertInfo.errors}
									</text>
								{:else if alertInfo.warnings > 0}
									<circle
										cx={NODE_WIDTH - 6}
										cy="6"
										r="7"
										fill="#eab308"
										stroke={config.bgColor}
										stroke-width="2"
										class="alert-badge"
									/>
									<text
										x={NODE_WIDTH - 6}
										y="6"
										text-anchor="middle"
										dominant-baseline="central"
										fill="#000"
										font-size="8"
										font-weight="700"
										font-family="var(--font-family-ui, sans-serif)"
										style="pointer-events:none"
									>
										{alertInfo.warnings}
									</text>
								{/if}
							{/if}
						</g>
					{/if}
				{/each}
			</g>
		</svg>
	{/if}

	<!-- Node popover (rendered in HTML layer above the SVG) -->
	<!-- ── Spotlight overlay ─────────────────────────────────── -->
	{#if spotlightNode}
		{@const sConfig = NODE_TYPE_CONFIGS[spotlightNode.type]}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="spotlight-overlay" onclick={closeSpotlight}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="spotlight-card" onclick={(e) => e.stopPropagation()} style="--node-color: {sConfig.color}; --node-bg: {sConfig.bgColor}">
				<!-- Header -->
				<div class="spotlight-header">
					<div class="spotlight-type-badge" style="background: {sConfig.color}20; color: {sConfig.color}">
						<span class="spotlight-type-dot" style="background: {sConfig.color}"></span>
						{sConfig.label.toUpperCase()}
						{#if spotlightNode.is_root} ★{/if}
					</div>
					<div class="spotlight-header-actions">
						{#if canEditSpotlight && !spotlightEditing}
							<button class="spotlight-action-btn" onclick={startSpotlightEdit} aria-label="Edit node">Edit</button>
						{/if}
						{#if canAddFromSpotlight}
							<button class="spotlight-action-btn spotlight-action-add" onclick={() => { const id = spotlightNode!.id; closeSpotlight(); onAddConnectedNode!(id); }} aria-label="Add connected node">+ Add Node</button>
						{/if}
						<button class="spotlight-close" onclick={closeSpotlight} aria-label="Close spotlight">✕</button>
					</div>
				</div>

				<!-- Full content or edit mode -->
				{#if spotlightEditing}
					<div class="spotlight-edit">
						<textarea
							class="spotlight-edit-textarea"
							bind:value={spotlightEditContent}
							onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveSpotlightEdit(); if (e.key === 'Escape') cancelSpotlightEdit(); }}
						></textarea>
						{#if spotlightEditError}
							<div class="spotlight-edit-error">{spotlightEditError}</div>
						{/if}
						<div class="spotlight-edit-actions">
							<button class="spotlight-edit-cancel" onclick={cancelSpotlightEdit} disabled={spotlightEditSaving}>Cancel</button>
							<button class="spotlight-edit-save" onclick={saveSpotlightEdit} disabled={spotlightEditSaving || !spotlightEditContent.trim()}>
								{spotlightEditSaving ? 'Saving…' : 'Save'}
							</button>
						</div>
					</div>
				{:else}
					<div class="spotlight-content">{spotlightNode.content}</div>
				{/if}

				<!-- Incoming connections (parents) -->
				{#if spotlightIncoming.length > 0}
					<div class="spotlight-connections">
						<div class="spotlight-connections-label">Connected from</div>
						<div class="spotlight-badges">
							{#each spotlightIncoming as conn}
								{@const cConfig = NODE_TYPE_CONFIGS[conn.node.type]}
								{@const grandchildren = neighborMap.get(conn.node.id)?.size ?? 0}
								<button
									class="spotlight-badge"
									style="border-color: {cConfig.color}40; background: {cConfig.bgColor}"
									onclick={() => openSpotlight(conn.node.id)}
								>
									<span class="badge-type" style="color: {cConfig.color}">{cConfig.label}</span>
									<span class="badge-edge">{conn.edgeType.replace('_', ' ')}</span>
									<span class="badge-content">{conn.node.content.length > 80 ? conn.node.content.slice(0, 80) + '…' : conn.node.content}</span>
									{#if grandchildren > 1}
										<span class="badge-count" style="background: {cConfig.color}">{grandchildren - 1}</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Outgoing connections (children) -->
				{#if spotlightOutgoing.length > 0}
					<div class="spotlight-connections">
						<div class="spotlight-connections-label">Connects to</div>
						<div class="spotlight-badges">
							{#each spotlightOutgoing as conn}
								{@const cConfig = NODE_TYPE_CONFIGS[conn.node.type]}
								{@const grandchildren = neighborMap.get(conn.node.id)?.size ?? 0}
								<button
									class="spotlight-badge"
									style="border-color: {cConfig.color}40; background: {cConfig.bgColor}"
									onclick={() => openSpotlight(conn.node.id)}
								>
									<span class="badge-type" style="color: {cConfig.color}">{cConfig.label}</span>
									<span class="badge-edge">{conn.edgeType.replace('_', ' ')}</span>
									<span class="badge-content">{conn.node.content.length > 80 ? conn.node.content.slice(0, 80) + '…' : conn.node.content}</span>
									{#if grandchildren > 1}
										<span class="badge-count" style="background: {cConfig.color}">{grandchildren - 1}</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Back to graph -->
				<div class="spotlight-footer">
					<button class="spotlight-back" onclick={closeSpotlight}>
						Back to graph
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if popoverNode}
		{@const nodeIsReadOnly = isReadOnly || (isOwnNode ? !isOwnNode(popoverNode) : false)}
		<GraphNodePopover
			node={popoverNode}
			{nodes}
			{edges}
			{structuralFlags}
			x={popoverX}
			y={popoverY}
			containerRect={containerElement?.getBoundingClientRect() ?? null}
			onClose={closePopover}
			onEdit={nodeIsReadOnly ? undefined : onNodeEdit}
			onDelete={nodeIsReadOnly
				? undefined
				: onNodeDelete
					? (id) => {
							closePopover();
							onNodeDelete!(id);
						}
					: undefined}
			onAddEdge={nodeIsReadOnly
				? undefined
				: onAddEdge
					? (id) => {
							closePopover();
							onAddEdge!(id);
						}
					: undefined}
			onAddConnectedNode={onAddConnectedNode
				? (id) => {
						closePopover();
						onAddConnectedNode!(id);
					}
				: undefined}
			onFocusNode={panToNode}
			isReadOnly={nodeIsReadOnly}
		/>
	{/if}
</div>

<style>
	.graph-container {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 60vh;
		overflow: hidden;
		background: var(--color-surface, #1a1a1a);
		touch-action: none;
		overscroll-behavior: contain;
	}

	.graph-svg {
		width: 100%;
		height: 100%;
		min-height: 60vh;
		display: block;
		user-select: none;
		cursor: grab;
	}

	.graph-svg:active {
		cursor: grabbing;
	}

	/* Controls */
	.graph-controls {
		position: absolute;
		top: var(--space-sm, 16px);
		right: var(--space-sm, 16px);
		display: flex;
		flex-direction: column;
		gap: 4px;
		z-index: 10;
	}

	.control-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: var(--color-surface, #1a1a1a);
		border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		border-radius: var(--border-radius-sm, 4px);
		color: var(--color-text-secondary, #90a4ae);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		color: var(--color-primary, #cfe0e8);
		border-color: var(--color-primary, #cfe0e8);
		background: color-mix(in srgb, var(--color-primary, #cfe0e8) 5%, var(--color-surface, #1a1a1a));
	}

	.control-btn.active {
		color: var(--color-primary, #cfe0e8);
		border-color: var(--color-primary, #cfe0e8);
		background: color-mix(
			in srgb,
			var(--color-primary, #cfe0e8) 10%,
			var(--color-surface, #1a1a1a)
		);
	}

	/* Focus bar */
	.focus-bar {
		position: absolute;
		top: var(--space-sm, 16px);
		left: var(--space-sm, 16px);
		right: 60px;
		display: flex;
		align-items: center;
		gap: 12px;
		z-index: 10;
		pointer-events: auto;
	}

	.focus-breadcrumb {
		display: flex;
		align-items: center;
		gap: 2px;
		background: color-mix(in srgb, var(--color-surface, #1a1a1a) 92%, transparent);
		border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		border-radius: var(--border-radius-sm, 4px);
		padding: 4px 10px;
		overflow-x: auto;
		max-width: 100%;
		font-size: 11px;
		font-family: var(--font-family-ui, sans-serif);
	}

	.crumb {
		color: var(--color-text-secondary, #90a4ae);
		background: none;
		border: none;
		padding: 2px 4px;
		border-radius: 3px;
		cursor: pointer;
		white-space: nowrap;
		font-size: 11px;
		font-family: var(--font-family-ui, sans-serif);
		transition: color 0.15s, background 0.15s;
	}

	button.crumb:hover {
		color: var(--color-primary, #cfe0e8);
		background: color-mix(in srgb, var(--color-primary, #cfe0e8) 10%, transparent);
	}

	.crumb.current {
		color: var(--color-text-primary, #eceff1);
		font-weight: 600;
		cursor: default;
	}

	.crumb-sep {
		color: var(--color-text-tertiary, #607d8b);
		font-size: 10px;
		margin: 0 1px;
	}

	.focus-hidden-count {
		font-size: 10px;
		color: var(--color-text-tertiary, #607d8b);
		white-space: nowrap;
		font-family: var(--font-family-ui, sans-serif);
	}

	/* ── Spotlight overlay ─────────────────────────────────── */
	.spotlight-overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 32px 24px;
		overflow-y: auto;
	}

	.spotlight-card {
		width: 100%;
		max-width: 640px;
		background: var(--color-surface, #1a1a1a);
		border: 1.5px solid var(--node-color, #666);
		border-radius: 12px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.spotlight-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.spotlight-type-badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 14px;
		border-radius: 20px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		font-family: var(--font-family-ui, sans-serif);
	}

	.spotlight-type-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.spotlight-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.spotlight-action-btn {
		background: none;
		border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		border-radius: 6px;
		color: var(--color-text-secondary, #90a4ae);
		padding: 4px 12px;
		font-size: 12px;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.15s;
	}

	.spotlight-action-btn:hover {
		color: var(--color-text-primary, #eceff1);
		border-color: var(--color-text-secondary, #90a4ae);
	}

	.spotlight-action-add {
		color: #4ade80;
		border-color: #4ade8040;
	}

	.spotlight-action-add:hover {
		color: #4ade80;
		border-color: #4ade80;
		background: #4ade8010;
	}

	.spotlight-close {
		background: none;
		border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		border-radius: 6px;
		color: var(--color-text-secondary, #90a4ae);
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 14px;
		flex-shrink: 0;
		transition: all 0.15s;
	}

	.spotlight-close:hover {
		color: var(--color-text-primary, #eceff1);
		border-color: var(--color-text-secondary, #90a4ae);
	}

	/* Edit mode */
	.spotlight-edit {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.spotlight-edit-textarea {
		width: 100%;
		min-height: 160px;
		padding: 12px;
		background: var(--node-bg, #0a0a0a);
		border: 1px solid var(--node-color, #666);
		border-radius: 8px;
		color: var(--color-text-primary, #eceff1);
		font-size: 15px;
		font-family: var(--font-family-serif, serif);
		line-height: 1.6;
		resize: vertical;
		outline: none;
	}

	.spotlight-edit-textarea:focus {
		border-color: var(--node-color, #666);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color, #666) 25%, transparent);
	}

	.spotlight-edit-error {
		font-size: 12px;
		color: #ef4444;
		font-family: var(--font-family-ui, sans-serif);
	}

	.spotlight-edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.spotlight-edit-cancel,
	.spotlight-edit-save {
		padding: 6px 16px;
		border-radius: 6px;
		font-size: 12px;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.15s;
	}

	.spotlight-edit-cancel {
		background: none;
		border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		color: var(--color-text-secondary, #90a4ae);
	}

	.spotlight-edit-cancel:hover {
		border-color: var(--color-text-secondary, #90a4ae);
	}

	.spotlight-edit-save {
		background: var(--node-color, #666);
		border: none;
		color: #000;
		font-weight: 600;
	}

	.spotlight-edit-save:hover {
		filter: brightness(1.15);
	}

	.spotlight-edit-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.spotlight-content {
		font-size: 16px;
		line-height: 1.65;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-serif, serif);
		white-space: pre-wrap;
		word-break: normal;
		overflow-wrap: break-word;
	}

	.spotlight-connections {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.spotlight-connections-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary, #607d8b);
		font-family: var(--font-family-ui, sans-serif);
	}

	.spotlight-badges {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.spotlight-badge {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 10px 14px;
		border: 1px solid;
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
		font-family: var(--font-family-ui, sans-serif);
	}

	.spotlight-badge:hover {
		filter: brightness(1.3);
		transform: translateX(2px);
	}

	.badge-type {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.badge-edge {
		font-size: 9px;
		color: var(--color-text-tertiary, #607d8b);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.badge-content {
		font-size: 12px;
		color: var(--color-text-secondary, #90a4ae);
		line-height: 1.4;
		flex: 1;
		min-width: 0;
	}

	.badge-count {
		font-size: 9px;
		font-weight: 700;
		color: #fff;
		padding: 1px 5px;
		border-radius: 10px;
		flex-shrink: 0;
	}

	.spotlight-footer {
		display: flex;
		justify-content: center;
		padding-top: 4px;
	}

	.spotlight-back {
		background: none;
		border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
		border-radius: 6px;
		color: var(--color-text-secondary, #90a4ae);
		padding: 6px 16px;
		font-size: 12px;
		cursor: pointer;
		font-family: var(--font-family-ui, sans-serif);
		transition: all 0.15s;
	}

	.spotlight-back:hover {
		color: var(--color-text-primary, #eceff1);
		border-color: var(--color-text-secondary, #90a4ae);
	}

	@media (max-width: 768px) {
		.spotlight-overlay {
			padding: 16px 12px;
		}
		.spotlight-card {
			padding: 16px;
		}
		.spotlight-content {
			font-size: 14px;
		}
	}

	/* Empty state */
	.empty-graph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: var(--color-text-tertiary, #607d8b);
		font-size: 0.9rem;
		font-family: var(--font-family-ui, sans-serif);
	}

	.empty-graph p {
		margin: 0;
	}

	/* Edge styling */
	.edge-path {
		transition: stroke-opacity 0.15s ease;
		pointer-events: none;
	}

	.edge-label-group {
		pointer-events: none;
	}

	/* Node styling */
	.node-group {
		transition: filter 0.15s ease;
	}

	.node-group:hover .node-rect {
		stroke-opacity: 1;
		filter: brightness(1.1);
	}

	.node-group:active {
		cursor: grabbing;
	}

	/* ── Inline action buttons on graph nodes ────────────────────── */
	.node-actions {
		opacity: 0;
		transition: opacity 0.15s ease;
		pointer-events: none;
	}

	.node-group:hover .node-actions,
	.node-group.selected .node-actions {
		opacity: 1;
		pointer-events: auto;
	}

	.node-action-btn {
		cursor: pointer;
	}

	.node-action-btn:hover .action-hit-area {
		fill: rgba(255, 255, 255, 0.06);
	}

	.node-action-btn:hover path {
		opacity: 1;
	}

	.node-action-btn:hover text {
		opacity: 1;
	}

	.node-group.selected .node-rect {
		stroke-opacity: 1;
	}

	.selection-glow {
		animation: pulse-glow 2s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%,
		100% {
			stroke-opacity: 0.3;
		}
		50% {
			stroke-opacity: 0.6;
		}
	}

	.root-indicator {
		transition: opacity 0.15s ease;
	}

	.alert-badge {
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
		transition: r 0.15s ease;
	}

	.node-group:hover .alert-badge {
		r: 8;
	}

	.children-badge {
		cursor: pointer;
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
		transition: transform 0.15s ease;
	}

	.node-group:hover .children-badge {
		transform: scale(1.15);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.graph-controls {
			top: var(--space-xs, 8px);
			right: var(--space-xs, 8px);
			flex-direction: row;
			gap: 4px;
		}

		.control-btn {
			width: 36px;
			height: 36px;
		}

		.focus-bar {
			top: auto;
			bottom: var(--space-xs, 8px);
			left: var(--space-xs, 8px);
			right: var(--space-xs, 8px);
		}

		.focus-breadcrumb {
			font-size: 10px;
			padding: 6px 8px;
		}

		.spotlight-overlay {
			padding: 8px;
		}

		.spotlight-card {
			padding: 14px;
			gap: 14px;
		}

		.spotlight-header {
			flex-wrap: wrap;
			gap: 8px;
		}

		.spotlight-action-btn {
			font-size: 11px;
			padding: 6px 10px;
		}

		.spotlight-badge {
			padding: 8px 10px;
			gap: 6px;
			flex-wrap: wrap;
		}
	}
</style>
