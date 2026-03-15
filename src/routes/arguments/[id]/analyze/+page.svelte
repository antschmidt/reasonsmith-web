<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import { GET_ARGUMENT, BULK_INSERT_NODES, BULK_INSERT_EDGES, UPDATE_NODE } from '$lib/graphql/queries';
	import type { ArgumentNode, ArgumentEdge, ArgumentNodeType, ArgumentEdgeType } from '$lib/types/argument';
	import { NODE_TYPE_CONFIGS, EDGE_TYPE_CONFIGS } from '$lib/types/argument';
	import type { ExtractionResult, ExtractedNode, ExtractedEdge } from '$lib/types/argument';
	import { computeCompletenessScore, computeStructuralFlags } from '$lib/utils/argumentUtils';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		ArrowLeft,
		Sparkles,
		Check,
		X,
		Trash2,
		AlertTriangle,
		Edit3,
		Save,
		Eye,
		Loader2,
		FileText,
		Network,
		ChevronDown,
		ChevronUp
	} from '@lucide/svelte';

	const argumentId = $derived($page.params.id);

	let user = $state(nhost.auth.getUser());
	let loading = $state(true);
	let error = $state<string | null>(null);
	let argumentData = $state<{
		id: string;
		user_id: string;
		title: string;
		description: string | null;
		created_at: string;
		updated_at: string;
	} | null>(null);
	let existingNodes = $state<ArgumentNode[]>([]);
	let existingEdges = $state<ArgumentEdge[]>([]);

	// Input state
	let inputText = $state('');
	let extracting = $state(false);
	let extractionError = $state<string | null>(null);

	// Review state
	let extractionResult = $state<ExtractionResult | null>(null);
	let reviewNodes = $state<ExtractedNode[]>([]);
	let reviewEdges = $state<ExtractedEdge[]>([]);
	let removedNodeIds = $state<Set<string>>(new Set());
	let editingNodeId = $state<string | null>(null);
	let editContent = $state('');

	// Save state
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let saveSuccess = $state(false);

	// Confirm overwrite modal
	let showOverwriteConfirm = $state(false);

	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
	});

	onMount(() => {
		if (!user) {
			goto(`/login?redirectTo=/arguments/${argumentId}/analyze`);
			return;
		}
		loadArgument();
	});

	async function loadArgument() {
		loading = true;
		error = null;

		try {
			const result = await nhost.graphql.request(GET_ARGUMENT, { id: argumentId });

			if (result.error) {
				const msg = Array.isArray(result.error)
					? result.error[0]?.message
					: result.error.message;
				throw new Error(msg || 'Failed to load argument');
			}

			const arg = result.data?.argument_by_pk;
			if (!arg) throw new Error('Argument not found');
			if (arg.user_id !== user?.id) throw new Error('Permission denied');

			argumentData = {
				id: arg.id,
				user_id: arg.user_id,
				title: arg.title,
				description: arg.description ?? null,
				created_at: arg.created_at,
				updated_at: arg.updated_at
			};
			existingNodes = arg.argument_nodes || [];
			existingEdges = arg.argument_edges || [];
		} catch (err: any) {
			error = err.message || 'Failed to load argument';
		} finally {
			loading = false;
		}
	}

	// Computed values for review
	let activeNodes = $derived(reviewNodes.filter((n) => !removedNodeIds.has(n.id)));

	let activeEdges = $derived(
		reviewEdges.filter((e) => !removedNodeIds.has(e.from) && !removedNodeIds.has(e.to))
	);

	let reviewCompleteness = $derived.by(() => {
		const mockNodes = activeNodes.map((n) => ({
			id: n.id,
			argument_id: argumentId,
			type: n.type,
			content: n.content,
			is_root: extractionResult?.root_claim === n.id,
			implied: n.implied,
			verbatim_span: n.verbatim_span || null,
			score: null,
			metadata: {},
			draws_from: null,
			justifies: null,
			created_at: new Date().toISOString()
		})) as ArgumentNode[];
		return computeCompletenessScore(mockNodes);
	});

	let warrantConnections = $derived(extractionResult?.warrant_connections || []);

	let hasExistingGraph = $derived(existingNodes.length > 1 || existingEdges.length > 0);

	let nodeTypeSummary = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const node of activeNodes) {
			counts[node.type] = (counts[node.type] || 0) + 1;
		}
		return counts;
	});

	async function handleExtract() {
		if (!inputText.trim() || extracting) return;

		extracting = true;
		extractionError = null;
		extractionResult = null;
		reviewNodes = [];
		reviewEdges = [];
		removedNodeIds = new Set();

		try {
			const response = await fetch('/api/arguments/extract', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: inputText.trim() })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => null);
				throw new Error(errorData?.error || `Extraction failed (${response.status})`);
			}

			const result: ExtractionResult = await response.json();

			extractionResult = result;
			reviewNodes = [...result.nodes];
			reviewEdges = [...result.edges];
		} catch (err: any) {
			extractionError = err.message || 'Failed to extract argument graph';
		} finally {
			extracting = false;
		}
	}

	function removeNode(nodeId: string) {
		removedNodeIds = new Set([...removedNodeIds, nodeId]);
	}

	function restoreNode(nodeId: string) {
		const next = new Set(removedNodeIds);
		next.delete(nodeId);
		removedNodeIds = next;
	}

	function startEditNode(node: ExtractedNode) {
		editingNodeId = node.id;
		editContent = node.content;
	}

	function cancelEdit() {
		editingNodeId = null;
		editContent = '';
	}

	function saveEdit() {
		if (!editingNodeId || !editContent.trim()) return;

		reviewNodes = reviewNodes.map((n) =>
			n.id === editingNodeId ? { ...n, content: editContent.trim() } : n
		);
		editingNodeId = null;
		editContent = '';
	}

	function handleSaveClick() {
		if (hasExistingGraph) {
			showOverwriteConfirm = true;
		} else {
			executeSave();
		}
	}

	function closeOverwriteConfirm() {
		showOverwriteConfirm = false;
	}

	async function executeSave() {
		showOverwriteConfirm = false;
		saving = true;
		saveError = null;
		saveSuccess = false;

		try {
			// Step 1: Create nodes in the database (without edges first)
			const nodesToInsert = activeNodes.map((n) => {
				const isRoot = extractionResult?.root_claim === n.id;
				const warrantConn = warrantConnections.find((w) => w.warrant_node_id === n.id);

				return {
					id: crypto.randomUUID(),
					argument_id: argumentId,
					type: n.type,
					content: n.content,
					is_root: isRoot,
					implied: n.implied,
					verbatim_span: n.verbatim_span || null,
					metadata: {},
					// For warrant nodes, we'll set draws_from and justifies after ID mapping
					_temp_id: n.id,
					_draws_from_temp: warrantConn?.draws_from || null,
					_justifies_temp: warrantConn?.justifies || null
				};
			});

			// Build temp->real ID map
			const idMap = new Map<string, string>();
			for (const node of nodesToInsert) {
				idMap.set(node._temp_id, node.id);
			}

			// Resolve warrant references
			const dbNodes = nodesToInsert.map((n) => {
				const resolved: Record<string, unknown> = {
					id: n.id,
					argument_id: n.argument_id,
					type: n.type,
					content: n.content,
					is_root: n.is_root,
					implied: n.implied,
					verbatim_span: n.verbatim_span,
					metadata: n.metadata
				};

				if (n._draws_from_temp) {
					resolved.draws_from = idMap.get(n._draws_from_temp) || null;
				}
				if (n._justifies_temp) {
					resolved.justifies = idMap.get(n._justifies_temp) || null;
				}

				return resolved;
			});

			// Step 2: If existing graph, delete old nodes and edges first
			if (hasExistingGraph) {
				// Delete existing edges and nodes via GraphQL
				const deleteResult = await nhost.graphql.request(
					`mutation DeleteExistingGraph($argumentId: uuid!) {
						delete_argument_edge(where: { argument_id: { _eq: $argumentId } }) {
							affected_rows
						}
						delete_argument_node(where: { argument_id: { _eq: $argumentId } }) {
							affected_rows
						}
					}`,
					{ argumentId }
				);

				if (deleteResult.error) {
					const msg = Array.isArray(deleteResult.error)
						? deleteResult.error[0]?.message
						: deleteResult.error.message;
					throw new Error(msg || 'Failed to clear existing graph');
				}
			}

			// Step 3: Insert nodes
			const nodeResult = await nhost.graphql.request(BULK_INSERT_NODES, {
				nodes: dbNodes
			});

			if (nodeResult.error) {
				const msg = Array.isArray(nodeResult.error)
					? nodeResult.error[0]?.message
					: nodeResult.error.message;
				throw new Error(msg || 'Failed to insert nodes');
			}

			// Step 4: Create edges with resolved IDs
			const dbEdges = activeEdges
				.map((e) => {
					const fromId = idMap.get(e.from);
					const toId = idMap.get(e.to);

					if (!fromId || !toId) return null;

					return {
						argument_id: argumentId,
						from_node: fromId,
						to_node: toId,
						type: e.type,
						confidence: e.confidence,
						weight: 1.0,
						metadata: {}
					};
				})
				.filter(Boolean);

			if (dbEdges.length > 0) {
				const edgeResult = await nhost.graphql.request(BULK_INSERT_EDGES, {
					edges: dbEdges
				});

				if (edgeResult.error) {
					const msg = Array.isArray(edgeResult.error)
						? edgeResult.error[0]?.message
						: edgeResult.error.message;
					throw new Error(msg || 'Failed to insert edges');
				}
			}

			saveSuccess = true;

			// Redirect to builder after a brief pause
			setTimeout(() => {
				goto(`/arguments/${argumentId}/build`);
			}, 1500);
		} catch (err: any) {
			saveError = err.message || 'Failed to save argument graph';
		} finally {
			saving = false;
		}
	}

	function truncate(text: string, maxLength: number = 60): string {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 3) + '...';
	}

	function getNodeById(nodeId: string): ExtractedNode | undefined {
		return reviewNodes.find((n) => n.id === nodeId);
	}

	function charCount(text: string): string {
		const len = text.length;
		if (len < 1000) return `${len} chars`;
		return `${(len / 1000).toFixed(1)}k chars`;
	}

	let expandedFlags = $state(false);
