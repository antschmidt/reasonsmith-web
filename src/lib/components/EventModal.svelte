<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { CREATE_EVENT } from '$lib/graphql/queries';
	import { X, Calendar, Clock, Link as LinkIcon, MapPin } from '@lucide/svelte';

	interface Props {
		postId: string;
		contributorId: string;
		discussionTitle?: string;
		isOpen: boolean;
		onClose: () => void;
		onEventCreated?: () => void;
	}

	let { postId, contributorId, discussionTitle, isOpen, onClose, onEventCreated }: Props = $props();

	let title = $state('');
	let description = $state('');
	let startDate = $state('');
	let startTime = $state('');
	let endDate = $state('');
	let endTime = $state('');
	let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);
	let meetingLink = $state('');
	let location = $state('');
	let isCreating = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	$effect(() => {
		if (isOpen) {
			// Set title to discussion title if provided
			title = discussionTitle || '';
			description = '';

			// Set default dates to today
			const today = new Date();
			const year = today.getFullYear();
			const month = String(today.getMonth() + 1).padStart(2, '0');
			const day = String(today.getDate()).padStart(2, '0');
			const todayStr = `${year}-${month}-${day}`;

			startDate = todayStr;
			endDate = todayStr;

			// Set default start time to noon (12:00)
			startTime = '12:00';

			// Set default end time to 1 hour after start (13:00)
			endTime = '13:00';

			meetingLink = '';
			location = '';
			errorMessage = '';
			successMessage = '';
			timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		}
	});

	async function handleCreateEvent() {
		errorMessage = '';
		successMessage = '';

		if (!title.trim()) {
			errorMessage = 'Event title is required';
			return;
		}

		if (!startDate || !startTime) {
			errorMessage = 'Start date and time are required';
			return;
		}

		if (!endDate || !endTime) {
			errorMessage = 'End date and time are required';
			return;
		}

		const startDateTime = new Date(`${startDate}T${startTime}`);
		const endDateTime = new Date(`${endDate}T${endTime}`);

		if (endDateTime <= startDateTime) {
			errorMessage = 'End time must be after start time';
			return;
		}

		isCreating = true;

		try {
			const result = await nhost.graphql.request(CREATE_EVENT, {
				postId,
				title: title.trim(),
				description: description.trim() || null,
				startTime: startDateTime.toISOString(),
				endTime: endDateTime.toISOString(),
				timezone,
				meetingLink: meetingLink.trim() || null,
				location: location.trim() || null
			});

			if (result.error) {
				console.error('Event creation error:', result.error);
				console.error('Full error details:', JSON.stringify(result.error, null, 2));
				const errorDetails = Array.isArray(result.error)
					? result.error.map((e) => e.message).join(', ')
					: result.error.message || 'Failed to create event';
				errorMessage = errorDetails;
			} else {
				successMessage = 'Event created successfully!';
				setTimeout(() => {
					onEventCreated?.();
					onClose();
				}, 1000);
			}
		} catch (error: any) {
			console.error('Event creation exception:', error);
			console.error('Error type:', typeof error);
			console.error('Error constructor:', error?.constructor?.name);
			console.error('Error message:', error?.message);
			console.error('Error cause:', error?.cause);
			console.error('Error body:', error?.body);
			console.error('Error response:', error?.response);

			// Try to extract detailed error message
			let detailedError = 'Error creating event';
			if (error?.body?.errors) {
				detailedError = error.body.errors.map((e: any) => e.message).join(', ');
			} else if (error?.message) {
				detailedError = error.message;
			}

			errorMessage = detailedError;
		} finally {
			isCreating = false;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

{#if isOpen}
	<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
		<div class="modal-content" role="dialog" aria-labelledby="event-modal-title">
			<div class="modal-header">
				<h2 id="event-modal-title">
					<Calendar size={24} />
					Create Event
				</h2>
				<button class="close-button" onclick={onClose} aria-label="Close modal">
					<X size={20} />
				</button>
			</div>

			<div class="modal-body">
				{#if errorMessage}
					<div class="error-message">{errorMessage}</div>
				{/if}

				{#if successMessage}
					<div class="success-message">{successMessage}</div>
				{/if}

				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleCreateEvent();
					}}
				>
					<div class="form-group">
						<label for="event-title">Event Title *</label>
						<input
							id="event-title"
							type="text"
							bind:value={title}
							placeholder="Weekly sync meeting"
							required
						/>
					</div>

					<div class="form-group">
						<label for="event-description">Description</label>
						<textarea
							id="event-description"
							bind:value={description}
							placeholder="Discuss progress and next steps..."
							rows="3"
						></textarea>
					</div>

					<div class="form-row">
						<div class="form-group">
							<label for="start-date">Start Date *</label>
							<input id="start-date" type="date" bind:value={startDate} required />
						</div>
						<div class="form-group">
							<label for="start-time">Start Time *</label>
							<input id="start-time" type="time" bind:value={startTime} required />
						</div>
					</div>

					<div class="form-row">
						<div class="form-group">
							<label for="end-date">End Date *</label>
							<input id="end-date" type="date" bind:value={endDate} required />
						</div>
						<div class="form-group">
							<label for="end-time">End Time *</label>
							<input id="end-time" type="time" bind:value={endTime} required />
						</div>
					</div>

					<div class="form-group">
						<label for="timezone">Timezone</label>
						<input id="timezone" type="text" bind:value={timezone} readonly />
					</div>

					<div class="form-group">
						<label for="meeting-link">
							<LinkIcon size={16} />
							Meeting Link
						</label>
						<input
							id="meeting-link"
							type="url"
							bind:value={meetingLink}
							placeholder="https://zoom.us/j/..."
						/>
					</div>

					<div class="form-group">
						<label for="location">
							<MapPin size={16} />
							Location
						</label>
						<input
							id="location"
							type="text"
							bind:value={location}
							placeholder="123 Main St, City, State or Room Name"
						/>
					</div>

					<div class="modal-actions">
						<button type="button" class="secondary-button" onclick={onClose}>Cancel</button>
						<button type="submit" class="primary-button" disabled={isCreating}>
							{isCreating ? 'Creating...' : 'Create Event'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--color-surface);
		border-radius: 8px;
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid var(--border-color);
	}

	.modal-header h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 1.25rem;
	}

	.close-button {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		color: var(--text-secondary);
		border-radius: 4px;
		transition: background-color 0.2s;
	}

	.close-button:hover {
		background: var(--hover-background);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.form-group {
		margin-bottom: 1.25rem;
	}

	.form-group label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.form-group input,
	.form-group textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		background: var(--input-background);
		color: var(--text-primary);
		font-family: inherit;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--accent-color);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.error-message {
		padding: 0.75rem;
		background: #fee;
		color: #c00;
		border-radius: 6px;
		margin-bottom: 1rem;
	}

	.success-message {
		padding: 0.75rem;
		background: #efe;
		color: #060;
		border-radius: 6px;
		margin-bottom: 1rem;
	}

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border-color);
	}

	.primary-button,
	.secondary-button {
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.primary-button {
		background: var(--accent-color);
		color: white;
		border: none;
	}

	.primary-button:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.primary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.secondary-button {
		background: transparent;
		border: 1px solid var(--border-color);
		color: var(--text-primary);
	}

	.secondary-button:hover {
		background: var(--hover-background);
	}
</style>
