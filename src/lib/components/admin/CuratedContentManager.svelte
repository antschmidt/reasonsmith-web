<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import {
		GET_PUBLIC_SHOWCASE_ADMIN,
		CREATE_PUBLIC_SHOWCASE_ITEM,
		UPDATE_PUBLIC_SHOWCASE_ITEM,
		DELETE_PUBLIC_SHOWCASE_ITEM
	} from '$lib/graphql/queries';
	import ShowcaseItemForm from './ShowcaseItemForm.svelte';

	type ShowcaseItem = {
		id: string;
		title: string;
		subtitle: string | null;
		media_type: string | null;
		creator: string | null;
		source_url: string | null;
		summary: string | null;
		analysis: any;
		tags: string[] | null;
		date_published: string | null;
		display_order: number | null;
		published: boolean;
		created_at: string;
		updated_at: string;
	};

	let { userRole } = $props<{ userRole: string }>();

	let items: ShowcaseItem[] = [];
	let loading = false;
	let saving = false;
	let error: string | null = null;
	let success: string | null = null;

	// Form state
	let showCreateForm = false;
	let editingItem: ShowcaseItem | null = null;

	async function loadItems() {
		loading = true;
		error = null;

		try {
			const result = await nhost.graphql.request(GET_PUBLIC_SHOWCASE_ADMIN);

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'GraphQL operation failed'
					: result.error.message || 'GraphQL operation failed';
				throw new Error(errorMessage);
			}

			items = result.data?.public_showcase_item || [];
			// Sort by display_order, then by created_at
			items.sort((a, b) => {
				if (a.display_order !== null && b.display_order !== null) {
					return a.display_order - b.display_order;
				}
				if (a.display_order !== null) return -1;
				if (b.display_order !== null) return 1;
				return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			});
		} catch (err: any) {
			error = err.message || 'Failed to load showcase items';
			console.error('Error loading showcase items:', err);
		} finally {
			loading = false;
		}
	}

	async function createItem(itemData: Partial<ShowcaseItem>) {
		saving = true;
		error = null;
		success = null;

		try {
			const result = await nhost.graphql.request(CREATE_PUBLIC_SHOWCASE_ITEM, itemData);

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'GraphQL operation failed'
					: result.error.message || 'GraphQL operation failed';
				throw new Error(errorMessage);
			}

			await loadItems(); // Reload to get updated data
			showCreateForm = false;
			success = 'Showcase item created successfully';
			setTimeout(() => (success = null), 3000);
		} catch (err: any) {
			error = err.message || 'Failed to create showcase item';
			console.error('Error creating showcase item:', err);
		} finally {
			saving = false;
		}
	}

	async function updateItem(id: string, itemData: Partial<ShowcaseItem>) {
		saving = true;
		error = null;
		success = null;

		try {
			const result = await nhost.graphql.request(UPDATE_PUBLIC_SHOWCASE_ITEM, {
				id,
				...itemData
			});

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'GraphQL operation failed'
					: result.error.message || 'GraphQL operation failed';
				throw new Error(errorMessage);
			}

			await loadItems(); // Reload to get updated data
			editingItem = null;
			success = 'Showcase item updated successfully';
			setTimeout(() => (success = null), 3000);
		} catch (err: any) {
			error = err.message || 'Failed to update showcase item';
			console.error('Error updating showcase item:', err);
		} finally {
			saving = false;
		}
	}

	async function deleteItem(id: string) {
		if (!confirm('Are you sure you want to delete this showcase item?')) {
			return;
		}

		saving = true;
		error = null;
		success = null;

		try {
			const result = await nhost.graphql.request(DELETE_PUBLIC_SHOWCASE_ITEM, { id });

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'GraphQL operation failed'
					: result.error.message || 'GraphQL operation failed';
				throw new Error(errorMessage);
			}

			await loadItems(); // Reload to get updated data
			success = 'Showcase item deleted successfully';
			setTimeout(() => (success = null), 3000);
		} catch (err: any) {
			error = err.message || 'Failed to delete showcase item';
			console.error('Error deleting showcase item:', err);
		} finally {
			saving = false;
		}
	}

	async function togglePublished(item: ShowcaseItem) {
		await updateItem(item.id, { published: !item.published });
	}

	function startEdit(item: ShowcaseItem) {
		editingItem = item;
		showCreateForm = false;
	}

	function cancelEdit() {
		editingItem = null;
		showCreateForm = false;
	}

	onMount(() => {
		loadItems();
	});
</script>

