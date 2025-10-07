<svelte:options runes={true} />

<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { UPDATE_EDITORS_DESK_PICK_STATUS } from '$lib/graphql/queries';

	const props = $props<{
		pick: {
			id: string;
			title: string;
			excerpt?: string | null;
			editor_note?: string | null;
			created_at: string;
			userByCuratorId?: {
				displayName?: string | null;
				display_name?: string | null;
			} | null;
			curator?: {
				displayName?: string | null;
				display_name?: string | null;
			} | null;
		};
		onResponse?: (approved: boolean) => void;
	}>();

	let responding = $state(false);
	let error = $state<string | null>(null);
	let success = $state<'approved' | 'rejected' | null>(null);

	const getCuratorName = () => {
		const curator = props.pick.userByCuratorId || props.pick.curator;
		return (
			curator?.displayName ||
			curator?.display_name ||
			'An editor'
		);
	};

	async function handleResponse(approved: boolean) {
		responding = true;
		error = null;

		try {
			const status = approved ? 'approved' : 'rejected';
			const result = await nhost.graphql.request(UPDATE_EDITORS_DESK_PICK_STATUS, {
				id: props.pick.id,
				status
			});

			if (result.error) {
				throw new Error(
					Array.isArray(result.error)
						? result.error.map((e: any) => e.message).join('; ')
						: 'Failed to update pick status'
				);
			}

			success = status;
			props.onResponse?.(approved);
		} catch (err: any) {
			error = err.message || 'Failed to respond to editors\' desk request';
		} finally {
			responding = false;
		}
	}
</script>

<div class="approval-card">
	<div class="card-header">
		<div class="badge-row">
			<span class="badge">Editors' Desk</span>
			<span class="status-badge">Approval Requested</span>
		</div>
		<div class="curator-info">
			{getCuratorName()} wants to feature your content
		</div>
	</div>

	<div class="card-body">
		<h3>{props.pick.title}</h3>

		{#if props.pick.excerpt}
			<p class="excerpt">{props.pick.excerpt}</p>
		{/if}

		{#if props.pick.editor_note}
			<div class="editor-note">
				<div class="note-label">Editor's Note:</div>
				<p>{props.pick.editor_note}</p>
			</div>
		{/if}

		<div class="meta-info">
			Requested {new Date(props.pick.created_at).toLocaleDateString()}
		</div>
	</div>

	{#if success}
		<div class="success-message">
			{#if success === 'approved'}
				✓ You approved this pick. It will now appear in the Editors' Desk.
			{:else}
				✓ You declined this pick. The curator has been notified.
			{/if}
		</div>
	{:else if error}
		<div class="error-message">{error}</div>
	{:else}
		<div class="card-actions">
			<button
				class="button-approve"
				onclick={() => handleResponse(true)}
				disabled={responding}
				aria-label="Approve editors desk pick"
			>
				{responding ? 'Approving...' : 'Approve'}
			</button>
			<button
				class="button-decline"
				onclick={() => handleResponse(false)}
				disabled={responding}
				aria-label="Decline editors desk pick"
			>
				{responding ? 'Declining...' : 'Decline'}
			</button>
		</div>
	{/if}
</div>

<style>
	.approval-card {
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-accent) 25%, transparent);
		border-radius: var(--border-radius-xl);
		overflow: hidden;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-accent) 10%, transparent);
	}

	.card-header {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-accent) 8%, transparent),
			color-mix(in srgb, var(--color-primary) 8%, transparent)
		);
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
	}

	.badge-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.badge {
		background: linear-gradient(135deg, var(--color-accent), var(--color-primary));
		color: white;
		padding: 0.25rem 0.75rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.status-badge {
		background: color-mix(in srgb, #f59e0b 15%, transparent);
		color: #f59e0b;
		padding: 0.25rem 0.75rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
	}

	.curator-info {
		font-size: 0.95rem;
		color: var(--color-text-primary);
		font-weight: 500;
	}

	.card-body {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	h3 {
		margin: 0;
		font-family: var(--font-family-display);
		font-size: 1.25rem;
		color: var(--color-text-primary);
		line-height: 1.3;
	}

	.excerpt {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.5;
		font-size: 0.95rem;
	}

	.editor-note {
		background: color-mix(in srgb, var(--color-accent) 5%, transparent);
		padding: 1rem;
		border-radius: var(--border-radius-md);
		border-left: 3px solid color-mix(in srgb, var(--color-accent) 40%, transparent);
	}

	.note-label {
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-accent);
		margin-bottom: 0.5rem;
	}

	.editor-note p {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.5;
		font-size: 0.9rem;
	}

	.meta-info {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.card-actions {
		display: flex;
		gap: 1rem;
		padding: 1.5rem;
		border-top: 1px solid var(--color-border);
	}

	.button-approve,
	.button-decline {
		flex: 1;
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-md);
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.button-approve {
		background: var(--color-accent);
		color: white;
	}

	.button-approve:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-accent) 85%, black);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-accent) 25%, transparent);
		transform: translateY(-1px);
	}

	.button-decline {
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.button-decline:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, var(--color-border));
	}

	.button-approve:disabled,
	.button-decline:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.success-message {
		padding: 1rem 1.5rem;
		background: color-mix(in srgb, #10b981 10%, transparent);
		border-top: 1px solid color-mix(in srgb, #10b981 25%, transparent);
		color: #10b981;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.error-message {
		padding: 1rem 1.5rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border-top: 1px solid color-mix(in srgb, #ef4444 25%, transparent);
		color: #ef4444;
		font-size: 0.9rem;
	}

	@media (max-width: 640px) {
		.card-actions {
			flex-direction: column;
		}
	}
</style>
