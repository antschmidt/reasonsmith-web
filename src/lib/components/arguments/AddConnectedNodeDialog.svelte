<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { ADD_NODE, ADD_WARRANT_NODE } from '$lib/graphql/queries';
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		ArgumentEdgeType,
		AddNodeContext
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import {
		getValidSourceTypesForTarget,
		getEdgeTypeForConnection,
		getEvidenceNodes,
		getClaimNodes
	} from '$lib/utils/argumentUtils';
	import { slide, fade } from 'svelte/transition';
	import { X, AlertCircle, Plus, FileEdit, MessageSquarePlus } from '@lucide/svelte';

	interface Props {
		/** Whether the dialog is visible */
		show: boolean;
		/** The argument container ID */
		argumentId: string;
		/** The target node to connect the new node to */
		targetNode: ArgumentNode;
		/** All nodes in the graph */
		nodes: ArgumentNode[];
		/** All edges in the graph */
		edges: ArgumentEdge[];
		/** Context controlling how the node is added */
		context: AddNodeContext;
		/** Whether this is a shared discussion graph */
		isSharedGraph?: boolean;
		/** Close the dialog */
		onClose: () => void;
		/** Called when a node is successfully added */
		onNodeAdded: (event: { node: ArgumentNode; edges: ArgumentEdge[] }) => void;
		/** Called when the owner chooses "Edit discussion" — parent should create a draft and re-open */
		onRequestEditDraft?: () => void;
		/** Called when the owner chooses "New comment" — parent should create a comment draft and re-open */
		onRequestCommentDraft?: () => void;
	}

	let {
		show,
		argumentId,
		targetNode,
		nodes,
		edges,
		context,
		isSharedGraph = false,
		onClose,
		onNodeAdded,
		onRequestEditDraft,
		onRequestCommentDraft
	}: Props = $props();

	// ── Form state ──────────────────────────────────────────────────
	let selectedType = $state<ArgumentNodeType | null>(null);
	let content = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Warrant-specific: which evidence does it draw from, which claim does it justify
	let drawsFromNodeId = $state<string | null>(null);
	let justifiesNodeId = $state<string | null>(null);

	// ── Derived state ───────────────────────────────────────────────

	/** Node types that can be added as connections to the target node */
	const allowedTypes = $derived(getValidSourceTypesForTarget(targetNode.type));

	const isWarrant = $derived(selectedType === 'warrant');
	const currentConfig = $derived(selectedType ? NODE_TYPE_CONFIGS[selectedType] : null);
	const targetConfig = $derived(NODE_TYPE_CONFIGS[targetNode.type]);

	/** For warrant nodes, get available evidence and claim nodes */
	const evidenceNodes = $derived(getEvidenceNodes(nodes));
	const claimNodes = $derived(getClaimNodes(nodes));

	/** Determine the edge type that would be created */
	const connectionInfo = $derived.by(() => {
		if (!selectedType || isWarrant) return null;
		return getEdgeTypeForConnection(selectedType, targetNode.type);
	});

	const canSubmit = $derived.by(() => {
		if (!selectedType || !content.trim()) return false;
		if (isWarrant) {
			return !!drawsFromNodeId && !!justifiesNodeId;
		}
		return true; // Non-warrant types always connect to the target node
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

	// ── Reset form when dialog opens ────────────────────────────────
	$effect(() => {
		if (show) {
			// Auto-select if only one type is allowed
			selectedType = allowedTypes.length === 1 ? allowedTypes[0] : null;
			content = '';
			drawsFromNodeId = null;
			justifiesNodeId = null;
			error = null;
			saving = false;
		}
	});

	// ── Helpers ──────────────────────────────────────────────────────
	function selectType(type: ArgumentNodeType) {
		selectedType = type;
		content = '';
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

		// In shared graphs or comment context, new nodes start unpublished
		const shouldPublish = context.mode === 'draft' && !isSharedGraph;

		try {
			if (isWarrant) {
				const result = await nhost.graphql.request(ADD_WARRANT_NODE, {
					argumentId,
					content: content.trim(),
					drawsFromNodeId,
					justifiesNodeId,
					isPublished: shouldPublish
				});

				if (result.error) {
					const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
					throw new Error(msg || 'Failed to add warrant node');
				}

				const newNode = result.data?.insert_argument_node_one;
				if (newNode) {
					onNodeAdded({ node: newNode, edges: newNode.outgoing_edges || [] });
				}
			} else {
				const edgeType = connectionInfo?.edgeType || 'supports';

				const result = await nhost.graphql.request(ADD_NODE, {
					argumentId,
					type: selectedType,
					content: content.trim(),
					connectToNodeId: targetNode.id,
					edgeType,
					isPublished: shouldPublish
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

	function handleOverlayClick() {
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

{#if show}
	<!-- Backdrop -->
	<div
		class="dialog-backdrop"
		role="presentation"
		onclick={handleOverlayClick}
		transition:fade={{ duration: 120 }}
	></div>

	<!-- Dialog -->
	<div
		class="add-connected-node-dialog"
		role="dialog"
		aria-modal="true"
		aria-label="Add connected node"
		transition:slide={{ duration: 150, axis: 'y' }}
	>
		<header class="dialog-header">
			<div class="dialog-title-row">
				<Plus size={16} />
				<h3 class="dialog-title">
					Add Node to
					<span class="target-label" style="color: {targetConfig.color}">
						{targetConfig.label}
					</span>
				</h3>
			</div>
			<p class="target-preview">
				{targetNode.content.length > 80
					? targetNode.content.slice(0, 77) + '...'
					: targetNode.content}
			</p>
			<button
				class="dialog-close"
				onclick={onClose}
				disabled={saving}
				title="Close"
				aria-label="Close"
			>
				<X size={14} />
			</button>
		</header>

		{#if context.mode === 'choose-owner'}
			<!-- Owner choice: edit discussion or add as comment -->
			<div class="choice-body">
				<p class="choice-description">
					This discussion is published. How would you like to add nodes?
				</p>
				<div class="choice-options">
					{#if onRequestEditDraft}
						<button class="choice-btn edit-choice" onclick={onRequestEditDraft}>
							<div class="choice-icon">
								<FileEdit size={20} />
							</div>
							<div class="choice-text">
								<span class="choice-label">Edit Discussion</span>
								<span class="choice-hint">Creates a draft of the published discussion to edit</span>
							</div>
						</button>
					{/if}
					{#if onRequestCommentDraft}
						<button class="choice-btn comment-choice" onclick={onRequestCommentDraft}>
							<div class="choice-icon">
								<MessageSquarePlus size={20} />
							</div>
							<div class="choice-text">
								<span class="choice-label">New Comment</span>
								<span class="choice-hint"
									>Add nodes as part of a new comment on this discussion</span
								>
							</div>
						</button>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Node creation form -->
			<div class="dialog-body">
				{#if error}
					<div class="form-error" transition:slide={{ duration: 120 }}>
						<AlertCircle size={12} />
						<span>{error}</span>
					</div>
				{/if}

				{#if context.mode === 'comment'}
					<div class="context-badge comment-context" transition:slide={{ duration: 120 }}>
						<MessageSquarePlus size={12} />
						<span>
							{context.commentDraftExists
								? 'Adding to your comment draft'
								: 'Will create a new comment draft'}
						</span>
					</div>
				{/if}

				<!-- Type selection -->
				<div class="form-section">
					<label class="section-label">Node Type</label>
					<div class="type-chips">
						{#each allowedTypes as type (type)}
							{@const config = NODE_TYPE_CONFIGS[type]}
							<button
								class="type-chip"
								class:active={selectedType === type}
								onclick={() => selectType(type)}
								style={selectedType === type
									? `border-color: ${config.color}; background: color-mix(in srgb, ${config.color} 12%, transparent)`
									: ''}
							>
								<span
									class="chip-dot"
									style="background: {config.color}{selectedType === type ? '' : '80'}"
								></span>
								<span class="chip-label">{config.label}</span>
							</button>
						{/each}
					</div>
					{#if currentConfig}
						<p class="type-description">{currentConfig.description}</p>
					{/if}
					{#if connectionInfo}
						<p class="connection-preview" transition:slide={{ duration: 100 }}>
							<span class="connection-arrow">→</span>
							<span class="connection-edge-type" style="color: {targetConfig.color}">
								{connectionInfo.label}
							</span>
							<span class="connection-target">{targetConfig.label}</span>
						</p>
					{/if}
				</div>

				{#if selectedType}
					<!-- Content input -->
					<div class="form-section" transition:slide={{ duration: 120 }}>
						<label class="section-label" for="connected-node-content">Content</label>
						<textarea
							id="connected-node-content"
							class="content-textarea"
							placeholder={currentConfig?.placeholder || 'Enter node content...'}
							bind:value={content}
							rows={3}
							disabled={saving}
						></textarea>
					</div>

					{#if isWarrant}
						<!-- Warrant-specific fields -->
						{#if warrantBlocked}
							<div class="warrant-blocked" transition:slide={{ duration: 120 }}>
								{#each warrantErrors as err}
									<div class="warrant-error">
										<AlertCircle size={12} />
										<span>{err}</span>
									</div>
								{/each}
							</div>
						{:else}
							<div class="form-section" transition:slide={{ duration: 120 }}>
								<label class="section-label" for="connected-draws-from">
									<span class="label-badge" style="color: {NODE_TYPE_CONFIGS['evidence'].color}">
										Draws from (Evidence)
									</span>
									<span class="label-hint">Which evidence does this warrant interpret?</span>
								</label>
								<select
									id="connected-draws-from"
									class="node-select"
									bind:value={drawsFromNodeId}
									disabled={saving}
								>
									<option value={null}>Select evidence node...</option>
									{#each evidenceNodes as node (node.id)}
										<option value={node.id}>{truncateNodeLabel(node)}</option>
									{/each}
								</select>
							</div>

							<div class="form-section" transition:slide={{ duration: 120 }}>
								<label class="section-label" for="connected-justifies">
									<span class="label-badge" style="color: {NODE_TYPE_CONFIGS['claim'].color}">
										Justifies (Claim)
									</span>
									<span class="label-hint">Which claim does this reasoning support?</span>
								</label>
								<select
									id="connected-justifies"
									class="node-select"
									bind:value={justifiesNodeId}
									disabled={saving}
								>
									<option value={null}>Select claim node...</option>
									{#each claimNodes as node (node.id)}
										<option value={node.id}>{truncateNodeLabel(node)}</option>
									{/each}
								</select>
							</div>
						{/if}
					{/if}
				{/if}
			</div>

			<footer class="dialog-footer">
				<button class="cancel-btn" onclick={onClose} disabled={saving} type="button">
					Cancel
				</button>
				<button
					class="submit-btn"
					onclick={handleSubmit}
					disabled={!canSubmit || saving || warrantBlocked}
					type="button"
				>
					{#if saving}
						<span class="btn-spinner"></span>
						Adding...
					{:else}
						<Plus size={14} />
						Add Node
					{/if}
				</button>
			</footer>
		{/if}
	</div>
{/if}

<style>
	/* ── Backdrop ─────────────────────────────────────────────────── */
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 1000;
	}

	/* ── Dialog container ─────────────────────────────────────────── */
	.add-connected-node-dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(420px, calc(100vw - 32px));
		max-height: min(600px, calc(100vh - 64px));
		overflow-y: auto;
		background: var(--color-surface, #1a1a2e);
		border: 1px solid var(--color-border, #333);
		border-radius: var(--border-radius-lg, 12px);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
		z-index: 1001;
		display: flex;
		flex-direction: column;
	}

	:global([data-theme='dark']) .add-connected-node-dialog {
		background: var(--color-surface, #1a1a2e);
	}

	/* ── Header ───────────────────────────────────────────────────── */
	.dialog-header {
		padding: 16px 16px 12px;
		border-bottom: 1px solid var(--color-border, #333);
		position: relative;
	}

	.dialog-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--color-text-primary, #eceff1);
	}

	.dialog-title {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0;
		color: var(--color-text-primary, #eceff1);
	}

	.target-label {
		font-weight: 700;
	}

	.target-preview {
		margin: 6px 0 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary, #b0bec5);
		line-height: 1.4;
		padding-right: 24px;
	}

	.dialog-close {
		position: absolute;
		top: 12px;
		right: 12px;
		background: none;
		border: none;
		color: var(--color-text-tertiary, #607d8b);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.12s ease;
	}

	.dialog-close:hover:not(:disabled) {
		color: var(--color-text-primary, #eceff1);
		background: var(--color-surface-alt, #2a2a3a);
	}

	.dialog-close:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Choice body (owner flow) ─────────────────────────────────── */
	.choice-body {
		padding: 16px;
	}

	.choice-description {
		font-size: 0.8rem;
		color: var(--color-text-secondary, #b0bec5);
		margin: 0 0 14px;
		line-height: 1.5;
	}

	.choice-options {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.choice-btn {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px;
		background: var(--color-surface-alt, #1e1e30);
		border: 1px solid var(--color-border, #333);
		border-radius: var(--border-radius-md, 8px);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.choice-btn:hover {
		border-color: var(--color-text-tertiary, #607d8b);
		background: var(--color-surface-hover, #252540);
	}

	.choice-btn.edit-choice:hover {
		border-color: color-mix(in srgb, var(--color-primary, #6366f1) 50%, transparent);
	}

	.choice-btn.comment-choice:hover {
		border-color: color-mix(in srgb, #4bc4e8 50%, transparent);
	}

	.choice-icon {
		flex-shrink: 0;
		color: var(--color-text-secondary, #b0bec5);
		margin-top: 2px;
	}

	.edit-choice:hover .choice-icon {
		color: var(--color-primary, #6366f1);
	}

	.comment-choice:hover .choice-icon {
		color: #4bc4e8;
	}

	.choice-text {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.choice-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-primary, #eceff1);
	}

	.choice-hint {
		font-size: 0.72rem;
		color: var(--color-text-secondary, #b0bec5);
		line-height: 1.4;
	}

	/* ── Dialog body (form) ───────────────────────────────────────── */
	.dialog-body {
		padding: 14px 16px;
		overflow-y: auto;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.form-error {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		background: color-mix(in srgb, var(--color-error, #ef4444) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-error, #ef4444) 25%, transparent);
		border-radius: 6px;
		color: var(--color-error, #ef4444);
		font-size: 0.75rem;
		margin-bottom: 4px;
	}

	.context-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 0.72rem;
		font-weight: 500;
		margin-bottom: 4px;
	}

	.context-badge.comment-context {
		background: color-mix(in srgb, #4bc4e8 8%, transparent);
		border: 1px solid color-mix(in srgb, #4bc4e8 20%, transparent);
		color: #4bc4e8;
	}

	.form-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 8px;
	}

	.section-label {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary, #b0bec5);
	}

	.label-badge {
		font-weight: 700;
	}

	.label-hint {
		display: block;
		font-size: 0.68rem;
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		color: var(--color-text-tertiary, #607d8b);
		margin-top: 2px;
	}

	/* ── Type chips ───────────────────────────────────────────────── */
	.type-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.type-chip {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		background: transparent;
		border: 1px solid var(--color-border, #444);
		border-radius: 14px;
		color: var(--color-text-secondary, #b0bec5);
		font-size: 0.72rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.type-chip:hover {
		background: var(--color-surface-alt, #2a2a3a);
		border-color: var(--color-text-tertiary, #607d8b);
	}

	.type-chip.active {
		color: var(--color-text-primary, #eceff1);
		font-weight: 600;
	}

	.chip-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		transition: all 0.12s ease;
	}

	.type-chip.active .chip-dot,
	.type-chip:hover .chip-dot {
		transform: scale(1.2);
	}

	.chip-label {
		white-space: nowrap;
	}

	.type-description {
		font-size: 0.7rem;
		color: var(--color-text-tertiary, #607d8b);
		font-style: italic;
		line-height: 1.4;
		margin: 0;
	}

	.connection-preview {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.72rem;
		color: var(--color-text-secondary, #b0bec5);
		margin: 2px 0 0;
		padding: 4px 8px;
		background: var(--color-surface-alt, #1e1e30);
		border-radius: 4px;
	}

	.connection-arrow {
		color: var(--color-text-tertiary, #607d8b);
		font-weight: 600;
	}

	.connection-edge-type {
		font-weight: 600;
		font-style: italic;
	}

	.connection-target {
		font-weight: 500;
	}

	/* ── Content textarea ─────────────────────────────────────────── */
	.content-textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		background: var(--color-surface-alt, #1e1e30);
		border: 1px solid var(--color-border, #444);
		border-radius: 6px;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-ui, sans-serif);
		font-size: 0.8rem;
		line-height: 1.5;
		resize: vertical;
		min-height: 60px;
		transition: border-color 0.12s ease;
	}

	.content-textarea:focus {
		outline: none;
		border-color: var(--color-primary, #6366f1);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary, #6366f1) 15%, transparent);
	}

	.content-textarea::placeholder {
		color: var(--color-text-tertiary, #607d8b);
		font-style: italic;
	}

	/* ── Select ───────────────────────────────────────────────────── */
	.node-select {
		width: 100%;
		box-sizing: border-box;
		padding: 8px 10px;
		background: var(--color-surface-alt, #1e1e30);
		border: 1px solid var(--color-border, #444);
		border-radius: 6px;
		color: var(--color-text-primary, #eceff1);
		font-family: var(--font-family-ui, sans-serif);
		font-size: 0.78rem;
		cursor: pointer;
	}

	.node-select:focus {
		outline: none;
		border-color: var(--color-primary, #6366f1);
	}

	/* ── Warrant blocked ──────────────────────────────────────────── */
	.warrant-blocked {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.warrant-error {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		background: color-mix(in srgb, var(--color-warning, #f59e0b) 6%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 20%, transparent);
		border-radius: 6px;
		color: var(--color-warning, #f59e0b);
		font-size: 0.73rem;
	}

	/* ── Footer ───────────────────────────────────────────────────── */
	.dialog-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 16px;
		border-top: 1px solid var(--color-border, #333);
	}

	.cancel-btn {
		padding: 7px 14px;
		background: transparent;
		border: 1px solid var(--color-border, #444);
		border-radius: 6px;
		color: var(--color-text-secondary, #b0bec5);
		font-size: 0.78rem;
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
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 16px;
		background: var(--color-primary, #6366f1);
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.submit-btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.submit-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Responsive ───────────────────────────────────────────────── */
	@media (max-width: 640px) {
		.add-connected-node-dialog {
			width: calc(100vw - 24px);
			max-height: calc(100vh - 48px);
		}
	}
</style>
