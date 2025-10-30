<script lang="ts">
	import Button from './Button.svelte';
	import Modal from './Modal.svelte';

	interface Props {
		show: boolean;
		analysisBlockedReason?: string | null;
		onClose: () => void;
	}

	let { show = $bindable(), analysisBlockedReason = null, onClose }: Props = $props();
</script>

<Modal bind:show {onClose} title="🚫 Out of Credits">
	{#snippet children()}
		<p class="main-message">You don't have enough credits to publish this comment with analysis.</p>
		{#if analysisBlockedReason}
			<div class="blocked-details">
				<p class="error-message">{analysisBlockedReason}</p>
				{#if analysisBlockedReason.includes('credits')}
					<p class="help-text">
						Check your <a href="/profile">profile page</a> for credit information and options to purchase
						more credits.
					</p>
				{:else if analysisBlockedReason.includes('disabled')}
					<p class="help-text">
						Visit your <a href="/profile">profile page</a> to enable analysis features.
					</p>
				{/if}
			</div>
		{/if}
	{/snippet}

	{#snippet footer()}
		<Button variant="secondary" onclick={onClose}>Close</Button>
		<Button variant="primary" onclick={() => (window.location.href = '/profile')}
			>View Profile</Button
		>
	{/snippet}
</Modal>

<style>
	.main-message {
		font-size: 1.1rem;
		color: var(--color-text-primary);
		margin: 0 0 1rem 0;
		line-height: 1.5;
	}

	.blocked-details {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		padding: 1rem;
	}

	.error-message {
		color: var(--color-accent);
		font-weight: 500;
		margin: 0 0 0.5rem 0;
	}

	.help-text {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		margin: 0;
	}

	.help-text a {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 500;
	}

	.help-text a:hover {
		text-decoration: underline;
	}
</style>
