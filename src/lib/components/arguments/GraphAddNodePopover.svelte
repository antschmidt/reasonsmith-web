<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { ADD_NODE, ADD_WARRANT_NODE } from '$lib/graphql/queries';
	import type { ArgumentNode, ArgumentEdge, ArgumentNodeType } from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import {
		getValidTargetNodes,
		getDefaultEdgeType,
		getEvidenceNodes,
		getClaimNodes
	} from '$lib/utils/argumentUtils';
	import { fly, fade } from 'svelte/transition';
	import { X, AlertCircle } from '@lucide/svelte';

	interface Props {
		argumentId: string;
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		x: number;
		y: number;
		containerRect: DOMRect | null;
		onClose: () => void;
		onNodeAdded: (event: { node: ArgumentNode; edges: ArgumentEdge[] }) => void;
		isSharedGraph?: boolean;
	}

	let {
		argumentId,
		nodes,
		edges,
		x,
		y,
		containerRect,
		onClose,
		onNodeAdded,
		isSharedGraph = false
	}: Props = $props();

	// ── Form state ──────────────────────────────────────────────────
	let selectedType = $state<ArgumentNodeType | null>(null);
	let content = $state('');
	let connectToNodeId = $state<string | null>(null);
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Warrant-specific state
	let drawsFromNodeId = $state<string | null>(null);
	let justifiesNodeId = $state<string | null>(null);

	// All available node types
	const nodeTypes: ArgumentNodeType[] = [
		'claim',
		'evidence',
		'source',
		'warrant',
		'qualifier',
		'counter',
		'rebuttal'
	];

	// ── Derived state ───────────────────────────────────────────────
	const isWarrant = $derived(selectedType === 'warrant');
	const currentConfig = $derived(selectedType ? NODE_TYPE_CONFIGS[selectedType] : null);

	const targetNodes = $derived(
		selectedType && !isWarrant ? getValidTargetNodes(selectedType, nodes) : []
	);

	const evidenceNodes = $derived(getEvidenceNodes(nodes));
	const claimNodes = $derived(getClaimNodes(nodes));

	const edgeType = $derived.by(() => {
		if (!selectedType || isWarrant) return null;
		if (!connectToNodeId) return null;
		const targetNode = nodes.find((n) => n.id === connectToNodeId);
		if (!targetNode) return null;
		return getDefaultEdgeType(selectedType, targetNode.type);
	});

	const canSubmit = $derived.by(() => {
		if (!selectedType || !content.trim()) return false;
		if (isWarrant) {
			return !!drawsFromNodeId && !!justifiesNodeId;
		}
		if (selectedType === 'source') return true;
		return !!connectToNodeId;
	});

	const warrantErrors = $derived.by(() => {
		if (!isWarrant) return [];
		const errors: string[] = [];
		if (evidenceNodes.length === 0) {
			errors.push('Add at least one evidence node first.');
		}
		if (claimNodes.length === 0) {
			errors.push('Add at least one claim node first.');
		}
		return errors;
	});

	const warrantBlocked = $derived(isWarrant && warrantErrors.length > 0);

	// ── Positioning ─────────────────────────────────────────────────
	const POPOVER_WIDTH = 320;
	const POPOVER_MAX_HEIGHT = 440;
	const MARGIN = 12;

	const popoverStyle = $derived.by(() => {
		let left = x - POPOVER_WIDTH / 2;
		let top = y + MARGIN;

		if (containerRect) {
			if (left < containerRect.left + MARGIN) {
				left = containerRect.left + MARGIN;
			}
			if (left + POPOVER_WIDTH > containerRect.right - MARGIN) {
				left = containerRect.right - MARGIN - POPOVER_WIDTH;
			}
			if (top + POPOVER_MAX_HEIGHT > containerRect.bottom - MARGIN) {
				top = y - POPOVER_MAX_HEIGHT - MARGIN;
			}
			if (top < containerRect.top + MARGIN) {
				top = containerRect.top + MARGIN;
			}
		}

		return `left:${left}px;top:${top}px;width:${POPOVER_WIDTH}px;max-height:${POPOVER_MAX_HEIGHT}px`;
	});

	// ── Helpers ──────────────────────────────────────────────────────
	function selectType(type: ArgumentNodeType) {
		selectedType = type;
		content = '';
		connectToNodeId = null;
		drawsFromNodeId = null;
		justifiesNodeId = null;
		error = null;
	}

	function truncateNodeLabel(node: ArgumentNode, maxLen: number = 40): string {
		const prefix = NODE_TYPE_CONFIGS[node.type]?.label || node.type;
		const text =
			node.content.length > maxLen ? node.content.slice(0, maxLen - 3) + '...' : node.content;
		return `${prefix}: ${text}`;
	}

	// ── Submit ──────────────────────────────────────────────────────
	async function handleSubmit() {
		if (!canSubmit || saving) return;

		saving = true;
		error = null;

		try {
			if (isWarrant) {
				const result = await nhost.graphql.request(ADD_WARRANT_NODE, {
					argumentId,
					content: content.trim(),
					drawsFromNodeId,
					justifiesNodeId,
					isPublished: !isSharedGraph
				});

				if (result.error) {
					const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
					throw new Error(msg || 'Failed to add warrant node');
				}

				const newNode = result.data?.insert_argument_node_one;
				if (newNode) {
					onNodeAdded({ node: newNode, edges: newNode.outgoing_edges || [] });
				}
			} else if (selectedType === 'source') {
				const variables: Record<string, unknown> = {
					argumentId,
					type: selectedType,
					content: content.trim(),
					isPublished: !isSharedGraph
				};

				if (connectToNodeId) {
					variables.connectToNodeId = connectToNodeId;
					variables.edgeType = 'cites';

					const result = await nhost.graphql.request(ADD_NODE, variables);

					if (result.error) {
						const msg = Array.isArray(result.error)
							? result.error[0]?.message
							: result.error.message;
						throw new Error(msg || 'Failed to add node');
					}

					const newNode = result.data?.insert_argument_node_one;
					if (newNode) {
						onNodeAdded({ node: newNode, edges: newNode.outgoing_edges || [] });
					}
				} else {
					const rootNode = nodes.find((n) => n.is_root);
					if (!rootNode) {
						throw new Error('No root claim found');
					}

					variables.connectToNodeId = rootNode.id;
					variables.edgeType = 'supports';

					const result = await nhost.graphql.request(ADD_NODE, variables);

					if (result.error) {
						const msg = Array.isArray(result.error)
							? result.error[0]?.message
							: result.error.message;
						throw new Error(msg || 'Failed to add node');
					}

					const newNode = result.data?.insert_argument_node_one;
					if (newNode) {
						onNodeAdded({ node: newNode, edges: newNode.outgoing_edges || [] });
					}
				}
			} else {
				const result = await nhost.graphql.request(ADD_NODE, {
					argumentId,
					type: selectedType,
					content: content.trim(),
					connectToNodeId,
					edgeType,
					isPublished: !isSharedGraph
				});

				if (result.error) {
					const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
					throw new Error(msg || 'Failed to add node');
				}

				const newNode = result.data?.insert_argument_node_one;
				if (newNode) {
					onNodeAdded({ node: newNode, edges: newNode.outgoing_edges || [] });
				}
			}
		} catch (err: any) {
			error = err.message || 'Failed to add node';
		} finally {
			saving = false;
		}
	}

	function handleBackdropClick(e: Event) {
		e.stopPropagation();
		if (!saving) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !saving) {
			onClose();
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<div
	class="add-node-backdrop"
	onclick={handleBackdropClick}
	onkeydown={(e) => {
		if (e.key === 'Escape' && !saving) onClose();
	}}
	role="presentation"
	transition:fade={{ duration: 100 }}
></div>

<!-- Popover -->
<div
	class="add-node-popover"
	style={popoverStyle}
	transition:fly={{ y: 8, duration: 150 }}
	role="dialog"
	tabindex="-1"
	aria-label="Add node"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => e.stopPropagation()}
