<script lang="ts">
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		ArgumentEdgeType,
		StructuralFlag
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS, EDGE_TYPE_CONFIGS } from '$lib/types/argument';

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
	import { slide, fade } from 'svelte/transition';
	import { tick } from 'svelte';
	import {
		X,
		Trash2,
		Edit3,
		Link,
		Plus,
		Star,
		AlertTriangle,
		ShieldAlert,
		Eye,
		HelpCircle,
		Brain,
		Target,
		Sparkles,
		Regex,
		ChevronDown,
		ChevronUp,
		Save,
		Check
	} from '@lucide/svelte';
	import {
		analyzeNodeContent,
		getCategoryColor,
		getCategoryLabel,
		getSeverityColor,
		type RhetoricalAlert
	} from '$lib/utils/rhetoricalAnalysis';
	import { getValidSourceTypesForTarget } from '$lib/utils/argumentUtils';

	interface Props {
		node: ArgumentNode;
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		structuralFlags: StructuralFlag[];
		/** Pixel position for the popover (screen coordinates) */
		x: number;
		y: number;
		/** Container element for bounds clamping */
		containerRect: DOMRect | null;
		onClose: () => void;
		onEdit?: (
			nodeId: string,
			updates: { content?: string; type?: ArgumentNodeType }
		) => Promise<void> | void;
		onDelete?: (nodeId: string) => void;
		onAddEdge?: (fromNodeId: string) => void;
		/** Callback to add a new node connected to this node */
		onAddConnectedNode?: (targetNodeId: string) => void;
		/** Navigate the graph to focus on a specific node */
		onFocusNode?: (nodeId: string) => void;
		isReadOnly?: boolean;
	}

	let {
		node,
		nodes,
		edges,
		structuralFlags,
		x,
		y,
		containerRect,
		onClose,
		onEdit,
		onDelete,
		onAddEdge,
		onAddConnectedNode,
		onFocusNode,
		isReadOnly = false
	}: Props = $props();

	const config = $derived(NODE_TYPE_CONFIGS[node.type]);

	// ── Inline editing state ───────────────────────────────────────
	let editing = $state(false);
	let editContent = $state('');
	let editType = $state<ArgumentNodeType>('claim');
	let saving = $state(false);
	let editTextarea: HTMLTextAreaElement | undefined = $state();

	const editConfig = $derived(NODE_TYPE_CONFIGS[editType]);

	// All node types for the type selector (root claims must stay as claims)
	const allNodeTypes: ArgumentNodeType[] = [
		'claim',
		'evidence',
		'source',
		'warrant',
		'qualifier',
		'counter',
		'rebuttal'
	];
	const allowedNodeTypes = $derived.by(() => {
		if (node.is_root) return ['claim'] as ArgumentNodeType[];
		return allNodeTypes;
	});

	const hasChanges = $derived.by(() => {
		const contentChanged = editContent.trim() !== '' && editContent.trim() !== node.content;
		const typeChanged = editType !== node.type;
		return contentChanged || typeChanged;
	});

	function startEdit(e: Event) {
		e.stopPropagation();
		editContent = node.content;
		editType = node.type;
		editing = true;
		tick().then(() => {
			editTextarea?.focus();
		});
	}

	function cancelEdit(e: Event) {
		e.stopPropagation();
		editing = false;
		editContent = '';
		editType = node.type;
		saving = false;
	}

	async function saveEdit(e: Event) {
		e.stopPropagation();

		const contentChanged = editContent.trim() !== '' && editContent.trim() !== node.content;
		const typeChanged = editType !== node.type;

		if (!contentChanged && !typeChanged) {
			editing = false;
			return;
		}

		saving = true;
		try {
			if (onEdit) {
				const updates: { content?: string; type?: ArgumentNodeType } = {};
				if (contentChanged) updates.content = editContent.trim();
				if (typeChanged) updates.type = editType;
				await onEdit(node.id, updates);
			}
			editing = false;
		} catch {
			// stay in edit mode on error so user doesn't lose changes
		} finally {
			saving = false;
		}
	}

	function handleEditKeydown(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Escape') {
			cancelEdit(e);
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			saveEdit(e);
		}
	}

	// ── Alerts: merge rhetorical + structural ──────────────────────

	const regexAlerts = $derived(analyzeNodeContent(node.content, node.type));

	const nodeFlags = $derived(structuralFlags.filter((f) => f.nodeId === node.id));

	type MergedAlert = {
		id: string;
		label: string;
		description: string;
		severity: 'error' | 'warning' | 'info';
		source: 'regex' | 'structural';
		icon: RhetoricalAlert['icon'] | 'alert-triangle';
	};

	const alerts = $derived.by((): MergedAlert[] => {
		const merged: MergedAlert[] = [];
		const seenLabels = new Set<string>();

		// Structural flags first (most important)
		for (const flag of nodeFlags) {
			const key = `structural::${flag.type}`;
			if (!seenLabels.has(key)) {
				seenLabels.add(key);
				merged.push({
					id: `flag-${flag.type}-${flag.nodeId ?? ''}`,
					label: flag.type.replace(/_/g, ' '),
					description: flag.message,
					severity: flag.severity,
					source: 'structural',
					icon: flag.severity === 'error' ? 'shield-alert' : 'alert-triangle'
				});
			}
		}

		// Rhetorical alerts
		for (const alert of regexAlerts) {
			const key = `regex::${alert.category}::${alert.label.toLowerCase()}`;
			if (!seenLabels.has(key)) {
				seenLabels.add(key);
				merged.push({
					id: alert.id,
					label: alert.label,
					description: alert.description,
					severity: alert.severity,
					source: 'regex',
					icon: alert.icon
				});
			}
		}

		const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
		merged.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));
		return merged;
	});

	let expandedAlertId = $state<string | null>(null);

	function toggleAlert(e: Event, alertId: string) {
		e.stopPropagation();
		expandedAlertId = expandedAlertId === alertId ? null : alertId;
	}

	function getAlertIcon(icon: MergedAlert['icon']) {
		switch (icon) {
			case 'alert-triangle':
				return AlertTriangle;
			case 'shield-alert':
				return ShieldAlert;
			case 'eye':
				return Eye;
			case 'help-circle':
				return HelpCircle;
			case 'brain':
				return Brain;
			case 'target':
				return Target;
			default:
				return AlertTriangle;
		}
	}

	// ── Connections summary ────────────────────────────────────────

	const connectionCount = $derived(
		edges.filter((e) => e.from_node === node.id || e.to_node === node.id).length
	);

	const connections = $derived.by(() => {
		const result: Array<{
			node: ArgumentNode;
			role: string;
			direction: 'incoming' | 'outgoing';
			edgeType: string;
			edgeColor: string;
		}> = [];

		for (const edge of edges) {
			if (edge.from_node === node.id) {
				const edgeConfig = EDGE_TYPE_CONFIGS[edge.type];
				const targetNode = nodes.find((n) => n.id === edge.to_node);
				if (targetNode) {
					result.push({
						node: targetNode,
						role: edgeConfig?.label ?? edge.type,
						direction: 'outgoing',
						edgeType: edge.type,
						edgeColor: getEdgeColor(edge.type)
					});
				}
			}
			if (edge.to_node === node.id) {
				const sourceNode = nodes.find((n) => n.id === edge.from_node);
				const edgeConfig = EDGE_TYPE_CONFIGS[edge.type];
				if (sourceNode) {
					result.push({
						node: sourceNode,
						role: edgeConfig?.label ?? edge.type,
						direction: 'incoming',
						edgeType: edge.type,
						edgeColor: getEdgeColor(edge.type)
					});
				}
			}
		}
		return result;
	});

	let showConnections = $state(true);

	let expandedConnections = $state<Set<string>>(new Set());

	function toggleConnectionExpanded(nodeId: string) {
		const next = new Set(expandedConnections);
		if (next.has(nodeId)) {
			next.delete(nodeId);
		} else {
			next.add(nodeId);
		}
		expandedConnections = next;
	}

	// ── Positioning ────────────────────────────────────────────────

	const POPOVER_WIDTH = 320;
	const POPOVER_MAX_HEIGHT = 420;
	const MARGIN = 12;

	const popoverStyle = $derived.by(() => {
		let left = x - POPOVER_WIDTH / 2;
		let top = y + MARGIN;

		if (containerRect) {
			// Clamp horizontal
			if (left < containerRect.left + MARGIN) {
				left = containerRect.left + MARGIN;
			}
			if (left + POPOVER_WIDTH > containerRect.right - MARGIN) {
				left = containerRect.right - MARGIN - POPOVER_WIDTH;
			}
			// If popover would go below container, flip above
			if (top + POPOVER_MAX_HEIGHT > containerRect.bottom - MARGIN) {
				top = y - POPOVER_MAX_HEIGHT - MARGIN;
			}
			// Clamp top
			if (top < containerRect.top + MARGIN) {
				top = containerRect.top + MARGIN;
			}
		}

		return `left:${left}px;top:${top}px;width:${POPOVER_WIDTH}px;max-height:${POPOVER_MAX_HEIGHT}px`;
	});

	// ── Helpers ─────────────────────────────────────────────────────

	function handleFocusNode(nodeId: string) {
		if (onFocusNode) {
			onFocusNode(nodeId);
		}
	}

	function handleDelete(e: Event) {
		e.stopPropagation();
		if (onDelete) {
			onDelete(node.id);
		}
	}

	function handleConnect(e: Event) {
		e.stopPropagation();
		if (onAddEdge) {
			onAddEdge(node.id);
		}
	}

	function handleAddConnectedNode(e: Event) {
		e.stopPropagation();
		if (onAddConnectedNode) {
			onAddConnectedNode(node.id);
		}
	}

	/** Node types that can be created and connected to this node */
	const canReceiveNewNodes = $derived(getValidSourceTypesForTarget(node.type).length > 0);

	function handleBackdropClick(e: Event) {
		e.stopPropagation();
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (editing) {
				cancelEdit(e);
			} else {
				onClose();
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Invisible backdrop to catch outside clicks -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="popover-backdrop" onclick={handleBackdropClick}></div>

<!-- Popover -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="graph-node-popover"
	style={popoverStyle}
	transition:fade={{ duration: 120 }}
	role="dialog"
	tabindex="-1"
	aria-label="Node details: {config.label}"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			if (editing) {
				cancelEdit(e);
			} else {
				onClose();
			}
		}
	}}
