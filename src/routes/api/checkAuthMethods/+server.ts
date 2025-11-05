import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId');

	if (!userId) {
		return json({ error: 'Missing userId parameter' }, { status: 400 });
	}

	try {
		// Query contributor table for has_password_auth
		const response = await fetch(process.env.HASURA_GRAPHQL_ENDPOINT || '', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': process.env.HASURA_GRAPHQL_ADMIN_SECRET || ''
			},
			body: JSON.stringify({
				query: `
					query GetContributor($userId: uuid!) {
						contributor_by_pk(id: $userId) {
							has_password_auth
						}
					}
				`,
				variables: { userId }
			})
		});

		const result = await response.json();

		if (result.errors) {
			console.error('GraphQL errors:', result.errors);
			return json({ error: 'Failed to fetch auth methods' }, { status: 500 });
		}

		const contributor = result.data?.contributor_by_pk;
		const hasEmailPassword = contributor?.has_password_auth || false;
		const providerIds: string[] = [];

		// Add email-password to providers list if password auth is enabled
		if (hasEmailPassword) {
			providerIds.push('email-password');
		}

		// TODO: Query Nhost auth tables to get OAuth providers
		// Currently, the Nhost auth schema is not accessible via standard GraphQL queries
		// This will need to be investigated further to display OAuth providers

		return json({
			hasEmailPassword,
			hasOAuth: false,
			providers: providerIds
		});
	} catch (error) {
		console.error('Error checking auth methods:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
