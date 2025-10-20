import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { nhost } from './nhostClient';
import { env } from '$env/dynamic/public';

const isBrowser = typeof window !== 'undefined';

const PUBLIC_NHOST_SUBDOMAIN = env.PUBLIC_NHOST_SUBDOMAIN;
const PUBLIC_NHOST_REGION = env.PUBLIC_NHOST_REGION;

// HTTP link for queries and mutations
const httpLink = new HttpLink({
	uri: `https://${PUBLIC_NHOST_SUBDOMAIN}.graphql.${PUBLIC_NHOST_REGION}.nhost.run/v1`,
	fetch: isBrowser ? window.fetch.bind(window) : undefined
});

// WebSocket link for subscriptions
let wsLink: GraphQLWsLink | null = null;

if (isBrowser) {
	const wsClient = createClient({
		url: `wss://${PUBLIC_NHOST_SUBDOMAIN}.graphql.${PUBLIC_NHOST_REGION}.nhost.run/v1`,
		connectionParams: () => {
			const session = nhost.getUserSession();
			const accessToken = session?.accessToken;
			return accessToken
				? {
						headers: {
							Authorization: `Bearer ${accessToken}`
						}
					}
				: {};
		},
		// Reconnect on connection loss
		shouldRetry: () => true,
		retryAttempts: Infinity,
		retryWait: async (retries) => {
			// Exponential backoff with max 30s
			await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** retries, 30000)));
		}
	});

	wsLink = new GraphQLWsLink(wsClient);
}

// Split link: use WebSocket for subscriptions, HTTP for queries/mutations
const splitLink = isBrowser
	? split(
			({ query }) => {
				const definition = getMainDefinition(query);
				return (
					definition.kind === 'OperationDefinition' && definition.operation === 'subscription'
				);
			},
			wsLink!,
			httpLink
		)
	: httpLink;

// Create Apollo Client
export const apolloClient = new ApolloClient({
	link: splitLink,
	cache: new InMemoryCache(),
	defaultOptions: {
		watchQuery: {
			fetchPolicy: 'network-only'
		},
		query: {
			fetchPolicy: 'network-only'
		}
	}
});

// Helper to update connection params when auth state changes
export function updateApolloAuth() {
	if (isBrowser && wsLink) {
		// The WebSocket connection will automatically use the updated connectionParams
		// on reconnection. We can force a reconnect if needed.
		console.log('[Apollo] Auth state changed, WebSocket will update on next connection');
	}
}
