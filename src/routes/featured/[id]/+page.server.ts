import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { GET_SHOWCASE_ITEM_WITH_GRAPH } from '$lib/graphql/queries';
import { fetchHasura } from '$lib/utils/hasuraFetch';

export const load: PageServerLoad = async ({ fetch, params }) => {
	const { id } = params;

	if (!id) {
		throw error(404, 'Featured analysis not found.');
	}

	const result = await fetchHasura(fetch, {
		query: GET_SHOWCASE_ITEM_WITH_GRAPH,
		variables: { id }
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
		} catch {
			// analysis may be missing or invalid JSON — safe to proceed without it
		}
	}

	// Check if a discussion and argument graph already exist for this showcase item
	const linkedDiscussions = result.data?.discussion ?? [];
	const linkedArguments = result.data?.argument ?? [];
	const existingDiscussionId = linkedArguments[0]?.discussion_id ?? linkedDiscussions[0]?.id ?? null;
	const existingArgumentId = linkedArguments[0]?.id ?? null;

	return {
		item,
		structuredAnalysis,
		existingDiscussionId,
		existingArgumentId,
		hasSourceContent: !!item.source_content
	};
};
