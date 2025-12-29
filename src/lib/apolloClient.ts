import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { nhost } from './nhostClient';
import { env } from '$env/dynamic/public';

const isBrowser = typeof window !== 'undefined';

const PUBLIC_NHOST_SUBDOMAIN = env.PUBLIC_NHOST_SUBDOMAIN;
const PUBLIC_NHOST_REGION = env.PUBLIC_NHOST_REGION;

// Always use Nhost subdomain URLs for now (custom domains need DNS setup)
const httpUrl = `https://${PUBLIC_NHOST_SUBDOMAIN}.graphql.${PUBLIC_NHOST_REGION}.nhost.run/v1`;
const wsUrl = `wss://${PUBLIC_NHOST_SUBDOMAIN}.graphql.${PUBLIC_NHOST_REGION}.nhost.run/v1`;

console.log('[Apollo] Using URLs:', { httpUrl, wsUrl, subdomain: PUBLIC_NHOST_SUBDOMAIN });

// HTTP link for queries and mutations
const httpLink = new HttpLink({
	uri: httpUrl,
	fetch: isBrowser ? window.fetch.bind(window) : undefined
});

// WebSocket link for subscriptions
let wsLink: GraphQLWsLink | null = null;

if (isBrowser) {
	console.log('[WebSocket] Initializing with URL:', wsUrl);

	// Track retry state for exponential backoff
	let retryCount = 0;
	const MAX_RETRIES = 5;
	const BASE_DELAY = 1000; // 1 second base delay

	const wsClient = createClient({
		url: wsUrl,
		connectionParams: async () => {
			// Wait a moment for auth to be ready
			await new Promise((resolve) => setTimeout(resolve, 100));

			const session = nhost.getUserSession();
			const accessToken = session?.accessToken;
			console.log('[WebSocket] Connection params:', {
				hasToken: !!accessToken,
				tokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : null,
				userId: session?.user?.id
			});

			if (!accessToken) {
				console.warn('[WebSocket] No access token available - connection may fail');
				return {};
			}

			return {
				headers: {
					Authorization: `Bearer ${accessToken}`
				}
			};
		},
		// Reconnect on connection loss with limited retries and exponential backoff
		shouldRetry: () => {
			if (retryCount >= MAX_RETRIES) {
				console.warn(`[WebSocket] Max retries (${MAX_RETRIES}) reached, stopping reconnection`);
				return false;
			}
			return true;
		},
		retryAttempts: MAX_RETRIES,
		// Exponential backoff: 1s, 2s, 4s, 8s, 16s
		retryWait: async (retries) => {
			retryCount = retries;
			const delay = Math.min(BASE_DELAY * Math.pow(2, retries), 30000); // Cap at 30 seconds
			console.log(`[WebSocket] Retry ${retries + 1}/${MAX_RETRIES} in ${delay}ms`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		},
		// Keep connection alive with ping/pong
		keepAlive: 10000, // Send keepalive every 10 seconds
		// Lazy connection - only connect when subscription is actually needed
		lazy: true,
		// Log connection state for debugging
		on: {
			connected: () => {
				console.log('[WebSocket] Connected successfully');
				retryCount = 0; // Reset retry count on successful connection
			},
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
			// Serve cached data immediately, then update from network
			fetchPolicy: 'cache-and-network'
		},
		query: {
			// Use cache if available, only fetch from network if not cached
			fetchPolicy: 'cache-first'
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
