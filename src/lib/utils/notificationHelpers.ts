/**
 * Notification Helper Utilities
 *
 * Consolidated notification message formatting and handling
 * to reduce code duplication across notification components.
 */

export type Notification = {
	id: string;
	type: string;
	discussion_id: string | null;
	post_id: string | null;
	actor_id: string | null;
	read: boolean;
	created_at: string;
	metadata?: any;
	discussion?: {
		discussion_versions?: Array<{ title: string }>;
	} | null;
	post?: {
		content: string;
		post_collaborators?: Array<{
			id: string;
		}>;
	} | null;
};

/**
 * Generates a user-friendly message for a notification based on its type
 *
 * @param notification - The notification object
 * @param userId - Optional current user ID for context-specific messages
 * @returns A formatted notification message string
 */
export function getNotificationMessage(notification: Notification, userId?: string): string {
	const discussionTitle =
		notification.discussion?.discussion_versions?.[0]?.title || 'a discussion';

	switch (notification.type) {
		case 'new_comment_on_my_discussion':
			return `New comment on your discussion "${discussionTitle}"`;

		case 'new_comment_on_participated_discussion':
			return `New comment on "${discussionTitle}"`;

		case 'reply_to_my_comment':
			return `New reply to your comment in "${discussionTitle}"`;

		case 'collaboration_invite':
			return `You've been invited to collaborate on "${notification.metadata?.discussion_title || discussionTitle}" as ${notification.metadata?.role || 'editor'}`;

		case 'edit_control_request':
			const isForAuthor = notification.metadata?.current_holder_id !== userId;
			if (isForAuthor) {
				return `Edit control request for "${notification.metadata?.discussion_title || discussionTitle}"`;
			} else {
				return `Someone is requesting edit control`;
			}

		case 'role_upgrade_request':
			return `Role upgrade request for "${notification.metadata?.discussion_title || discussionTitle}"`;

		case 'editors_desk_approval_request':
			return `Your discussion "${discussionTitle}" has been submitted for editorial review`;

		case 'editors_desk_approved':
			return `Your discussion "${discussionTitle}" has been featured on the Editors' Desk!`;

		case 'editors_desk_rejected':
			return `Your discussion "${discussionTitle}" was not selected for featuring`;

		// Follow/Contact notifications
		case 'new_follower':
			return `${notification.metadata?.follower_name || 'Someone'} started following you`;

		case 'follow_request':
			return `${notification.metadata?.follower_name || 'Someone'} requested to follow you`;

		case 'follow_request_approved':
			return `Your follow request was approved`;

		case 'collaboration_contact_request':
			return `${notification.metadata?.requester_name || 'Someone'} wants to add you as a contact`;

		case 'collaboration_contact_accepted':
			return `${notification.metadata?.target_name || 'Someone'} accepted your contact request`;

		default:
			return `New activity on "${discussionTitle}"`;
	}
}

/**
 * Gets a short label for notification type (for badges, etc.)
 *
 * @param type - The notification type
 * @returns A short label string
 */
export function getNotificationTypeLabel(type: string): string {
	switch (type) {
		case 'new_comment_on_my_discussion':
		case 'new_comment_on_participated_discussion':
			return 'Comment';
		case 'reply_to_my_comment':
			return 'Reply';
		case 'collaboration_invite':
			return 'Invite';
		case 'edit_control_request':
			return 'Edit Request';
		case 'role_upgrade_request':
			return 'Role Request';
		case 'editors_desk_approval_request':
			return 'Pending Review';
		case 'editors_desk_approved':
			return 'Featured';
		case 'editors_desk_rejected':
			return 'Not Featured';
		case 'new_follower':
			return 'New Follower';
		case 'follow_request':
			return 'Follow Request';
		case 'follow_request_approved':
			return 'Approved';
		case 'collaboration_contact_request':
			return 'Contact Request';
		case 'collaboration_contact_accepted':
			return 'Contact Added';
		default:
			return 'Activity';
	}
}

/**
 * Checks if a notification is a social/networking type that doesn't link to a discussion
 *
 * @param type - The notification type
 * @returns true if the notification is a social type
 */
export function isSocialNotification(type: string): boolean {
	const socialTypes = [
		'new_follower',
		'follow_request',
		'follow_request_approved',
		'collaboration_contact_request',
		'collaboration_contact_accepted'
	];
	return socialTypes.includes(type);
}

/**
 * Determines if a notification is urgent/high priority
 *
 * @param type - The notification type
 * @returns true if the notification is urgent
 */
export function isUrgentNotification(type: string): boolean {
	const urgentTypes = [
		'collaboration_invite',
		'edit_control_request',
		'role_upgrade_request',
		'editors_desk_approved'
	];
	return urgentTypes.includes(type);
}

/**
 * Formats a notification timestamp as relative time
 *
 * @param timestamp - ISO timestamp string
 * @returns Relative time string (e.g., "2 hours ago")
 */
export function formatNotificationTime(timestamp: string): string {
	const now = Date.now();
	const notifTime = new Date(timestamp).getTime();
	const diffMs = now - notifTime;
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	// For older notifications, show the date
	return new Date(timestamp).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric'
	});
}
