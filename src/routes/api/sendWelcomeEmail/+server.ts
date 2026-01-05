/**
 * API endpoint to send welcome email to new users via Postmark
 * Called after a user's first successful sign-in
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const GRAPHQL_ENDPOINT = 'https://graphql.reasonsmith.com/v1/graphql';

// Check if user needs welcome email and get their info
const CHECK_WELCOME_EMAIL_STATUS = `
	query CheckWelcomeEmailStatus($userId: uuid!) {
		contributor_by_pk(id: $userId) {
			id
			email
			display_name
			welcome_email_sent
		}
	}
`;

// Mark welcome email as sent
const MARK_WELCOME_EMAIL_SENT = `
	mutation MarkWelcomeEmailSent($userId: uuid!) {
		update_contributor_by_pk(
			pk_columns: { id: $userId },
			_set: { welcome_email_sent: true }
		) {
			id
		}
	}
`;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { userId } = await request.json();

		if (!userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
		const postmarkToken = env.POSTMARK_API_TOKEN;

		if (!adminSecret) {
			console.error('Missing HASURA_GRAPHQL_ADMIN_SECRET');
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		if (!postmarkToken) {
			console.error('Missing POSTMARK_API_TOKEN');
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		// Check if user needs welcome email
		const checkResponse = await fetch(GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': adminSecret
			},
			body: JSON.stringify({
				query: CHECK_WELCOME_EMAIL_STATUS,
				variables: { userId }
			})
		});

		const checkResult = await checkResponse.json();

		if (checkResult.errors) {
			console.error('GraphQL error checking welcome email status:', checkResult.errors);
			return json({ error: 'Failed to check user status' }, { status: 500 });
		}

		const contributor = checkResult.data?.contributor_by_pk;

		if (!contributor) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Already sent welcome email
		if (contributor.welcome_email_sent) {
			return json({ sent: false, reason: 'already_sent' });
		}

		// No email address
		if (!contributor.email) {
			return json({ sent: false, reason: 'no_email' });
		}

		// Send welcome email via Postmark
		const postmarkResponse = await fetch('https://api.postmarkapp.com/email/withTemplate', {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'X-Postmark-Server-Token': postmarkToken
			},
			body: JSON.stringify({
				From: 'welcome@reasonsmith.com',
				To: contributor.email,
				TemplateAlias: 'en.welcome',
				TemplateModel: {
					displayName: contributor.display_name || 'there'
				}
			})
		});

		if (!postmarkResponse.ok) {
			const errorText = await postmarkResponse.text();
			console.error('Postmark error:', postmarkResponse.status, errorText);
			return json({ error: 'Failed to send email', details: errorText }, { status: 500 });
		}

		// Mark welcome email as sent
		const markResponse = await fetch(GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': adminSecret
			},
			body: JSON.stringify({
				query: MARK_WELCOME_EMAIL_SENT,
				variables: { userId }
			})
		});

		const markResult = await markResponse.json();

		if (markResult.errors) {
			console.error('GraphQL error marking welcome email sent:', markResult.errors);
			// Email was sent, just failed to mark - don't return error
		}

		return json({ sent: true });
	} catch (error) {
		console.error('Error in sendWelcomeEmail:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
