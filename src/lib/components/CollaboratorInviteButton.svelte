<script lang="ts">
	import { UserPlus } from '@lucide/svelte';
	import CollaboratorModal from './CollaboratorModal.svelte';

	interface Props {
		postId: string;
		ownerId: string;
		isAuthor: boolean;
		disabled?: boolean;
		onInviteSent?: () => void;
	}

	let { postId, ownerId, isAuthor, disabled = false, onInviteSent }: Props = $props();

	let showModal = $state(false);

	function handleClick() {
		showModal = true;
	}

	function handleClose() {
		showModal = false;
	}
</script>

<button
	type="button"
	class="collaborator-invite-button"
	onclick={handleClick}
	{disabled}
	title="Invite collaborators"
	aria-label="Invite collaborators"
>
	<UserPlus size="18" />
	<span>Invite</span>
</button>

<CollaboratorModal
	{postId}
	{ownerId}
	{isAuthor}
	isOpen={showModal}
	onClose={handleClose}
	{onInviteSent}
/>

<style>
	.collaborator-invite-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius-sm);
		color: var(--text-color);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.collaborator-invite-button:hover:not(:disabled) {
		background: var(--hover-bg);
		border-color: var(--primary-color);
		color: var(--primary-color);
	}

	.collaborator-invite-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.collaborator-invite-button span {
		line-height: 1;
	}

	@media (max-width: 640px) {
		.collaborator-invite-button span {
			display: none;
		}

		.collaborator-invite-button {
			padding: 0.5rem;
		}
	}
</style>
