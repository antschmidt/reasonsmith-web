<script lang="ts">
	import type {
		ArgumentNode,
		ArgumentEdge,
		ArgumentNodeType,
		ArgumentTreeNode
	} from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS, EDGE_TYPE_CONFIGS } from '$lib/types/argument';
	import { getContextualAddTypesForNode } from '$lib/utils/argumentUtils';
	import AddNodeInline from './AddNodeInline.svelte';
	import {
		ChevronDown,
		ChevronRight,
		Pencil,
		Trash2,
		Plus,
		Check,
		X,
		Star
	} from '@lucide/svelte';

	type NodeOrigin = 'author' | 'mine' | 'other';
	type GraphMode = 'author-edit' | 'author-view' | 'commenter' | 'viewer';

	interface Props {
		tree: ArgumentTreeNode;
		/** All nodes in the argument (needed to resolve progressive disclosure). */
		nodes: ArgumentNode[];
		argumentId: string;
		selectedNodeId: string | null;
		onSelect: (nodeId: string) => void;
		onEdit: (
			nodeId: string,
			updates: { content?: string; type?: ArgumentNodeType }
		) => Promise<void> | void;
		onDelete: (nodeId: string) => void;
		onNodeAdded: (event: { node: ArgumentNode; edges: ArgumentEdge[] }) => void;
		/** Check if the current user can edit this node. */
		canEditNode: (node: ArgumentNode) => boolean;
		/** Get display name of node owner when it's not the current user. */
		getOwnerName?: (node: ArgumentNode) => string | undefined;
		/** Classifies each node as 'author' (original post), 'mine' (draft), or 'other'. */
		getNodeOrigin?: (node: ArgumentNode) => NodeOrigin;
		/** Current viewer's role — affects whether 'mine' nodes are badged as "draft". */
		graphMode?: GraphMode;
		isSharedGraph?: boolean;
		/** Whether this user can add new nodes at all. */
		canAdd?: boolean;
	}

	let {
		tree,
		nodes,
		argumentId,
		selectedNodeId,
		onSelect,
		onEdit,
		onDelete,
		onNodeAdded,
		canEditNode,
		getOwnerName,
		getNodeOrigin,
		graphMode,
		isSharedGraph = false,
		canAdd = true
	}: Props = $props();

	const node = $derived(tree.node);
	const config = $derived(NODE_TYPE_CONFIGS[node.type]);
	const edgeLabel = $derived(tree.edgeType ? EDGE_TYPE_CONFIGS[tree.edgeType].fromLabel : null);
	const isSelected = $derived(selectedNodeId === node.id);
	const isEditable = $derived(canEditNode(node));
	const ownerName = $derived(getOwnerName?.(node));
	const origin = $derived<NodeOrigin>(getNodeOrigin?.(node) ?? 'author');
	/** A node is a "draft" (in-progress comment) when it belongs to the viewer
	 *  and the viewer is a commenter on someone else's discussion. */
	const isDraft = $derived(isSharedGraph && origin === 'mine' && graphMode === 'commenter');
	const contextualAddTypes = $derived(getContextualAddTypesForNode(node, nodes));

	let collapsed = $state(false);
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
		editError = null;
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

	function handleEditKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			commitEdit();
		}
	}

	function toggleCollapse() {
		collapsed = !collapsed;
	}

	function handleSelect() {
		onSelect(node.id);
	}

	function beginAdd(t: ArgumentNodeType) {
		addingType = t;
		collapsed = false;
	}

	function cancelAdd() {
		addingType = null;
	}

	function onAdded(event: { node: ArgumentNode; edges: ArgumentEdge[] }) {
		onNodeAdded(event);
		addingType = null;
	}
</script>

<div
	class="builder-node origin-{origin}"
	class:is-draft={isDraft}
	style="--node-color: {config.color}; --node-bg: {config.bgColor}"
