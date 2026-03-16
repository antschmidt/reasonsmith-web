<script lang="ts">
	import { onMount } from 'svelte';
	import type { ArgumentNode, ArgumentEdge } from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import { calculateNodePositions } from '$lib/utils/argumentUtils';
	import { ZoomIn, ZoomOut, Maximize2 } from '@lucide/svelte';

	interface Props {
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		selectedNodeId: string | null;
		onNodeSelect: (nodeId: string) => void;
	}

	let { nodes, edges, selectedNodeId, onNodeSelect }: Props = $props();

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

	// Node dimensions
	const NODE_WIDTH = 220;
	const NODE_HEIGHT = 100;
	const NODE_RX = 6;

	// Compute positions reactively
	let positions = $state(new Map<string, { x: number; y: number }>());

	// Track manual positions separately so auto-layout doesn't override drags
	let manualPositions = $state(new Map<string, { x: number; y: number }>());

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

		const fromCenterX = fromPos.x + NODE_WIDTH / 2;
		const fromCenterY = fromPos.y + NODE_HEIGHT / 2;
		const toCenterX = toPos.x + NODE_WIDTH / 2;
		const toCenterY = toPos.y + NODE_HEIGHT / 2;

		// Calculate the angle between the two centers
		const dx = toCenterX - fromCenterX;
		const dy = toCenterY - fromCenterY;
		const angle = Math.atan2(dy, dx);

		// Start point: edge of source node
		const startX = fromCenterX + (NODE_WIDTH / 2) * Math.cos(angle);
		const startY = fromCenterY + (NODE_HEIGHT / 2) * Math.sin(angle);

		// End point: edge of target node
		const endX = toCenterX - (NODE_WIDTH / 2) * Math.cos(angle);
		const endY = toCenterY - (NODE_HEIGHT / 2) * Math.sin(angle);

		// Curved path using a quadratic bezier
		const midX = (startX + endX) / 2;
		const midY = (startY + endY) / 2;

		// Offset the control point perpendicular to the line
		const dist = Math.sqrt(dx * dx + dy * dy);
		const curvature = Math.min(dist * 0.15, 40);
		const perpX = (-dy / (dist || 1)) * curvature;
		const perpY = (dx / (dist || 1)) * curvature;

		const controlX = midX + perpX;
		const controlY = midY + perpY;

		return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
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

	function truncate(text: string, maxLength: number = 120): string {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 1) + '…';
	}

	// Truncate text for foreignObject display (CSS handles actual wrapping)
	function getDisplayText(text: string): string {
		return truncate(text, 120);
	}

	// Inline style for foreignObject text — Svelte scoped styles don't penetrate into
	// foreignObject HTML, so we must inline. word-break:break-all ensures long strings
	// like URLs wrap within the node rect.
	const nodeTextStyle = [
		'margin:0',
		'padding:0',
		`width:${NODE_WIDTH - 16}px`,
		`height:${NODE_HEIGHT - 34}px`,
		'color:var(--color-text-primary,#eceff1)',
		'font-size:11px',
		'font-family:var(--font-family-serif,serif)',
		'line-height:1.35',
		'overflow:hidden',
		'word-break:break-all',
		'overflow-wrap:break-word',
		'display:-webkit-box',
		'-webkit-line-clamp:4',
		'-webkit-box-orient:vertical',
		'box-sizing:border-box',
		'pointer-events:none'
	].join(';');

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

	function handleMouseDown(e: MouseEvent) {
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

	function handleMouseMove(e: MouseEvent) {
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

			e.preventDefault();
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

	function handleMouseUp() {
		isPanning = false;
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

	function handleNodeMouseDown(e: MouseEvent, nodeId: string) {
		e.stopPropagation();

		const svgRect = svgElement?.getBoundingClientRect();
		if (!svgRect) return;

		const pos = positions.get(nodeId);
		if (!pos) return;

		const scaleX = viewBox.w / svgRect.width;
		const scaleY = viewBox.h / svgRect.height;

		const mouseX = viewBox.x + (e.clientX - svgRect.left) * scaleX;
		const mouseY = viewBox.y + (e.clientY - svgRect.top) * scaleY;

		dragNodeId = nodeId;
		dragOffset = {
			x: mouseX - pos.x,
			y: mouseY - pos.y
		};
	}

	function handleNodeClick(e: MouseEvent, nodeId: string) {
		// Only trigger click if we didn't drag
		if (!dragNodeId) {
			onNodeSelect(nodeId);
		}
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

		for (const pos of positions.values()) {
			minX = Math.min(minX, pos.x);
			minY = Math.min(minY, pos.y);
			maxX = Math.max(maxX, pos.x + NODE_WIDTH);
			maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
		}

		const padding = 80;
		viewBox = {
			x: minX - padding,
			y: minY - padding,
			w: maxX - minX + padding * 2,
			h: maxY - minY + padding * 2
		};

		zoom = 1;
		manualPositions = new Map();
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
			onmousedown={handleMouseDown}
			onmousemove={handleMouseMove}
			onmouseup={handleMouseUp}
			onmouseleave={handleMouseUp}
			onwheel={handleWheel}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			ontouchcancel={handleTouchEnd}
			style="touch-action: none"
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
						stroke-width="0.5"
						opacity="0.3"
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
				{#each edges as edge (edge.id)}
					{@const path = getEdgePath(edge)}
					{@const color = getEdgeColor(edge.type)}
					{@const label = getEdgeLabel(edge.type)}
					{#if path}
						<!-- Edge line -->
						<path
							d={path}
							fill="none"
							stroke={color}
							stroke-width="2"
							stroke-opacity="0.6"
							marker-end="url(#arrow-{edge.type})"
							class="edge-path"
						/>

						<!-- Edge label background + text -->
						{@const fromPos = positions.get(edge.from_node)}
						{@const toPos = positions.get(edge.to_node)}
						{#if fromPos && toPos}
							{@const labelX = (fromPos.x + NODE_WIDTH / 2 + toPos.x + NODE_WIDTH / 2) / 2}
							{@const labelY = (fromPos.y + NODE_HEIGHT / 2 + toPos.y + NODE_HEIGHT / 2) / 2}
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
				{#each nodes as node (node.id)}
					{@const pos = positions.get(node.id)}
					{@const config = NODE_TYPE_CONFIGS[node.type]}
					{@const isSelected = selectedNodeId === node.id}
					{@const displayText = getDisplayText(node.content)}
					{#if pos}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<g
							class="node-group"
							class:selected={isSelected}
							class:root={node.is_root}
							transform="translate({pos.x}, {pos.y})"
							onmousedown={(e) => handleNodeMouseDown(e, node.id)}
							onclick={(e) => handleNodeClick(e, node.id)}
							style="cursor: grab"
						>
							<!-- Selection glow -->
							{#if isSelected}
								<rect
									x="-3"
									y="-3"
									width={NODE_WIDTH + 6}
									height={NODE_HEIGHT + 6}
									rx={NODE_RX + 2}
									fill="none"
									stroke={config.color}
									stroke-width="2"
									stroke-opacity="0.4"
									class="selection-glow"
								/>
							{/if}

							<!-- Node background -->
							<rect
								width={NODE_WIDTH}
								height={NODE_HEIGHT}
								rx={NODE_RX}
								fill={config.bgColor}
								stroke={config.color}
								stroke-width={isSelected ? 2 : 1.5}
								stroke-opacity={isSelected ? 1 : 0.6}
								class="node-rect"
							/>

							<!-- Clipped content group -->
							<g clip-path="url(#clip-{node.id})">
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
									width={config.label.length * 6.5 + 16}
									height="16"
									rx="8"
									fill={config.color}
									opacity="0.15"
								/>

								<!-- Type dot -->
								<circle cx="14" cy="14" r="3" fill={config.color} opacity="0.9" />

								<!-- Type label -->
								<text
									x="22"
									y="14"
									dominant-baseline="central"
									fill={config.color}
									font-size="9"
									font-weight="700"
									font-family="var(--font-family-ui, sans-serif)"
									letter-spacing="0.08em"
									text-transform="uppercase"
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
								<foreignObject x="8" y="28" width={NODE_WIDTH - 16} height={NODE_HEIGHT - 34}>
									<p style={nodeTextStyle}>
										{displayText}
									</p>
								</foreignObject>
							</g>
						</g>
					{/if}
				{/each}
			</g>
		</svg>
	{/if}
</div>

<style>
	.graph-container {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--color-surface, #1a1a1a);
	}

	.graph-svg {
		width: 100%;
		height: 100%;
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

	/* Responsive */
	@media (max-width: 768px) {
		.graph-controls {
			top: var(--space-xs, 8px);
			right: var(--space-xs, 8px);
		}

		.control-btn {
			width: 28px;
			height: 28px;
		}
	}
</style>
