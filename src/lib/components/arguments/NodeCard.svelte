<script lang="ts">
	import type { ArgumentNode, ArgumentEdge } from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS, EDGE_TYPE_CONFIGS } from '$lib/types/argument';
	import { slide } from 'svelte/transition';
	import { ChevronDown, ChevronUp, Trash2, Link, Star } from '@lucide/svelte';

	interface Props {
		node: ArgumentNode;
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		isSelected: boolean;
		connectionCount: number;
		onSelect: () => void;
		onDelete: () => void;
	}

	let { node, nodes, edges, isSelected, connectionCount, onSelect, onDelete }: Props = $props();

	let expanded = $state(false);

	const config = $derived(NODE_TYPE_CONFIGS[node.type]);

	// Get connected nodes with their role labels
	const connections = $derived.by(() => {
		const result: Array<{
			node: ArgumentNode;
			role: string;
			direction: 'incoming' | 'outgoing';
			edgeType: string;
			edgeColor: string;
		}> = [];

		for (const edge of edges) {
			const edgeConfig = EDGE_TYPE_CONFIGS[edge.type];
			if (!edgeConfig) continue;

			if (edge.from_node === node.id) {
				const targetNode = nodes.find((n) => n.id === edge.to_node);
				if (targetNode) {
					result.push({
						node: targetNode,
						role: edgeConfig.fromLabel,
						direction: 'outgoing',
						edgeType: edge.type,
						edgeColor: NODE_TYPE_CONFIGS[targetNode.type]?.color || '#888'
					});
				}
			}

			if (edge.to_node === node.id) {
				const sourceNode = nodes.find((n) => n.id === edge.from_node);
				if (sourceNode) {
					result.push({
						node: sourceNode,
						role: edgeConfig.toLabel,
						direction: 'incoming',
						edgeType: edge.type,
						edgeColor: NODE_TYPE_CONFIGS[sourceNode.type]?.color || '#888'
					});
				}
			}
		}

		return result;
	});

	// For warrant nodes, find the draws_from and justifies targets
	const warrantDrawsFrom = $derived.by(() => {
		if (node.type !== 'warrant' || !node.draws_from) return null;
		return nodes.find((n) => n.id === node.draws_from) || null;
	});

	const warrantJustifies = $derived.by(() => {
		if (node.type !== 'warrant' || !node.justifies) return null;
		return nodes.find((n) => n.id === node.justifies) || null;
	});

	function toggleExpand(e: Event) {
		e.stopPropagation();
		expanded = !expanded;
	}

	function handleDelete(e: Event) {
		e.stopPropagation();
		onDelete();
	}

	function truncate(text: string, maxLength: number = 60): string {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 3) + '...';
	}
</script>

<article
	class="node-card"
	class:selected={isSelected}
	class:is-root={node.is_root}
	class:implied={node.implied}
	style="--node-color: {config.color}; --node-bg: {config.bgColor}"
	onclick={onSelect}
	onkeydown={(e) => e.key === 'Enter' && onSelect()}
	role="button"
	tabindex="0"
	aria-expanded={expanded}
	aria-label="{config.label}: {truncate(node.content)}"
