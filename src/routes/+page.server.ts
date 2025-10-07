import type { PageServerLoad } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { print } from 'graphql';
import { GET_PUBLIC_SHOWCASE_PUBLISHED } from '$lib/graphql/queries';

const HASURA_GRAPHQL_ENDPOINT = privateEnv.GRAPHQL_URL || privateEnv.HASURA_GRAPHQL_ENDPOINT || '';
const HASURA_ADMIN_SECRET = privateEnv.HASURA_ADMIN_SECRET || '';

export const load: PageServerLoad = async ({ fetch }) => {
	let showcaseItems: any[] = [];
	let showcaseError: string | null = null;

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_ADMIN_SECRET) {
		showcaseError = 'Showcase temporarily unavailable.';
	} else {
		try {
			const queryString = print(GET_PUBLIC_SHOWCASE_PUBLISHED);
			const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
					'x-hasura-role': 'anonymous'
				},
				body: JSON.stringify({ query: queryString })
			});
			const json = await response.json();
			if (json.errors) {
				showcaseError = json.errors[0]?.message || 'Failed to load showcase.';
			} else {
				showcaseItems = json.data?.public_showcase_item ?? [];
			}
		} catch (error: any) {
			console.error('Showcase load error:', error);
			showcaseError = error?.message || 'Failed to load showcase.';
		}
	}

	return {
		showcaseItems,
		showcaseError
	};
};
