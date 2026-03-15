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
		show: boolean;
		argumentId: string;
		nodes: ArgumentNode[];
		edges: ArgumentEdge[];
		defaultType: ArgumentNodeType | null;
		onClose: () => void;
		onNodeAdded: (event: { node: ArgumentNode; edges: ArgumentEdge[] }) => void;
	}

	let { show, argumentId, nodes, edges, defaultType, onClose, onNodeAdded }: Props = $props();

	// Form state
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

	// Reset form when sheet opens/closes or defaultType changes
	$effect(() => {
		if (show) {
			selectedType = defaultType || null;
			content = '';
			connectToNodeId = null;
			drawsFromNodeId = null;
			justifiesNodeId = null;
			error = null;
		}
	});

	// Computed values
	const isWarrant = $derived(selectedType === 'warrant');
	const currentConfig = $derived(selectedType ? NODE_TYPE_CONFIGS[selectedType] : null);

	// Target nodes for non-warrant types
	const targetNodes = $derived(selectedType && !isWarrant ? getValidTargetNodes(selectedType, nodes) : []);

	// Evidence and claim nodes for warrant type
	const evidenceNodes = $derived(getEvidenceNodes(nodes));
	const claimNodes = $derived(getClaimNodes(nodes));

	// Determine the edge type based on selected source and target types
	const edgeType = $derived.by(() => {
		if (!selectedType || isWarrant) return null;
		if (!connectToNodeId) return null;
		const targetNode = nodes.find((n) => n.id === connectToNodeId);
		if (!targetNode) return null;
		return getDefaultEdgeType(selectedType, targetNode.type);
	});

	// Validation
	const canSubmit = $derived.by(() => {
		if (!selectedType || !content.trim()) return false;

		if (isWarrant) {
			return !!drawsFromNodeId && !!justifiesNodeId;
		}

		// Source nodes don't need a connection (evidence cites them)
		if (selectedType === 'source') return true;

		return !!connectToNodeId;
	});

	// Warrant validation messages
	const warrantErrors = $derived.by(() => {
		if (!isWarrant) return [];
		const errors: string[] = [];
		if (evidenceNodes.length === 0) {
			errors.push('Add at least one evidence node before creating a warrant.');
		}
		if (claimNodes.length === 0) {
			errors.push('Add at least one claim node before creating a warrant.');
		}
		return errors;
	});

	const warrantBlocked = $derived(isWarrant && warrantErrors.length > 0);

	function selectType(type: ArgumentNodeType) {
		selectedType = type;
		content = '';
		connectToNodeId = null;
		drawsFromNodeId = null;
		justifiesNodeId = null;
		error = null;
	}

	function getPlaceholder(): string {
		if (!currentConfig) return 'Enter content...';
		return currentConfig.placeholder;
	}

	function truncateNodeLabel(node: ArgumentNode, maxLen: number = 50): string {
		const prefix = NODE_TYPE_CONFIGS[node.type]?.label || node.type;
		const text = node.content.length > maxLen ? node.content.slice(0, maxLen - 3) + '...' : node.content;
		return `${prefix}: ${text}`;
	}

	async function handleSubmit() {
		if (!canSubmit || saving) return;

		saving = true;
		error = null;

		try {
			if (isWarrant) {
				// Add warrant node with two connections
				const result = await nhost.graphql.request(ADD_WARRANT_NODE, {
					argumentId,
					content: content.trim(),
					drawsFromNodeId,
					justifiesNodeId
				});

				if (result.error) {
					const msg = Array.isArray(result.error)
						? result.error[0]?.message
						: result.error.message;
					throw new Error(msg || 'Failed to add warrant node');
				}

				const newNode = result.data?.insert_argument_node_one;
				if (newNode) {
					onNodeAdded({
						node: newNode,
						edges: newNode.outgoing_edges || []
					});
				}
			} else if (selectedType === 'source') {
				// Source nodes are added without an edge from them;
				// the evidence node will create a 'cites' edge to the source.
				// We still create an edge from the source to the connected evidence if one is selected.
				const variables: Record<string, unknown> = {
					argumentId,
					type: selectedType,
					content: content.trim()
				};

				if (connectToNodeId) {
					// If user selected an evidence node to connect to, create a cites edge FROM that evidence TO this source
					// But since ADD_NODE creates an edge FROM the new node, we need to handle this differently.
					// For simplicity, we add the source node with a generic connection.
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
						onNodeAdded({
							node: newNode,
							edges: newNode.outgoing_edges || []
						});
					}
				} else {
					// Source with no connection - use a simple insert via ADD_NODE connecting to root claim
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
						onNodeAdded({
							node: newNode,
							edges: newNode.outgoing_edges || []
						});
					}
				}
			} else {
				// Standard node with single edge
				const result = await nhost.graphql.request(ADD_NODE, {
					argumentId,
					type: selectedType,
					content: content.trim(),
					connectToNodeId,
					edgeType
				});

				if (result.error) {
					const msg = Array.isArray(result.error)
						? result.error[0]?.message
						: result.error.message;
					throw new Error(msg || 'Failed to add node');
				}

				const newNode = result.data?.insert_argument_node_one;
				if (newNode) {
					onNodeAdded({
						node: newNode,
						edges: newNode.outgoing_edges || []
					});
				}
			}
		} catch (err: any) {
			error = err.message || 'Failed to add node';
		} finally {
			saving = false;
		}
	}

	function handleOverlayClick() {
		if (!saving) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !saving) {
			onClose();
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
		aria-label="Add node"
		transition:fly={{ x: 300, duration: 300 }}
	>
		<header class="sheet-header">
			<h2>Add Node</h2>
			<button
				class="close-btn"
				onclick={onClose}
				disabled={saving}
				aria-label="Close"
			>
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

			<!-- Type Selector -->
			<fieldset class="form-section">
				<legend class="section-label">Node Type</legend>
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
			</fieldset>

			{#if selectedType}
				<!-- Content Textarea -->
				<div class="form-section">
					<label class="section-label" for="node-content">Content</label>
					<textarea
						id="node-content"
						class="content-textarea"
						bind:value={content}
						placeholder={getPlaceholder()}
						rows="4"
						style="--focus-color: {currentConfig?.color || 'var(--color-primary)'}"
					></textarea>
				</div>

				<!-- Warrant: Two Dropdowns -->
				{#if isWarrant}
					{#if warrantBlocked}
						<div class="warrant-blocked">
							{#each warrantErrors as err}
								<div class="warrant-error">
									<AlertCircle size={14} />
									<span>{err}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="form-section">
							<label class="section-label" for="draws-from">
								<span class="label-badge" style="color: {NODE_TYPE_CONFIGS['evidence'].color}">
									Draws From
								</span>
								<span class="label-hint">(evidence node)</span>
							</label>
							<select
								id="draws-from"
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
							<label class="section-label" for="justifies">
								<span class="label-badge" style="color: {NODE_TYPE_CONFIGS['claim'].color}">
									Justifies
								</span>
								<span class="label-hint">(claim node)</span>
							</label>
							<select
								id="justifies"
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

				<!-- Non-warrant: Single Dropdown -->
				{:else if selectedType !== 'source' || evidenceNodes.length > 0}
					<div class="form-section">
						<label class="section-label" for="connect-to">
							Connects To
							{#if edgeType}
								<span class="edge-type-badge">{edgeType.replace('_', ' ')}</span>
							{/if}
						</label>

						{#if selectedType === 'source'}
							<select
								id="connect-to"
								class="node-select"
								bind:value={connectToNodeId}
								style="--focus-color: {currentConfig?.color || 'var(--color-primary)'}"
							>
								<option value={null}>Select evidence to cite (optional)...</option>
								{#each evidenceNodes as node (node.id)}
									<option value={node.id}>{truncateNodeLabel(node)}</option>
								{/each}
							</select>
						{:else if targetNodes.length === 0}
							<p class="no-targets-message">
								No valid target nodes available. Add a
								{#if selectedType === 'evidence'}claim{:else if selectedType === 'rebuttal'}counter-argument{:else}node{/if}
								first.
							</p>
						{:else}
							<select
								id="connect-to"
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

		<footer class="sheet-footer">
			<button
				class="cancel-btn"
				onclick={onClose}
				disabled={saving}
				type="button"
			>
				Cancel
			</button>
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
		width: 420px;
		max-width: 100vw;
		background: var(--color-surface);
		border-left: 1px solid var(--color-border);
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
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.sheet-header h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		font-family: var(--font-family-display);
		color: var(--color-text-primary);
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
		border-radius: var(--border-radius-sm);
		color: var(--color-text-tertiary);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
	}

	.close-btn:hover:not(:disabled) {
		color: var(--color-text-primary);
		background: var(--color-surface-alt);
		border-color: var(--color-border);
	}

	/* Body */
	.sheet-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	/* Form Error */
	.form-error {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm);
		background: color-mix(in srgb, var(--color-error) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-error);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	/* Form Sections */
	.form-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		border: none;
		padding: 0;
		margin: 0;
	}

	.section-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
		font-family: var(--font-family-ui);
	}

	.label-badge {
		font-weight: 800;
	}

	.label-hint {
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		color: var(--color-text-tertiary);
		font-size: 0.7rem;
	}

	.edge-type-badge {
		display: inline-block;
		padding: 1px 6px;
		border-radius: var(--border-radius-full);
		background: var(--color-surface-alt);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: lowercase;
		letter-spacing: normal;
		color: var(--color-text-tertiary);
	}

	.type-description {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-text-tertiary);
		line-height: 1.4;
		font-style: italic;
	}

	/* Type Chips */
	.type-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.type-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 12px;
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-full);
		color: var(--color-text-tertiary);
		font-size: 0.75rem;
		font-weight: 500;
		font-family: var(--font-family-ui);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
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
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--chip-color);
		opacity: 0.4;
		transition: opacity var(--transition-fast) ease;
	}

	.type-chip.active .chip-dot,
	.type-chip:hover .chip-dot {
		opacity: 1;
	}

	.chip-label {
		line-height: 1;
	}

	/* Content Textarea */
	.content-textarea {
		width: 100%;
		padding: var(--space-sm);
		background: var(--color-input-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		font-family: var(--font-family-serif);
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-text-primary);
		resize: vertical;
		min-height: 80px;
		transition: border-color var(--transition-fast) ease;
		box-sizing: border-box;
	}

	.content-textarea:focus {
		outline: none;
		border-color: var(--focus-color, var(--color-primary));
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-color, var(--color-primary)) 15%, transparent);
	}

	.content-textarea::placeholder {
		color: var(--color-text-tertiary);
		font-style: italic;
		opacity: 0.7;
	}

	/* Node Select */
	.node-select {
		width: 100%;
		padding: var(--space-sm);
		background: var(--color-input-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		font-family: var(--font-family-ui);
		font-size: 0.85rem;
		color: var(--color-text-primary);
		cursor: pointer;
		transition: border-color var(--transition-fast) ease;
		appearance: auto;
		box-sizing: border-box;
	}

	.node-select:focus {
		outline: none;
		border-color: var(--focus-color, var(--color-primary));
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-color, var(--color-primary)) 15%, transparent);
	}

	.no-targets-message {
		margin: 0;
		padding: var(--space-sm);
		font-size: 0.8rem;
		color: var(--color-text-tertiary);
		font-style: italic;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-sm);
		border: 1px dashed var(--color-border);
	}

	/* Warrant Blocked */
	.warrant-blocked {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.warrant-error {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm);
		background: color-mix(in srgb, var(--color-warning) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-warning);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	/* Footer */
	.sheet-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-sm);
		padding: var(--space-md);
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.cancel-btn {
		padding: 8px 16px;
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		font-family: var(--font-family-ui);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
	}

	.cancel-btn:hover:not(:disabled) {
		background: var(--color-surface-alt);
		border-color: var(--color-text-tertiary);
		color: var(--color-text-primary);
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
		background: color-mix(in srgb, var(--submit-color) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--submit-color) 40%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--submit-color, var(--color-primary));
		font-size: 0.85rem;
		font-weight: 600;
		font-family: var(--font-family-ui);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
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

	/* Responsive */
	@media (max-width: 640px) {
		.sheet {
			width: 100vw;
			border-left: none;
		}

		.sheet-header {
			padding: var(--space-sm) var(--space-md);
		}

		.sheet-body {
			padding: var(--space-sm) var(--space-md);
		}

		.sheet-footer {
			padding: var(--space-sm) var(--space-md);
		}

		.type-chips {
			gap: 4px;
		}

		.type-chip {
			padding: 5px 10px;
			font-size: 0.7rem;
		}
	}
</style>
