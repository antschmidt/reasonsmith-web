<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import {
		FOLLOW_USER,
		UNFOLLOW_USER,
		CHECK_FOLLOW_STATUS,
		CHECK_USER_REQUIRES_FOLLOW_APPROVAL,
		CHECK_BLOCK_STATUS
	} from '$lib/graphql/queries';
	import { UserPlus, UserMinus, Clock, Loader2 } from '@lucide/svelte';

	interface Props {
		targetUserId: string;
		currentUserId: string | null;
		size?: 'sm' | 'md' | 'lg';
		onStatusChange?: (status: 'none' | 'pending' | 'active') => void;
	}

	let { targetUserId, currentUserId, size = 'md', onStatusChange }: Props = $props();

	let followStatus = $state<'none' | 'pending' | 'active'>('none');
	let isLoading = $state(false);
	let isBlocked = $state(false);
	let error = $state<string | null>(null);

	// Check initial follow status
	$effect(() => {
		if (currentUserId && targetUserId && currentUserId !== targetUserId) {
			checkStatus();
		}
	});

	async function checkStatus() {
		try {
			// Check if we're blocked
			const blockResult = await nhost.graphql.request(CHECK_BLOCK_STATUS, {
				userId: currentUserId,
				otherUserId: targetUserId
			});

			if (blockResult.data?.their_block?.[0]?.block_following) {
				isBlocked = true;
				return;
			}

			// Check follow status
			const result = await nhost.graphql.request(CHECK_FOLLOW_STATUS, {
				followerId: currentUserId,
				followingId: targetUserId
			});

			if (result.data?.follow?.[0]) {
				followStatus = result.data.follow[0].status;
			} else {
				followStatus = 'none';
			}
		} catch (err) {
			console.error('Error checking follow status:', err);
		}
	}

	async function handleFollow() {
		if (!currentUserId || isLoading || isBlocked) return;

		isLoading = true;
		error = null;

		try {
			// Check if target requires approval
			const approvalResult = await nhost.graphql.request(CHECK_USER_REQUIRES_FOLLOW_APPROVAL, {
				userId: targetUserId
			});

			const requiresApproval = approvalResult.data?.contributor_by_pk?.require_follow_approval;
			const status = requiresApproval ? 'pending' : 'active';

			const result = await nhost.graphql.request(FOLLOW_USER, {
				followerId: currentUserId,
				followingId: targetUserId,
				status
			});

			if (result.error) {
				throw new Error('Failed to follow user');
			}

			followStatus = status;
			onStatusChange?.(status);
		} catch (err: any) {
			error = err.message || 'Failed to follow';
			console.error('Error following user:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleUnfollow() {
		if (!currentUserId || isLoading) return;

		isLoading = true;
		error = null;

		try {
			const result = await nhost.graphql.request(UNFOLLOW_USER, {
				followerId: currentUserId,
				followingId: targetUserId
			});

			if (result.error) {
				throw new Error('Failed to unfollow user');
			}

			followStatus = 'none';
			onStatusChange?.('none');
		} catch (err: any) {
			error = err.message || 'Failed to unfollow';
			console.error('Error unfollowing user:', err);
		} finally {
			isLoading = false;
		}
	}

	function handleClick() {
		if (followStatus === 'none') {
			handleFollow();
		} else {
			handleUnfollow();
		}
	}

	const sizeClasses = {
		sm: 'px-2 py-1 text-xs gap-1',
		md: 'px-3 py-1.5 text-sm gap-1.5',
		lg: 'px-4 py-2 text-base gap-2'
	};

	const iconSizes = {
		sm: 14,
		md: 16,
		lg: 18
	};
</script>

{#if currentUserId && currentUserId !== targetUserId}
	{#if isBlocked}
		<button class="follow-button blocked {size}" disabled title="You cannot follow this user">
			<UserPlus size={iconSizes[size]} />
			<span>Follow</span>
		</button>
	{:else}
		<button
			class="follow-button {followStatus} {size}"
			class:loading={isLoading}
			onclick={handleClick}
			disabled={isLoading}
			title={followStatus === 'none'
				? 'Follow this user'
				: followStatus === 'pending'
					? 'Cancel follow request'
					: 'Unfollow this user'}
		>
			{#if isLoading}
				<Loader2 size={iconSizes[size]} class="spinning" />
			{:else if followStatus === 'none'}
				<UserPlus size={iconSizes[size]} />
			{:else if followStatus === 'pending'}
				<Clock size={iconSizes[size]} />
			{:else}
				<UserMinus size={iconSizes[size]} />
			{/if}
			<span>
				{#if followStatus === 'none'}
					Follow
				{:else if followStatus === 'pending'}
					Requested
				{:else}
					Following
				{/if}
			</span>
		</button>
	{/if}
{/if}

<style>
	.follow-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 500;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
	}

	.follow-button.sm {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		gap: 0.25rem;
	}

	.follow-button.md {
		padding: 0.375rem 0.75rem;
		font-size: 0.875rem;
		gap: 0.375rem;
	}

	.follow-button.lg {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		gap: 0.5rem;
	}

	.follow-button.none {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.follow-button.none:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 85%, black);
		transform: translateY(-1px);
	}

	.follow-button.pending {
		background: color-mix(in srgb, var(--color-accent) 15%, transparent);
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.follow-button.pending:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-accent) 25%, transparent);
	}

	.follow-button.active {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-color: var(--color-border);
	}

	.follow-button.active:hover:not(:disabled) {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
		border-color: #ef4444;
	}

	.follow-button.blocked {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-color: var(--color-border);
		opacity: 0.5;
		cursor: not-allowed;
	}

	.follow-button:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}

	.follow-button.loading {
		opacity: 0.8;
	}

	:global(.spinning) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
