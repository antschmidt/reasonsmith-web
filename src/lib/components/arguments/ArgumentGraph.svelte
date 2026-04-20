<script lang="ts">
	import type {
		ArgumentNode,
		ArgumentEdge
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import { calculateNodePositions } from '$lib/utils/argumentUtils';
	import { ZoomIn, ZoomOut, Maximize2 } from '@lucide/svelte';

	interface Props {
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		selectedNodeId: string | null;
		onNodeSelect: (nodeId: string) => void;
	}

	let {
		nodes,
		edges,
		selectedNodeId,
		onNodeSelect
	}: Props = $props();

	// ── Layout constants ──────────────────────────────────────────
	const NODE_WIDTH = 320;
	const NODE_HEIGHT = 160;
	const NODE_RX = 10;

	// ── Container / viewBox state ─────────────────────────────────
	let svgElement: SVGSVGElement | undefined = $state();
	let containerElement: HTMLDivElement | undefined = $state();
	let containerWidth = $state(0);
	let viewBox = $state({ x: -50, y: -20, w: 1200, h: 700 });
	let isPanning = $state(false);
	let panStart = $state({ x: 0, y: 0 });

	const maxCols = $derived.by(() => {
		if (!containerWidth) return 3;
		const H_GAP = 80;
		const usable = containerWidth * 0.85;
		const cols = Math.floor((usable + H_GAP) / (NODE_WIDTH + H_GAP));
		return Math.max(1, Math.min(cols, 4));
	});

	// ── Auto-layout (authoritative, no drag-to-position) ──────────
	const positions = $derived.by(() => {
		return calculateNodePositions(nodes, edges, {
			maxCols,
			nodeWidth: NODE_WIDTH,
			nodeHeight: NODE_HEIGHT
		});
	});

	// Fit viewBox around nodes whenever layout changes
	$effect(() => {
		if (positions.size === 0) return;
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const pos of positions.values()) {
			if (pos.x < minX) minX = pos.x;
			if (pos.y < minY) minY = pos.y;
			if (pos.x + NODE_WIDTH > maxX) maxX = pos.x + NODE_WIDTH;
			if (pos.y + NODE_HEIGHT > maxY) maxY = pos.y + NODE_HEIGHT;
		}
		if (!isFinite(minX)) return;
		const pad = 40;
		viewBox = {
			x: minX - pad,
			y: minY - pad,
			w: Math.max(600, maxX - minX + pad * 2),
			h: Math.max(400, maxY - minY + pad * 2)
		};
	});

	// ── Edge rendering ────────────────────────────────────────────
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

		// Exit/enter on the closer edge of each rectangle.
		if (absDx > absDy) {
			// Horizontal dominance
			if (dx > 0) {
				startX = fromPos.x + NODE_WIDTH;
				endX = toPos.x;
			} else {
				startX = fromPos.x;
				endX = toPos.x + NODE_WIDTH;
			}
			startY = fromCY;
			endY = toCY;
		} else {
			// Vertical dominance
			if (dy > 0) {
				startY = fromPos.y + NODE_HEIGHT;
				endY = toPos.y;
			} else {
				startY = fromPos.y;
				endY = toPos.y + NODE_HEIGHT;
			}
			startX = fromCX;
			endX = toCX;
		}

		const dist = Math.sqrt(dx * dx + dy * dy);
		const tension = Math.min(dist * 0.3, 80);

		if (absDx < absDy) {
			const cy1 = startY + (dy > 0 ? tension : -tension);
			const cy2 = endY + (dy > 0 ? -tension : tension);
			return `M ${startX} ${startY} C ${startX} ${cy1}, ${endX} ${cy2}, ${endX} ${endY}`;
		} else {
			const cx1 = startX + (dx > 0 ? tension : -tension);
			const cx2 = endX + (dx > 0 ? -tension : tension);
			return `M ${startX} ${startY} C ${cx1} ${startY}, ${cx2} ${endY}, ${endX} ${endY}`;
		}
	}

	function getEdgeColor(edgeType: string): string {
		switch (edgeType) {
			case 'supports':
				return '#22c55e';
			case 'contradicts':
				return '#ef4444';
			case 'rebuts':
				return '#f59e0b';
			case 'warrants':
				return '#a855f7';
			case 'cites':
				return '#64748b';
			case 'qualifies':
				return '#06b6d4';
			case 'derives_from':
				return '#64748b';
			default:
				return '#888';
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

	function getEdgeDash(edgeType: string): string {
		// Dashed for less "structural" relationships
		if (edgeType === 'qualifies' || edgeType === 'cites' || edgeType === 'derives_from') {
			return '4 4';
		}
		return '';
	}

	function truncate(text: string, maxLength: number = 180): string {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 1).trimEnd() + '…';
	}

	// ── Zoom / pan handlers ───────────────────────────────────────
	function handleMouseDown(e: PointerEvent) {
		if (e.button !== 0) return;
		isPanning = true;
		panStart = { x: e.clientX, y: e.clientY };
		(e.target as Element)?.setPointerCapture?.(e.pointerId);
	}

	function handleMouseMove(e: PointerEvent) {
		if (!isPanning) return;
		const svgRect = svgElement?.getBoundingClientRect();
		if (!svgRect) return;
		const scaleX = viewBox.w / svgRect.width;
		const scaleY = viewBox.h / svgRect.height;
		const dx = (e.clientX - panStart.x) * scaleX;
		const dy = (e.clientY - panStart.y) * scaleY;
		viewBox = { ...viewBox, x: viewBox.x - dx, y: viewBox.y - dy };
		panStart = { x: e.clientX, y: e.clientY };
	}

	function handleMouseUp(e: PointerEvent) {
		isPanning = false;
		(e.target as Element)?.releasePointerCapture?.(e.pointerId);
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const svgRect = svgElement?.getBoundingClientRect();
		if (!svgRect) return;
		const factor = e.deltaY > 0 ? 1.1 : 0.9;
		const mouseX = viewBox.x + ((e.clientX - svgRect.left) / svgRect.width) * viewBox.w;
		const mouseY = viewBox.y + ((e.clientY - svgRect.top) / svgRect.height) * viewBox.h;
		const newW = viewBox.w * factor;
		const newH = viewBox.h * factor;
		viewBox = {
			x: mouseX - ((mouseX - viewBox.x) * newW) / viewBox.w,
			y: mouseY - ((mouseY - viewBox.y) * newH) / viewBox.h,
			w: newW,
			h: newH
		};
	}

	// ── Touch: pinch-zoom + one-finger pan ─────────────────────────
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
		if (e.touches.length === 1) {
			isTouchPanning = true;
			panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
		} else if (e.touches.length === 2) {
			isTouchPanning = false;
			lastTouchDist = getTouchDistance(e.touches);
			lastTouchCenter = getTouchCenter(e.touches);
		}
	}
	function handleTouchMove(e: TouchEvent) {
		if (isTouchPanning && e.touches.length === 1) {
			const svgRect = svgElement?.getBoundingClientRect();
			if (!svgRect) return;
			const scaleX = viewBox.w / svgRect.width;
			const scaleY = viewBox.h / svgRect.height;
			const dx = (e.touches[0].clientX - panStart.x) * scaleX;
			const dy = (e.touches[0].clientY - panStart.y) * scaleY;
			viewBox = { ...viewBox, x: viewBox.x - dx, y: viewBox.y - dy };
			panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			e.preventDefault();
		} else if (e.touches.length === 2 && lastTouchDist !== null && lastTouchCenter !== null) {
			const newDist = getTouchDistance(e.touches);
			const newCenter = getTouchCenter(e.touches);
			const factor = lastTouchDist / newDist;
			const svgRect = svgElement?.getBoundingClientRect();
			if (!svgRect) return;
			const cx = viewBox.x + ((newCenter.x - svgRect.left) / svgRect.width) * viewBox.w;
			const cy = viewBox.y + ((newCenter.y - svgRect.top) / svgRect.height) * viewBox.h;
			const newW = viewBox.w * factor;
			const newH = viewBox.h * factor;
			viewBox = {
				x: cx - ((cx - viewBox.x) * newW) / viewBox.w,
				y: cy - ((cy - viewBox.y) * newH) / viewBox.h,
				w: newW,
				h: newH
			};
			lastTouchDist = newDist;
			lastTouchCenter = newCenter;
			e.preventDefault();
		}
	}
	function handleTouchEnd(e: TouchEvent) {
		if (e.touches.length === 0) {
			isTouchPanning = false;
			lastTouchDist = null;
			lastTouchCenter = null;
		}
	}

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
	}

	function fitToView() {
		if (positions.size === 0) return;
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const pos of positions.values()) {
			if (pos.x < minX) minX = pos.x;
			if (pos.y < minY) minY = pos.y;
			if (pos.x + NODE_WIDTH > maxX) maxX = pos.x + NODE_WIDTH;
			if (pos.y + NODE_HEIGHT > maxY) maxY = pos.y + NODE_HEIGHT;
		}
		const pad = 40;
		viewBox = {
			x: minX - pad,
			y: minY - pad,
			w: Math.max(600, maxX - minX + pad * 2),
			h: Math.max(400, maxY - minY + pad * 2)
		};
	}

	// ── Container size tracking ────────────────────────────────────
	$effect(() => {
		if (!containerElement) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				containerWidth = entry.contentRect.width;
			}
		});
		ro.observe(containerElement);
		return () => ro.disconnect();
	});