>
	<!-- Card Header -->
	<header class="card-header">
		<div class="type-badge">
			<span class="type-dot" aria-hidden="true"></span>
			<span class="type-label">{config.label}</span>
			{#if node.is_root}
				<span class="root-badge" title="Root claim">
					<Star size={10} />
					Root
				</span>
			{/if}
			{#if node.implied}
				<span class="implied-badge" title="Implied / unstated">implied</span>
			{/if}
		</div>

		<div class="card-actions">
			{#if connectionCount > 0}
				<button
					class="expand-btn"
					onclick={toggleExpand}
					title={expanded ? 'Collapse connections' : 'Show connections'}
					aria-label={expanded ? 'Collapse connections' : 'Show connections'}
				>
					<Link size={12} />
					<span class="connection-count">{connectionCount}</span>
					{#if expanded}
						<ChevronUp size={12} />
					{:else}
						<ChevronDown size={12} />
					{/if}
				</button>
			{/if}

			{#if !node.is_root}
				<button
					class="delete-btn"
					onclick={handleDelete}
					title="Delete node"
					aria-label="Delete node"
				>
					<Trash2 size={13} />
				</button>
			{/if}
		</div>
	</header>

	<!-- Content -->
	<div class="card-content">
		<p class="node-content">{node.content}</p>
	</div>

	<!-- Warrant Special Display -->
	{#if node.type === 'warrant' && (warrantDrawsFrom || warrantJustifies)}
		<div class="warrant-connections">
			{#if warrantDrawsFrom}
				<div class="warrant-link">
					<span
						class="warrant-label draws-from"
						style="--label-color: {NODE_TYPE_CONFIGS['evidence'].color}"
					>
						Draws From
					</span>
					<span class="warrant-target">
						<span
							class="target-dot"
							style="background: {NODE_TYPE_CONFIGS[warrantDrawsFrom.type].color}"
						></span>
						{truncate(warrantDrawsFrom.content, 50)}
					</span>
				</div>
			{/if}
			{#if warrantJustifies}
				<div class="warrant-link">
					<span
						class="warrant-label justifies"
						style="--label-color: {NODE_TYPE_CONFIGS['claim'].color}"
					>
						Justifies
					</span>
					<span class="warrant-target">
						<span
							class="target-dot"
							style="background: {NODE_TYPE_CONFIGS[warrantJustifies.type].color}"
						></span>
						{truncate(warrantJustifies.content, 50)}
					</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Expanded Connections -->
	{#if expanded && connections.length > 0}
		<div class="connections-panel" transition:slide={{ duration: 200 }}>
			<div class="connections-divider"></div>
			<ul class="connections-list">
				{#each connections as conn}
					<li class="connection-item">
						<span class="connection-role" style="color: {conn.edgeColor}">
							{conn.role}
						</span>
						<span class="connection-node">
							<span
								class="connection-dot"
								style="background: {NODE_TYPE_CONFIGS[conn.node.type].color}"
							></span>
							<span class="connection-type-label">
								{NODE_TYPE_CONFIGS[conn.node.type].label}:
							</span>
							<span class="connection-text">{truncate(conn.node.content, 45)}</span>
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Score indicator (if present) -->
	{#if node.score !== null && node.score !== undefined}
		<div class="score-indicator" title="Confidence score: {node.score.toFixed(2)}">
			<div class="score-bar">
				<div class="score-fill" style="width: {Math.round(node.score * 100)}%"></div>
			</div>
		</div>
	{/if}
</article>

<style>
	.node-card {
		position: relative;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--node-color);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
		overflow: hidden;
	}

	.node-card:hover {
		border-color: color-mix(in srgb, var(--node-color) 40%, var(--color-border));
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}

	.node-card.selected {
		border-color: var(--node-color);
		background: color-mix(in srgb, var(--node-color) 4%, var(--color-surface));
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--node-color) 20%, transparent),
			0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.node-card.is-root {
		border-left-width: 4px;
	}

	.node-card.implied {
		opacity: 0.75;
		border-style: dashed;
		border-left-style: solid;
	}

	/* Header */
	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xs);
		padding: 8px 10px 0 10px;
	}

	.type-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.type-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--node-color);
		flex-shrink: 0;
	}

	.type-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--node-color);
		font-family: var(--font-family-ui);
		line-height: 1;
	}

	.root-badge {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 1px 5px;
		border-radius: var(--border-radius-full);
		background: color-mix(in srgb, #e8b84b 12%, transparent);
		border: 1px solid color-mix(in srgb, #e8b84b 25%, transparent);
		color: #e8b84b;
		font-size: 0.55rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-family: var(--font-family-ui);
		line-height: 1;
	}

	.implied-badge {
		padding: 1px 5px;
		border-radius: var(--border-radius-full);
		background: color-mix(in srgb, var(--color-text-tertiary) 10%, transparent);
		color: var(--color-text-tertiary);
		font-size: 0.55rem;
		font-weight: 600;
		font-style: italic;
		font-family: var(--font-family-ui);
		line-height: 1;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.expand-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 6px;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--border-radius-sm);
		color: var(--color-text-tertiary);
		font-size: 0.65rem;
		font-weight: 600;
		font-family: var(--font-family-ui);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
	}

	.expand-btn:hover {
		color: var(--color-text-secondary);
		background: var(--color-surface-alt);
		border-color: var(--color-border);
	}

	.connection-count {
		font-variant-numeric: tabular-nums;
	}

	.delete-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: none;
		border: none;
		border-radius: var(--border-radius-sm);
		color: var(--color-text-tertiary);
		cursor: pointer;
		opacity: 0;
		transition: all var(--transition-fast) ease;
	}

	.node-card:hover .delete-btn {
		opacity: 0.6;
	}

	.delete-btn:hover {
		opacity: 1 !important;
		color: var(--color-error);
		background: color-mix(in srgb, var(--color-error) 8%, transparent);
	}

	/* Content */
	.card-content {
		padding: 6px 10px 8px 10px;
	}

	.node-content {
		margin: 0;
		font-family: var(--font-family-serif);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--color-text-primary);
		word-break: break-word;
	}

	/* Warrant Connections */
	.warrant-connections {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 10px 8px 10px;
	}

	.warrant-link {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		font-size: 0.75rem;
		line-height: 1.3;
	}

	.warrant-label {
		display: inline-block;
		padding: 1px 5px;
		border-radius: var(--border-radius-sm);
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-family: var(--font-family-ui);
		white-space: nowrap;
		flex-shrink: 0;
		margin-top: 1px;
		color: var(--label-color);
		background: color-mix(in srgb, var(--label-color) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--label-color) 20%, transparent);
	}

	.warrant-target {
		display: inline-flex;
		align-items: flex-start;
		gap: 4px;
		color: var(--color-text-secondary);
		font-family: var(--font-family-serif);
		font-size: 0.78rem;
		min-width: 0;
	}

	.target-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 4px;
	}

	/* Expanded Connections Panel */
	.connections-panel {
		padding: 0 10px 8px 10px;
	}

	.connections-divider {
		height: 1px;
		background: var(--color-border);
		margin-bottom: 6px;
	}

	.connections-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.connection-item {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		font-size: 0.75rem;
		line-height: 1.3;
	}

	.connection-role {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: var(--font-family-ui);
		white-space: nowrap;
		flex-shrink: 0;
		margin-top: 1px;
		opacity: 0.8;
	}

	.connection-node {
		display: inline-flex;
		align-items: flex-start;
		gap: 4px;
		min-width: 0;
	}

	.connection-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 4px;
	}

	.connection-type-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--color-text-tertiary);
		font-family: var(--font-family-ui);
		flex-shrink: 0;
	}

	.connection-text {
		color: var(--color-text-secondary);
		font-family: var(--font-family-serif);
		font-size: 0.78rem;
		word-break: break-word;
	}

	/* Score Indicator */
	.score-indicator {
		padding: 0 10px 6px 10px;
	}

	.score-bar {
		height: 2px;
		border-radius: 1px;
		background: var(--color-surface-alt);
		overflow: hidden;
	}

	.score-fill {
		height: 100%;
		border-radius: 1px;
		background: var(--node-color);
		opacity: 0.6;
		transition: width 0.3s ease;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.node-card {
			border-left-width: 3px;
		}

		.card-header {
			padding: 6px 8px 0 8px;
		}

		.card-content {
			padding: 4px 8px 6px 8px;
		}

		.node-content {
			font-size: 0.82rem;
		}

		.delete-btn {
			opacity: 0.5;
		}

		.warrant-connections,
		.connections-panel,
		.score-indicator {
			padding-left: 8px;
			padding-right: 8px;
		}
	}
</style>
