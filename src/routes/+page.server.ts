import type { PageServerLoad } from './$types';
import { GET_PUBLIC_SHOWCASE_PUBLISHED } from '$lib/graphql/queries';
import { fetchHasura } from '$lib/utils/hasuraFetch';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const result = await fetchHasura(fetch, {
			query: GET_PUBLIC_SHOWCASE_PUBLISHED
		});

		if (result.error) {
			console.error('[+page.server.ts] Hasura error:', result.error);
		}

		return {
			showcaseItems: result.data?.public_showcase_item ?? [],
			showcaseError: result.error || null
		};
	} catch (error) {
		console.error('[+page.server.ts] Unexpected error:', error);
		// Return empty data rather than throwing, to prevent 500 errors
		return {
			showcaseItems: [],
			showcaseError: 'Failed to load showcase items'
		};
	}
};