</script>

<div class="argument-graph-wrapper" bind:this={containerElement}>
	<div class="graph-controls">
		<button onclick={zoomIn} aria-label="Zoom in" title="Zoom in">
			<ZoomIn size={16} />
		</button>
		<button onclick={zoomOut} aria-label="Zoom out" title="Zoom out">
			<ZoomOut size={16} />
		</button>
		<button onclick={fitToView} aria-label="Fit to view" title="Fit to view">
			<Maximize2 size={16} />
		</button>
	</div>

	<svg
		bind:this={svgElement}
		class="argument-graph-svg"
		viewBox="{viewBox.x} {viewBox.y} {viewBox.w} {viewBox.h}"
		class:panning={isPanning}
		onpointerdown={handleMouseDown}
		onpointermove={handleMouseMove}
		onpointerup={handleMouseUp}
		onpointercancel={handleMouseUp}
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
		onwheel={handleWheel}
		role="img"
		aria-label="Argument map"
	>
		<defs>
			{#each ['supports', 'contradicts', 'rebuts', 'warrants', 'cites', 'qualifies', 'derives_from'] as type}
				<marker
					id="arrow-{type}"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" fill={getEdgeColor(type)} />
				</marker>
			{/each}
		</defs>

		<!-- Edges -->
		<g class="edges">
			{#each edges as edge (edge.id)}
				{@const path = getEdgePath(edge)}
				{#if path}
					<g class="edge">
						<path
							d={path}
							fill="none"
							stroke={getEdgeColor(edge.type)}
							stroke-width="2"
							stroke-dasharray={getEdgeDash(edge.type)}
							marker-end="url(#arrow-{edge.type})"
							opacity="0.75"
						/>
					</g>
				{/if}
			{/each}
		</g>

		<!-- Nodes -->
		<g class="nodes">
			{#each nodes as node (node.id)}
				{@const pos = positions.get(node.id)}
				{#if pos}
					{@const config = NODE_TYPE_CONFIGS[node.type]}
					{@const selected = selectedNodeId === node.id}
					<g
						class="node"
						class:selected
						transform="translate({pos.x}, {pos.y})"
						role="button"
						tabindex="0"
						aria-label="{config.label}: {truncate(node.content, 60)}"
						onclick={() => onNodeSelect(node.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onNodeSelect(node.id);
							}
						}}
					>
						<rect
							width={NODE_WIDTH}
							height={NODE_HEIGHT}
							rx={NODE_RX}
							ry={NODE_RX}
							fill="#141414"
							stroke={selected ? config.color : '#2a2a2a'}
							stroke-width={selected ? 3 : 1.5}
						/>
						<!-- Top color bar -->
						<rect
							width={NODE_WIDTH}
							height="6"
							rx={NODE_RX}
							ry={NODE_RX}
							fill={config.color}
							opacity="0.9"
						/>
						<!-- Type label -->
						<text
							x="14"
							y="30"
							font-size="11"
							font-weight="700"
							fill={config.color}
							style="text-transform: uppercase; letter-spacing: 0.06em;"
						>
							{config.label}
							{#if node.is_root}
								<tspan dx="6" fill="#888" font-weight="500">· root</tspan>
							{/if}
						</text>
						<!-- Content -->
						<foreignObject x="14" y="40" width={NODE_WIDTH - 28} height={NODE_HEIGHT - 52}>
							<div class="node-content-html">
								{truncate(node.content, 220)}
							</div>
						</foreignObject>
					</g>
				{/if}
			{/each}
		</g>

		<!-- Edge labels -->
		<g class="edge-labels">
			{#each edges as edge (edge.id)}
				{@const fromPos = positions.get(edge.from_node)}
				{@const toPos = positions.get(edge.to_node)}
				{#if fromPos && toPos}
					{@const mx = (fromPos.x + toPos.x) / 2 + NODE_WIDTH / 2}
					{@const my = (fromPos.y + toPos.y) / 2 + NODE_HEIGHT / 2}
					<text
						x={mx}
						y={my}
						text-anchor="middle"
						font-size="11"
						font-weight="600"
						fill={getEdgeColor(edge.type)}
						style="pointer-events: none; paint-order: stroke; stroke: #0a0a0a; stroke-width: 3px; stroke-linejoin: round;"
					>
						{getEdgeLabel(edge.type)}
					</text>
				{/if}
			{/each}
		</g>

		{#if nodes.length === 0}
			<text
				x={viewBox.x + viewBox.w / 2}
				y={viewBox.y + viewBox.h / 2}
				text-anchor="middle"
				fill="#666"
				font-size="14"
				font-style="italic"
			>
				No nodes to display
			</text>
		{/if}
	</svg>
</div>

<style>
	.argument-graph-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 400px;
		background: var(--color-surface, #0a0a0a);
		border: 1px solid var(--color-border, #2a2a2a);
		border-radius: 8px;
		overflow: hidden;
	}

	.graph-controls {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		z-index: 10;
	}

	.graph-controls button {
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-elevated, #141414);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		color: var(--color-text-secondary, #aaa);
		cursor: pointer;
	}
	.graph-controls button:hover {
		background: var(--color-surface-hover, #1e1e1e);
		color: var(--color-text-primary, #e0e0e0);
	}

	.argument-graph-svg {
		width: 100%;
		height: 100%;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.argument-graph-svg.panning {
		cursor: grabbing;
	}

	.node {
		cursor: pointer;
	}
	.node:hover rect {
		filter: brightness(1.15);
	}
	.node.selected {
		filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.5));
	}

	:global(.node-content-html) {
		color: #e0e0e0;
		font-size: 14px;
		line-height: 1.4;
		font-family: inherit;
		white-space: pre-wrap;
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 7;
		line-clamp: 7;
	}
</style>
