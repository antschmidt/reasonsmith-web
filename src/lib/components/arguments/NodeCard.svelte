<script lang="ts">
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		ArgumentEdgeType
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS, EDGE_TYPE_CONFIGS } from '$lib/types/argument';
	import { slide } from 'svelte/transition';
	import {
		ChevronDown,
		ChevronUp,
		Trash2,
		Link,
		Star,
		Edit3,
		Save,
		X,
		AlertTriangle,
		ShieldAlert,
		Eye,
		HelpCircle,
		Brain,
		Target,
		LoaderCircle,
		Sparkles,
		Regex
	} from '@lucide/svelte';
	import {
		analyzeNodeContent,
		getCategoryColor,
		getCategoryLabel,
		getSeverityColor,
		type RhetoricalAlert
	} from '$lib/utils/rhetoricalAnalysis';
	import type {
		AIAnalysisState,
		AIAnalysisAlert,
		AIAnalysisResult
	} from '$lib/utils/aiRhetoricalAnalysis';
	import { getQualityColor } from '$lib/utils/aiRhetoricalAnalysis';

	interface Props {
		node: ArgumentNode;
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		isSelected: boolean;
		connectionCount: number;
		onSelect: () => void;
		onDelete: () => void;
		onEdit?: (
			nodeId: string,
			updates: { content?: string; type?: ArgumentNodeType }
		) => Promise<void> | void;
		onEditEdge?: (edgeId: string, updates: { type?: ArgumentEdgeType }) => Promise<void> | void;
		/** AI analysis state for this node, managed by the parent */
		aiAnalysis?: AIAnalysisState;
	}

	let {
		node,
		nodes,
		edges,
		isSelected,
		connectionCount,
		onSelect,
		onDelete,
		onEdit,
		onEditEdge,
		aiAnalysis
	}: Props = $props();

	let expanded = $state(false);
	let editing = $state(false);
	let editContent = $state('');
	let editType = $state<ArgumentNodeType>('claim');
	let saving = $state(false);

	// Track edge type edits: edgeId -> new type
	let edgeTypeEdits = $state<Map<string, ArgumentEdgeType>>(new Map());
	let savingEdgeId = $state<string | null>(null);

	const config = $derived(NODE_TYPE_CONFIGS[node.type]);

	const allNodeTypes = Object.keys(NODE_TYPE_CONFIGS) as ArgumentNodeType[];
	const allEdgeTypes = Object.keys(EDGE_TYPE_CONFIGS) as ArgumentEdgeType[];

	// Regex-based rhetorical analysis (instant, local)
	const regexAlerts = $derived(analyzeNodeContent(node.content, node.type));

	// AI-powered rhetorical analysis (async, from parent)
	const aiAlerts = $derived<AIAnalysisAlert[]>(
		aiAnalysis?.status === 'done' && aiAnalysis.result ? aiAnalysis.result.alerts : []
	);
	const aiQuality = $derived<AIAnalysisResult['overallQuality'] | null>(
		aiAnalysis?.status === 'done' && aiAnalysis.result ? aiAnalysis.result.overallQuality : null
	);
	const aiSuggestion = $derived<string | null>(
		aiAnalysis?.status === 'done' && aiAnalysis.result?.suggestion
			? aiAnalysis.result.suggestion
			: null
	);
	const aiPending = $derived(aiAnalysis?.status === 'pending');

	// Merge regex + AI alerts, deduplicating by category+label similarity
	type MergedAlert = (RhetoricalAlert | AIAnalysisAlert) & { source: 'regex' | 'ai' };
	const alerts = $derived.by((): MergedAlert[] => {
		const merged: MergedAlert[] = [];
		const seenLabels = new Set<string>();

		// AI alerts take priority (more nuanced)
		for (const alert of aiAlerts) {
			const key = `${alert.category}::${alert.label.toLowerCase()}`;
			seenLabels.add(key);
			merged.push({ ...alert, source: 'ai' });
		}

		// Add regex alerts that don't overlap with AI alerts
		for (const alert of regexAlerts) {
			const key = `${alert.category}::${alert.label.toLowerCase()}`;
			if (!seenLabels.has(key)) {
				merged.push({ ...alert, source: 'regex' });
			}
		}

		// Sort by severity: error > warning > info
		const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
		merged.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

		return merged;
	});

	let expandedAlertId = $state<string | null>(null);

	function toggleAlert(e: Event, alertId: string) {
		e.stopPropagation();
		expandedAlertId = expandedAlertId === alertId ? null : alertId;
	}

	function getAlertIcon(icon: RhetoricalAlert['icon']) {
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

	// Get connected nodes with their role labels
	const connections = $derived.by(() => {
		const result: Array<{
			node: ArgumentNode;
			edge: ArgumentEdge;
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
						edge,
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
						edge,
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

	function startEdit(e: Event) {
		e.stopPropagation();
		editContent = node.content;
		editType = node.type;
		edgeTypeEdits = new Map();
		editing = true;
		// Auto-expand connections when editing so edge types are visible
		if (connectionCount > 0) {
			expanded = true;
		}
	}

	function cancelEdit(e: Event) {
		e.stopPropagation();
		editing = false;
		editContent = '';
		editType = node.type;
		edgeTypeEdits = new Map();
		saving = false;
	}

	async function saveEdit(e: Event) {
		e.stopPropagation();

		const contentChanged = editContent.trim() && editContent.trim() !== node.content;
		const typeChanged = editType !== node.type;
		const hasEdgeChanges = edgeTypeEdits.size > 0;

		if (!contentChanged && !typeChanged && !hasEdgeChanges) {
			editing = false;
			return;
		}

		saving = true;
		try {
			// Save node changes (content and/or type)
			if ((contentChanged || typeChanged) && onEdit) {
				const updates: { content?: string; type?: ArgumentNodeType } = {};
				if (contentChanged) updates.content = editContent.trim();
				if (typeChanged) updates.type = editType;
				await onEdit(node.id, updates);
			}

			// Save edge type changes
			if (hasEdgeChanges && onEditEdge) {
				for (const [edgeId, newType] of edgeTypeEdits) {
					savingEdgeId = edgeId;
					await onEditEdge(edgeId, { type: newType });
				}
				savingEdgeId = null;
			}

			editing = false;
			edgeTypeEdits = new Map();
		} catch {
			// stay in edit mode on error so user doesn't lose their changes
		} finally {
			saving = false;
			savingEdgeId = null;
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

	function handleEdgeTypeChange(edgeId: string, currentType: ArgumentEdgeType, newType: string) {
		const typed = newType as ArgumentEdgeType;
		if (typed === currentType) {
			// Reverted to original — remove from edits
			const next = new Map(edgeTypeEdits);
			next.delete(edgeId);
			edgeTypeEdits = next;
		} else {
			edgeTypeEdits = new Map(edgeTypeEdits).set(edgeId, typed);
		}
	}

	function getEffectiveEdgeType(edge: ArgumentEdge): ArgumentEdgeType {
		return edgeTypeEdits.get(edge.id) ?? edge.type;
	}

	function truncate(text: string, maxLength: number = 60): string {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 3) + '...';
	}

	// Determine which types this node can be changed to
	// Root claims must stay as claims
	const allowedNodeTypes = $derived.by(() => {
		if (node.is_root) return ['claim'] as ArgumentNodeType[];
		return allNodeTypes;
	});

	const editConfig = $derived(NODE_TYPE_CONFIGS[editType]);
	const hasChanges = $derived.by(() => {
		const contentChanged = editContent.trim() !== '' && editContent.trim() !== node.content;
		const typeChanged = editType !== node.type;
		const hasEdgeChanges = edgeTypeEdits.size > 0;
		return contentChanged || typeChanged || hasEdgeChanges;
	});
</script>

<article
	class="node-card"
	class:selected={isSelected}
	class:is-root={node.is_root}
	class:implied={node.implied}
	class:editing
	style="--node-color: {editing ? editConfig.color : config.color}; --node-bg: {editing
		? editConfig.bgColor
		: config.bgColor}"
	onclick={editing ? undefined : onSelect}
	onkeydown={(e) => !editing && e.key === 'Enter' && onSelect()}
	role="button"
	tabindex="0"
	aria-expanded={expanded}
	aria-label="{config.label}: {truncate(node.content)}"
>
	<!-- Card Header -->
	<header class="card-header">
		<div class="type-badge">
			{#if editing}
				<span class="type-dot" aria-hidden="true"></span>
				{#if allowedNodeTypes.length > 1}
					<select
						class="type-select"
						bind:value={editType}
						onclick={(e) => e.stopPropagation()}
						disabled={saving}
						style="color: {editConfig.color}"
					>
						{#each allowedNodeTypes as nt}
							<option value={nt} style="color: {NODE_TYPE_CONFIGS[nt].color}">
								{NODE_TYPE_CONFIGS[nt].label}
							</option>
						{/each}
					</select>
				{:else}
					<span class="type-label">{editConfig.label}</span>
				{/if}
			{:else}
				<span class="type-dot" aria-hidden="true"></span>
				<span class="type-label">{config.label}</span>
			{/if}
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
			{#if editing}
				<button
					class="action-btn save-btn"
					onclick={saveEdit}
					disabled={saving || !editContent.trim()}
					title="Save (⌘+Enter)"
					aria-label="Save edit"
				>
					<Save size={13} />
				</button>
				<button
					class="action-btn cancel-btn"
					onclick={cancelEdit}
					disabled={saving}
					title="Cancel (Esc)"
					aria-label="Cancel edit"
				>
					<X size={13} />
				</button>
			{:else}
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

				{#if onEdit}
					<button class="edit-btn" onclick={startEdit} title="Edit node" aria-label="Edit node">
						<Edit3 size={13} />
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
			{/if}
		</div>
	</header>

	<!-- Content -->
	<div class="card-content">
		{#if editing}
			<textarea
				class="edit-textarea"
				bind:value={editContent}
				onkeydown={handleEditKeydown}
				onclick={(e) => e.stopPropagation()}
				disabled={saving}
				rows="3"
				placeholder={editConfig.placeholder}
			></textarea>
			{#if saving}
				<p class="edit-hint saving">Saving...</p>
			{:else}
				<p class="edit-hint">
					<kbd>⌘</kbd>+<kbd>Enter</kbd> to save · <kbd>Esc</kbd> to cancel
					{#if hasChanges}
						<span class="changes-indicator">· unsaved changes</span>
					{/if}
				</p>
			{/if}
		{:else}
			<p class="node-content">{node.content}</p>
		{/if}
	</div>

	<!-- AI Analysis Status + Quality Badge -->
	{#if !editing && (aiPending || aiQuality)}
		<div class="ai-status-bar">
			{#if aiPending}
				<span class="ai-status-pending">
					<LoaderCircle size={11} class="spin-icon" />
					<span>Analyzing…</span>
				</span>
			{:else if aiQuality}
				<span class="ai-quality-badge" style="color: {getQualityColor(aiQuality)}">
					<Sparkles size={11} />
					<span>{aiQuality}</span>
				</span>
				{#if aiSuggestion}
					<span class="ai-suggestion">{aiSuggestion}</span>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Rhetorical Alerts (merged regex + AI) -->
	{#if !editing && alerts.length > 0}
		<div class="alerts-section" transition:slide={{ duration: 150 }}>
			<div class="alerts-pills">
				{#each alerts as alert (alert.id)}
					<button
						class="alert-pill"
						class:expanded={expandedAlertId === alert.id}
						class:ai-source={alert.source === 'ai'}
						style="--alert-color: {getCategoryColor(
							alert.category
						)}; --severity-color: {getSeverityColor(alert.severity)}"
						onclick={(e) => toggleAlert(e, alert.id)}
						title={alert.description}
					>
						{#if alert.source === 'ai'}
							<Sparkles size={10} />
						{:else}
							<svelte:component this={getAlertIcon(alert.icon)} size={11} />
						{/if}
						<span class="alert-pill-label">{alert.label}</span>
					</button>
				{/each}
			</div>
			{#if expandedAlertId}
				{@const expanded_alert = alerts.find((a) => a.id === expandedAlertId)}
				{#if expanded_alert}
					<div
						class="alert-detail"
						style="--alert-color: {getCategoryColor(expanded_alert.category)}"
						transition:slide={{ duration: 150 }}
					>
						<div class="alert-detail-header">
							<span
								class="alert-category-badge"
								style="color: {getCategoryColor(expanded_alert.category)}"
							>
								{getCategoryLabel(expanded_alert.category)}
							</span>
							<span
								class="alert-severity-badge"
								style="color: {getSeverityColor(expanded_alert.severity)}"
							>
								{expanded_alert.severity}
							</span>
							<span class="alert-source-badge" class:ai={expanded_alert.source === 'ai'}>
								{#if expanded_alert.source === 'ai'}
									<Sparkles size={9} /> AI
								{:else}
									<Regex size={9} /> Pattern
								{/if}
							</span>
						</div>
						<p class="alert-detail-desc">{expanded_alert.description}</p>
						<p class="alert-detail-explain">{expanded_alert.explanation}</p>
						{#if expanded_alert.matchedText}
							<p class="alert-matched">
								<span class="alert-matched-label">Matched:</span>
								<span class="alert-matched-text">"{expanded_alert.matchedText}"</span>
							</p>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Warrant Special Display -->
	{#if !editing && node.type === 'warrant' && (warrantDrawsFrom || warrantJustifies)}
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

	<!-- Expanded Connections / Edge Editing -->
	{#if expanded && connections.length > 0}
		<div class="connections-panel" transition:slide={{ duration: 200 }}>
			<div class="connections-divider"></div>
			{#if editing}
				<p class="connections-edit-label">Connections</p>
			{/if}
			<ul class="connections-list">
				{#each connections as conn}
					<li class="connection-item" class:editing-edge={editing}>
						{#if editing && onEditEdge}
							<!-- Editable edge type -->
							<select
								class="edge-type-select"
								value={getEffectiveEdgeType(conn.edge)}
								onchange={(e) => {
									const select = e.currentTarget;
									handleEdgeTypeChange(conn.edge.id, conn.edge.type, select.value);
								}}
								onclick={(e) => e.stopPropagation()}
								disabled={saving && savingEdgeId === conn.edge.id}
								style="color: {NODE_TYPE_CONFIGS[conn.node.type]?.color || '#888'}"
							>
								{#each allEdgeTypes as et}
									<option value={et}>
										{conn.direction === 'outgoing'
											? EDGE_TYPE_CONFIGS[et].fromLabel
											: EDGE_TYPE_CONFIGS[et].toLabel}
									</option>
								{/each}
							</select>
							{#if edgeTypeEdits.has(conn.edge.id)}
								<span class="edge-changed-dot" title="Changed"></span>
							{/if}
						{:else}
							<span class="connection-role" style="color: {conn.edgeColor}">
								{conn.role}
							</span>
						{/if}
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
	{#if !editing && node.score !== null && node.score !== undefined}
		<div class="score-indicator" title="Confidence score: {node.score.toFixed(2)}">
			<div class="score-bar">
				<div class="score-fill" style="width: {Math.round(node.score * 100)}%"></div>
			</div>
		</div>
	{/if}
</article>

<style>
	/* AI status bar */
	.ai-status-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		font-size: 0.68rem;
		border-top: 1px solid color-mix(in srgb, var(--node-color, #888) 12%, transparent);
	}

	.ai-status-pending {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #8b8b8b;
		font-style: italic;
	}

	.ai-status-pending :global(.spin-icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.ai-quality-badge {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-weight: 600;
		text-transform: capitalize;
	}

	.ai-suggestion {
		color: #8b8b8b;
		font-style: italic;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Alert source badges */
	.alert-source-badge {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 0.6rem;
		padding: 1px 5px;
		border-radius: 3px;
		background: color-mix(in srgb, #8b8b8b 15%, transparent);
		color: #8b8b8b;
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.03em;
	}

	.alert-source-badge.ai {
		background: color-mix(in srgb, #b44be8 15%, transparent);
		color: #b44be8;
	}

	/* AI-sourced alert pills get a subtle sparkle border */
	.alert-pill.ai-source {
		border-style: dashed;
	}

	.node-card {
		background: var(--node-bg, var(--color-surface));
		border: 1px solid color-mix(in srgb, var(--node-color) 20%, var(--color-border));
		border-radius: var(--border-radius-md, 8px);
		padding: 0;
		cursor: pointer;
		transition: all var(--transition-base, 0.2s) ease;
		position: relative;
		overflow: hidden;
	}

	.node-card:hover {
		border-color: color-mix(in srgb, var(--node-color) 40%, var(--color-border));
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.node-card.selected {
		border-color: var(--node-color);
		box-shadow:
			0 0 0 1px var(--node-color),
			0 2px 12px color-mix(in srgb, var(--node-color) 15%, transparent);
	}

	.node-card.editing {
		border-color: var(--node-color);
		box-shadow:
			0 0 0 1px var(--node-color),
			0 4px 16px color-mix(in srgb, var(--node-color) 20%, transparent);
		cursor: default;
	}

	.node-card.is-root {
		border-left: 3px solid var(--node-color);
	}

	.node-card.implied {
		border-style: dashed;
		opacity: 0.85;
	}

	/* Header */
	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm, 8px);
		padding: var(--space-xs, 6px) var(--space-sm, 10px);
	}

	.type-badge {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.type-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--node-color);
		flex-shrink: 0;
		box-shadow: 0 0 4px color-mix(in srgb, var(--node-color) 40%, transparent);
	}

	.type-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--node-color);
		font-family: var(--font-family-ui, sans-serif);
	}

	.type-select {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-family: var(--font-family-ui, sans-serif);
		background: color-mix(in srgb, var(--node-color) 8%, var(--color-surface, #1a1a1a));
		border: 1px solid color-mix(in srgb, var(--node-color) 30%, var(--color-border));
		border-radius: var(--border-radius-sm, 4px);
		padding: 3px 6px;
		cursor: pointer;
		transition: border-color var(--transition-fast, 0.1s) ease;
		-webkit-appearance: none;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2390a4ae'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 4px center;
		padding-right: 18px;
	}

	.type-select:hover {
		border-color: var(--node-color);
	}

	.type-select:focus {
		outline: none;
		border-color: var(--node-color);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--node-color) 30%, transparent);
	}

	.type-select option {
		background: var(--color-surface, #1a1a1a);
		color: var(--color-text-primary, #eceff1);
		font-weight: 600;
	}

	.root-badge {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #e8b84b;
		background: color-mix(in srgb, #e8b84b 10%, transparent);
		border: 1px solid color-mix(in srgb, #e8b84b 25%, transparent);
		padding: 1px 6px;
		border-radius: 10px;
		font-family: var(--font-family-ui, sans-serif);
		line-height: 1.4;
	}

	.implied-badge {
		font-size: 0.6rem;
		font-style: italic;
		color: var(--color-text-tertiary, #607d8b);
		font-family: var(--font-family-ui, sans-serif);
		letter-spacing: 0.03em;
		padding: 1px 5px;
		background: color-mix(in srgb, var(--color-text-tertiary, #607d8b) 8%, transparent);
		border-radius: 8px;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.expand-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		background: none;
		border: 1px solid transparent;
		color: var(--color-text-tertiary, #607d8b);
		cursor: pointer;
		padding: 3px 6px;
		border-radius: var(--border-radius-sm, 4px);
		font-size: 0.7rem;
		font-family: var(--font-family-ui, sans-serif);
		transition: all var(--transition-fast, 0.1s) ease;
	}

	.expand-btn:hover {
		color: var(--color-text-primary, #eceff1);
		background: color-mix(in srgb, var(--node-color) 8%, transparent);
		border-color: color-mix(in srgb, var(--node-color) 20%, transparent);
	}

	.connection-count {
		font-weight: 600;
	}

	.edit-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		background: none;
		border: 1px solid transparent;
		color: var(--color-text-tertiary, #607d8b);
		cursor: pointer;
		border-radius: var(--border-radius-sm, 4px);
		transition: all var(--transition-fast, 0.1s) ease;
		opacity: 0;
	}

	.edit-btn:hover {
		color: var(--color-primary, #cfe0e8);
		background: color-mix(in srgb, var(--color-primary, #cfe0e8) 8%, transparent);
		border-color: color-mix(in srgb, var(--color-primary, #cfe0e8) 20%, transparent);
		opacity: 1;
	}

	.delete-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		background: none;
		border: 1px solid transparent;
		color: var(--color-text-tertiary, #607d8b);
		cursor: pointer;
		border-radius: var(--border-radius-sm, 4px);
		transition: all var(--transition-fast, 0.1s) ease;
		opacity: 0;
	}

	.node-card:hover .delete-btn {
		opacity: 0.6;
	}

	.delete-btn:hover {
		color: var(--color-error, #e84b4b);
		border-color: color-mix(in srgb, var(--color-error, #e84b4b) 30%, transparent);
		opacity: 1;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		background: none;
		border: 1px solid transparent;
		cursor: pointer;
		border-radius: var(--border-radius-sm, 4px);
		transition: all var(--transition-fast, 0.1s) ease;
	}

	.save-btn {
		color: var(--color-success, #4be87a);
		border-color: color-mix(in srgb, var(--color-success, #4be87a) 30%, transparent);
	}

	.save-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-success, #4be87a) 10%, transparent);
		border-color: var(--color-success, #4be87a);
	}

	.save-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.cancel-btn {
		color: var(--color-text-tertiary, #607d8b);
	}

	.cancel-btn:hover:not(:disabled) {
		color: var(--color-text-primary, #eceff1);
		background: color-mix(in srgb, var(--color-text-tertiary) 10%, transparent);
	}

	.cancel-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Content */
	.card-content {
		padding: 0 var(--space-sm, 10px) var(--space-xs, 6px);
	}

	/* Rhetorical Alerts */
	.alerts-section {
		padding: 0 var(--space-sm, 10px) var(--space-xs, 6px);
	}

	.alerts-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.alert-pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, var(--alert-color) 30%, transparent);
		background: color-mix(in srgb, var(--alert-color) 8%, transparent);
		color: var(--alert-color);
		font-size: 0.6rem;
		font-weight: 600;
		font-family: var(--font-family-ui, sans-serif);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition: all var(--transition-fast, 0.1s) ease;
		line-height: 1.4;
	}

	.alert-pill:hover {
		background: color-mix(in srgb, var(--alert-color) 15%, transparent);
		border-color: color-mix(in srgb, var(--alert-color) 50%, transparent);
	}

	.alert-pill.expanded {
		background: color-mix(in srgb, var(--alert-color) 15%, transparent);
		border-color: var(--alert-color);
	}

	.alert-pill-label {
		white-space: nowrap;
	}

	.alert-detail {
		margin-top: 6px;
		padding: 8px 10px;
		background: color-mix(in srgb, var(--alert-color) 5%, var(--color-surface, #1a1a1a));
		border: 1px solid color-mix(in srgb, var(--alert-color) 20%, var(--color-border));
		border-radius: var(--border-radius-sm, 4px);
	}

	.alert-detail-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.alert-category-badge {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-family: var(--font-family-ui, sans-serif);
	}

	.alert-severity-badge {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-family: var(--font-family-ui, sans-serif);
		opacity: 0.7;
	}

	.alert-detail-desc {
		margin: 0 0 6px 0;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-ui, sans-serif);
		line-height: 1.4;
	}

	.alert-detail-explain {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-text-secondary, #90a4ae);
		font-family: var(--font-family-serif, serif);
		line-height: 1.55;
	}

	.alert-matched {
		margin: 6px 0 0 0;
		font-size: 0.7rem;
		color: var(--color-text-tertiary, #607d8b);
		font-family: var(--font-family-ui, sans-serif);
	}

	.alert-matched-label {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.6rem;
		margin-right: 4px;
	}

	.alert-matched-text {
		font-style: italic;
		color: var(--alert-color);
		font-family: var(--font-family-serif, serif);
		font-size: 0.75rem;
	}

	.node-content {
		font-family: var(--font-family-serif, serif);
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-text-primary, #eceff1);
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	/* Edit mode */
	.edit-textarea {
		width: 100%;
		padding: var(--space-xs, 6px) var(--space-sm, 10px);
		background: color-mix(in srgb, var(--node-color) 5%, var(--color-surface, #1a1a1a));
		border: 1px solid color-mix(in srgb, var(--node-color) 25%, var(--color-border));
		border-radius: var(--border-radius-sm, 4px);
		font-family: var(--font-family-serif, serif);
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-text-primary, #eceff1);
		resize: vertical;
		min-height: 60px;
		transition: border-color var(--transition-fast, 0.1s) ease;
		box-sizing: border-box;
	}

	.edit-textarea:focus {
		outline: none;
		border-color: var(--node-color);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--node-color) 20%, transparent);
	}

	.edit-textarea:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.edit-hint {
		font-size: 0.7rem;
		color: var(--color-text-tertiary, #607d8b);
		margin: 4px 0 0 0;
		font-family: var(--font-family-ui, sans-serif);
	}

	.edit-hint.saving {
		color: var(--node-color);
		animation: pulse 1s ease-in-out infinite;
	}

	.edit-hint kbd {
		display: inline-block;
		padding: 0 4px;
		background: color-mix(in srgb, var(--color-text-tertiary) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-text-tertiary) 25%, transparent);
		border-radius: 3px;
		font-size: 0.65rem;
		font-family: var(--font-family-ui, sans-serif);
		line-height: 1.6;
		vertical-align: baseline;
	}

	.changes-indicator {
		color: var(--node-color);
		font-weight: 600;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
	}

	/* Warrant connections */
	.warrant-connections {
		padding: var(--space-xs, 6px) var(--space-sm, 10px);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.warrant-link {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.warrant-label {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--label-color, var(--color-text-tertiary));
		font-family: var(--font-family-ui, sans-serif);
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.warrant-label::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--label-color, var(--color-text-tertiary));
		opacity: 0.6;
	}

	.warrant-target {
		display: flex;
		align-items: baseline;
		gap: 4px;
		padding-left: 10px;
		color: var(--color-text-secondary, #90a4ae);
		font-family: var(--font-family-serif, serif);
		font-size: 0.8rem;
	}

	.target-dot {
		display: inline-block;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex-shrink: 0;
		position: relative;
		top: -1px;
	}

	/* Connections panel */
	.connections-panel {
		padding: 0 var(--space-sm, 10px) var(--space-xs, 6px);
	}

	.connections-divider {
		height: 1px;
		background: var(--color-border, rgba(255, 255, 255, 0.08));
		margin-bottom: var(--space-xs, 6px);
	}

	.connections-edit-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary, #607d8b);
		margin: 0 0 4px 0;
		font-family: var(--font-family-ui, sans-serif);
	}

	.connections-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.connection-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.connection-item.editing-edge {
		gap: 8px;
	}

	.connection-role {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		flex-shrink: 0;
		min-width: 60px;
		font-family: var(--font-family-ui, sans-serif);
		white-space: nowrap;
	}

	.edge-type-select {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-family: var(--font-family-ui, sans-serif);
		background: color-mix(in srgb, var(--color-primary, #cfe0e8) 5%, var(--color-surface, #1a1a1a));
		border: 1px solid color-mix(in srgb, var(--color-primary, #cfe0e8) 25%, var(--color-border));
		border-radius: var(--border-radius-sm, 4px);
		padding: 2px 4px;
		padding-right: 16px;
		cursor: pointer;
		flex-shrink: 0;
		min-width: 80px;
		transition: border-color var(--transition-fast, 0.1s) ease;
		-webkit-appearance: none;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%2390a4ae'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 4px center;
		color: var(--color-text-secondary, #90a4ae);
	}

	.edge-type-select:hover {
		border-color: var(--color-primary, #cfe0e8);
	}

	.edge-type-select:focus {
		outline: none;
		border-color: var(--color-primary, #cfe0e8);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary, #cfe0e8) 20%, transparent);
	}

	.edge-type-select option {
		background: var(--color-surface, #1a1a1a);
		color: var(--color-text-primary, #eceff1);
		font-weight: 600;
		text-transform: none;
	}

	.edge-changed-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-primary, #cfe0e8);
		flex-shrink: 0;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.connection-node {
		display: flex;
		align-items: baseline;
		gap: 4px;
		min-width: 0;
	}

	.connection-dot {
		display: inline-block;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex-shrink: 0;
		position: relative;
		top: -1px;
	}

	.connection-type-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--color-text-tertiary, #607d8b);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.connection-text {
		color: var(--color-text-secondary, #90a4ae);
		font-family: var(--font-family-serif, serif);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Score indicator */
	.score-indicator {
		padding: 0 var(--space-sm, 10px) var(--space-xs, 6px);
	}

	.score-bar {
		height: 3px;
		background: color-mix(in srgb, var(--node-color) 15%, transparent);
		border-radius: 2px;
		overflow: hidden;
	}

	.score-fill {
		height: 100%;
		background: var(--node-color);
		border-radius: 2px;
		transition: width var(--transition-base, 0.2s) ease;
	}

	/* Hover state for edit/delete buttons */
	.node-card:hover .edit-btn {
		opacity: 0.6;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.node-card {
			border-radius: var(--border-radius-sm, 4px);
		}

		.card-header {
			padding: var(--space-xs, 6px);
		}

		.card-content {
			padding: 0 var(--space-xs, 6px) var(--space-xs, 6px);
		}

		.node-content {
			font-size: 0.85rem;
		}

		.edit-btn {
			opacity: 0.6;
		}

		.delete-btn {
			opacity: 0.6;
		}

		.warrant-connections,
		.connections-panel,
		.score-indicator {
			padding-left: var(--space-xs, 6px);
			padding-right: var(--space-xs, 6px);
		}
	}
</style>
