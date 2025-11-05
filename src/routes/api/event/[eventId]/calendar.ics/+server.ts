import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchHasura } from '$lib/utils/hasuraFetch';
import { GET_EVENT_BY_ID } from '$lib/graphql/queries';
import { generateICS } from '$lib/utils/icsGenerator';

export const GET: RequestHandler = async ({ params, fetch }) => {
	const { eventId } = params;

	try {
		// Fetch event details from database using server-side Hasura fetch
		const result = await fetchHasura(fetch, {
			query: GET_EVENT_BY_ID,
			variables: { eventId }
		});

		if (result.error || !result.data?.event_by_pk) {
			throw error(404, result.error || 'Event not found');
		}

		const event = result.data.event_by_pk;

		// Generate ICS file content
		const icsContent = generateICS({
			title: event.title,
			description: event.description,
			startTime: new Date(event.start_time),
			endTime: new Date(event.end_time),
			timezone: event.timezone,
			location: event.location || event.meeting_link,
			url: event.meeting_link
		});

		// Return ICS file with appropriate headers
		return new Response(icsContent, {
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8',
				'Content-Disposition': `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics"`,
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (err) {
		console.error('Error generating calendar file:', err);
		throw error(500, 'Failed to generate calendar file');
	}
};