>
	<!-- Header -->
	<header class="popover-header">
		<h3 class="popover-title">Add Node</h3>
		<button
			class="popover-close"
			onclick={onClose}
			disabled={saving}
			title="Close"
			aria-label="Close"
		>
			<X size={14} />
		</button>
	</header>

	<!-- Body -->
	<div class="popover-body">
		{#if error}
			<div class="form-error">
				<AlertCircle size={12} />
				<span>{error}</span>
			</div>
		{/if}

		<!-- Type selector -->
		<div class="form-section">
			<div class="type-chips">
				{#each nodeTypes as type (type)}
					{@const config = NODE_TYPE_CONFIGS[type]}
					<button
						class="type-chip"
						class:active={selectedType === type}
						style="--chip-color: {config.color}; --chip-bg: {config.bgColor}"
						onclick={() => selectType(type)}
						type="button"
					>
						<span class="chip-dot"></span>
						<span class="chip-label">{config.label}</span>
					</button>
				{/each}
			</div>
			{#if currentConfig}
				<p class="type-description">{currentConfig.description}</p>
			{/if}
		</div>

		{#if selectedType}
			<!-- Content textarea -->
			<div class="form-section">
				<label class="section-label" for="add-node-content">Content</label>
				<textarea
					id="add-node-content"
					class="content-textarea"
					bind:value={content}
					placeholder={currentConfig?.placeholder || 'Enter content...'}
					rows="3"
					style="--focus-color: {currentConfig?.color || 'var(--color-primary)'}"
				></textarea>
			</div>

			<!-- Connection selector -->
			{#if isWarrant}
				{#if warrantBlocked}
					<div class="warrant-blocked">
						{#each warrantErrors as err}
							<div class="warrant-error">
								<AlertCircle size={12} />
								<span>{err}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="form-section">
						<label class="section-label" for="add-draws-from">
							<span class="label-badge" style="color: {NODE_TYPE_CONFIGS['evidence'].color}"
								>Draws From</span
							>
							<span class="label-hint">(evidence)</span>
						</label>
						<select
							id="add-draws-from"
							class="node-select"
							bind:value={drawsFromNodeId}
							style="--focus-color: {NODE_TYPE_CONFIGS['evidence'].color}"
						>
							<option value={null}>Select evidence...</option>
							{#each evidenceNodes as node (node.id)}
								<option value={node.id}>{truncateNodeLabel(node)}</option>
							{/each}
						</select>
					</div>

					<div class="form-section">
						<label class="section-label" for="add-justifies">
							<span class="label-badge" style="color: {NODE_TYPE_CONFIGS['claim'].color}"
								>Justifies</span
							>
							<span class="label-hint">(claim)</span>
						</label>
						<select
							id="add-justifies"
							class="node-select"
							bind:value={justifiesNodeId}
							style="--focus-color: {NODE_TYPE_CONFIGS['claim'].color}"
						>
							<option value={null}>Select claim...</option>
							{#each claimNodes as node (node.id)}
								<option value={node.id}>{truncateNodeLabel(node)}</option>
							{/each}
						</select>
					</div>
				{/if}
			{:else if selectedType === 'source'}
				{#if evidenceNodes.length > 0}
					<div class="form-section">
						<label class="section-label" for="add-connect-to">
							Connects To
							{#if connectToNodeId}
								<span class="edge-type-badge">cites</span>
							{/if}
						</label>
						<select
							id="add-connect-to"
							class="node-select"
							bind:value={connectToNodeId}
							style="--focus-color: {currentConfig?.color || 'var(--color-primary)'}"
						>
							<option value={null}>Select evidence (optional)...</option>
							{#each evidenceNodes as node (node.id)}
								<option value={node.id}>{truncateNodeLabel(node)}</option>
							{/each}
						</select>
					</div>
				{/if}
			{:else}
				<div class="form-section">
					<label class="section-label" for="add-connect-to">
						Connects To
						{#if edgeType}
							<span class="edge-type-badge">{edgeType.replace('_', ' ')}</span>
						{/if}
					</label>
					{#if targetNodes.length === 0}
						<p class="no-targets-hint">
							No valid target nodes yet. Add a
							{#if selectedType === 'evidence'}claim{:else if selectedType === 'rebuttal'}counter-argument{:else}node{/if}
							first.
						</p>
					{:else}
						<select
							id="add-connect-to"
							class="node-select"
							bind:value={connectToNodeId}
							style="--focus-color: {currentConfig?.color || 'var(--color-primary)'}"
						>
							<option value={null}>Select a node...</option>
							{#each targetNodes as node (node.id)}
								<option value={node.id}>{truncateNodeLabel(node)}</option>
							{/each}
						</select>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Footer -->
	<footer class="popover-footer">
		<button class="cancel-btn" onclick={onClose} disabled={saving} type="button">Cancel</button>
		<button
			class="submit-btn"
			onclick={handleSubmit}
			disabled={!canSubmit || saving || warrantBlocked}
			type="button"
			style="--submit-color: {currentConfig?.color || 'var(--color-primary)'}"
		>
			{#if saving}
				<span class="btn-spinner"></span>
				Adding...
			{:else}
				Add {currentConfig?.label || 'Node'}
			{/if}
		</button>
	</footer>
</div>

<style>
	/* ── Backdrop ──────────────────────────────── */

	.add-node-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	/* ── Popover container ────────────────────── */

	.add-node-popover {
		position: fixed;
		z-index: 100;
		background: #ffffff;
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.4),
			0 2px 8px rgba(0, 0, 0, 0.2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--font-family-ui, sans-serif);
	}

	:global([data-theme='dark']) .add-node-popover {
		background: #1e1e2e;
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

	.popover-title {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-ui, sans-serif);
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
		border-radius: 4px;
		color: var(--color-text-tertiary, #607d8b);
		cursor: pointer;
		transition: all 0.12s ease;
		flex-shrink: 0;
	}

	.popover-close:hover:not(:disabled) {
		color: var(--color-text-primary, #eceff1);
		background: var(--color-surface-alt, #2a2a3a);
		border-color: var(--color-border, #333);
	}

	.popover-close:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Body ─────────────────────────────────── */

	.popover-body {
		flex: 1 1 auto;
		overflow-y: auto;
		padding: 0.5rem 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 0;
	}

	/* ── Form error ───────────────────────────── */

	.form-error {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 5px 8px;
		background: color-mix(in srgb, var(--color-error, #ef4444) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-error, #ef4444) 25%, transparent);
		border-radius: 4px;
		color: var(--color-error, #ef4444);
		font-size: 0.68rem;
		line-height: 1.4;
	}

	/* ── Form sections ────────────────────────── */

	.form-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.section-label {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary, #b0bec5);
		font-family: var(--font-family-ui, sans-serif);
	}

	.label-badge {
		font-weight: 800;
	}

	.label-hint {
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		color: var(--color-text-tertiary, #607d8b);
		font-size: 0.58rem;
	}

	.edge-type-badge {
		display: inline-block;
		padding: 0px 5px;
		border-radius: 999px;
		background: var(--color-surface-alt, #2a2a3a);
		font-size: 0.54rem;
		font-weight: 600;
		text-transform: lowercase;
		letter-spacing: normal;
		color: var(--color-text-tertiary, #607d8b);
	}

	/* ── Type chips ───────────────────────────── */

	.type-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.type-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		background: transparent;
		border: 1px solid var(--color-border, #333);
		border-radius: 999px;
		color: var(--color-text-tertiary, #607d8b);
		font-size: 0.62rem;
		font-weight: 500;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.12s ease;
		line-height: 1;
	}

	.type-chip:hover {
		color: var(--chip-color);
		border-color: color-mix(in srgb, var(--chip-color) 35%, transparent);
		background: color-mix(in srgb, var(--chip-color) 5%, transparent);
	}

	.type-chip.active {
		color: var(--chip-color);
		border-color: color-mix(in srgb, var(--chip-color) 50%, transparent);
		background: color-mix(in srgb, var(--chip-color) 10%, transparent);
		font-weight: 700;
	}

	.chip-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--chip-color);
		opacity: 0.4;
		transition: opacity 0.12s ease;
	}

	.type-chip.active .chip-dot,
	.type-chip:hover .chip-dot {
		opacity: 1;
	}

	.chip-label {
		line-height: 1;
	}

	.type-description {
		margin: 0;
		font-size: 0.62rem;
		color: var(--color-text-tertiary, #607d8b);
		line-height: 1.3;
		font-style: italic;
	}

	/* ── Content textarea ─────────────────────── */

	.content-textarea {
		width: 100%;
		padding: 6px 8px;
		background: var(--color-surface-alt, #2a2a3a);
		border: 1px solid var(--color-border, #444);
		border-radius: 4px;
		font-family: var(--font-family-serif, serif);
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--color-text-primary, #eceff1);
		resize: vertical;
		min-height: 54px;
		max-height: 120px;
		transition: border-color 0.12s ease;
		box-sizing: border-box;
		outline: none;
	}

	.content-textarea:focus {
		border-color: var(--focus-color, var(--color-primary, #6366f1));
		box-shadow: 0 0 0 1px var(--focus-color, var(--color-primary, #6366f1));
	}

	.content-textarea::placeholder {
		color: var(--color-text-tertiary, #607d8b);
		font-style: italic;
		opacity: 0.7;
	}

	/* ── Node select ──────────────────────────── */

	.node-select {
		width: 100%;
		padding: 5px 8px;
		background: var(--color-surface-alt, #2a2a3a);
		border: 1px solid var(--color-border, #444);
		border-radius: 4px;
		font-family: var(--font-family-ui, sans-serif);
		font-size: 0.7rem;
		color: var(--color-text-primary, #eceff1);
		cursor: pointer;
		transition: border-color 0.12s ease;
		appearance: auto;
		box-sizing: border-box;
		outline: none;
	}

	.node-select:focus {
		border-color: var(--focus-color, var(--color-primary, #6366f1));
		box-shadow: 0 0 0 1px var(--focus-color, var(--color-primary, #6366f1));
	}

	/* ── No targets hint ──────────────────────── */

	.no-targets-hint {
		margin: 0;
		padding: 5px 8px;
		font-size: 0.68rem;
		color: var(--color-text-tertiary, #607d8b);
		font-style: italic;
		background: var(--color-surface-alt, #2a2a3a);
		border-radius: 4px;
		border: 1px dashed var(--color-border, #444);
		line-height: 1.4;
	}

	/* ── Warrant blocked ──────────────────────── */

	.warrant-blocked {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.warrant-error {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 5px 8px;
		background: color-mix(in srgb, var(--color-warning, #eab308) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning, #eab308) 25%, transparent);
		border-radius: 4px;
		color: var(--color-warning, #eab308);
		font-size: 0.68rem;
		line-height: 1.4;
	}

	/* ── Footer ───────────────────────────────── */

	.popover-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		padding: 0.375rem 0.625rem;
		border-top: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.cancel-btn {
		padding: 4px 10px;
		background: transparent;
		border: 1px solid var(--color-border, #444);
		border-radius: 4px;
		color: var(--color-text-secondary, #b0bec5);
		font-size: 0.68rem;
		font-weight: 500;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.cancel-btn:hover:not(:disabled) {
		background: var(--color-surface-alt, #2a2a3a);
		border-color: var(--color-text-tertiary, #607d8b);
		color: var(--color-text-primary, #eceff1);
	}

	.cancel-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.submit-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		background: color-mix(in srgb, var(--submit-color) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--submit-color) 40%, transparent);
		border-radius: 4px;
		color: var(--submit-color, var(--color-primary, #6366f1));
		font-size: 0.68rem;
		font-weight: 600;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.submit-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--submit-color) 20%, transparent);
		border-color: color-mix(in srgb, var(--submit-color) 60%, transparent);
	}

	.submit-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-spinner {
		display: inline-block;
		width: 10px;
		height: 10px;
		border: 1.5px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Responsive ────────────────────────────── */

	@media (max-width: 640px) {
		.add-node-popover {
			left: 8px !important;
			right: 8px !important;
			width: auto !important;
			max-width: calc(100vw - 16px);
		}
	}
</style>