</script>

<svelte:head>
	<title>AI Extract — {argumentData?.title || 'Argument'} | ReasonSmith</title>
</svelte:head>

{#if loading}
	<div class="center-state">
		<div class="spinner"></div>
		<p>Loading argument...</p>
	</div>
{:else if error && !argumentData}
	<div class="center-state">
		<p class="error-text">{error}</p>
		<Button variant="secondary" onclick={() => goto('/arguments')}>
			{#snippet icon()}<ArrowLeft size={16} />{/snippet}
			Back to Arguments
		</Button>
	</div>
{:else if argumentData}
	<div class="analyze-page">
		<!-- Top Bar -->
		<header class="top-bar">
			<a href="/arguments/{argumentId}/build" class="back-link">
				<ArrowLeft size={18} />
				<span>Back to Builder</span>
			</a>
			<div class="top-bar-title">
				<Sparkles size={18} />
				<span>AI Extraction</span>
			</div>
			<div class="top-bar-spacer"></div>
		</header>

		<div class="page-content">
			<!-- Left: Input Section -->
			<section class="input-section" class:collapsed={extractionResult !== null}>
				<div class="section-header">
					<h2>
						<FileText size={18} />
						Source Text
					</h2>
					{#if inputText.trim()}
						<span class="char-count">{charCount(inputText)}</span>
					{/if}
				</div>

				<div class="input-body">
					<textarea
						class="text-input"
						bind:value={inputText}
						placeholder="Paste the text you want to analyze. The AI will extract claims, evidence, warrants, counter-arguments, and their relationships into a structured argument graph.

You can paste:
• An essay or article
• A debate transcript
• A research paper abstract
• An opinion piece
• A social media thread"
						rows="16"
						disabled={extracting}
					></textarea>

					{#if extractionError}
						<div class="extraction-error">
							<AlertTriangle size={14} />
							<span>{extractionError}</span>
						</div>
					{/if}

					<div class="input-actions">
						{#if hasExistingGraph}
							<p class="overwrite-warning">
								<AlertTriangle size={14} />
								This argument already has {existingNodes.length} nodes. Extraction will replace the existing graph.
							</p>
						{/if}

						<Button
							variant="primary"
							onclick={handleExtract}
							disabled={!inputText.trim() || extracting}
							loading={extracting}
						>
							{#snippet icon()}<Sparkles size={16} />{/snippet}
							{extracting ? 'Extracting...' : 'Extract Argument Graph'}
						</Button>
					</div>
				</div>
			</section>

			<!-- Right: Review Section -->
			{#if extracting}
				<section class="review-section">
					<div class="extracting-state">
						<div class="extraction-animation">
							<div class="pulse-ring"></div>
							<Sparkles size={32} />
						</div>
						<h3>Analyzing text...</h3>
						<p>
							Identifying claims, evidence, warrants, counter-arguments, and their relationships.
						</p>
						<p class="extraction-hint">This usually takes 10–30 seconds.</p>
					</div>
				</section>
			{:else if extractionResult}
				<section class="review-section">
					<div class="section-header">
						<h2>
							<Network size={18} />
							Review Extracted Graph
						</h2>
						<div class="review-stats">
							<span class="stat">{activeNodes.length} nodes</span>
							<span class="stat-sep">·</span>
							<span class="stat">{activeEdges.length} edges</span>
							<span class="stat-sep">·</span>
							<span class="stat">{reviewCompleteness.score}% complete</span>
						</div>
					</div>

					<!-- Completeness summary -->
					<div class="completeness-summary">
						<div class="completeness-bar-track">
							<div
								class="completeness-bar-fill"
								class:low={reviewCompleteness.score <= 20}
								class:mid={reviewCompleteness.score > 20 && reviewCompleteness.score <= 60}
								class:high={reviewCompleteness.score > 60}
								style="width: {reviewCompleteness.score}%"
							></div>
						</div>
						<div class="type-summary">
							{#each Object.entries(nodeTypeSummary) as [type, count]}
								{@const config = NODE_TYPE_CONFIGS[type as ArgumentNodeType]}
								{#if config}
									<span class="type-pill" style="--pill-color: {config.color}">
										<span class="pill-dot"></span>
										{config.label}: {count}
									</span>
								{/if}
							{/each}
						</div>
					</div>

					<!-- Structural flags from extraction -->
					{#if extractionResult.structural_flags.length > 0}
						<div class="extraction-flags">
							<button
								class="flags-toggle"
								onclick={() => (expandedFlags = !expandedFlags)}
							>
								<AlertTriangle size={14} />
								<span>{extractionResult.structural_flags.length} structural {extractionResult.structural_flags.length === 1 ? 'issue' : 'issues'} detected</span>
								{#if expandedFlags}
									<ChevronUp size={14} />
								{:else}
									<ChevronDown size={14} />
								{/if}
							</button>
							{#if expandedFlags}
								<ul class="flags-list">
									{#each extractionResult.structural_flags as flag}
										<li>{flag.replace(/_/g, ' ')}</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}

					<!-- Notes from extraction -->
					{#if extractionResult.notes}
						<div class="extraction-notes">
							<p>{extractionResult.notes}</p>
						</div>
					{/if}

					<!-- Node cards -->
					<div class="review-nodes">
						{#each reviewNodes as node (node.id)}
							{@const config = NODE_TYPE_CONFIGS[node.type]}
							{@const isRemoved = removedNodeIds.has(node.id)}
							{@const isRoot = extractionResult.root_claim === node.id}
							{@const isEditing = editingNodeId === node.id}
							{@const nodeEdges = activeEdges.filter(
								(e) => e.from === node.id || e.to === node.id
							)}
							{@const warrantConn = warrantConnections.find(
								(w) => w.warrant_node_id === node.id
							)}

							<div
								class="review-card"
								class:removed={isRemoved}
								class:editing={isEditing}
								style="--node-color: {config.color}; --node-bg: {config.bgColor}"
							>
								<!-- Card Header -->
								<div class="review-card-header">
									<div class="review-type-badge">
										<span class="review-type-dot"></span>
										<span class="review-type-label">{config.label}</span>
										{#if isRoot}
											<span class="root-tag">Root</span>
										{/if}
										{#if node.implied}
											<span class="implied-tag">implied</span>
										{/if}
									</div>

									<div class="review-card-actions">
										{#if isRemoved}
											<button
												class="action-btn restore"
												onclick={() => restoreNode(node.id)}
												title="Restore node"
											>
												Restore
											</button>
										{:else}
											<button
												class="action-btn edit"
												onclick={() => startEditNode(node)}
												title="Edit content"
											>
												<Edit3 size={13} />
											</button>
											{#if !isRoot}
												<button
													class="action-btn delete"
													onclick={() => removeNode(node.id)}
													title="Remove node"
												>
													<Trash2 size={13} />
												</button>
											{/if}
										{/if}
									</div>
								</div>

								<!-- Content -->
								{#if isEditing}
									<div class="edit-area">
										<textarea
											class="edit-textarea"
											bind:value={editContent}
											rows="3"
											style="--focus-color: {config.color}"
										></textarea>
										<div class="edit-actions">
											<button class="edit-btn cancel" onclick={cancelEdit}>Cancel</button>
											<button
												class="edit-btn save"
												onclick={saveEdit}
												disabled={!editContent.trim()}
												style="--btn-color: {config.color}"
											>
												<Save size={12} />
												Save
											</button>
										</div>
									</div>
								{:else}
									<p class="review-content" class:dimmed={isRemoved}>
										{node.content}
									</p>
								{/if}

								<!-- Verbatim span -->
								{#if node.verbatim_span && !isRemoved}
									<div class="verbatim-span">
										<span class="verbatim-label">Verbatim:</span>
										<span class="verbatim-text">"{truncate(node.verbatim_span, 80)}"</span>
									</div>
								{/if}

								<!-- Warrant connections -->
								{#if node.type === 'warrant' && warrantConn && !isRemoved}
									<div class="warrant-links">
										{@const drawsFromNode = getNodeById(warrantConn.draws_from)}
										{@const justifiesNode = getNodeById(warrantConn.justifies)}
										{#if drawsFromNode}
											<div class="warrant-link-row">
												<span
													class="warrant-label"
													style="color: {NODE_TYPE_CONFIGS['evidence'].color}"
												>
													Draws From
												</span>
												<span class="warrant-ref">{truncate(drawsFromNode.content, 50)}</span>
											</div>
										{/if}
										{#if justifiesNode}
											<div class="warrant-link-row">
												<span
													class="warrant-label"
													style="color: {NODE_TYPE_CONFIGS['claim'].color}"
												>
													Justifies
												</span>
												<span class="warrant-ref">{truncate(justifiesNode.content, 50)}</span>
											</div>
										{/if}
									</div>
								{/if}

								<!-- Connected edges (non-warrant) -->
								{#if nodeEdges.length > 0 && !isRemoved && node.type !== 'warrant'}
									<div class="review-edges">
										{#each nodeEdges as edge}
											{@const isOutgoing = edge.from === node.id}
											{@const otherNodeId = isOutgoing ? edge.to : edge.from}
											{@const otherNode = getNodeById(otherNodeId)}
											{#if otherNode && !removedNodeIds.has(otherNodeId)}
												<div class="edge-row">
													<span class="edge-direction">{isOutgoing ? '→' : '←'}</span>
													<span class="edge-type">{edge.type.replace('_', ' ')}</span>
													<span
														class="edge-target-dot"
														style="background: {NODE_TYPE_CONFIGS[otherNode.type]?.color || '#666'}"
													></span>
													<span class="edge-target-text">
														{truncate(otherNode.content, 35)}
													</span>
													{#if edge.confidence < 1}
														<span class="edge-confidence">{Math.round(edge.confidence * 100)}%</span>
													{/if}
												</div>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Save Actions -->
					<div class="save-section">
						{#if saveError}
							<div class="save-error">
								<AlertTriangle size={14} />
								<span>{saveError}</span>
							</div>
						{/if}

						{#if saveSuccess}
							<div class="save-success">
								<Check size={16} />
								<span>Argument graph saved! Redirecting to builder...</span>
							</div>
						{:else}
							<div class="save-actions">
								<Button variant="ghost" onclick={() => (extractionResult = null)}>
									Discard & Start Over
								</Button>
								<Button
									variant="primary"
									onclick={handleSaveClick}
									disabled={activeNodes.length === 0 || saving}
									loading={saving}
								>
									{#snippet icon()}<Save size={16} />{/snippet}
									{saving ? 'Saving...' : `Save ${activeNodes.length} Nodes to Graph`}
								</Button>
							</div>
						{/if}
					</div>
				</section>
			{/if}
		</div>
	</div>

	<!-- Overwrite Confirmation Modal -->
	<Modal
		show={showOverwriteConfirm}
		onClose={closeOverwriteConfirm}
		title="Replace Existing Graph?"
		size="sm"
	>
		{#snippet children()}
			<p class="overwrite-modal-text">
				This argument already has <strong>{existingNodes.length} nodes</strong> and
				<strong>{existingEdges.length} edges</strong>. Saving the extracted graph will
				<strong>replace all existing nodes and edges</strong>.
			</p>
			<p class="overwrite-modal-warning">This action cannot be undone.</p>
		{/snippet}

		{#snippet footer()}
			<Button variant="ghost" onclick={closeOverwriteConfirm}>Cancel</Button>
			<Button variant="danger" onclick={executeSave}>Replace Graph</Button>
		{/snippet}
	</Modal>
{/if}

<style>
	/* Layout */
	.analyze-page {
		display: flex;
		flex-direction: column;
		min-height: calc(100dvh - 50px);
	}

	.top-bar {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-md);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
		min-height: 48px;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.85rem;
		padding: 4px 8px;
		border-radius: var(--border-radius-sm);
		transition: all var(--transition-fast) ease;
	}

	.back-link:hover {
		color: var(--color-primary);
		background: var(--color-surface-alt);
	}

	.top-bar-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text-primary);
		font-family: var(--font-family-ui);
	}

	.top-bar-spacer {
		flex: 1;
	}

	.page-content {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	/* Center States */
	.center-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		gap: var(--space-md);
		color: var(--color-text-secondary);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-text {
		color: var(--color-error);
	}

	/* Input Section */
	.input-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		max-width: 50%;
		min-width: 350px;
		overflow: hidden;
	}

	.input-section.collapsed {
		flex: 0 0 380px;
		min-width: 300px;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.section-header h2 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text-primary);
		font-family: var(--font-family-ui);
	}

	.char-count {
		font-size: 0.7rem;
		color: var(--color-text-tertiary);
		font-family: var(--font-family-ui);
		font-variant-numeric: tabular-nums;
	}

	.input-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: var(--space-md);
		gap: var(--space-md);
		overflow-y: auto;
	}

	.text-input {
		flex: 1;
		width: 100%;
		padding: var(--space-md);
		background: var(--color-input-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		font-family: var(--font-family-serif);
		font-size: 0.9rem;
		line-height: 1.7;
		color: var(--color-text-primary);
		resize: vertical;
		min-height: 200px;
		box-sizing: border-box;
		transition: border-color var(--transition-fast) ease;
	}

	.text-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.text-input::placeholder {
		color: var(--color-text-tertiary);
		font-style: italic;
		opacity: 0.7;
		line-height: 1.8;
	}

	.text-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.extraction-error {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm);
		background: color-mix(in srgb, var(--color-error) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-error);
		font-size: 0.8rem;
	}

	.input-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		align-items: flex-end;
	}

	.overwrite-warning {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: var(--space-sm);
		background: color-mix(in srgb, var(--color-warning) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 20%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-warning);
		font-size: 0.8rem;
		margin: 0;
		line-height: 1.4;
	}

	/* Review Section */
	.review-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	.review-stats {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
		font-family: var(--font-family-ui);
	}

	.stat {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.stat-sep {
		opacity: 0.4;
	}

	/* Extracting State */
	.extracting-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: var(--space-md);
		padding: var(--space-2xl);
		text-align: center;
	}

	.extraction-animation {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 80px;
		height: 80px;
		color: var(--color-primary);
	}

	.pulse-ring {
		position: absolute;
		inset: 0;
		border: 2px solid var(--color-primary);
		border-radius: 50%;
		opacity: 0.3;
		animation: pulse-expand 2s ease-in-out infinite;
	}

	@keyframes pulse-expand {
		0%,
		100% {
			transform: scale(0.8);
			opacity: 0.3;
		}
		50% {
			transform: scale(1.2);
			opacity: 0.1;
		}
	}

	.extracting-state h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.extracting-state p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		max-width: 360px;
		line-height: 1.5;
	}

	.extraction-hint {
		font-style: italic;
		opacity: 0.6;
	}

	/* Completeness Summary */
	.completeness-summary {
		padding: var(--space-xs) var(--space-md);
		border-bottom: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.completeness-bar-track {
		height: 4px;
		border-radius: 2px;
		background: var(--color-surface-alt);
		overflow: hidden;
	}

	.completeness-bar-fill {
		height: 100%;
		border-radius: 2px;
		transition: width 0.4s ease;
	}

	.completeness-bar-fill.low {
		background: var(--color-error);
	}

	.completeness-bar-fill.mid {
		background: var(--color-warning);
	}

	.completeness-bar-fill.high {
		background: var(--color-success);
	}

	.type-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.type-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: var(--border-radius-full);
		background: color-mix(in srgb, var(--pill-color) 8%, transparent);
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--pill-color);
		font-family: var(--font-family-ui);
		letter-spacing: 0.02em;
	}

	.pill-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--pill-color);
	}

	/* Extraction Flags */
	.extraction-flags {
		margin: 0 var(--space-md);
		margin-top: var(--space-xs);
	}

	.flags-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 6px var(--space-sm);
		background: color-mix(in srgb, var(--color-warning) 6%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 15%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-warning);
		font-size: 0.75rem;
		font-weight: 500;
		font-family: var(--font-family-ui);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
		text-align: left;
	}

	.flags-toggle:hover {
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
	}

	.flags-toggle span {
		flex: 1;
	}

	.flags-list {
		margin: 4px 0 0 0;
		padding: 6px var(--space-sm) 6px var(--space-lg);
		list-style: disc;
		font-size: 0.75rem;
		color: var(--color-warning);
		line-height: 1.6;
	}

	/* Extraction Notes */
	.extraction-notes {
		padding: var(--space-xs) var(--space-md);
	}

	.extraction-notes p {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-text-tertiary);
		font-style: italic;
		line-height: 1.5;
	}

	/* Review Nodes */
	.review-nodes {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-sm) var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.review-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--node-color);
		border-radius: var(--border-radius-sm);
		transition: all var(--transition-fast) ease;
		overflow: hidden;
	}

	.review-card:hover {
		border-color: color-mix(in srgb, var(--node-color) 40%, var(--color-border));
	}

	.review-card.removed {
		opacity: 0.4;
		border-left-style: dashed;
	}

	.review-card.editing {
		border-color: var(--node-color);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--node-color) 20%, transparent);
	}

	.review-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xs);
		padding: 8px 10px 0 10px;
	}

	.review-type-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.review-type-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--node-color);
		flex-shrink: 0;
	}

	.review-type-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--node-color);
		font-family: var(--font-family-ui);
	}

	.root-tag {
		display: inline-flex;
		align-items: center;
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
	}

	.implied-tag {
		padding: 1px 5px;
		border-radius: var(--border-radius-full);
		background: color-mix(in srgb, var(--color-text-tertiary) 10%, transparent);
		color: var(--color-text-tertiary);
		font-size: 0.55rem;
		font-weight: 600;
		font-style: italic;
		font-family: var(--font-family-ui);
	}

	.review-card-actions {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 6px;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--border-radius-sm);
		color: var(--color-text-tertiary);
		font-size: 0.7rem;
		font-weight: 500;
		font-family: var(--font-family-ui);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
	}

	.action-btn.edit:hover {
		color: var(--color-primary);
		border-color: var(--color-border);
		background: var(--color-surface-alt);
	}

	.action-btn.delete:hover {
		color: var(--color-error);
		border-color: color-mix(in srgb, var(--color-error) 25%, transparent);
		background: color-mix(in srgb, var(--color-error) 5%, transparent);
	}

	.action-btn.restore {
		color: var(--color-success);
		border-color: color-mix(in srgb, var(--color-success) 25%, transparent);
		background: color-mix(in srgb, var(--color-success) 5%, transparent);
	}

	.action-btn.restore:hover {
		background: color-mix(in srgb, var(--color-success) 10%, transparent);
		border-color: var(--color-success);
	}

	/* Content */
	.review-content {
		margin: 0;
		padding: 6px 10px 8px 10px;
		font-family: var(--font-family-serif);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--color-text-primary);
		word-break: break-word;
	}

	.review-content.dimmed {
		text-decoration: line-through;
		color: var(--color-text-tertiary);
	}

	/* Edit Area */
	.edit-area {
		padding: 6px 10px 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.edit-textarea {
		width: 100%;
		padding: var(--space-sm);
		background: var(--color-input-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		font-family: var(--font-family-serif);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--color-text-primary);
		resize: vertical;
		min-height: 60px;
		box-sizing: border-box;
	}

	.edit-textarea:focus {
		outline: none;
		border-color: var(--focus-color, var(--color-primary));
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}

	.edit-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: var(--border-radius-sm);
		font-size: 0.75rem;
		font-weight: 500;
		font-family: var(--font-family-ui);
		cursor: pointer;
		transition: all var(--transition-fast) ease;
	}

	.edit-btn.cancel {
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
	}

	.edit-btn.cancel:hover {
		background: var(--color-surface-alt);
	}

	.edit-btn.save {
		background: color-mix(in srgb, var(--btn-color, var(--color-primary)) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--btn-color, var(--color-primary)) 35%, transparent);
		color: var(--btn-color, var(--color-primary));
	}

	.edit-btn.save:hover:not(:disabled) {
		background: color-mix(in srgb, var(--btn-color, var(--color-primary)) 20%, transparent);
	}

	.edit-btn.save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Verbatim Span */
	.verbatim-span {
		padding: 0 10px 6px 10px;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	.verbatim-label {
		font-weight: 600;
		color: var(--color-text-tertiary);
		font-family: var(--font-family-ui);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.6rem;
	}

	.verbatim-text {
		color: var(--color-text-tertiary);
		font-family: var(--font-family-serif);
		font-style: italic;
	}

	/* Warrant Links */
	.warrant-links {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 10px 8px 10px;
	}

	.warrant-link-row {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		font-size: 0.72rem;
	}

	.warrant-label {
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-family: var(--font-family-ui);
		font-size: 0.6rem;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.warrant-ref {
		color: var(--color-text-secondary);
		font-family: var(--font-family-serif);
		font-size: 0.75rem;
	}

	/* Edge rows */
	.review-edges {
		padding: 0 10px 8px 10px;
		border-top: 1px solid var(--color-border);
		margin-top: 4px;
		padding-top: 6px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.edge-row {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 0.7rem;
		color: var(--color-text-tertiary);
	}

	.edge-direction {
		color: var(--color-text-tertiary);
		opacity: 0.5;
		font-size: 0.6rem;
	}

	.edge-type {
		font-weight: 600;
		font-family: var(--font-family-ui);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.6rem;
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.edge-target-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.edge-target-text {
		font-family: var(--font-family-serif);
		font-size: 0.72rem;
		color: var(--color-text-secondary);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.edge-confidence {
		font-size: 0.6rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-tertiary);
		opacity: 0.7;
		flex-shrink: 0;
	}

	/* Save Section */
	.save-section {
		flex-shrink: 0;
		padding: var(--space-md);
		border-top: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.save-error {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm);
		background: color-mix(in srgb, var(--color-error) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-error);
		font-size: 0.8rem;
	}

	.save-success {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm);
		background: color-mix(in srgb, var(--color-success) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent);
		border-radius: var(--border-radius-sm);
		color: var(--color-success);
		font-size: 0.85rem;
		font-weight: 500;
	}

	.save-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-sm);
	}

	/* Overwrite Modal */
	.overwrite-modal-text {
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0 0 var(--space-sm) 0;
	}

	.overwrite-modal-text strong {
		color: var(--color-text-primary);
	}

	.overwrite-modal-warning {
		color: var(--color-error);
		font-size: 0.85rem;
		font-weight: 500;
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.page-content {
			flex-direction: column;
			overflow-y: auto;
		}

		.input-section {
			max-width: none;
			min-width: 0;
			border-right: none;
			border-bottom: 1px solid var(--color-border);
		}

		.input-section.collapsed {
			flex: 0 0 auto;
			min-width: 0;
		}

		.text-input {
			min-height: 150px;
		}

		.review-section {
			flex: 0 0 auto;
		}

		.review-nodes {
			max-height: none;
			overflow-y: visible;
		}

		.back-link span {
			display: none;
		}

		.save-actions {
			flex-direction: column;
		}

		.save-actions :global(.btn) {
			width: 100%;
		}
	}
</style>
