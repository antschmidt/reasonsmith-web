<script lang="ts">
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS, EDGE_TYPE_CONFIGS } from '$lib/types/argument';
	import { getContextualAddTypesForNode } from '$lib/utils/argumentUtils';
	import AddNodeInline from './AddNodeInline.svelte';
	import { Pencil, Trash2, Check, X, Plus, Star, ChevronUp, ChevronDown } from '@lucide/svelte';

	interface Connection {
		node: ArgumentNode;
		edgeType: string;
		direction: 'incoming' | 'outgoing';
	}

	type NodeOrigin = 'author' | 'mine' | 'other';
	type GraphMode = 'author-edit' | 'author-view' | 'commenter' | 'viewer';

	interface Props {
		node: ArgumentNode;
		connections: Connection[];
		/** Passed so AddNodeInline + progressive disclosure can see siblings/family. */
		nodes: ArgumentNode[];
		argumentId: string;
		onEdit: (
			nodeId: string,
			updates: { content?: string; type?: ArgumentNodeType }
		) => Promise<void> | void;
		onDelete: (nodeId: string) => void;
		onNavigate: (nodeId: string) => void;
		onNodeAdded: (event: { node: ArgumentNode; edges: ArgumentEdge[] }) => void;
		canEditNode: (node: ArgumentNode) => boolean;
		getOwnerName?: (node: ArgumentNode) => string | undefined;
		getNodeOrigin?: (node: ArgumentNode) => NodeOrigin;
		graphMode?: GraphMode;
		isSharedGraph?: boolean;
		canAdd?: boolean;
	}

	let {
		node,
		connections,
		nodes,
		argumentId,
		onEdit,
		onDelete,
		onNavigate,
		onNodeAdded,
		canEditNode,
		getOwnerName,
		getNodeOrigin,
		graphMode,
		isSharedGraph = false,
		canAdd = true
	}: Props = $props();

	const config = $derived(NODE_TYPE_CONFIGS[node.type]);
	const isEditable = $derived(canEditNode(node));
	const ownerName = $derived(getOwnerName?.(node));
	const origin = $derived<NodeOrigin>(getNodeOrigin?.(node) ?? 'author');
	const isDraft = $derived(isSharedGraph && origin === 'mine' && graphMode === 'commenter');
	const contextualAddTypes = $derived(getContextualAddTypesForNode(node, nodes));

	const incomingConnections = $derived(
		connections.filter((c) => c.direction === 'incoming')
	);
	const outgoingConnections = $derived(
		connections.filter((c) => c.direction === 'outgoing')
	);

	let editing = $state(false);
	let editContent = $state('');
	let saving = $state(false);
	let editError = $state<string | null>(null);

	let addingType = $state<ArgumentNodeType | null>(null);

	function beginEdit() {
		editContent = node.content;
		editError = null;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
	}

	async function commitEdit() {
		const trimmed = editContent.trim();
		if (!trimmed || trimmed === node.content) {
			editing = false;
			return;
		}
		saving = true;
		editError = null;
		try {
			await onEdit(node.id, { content: trimmed });
			editing = false;
		} catch (e: any) {
			editError = e?.message || 'Failed to save';
		} finally {
			saving = false;
		}
	}

	function truncate(s: string, n: number) {
		return s.length > n ? s.slice(0, n - 1) + '…' : s;
	}

	function edgeLabelFor(direction: 'incoming' | 'outgoing', edgeType: string) {
		const cfg = EDGE_TYPE_CONFIGS[edgeType as keyof typeof EDGE_TYPE_CONFIGS];
		if (!cfg) return edgeType.replace('_', ' ');
		return direction === 'incoming' ? cfg.toLabel : cfg.fromLabel;
	}
</script>

<div
	class="arg-card origin-{origin}"
	class:is-draft={isDraft}
	style="--node-color: {config.color}; --node-bg: {config.bgColor}"
