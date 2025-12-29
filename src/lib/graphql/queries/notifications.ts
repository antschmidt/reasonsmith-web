import { gql } from '@apollo/client/core';
import { NOTIFICATION_FIELDS } from '../fragments';

// ============================================
// Notification Queries
// ============================================

export const GET_NOTIFICATIONS = gql`
	query GetNotifications($userId: uuid!, $limit: Int = 20) {
		notification(
			where: { recipient_id: { _eq: $userId } }
			order_by: { created_at: desc }
			limit: $limit
		) {
			...NotificationFields
		}
	}
	${NOTIFICATION_FIELDS}
`;

export const GET_UNREAD_NOTIFICATION_COUNT = gql`
	query GetUnreadNotificationCount($userId: uuid!) {
		notification_aggregate(where: { recipient_id: { _eq: $userId }, read: { _eq: false } }) {
			aggregate {
				count
			}
		}
	}
`;

// ============================================
// Notification Mutations
// ============================================

export const MARK_NOTIFICATION_AS_READ = gql`
	mutation MarkNotificationAsRead($notificationId: uuid!) {
		update_notification_by_pk(pk_columns: { id: $notificationId }, _set: { read: true }) {
			id
			read
		}
	}
`;

export const MARK_ALL_NOTIFICATIONS_AS_READ = gql`
	mutation MarkAllNotificationsAsRead($userId: uuid!) {
		update_notification(where: { recipient_id: { _eq: $userId } }, _set: { read: true }) {
			affected_rows
		}
	}
`;

export const DELETE_NOTIFICATION = gql`
	mutation DeleteNotification($notificationId: uuid!) {
		delete_notification_by_pk(id: $notificationId) {
			id
		}
	}
`;

export const DELETE_ALL_NOTIFICATIONS = gql`
	mutation DeleteAllNotifications($userId: uuid!) {
		delete_notification(where: { recipient_id: { _eq: $userId } }) {
			affected_rows
		}
	}
`;
