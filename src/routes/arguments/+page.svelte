<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import {
		LIST_ARGUMENTS,
		CREATE_ARGUMENT,
		CREATE_ARGUMENT_SHELL,
		DELETE_ARGUMENT
	} from '$lib/graphql/queries';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { Argument } from '$lib/types/argument';
	import { Plus, Trash2, ChevronRight, Network, Sparkles, FileText } from '@lucide/svelte';

	let user = $state(nhost.auth.getUser());
	let loading = $state(true);
	let error = $state<string | null>(null);
	let arguments_ = $state<Argument[]>([]);

	// New argument modal state
	let showNewModal = $state(false);
	let newTitle = $state('');
	let newRootClaim = $state('');
	let newDescription = $state('');
	let creating = $state(false);
	let createError = $state<string | null>(null);

	// Extract modal state
	let showExtractModal = $state(false);
	let extractTitle = $state('');
	let extractDescription = $state('');
	let creatingForExtract = $state(false);
	let extractCreateError = $state<string | null>(null);

	// Delete confirmation
	let deleteTarget = $state<Argument | null>(null);
	let deleting = $state(false);

	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
		if (user) {
			loadArguments();
		}
	});

	onMount(() => {
		if (!user) {
			goto('/login?redirectTo=/arguments');
			return;
		}
		loadArguments();
	});

	async function loadArguments() {
		loading = true;
		error = null;

		try {
			const result = await nhost.graphql.request(LIST_ARGUMENTS, {
				userId: user?.id,
				limit: 50,
				offset: 0
			});

			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				throw new Error(msg || 'Failed to load arguments');
			}

			arguments_ = result.data?.argument || [];
		} catch (err: any) {
			error = err.message || 'Failed to load arguments';
		} finally {
			loading = false;
		}
	}

	function openNewModal() {
		newTitle = '';
		newRootClaim = '';
		newDescription = '';
		createError = null;
		showNewModal = true;
	}

	function closeNewModal() {
		showNewModal = false;
	}

	function openExtractModal() {
		extractTitle = '';
		extractDescription = '';
		extractCreateError = null;
		showExtractModal = true;
	}

	function closeExtractModal() {
		showExtractModal = false;
	}

	async function createArgumentForExtraction() {
		if (!user || !extractTitle.trim()) return;

		creatingForExtract = true;
		extractCreateError = null;

		try {
			const result = await nhost.graphql.request(CREATE_ARGUMENT_SHELL, {
				userId: user.id,
				title: extractTitle.trim(),
				description: extractDescription.trim() || null
			});

			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				throw new Error(msg || 'Failed to create argument');
			}

			const newArg = result.data?.insert_argument_one;
			if (newArg) {
				goto(`/arguments/${newArg.id}/analyze`);
			}
		} catch (err: any) {
			extractCreateError = err.message || 'Failed to create argument';
		} finally {
			creatingForExtract = false;
		}
	}

	async function createArgument() {
		if (!user || !newTitle.trim() || !newRootClaim.trim()) return;

		creating = true;
		createError = null;

		try {
			const result = await nhost.graphql.request(CREATE_ARGUMENT, {
				userId: user.id,
				title: newTitle.trim(),
				rootClaimContent: newRootClaim.trim(),
				description: newDescription.trim() || null
			});

			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				throw new Error(msg || 'Failed to create argument');
			}

			const newArg = result.data?.insert_argument_one;
			if (newArg) {
				// Navigate to the builder
				goto(`/arguments/${newArg.id}/build`);
			}
		} catch (err: any) {
			createError = err.message || 'Failed to create argument';
		} finally {
			creating = false;
		}
	}

	function confirmDelete(arg: Argument) {
		deleteTarget = arg;
	}

	function cancelDelete() {
		deleteTarget = null;
	}

	async function executeDelete() {
		if (!deleteTarget) return;

		deleting = true;

		try {
			const result = await nhost.graphql.request(DELETE_ARGUMENT, {
				id: deleteTarget.id
			});

			if (result.error) {
				const msg = Array.isArray(result.error) ? result.error[0]?.message : result.error.message;
				throw new Error(msg || 'Failed to delete argument');
			}

			// Remove from list
			arguments_ = arguments_.filter((a) => a.id !== deleteTarget!.id);
			deleteTarget = null;
		} catch (err: any) {
			error = err.message || 'Failed to delete argument';
		} finally {
			deleting = false;
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function truncate(text: string, maxLength: number = 100): string {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 3) + '...';
	}
</script>

<svelte:head>
	<title>My Argument Drafts | ReasonSmith</title>
</svelte:head>

<div class="page-container">
	<header class="page-header">
		<div class="header-content">
			<div class="header-text">
				<h1>
					<Network size={32} strokeWidth={1.5} />
					My Argument Drafts
				</h1>
				<p class="subtitle">
					Build and refine arguments for your discussions, posts, and comments.
				</p>
			</div>
			<div class="header-actions">
				<Button variant="secondary" onclick={openExtractModal}>
					{#snippet icon()}<Sparkles size={18} />{/snippet}
					Extract from Text
				</Button>
				<Button variant="primary" onclick={openNewModal}>
					{#snippet icon()}<Plus size={18} />{/snippet}
					Build Manually
				</Button>
			</div>
		</div>
	</header>

	<main class="main-content">
		{#if error}
			<div class="error-banner">
				<p>{error}</p>
				<button onclick={() => (error = null)}>Dismiss</button>
			</div>
		{/if}

		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading arguments...</p>
			</div>
		{:else if arguments_.length === 0}
			<div class="empty-state">
				<Network size={64} strokeWidth={1} />
				<h2>No argument drafts yet</h2>
				<p>Start building an argument to structure your next discussion, post, or comment.</p>
				<div class="empty-state-actions">
					<Button variant="secondary" onclick={openExtractModal}>
						{#snippet icon()}<Sparkles size={18} />{/snippet}
						Extract from Text
					</Button>
					<Button variant="primary" onclick={openNewModal}>
						{#snippet icon()}<Plus size={18} />{/snippet}
						Build Manually
					</Button>
				</div>
			</div>
		{:else}
			<div class="arguments-grid">
				{#each arguments_ as arg}
					<article class="argument-card">
						<a href="/arguments/{arg.id}/build" class="card-link">
							<header class="card-header">
								<h2>{arg.title}</h2>
								<ChevronRight size={20} />
							</header>

							{#if arg.discussion_id}
								<span class="linked-badge discussion-linked"> Linked to discussion </span>
							{:else if arg.post_id}
								<span class="linked-badge post-linked"> Linked to comment </span>
							{:else}
								<span class="linked-badge standalone"> Standalone draft </span>
							{/if}

							{#if arg.root_node?.[0]?.content}
								<p class="root-claim">
									<span class="claim-label">Root Claim:</span>
									{truncate(arg.root_node[0].content)}
								</p>
							{/if}

							{#if arg.description}
								<p class="description">{truncate(arg.description, 150)}</p>
							{/if}

							<footer class="card-footer">
								<span class="node-count">
									{arg.argument_nodes_aggregate?.aggregate?.count || 0} nodes
								</span>
								<time datetime={arg.updated_at}>
									{formatDate(arg.updated_at)}
								</time>
							</footer>
						</a>

						<button
							class="delete-button"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								confirmDelete(arg);
							}}
							title="Delete argument"
						>
							<Trash2 size={16} />
						</button>
					</article>
				{/each}
			</div>
		{/if}
	</main>
</div>

<!-- New Argument Modal -->
<Modal show={showNewModal} onClose={closeNewModal} title="New Argument" size="md">
	{#snippet children()}
		<form
			class="new-argument-form"
			onsubmit={(e) => {
				e.preventDefault();
				createArgument();
			}}
		>
			{#if createError}
				<div class="form-error">{createError}</div>
			{/if}

			<div class="form-group">
				<label for="title">Title</label>
				<input
					id="title"
					type="text"
					bind:value={newTitle}
					placeholder="Give your argument a descriptive title..."
					required
				/>
			</div>

			<div class="form-group">
				<label for="rootClaim">Root Claim</label>
				<textarea
					id="rootClaim"
					bind:value={newRootClaim}
					placeholder="State your main thesis or central claim..."
					rows="3"
					required
				></textarea>
				<p class="help-text">This is the main point you're arguing for.</p>
			</div>

			<div class="form-group">
				<label for="description">Description (optional)</label>
				<textarea
					id="description"
					bind:value={newDescription}
					placeholder="Add context or background for this argument..."
					rows="2"
				></textarea>
			</div>
		</form>
	{/snippet}

	{#snippet footer()}
		<Button variant="ghost" onclick={closeNewModal}>Cancel</Button>
		<Button
			variant="primary"
			onclick={createArgument}
			disabled={!newTitle.trim() || !newRootClaim.trim()}
			loading={creating}
		>
			Create & Build
		</Button>
	{/snippet}
</Modal>

<!-- Delete Confirmation Modal -->
<Modal show={deleteTarget !== null} onClose={cancelDelete} title="Delete Argument?" size="sm">
	{#snippet children()}
		<p class="delete-warning">
			Are you sure you want to delete "<strong>{deleteTarget?.title}</strong>"? This will
			permanently remove the argument and all its nodes.
		</p>
	{/snippet}

	{#snippet footer()}
		<Button variant="ghost" onclick={cancelDelete}>Cancel</Button>
		<Button variant="danger" onclick={executeDelete} loading={deleting}>Delete</Button>
	{/snippet}
</Modal>

<!-- Extract from Text Modal -->
<Modal show={showExtractModal} onClose={closeExtractModal} title="Extract from Text" size="md">
	{#snippet children()}
		<form
			class="new-argument-form"
			onsubmit={(e) => {
				e.preventDefault();
				createArgumentForExtraction();
			}}
		>
			{#if extractCreateError}
				<div class="form-error">{extractCreateError}</div>
			{/if}

			<div class="extract-intro">
				<div class="extract-intro-icon">
					<Sparkles size={24} />
				</div>
				<p>
					Give your argument a title, then paste or type the text you want to analyze. AI will
					extract claims, evidence, warrants, and more into a structured argument graph.
				</p>
			</div>

			<div class="form-group">
				<label for="extractTitle">Title</label>
				<input
					id="extractTitle"
					type="text"
					bind:value={extractTitle}
					placeholder="Give your argument a descriptive title..."
					required
				/>
			</div>

			<div class="form-group">
				<label for="extractDescription">Description (optional)</label>
				<textarea
					id="extractDescription"
					bind:value={extractDescription}
					placeholder="Add context or background..."
					rows="2"
				></textarea>
			</div>
		</form>
	{/snippet}

	{#snippet footer()}
		<Button variant="ghost" onclick={closeExtractModal}>Cancel</Button>
		<Button
			variant="primary"
			onclick={createArgumentForExtraction}
			disabled={!extractTitle.trim()}
			loading={creatingForExtract}
		>
			{#snippet icon()}<FileText size={16} />{/snippet}
			Continue to Extract
		</Button>
	{/snippet}
</Modal>

<style>
	.page-container {
		min-height: 100vh;
		padding: var(--space-lg);
		max-width: 1200px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--space-xl);
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-md);
		flex-wrap: wrap;
	}

	.header-text h1 {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-family: var(--font-family-display);
		font-size: 2rem;
		margin: 0 0 var(--space-xs) 0;
	}

	.subtitle {
		color: var(--color-text-secondary);
		font-size: 1rem;
		margin: 0;
	}

	.header-actions {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		flex-shrink: 0;
	}

	.main-content {
		min-height: 400px;
	}

	/* Error Banner */
	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-sm) var(--space-md);
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		border: 1px solid var(--color-error);
		border-radius: var(--border-radius-md);
		margin-bottom: var(--space-md);
	}

	.error-banner p {
		margin: 0;
		color: var(--color-error);
	}

	.error-banner button {
		background: none;
		border: none;
		color: var(--color-error);
		cursor: pointer;
		font-size: 0.875rem;
		text-decoration: underline;
	}

	/* Loading State */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl);
		color: var(--color-text-secondary);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: var(--space-md);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl);
		text-align: center;
		color: var(--color-text-secondary);
	}

	.empty-state h2 {
		font-size: 1.5rem;
		margin: var(--space-md) 0 var(--space-xs) 0;
		color: var(--color-text-primary);
	}

	.empty-state p {
		margin: 0 0 var(--space-lg) 0;
	}

	.empty-state-actions {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
	}

	/* Extract intro */
	.extract-intro {
		display: flex;
		gap: var(--space-md);
		align-items: flex-start;
		padding: var(--space-md);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-radius: var(--border-radius-md);
	}

	.extract-intro-icon {
		flex-shrink: 0;
		color: var(--color-primary);
		padding-top: 2px;
	}

	.extract-intro p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	/* Arguments Grid */
	.arguments-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--space-md);
	}

	.argument-card {
		position: relative;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		transition: all var(--transition-base) ease;
	}

	.argument-card:hover {
		border-color: var(--color-primary);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.card-link {
		display: block;
		padding: var(--space-md);
		text-decoration: none;
		color: inherit;
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}

	.card-header h2 {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0;
		color: var(--color-text-primary);
		line-height: 1.3;
	}

	.card-header :global(svg) {
		flex-shrink: 0;
		color: var(--color-text-tertiary);
		transition: transform var(--transition-fast) ease;
	}

	.argument-card:hover .card-header :global(svg) {
		transform: translateX(4px);
		color: var(--color-primary);
	}

	.root-claim {
		font-family: var(--font-family-serif);
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-sm) 0;
		line-height: 1.5;
	}

	.claim-label {
		font-family: var(--font-family-ui);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #e8b84b;
		display: block;
		margin-bottom: 2px;
	}

	.description {
		font-size: 0.875rem;
		color: var(--color-text-tertiary);
		margin: 0 0 var(--space-sm) 0;
		line-height: 1.5;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: var(--space-sm);
		border-top: 1px solid var(--color-border);
		font-size: 0.8rem;
		color: var(--color-text-tertiary);
	}

	.node-count {
		font-family: var(--font-family-ui);
		font-weight: 500;
	}

	.linked-badge {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-bottom: var(--space-xs);
	}

	.linked-badge.discussion-linked {
		background: color-mix(in srgb, #4bc4e8 12%, transparent);
		color: #4bc4e8;
	}

	.linked-badge.post-linked {
		background: color-mix(in srgb, #b44be8 12%, transparent);
		color: #b44be8;
	}

	.linked-badge.standalone {
		background: color-mix(in srgb, #8b8b8b 12%, transparent);
		color: #8b8b8b;
	}

	.delete-button {
		position: absolute;
		top: var(--space-sm);
		right: var(--space-sm);
		padding: var(--space-xs);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		color: var(--color-text-tertiary);
		cursor: pointer;
		opacity: 0;
		transition: all var(--transition-fast) ease;
	}

	.argument-card:hover .delete-button {
		opacity: 1;
	}

	.delete-button:hover {
		color: var(--color-error);
		border-color: var(--color-error);
		background: color-mix(in srgb, var(--color-error) 5%, var(--color-surface));
	}

	/* New Argument Form */
	.new-argument-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.form-error {
		padding: var(--space-sm);
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		border: 1px solid var(--color-error);
		border-radius: var(--border-radius-sm);
		color: var(--color-error);
		font-size: 0.875rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.form-group label {
		font-weight: 500;
		font-size: 0.875rem;
		color: var(--color-text-primary);
	}

	.form-group input,
	.form-group textarea {
		padding: var(--space-sm);
		background: var(--color-input-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		font-family: inherit;
		font-size: 0.9rem;
		color: var(--color-text-primary);
		transition: border-color var(--transition-fast) ease;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.form-group textarea {
		resize: vertical;
		min-height: 60px;
	}

	.help-text {
		font-size: 0.8rem;
		color: var(--color-text-tertiary);
		margin: 0;
	}

	/* Delete Warning */
	.delete-warning {
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.delete-warning strong {
		color: var(--color-text-primary);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.page-container {
			padding: var(--space-md);
		}

		.header-content {
			flex-direction: column;
			align-items: stretch;
		}

		.header-actions {
			flex-direction: column;
			align-items: stretch;
		}

		.empty-state-actions {
			flex-direction: column;
			align-items: stretch;
		}

		.arguments-grid {
			grid-template-columns: 1fr;
		}

		.delete-button {
			opacity: 1;
		}
	}
</style>
