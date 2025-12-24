<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { CHECK_CONTACT_STATUS, CHECK_BLOCK_STATUS } from '$lib/graphql/queries';
	import { UserPlus, Users, Clock, Loader2, X } from '@lucide/svelte';

	interface Props {
		targetUserId: string;
		currentUserId: string | null;
		size?: 'sm' | 'md' | 'lg';
		onRequestContact?: () => void;
	}

	let { targetUserId, currentUserId, size = 'md', onRequestContact }: Props = $props();

	let contactStatus = $state<
		'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'cooldown'
	>('none');
	let isLoading = $state(false);
	let isBlocked = $state(false);
	let cooldownUntil = $state<Date | null>(null);

	// Check initial contact status
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

			if (blockResult.data?.their_block?.[0]?.block_collaboration_requests) {
				isBlocked = true;
				return;
			}

			// Check contact status
			const result = await nhost.graphql.request(CHECK_CONTACT_STATUS, {
				userId: currentUserId,
				otherUserId: targetUserId
			});

			const contact = result.data?.collaboration_contact?.[0];
			if (contact) {
				if (contact.status === 'accepted') {
					contactStatus = 'accepted';
				} else if (contact.status === 'pending') {
					contactStatus =
						contact.requester_id === currentUserId ? 'pending_sent' : 'pending_received';
				} else if (
					contact.status === 'declined_not_now' ||
					contact.status === 'declined_no_thanks'
				) {
					// Check if cooldown has passed
					if (contact.cooldown_until && new Date(contact.cooldown_until) > new Date()) {
						contactStatus = 'cooldown';
						cooldownUntil = new Date(contact.cooldown_until);
					} else {
						contactStatus = 'none';
					}
				}
			} else {
				contactStatus = 'none';
			}
		} catch (err) {
			console.error('Error checking contact status:', err);
		}
	}

	function handleClick() {
		if (contactStatus === 'none' && onRequestContact) {
			onRequestContact();
		}
	}

	function formatCooldown(): string {
		if (!cooldownUntil) return '';
		const now = new Date();
		const diff = cooldownUntil.getTime() - now.getTime();
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d`;
		if (hours > 0) return `${hours}h`;
		return 'soon';
	}

	const iconSizes = {
		sm: 14,
		md: 16,
		lg: 18
	};
</script>

{#if currentUserId && currentUserId !== targetUserId}
	{#if isBlocked}
		<button class="contact-button blocked {size}" disabled title="You cannot send a contact request">
			<UserPlus size={iconSizes[size]} />
			<span>Add Contact</span>
		</button>
	{:else if contactStatus === 'accepted'}
		<button class="contact-button accepted {size}" disabled title="Already a contact">
			<Users size={iconSizes[size]} />
			<span>Contact</span>
		</button>
	{:else if contactStatus === 'pending_sent'}
		<button class="contact-button pending {size}" disabled title="Request pending">
			<Clock size={iconSizes[size]} />
			<span>Pending</span>
		</button>
	{:else if contactStatus === 'pending_received'}
		<button class="contact-button pending-received {size}" disabled title="You have a pending request from this user">
			<Clock size={iconSizes[size]} />
			<span>Respond</span>
		</button>
	{:else if contactStatus === 'cooldown'}
		<button
			class="contact-button cooldown {size}"
			disabled
			title="You can request again {cooldownUntil?.toLocaleDateString()}"
		>
			<Clock size={iconSizes[size]} />
			<span>Wait {formatCooldown()}</span>
		</button>
	{:else}
		<button
			class="contact-button none {size}"
			class:loading={isLoading}
			onclick={handleClick}
			disabled={isLoading}
			title="Send a contact request"
		>
			{#if isLoading}
				<Loader2 size={iconSizes[size]} class="spinning" />
			{:else}
				<UserPlus size={iconSizes[size]} />
			{/if}
			<span>Add Contact</span>
		</button>
	{/if}
{/if}

<style>
	.contact-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 500;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
	}

	.contact-button.sm {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		gap: 0.25rem;
	}

	.contact-button.md {
		padding: 0.375rem 0.75rem;
		font-size: 0.875rem;
		gap: 0.375rem;
	}

	.contact-button.lg {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		gap: 0.5rem;
	}

	.contact-button.none {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border-color: var(--color-border);
	}

	.contact-button.none:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-color: var(--color-primary);
		color: var(--color-primary);
		transform: translateY(-1px);
	}

	.contact-button.accepted {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
		border-color: var(--color-primary);
		cursor: default;
	}

	.contact-button.pending {
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
		color: var(--color-accent);
		border-color: var(--color-accent);
		cursor: default;
	}

	.contact-button.pending-received {
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		color: var(--color-primary);
		border-color: var(--color-primary);
		cursor: default;
	}

	.contact-button.cooldown {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-color: var(--color-border);
		opacity: 0.7;
		cursor: not-allowed;
	}

	.contact-button.blocked {
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border-color: var(--color-border);
		opacity: 0.5;
		cursor: not-allowed;
	}

	.contact-button:disabled {
		cursor: not-allowed;
	}

	.contact-button.loading {
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
