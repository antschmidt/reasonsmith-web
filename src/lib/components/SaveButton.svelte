<svelte:options runes={true} />

<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { CHECK_SAVED_ITEM, SAVE_ITEM, REMOVE_SAVED_ITEM } from '$lib/graphql/queries';

	const props = $props<{
		discussionId?: string;
		postId?: string;
		editorsDeskPickId?: string;
		size?: 'small' | 'medium' | 'large';
		showLabel?: boolean;
	}>();

	let isSaved = $state(false);
	let savedItemId = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const user = $derived(nhost.auth.getUser());
	const contributorId = $derived(user?.id);
	const size = $derived(props.size || 'medium');
	const showLabel = $derived(props.showLabel ?? false);

	// Check if item is already saved
	async function checkSavedStatus() {
		if (!contributorId) return;

		try {
			// Build the where clause based on which prop is provided
			let whereClause: any = { contributor_id: { _eq: contributorId } };

			if (props.discussionId) {
				whereClause.discussion_id = { _eq: props.discussionId };
			} else if (props.postId) {
				whereClause.post_id = { _eq: props.postId };
			} else if (props.editorsDeskPickId) {
				whereClause.editors_desk_pick_id = { _eq: props.editorsDeskPickId };
			} else {
				return; // No item to check
			}

			const query = `
				query CheckSavedItem($where: saved_item_bool_exp!) {
					saved_item(where: $where, limit: 1) {
						id
					}
				}
			`;

			const result = await nhost.graphql.request(query, {
				where: whereClause
			});

			if (result.data?.saved_item?.length > 0) {
				isSaved = true;
				savedItemId = result.data.saved_item[0].id;
			} else {
				isSaved = false;
				savedItemId = null;
			}
		} catch (err) {
			console.error('Error checking saved status:', err);
		}
	}

	// Check saved status on mount and when user changes
	$effect(() => {
		if (contributorId) {
			checkSavedStatus();
		}
	});

	async function toggleSave(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!contributorId) {
			error = 'Please sign in to save items';
			return;
		}

		loading = true;
		error = null;

		try {
			if (isSaved && savedItemId) {
				// Remove saved item
				const result = await nhost.graphql.request(REMOVE_SAVED_ITEM, {
					savedItemId
				});

				if (result.error) {
					throw new Error(result.error.message);
				}

				isSaved = false;
				savedItemId = null;
			} else {
				// Save item
				const result = await nhost.graphql.request(SAVE_ITEM, {
					contributorId,
					discussionId: props.discussionId || null,
					postId: props.postId || null,
					editorsDeskPickId: props.editorsDeskPickId || null
				});

				if (result.error) {
					throw new Error(result.error.message);
				}

				if (result.data?.insert_saved_item_one) {
					isSaved = true;
					savedItemId = result.data.insert_saved_item_one.id;
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save item';
			console.error('Error toggling save:', err);
		} finally {
			loading = false;
		}
	}
</script>

<button
	class="save-button save-button-{size}"
	class:saved={isSaved}
	onclick={toggleSave}
	disabled={loading}
	title={isSaved ? 'Remove from saved items' : 'Save for later'}
	aria-label={isSaved ? 'Remove from saved items' : 'Save for later'}
	type="button"
>
	<svg
		class="bookmark-icon"
		width="20"
		height="20"
		viewBox="0 0 20 20"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M5 2C4.44772 2 4 2.44772 4 3V18L10 14L16 18V3C16 2.44772 15.5523 2 15 2H5Z"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linejoin="round"
			fill={isSaved ? 'currentColor' : 'none'}
		/>
	</svg>
	{#if showLabel}
		<span class="save-label">{isSaved ? 'Saved' : 'Save'}</span>
	{/if}
</button>

{#if error}
	<div class="save-error">{error}</div>
{/if}

<style>
	.save-button {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem;
		border: none;
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
		border-radius: var(--border-radius-md);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
		opacity: 0.6;
	}

	.save-button:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--color-surface) 95%, transparent);
		color: var(--color-text-primary);
		transform: translateY(-1px);
	}

	.save-button:active {
		transform: translateY(0);
	}

	.save-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.save-button.saved {
		opacity: 1;
		color: var(--color-accent);
	}

	.save-button.saved:hover {
		color: var(--color-accent-hover);
	}

	.save-button-small {
		padding: 0.375rem;
	}

	.save-button-small .bookmark-icon {
		width: 16px;
		height: 16px;
	}

	.save-button-medium {
		padding: 0.5rem;
	}

	.save-button-medium .bookmark-icon {
		width: 20px;
		height: 20px;
	}

	.save-button-large {
		padding: 0.625rem;
	}

	.save-button-large .bookmark-icon {
		width: 24px;
		height: 24px;
	}

	.bookmark-icon {
		flex-shrink: 0;
		transition: all 0.2s ease;
	}

	.save-label {
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.save-error {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--color-error);
		color: white;
		border-radius: var(--border-radius-sm);
		font-size: 0.75rem;
		white-space: nowrap;
		pointer-events: none;
	}

	/* Light mode adjustments */
	:global([data-theme='light']) .save-button {
		background: color-mix(in srgb, var(--color-surface) 85%, transparent);
	}

	:global([data-theme='light']) .save-button:hover {
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
	}
</style>
