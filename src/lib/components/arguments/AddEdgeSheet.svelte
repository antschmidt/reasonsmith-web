<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { ADD_EDGE } from '$lib/graphql/queries';
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		ArgumentEdgeType
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS, EDGE_TYPE_CONFIGS } from '$lib/types/argument';
	import { getDefaultEdgeType } from '$lib/utils/argumentUtils';
	import { fade, slide } from 'svelte/transition';
	import { X, AlertCircle, Link, ChevronDown, Search } from '@lucide/svelte';

	interface Props {
		show: boolean;
		argumentId: string;
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		defaultFromNodeId: string | null;
		defaultToNodeId: string | null;
		onClose: () => void;
		onEdgeAdded: (edge: ArgumentEdge) => void;
		/** Whether this is a shared discussion graph (affects edge publish state) */
		isSharedGraph?: boolean;
	}

	let {
		show,
		argumentId,
		nodes,
		edges,
		defaultFromNodeId,
		defaultToNodeId,
		onClose,
		onEdgeAdded,
		isSharedGraph = false
	}: Props = $props();

	// Form state
	let fromNodeId = $state<string | null>(null);
	let toNodeId = $state<string | null>(null);
	let edgeType = $state<ArgumentEdgeType | null>(null);
	let manualEdgeType = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Dropdown open state
	let fromDropdownOpen = $state(false);
	let toDropdownOpen = $state(false);
	let edgeDropdownOpen = $state(false);
	let fromSearch = $state('');
	let toSearch = $state('');

	// All available edge types
	const edgeTypes: ArgumentEdgeType[] = [
		'supports',
		'contradicts',
		'rebuts',
		'warrants',
		'cites',
		'qualifies',
		'derives_from'
	];

	// Reset form when sheet opens/closes
	$effect(() => {
		if (show) {
			fromNodeId = defaultFromNodeId || null;
			toNodeId = defaultToNodeId || null;
			edgeType = null;
			manualEdgeType = false;
			saving = false;
			error = null;
			fromDropdownOpen = false;
			toDropdownOpen = false;
			edgeDropdownOpen = false;
			fromSearch = '';
			toSearch = '';
		}
	});

	// Auto-populate edge type when from/to nodes change (unless manually overridden)
	$effect(() => {
		if (manualEdgeType) return;
		const fn = nodes.find((n) => n.id === fromNodeId);
		const tn = nodes.find((n) => n.id === toNodeId);
		if (fn && tn) {
			edgeType = getDefaultEdgeType(fn.type, tn.type) as ArgumentEdgeType;
		} else {
			edgeType = null;
		}
	});

	// Derived: resolved from and to nodes
	const fromNode = $derived(nodes.find((n) => n.id === fromNodeId) ?? null);
	const toNode = $derived(nodes.find((n) => n.id === toNodeId) ?? null);

	// Filtered nodes for search
	const filteredFromNodes = $derived.by(() => {
		if (!fromSearch.trim()) return nodes;
		const q = fromSearch.toLowerCase();
		return nodes.filter(
			(n) =>
				n.content.toLowerCase().includes(q) ||
				NODE_TYPE_CONFIGS[n.type].label.toLowerCase().includes(q)
		);
	});

	const filteredToNodes = $derived.by(() => {
		if (!toSearch.trim()) return nodes;
		const q = toSearch.toLowerCase();
		return nodes.filter(
			(n) =>
				n.content.toLowerCase().includes(q) ||
				NODE_TYPE_CONFIGS[n.type].label.toLowerCase().includes(q)
		);
	});

	// Derived: check for duplicate edge (same from, to, and type)
	const duplicateEdge = $derived.by(() => {
		if (!fromNodeId || !toNodeId || !edgeType) return null;
		return (
			edges.find(
				(e) => e.from_node === fromNodeId && e.to_node === toNodeId && e.type === edgeType
			) ?? null
		);
	});

	// Derived: check if from === to
	const isSelfLoop = $derived(fromNodeId !== null && fromNodeId === toNodeId);

	// Validation
	const canSubmit = $derived.by(() => {
		if (!fromNodeId || !toNodeId || !edgeType) return false;
		if (isSelfLoop) return false;
		return true;
	});

	// Edge type config for display
	const currentEdgeConfig = $derived(edgeType ? EDGE_TYPE_CONFIGS[edgeType] : null);

	function truncateContent(content: string, maxLen: number = 60): string {
		return content.length > maxLen ? content.slice(0, maxLen - 3) + '...' : content;
	}

	function selectFromNode(nodeId: string) {
		fromNodeId = nodeId;
		fromDropdownOpen = false;
		fromSearch = '';
	}

	function selectToNode(nodeId: string) {
		toNodeId = nodeId;
		toDropdownOpen = false;
		toSearch = '';
	}

	function selectEdgeType(type: ArgumentEdgeType) {
		edgeType = type;
		manualEdgeType = true;
		edgeDropdownOpen = false;
	}

	function toggleFromDropdown() {
		fromDropdownOpen = !fromDropdownOpen;
		toDropdownOpen = false;
		edgeDropdownOpen = false;
		if (fromDropdownOpen) fromSearch = '';
	}

	function toggleToDropdown() {
		toDropdownOpen = !toDropdownOpen;
		fromDropdownOpen = false;
		edgeDropdownOpen = false;
		if (toDropdownOpen) toSearch = '';
	}

	function toggleEdgeDropdown() {
		edgeDropdownOpen = !edgeDropdownOpen;
		fromDropdownOpen = false;
		toDropdownOpen = false;
	}

	async function handleSubmit() {
		if (!canSubmit || saving) return;

		saving = true;
		error = null;

		try {
			const result = await nhost.graphql.request(ADD_EDGE, {
				argumentId,
				fromNode: fromNodeId,
				toNode: toNodeId,
				type: edgeType,
				confidence: 1.0,
				weight: 1.0,
				metadata: {},
				isPublished: !isSharedGraph
			});

			if ((result as any).error) {
				const err = (result as any).error;
				const msg = Array.isArray(err) ? err[0]?.message : err.message;
				throw new Error(msg || 'Failed to add connection');
			}

			const newEdge = (result as any).data?.insert_argument_edge_one;
			if (newEdge) {
				onEdgeAdded(newEdge);
			}
		} catch (err: any) {
			error = err.message || 'Failed to add connection';
		} finally {
			saving = false;
		}
	}

	function handleOverlayClick() {
		if (!saving) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !saving) {
			if (fromDropdownOpen || toDropdownOpen || edgeDropdownOpen) {
				fromDropdownOpen = false;
				toDropdownOpen = false;
				edgeDropdownOpen = false;
			} else {
				onClose();
			}
		}
	}

	function handleSheetClick(e: MouseEvent) {
		// Close dropdowns when clicking outside them
		const target = e.target as HTMLElement;
		if (!target.closest('.custom-dropdown')) {
			fromDropdownOpen = false;
			toDropdownOpen = false;
			edgeDropdownOpen = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
	<!-- Overlay -->
	<div
		class="sheet-overlay"
		onclick={handleOverlayClick}
		role="presentation"
		transition:fade={{ duration: 200 }}
	></div>

	<!-- Sheet -->
	<div
		class="sheet"
		role="dialog"
		aria-modal="true"
		aria-label="Add connection"
		tabindex="-1"
		transition:fade={{ duration: 200 }}
		onclick={handleSheetClick}
		onkeydown={(e) => {
			if (e.key === 'Escape') onClose();
		}}
	>
		<header class="sheet-header">
			<h2>Add Connection</h2>
			<button class="close-btn" onclick={onClose} disabled={saving} aria-label="Close">
				<X size={20} />
			</button>
		</header>

		<div class="sheet-body">
			{#if error}
				<div class="form-error">
					<AlertCircle size={14} />
					<span>{error}</span>
				</div>
			{/if}

			<!-- From Node -->
			<div class="form-section">
				<span class="section-label">From Node</span>
				<div class="custom-dropdown">
					<button
						class="dropdown-trigger"
						class:has-value={fromNode !== null}
						onclick={toggleFromDropdown}
						disabled={saving}
						type="button"
					>
						{#if fromNode}
							<span class="trigger-dot" style="background: {NODE_TYPE_CONFIGS[fromNode.type].color}"
							></span>
							<span class="trigger-type" style="color: {NODE_TYPE_CONFIGS[fromNode.type].color}">
								{NODE_TYPE_CONFIGS[fromNode.type].label}:
							</span>
							<span class="trigger-content">
								{truncateContent(fromNode.content, 40)}
							</span>
						{:else}
							<span class="trigger-placeholder">Select source node...</span>
						{/if}
						<ChevronDown size={16} class="trigger-chevron {fromDropdownOpen ? 'open' : ''}" />
					</button>

					{#if fromDropdownOpen}
						<div class="dropdown-menu" transition:slide={{ duration: 150 }}>
							<div class="dropdown-search">
								<Search size={14} />
								<input
									type="text"
									bind:value={fromSearch}
									placeholder="Search nodes..."
									class="search-input"
								/>
							</div>
							<div class="dropdown-list">
								{#each filteredFromNodes as node (node.id)}
									{@const config = NODE_TYPE_CONFIGS[node.type]}
									<button
										class="dropdown-item"
										class:selected={fromNodeId === node.id}
										onclick={() => selectFromNode(node.id)}
										type="button"
									>
										<span class="item-dot" style="background: {config.color}"></span>
										<span class="item-type" style="color: {config.color}">
											{config.label}
										</span>
										<span class="item-content">
											{node.content}
										</span>
									</button>
								{:else}
									<div class="dropdown-empty">No matching nodes</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- To Node -->
			<div class="form-section">
				<span class="section-label">To Node</span>
				<div class="custom-dropdown">
					<button
						class="dropdown-trigger"
						class:has-value={toNode !== null}
						onclick={toggleToDropdown}
						disabled={saving}
						type="button"
					>
						{#if toNode}
							<span class="trigger-dot" style="background: {NODE_TYPE_CONFIGS[toNode.type].color}"
							></span>
							<span class="trigger-type" style="color: {NODE_TYPE_CONFIGS[toNode.type].color}">
								{NODE_TYPE_CONFIGS[toNode.type].label}:
							</span>
							<span class="trigger-content">
								{truncateContent(toNode.content, 40)}
							</span>
						{:else}
							<span class="trigger-placeholder">Select target node...</span>
						{/if}
						<ChevronDown size={16} class="trigger-chevron {toDropdownOpen ? 'open' : ''}" />
					</button>

					{#if toDropdownOpen}
						<div class="dropdown-menu" transition:slide={{ duration: 150 }}>
							<div class="dropdown-search">
								<Search size={14} />
								<input
									type="text"
									bind:value={toSearch}
									placeholder="Search nodes..."
									class="search-input"
								/>
							</div>
							<div class="dropdown-list">
								{#each filteredToNodes as node (node.id)}
									{@const config = NODE_TYPE_CONFIGS[node.type]}
									<button
										class="dropdown-item"
										class:selected={toNodeId === node.id}
										onclick={() => selectToNode(node.id)}
										type="button"
									>
										<span class="item-dot" style="background: {config.color}"></span>
										<span class="item-type" style="color: {config.color}">
											{config.label}
										</span>
										<span class="item-content">
											{node.content}
										</span>
									</button>
								{:else}
									<div class="dropdown-empty">No matching nodes</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Self-loop warning -->
			{#if isSelfLoop}
				<div class="form-error">
					<AlertCircle size={14} />
					<span>A node cannot connect to itself. Please select different nodes.</span>
				</div>
			{/if}

			<!-- Edge Type -->
			<div class="form-section">
				<span class="section-label">
					Connection Type
					{#if !manualEdgeType && edgeType}
						<span class="auto-badge">auto</span>
					{/if}
				</span>
				<div class="custom-dropdown">
					<button
						class="dropdown-trigger"
						class:has-value={edgeType !== null}
						onclick={toggleEdgeDropdown}
						disabled={saving}
						type="button"
					>
						{#if edgeType && currentEdgeConfig}
							<span class="trigger-content">{currentEdgeConfig.label}</span>
						{:else}
							<span class="trigger-placeholder">Select connection type...</span>
						{/if}
						<ChevronDown size={16} class="trigger-chevron {edgeDropdownOpen ? 'open' : ''}" />
					</button>

					{#if edgeDropdownOpen}
						<div class="dropdown-menu dropdown-menu-short" transition:slide={{ duration: 150 }}>
							<div class="dropdown-list">
								{#each edgeTypes as type (type)}
									{@const config = EDGE_TYPE_CONFIGS[type]}
									<button
										class="dropdown-item"
										class:selected={edgeType === type}
										onclick={() => selectEdgeType(type)}
										type="button"
									>
										<span class="item-edge-label">{config.label}</span>
										<span class="item-edge-desc">{config.description}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
				{#if currentEdgeConfig}
					<p class="type-description">{currentEdgeConfig.description}</p>
				{/if}
			</div>

			<!-- Duplicate Warning -->
			{#if duplicateEdge}
				<div class="duplicate-warning">
					<AlertCircle size={14} />
					<span>
						A <strong>{EDGE_TYPE_CONFIGS[duplicateEdge.type].label.toLowerCase()}</strong> connection
						already exists between these nodes. You can still add it, but consider whether it's needed.
					</span>
				</div>
			{/if}

			<!-- Visual Preview -->
			{#if fromNode && toNode && edgeType}
				<div class="connection-preview">
					<div class="preview-label">Preview</div>
					<div class="preview-flow">
						<div class="preview-node">
							<span class="preview-dot" style="background: {NODE_TYPE_CONFIGS[fromNode.type].color}"
							></span>
							<span
								class="preview-node-type"
								style="color: {NODE_TYPE_CONFIGS[fromNode.type].color}"
							>
								{NODE_TYPE_CONFIGS[fromNode.type].label}
							</span>
							<span class="preview-node-content">
								{fromNode.content}
							</span>
						</div>
						<div class="preview-edge">
							<div class="preview-edge-line"></div>
							<span class="preview-edge-label">{currentEdgeConfig?.label.toLowerCase()}</span>
							<div class="preview-edge-arrow"></div>
						</div>
						<div class="preview-node">
							<span class="preview-dot" style="background: {NODE_TYPE_CONFIGS[toNode.type].color}"
							></span>
							<span class="preview-node-type" style="color: {NODE_TYPE_CONFIGS[toNode.type].color}">
								{NODE_TYPE_CONFIGS[toNode.type].label}
							</span>
							<span class="preview-node-content">
								{toNode.content}
							</span>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<footer class="sheet-footer">
			<button class="cancel-btn" onclick={onClose} disabled={saving} type="button">Cancel</button>
			<button
				class="submit-btn"
				onclick={handleSubmit}
				disabled={!canSubmit || saving}
				type="button"
				style="--submit-color: var(--color-primary)"
			>
				{#if saving}
					<span class="btn-spinner"></span>
					Adding...
				{:else}
					<Link size={14} />
					Add Connection
				{/if}
			</button>
		</footer>
	</div>
{/if}

<style>
	/* Overlay */
	.sheet-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 900;
		backdrop-filter: blur(2px);
	}

	:global([data-theme='light']) .sheet-overlay {
		background: rgba(255, 255, 255, 0.6);
	}

	/* Sheet */
	.sheet {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 480px;
		max-width: 100vw;
		background: var(--color-surface, #121212);
		border-left: 1px solid var(--color-border, #333);
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
		z-index: 901;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Header */
	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.sheet-header h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		font-family: var(--font-family-display, sans-serif);
		color: var(--color-text-primary, #eceff1);
	}

	.close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--color-text-tertiary, #607d8b);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover:not(:disabled) {
		color: var(--color-text-primary, #eceff1);
		background: var(--color-surface-alt, #1e1e1e);
		border-color: var(--color-border, #333);
	}

	/* Body */
	.sheet-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* Form Error */
	.form-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		background: color-mix(in srgb, var(--color-error, #ef4444) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-error, #ef4444) 25%, transparent);
		border-radius: 6px;
		color: var(--color-error, #ef4444);
		font-size: 0.875rem;
		line-height: 1.4;
	}

	/* Form Sections */
	.form-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.section-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8125rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary, #90a4ae);
		font-family: var(--font-family-ui, sans-serif);
	}

	.auto-badge {
		display: inline-block;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--color-surface-alt, #1e1e1e);
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: lowercase;
		letter-spacing: normal;
		color: var(--color-text-tertiary, #607d8b);
	}

	.type-description {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-tertiary, #607d8b);
		line-height: 1.4;
		font-style: italic;
	}

	/* ── Custom Dropdown ── */
	.custom-dropdown {
		position: relative;
	}

	.dropdown-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 14px;
		background: var(--color-input-bg, #1a1a2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		font-family: var(--font-family-ui, sans-serif);
		font-size: 0.9375rem;
		color: var(--color-text-primary, #eceff1);
		cursor: pointer;
		transition: border-color 0.15s ease;
		text-align: left;
		min-height: 44px;
	}

	.dropdown-trigger:hover:not(:disabled) {
		border-color: var(--color-text-tertiary, #607d8b);
	}

	.dropdown-trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.trigger-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.trigger-type {
		font-weight: 700;
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.trigger-content {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.trigger-placeholder {
		flex: 1;
		color: var(--color-text-tertiary, #607d8b);
	}

	.dropdown-trigger :global(.trigger-chevron) {
		flex-shrink: 0;
		color: var(--color-text-tertiary, #607d8b);
		transition: transform 0.2s ease;
	}

	.dropdown-trigger :global(.trigger-chevron.open) {
		transform: rotate(180deg);
	}

	/* Dropdown Menu */
	.dropdown-menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 50;
		margin-top: 4px;
		background: var(--color-surface, #121212);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.3),
			0 2px 8px rgba(0, 0, 0, 0.2);
		overflow: hidden;
	}

	.dropdown-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--color-border, #333);
		color: var(--color-text-tertiary, #607d8b);
	}

	.search-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		font-family: var(--font-family-ui, sans-serif);
		font-size: 0.9375rem;
		color: var(--color-text-primary, #eceff1);
	}

	.search-input::placeholder {
		color: var(--color-text-tertiary, #607d8b);
	}

	.dropdown-list {
		max-height: 280px;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
		padding: 4px;
	}

	.dropdown-item {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		background: none;
		border: none;
		border-radius: 6px;
		font-family: var(--font-family-ui, sans-serif);
		font-size: 0.9375rem;
		color: var(--color-text-primary, #eceff1);
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
		line-height: 1.4;
	}

	.dropdown-item:hover {
		background: var(--color-surface-alt, #1e1e1e);
	}

	.dropdown-item.selected {
		background: color-mix(in srgb, var(--color-primary, #cfe0e8) 12%, transparent);
	}

	.item-dot {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 4px;
	}

	.item-type {
		font-weight: 700;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.item-content {
		flex: 1;
		min-width: 0;
		color: var(--color-text-secondary, #90a4ae);
		font-size: 0.875rem;
		line-height: 1.45;
		word-break: normal;
		overflow-wrap: break-word;
		white-space: normal;
	}

	.item-edge-label {
		font-weight: 600;
		color: var(--color-text-primary, #eceff1);
		flex-shrink: 0;
	}

	.item-edge-desc {
		flex: 1;
		min-width: 0;
		color: var(--color-text-tertiary, #607d8b);
		font-size: 0.8125rem;
	}

	.dropdown-empty {
		padding: 1rem;
		text-align: center;
		color: var(--color-text-tertiary, #607d8b);
		font-size: 0.875rem;
	}

	.dropdown-menu-short .dropdown-list {
		max-height: 220px;
	}

	/* Duplicate Warning */
	.duplicate-warning {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		background: color-mix(in srgb, var(--color-warning, #f59e0b) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 25%, transparent);
		border-radius: 6px;
		color: var(--color-warning, #f59e0b);
		font-size: 0.875rem;
		line-height: 1.4;
	}

	/* Connection Preview */
	.connection-preview {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 1rem;
		background: var(--color-surface-alt, #1e1e1e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
	}

	.preview-label {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary, #607d8b);
		font-family: var(--font-family-ui, sans-serif);
	}

	.preview-flow {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0;
	}

	.preview-node {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 10px;
		background: var(--color-surface, #121212);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.preview-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.preview-node-type {
		font-weight: 700;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.preview-node-content {
		color: var(--color-text-tertiary, #607d8b);
		font-size: 0.8125rem;
		line-height: 1.4;
		word-break: normal;
		overflow-wrap: break-word;
		white-space: normal;
		flex: 1;
		min-width: 0;
	}

	.preview-edge {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 0;
		padding-left: 20px;
	}

	.preview-edge-line {
		width: 2px;
		height: 8px;
		background: var(--color-border, #333);
		border-radius: 1px;
	}

	.preview-edge-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary, #90a4ae);
		font-family: var(--font-family-ui, sans-serif);
		padding: 2px 10px;
		background: color-mix(in srgb, var(--color-primary, #cfe0e8) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary, #cfe0e8) 20%, transparent);
		border-radius: 999px;
	}

	.preview-edge-arrow {
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-top: 6px solid var(--color-border, #333);
	}

	/* Footer */
	.sheet-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.625rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.cancel-btn {
		padding: 8px 16px;
		background: transparent;
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		color: var(--color-text-secondary, #90a4ae);
		font-size: 0.9375rem;
		font-weight: 500;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cancel-btn:hover:not(:disabled) {
		background: var(--color-surface-alt, #1e1e1e);
		border-color: var(--color-text-tertiary, #607d8b);
		color: var(--color-text-primary, #eceff1);
	}

	.cancel-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.submit-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 20px;
		background: color-mix(
			in srgb,
			var(--submit-color, var(--color-primary, #cfe0e8)) 12%,
			transparent
		);
		border: 1px solid
			color-mix(in srgb, var(--submit-color, var(--color-primary, #cfe0e8)) 40%, transparent);
		border-radius: 6px;
		color: var(--submit-color, var(--color-primary, #cfe0e8));
		font-size: 0.9375rem;
		font-weight: 600;
		font-family: var(--font-family-ui, sans-serif);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.submit-btn:hover:not(:disabled) {
		background: color-mix(
			in srgb,
			var(--submit-color, var(--color-primary, #cfe0e8)) 20%,
			transparent
		);
		border-color: color-mix(
			in srgb,
			var(--submit-color, var(--color-primary, #cfe0e8)) 60%,
			transparent
		);
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
		width: 14px;
		height: 14px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Scrollbar styling for dropdown lists */
	.dropdown-list::-webkit-scrollbar {
		width: 4px;
	}

	.dropdown-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.dropdown-list::-webkit-scrollbar-thumb {
		background: var(--color-border, #333);
		border-radius: 2px;
	}

	.dropdown-list::-webkit-scrollbar-thumb:hover {
		background: var(--color-text-tertiary, #607d8b);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.sheet {
			width: 100vw;
			border-left: none;
		}

		.sheet-header {
			padding: 0.75rem 1rem;
		}

		.sheet-body {
			padding: 0.75rem 1rem;
		}

		.sheet-footer {
			padding: 0.75rem 1rem;
		}

		.dropdown-trigger {
			font-size: 1rem;
			min-height: 48px;
		}

		.dropdown-item {
			padding: 12px;
			font-size: 1rem;
		}

		.dropdown-list {
			max-height: 240px;
		}
	}
</style>