>
	<!-- Incoming (parents/supporters) -->
	{#if incomingConnections.length > 0}
		<section class="conn-section" aria-label="Supported by">
			<div class="conn-head">
				<ChevronUp size={12} />
				<span>Connected from ({incomingConnections.length})</span>
			</div>
			<div class="conn-list">
				{#each incomingConnections as c (c.node.id + c.edgeType)}
					{@const cc = NODE_TYPE_CONFIGS[c.node.type]}
					<button
						class="conn-pill"
						style="--pill-color: {cc.color}"
						onclick={() => onNavigate(c.node.id)}
					>
						<span class="pill-type">{cc.label}</span>
						<span class="pill-edge">{edgeLabelFor(c.direction, c.edgeType)}</span>
						<span class="pill-content">{truncate(c.node.content, 70)}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Current node (large, centered) -->
	<section class="arg-card-main">
		<div class="arg-card-head">
			<span class="arg-card-type" style="color: {config.color}">
				<span class="arg-card-dot" style="background: {config.color}"></span>
				{#if node.is_root}<Star size={12} />{/if}
				{config.label.toUpperCase()}
			</span>
			<div class="arg-card-head-right">
				{#if isDraft}
					<span class="origin-pill draft" title="Part of your in-progress comment">Your draft</span>
				{:else if isSharedGraph && origin === 'author'}
					<span class="origin-pill author" title="Part of the original post">Original</span>
				{:else if isSharedGraph && origin === 'other' && ownerName}
					<span class="origin-pill other" title="Added by another contributor">from {ownerName}</span>
				{/if}
				{#if ownerName}
					<span class="owner-badge" title={ownerName}>{ownerName.charAt(0).toUpperCase()}</span>
				{/if}
			</div>
		</div>

		{#if editing}
			<textarea
				class="arg-card-editor"
				bind:value={editContent}
				rows="6"
				disabled={saving}
				autofocus
			></textarea>
			{#if editError}
				<p class="arg-card-error">{editError}</p>
			{/if}
			<div class="arg-card-actions">
				<button class="arg-btn primary" onclick={commitEdit} disabled={saving}>
					<Check size={14} /><span>Save</span>
				</button>
				<button class="arg-btn" onclick={cancelEdit} disabled={saving}>
					<X size={14} /><span>Cancel</span>
				</button>
			</div>
		{:else}
			<p class="arg-card-content">{node.content}</p>
			{#if isEditable}
				<div class="arg-card-actions">
					<button class="arg-btn" onclick={beginEdit}>
						<Pencil size={14} /><span>Edit</span>
					</button>
					{#if !node.is_root}
						<button class="arg-btn danger" onclick={() => onDelete(node.id)}>
							<Trash2 size={14} /><span>Delete</span>
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</section>

	<!-- Outgoing (children/challengers) -->
	{#if outgoingConnections.length > 0}
		<section class="conn-section" aria-label="Connects to">
			<div class="conn-head">
				<ChevronDown size={12} />
				<span>Connects to ({outgoingConnections.length})</span>
			</div>
			<div class="conn-list">
				{#each outgoingConnections as c (c.node.id + c.edgeType)}
					{@const cc = NODE_TYPE_CONFIGS[c.node.type]}
					<button
						class="conn-pill"
						style="--pill-color: {cc.color}"
						onclick={() => onNavigate(c.node.id)}
					>
						<span class="pill-type">{cc.label}</span>
						<span class="pill-edge">{edgeLabelFor(c.direction, c.edgeType)}</span>
						<span class="pill-content">{truncate(c.node.content, 70)}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Add actions -->
	{#if canAdd && contextualAddTypes.length > 0 && !editing}
		<section class="arg-card-add">
			{#if addingType}
				<AddNodeInline
					{argumentId}
					targetNode={node}
					nodeType={addingType}
					{nodes}
					{isSharedGraph}
					onCancel={() => (addingType = null)}
					onNodeAdded={(e) => {
						onNodeAdded(e);
						addingType = null;
					}}
				/>
			{:else}
				<div class="add-row">
					{#each contextualAddTypes as t (t)}
						{@const tc = NODE_TYPE_CONFIGS[t]}
						<button
							class="add-btn"
							style="--add-color: {tc.color}"
							onclick={() => (addingType = t)}
						>
							<Plus size={12} /> Add {tc.label}
						</button>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.arg-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.arg-card-main {
		padding: 1rem;
		border-left: 4px solid var(--node-color);
		border-radius: 8px;
		background: color-mix(in srgb, var(--node-color) 8%, var(--color-surface-elevated, #141414));
	}

	/* ── Origin variants (mirrors ArgumentBuilderNode) ─────────────── */
	.origin-other .arg-card-main {
		opacity: 0.88;
		background: color-mix(in srgb, var(--node-color) 3%, var(--color-surface, #0a0a0a));
	}

	.is-draft .arg-card-main {
		border-left-style: dashed;
		border-left-color: var(--color-primary, #6366f1);
		background: color-mix(in srgb, var(--color-primary, #6366f1) 7%, transparent);
		box-shadow: inset 0 0 0 1px
			color-mix(in srgb, var(--color-primary, #6366f1) 22%, transparent);
	}

	.arg-card-head-right {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.origin-pill {
		display: inline-flex;
		align-items: center;
		padding: 2px 7px;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		border: 1px solid transparent;
	}

	.origin-pill.draft {
		color: var(--color-primary, #6366f1);
		background: color-mix(in srgb, var(--color-primary, #6366f1) 14%, transparent);
		border-color: color-mix(in srgb, var(--color-primary, #6366f1) 40%, transparent);
	}

	.origin-pill.author {
		color: var(--color-text-tertiary, #888);
		background: var(--color-surface-elevated, #1a1a1a);
		border-color: var(--color-border, #333);
		text-transform: none;
		font-weight: 500;
		letter-spacing: 0;
	}

	.origin-pill.other {
		color: var(--color-text-tertiary, #888);
		background: transparent;
		border-color: color-mix(in srgb, var(--color-text-tertiary, #888) 30%, transparent);
		text-transform: none;
		font-weight: 500;
		letter-spacing: 0;
	}

	.arg-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.arg-card-type {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}

	.arg-card-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.arg-card-content {
		margin: 0;
		font-size: 1rem;
		line-height: 1.5;
		color: var(--color-text-primary, #e0e0e0);
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}

	.arg-card-editor {
		width: 100%;
		background: var(--color-surface, #0d0d0d);
		color: var(--color-text-primary, #e0e0e0);
		border: 1px solid color-mix(in srgb, var(--node-color) 35%, transparent);
		border-radius: 6px;
		padding: 0.6rem 0.75rem;
		font-family: inherit;
		font-size: 1rem;
		line-height: 1.4;
		resize: vertical;
	}

	.arg-card-editor:focus {
		outline: none;
		border-color: var(--node-color);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color) 18%, transparent);
	}

	.arg-card-error {
		margin: 0.4rem 0 0 0;
		font-size: 0.8rem;
		color: var(--color-error, #ef4444);
	}

	.arg-card-actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}

	.arg-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		font-size: 0.82rem;
		background: transparent;
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		color: var(--color-text-secondary, #aaa);
		cursor: pointer;
	}

	.arg-btn.primary {
		color: var(--node-color);
		border-color: color-mix(in srgb, var(--node-color) 40%, transparent);
		background: color-mix(in srgb, var(--node-color) 10%, transparent);
	}

	.arg-btn.danger:hover {
		color: var(--color-error, #ef4444);
		border-color: var(--color-error, #ef4444);
	}

	.arg-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.owner-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--node-color);
		color: #0a0a0a;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.conn-section {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface-elevated, #141414);
		border: 1px solid var(--color-border, #2a2a2a);
		border-radius: 6px;
	}

	.conn-head {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-tertiary, #777);
		margin-bottom: 0.4rem;
	}

	.conn-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.conn-pill {
		display: grid;
		grid-template-columns: auto auto 1fr;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		border: 1px solid color-mix(in srgb, var(--pill-color) 30%, transparent);
		background: color-mix(in srgb, var(--pill-color) 6%, transparent);
		border-radius: 5px;
		color: var(--color-text-secondary, #aaa);
		text-align: left;
		cursor: pointer;
		font-size: 0.78rem;
	}

	.conn-pill:hover {
		background: color-mix(in srgb, var(--pill-color) 15%, transparent);
	}

	.pill-type {
		color: var(--pill-color);
		font-weight: 600;
		font-size: 0.72rem;
		letter-spacing: 0.02em;
	}

	.pill-edge {
		color: var(--color-text-tertiary, #777);
		font-style: italic;
		font-size: 0.7rem;
	}

	.pill-content {
		color: var(--color-text-primary, #ccc);
		font-size: 0.82rem;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.arg-card-add {
		padding: 0.5rem 0.75rem;
	}

	.add-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.add-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 10px;
		font-size: 0.8rem;
		color: var(--add-color, var(--color-text-secondary));
		background: color-mix(in srgb, var(--add-color, #888) 8%, transparent);
		border: 1px dashed color-mix(in srgb, var(--add-color, #888) 35%, transparent);
		border-radius: 5px;
		cursor: pointer;
	}

	.add-btn:hover {
		background: color-mix(in srgb, var(--add-color, #888) 16%, transparent);
		border-style: solid;
	}
</style>
