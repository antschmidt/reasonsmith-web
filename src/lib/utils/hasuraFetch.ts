/**
 * Shared utility for server-side Hasura GraphQL requests
 */

import { env as privateEnv } from '$env/dynamic/private';
import { print, type DocumentNode } from 'graphql';

/**
 * Configuration for Hasura endpoint and authentication
 */
const getHasuraConfig = () => {
	const endpoint = privateEnv.GRAPHQL_URL || privateEnv.HASURA_GRAPHQL_ENDPOINT || '';
	const adminSecret =
		privateEnv.HASURA_GRAPHQL_ADMIN_SECRET || privateEnv.HASURA_ADMIN_SECRET || '';
	return { endpoint, adminSecret };
};

export interface HasuraFetchOptions {
	query: DocumentNode;
	variables?: Record<string, any>;
	// Note: role option removed - admin secret provides full access without role headers
}

export interface HasuraFetchResult<T = any> {
	data?: T;
	error?: string;
}

/**
 * Fetch data from Hasura GraphQL endpoint with standardized error handling
 *
 * @param fetch - SvelteKit fetch function
 * @param options - Query, variables, and optional role
 * @returns Result object with data or error
 */
export async function fetchHasura<T = any>(
	fetch: typeof globalThis.fetch,
	options: HasuraFetchOptions
): Promise<HasuraFetchResult<T>> {
	const { endpoint, adminSecret } = getHasuraConfig();

	if (!endpoint || !adminSecret) {
		console.error('[hasuraFetch] Missing config:', {
			hasEndpoint: !!endpoint,
			hasAdminSecret: !!adminSecret,
			secretLength: adminSecret?.length
		});
		return { error: 'Service temporarily unavailable.' };
	}

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': adminSecret
				// Admin secret provides full access - no role header needed
			},
			body: JSON.stringify({
				query: print(options.query),
				...(options.variables && { variables: options.variables })
			})
		});

		const json = await response.json();

		if (json.errors) {
			console.error('[hasuraFetch] GraphQL errors:', json.errors);
			return { error: json.errors[0]?.message || 'Failed to fetch data.' };
		}

		return { data: json.data };
	} catch (err: any) {
		console.error('[hasuraFetch] Exception:', err);
		return { error: err?.message || 'Failed to fetch data.' };
	}
}
