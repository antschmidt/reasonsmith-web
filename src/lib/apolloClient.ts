import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { nhost } from './nhostClient';
import { env } from '$env/dynamic/public';

const isBrowser = typeof window !== 'undefined';

const PUBLIC_NHOST_SUBDOMAIN = env.PUBLIC_NHOST_SUBDOMAIN;
const PUBLIC_NHOST_REGION = env.PUBLIC_NHOST_REGION;

// Use custom domain in production, subdomain in development
const isProduction = isBrowser && window.location.hostname === 'reasonsmith.com';
const httpUrl = isProduction
	? 'https://graphql.reasonsmith.com/v1'
	: `https://${PUBLIC_NHOST_SUBDOMAIN}.graphql.${PUBLIC_NHOST_REGION}.nhost.run/v1`;
const wsUrl = isProduction
	? 'wss://graphql.reasonsmith.com/v1'
	: `wss://${PUBLIC_NHOST_SUBDOMAIN}.graphql.${PUBLIC_NHOST_REGION}.nhost.run/v1`;

console.log('[Apollo] Using URLs:', { httpUrl, wsUrl, isProduction });

// HTTP link for queries and mutations
const httpLink = new HttpLink({
	uri: httpUrl,
	fetch: isBrowser ? window.fetch.bind(window) : undefined
});

// WebSocket link for subscriptions
let wsLink: GraphQLWsLink | null = null;

if (isBrowser) {
	console.log('[WebSocket] Initializing with URL:', wsUrl);

	const wsClient = createClient({
		url: wsUrl,
		connectionParams: async () => {
			const session = nhost.getUserSession();
			const accessToken = session?.accessToken;
			console.log('[WebSocket] Connection params - has token:', !!accessToken);
			return accessToken
				? {
						headers: {
							Authorization: `Bearer ${accessToken}`
						}
					}
				: {};
		},
		// Reconnect on connection loss
		shouldRetry: (err) => {
			console.log('[WebSocket] Retry check, error:', err);
			return true;
		},
		retryAttempts: 15,
		retryWait: async (retries) => {
			console.log('[WebSocket] Retry attempt:', retries);
			// Exponential backoff with max 30s
			await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** retries, 30000)));
		},
		// Keep connection alive with ping/pong
		keepAlive: 10000, // Send keepalive every 10 seconds
		// Lazy connection - don't connect until subscription is active
		lazy: false,
		// Log connection state for debugging
		on: {
			connected: () => console.log('[WebSocket] Connected successfully'),
			connecting: () => console.log('[WebSocket] Connecting...'),
			closed: (event) => {
				console.log('[WebSocket] Closed:', {
					code: event?.code,
					reason: event?.reason,
					wasClean: event?.wasClean,
					event
				});
			},
			error: (err) => {
				console.error('[WebSocket] Error:', {
					error: err,
					message: err?.message,
					type: err?.type,
					target: err?.target?.url,
					readyState: err?.target?.readyState
				});
			},
			opened: (socket) => console.log('[WebSocket] Socket opened:', socket)
		}
	});

	wsLink = new GraphQLWsLink(wsClient);
}

// Split link: use WebSocket for subscriptions, HTTP for queries/mutations
const splitLink = isBrowser
	? split(
			({ query }) => {
				const definition = getMainDefinition(query);
				return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
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
