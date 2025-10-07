import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { print } from 'graphql';
import { GET_PUBLIC_SHOWCASE_ITEM } from '$lib/graphql/queries';

const HASURA_GRAPHQL_ENDPOINT = privateEnv.GRAPHQL_URL || privateEnv.HASURA_GRAPHQL_ENDPOINT || '';
const HASURA_ADMIN_SECRET = privateEnv.HASURA_ADMIN_SECRET || '';

export const load: PageServerLoad = async ({ fetch, params }) => {
	const { id } = params;

	if (!id) {
		throw error(404, 'Featured analysis not found.');
	}

	if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_ADMIN_SECRET) {
		throw error(500, 'Featured analyses unavailable.');
	}

	try {
		const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
				'x-hasura-role': 'anonymous'
			},
			body: JSON.stringify({
				query: print(GET_PUBLIC_SHOWCASE_ITEM),
				variables: { id }
			})
		});

		const json = await response.json();

		if (json.errors) {
			throw error(500, json.errors[0]?.message || 'Failed to load featured analysis.');
		}

		const item = json.data?.public_showcase_item_by_pk;

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
				console.warn('Failed to parse featured analysis JSON', parseError);
			}
		}

		return { item, structuredAnalysis };
	} catch (err: any) {
		if (err?.status && err?.body) {
			throw err;
		}

		console.error('Failed to load featured analysis', err);
		throw error(500, err?.message || 'Failed to load featured analysis.');
	}
};
