<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { apolloClient } from '$lib/apolloClient';
	import {
		GET_COLLABORATION_MESSAGES,
		SEND_COLLABORATION_MESSAGE,
		MARK_COLLABORATION_MESSAGES_AS_READ,
		SUBSCRIBE_TO_COLLABORATION_MESSAGES,
		APPROVE_EDIT_CONTROL_FROM_CHAT,
		DENY_EDIT_CONTROL_FROM_CHAT
	} from '$lib/graphql/queries';
	import { onMount, onDestroy } from 'svelte';
	import { ArrowLeft, Send } from '@lucide/svelte';
	import CollaborationMessageItem from './CollaborationMessageItem.svelte';
	import { isPageVisible } from '$lib/stores/visibilityStore';

	type Collaborator = {
		id: string;
		display_name: string;
		handle: string | null;
		avatar_url: string | null;
	};

	type Message = {
		id: string;
		post_id: string;
		sender_id: string;
		message_type: 'text' | 'system' | 'edit_request' | 'role_request';
		content: string;
		metadata?: any;
		created_at: string;
		sender: Collaborator;
	};

	let { postId, discussionTitle, collaborators, currentUserId, onBack } = $props<{
		postId: string;
		discussionTitle: string;
		collaborators: Array<Collaborator>;
		currentUserId: string;
		onBack: () => void;
	}>();

	let messages = $state<Array<Message>>([]);
	let newMessage = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let sending = $state(false);
	let processingMessageId = $state<string | null>(null);
	let subscription: any = null;
	let messagesContainer: HTMLDivElement;
	let textareaElement: HTMLTextAreaElement;
	let pollingInterval: ReturnType<typeof setInterval> | null = null;
	let subscriptionActive = $state(false);

	async function loadMessages() {
		loading = true;
		error = null;

		try {
			console.log('[Chat] Loading messages for post:', postId);
			const result = await nhost.graphql.request(GET_COLLABORATION_MESSAGES, {
				postId,
				limit: 50
			});

			if (result.error) {
				error = 'Failed to load messages';
				console.error('[Chat] Error loading messages:', result.error);
			} else if (result.data) {
				const newMessages = result.data.collaboration_message || [];
				console.log('[Chat] Loaded messages:', newMessages.length, 'messages');
				messages = newMessages;
				scrollToBottom();
			}
		} catch (err) {
			error = 'Failed to load messages';
			console.error('[Chat] Exception loading messages:', err);
		} finally {
			loading = false;
		}
	}

	async function markMessagesAsRead() {
		try {
			// Get all unread messages (messages not sent by current user)
			const unreadMessages = messages.filter((m) => m.sender_id !== currentUserId);

			if (unreadMessages.length === 0) {
				return; // Nothing to mark as read
			}

			// Build read status objects
			const readStatuses = unreadMessages.map((msg) => ({
				message_id: msg.id,
				user_id: currentUserId
			}));

			await nhost.graphql.request(MARK_COLLABORATION_MESSAGES_AS_READ, {
				readStatuses
			});
		} catch (err) {
			console.error('Error marking messages as read:', err);
		}
	}

	function scrollToBottom() {
		if (messagesContainer) {
			setTimeout(() => {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}, 100);
		}
	}

	async function sendMessage() {
		if (!newMessage.trim() || sending) return;

		const messageContent = newMessage.trim();
		sending = true;

		// Clear the textarea value directly to avoid triggering reactivity/re-render
		if (textareaElement) {
			textareaElement.value = '';
		}
		newMessage = '';

		try {
			const result = await nhost.graphql.request(SEND_COLLABORATION_MESSAGE, {
				postId,
				senderId: currentUserId,
				messageType: 'text',
				content: messageContent
			});

			if (result.error) {
				console.error('Error sending message:', result.error);
				newMessage = messageContent; // Restore message on error
				if (textareaElement) {
					textareaElement.value = messageContent;
				}
			} else if (result.data?.insert_collaboration_message_one) {
				// Optimistically add the message to the UI immediately
				const newMsg = result.data.insert_collaboration_message_one;

				// Check if message already exists (from subscription)
				const messageExists = messages.some((m) => m.id === newMsg.id);

				if (!messageExists) {
					messages = [...messages, newMsg];
				}

				scrollToBottom();
			}
		} catch (err) {
			console.error('Error sending message:', err);
			newMessage = messageContent; // Restore message on error
			if (textareaElement) {
				textareaElement.value = messageContent;
			}
		} finally {
			sending = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function handleInputFocus(event: FocusEvent) {
		// On mobile, scroll the input into view when focused
		if (typeof window !== 'undefined' && window.innerWidth <= 768) {
			setTimeout(() => {
				(event.target as HTMLElement).scrollIntoView({
					behavior: 'smooth',
					block: 'nearest'
				});
			}, 300); // Delay to allow keyboard animation
		}
	}

	async function handleApproveEditRequest(messageId: string) {
		processingMessageId = messageId;

		try {
			const message = messages.find((m) => m.id === messageId);
			if (!message || !message.metadata) return;

			const result = await nhost.graphql.request(APPROVE_EDIT_CONTROL_FROM_CHAT, {
				messageId,
				postId,
				newEditorId: message.metadata.requester_id,
				previousEditorId: message.metadata.current_holder_id,
				now: new Date().toISOString()
			});

			if (result.error) {
				console.error('Error approving edit request:', result.error);
			}
			// Message will be updated via subscription
		} catch (err) {
			console.error('Error approving edit request:', err);
		} finally {
			processingMessageId = null;
		}
	}

	async function handleDenyEditRequest(messageId: string) {
		processingMessageId = messageId;

		try {
			const result = await nhost.graphql.request(DENY_EDIT_CONTROL_FROM_CHAT, {
				messageId,
				denialMessage: null
			});

			if (result.error) {
				console.error('Error denying edit request:', result.error);
			}
			// Message will be updated via subscription
		} catch (err) {
			console.error('Error denying edit request:', err);
		} finally {
			processingMessageId = null;
		}
	}

	// Start subscription for real-time messages
	function startSubscription() {
		if (subscription) return; // Already subscribed

		console.log('[Chat] Setting up subscription for post:', postId);
		subscription = apolloClient
			.subscribe({
				query: SUBSCRIBE_TO_COLLABORATION_MESSAGES,
				variables: { postId }
			})
			.subscribe({
				next: (result: any) => {
					console.log(
						'[Chat] Subscription update received:',
						result.data?.collaboration_message?.length,
						'messages'
					);
					subscriptionActive = true;
					// Clear polling fallback if subscription is working
					stopPolling();
					if (result.data?.collaboration_message) {
						messages = result.data.collaboration_message;
						scrollToBottom();
						markMessagesAsRead();
					}
				},
				error: (err: any) => {
					console.error('[Chat] Subscription error:', err);
					subscriptionActive = false;
					// Only start polling if subscription explicitly fails and page is visible
					if ($isPageVisible) {
						console.log('[Chat] Subscription failed, starting polling fallback');
						startPollingFallback();
					}
				}
			});
	}

	// Stop subscription
	function stopSubscription() {
		if (subscription) {
			console.log('[Chat] Stopping subscription');
			subscription.unsubscribe();
			subscription = null;
			subscriptionActive = false;
		}
	}

	// Start polling fallback (only when subscription fails)
	function startPollingFallback() {
		if (pollingInterval || subscriptionActive) {
			return; // Don't poll if already polling or subscription is working
		}
		console.log('[Chat] Starting polling fallback every 5 seconds');
		pollingInterval = setInterval(() => {
			if ($isPageVisible) {
				console.log('[Chat] Polling tick - fetching messages');
				loadMessages();
			}
		}, 5000); // Increased from 3s to 5s to reduce load
	}

	// Stop polling
	function stopPolling() {
		if (pollingInterval) {
			console.log('[Chat] Stopping polling');
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
	}

	// Track previous visibility state to avoid loops
	let wasVisible: boolean | null = null;

	// React to visibility changes - only act when visibility actually changes
	$effect(() => {
		const currentVisible = $isPageVisible;

		// Only react to actual changes, not initial render or same-value updates
		if (wasVisible !== null && wasVisible !== currentVisible) {
			if (currentVisible) {
				// Page became visible - fetch latest state immediately, then resume subscription
				console.log('[Chat] Page visible - resuming');
				loadMessages();
				markMessagesAsRead();
				startSubscription();
			} else {
				// Page hidden - stop subscription and polling to save resources
				console.log('[Chat] Page hidden - pausing');
				stopSubscription();
				stopPolling();
			}
		}

		wasVisible = currentVisible;
	});

	onMount(() => {
		loadMessages();
		markMessagesAsRead();

		// Only start subscription if page is visible
		if ($isPageVisible) {
			startSubscription();
		}

		// Initialize wasVisible to prevent initial effect from triggering
		wasVisible = $isPageVisible;
	});

	onDestroy(() => {
		stopSubscription();
		stopPolling();
	});
</script>

<div class="chat-thread">
	<div class="thread-header">
		<button type="button" class="back-button" onclick={onBack} aria-label="Back to chat list">
			<ArrowLeft size={20} />
		</button>
		<div class="thread-title">
			<h3>{discussionTitle}</h3>
			<p class="collaborator-count">
				{collaborators.length} collaborator{collaborators.length !== 1 ? 's' : ''}
			</p>
		</div>
	</div>

	<div class="thread-messages" bind:this={messagesContainer}>
		{#if loading}
			<p class="thread-message-empty">Loading messages...</p>
		{:else if error}
			<p class="thread-message-error">{error}</p>
		{:else if messages.length === 0}
			<p class="thread-message-empty">No messages yet. Start the conversation!</p>
		{:else}
			{#each messages as message, index (message.id)}
				{@const prevMessage = index > 0 ? messages[index - 1] : null}
				{@const showHeader =
					!prevMessage ||
					prevMessage.sender_id !== message.sender_id ||
					prevMessage.message_type === 'system' ||
					message.message_type === 'system'}
				<CollaborationMessageItem
					{message}
					{currentUserId}
					{showHeader}
					isProcessing={processingMessageId === message.id}
					onApproveEditRequest={handleApproveEditRequest}
					onDenyEditRequest={handleDenyEditRequest}
				/>
			{/each}
		{/if}
	</div>

	<div class="thread-input">
		<textarea
			bind:this={textareaElement}
			bind:value={newMessage}
			onkeydown={handleKeydown}
			onfocus={handleInputFocus}
			placeholder="Type a message..."
			rows="1"
			disabled={sending}
		></textarea>
		<button
			type="button"
			class="send-button"
			onclick={sendMessage}
			disabled={!newMessage.trim() || sending}
			aria-label="Send message"
		>
			<Send size={20} />
		</button>
	</div>
</div>

<style>
	.chat-thread {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.thread-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border);
	}

	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--border-radius-sm);
		background: transparent;
		border: none;
		color: var(--color-text-primary);
		cursor: pointer;
		transition: background var(--transition-speed) ease;
	}

	.back-button:hover {
		background: var(--color-surface);
	}

	.thread-title {
		flex: 1;
		min-width: 0;
	}

	.thread-title h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		font-family: var(--font-family-display);
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.collaborator-count {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.thread-messages {
		flex: 1;
		overflow-y: auto;
		padding: 0 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.thread-message-empty,
	.thread-message-error {
		padding: 2rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.thread-message-error {
		color: var(--color-error);
	}

	.thread-input {
		display: flex;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
	}

	.thread-input textarea {
		flex: 1;
		min-height: 40px;
		max-height: 120px;
		padding: 0.625rem 0.75rem;
		border: 1px solid var(--color-border);
		/*border-radius: var(--border-radius-md);*/
		background: var(--color-background);
		color: var(--color-text-primary);
		font-family: inherit;
		font-size: 0.9375rem;
		line-height: 2.5;
		resize: none;
		transition: border-color var(--transition-speed) ease;
	}

	.thread-input textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.thread-input textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.send-button {
		display: flex;
		flex-direction: column;
		align-self: center;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--border-radius-md);
		background: var(--color-primary);
		border: none;
		color: black;
		cursor: pointer;
		transition: all var(--transition-speed) ease;
	}

	.send-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 85%, black);
		transform: scale(1.05);
	}

	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Mobile keyboard fix */
	@media (max-width: 768px) {
		.chat-thread {
			/* Ensure proper flex behavior */
			min-height: 0;
		}

		.thread-messages {
			/* Allow messages to scroll independently */
			flex: 1 1 auto;
			min-height: 0;
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}

		.thread-input {
			/* Keep input at bottom, prevent shrinking */
			flex-shrink: 0;
			flex-grow: 0;
		}
	}
</style>
