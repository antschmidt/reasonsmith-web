import { gql } from '@apollo/client/core';
import { EVENT_FIELDS } from '../fragments';

// ============================================
// Event Queries
// ============================================

export const GET_POST_EVENTS = gql`
	query GetPostEvents($postId: uuid!, $now: timestamptz!) {
		event(
			where: {
				post_id: { _eq: $postId }
				deleted_at: { _is_null: true }
				start_time: { _gte: $now }
			}
			order_by: { start_time: asc }
		) {
			...EventFields
		}
	}
	${EVENT_FIELDS}
`;

export const GET_EVENT_BY_ID = gql`
	query GetEventById($eventId: uuid!) {
		event_by_pk(id: $eventId) {
			id
			title
			description
			start_time
			end_time
			timezone
			meeting_link
			location
			created_by
			created_at
			updated_at
		}
	}
`;

export const GET_CONTRIBUTOR_EVENTS = gql`
	query GetContributorEvents($contributorId: uuid!, $afterTime: timestamptz!) {
		event_attendee(
			where: {
				contributor_id: { _eq: $contributorId }
				event: { start_time: { _gte: $afterTime }, deleted_at: { _is_null: true } }
			}
			order_by: { event: { start_time: asc } }
		) {
			id
			rsvp_status
			event {
				...EventFields
			}
		}
	}
	${EVENT_FIELDS}
`;

// ============================================
// Event Mutations
// ============================================

export const CREATE_EVENT = gql`
	mutation CreateEvent(
		$postId: uuid!
		$title: String!
		$description: String
		$startTime: timestamptz!
		$endTime: timestamptz!
		$timezone: String!
		$meetingLink: String
		$location: String
	) {
		insert_event_one(
			object: {
				post_id: $postId
				title: $title
				description: $description
				start_time: $startTime
				end_time: $endTime
				timezone: $timezone
				meeting_link: $meetingLink
				location: $location
			}
		) {
			...EventFields
		}
	}
	${EVENT_FIELDS}
`;

export const UPDATE_EVENT = gql`
	mutation UpdateEvent(
		$eventId: uuid!
		$title: String
		$description: String
		$startTime: timestamptz
		$endTime: timestamptz
		$timezone: String
		$meetingLink: String
		$location: String
	) {
		update_event_by_pk(
			pk_columns: { id: $eventId }
			_set: {
				title: $title
				description: $description
				start_time: $startTime
				end_time: $endTime
				timezone: $timezone
				meeting_link: $meetingLink
				location: $location
			}
		) {
			...EventFields
		}
	}
	${EVENT_FIELDS}
`;

export const DELETE_EVENT = gql`
	mutation DeleteEvent($eventId: uuid!) {
		delete_event_by_pk(id: $eventId) {
			id
		}
	}
`;

export const RSVP_TO_EVENT = gql`
	mutation RsvpToEvent($eventId: uuid!, $contributorId: uuid!, $rsvpStatus: rsvp_status!) {
		insert_event_attendee_one(
			object: { event_id: $eventId, contributor_id: $contributorId, rsvp_status: $rsvpStatus }
			on_conflict: {
				constraint: event_attendee_event_id_contributor_id_key
				update_columns: [rsvp_status]
			}
		) {
			id
			event_id
			contributor_id
			rsvp_status
			created_at
			updated_at
		}
	}
`;
