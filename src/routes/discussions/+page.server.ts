import type { PageServerLoad } from './$types';
import { GET_PUBLIC_SHOWCASE_PUBLISHED } from '$lib/graphql/queries';
import { fetchHasura } from '$lib/utils/hasuraFetch';

export const load: PageServerLoad = async ({ fetch }) => {
	const result = await fetchHasura(fetch, {
		query: GET_PUBLIC_SHOWCASE_PUBLISHED,
		role: 'anonymous'
	});

	return {
		showcaseItems: result.data?.public_showcase_item ?? [],
		showcaseError: result.error || null
	};
};
