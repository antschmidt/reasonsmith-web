<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { ADD_NODE, ADD_WARRANT_NODE } from '$lib/graphql/queries';
	import type { ArgumentNode, ArgumentEdge, ArgumentNodeType } from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS } from '$lib/types/argument';
	import { getDefaultEdgeType } from '$lib/utils/argumentUtils';
	import { fade } from 'svelte/transition';
	import { X, Check, AlertCircle } from '@lucide/svelte';

	interface Props {
		argumentId: string;
		/** Node that the new node should attach to in the tree (the "parent"). */
		targetNode: ArgumentNode;
		/** Type of node to create. */
		nodeType: ArgumentNodeType;
		nodes: ArgumentNode[];
		onCancel: () => void;
		onNodeAdded: (event: { node: ArgumentNode; edges: ArgumentEdge[] }) => void;
		/** When true, new nodes are created as unpublished drafts. */
		isSharedGraph?: boolean;
	}

	let {
		argumentId,
		targetNode,
		nodeType,
		nodes,
		onCancel,
		onNodeAdded,
		isSharedGraph = false
	}: Props = $props();

	let content = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let textarea: HTMLTextAreaElement | null = $state(null);

	const config = $derived(NODE_TYPE_CONFIGS[nodeType]);

	// Resolve how to connect the new node to the existing graph.
	// For most types we create a single edge. Warrants create two.
	const connectionPlan = $derived.by(() => {
		if (nodeType === 'warrant') {
			// Warrant needs both a draws_from (evidence) and a justifies (claim).
			// Infer from context: if target is evidence, pick a claim it supports.
			// If target is a claim, pick the first evidence that supports it.
			const rootClaim = nodes.find((n) => n.is_root && n.type === 'claim');
			let drawsFrom: ArgumentNode | null = null;
			let justifies: ArgumentNode | null = null;

			if (targetNode.type === 'evidence') {
				drawsFrom = targetNode;
				justifies =
					nodes.find((n) => n.type === 'claim') /* prefer any claim */ ??
					rootClaim ??
					null;
			} else if (targetNode.type === 'claim') {
				justifies = targetNode;
				drawsFrom = nodes.find((n) => n.type === 'evidence') ?? null;
			}

			return {
				kind: 'warrant' as const,
				drawsFrom,
				justifies,
				ready: !!(drawsFrom && justifies)
			};
		}

		if (nodeType === 'source') {
			// Evidence cites a source: from_node=evidence (target), to_node=source (new).
			// The existing ADD_NODE mutation creates an edge FROM the new node, so we
			// instead create source as a child of evidence via a cites edge TO the
			// evidence (matches how the node list & existing AddNodeSheet work).
			return {
				kind: 'simple' as const,
				connectToNodeId: targetNode.id,
				edgeType: 'cites',
				ready: targetNode.type === 'evidence'
			};
		}

		// For claim/evidence/counter/rebuttal/qualifier we use the standard map.
		const edgeType = getDefaultEdgeType(nodeType, targetNode.type);
		return {
			kind: 'simple' as const,
			connectToNodeId: targetNode.id,
			edgeType,
			ready: true
		};
	});

	const canSubmit = $derived(
		!saving && content.trim().length > 0 && connectionPlan.ready
	);

	$effect(() => {
		// Autofocus textarea after mount
		if (textarea) {
			textarea.focus();
		}
	});

	async function handleSubmit() {
		if (!canSubmit) return;
		saving = true;
		error = null;

		try {
			if (connectionPlan.kind === 'warrant') {
				if (!connectionPlan.drawsFrom || !connectionPlan.justifies) {
					throw new Error(
						'Warrants need an evidence node and a claim. Add one of each first, then try again.'
					);
				}
				const result = await nhost.graphql.request(ADD_WARRANT_NODE, {
					argumentId,
					content: content.trim(),
					drawsFromNodeId: connectionPlan.drawsFrom.id,
					justifiesNodeId: connectionPlan.justifies.id,
					isPublished: !isSharedGraph
				});
				if (result.error) {
					const msg = Array.isArray(result.error)
						? result.error[0]?.message
						: result.error.message;
					throw new Error(msg || 'Failed to add warrant');
				}
				const newNode = result.data?.insert_argument_node_one;
				if (newNode) {
					onNodeAdded({ node: newNode, edges: newNode.outgoing_edges || [] });
				}
			} else {
				const result = await nhost.graphql.request(ADD_NODE, {
					argumentId,
					type: nodeType,
					content: content.trim(),
					connectToNodeId: connectionPlan.connectToNodeId,
					edgeType: connectionPlan.edgeType,
					isPublished: !isSharedGraph
				});
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
		} catch (e: any) {
			error = e.message || 'Failed to add node';
		} finally {
			saving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleSubmit();
		}
	}
</script>

<div
	class="add-inline"
	style="--node-color: {config.color}; --node-bg: {config.bgColor}"
	transition:fade={{ duration: 150 }}
>
	<div class="add-inline-header">
		<span class="add-inline-dot" style="background: {config.color}"></span>
		<span class="add-inline-type">New {config.label}</span>
		{#if !connectionPlan.ready && nodeType === 'warrant'}
			<span class="add-inline-hint">
				<AlertCircle size={12} />
				Needs at least one evidence and one claim in the argument.
			</span>
		{/if}
	</div>

	<textarea
		bind:this={textarea}
		bind:value={content}
		class="add-inline-textarea"
		placeholder={config.placeholder}
		rows="3"
		onkeydown={handleKeydown}
		disabled={saving}
	></textarea>

	{#if error}
		<div class="add-inline-error">
			<AlertCircle size={14} />
			<span>{error}</span>
		</div>
	{/if}

	<div class="add-inline-actions">
		<button
			class="add-inline-btn primary"
			onclick={handleSubmit}
			disabled={!canSubmit}
			title={canSubmit ? 'Save (⌘⏎)' : 'Enter content first'}
		>
			<Check size={14} />
			<span>Save</span>
		</button>
		<button class="add-inline-btn" onclick={onCancel} disabled={saving}>
			<X size={14} />
			<span>Cancel</span>
		</button>
	</div>
</div>

<style>
	.add-inline {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0.25rem 0 0.5rem 0;
		padding: 0.625rem 0.75rem;
		border-left: 3px solid var(--node-color);
		background: color-mix(in srgb, var(--node-color) 6%, transparent);
		border-radius: 6px;
	}

	.add-inline-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--node-color);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.add-inline-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.add-inline-hint {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.7rem;
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--color-text-tertiary, #888);
		margin-left: auto;
	}

	.add-inline-textarea {
		width: 100%;
		background: var(--color-surface-elevated, #141414);
		border: 1px solid color-mix(in srgb, var(--node-color) 35%, transparent);
		border-radius: 6px;
		color: var(--color-text-primary, #e0e0e0);
		font-family: inherit;
		font-size: 0.875rem;
		line-height: 1.4;
		padding: 0.5rem 0.65rem;
		resize: vertical;
		min-height: 60px;
	}

	.add-inline-textarea:focus {
		outline: none;
		border-color: var(--node-color);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color) 18%, transparent);
	}

	.add-inline-textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.add-inline-error {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		font-size: 0.78rem;
		color: var(--color-error, #ef4444);
		background: color-mix(in srgb, var(--color-error, #ef4444) 8%, transparent);
		border-radius: 4px;
	}

	.add-inline-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.4rem;
	}

	.add-inline-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--color-text-secondary, #aaa);
		background: transparent;
		border: 1px solid var(--color-border, #333);
		border-radius: 4px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.add-inline-btn:hover:not(:disabled) {
		background: var(--color-surface-hover, #1e1e1e);
	}

	.add-inline-btn.primary {
		color: var(--node-color);
		border-color: color-mix(in srgb, var(--node-color) 40%, transparent);
		background: color-mix(in srgb, var(--node-color) 10%, transparent);
	}

	.add-inline-btn.primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--node-color) 18%, transparent);
	}

	.add-inline-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
