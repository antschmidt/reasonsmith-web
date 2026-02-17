<script lang="ts">
	import { Calendar, Clock, MapPin, Download, QrCode, Users, Trash2 } from '@lucide/svelte';
	import { downloadICS, type ICSEvent } from '$lib/utils/icsGenerator';
	import { generateQRCode } from '$lib/utils/qrCodeGenerator';
	import { nhost } from '$lib/nhostClient';
	import { DELETE_EVENT } from '$lib/graphql/queries';

	type Event = {
		id: string;
		title: string;
		description?: string;
		start_time: string;
		end_time: string;
		timezone: string;
		meeting_link?: string;
		location?: string;
		created_by: string;
		creator: {
			display_name: string;
			handle?: string;
			avatar_url?: string;
		};
		attendees?: Array<{
			id: string;
			rsvp_status: 'pending' | 'accepted' | 'declined';
			contributor: {
				display_name: string;
				avatar_url?: string;
			};
		}>;
	};

	interface Props {
		event: Event;
		currentUserId?: string;
		onDeleted?: () => void;
	}

	let { event, currentUserId, onDeleted }: Props = $props();

	let qrCodeUrl = $state<string | null>(null);
	let showQR = $state(false);
	let isDeleting = $state(false);
	let deleteError = $state<string | null>(null);

	const isCreator = $derived(currentUserId && event.created_by === currentUserId);

	const startDate = $derived(new Date(event.start_time));
	const endDate = $derived(new Date(event.end_time));

	const formattedDate = $derived(
		startDate.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	const formattedTime = $derived(
		`${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
	);

	const acceptedCount = $derived(
		event.attendees?.filter((a) => a.rsvp_status === 'accepted').length || 0
	);

	async function handleDownloadICS(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		const icsEvent: ICSEvent = {
			title: event.title,
			description: event.description,
			startTime: startDate,
			endTime: endDate,
			timezone: event.timezone,
			location: event.location || event.meeting_link,
			url: event.meeting_link
		};

		downloadICS(icsEvent);
	}

	async function handleToggleQR(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!showQR && !qrCodeUrl) {
			try {
				// Generate QR code pointing to the ICS file endpoint
				const icsUrl = `${window.location.origin}/api/event/${event.id}/calendar.ics`;
				qrCodeUrl = await generateQRCode(icsUrl, { width: 512 });
			} catch (error) {
				console.error('Failed to generate QR code:', error);
			}
		}
		showQR = !showQR;
	}

	async function handleDeleteEvent(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!confirm('Are you sure you want to delete this event?')) {
			return;
		}

		isDeleting = true;
		deleteError = null;

		try {
			const result = await nhost.graphql.request(DELETE_EVENT, {
				eventId: event.id
			});

			if (result.error) {
				console.error('Failed to delete event:', result.error);
				deleteError = 'Failed to delete event';
			} else {
				onDeleted?.();
			}
		} catch (error) {
			console.error('Error deleting event:', error);
			deleteError = 'Error deleting event';
		} finally {
			isDeleting = false;
		}
	}
</script>

<div class="event-card">
	<div class="event-header">
		<div class="event-icon">
			<Calendar size={20} />
		</div>
		<div class="event-title-section">
			<h3>{event.title}</h3>
			<p class="event-creator">Created by {event.creator.display_name}</p>
		</div>
	</div>

	{#if event.description}
		<p class="event-description">{event.description}</p>
	{/if}

	<div class="event-details">
		<div class="event-detail">
			<Calendar size={16} />
			<span>{formattedDate}</span>
		</div>
		<div class="event-detail">
			<Clock size={16} />
			<span>{formattedTime}</span>
		</div>
		{#if event.meeting_link}
			<div class="event-detail">
				<MapPin size={16} />
				<a href={event.meeting_link} target="_blank" rel="noopener noreferrer"> Join Meeting </a>
			</div>
		{/if}
		{#if event.location}
			<div class="event-detail">
				<MapPin size={16} />
				<span>{event.location}</span>
			</div>
		{/if}
	</div>

	{#if event.attendees && event.attendees.length > 0}
		<div class="event-attendees">
			<div class="attendees-header">
				<Users size={14} />
				<span>{acceptedCount} attending</span>
			</div>
			<div class="attendees-list">
				{#each event.attendees.filter((a) => a.rsvp_status === 'accepted') as attendee}
					<div class="attendee-avatar" title={attendee.contributor.display_name}>
						{#if attendee.contributor.avatar_url}
							<img src={attendee.contributor.avatar_url} alt={attendee.contributor.display_name} />
						{:else}
							<span class="avatar-initials">
								{attendee.contributor.display_name?.charAt(0).toUpperCase() || '?'}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="event-actions">
		<button class="action-button" onclick={handleDownloadICS} title="Download to calendar">
			<Download size={16} />
			<span>Add to Calendar</span>
		</button>
		<button class="action-button" onclick={handleToggleQR} title="Show QR code for calendar event">
			<QrCode size={16} />
			<span>{showQR ? 'Hide' : 'Show'} QR</span>
		</button>
		{#if isCreator}
			<button
				class="action-button delete-button"
				onclick={handleDeleteEvent}
				disabled={isDeleting}
				title="Delete event"
			>
				<Trash2 size={16} />
				<span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
			</button>
		{/if}
	</div>

	{#if deleteError}
		<div class="delete-error">{deleteError}</div>
	{/if}

	{#if showQR && qrCodeUrl}
		<div class="qr-code-container">
			<img src={qrCodeUrl} alt="Calendar Event QR Code" class="qr-code" />
			<p class="qr-label">Scan to add event to your calendar</p>
		</div>
	{/if}
</div>

<style>
	.event-card {
		background: var(--card-background);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.event-header {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.event-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		background: color-mix(in srgb, var(--accent-color) 10%, transparent);
		border-radius: 8px;
		color: var(--accent-color);
		flex-shrink: 0;
	}

	.event-title-section {
		flex: 1;
	}

	.event-title-section h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.event-creator {
		margin: 0.25rem 0 0 0;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.event-description {
		margin: 0;
		color: var(--text-primary);
		line-height: 1.6;
	}

	.event-details {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.event-detail {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.event-detail a {
		color: var(--accent-color);
		text-decoration: none;
	}

	.event-detail a:hover {
		text-decoration: underline;
	}

	.event-attendees {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border-color);
	}

	.attendees-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		color: var(--text-secondary);
		letter-spacing: 0.05em;
	}

	.attendees-list {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.attendee-avatar {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		overflow: hidden;
		background: var(--accent-color);
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--card-background);
	}

	.attendee-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-initials {
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
	}

	.event-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.action-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		color: var(--text-primary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-button:hover {
		background: var(--hover-background);
		border-color: var(--accent-color);
		color: var(--accent-color);
	}

	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.delete-button {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.delete-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		border-color: var(--color-error);
		color: var(--color-error);
	}

	.delete-error {
		padding: 0.75rem;
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		border: 1px solid var(--color-error);
		border-radius: 6px;
		color: var(--color-error);
		font-size: 0.875rem;
	}

	.qr-code-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--card-background);
		border-radius: 8px;
		max-width: fit-content;
		border: 1px solid var(--border-color);
	}

	.qr-code {
		width: 480px;
		height: 480px;
	}

	.qr-label {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-primary);
	}
</style>