>
	<!-- Header -->
	<header class="popover-header">
		<div
			class="popover-type-badge"
			style="--badge-color: {editing ? editConfig.color : config.color}"
		>
			{#if editing}
				<span class="popover-type-dot" style="background: {editConfig.color}"></span>
				{#if allowedNodeTypes.length > 1}
					<select
						class="popover-type-select"
						bind:value={editType}
						onclick={(e) => e.stopPropagation()}
						style="color: {editConfig.color}"
					>
						{#each allowedNodeTypes as nt}
							<option value={nt} style="color: {NODE_TYPE_CONFIGS[nt].color}">
								{NODE_TYPE_CONFIGS[nt].label}
							</option>
						{/each}
					</select>
				{:else}
					<span class="popover-type-label">{editConfig.label}</span>
				{/if}
			{:else}
				<span class="popover-type-dot"></span>
				<span class="popover-type-label">{config.label}</span>
			{/if}
			{#if node.is_root}
				<span class="popover-root-badge">
					<Star size={10} />
					Root
				</span>
			{/if}
			{#if node.implied}
				<span class="popover-implied-badge">implied</span>
			{/if}
		</div>
		<button class="popover-close" onclick={onClose} title="Close" aria-label="Close">
			<X size={14} />
		</button>
	</header>

	<!-- Content -->
	<div class="popover-body">
		{#if editing}
			<textarea
				class="popover-edit-textarea"
				bind:value={editContent}
				bind:this={editTextarea}
				onkeydown={handleEditKeydown}
				onclick={(e) => e.stopPropagation()}
				disabled={saving}
				rows="3"
				placeholder={editConfig.placeholder}
			></textarea>
			{#if saving}
				<p class="popover-edit-hint saving">Saving...</p>
			{:else}
				<p class="popover-edit-hint">
					<kbd>⌘</kbd>+<kbd>Enter</kbd> save · <kbd>Esc</kbd> cancel
					{#if hasChanges}
						<span class="popover-changes-indicator">· unsaved</span>
					{/if}
				</p>
			{/if}
		{:else}
			<p class="popover-content">{node.content}</p>
		{/if}
	</div>

	<!-- Alerts -->
	{#if alerts.length > 0}
		<div class="popover-alerts" transition:slide={{ duration: 120 }}>
			<div class="alert-pills">
				{#each alerts as alert (alert.id)}
					{@const AlertIcon = getAlertIcon(alert.icon)}
					<button
						class="alert-pill"
						class:expanded={expandedAlertId === alert.id}
						class:error={alert.severity === 'error'}
						class:warning={alert.severity === 'warning'}
						class:info={alert.severity === 'info'}
						onclick={(e) => toggleAlert(e, alert.id)}
						title={alert.description}
					>
						<AlertIcon size={11} />
						<span class="alert-pill-label">{alert.label}</span>
					</button>
				{/each}
			</div>
			{#if expandedAlertId}
				{@const expanded_alert = alerts.find((a) => a.id === expandedAlertId)}
				{#if expanded_alert}
					<div
						class="alert-detail"
						class:error={expanded_alert.severity === 'error'}
						class:warning={expanded_alert.severity === 'warning'}
						transition:slide={{ duration: 120 }}
					>
						<p class="alert-detail-desc">{expanded_alert.description}</p>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Connections -->
	{#if connectionCount > 0}
		<button
			class="popover-connections-toggle"
			onclick={(e) => {
				e.stopPropagation();
				showConnections = !showConnections;
			}}
		>
			<Link size={12} />
			<span>{connectionCount} connection{connectionCount !== 1 ? 's' : ''}</span>
			{#if showConnections}
				<ChevronUp size={12} />
			{:else}
				<ChevronDown size={12} />
			{/if}
		</button>
		{#if showConnections}
			<ul class="popover-connections" transition:slide={{ duration: 150 }}>
				{#each connections as conn}
					{@const isExpanded = expandedConnections.has(conn.node.id)}
					<li class="popover-connection-item" class:expanded={isExpanded}>
						<div class="conn-header">
							<button
								class="conn-expand-toggle"
								onclick={(e) => {
									e.stopPropagation();
									toggleConnectionExpanded(conn.node.id);
								}}
								title={isExpanded ? 'Collapse' : 'Expand'}
							>
								{#if isExpanded}
									<ChevronUp size={10} />
								{:else}
									<ChevronDown size={10} />
								{/if}
							</button>
							<span class="conn-role" style="color: {conn.edgeColor}">
								{conn.direction === 'outgoing' ? '→' : '←'}
								{conn.role}
							</span>
							<span class="conn-node-preview">
								<span
									class="conn-dot"
									style="background: {NODE_TYPE_CONFIGS[conn.node.type]?.color ?? '#666'}"
								></span>
								<span
									class="conn-type-label"
									style="color: {NODE_TYPE_CONFIGS[conn.node.type]?.color ?? '#666'}"
									>{NODE_TYPE_CONFIGS[conn.node.type]?.label ?? conn.node.type}</span
								>
								{#if !isExpanded}
									<span class="conn-text-truncated"
										>{conn.node.content.length > 60
											? conn.node.content.slice(0, 60) + '…'
											: conn.node.content}</span
									>
								{/if}
							</span>
							<button
								class="conn-view-btn"
								onclick={(e) => {
									e.stopPropagation();
									handleFocusNode(conn.node.id);
								}}
								title="Open this node"
							>
								<Eye size={11} />
							</button>
						</div>
						{#if isExpanded}
							<div class="conn-expanded-content" transition:slide={{ duration: 120 }}>
								<p class="conn-full-text">{conn.node.content}</p>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<!-- Actions -->
	{#if !isReadOnly || (onAddConnectedNode && canReceiveNewNodes)}
		<footer class="popover-actions">
			{#if editing}
				<button
					class="popover-action-btn save"
					onclick={saveEdit}
					disabled={saving || !hasChanges}
					title="Save changes"
				>
					<Check size={13} />
					{saving ? 'Saving...' : 'Save'}
				</button>
				<button
					class="popover-action-btn cancel"
					onclick={cancelEdit}
					disabled={saving}
					title="Cancel editing"
				>
					<X size={13} />
					Cancel
				</button>
			{:else}
				{#if onEdit && !isReadOnly}
					<button class="popover-action-btn edit" onclick={startEdit} title="Edit node">
						<Edit3 size={13} />
						Edit
					</button>
				{/if}
				{#if onAddConnectedNode && canReceiveNewNodes}
					<button
						class="popover-action-btn add-node"
						onclick={handleAddConnectedNode}
						title="Add connected node"
					>
						<Plus size={13} />
						Add Node
					</button>
				{/if}
				{#if onAddEdge && !isReadOnly}
					<button class="popover-action-btn connect" onclick={handleConnect} title="Connect">
						<Link size={13} />
						Connect
					</button>
				{/if}
				{#if onDelete && !node.is_root && !isReadOnly}
					<button class="popover-action-btn delete" onclick={handleDelete} title="Delete node">
						<Trash2 size={13} />
						Delete
					</button>
				{/if}
			{/if}
		</footer>
	{/if}
</div>

<style>
	.popover-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.graph-node-popover {
		position: fixed;
		z-index: 100;
		background: #ffffff;
		border: 1px solid var(--color-border, #333);
		border-radius: var(--border-radius-lg, 10px);
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.4),
			0 2px 8px rgba(0, 0, 0, 0.2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--font-family-ui, sans-serif);
	}

	/* ── Header ───────────────────────────────── */

	.popover-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.625rem;
		border-bottom: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.popover-type-badge {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.popover-type-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--badge-color);
		flex-shrink: 0;
	}

	.popover-type-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--badge-color);
	}

	.popover-root-badge {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 1px 5px;
		border-radius: var(--border-radius-full, 999px);
		background: color-mix(in srgb, var(--badge-color) 12%, transparent);
		color: var(--badge-color);
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.popover-implied-badge {
		font-size: 0.6rem;
		font-style: italic;
		color: var(--color-text-tertiary, #607d8b);
	}

	.popover-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--border-radius-sm, 4px);
		color: var(--color-text-tertiary, #607d8b);
		cursor: pointer;
		transition: all 0.12s ease;
		flex-shrink: 0;
	}

	.popover-close:hover {
		color: var(--color-text-primary, #eceff1);
		background: var(--color-surface-alt, #2a2a3a);
		border-color: var(--color-border, #333);
	}

	/* ── Body ─────────────────────────────────── */

	.popover-body {
		padding: 0.5rem 0.625rem;
		overflow-y: auto;
		flex: 1 1 auto;
		min-height: 0;
	}

	.popover-content {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-serif, serif);
		word-break: normal;
		overflow-wrap: break-word;
	}

	/* ── Inline Edit ───────────────────────────── */

	.popover-type-select {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		background: none;
		border: 1px solid var(--color-border, #444);
		border-radius: var(--border-radius-sm, 4px);
		padding: 1px 4px;
		cursor: pointer;
		font-family: var(--font-family-ui, sans-serif);
		outline: none;
		transition: border-color 0.12s ease;
	}

	.popover-type-select:hover {
		border-color: var(--color-text-tertiary, #607d8b);
	}

	.popover-type-select:focus {
		border-color: var(--color-primary, #6366f1);
		box-shadow: 0 0 0 1px var(--color-primary, #6366f1);
	}

	.popover-type-select option {
		background: var(--color-surface, #1a1a2e);
		font-weight: 600;
	}

	.popover-edit-textarea {
		width: 100%;
		min-height: 60px;
		max-height: 140px;
		padding: 0.4rem 0.5rem;
		background: var(--color-surface-alt, #2a2a3a);
		border: 1px solid var(--color-border, #444);
		border-radius: var(--border-radius-sm, 4px);
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-serif, serif);
		font-size: 0.8rem;
		line-height: 1.5;
		resize: vertical;
		outline: none;
		transition: border-color 0.12s ease;
		box-sizing: border-box;
	}

	.popover-edit-textarea:focus {
		border-color: var(--color-primary, #6366f1);
		box-shadow: 0 0 0 1px var(--color-primary, #6366f1);
	}

	.popover-edit-textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.popover-edit-hint {
		margin: 4px 0 0;
		font-size: 0.62rem;
		color: var(--color-text-tertiary, #607d8b);
	}

	.popover-edit-hint.saving {
		color: var(--color-primary, #6366f1);
		font-style: italic;
	}

	.popover-edit-hint kbd {
		display: inline-block;
		padding: 0px 3px;
		background: var(--color-surface-alt, #2a2a3a);
		border: 1px solid var(--color-border, #444);
		border-radius: 2px;
		font-family: var(--font-family-ui, sans-serif);
		font-size: 0.58rem;
	}

	.popover-changes-indicator {
		color: var(--color-warning, #eab308);
		font-weight: 600;
	}

	/* ── Alerts ────────────────────────────────── */

	.popover-alerts {
		padding: 0.375rem 0.625rem;
		border-top: 1px solid var(--color-border, #333);
	}

	.alert-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.alert-pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 7px;
		background: transparent;
		border: 1px solid var(--color-border, #444);
		border-radius: var(--border-radius-full, 999px);
		color: var(--color-text-tertiary, #888);
		font-size: 0.6rem;
		font-weight: 600;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.12s ease;
		white-space: nowrap;
	}

	.alert-pill:hover {
		background: var(--color-surface-alt, #2a2a3a);
	}

	.alert-pill.expanded {
		background: var(--color-surface-alt, #2a2a3a);
		border-color: currentColor;
	}

	.alert-pill.error {
		color: var(--color-error, #ef4444);
		border-color: color-mix(in srgb, var(--color-error, #ef4444) 30%, transparent);
	}

	.alert-pill.warning {
		color: var(--color-warning, #eab308);
		border-color: color-mix(in srgb, var(--color-warning, #eab308) 30%, transparent);
	}

	.alert-pill.info {
		color: var(--color-info, #3b82f6);
		border-color: color-mix(in srgb, var(--color-info, #3b82f6) 30%, transparent);
	}

	.alert-pill-label {
		text-transform: capitalize;
	}

	.alert-detail {
		margin-top: 6px;
		padding: 6px 8px;
		border-radius: var(--border-radius-sm, 4px);
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.alert-detail.error {
		background: color-mix(in srgb, var(--color-error, #ef4444) 8%, transparent);
		color: var(--color-error, #ef4444);
	}

	.alert-detail.warning {
		background: color-mix(in srgb, var(--color-warning, #eab308) 8%, transparent);
		color: var(--color-warning, #eab308);
	}

	.alert-detail-desc {
		margin: 0;
	}

	/* ── Connections toggle ────────────────────── */

	.popover-connections-toggle {
		display: flex;
		align-items: center;
		gap: 5px;
		width: 100%;
		padding: 0.35rem 0.625rem;
		background: none;
		border: none;
		border-top: 1px solid var(--color-border, #333);
		color: var(--color-text-tertiary, #888);
		font-size: 0.7rem;
		font-weight: 500;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: color 0.12s ease;
	}

	.popover-connections-toggle:hover {
		color: var(--color-text-secondary, #b0bec5);
	}

	.popover-connections {
		list-style: none;
		margin: 0;
		padding: 0 0.625rem 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 200px;
		overflow-y: auto;
	}

	.popover-connection-item {
		display: flex;
		flex-direction: column;
		font-size: 0.68rem;
	}

	.conn-role {
		font-weight: 600;
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.conn-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 3px;
	}

	/* ── Expandable Connections ────────────────── */

	.conn-header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 6px;
		border-radius: var(--border-radius-sm, 4px);
		cursor: default;
		min-width: 0;
	}

	.conn-expand-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		background: none;
		border: 1px solid var(--color-border, #444);
		border-radius: 3px;
		color: var(--color-text-tertiary, #888);
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.12s ease;
	}

	.conn-expand-toggle:hover {
		background: var(--color-surface-alt, #2a2a3a);
		color: var(--color-text-secondary, #b0bec5);
		border-color: var(--color-text-tertiary, #607d8b);
	}

	.conn-node-preview {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		flex: 1;
		overflow: hidden;
	}

	.conn-type-label {
		font-size: 0.58rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.conn-text-truncated {
		font-size: 0.66rem;
		color: var(--color-text-secondary, #b0bec5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.conn-view-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--color-text-tertiary, #888);
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.12s ease;
	}

	.conn-view-btn:hover {
		background: var(--color-surface-alt, #2a2a3a);
		color: var(--color-primary, #6366f1);
		border-color: color-mix(in srgb, var(--color-primary, #6366f1) 40%, transparent);
	}

	.conn-expanded-content {
		padding: 4px 6px 6px 28px;
	}

	.conn-full-text {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-serif, serif);
		word-break: normal;
		overflow-wrap: break-word;
	}

	.popover-connection-item.expanded {
		background: var(--color-surface-alt, rgba(42, 42, 58, 0.5));
		border-radius: var(--border-radius-sm, 4px);
	}

	.popover-connection-item.expanded .conn-header {
		background: none;
	}

	/* ── Actions ───────────────────────────────── */

	.popover-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0.375rem 0.625rem;
		border-top: 1px solid var(--color-border, #333);
	}

	.popover-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background: none;
		border: 1px solid var(--color-border, #444);
		border-radius: var(--border-radius-sm, 4px);
		color: var(--color-text-secondary, #b0bec5);
		font-size: 0.7rem;
		font-weight: 500;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.popover-action-btn:hover {
		background: var(--color-surface-alt, #2a2a3a);
		border-color: var(--color-text-tertiary, #607d8b);
		color: var(--color-text-primary, #eceff1);
	}

	.popover-action-btn.delete:hover {
		color: var(--color-error, #ef4444);
		border-color: color-mix(in srgb, var(--color-error, #ef4444) 40%, transparent);
		background: color-mix(in srgb, var(--color-error, #ef4444) 6%, transparent);
	}

	.popover-action-btn.edit:hover {
		color: var(--color-primary, #6366f1);
		border-color: color-mix(in srgb, var(--color-primary, #6366f1) 40%, transparent);
	}

	.popover-action-btn.connect:hover {
		color: #4bc4e8;
		border-color: color-mix(in srgb, #4bc4e8 40%, transparent);
	}

	.popover-action-btn.add-node {
		color: #4ade80;
		border-color: color-mix(in srgb, #4ade80 30%, transparent);
	}

	.popover-action-btn.add-node:hover {
		color: #4ade80;
		border-color: color-mix(in srgb, #4ade80 50%, transparent);
		background: color-mix(in srgb, #4ade80 8%, transparent);
	}

	.popover-action-btn.save {
		color: #4ade80;
		border-color: color-mix(in srgb, #4ade80 40%, transparent);
	}

	.popover-action-btn.save:hover:not(:disabled) {
		background: color-mix(in srgb, #4ade80 10%, transparent);
		border-color: #4ade80;
	}

	.popover-action-btn.save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.popover-action-btn.cancel:hover {
		color: var(--color-text-primary, #eceff1);
	}

	.popover-action-btn.cancel:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Responsive ────────────────────────────── */

	:global([data-theme='dark']) .graph-node-popover {
		background: #1e1e2e;
	}

	@media (max-width: 640px) {
		.graph-node-popover {
			/* On small screens, use near-full width */
			left: 8px !important;
			right: 8px !important;
			width: auto !important;
			max-width: calc(100vw - 16px);
		}
	}
</style>
