import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { GET_PUBLIC_SHOWCASE_ITEM } from '$lib/graphql/queries';
import { fetchHasura } from '$lib/utils/hasuraFetch';

export const load: PageServerLoad = async ({ fetch, params }) => {
	const { id } = params;

	if (!id) {
		throw error(404, 'Featured analysis not found.');
	}

	const result = await fetchHasura(fetch, {
		query: GET_PUBLIC_SHOWCASE_ITEM,
		variables: { id },
		role: 'anonymous'
	});

	if (result.error) {
		throw error(500, result.error);
	}

	const item = result.data?.public_showcase_item_by_pk;

	if (!item) {
		throw error(404, 'Featured analysis not found.');
	}

	let structuredAnalysis: any = null;
	if (item.analysis && typeof item.analysis === 'string') {
		try {
			const parsed = JSON.parse(item.analysis);
			if (parsed && typeof parsed === 'object') {
				structuredAnalysis = parsed;
			}
		} catch (parseError) {
			// Silent fail - analysis field is optional
		}
	}

	return { item, structuredAnalysis };
};