>
	<div
		class="builder-row"
		class:selected={isSelected}
		data-node-id={node.id}
	>
		<button
			class="builder-toggle"
			class:invisible={tree.children.length === 0}
			onclick={toggleCollapse}
			title={collapsed ? 'Expand' : 'Collapse'}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
		>
			{#if collapsed}
				<ChevronRight size={14} />
			{:else}
				<ChevronDown size={14} />
			{/if}
		</button>

		{#if ownerName}
			<span class="owner-badge" title={ownerName}>{ownerName.charAt(0).toUpperCase()}</span>
		{/if}

		<div class="builder-body">
			<div class="builder-meta">
				<span class="builder-type" style="color: {config.color}">
					<span class="builder-dot" style="background: {config.color}"></span>
					{#if node.is_root}
						<Star size={10} />
					{/if}
					{config.label.toUpperCase()}
				</span>
				{#if edgeLabel}
					<span class="builder-edge">{edgeLabel}</span>
				{/if}
				{#if node.implied}
					<span class="builder-implied" title="AI-inferred">implied</span>
				{/if}
				{#if isDraft}
					<span class="origin-pill draft" title="Part of your in-progress comment">Your draft</span>
				{:else if isSharedGraph && origin === 'author'}
					<span class="origin-pill author" title="Part of the original post">Original</span>
				{:else if isSharedGraph && origin === 'other' && ownerName}
					<span class="origin-pill other" title="Added by another contributor">from {ownerName}</span>
				{/if}
			</div>

			{#if editing}
				<textarea
					class="builder-editor"
					bind:value={editContent}
					onkeydown={handleEditKey}
					rows="3"
					disabled={saving}
				></textarea>
				{#if editError}
					<p class="builder-edit-error">{editError}</p>
				{/if}
				<div class="builder-edit-actions">
					<button class="builder-icon-btn primary" onclick={commitEdit} disabled={saving}>
						<Check size={14} />
						<span>Save</span>
					</button>
					<button class="builder-icon-btn" onclick={cancelEdit} disabled={saving}>
						<X size={14} />
						<span>Cancel</span>
					</button>
				</div>
			{:else}
				<button
					class="builder-content"
					onclick={handleSelect}
					onkeydown={(e) => {
						if (e.key === 'Enter' && isEditable) beginEdit();
					}}
					title={isEditable ? 'Click to select · Pencil to edit' : 'Click to select'}
				>
					{node.content}
				</button>
			{/if}

			{#if !editing && (isEditable || (canAdd && contextualAddTypes.length > 0))}
				<div class="builder-actions">
					{#if canAdd}
						{#each contextualAddTypes as t (t)}
							{@const tConfig = NODE_TYPE_CONFIGS[t]}
							<button
								class="builder-add-btn"
								style="--add-color: {tConfig.color}"
								onclick={() => beginAdd(t)}
							>
								<Plus size={12} />
								<span>Add {tConfig.label}</span>
							</button>
						{/each}
					{/if}
					{#if isEditable}
						<button
							class="builder-icon-btn ghost"
							onclick={beginEdit}
							title="Edit content"
							aria-label="Edit"
						>
							<Pencil size={13} />
						</button>
						{#if !node.is_root}
							<button
								class="builder-icon-btn ghost danger"
								onclick={() => onDelete(node.id)}
								title="Delete node"
								aria-label="Delete"
							>
								<Trash2 size={13} />
							</button>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#if addingType}
		<div class="builder-add-slot">
			<AddNodeInline
				{argumentId}
				targetNode={node}
				nodeType={addingType}
				{nodes}
				{isSharedGraph}
				onCancel={cancelAdd}
				onNodeAdded={onAdded}
			/>
		</div>
	{/if}

	{#if !collapsed && tree.children.length > 0}
		<div class="builder-children">
			{#each tree.children as childTree (childTree.node.id)}
				<svelte:self
					tree={childTree}
					{nodes}
					{argumentId}
					{selectedNodeId}
					{onSelect}
					{onEdit}
					{onDelete}
					{onNodeAdded}
					{canEditNode}
					{getOwnerName}
					{getNodeOrigin}
					{graphMode}
					{isSharedGraph}
					{canAdd}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.builder-node {
		display: flex;
		flex-direction: column;
	}

	.builder-row {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		border-left: 3px solid var(--node-color);
		background: color-mix(in srgb, var(--node-color) 4%, transparent);
		border-radius: 4px;
		transition: background 0.15s ease;
	}

	.builder-row.selected {
		background: color-mix(in srgb, var(--node-color) 14%, transparent);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--node-color) 35%, transparent);
	}

	.builder-row:hover {
		background: color-mix(in srgb, var(--node-color) 9%, transparent);
	}

	/* ── Origin variants ────────────────────────────────────────────
	 * In a shared graph, nodes can come from the discussion author (original
	 * post), the current user (an in-progress comment draft), or another
	 * contributor. We give each origin a distinct but non-jarring treatment
	 * so the viewer can see at a glance which nodes are "theirs" vs the
	 * argument they're reading or responding to.
	 */
	.origin-other .builder-row {
		/* Other contributors' nodes: softened, slightly desaturated so they
		   read as "context" without disappearing. */
		opacity: 0.78;
		background: color-mix(in srgb, var(--node-color) 2%, var(--color-surface, #0a0a0a));
	}
	.origin-other .builder-row:hover {
		opacity: 0.95;
	}
	.origin-other .builder-row .builder-content {
		color: var(--color-text-secondary, #aaa);
	}

	/* A node is a "draft" when it's the current user's own contribution to
	   someone else's discussion — i.e. the in-progress comment. Highlighted
	   with a dashed accent border so it reads as "not yet posted". */
	.is-draft .builder-row {
		border-left-style: dashed;
		border-left-width: 3px;
		border-left-color: var(--color-primary, #6366f1);
		background: color-mix(in srgb, var(--color-primary, #6366f1) 6%, transparent);
		box-shadow: inset 0 0 0 1px
			color-mix(in srgb, var(--color-primary, #6366f1) 18%, transparent);
	}
	.is-draft .builder-row:hover {
		background: color-mix(in srgb, var(--color-primary, #6366f1) 11%, transparent);
	}
	.is-draft .builder-row.selected {
		background: color-mix(in srgb, var(--color-primary, #6366f1) 16%, transparent);
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--color-primary, #6366f1) 30%, transparent),
			0 0 0 1px color-mix(in srgb, var(--color-primary, #6366f1) 45%, transparent);
	}

	/* Origin pill — short text label next to the type/meta row */
	.origin-pill {
		display: inline-flex;
		align-items: center;
		padding: 1px 6px;
		border-radius: 999px;
		font-size: 0.64rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		border: 1px solid transparent;
	}

	.origin-pill.draft {
		color: var(--color-primary, #6366f1);
		background: color-mix(in srgb, var(--color-primary, #6366f1) 12%, transparent);
		border-color: color-mix(in srgb, var(--color-primary, #6366f1) 35%, transparent);
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

	.builder-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		margin-top: 2px;
		background: none;
		border: none;
		border-radius: 3px;
		color: var(--color-text-tertiary, #666);
		cursor: pointer;
	}

	.builder-toggle.invisible {
		visibility: hidden;
		cursor: default;
	}

	.builder-toggle:hover {
		background: var(--color-surface-hover, #1e1e1e);
		color: var(--color-text-secondary, #aaa);
	}

	.owner-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		margin-top: 2px;
		border-radius: 50%;
		background: var(--node-color);
		color: #0a0a0a;
		font-size: 0.65rem;
		font-weight: 700;
	}

	.builder-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.builder-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		font-size: 0.7rem;
		letter-spacing: 0.04em;
	}

	.builder-type {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 700;
	}

	.builder-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.builder-edge {
		color: var(--color-text-tertiary, #777);
		font-style: italic;
		font-weight: 500;
	}

	.builder-implied {
		color: var(--color-text-tertiary, #666);
		font-size: 0.65rem;
		padding: 1px 5px;
		border-radius: 3px;
		background: var(--color-surface-elevated, #1e1e1e);
	}

	.builder-content {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 0;
		color: var(--color-text-primary, #e0e0e0);
		font-family: inherit;
		font-size: 0.9rem;
		line-height: 1.4;
		cursor: pointer;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}

	.builder-content:hover {
		color: var(--node-color);
	}

	.builder-editor {
		width: 100%;
		background: var(--color-surface-elevated, #141414);
		color: var(--color-text-primary, #e0e0e0);
		border: 1px solid color-mix(in srgb, var(--node-color) 35%, transparent);
		border-radius: 4px;
		padding: 0.4rem 0.55rem;
		font-family: inherit;
		font-size: 0.875rem;
		line-height: 1.4;
		resize: vertical;
	}

	.builder-editor:focus {
		outline: none;
		border-color: var(--node-color);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color) 18%, transparent);
	}

	.builder-edit-error {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-error, #ef4444);
	}

	.builder-edit-actions,
	.builder-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.builder-add-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--add-color, var(--color-text-secondary));
		background: color-mix(in srgb, var(--add-color, #888) 8%, transparent);
		border: 1px dashed color-mix(in srgb, var(--add-color, #888) 35%, transparent);
		border-radius: 4px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.builder-add-btn:hover {
		background: color-mix(in srgb, var(--add-color, #888) 16%, transparent);
		border-style: solid;
	}

	.builder-icon-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		font-size: 0.72rem;
		color: var(--color-text-secondary, #888);
		background: transparent;
		border: 1px solid var(--color-border, #333);
		border-radius: 4px;
		cursor: pointer;
	}

	.builder-icon-btn.ghost {
		padding: 3px 5px;
		border: none;
		background: none;
	}

	.builder-icon-btn.ghost:hover {
		background: var(--color-surface-hover, #1e1e1e);
		color: var(--color-text-primary, #e0e0e0);
	}

	.builder-icon-btn.ghost.danger:hover {
		color: var(--color-error, #ef4444);
	}

	.builder-icon-btn.primary {
		color: var(--node-color);
		border-color: color-mix(in srgb, var(--node-color) 40%, transparent);
		background: color-mix(in srgb, var(--node-color) 10%, transparent);
	}

	.builder-icon-btn.primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--node-color) 18%, transparent);
	}

	.builder-icon-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.builder-add-slot {
		padding-left: 24px;
	}

	.builder-children {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.25rem;
		padding-left: 1.4rem;
		border-left: 1px dashed var(--color-border, #2a2a2a);
		margin-left: 10px;
	}
</style>