<div class="curated-content-manager">
	<div class="manager-header">
		<h2>Curated Analyses Management</h2>
		<p class="description">
			Manage featured content that appears in the "Curated Analyses" carousel on the homepage and
			discussions page.
		</p>
		<button class="btn-primary" onclick={() => (showCreateForm = true)} disabled={saving}>
			+ Add New Analysis
		</button>
	</div>

	{#if error}
		<div class="error-message">{error}</div>
	{/if}

	{#if success}
		<div class="success-message">{success}</div>
	{/if}

	{#if showCreateForm}
		<div class="form-section">
			<h3>Create New Showcase Item</h3>
			<ShowcaseItemForm
				on:submit={(e) => createItem(e.detail)}
				on:cancel={() => (showCreateForm = false)}
				{saving}
			/>
		</div>
	{/if}

	{#if editingItem}
		<div class="form-section">
			<h3>Edit Showcase Item</h3>
			<ShowcaseItemForm
				item={editingItem}
				on:submit={(e) => updateItem(editingItem!.id, e.detail)}
				on:cancel={cancelEdit}
				{saving}
			/>
		</div>
	{/if}

	{#if loading}
		<div class="loading">Loading showcase items...</div>
	{:else}
		<div class="items-table">
			<table>
				<thead>
					<tr>
						<th>Title</th>
						<th>Status</th>
						<th>Order</th>
						<th>Created</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each items as item (item.id)}
						<tr class="item-row">
							<td class="item-info">
								<div class="item-title">{item.title}</div>
								{#if item.subtitle}
									<div class="item-subtitle">{item.subtitle}</div>
								{/if}
								{#if item.creator}
									<div class="item-meta">by {item.creator}</div>
								{/if}
							</td>
							<td>
								<span class="status-badge {item.published ? 'published' : 'unpublished'}">
									{item.published ? 'Published' : 'Draft'}
								</span>
							</td>
							<td class="order-cell">
								{item.display_order || '—'}
							</td>
							<td class="date-cell">
								{new Date(item.created_at).toLocaleDateString()}
							</td>
							<td class="actions-cell">
								<div class="action-buttons">
									<button
										class="btn-secondary edit-btn"
										onclick={() => startEdit(item)}
										disabled={saving}
									>
										Edit
									</button>
									<button
										class="btn-secondary toggle-btn"
										onclick={() => togglePublished(item)}
										disabled={saving}
									>
										{item.published ? 'Unpublish' : 'Publish'}
									</button>
									<button
										class="btn-danger delete-btn"
										onclick={() => deleteItem(item.id)}
										disabled={saving}
									>
										Delete
									</button>
								</div>
							</td>
						</tr>
					{/each}
					{#if items.length === 0}
						<tr>
							<td colspan="5" class="empty-state">
								No showcase items found. Create your first one above!
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.curated-content-manager {
		margin-top: 2rem;
	}

	.manager-header {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 16px;
	}

	.manager-header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-family: var(--font-family-display);
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.description {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.btn-primary {
		align-self: flex-start;
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 12px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		transition: all 0.3s ease;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.form-section {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(15px);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 16px;
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 10%, transparent);
	}

	.form-section h3 {
		margin: 0 0 1rem 0;
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.error-message,
	.success-message {
		padding: 1rem 1.5rem;
		border-radius: 12px;
		margin-bottom: 1.5rem;
		font-weight: 600;
	}

	.error-message {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		color: #ef4444;
	}

	.success-message {
		background: color-mix(in srgb, #10b981 15%, transparent);
		border: 1px solid color-mix(in srgb, #10b981 30%, transparent);
		color: #10b981;
	}

	.loading {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary);
		font-size: 1.1rem;
	}

	.items-table {
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px) saturate(1.2);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 16px;
		box-shadow: 0 8px 24px color-mix(in srgb, var(--color-primary) 8%, transparent);
		overflow: hidden;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	thead {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
	}

	th {
		padding: 1rem 1.25rem;
		text-align: left;
		font-weight: 700;
		color: var(--color-text-primary);
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.item-row {
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
		transition: background 0.2s ease;
	}

	.item-row:hover {
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	td {
		padding: 1rem 1.25rem;
		vertical-align: middle;
	}

	.item-info {
		min-width: 200px;
	}

	.item-title {
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.25rem;
	}

	.item-subtitle {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.25rem;
	}

	.item-meta {
		font-size: 0.8rem;
		color: var(--color-text-tertiary);
	}

	.status-badge {
		display: inline-block;
		padding: 0.35rem 0.75rem;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.published {
		background: linear-gradient(135deg, #10b981, #34d399);
		color: white;
		box-shadow: 0 2px 8px color-mix(in srgb, #10b981 30%, transparent);
	}

	.unpublished {
		background: color-mix(in srgb, var(--color-text-secondary) 20%, transparent);
		color: var(--color-text-secondary);
	}

	.order-cell,
	.date-cell {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.btn-secondary,
	.btn-danger {
		padding: 0.4rem 0.8rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 500;
		font-size: 0.8rem;
		transition: all 0.2s ease;
		border: 1px solid;
	}

	.btn-secondary {
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		color: var(--color-text-primary);
		border-color: color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.btn-secondary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.btn-danger {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
		border-color: color-mix(in srgb, #ef4444 30%, transparent);
	}

	.btn-danger:hover:not(:disabled) {
		background: color-mix(in srgb, #ef4444 20%, transparent);
		border-color: #ef4444;
	}

	.btn-secondary:disabled,
	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 2rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	@media (max-width: 768px) {
		.items-table {
			overflow-x: auto;
		}

		table {
			min-width: 600px;
		}

		.action-buttons {
			flex-direction: column;
		}
	}
</style>
