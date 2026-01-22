import { createClient } from '@nhost/nhost-js';
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';

const isBrowser = typeof window !== 'undefined';

const PUBLIC_NHOST_SUBDOMAIN = env.PUBLIC_NHOST_SUBDOMAIN;
const PUBLIC_NHOST_REGION = env.PUBLIC_NHOST_REGION;

if (!PUBLIC_NHOST_SUBDOMAIN || !PUBLIC_NHOST_REGION) {
	console.warn(
		'[nhostClient] Missing PUBLIC_NHOST_SUBDOMAIN or PUBLIC_NHOST_REGION; configure in Vercel project settings.'
	);
}

const REFRESH_TOKEN_KEY = 'nhostRefreshToken';
const REFRESH_TOKEN_ID_KEY = 'nhostRefreshTokenId';
const REFRESH_TOKEN_EXPIRES_AT_KEY = 'nhostRefreshTokenExpiresAt';
const SESSION_CACHE_META_SUBDOMAIN = '__nhost_last_subdomain';
const SESSION_CACHE_META_REGION = '__nhost_last_region';
const TOKEN_ENDPOINT_PATH = '/v1/token';
const FETCH_PATCH_FLAG = '__nhost_token_interceptor__';

function clearCachedSession() {
	localStorage.removeItem(REFRESH_TOKEN_KEY);
	localStorage.removeItem(REFRESH_TOKEN_ID_KEY);
	localStorage.removeItem(REFRESH_TOKEN_EXPIRES_AT_KEY);
}

function sanitiseCachedSession() {
	const invalidValues = new Set(['', 'null', 'undefined']);

	const cachedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
	if (
		!cachedRefreshToken ||
		invalidValues.has(cachedRefreshToken.trim()) ||
		cachedRefreshToken.trim().length < 20
	) {
		clearCachedSession();
	}

	const cachedRefreshTokenId = localStorage.getItem(REFRESH_TOKEN_ID_KEY);
	if (cachedRefreshTokenId && invalidValues.has(cachedRefreshTokenId.trim())) {
		clearCachedSession();
	}

	const expiresAtRaw = localStorage.getItem(REFRESH_TOKEN_EXPIRES_AT_KEY);
	if (expiresAtRaw) {
		const expiresAt = new Date(expiresAtRaw);
		if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
			clearCachedSession();
		}
	}

	if (PUBLIC_NHOST_SUBDOMAIN) {
		const previous = localStorage.getItem(SESSION_CACHE_META_SUBDOMAIN);
		if (previous && previous !== PUBLIC_NHOST_SUBDOMAIN) {
			clearCachedSession();
		}
	}
	if (PUBLIC_NHOST_REGION) {
		const previous = localStorage.getItem(SESSION_CACHE_META_REGION);
		if (previous && previous !== PUBLIC_NHOST_REGION) {
			clearCachedSession();
		}
	}

	if (PUBLIC_NHOST_SUBDOMAIN) {
		localStorage.setItem(SESSION_CACHE_META_SUBDOMAIN, PUBLIC_NHOST_SUBDOMAIN);
	}
	if (PUBLIC_NHOST_REGION) {
		localStorage.setItem(SESSION_CACHE_META_REGION, PUBLIC_NHOST_REGION);
	}
}

// Create configuration based on environment
// FORCE subdomain usage to avoid CORS issues with custom domains
const nhostConfig = {
	subdomain: PUBLIC_NHOST_SUBDOMAIN,
	region: PUBLIC_NHOST_REGION,
	clientStorage: isBrowser ? localStorage : undefined,
	clientStorageType: isBrowser ? ('web' as const) : undefined,
	autoLogin: true
};

// Add debugging to confirm configuration
if (isBrowser) {
	const globalAny = window as typeof window & { [FETCH_PATCH_FLAG]?: boolean };
	if (!globalAny[FETCH_PATCH_FLAG] && typeof fetch === 'function') {
		const originalFetch = window.fetch.bind(window);
		globalAny[FETCH_PATCH_FLAG] = true;
		window.fetch = async (...args) => {
			const [input, init] = args;
			const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';

			// Log GraphQL requests with role headers
			if (url.includes('/graphql') || url.includes('/api/analysis')) {
				const headers = init?.headers || {};
				const headersObj: Record<string, string> =
					headers instanceof Headers
						? Object.fromEntries(headers.entries())
						: Array.isArray(headers) &&
							  headers.every(
									(entry) =>
										Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'
							  )
							? Object.fromEntries(headers)
							: Array.isArray(headers)
								? (() => {
										console.warn(
											'[nhostClient] Headers array is not in key-value pair format:',
											headers
										);
										return {};
									})()
								: (headers as Record<string, string>);
				console.log('[Fetch Request]', {
					url,
					role: headersObj['x-hasura-role'] || headersObj['X-Hasura-Role'],
					userId: headersObj['X-Hasura-User-Id'] || headersObj['x-hasura-user-id'],
					hasAuth: !!(headersObj['Authorization'] || headersObj['authorization']),
					authHeader: headersObj['Authorization'] || headersObj['authorization']
				});
			}

			try {
				const response = await originalFetch(input as RequestInfo, init as RequestInit);

				// Log GraphQL errors
				if (url.includes('/graphql') && !response.ok) {
					const clone = response.clone();
					try {
						const json = await clone.json();
						if (json.errors) {
							console.error('[GraphQL Error]', json.errors);
						}
					} catch (e) {
						// Ignore JSON parse errors
					}
				}

				if (url.includes(TOKEN_ENDPOINT_PATH) && !response.ok) {
					console.warn(
						'[nhostClient] Clearing cached session after token endpoint failure',
						response.status
					);
					clearCachedSession();
				}
				return response;
			} catch (error) {
				if (url.includes(TOKEN_ENDPOINT_PATH)) {
					console.warn('[nhostClient] Clearing cached session after token endpoint error', error);
					clearCachedSession();
				}
				throw error;
			}
		};
	}
	try {
		sanitiseCachedSession();
	} catch (error) {
		console.warn('[nhostClient] Failed to sanitise cached session', error);
	}
	console.log('[nhostClient] FORCED subdomain config:', {
		subdomain: PUBLIC_NHOST_SUBDOMAIN,
		region: PUBLIC_NHOST_REGION,
		hostname: window.location.hostname
	});
}

export const nhost = createClient(nhostConfig);

// TypeScript declarations for v3 compatibility methods
declare module '@nhost/nhost-js' {
	interface AuthClient {
		isAuthenticatedAsync: () => Promise<boolean>;
		onAuthStateChanged: (callback: (event?: string, session?: any) => void) => () => void;
		getAccessToken: () => string | null;
		signIn: (params: any) => Promise<any>;
		signUp: (params: any) => Promise<any>;
		changePassword: (params: any) => Promise<any>;
		getUser: () => any;
	}
	interface GraphQLClient {
		getUrl: () => string;
	}
}

// v3 compatibility: Add onAuthStateChanged to auth client
// v4 uses sessionStorage.onChange, but v3 used auth.onAuthStateChanged
// @ts-ignore - Adding v3 compatibility method
nhost.auth.onAuthStateChanged = (callback: (event?: string, session?: any) => void) => {
	let previousSession = nhost.getUserSession();

	return nhost.sessionStorage.onChange((newSession) => {
		const wasSignedIn = !!previousSession;
		const isSignedIn = !!newSession;

		let event: string | undefined;
		if (!wasSignedIn && isSignedIn) {
			event = 'SIGNED_IN';
		} else if (wasSignedIn && !isSignedIn) {
			event = 'SIGNED_OUT';
		} else if (isSignedIn) {
			event = 'TOKEN_CHANGED';
		}

		if (event) {
			callback(event, newSession);
		}

		previousSession = newSession;
	});
};

// v3 compatibility: Add getAccessToken to auth client
// v4: Access token is in the session object
// @ts-ignore - Adding v3 compatibility method
nhost.auth.getAccessToken = () => {
	try {
		const session = nhost.getUserSession();
		return session?.accessToken || null;
	} catch (error) {
		// Handle errors gracefully (e.g., during SSR)
		return null;
	}
};

// v3 compatibility: Save original v4 getUser (async) and create sync version
// v4: getUser() is async and makes an API call
// v3: getUser() was sync and returned cached user
const originalGetUser = nhost.auth.getUser.bind(nhost.auth);

// Export the v4 async version for when we need fresh data from server
export const getUserFromServer = originalGetUser;

// Override with v3 sync version for backward compatibility
// @ts-ignore - Adding v3 compatibility method
nhost.auth.getUser = () => {
	try {
		const session = nhost.getUserSession();
		return session?.user || null;
	} catch (error) {
		// Handle errors gracefully (e.g., during SSR)
		return null;
	}
};

// v3 compatibility: Add isAuthenticatedAsync
// In v3, this was an async check. In v4, we check if there's a valid session
// @ts-ignore - Adding v3 compatibility method
nhost.auth.isAuthenticatedAsync = async () => {
	try {
		const session = nhost.getUserSession();
		return !!session?.user;
	} catch (error) {
		return false;
	}
};

// v3 compatibility: Add signIn to auth client
// v4: signIn() was replaced with signInEmailPassword() and other specific methods
// @ts-ignore - Adding v3 compatibility method
nhost.auth.signIn = async (params: any) => {
	try {
		// Detect sign-in type and route to appropriate v4 method
		if (params.email && params.password) {
			const result = await nhost.auth.signInEmailPassword({
				email: params.email,
				password: params.password
			});
			// Convert v4 response to v3 format
			// v4: FetchResponse<SignInEmailPasswordResponse> with body.session, body.mfa, error
			// v3: { session?, mfa?, error? }
			return {
				session: result.body?.session,
				mfa: result.body?.mfa,
				error: result.error ? { message: result.error.message } : null
			};
		}
		// Handle magic link / passwordless email sign-in
		if (params.email && !params.password && !params.provider) {
			// v4: Use signInPasswordlessEmail for magic link
			const result = await nhost.auth.signInPasswordlessEmail({
				email: params.email,
				options: params.options
			});
			// v4 returns FetchResponse<OKResponse> for passwordless (no session in response)
			return {
				session: null,
				mfa: null,
				error: result.error
					? { message: result.error.message || 'Failed to send magic link' }
					: null
			};
		}
		// Handle OAuth provider sign-in
		if (params.provider) {
			// v4: Use signInProviderURL to get the OAuth URL and navigate to it
			// v4 API: signInProviderURL(provider: string, options?: { redirectTo?: string })
			const providerUrl = nhost.auth.signInProviderURL(params.provider, params.options);
			// Trigger the redirect
			window.location.href = providerUrl;
			// OAuth redirects immediately, no response to return
			return {
				session: null,
				mfa: null,
				error: null
			};
		}
		// Add other sign-in types as needed
		throw new Error('Unsupported signIn parameters');
	} catch (error: any) {
		// v4 throws FetchError, convert to v3 error format
		return {
			session: null,
			mfa: null,
			error: { message: error.message || 'Sign in failed' }
		};
	}
};

// v3 compatibility: Add signUp to auth client
// v4: signUp() was replaced with signUpEmailPassword()
// @ts-ignore - Adding v3 compatibility method
nhost.auth.signUp = async (params: any) => {
	try {
		if (params.email && params.password) {
			const result = await nhost.auth.signUpEmailPassword({
				email: params.email,
				password: params.password,
				options: params.options
			});
			// Convert v4 response to v3 format
			return {
				session: result.body?.session,
				error: null
			};
		}
		throw new Error('Unsupported signUp parameters');
	} catch (error: any) {
		return {
			session: null,
			error: { message: error.message || 'Sign up failed' }
		};
	}
};

// v3 compatibility: Add signOut to auth client
// v4: signOut() requires refreshToken parameter, v3: signOut() had no parameters
// @ts-ignore - Adding v3 compatibility method
const originalSignOut = nhost.auth.signOut.bind(nhost.auth);
nhost.auth.signOut = async (params?: any) => {
	try {
		// Get current refresh token from session
		const session = nhost.getUserSession();
		const refreshToken = session?.refreshToken || localStorage.getItem('nhostRefreshToken');

		if (refreshToken) {
			// v4: Call with refreshToken
			return await originalSignOut({ refreshToken });
		} else {
			// No refresh token available - just clear local storage
			localStorage.removeItem('nhostRefreshToken');
			localStorage.removeItem('nhostRefreshTokenId');
			localStorage.removeItem('nhostRefreshTokenExpiresAt');
			// Return success-like response
			return { body: 'OK' as const };
		}
	} catch (error: any) {
		// If signOut fails, still clear local storage
		localStorage.removeItem('nhostRefreshToken');
		localStorage.removeItem('nhostRefreshTokenId');
		localStorage.removeItem('nhostRefreshTokenExpiresAt');
		throw error;
	}
};

// v3 compatibility: Add changePassword to auth client
// v4: changeUserPassword() is the method name, v3: changePassword()
// @ts-expect-error: Adding v3 compatibility method to nhost.auth; changePassword does not exist in type definition but is required for legacy support.
nhost.auth.changePassword = async (params: any) => {
	try {
		// v4 API: changeUserPassword({ newPassword, ticket? })
		const result = await nhost.auth.changeUserPassword({
			newPassword: params.newPassword || params.password,
			ticket: params.ticket
		});

		// Convert v4 response to v3 format
		return {
			error:
				result.status >= 400
					? {
							message:
								result.error?.message ||
								result.message ||
								`Failed to change password (status ${result.status})`
						}
					: null
		};
	} catch (error: any) {
		return {
			error: { message: error.message || 'Failed to change password' }
		};
	}
};

// Note: In v4, OAuth token exchange is handled automatically by the SDK
// The SDK processes OAuth callbacks and manages session storage internally

// v3 compatibility: Add getUrl to graphql client
// v4: GraphQL URL is constructed from subdomain and region
// @ts-ignore - Adding v3 compatibility method
nhost.graphql.getUrl = () => {
	return `https://${PUBLIC_NHOST_SUBDOMAIN}.graphql.${PUBLIC_NHOST_REGION}.nhost.run/v1`;
};

// Monkey-patch graphql.request to automatically inject Hasura role headers
// This maintains v3 API compatibility while adding v4 header injection
const originalGraphqlRequest = nhost.graphql.request.bind(nhost.graphql);
// @ts-ignore - Monkey-patch for v3 API compatibility
nhost.graphql.request = async function <TData = any, TVariables = any>(
	...args: any[]
): Promise<any> {
	// v4 API: request({ query, variables }, options)
	// v3 API: request(query, variables)

	let result;
	// Detect which API is being used
	// v3 API: request(query, variables) where query is string or DocumentNode
	// v4 API: request({ query, variables }, options) where first arg is an object with 'query' property
	const isV3Api = typeof args[0] === 'string' || (args[0] && !('query' in args[0]));

	if (isV3Api) {
		// v3 API: convert to v4 format
		let query = args[0];
		const variables = args[1];

		// If query is a DocumentNode (from gql``), extract the string query
		// v4 SDK requires a plain string, not a DocumentNode
		if (query && typeof query === 'object' && 'loc' in query && query.loc?.source?.body) {
			query = query.loc.source.body;
		}

		// Clean variables - remove any headers key that shouldn't be there
		const cleanVariables = variables ? { ...variables } : undefined;
		if (cleanVariables && 'headers' in cleanVariables) {
			delete cleanVariables.headers;
		}

		// Debug log for delete mutations
		if (query.includes('delete_contributor')) {
			console.log('[GraphQL Request Debug]', {
				queryPreview: query.substring(0, 200),
				variables: cleanVariables,
				headers: currentGraphqlHeaders
			});
		}

		result = await originalGraphqlRequest(
			{ query, variables: cleanVariables },
			{ headers: currentGraphqlHeaders }
		);

		// Debug log for delete mutation results
		if (query.includes('delete_contributor')) {
			console.log('[GraphQL Response Debug]', {
				status: result.status,
				data: result.body?.data,
				errors: result.body?.errors
			});
		}
	} else {
		// v4 API: merge headers
		const request = args[0];
		const options = args[1] || {};

		// Clean request variables - remove any headers key
		const cleanRequest = { ...request };
		if (
			cleanRequest.variables &&
			typeof cleanRequest.variables === 'object' &&
			'headers' in cleanRequest.variables
		) {
			cleanRequest.variables = { ...cleanRequest.variables };
			delete cleanRequest.variables.headers;
		}

		const mergedOptions = {
			...options,
			headers: {
				...currentGraphqlHeaders,
				...(options.headers || {})
			}
		};

		// Debug log for delete mutations
		if (cleanRequest.query && cleanRequest.query.includes('delete_contributor')) {
			console.log('[GraphQL Request Debug]', {
				queryPreview: cleanRequest.query.substring(0, 200),
				variables: cleanRequest.variables,
				headers: mergedOptions.headers
			});
		}

		result = await originalGraphqlRequest(cleanRequest, mergedOptions);

		// Debug log for delete mutation results
		if (cleanRequest.query && cleanRequest.query.includes('delete_contributor')) {
			console.log('[GraphQL Response Debug]', {
				status: result.status,
				data: result.body?.data,
				errors: result.body?.errors
			});
		}
	}

	// Convert v4 response format to v3 format for backward compatibility
	// v4: { body: { data, errors }, status, headers }
	// v3: { data, error }
	return {
		data: result.body?.data,
		error: result.body?.errors && result.body.errors.length > 0 ? result.body.errors : undefined,
		// Keep v4 properties for new code
		body: result.body,
		status: result.status,
		headers: result.headers
	};
} as any;

// Track role upgrade completion
let roleUpgradePromise: Promise<void> | null = null;

// Store current GraphQL headers (v4 doesn't have persistent setHeaders)
let currentGraphqlHeaders: Record<string, string> = { 'x-hasura-role': 'anonymous' };

// Apply initial GraphQL role header (authenticated users start as 'me')
function applyInitialGraphqlRoleHeader() {
	const user = nhost.getUserSession()?.user;
	if (user) {
		currentGraphqlHeaders = {
			'x-hasura-role': 'me',
			'X-Hasura-User-Id': user.id
		};
		console.log('[applyInitialGraphqlRoleHeader] Set initial role to "me" for user', user.id);
	} else {
		currentGraphqlHeaders = { 'x-hasura-role': 'anonymous' };
		console.log('[applyInitialGraphqlRoleHeader] Set role to "anonymous"');
	}
}

// Upgrade role headers based on database role (call after initial auth)
async function upgradeRoleHeaders() {
	const session = nhost.getUserSession();
	if (!session?.user) {
		console.log('upgradeRoleHeaders: No user found');
		roleUpgradePromise = Promise.resolve();
		return;
	}

	const user = session.user;
	console.log('upgradeRoleHeaders: Starting role upgrade for user', user.id);

	try {
		// Wait for authentication to be ready (allows token refresh)
		await nhost.auth.isAuthenticatedAsync();

		// Get user's role from database (monkey-patched to auto-inject headers and return v3 format)
		const result = await nhost.graphql.request<
			{ contributor_by_pk: { role: string } | null },
			{ userId: string }
		>(
			`
      query GetUserRole($userId: uuid!) {
        contributor_by_pk(id: $userId) {
          role
        }
      }
    `,
			{ userId: user.id }
		);

		// Check for JWT errors
		if (result.error) {
			const errorMsg = Array.isArray(result.error)
				? result.error[0]?.message || ''
				: result.error.message || '';

			if (errorMsg.includes('JWT') || errorMsg.includes('JWTExpired')) {
				console.log('JWT expired in upgradeRoleHeaders, will retry on next auth cycle');
				return;
			}
		}

		const userRole = result.data?.contributor_by_pk?.role || 'user';

		// Map database roles to Hasura roles
		let hasuraRole;
		switch (userRole) {
			case 'admin':
				hasuraRole = 'admin'; // Full system access
				break;
			case 'slartibartfast':
				hasuraRole = 'slartibartfast'; // Site manager (featured content, disputes)
				break;
			default:
				hasuraRole = 'me'; // Regular authenticated user
		}

		// Store the actual role for frontend logic
		if (typeof window !== 'undefined') {
			window.sessionStorage.setItem('userActualRole', userRole);
		}

		// Update headers with correct role
		console.log('upgradeRoleHeaders: Setting role', {
			databaseRole: userRole,
			hasuraRole: hasuraRole,
			userId: user.id,
			beforeHeaders: { ...currentGraphqlHeaders }
		});
		currentGraphqlHeaders = {
			'x-hasura-role': hasuraRole,
			'X-Hasura-User-Id': user.id
		};
		console.log('upgradeRoleHeaders: Headers after update', { ...currentGraphqlHeaders });
	} catch (err: any) {
		// Check if it's a JWT error
		const errorMsg = err?.message || String(err);
		if (errorMsg.includes('JWT') || errorMsg.includes('JWTExpired')) {
			console.log('JWT expired in upgradeRoleHeaders catch, will retry on next auth cycle');
			return;
		}

		console.error('Failed to upgrade user role, staying as me:', err);
		console.error('Error details:', {
			message: err instanceof Error ? err.message : String(err),
			user: user.id,
			currentHeaders: currentGraphqlHeaders
		});
		// Keep existing 'me' role if upgrade fails
	}
}
applyInitialGraphqlRoleHeader();

// Function to refresh user role headers (call after role changes)
export async function refreshUserRole() {
	await upgradeRoleHeaders();
}

// Wait for role upgrade to complete before making GraphQL requests
export async function waitForRoleReady(): Promise<void> {
	if (roleUpgradePromise) {
		await roleUpgradePromise;
	}
}

// Export function to get current GraphQL headers (for use in app)
export function getGraphqlHeaders(): Record<string, string> {
	return currentGraphqlHeaders;
}

// Export function to check current role status (for debugging)
export function debugCurrentRole(): void {
	const user = nhost.getUserSession()?.user;
	const actualRole =
		typeof window !== 'undefined' ? window.sessionStorage.getItem('userActualRole') : null;
	console.log('[Role Debug]', {
		userId: user?.id,
		email: user?.email,
		currentHeaders: { ...currentGraphqlHeaders },
		sessionStorageRole: actualRole
	});
}

// Helper to make GraphQL requests with automatic header injection (v4 compatibility)
// Returns v3-style { data, error } for backward compatibility
export async function graphqlRequest<TData = any, TVariables = Record<string, any>>(
	query: string,
	variables?: TVariables
): Promise<{ data?: TData; error?: any }> {
	try {
		const result = await nhost.graphql.request(
			{
				query,
				variables
			},
			{
				headers: currentGraphqlHeaders
			}
		);

		// v4 returns { body, status, headers }
		// body contains { data, errors }
		if (result.body?.errors && result.body.errors.length > 0) {
			return { error: result.body.errors };
		}

		return { data: result.body?.data };
	} catch (error) {
		return { error };
	}
}

// Debug function for admin requests
export function debugAdminRequest(operation: string) {
	const user = nhost.getUserSession()?.user;
	const actualRole =
		typeof window !== 'undefined' ? window.sessionStorage.getItem('userActualRole') : null;
	console.log(`[Admin Debug] ${operation}:`, {
		userId: user?.id,
		email: user?.email,
		actualRole
	});
}

// Correct constraint name (user_pkey) per contributor_constraint enum
// Important: do NOT overwrite an existing display_name on conflict.
// Only update the email; keep display_name as user-configured value.
// Set analysis_limit to 10 for new users (gives them 10 monthly credits)
// Note: A database trigger should set monthly_credits_remaining based on analysis_limit
const UPSERT_CONTRIBUTOR = `
  mutation UpsertContributor($id: uuid!, $display_name: String, $email: String, $reset_date: timestamptz!) {
    insert_contributor_one(
      object: {
        id: $id,
        display_name: $display_name,
        email: $email,
        analysis_limit: 10,
        analysis_enabled: true,
        analysis_count_reset_at: $reset_date
      },
      on_conflict: { constraint: user_pkey, update_columns: [email] }
    ) { id }
  }
`;

// Send welcome email to new users (fire and forget)
async function sendWelcomeEmailIfNeeded(userId: string) {
	try {
		const response = await fetch('/api/sendWelcomeEmail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId })
		});

		if (response.ok) {
			const result = await response.json();
			if (result.sent) {
				console.log('[sendWelcomeEmail] Welcome email sent to new user');
			} else {
				console.log('[sendWelcomeEmail] Skipped:', result.reason);
			}
		} else {
			console.warn('[sendWelcomeEmail] Failed to send:', response.status);
		}
	} catch (error) {
		// Don't block sign-in flow if welcome email fails
		console.warn('[sendWelcomeEmail] Error:', error);
	}
}

export async function ensureContributor() {
	const session = nhost.getUserSession();
	if (!session?.user) {
		console.log('No session in ensureContributor, skipping');
		return;
	}

	// Wait for authentication to be ready (allows token refresh)
	try {
		await nhost.auth.isAuthenticatedAsync();
	} catch (err) {
		console.log('Auth check failed in ensureContributor, skipping:', err);
		return;
	}

	const user = session.user;
	let displayName = user.displayName || user.email?.split('@')[0] || 'Anonymous';
	if (displayName.length > 50) displayName = displayName.slice(0, 50);

	// Calculate reset date (1 month from now)
	const resetDate = new Date();
	resetDate.setMonth(resetDate.getMonth() + 1);

	console.log('[ensureContributor] Creating/updating contributor with:', {
		id: user.id,
		display_name: displayName,
		email: user.email,
		analysis_limit: 10,
		monthly_credits_remaining: 10,
		reset_date: resetDate.toISOString()
	});

	const res = await nhost.graphql.request(UPSERT_CONTRIBUTOR, {
		id: user.id,
		display_name: displayName,
		email: user.email ?? null,
		reset_date: resetDate.toISOString()
	});

	if (res.error) {
		// Check if it's a JWT error
		const errorMsg = Array.isArray(res.error)
			? res.error[0]?.message || ''
			: res.error.message || '';

		if (errorMsg.includes('JWT') || errorMsg.includes('JWTExpired')) {
			console.log('JWT expired in ensureContributor, will retry on next auth cycle');
			return;
		}

		console.error('Failed to upsert contributor:', res.error);
	}
}

// Run on initial load (if already authenticated) and on sign-in events
if (isBrowser) {
	if (nhost.getUserSession()) {
		applyInitialGraphqlRoleHeader();
		roleUpgradePromise = ensureContributor().then(() => {
			// After ensuring contributor exists, upgrade to proper role
			return upgradeRoleHeaders();
		});
	}

	// v4: Use sessionStorage.onChange instead of auth.onAuthStateChanged
	let previousSession = nhost.getUserSession();
	nhost.sessionStorage.onChange(async (newSession) => {
		const wasSignedIn = !!previousSession;
		const isSignedIn = !!newSession;

		// Sign in event
		if (!wasSignedIn && isSignedIn) {
			console.log('User signed in, applying initial role header');
			applyInitialGraphqlRoleHeader();
			console.log('Ensuring contributor exists');
			await ensureContributor();
			// After ensuring contributor exists, upgrade to proper role
			console.log('Upgrading role headers');
			roleUpgradePromise = upgradeRoleHeaders();
			await roleUpgradePromise;
			// Send welcome email to new users (fire and forget, don't await)
			if (newSession?.user?.id) {
				sendWelcomeEmailIfNeeded(newSession.user.id);
			}
		}
		// Sign out event
		else if (wasSignedIn && !isSignedIn) {
			console.log('User signed out, resetting to anonymous');
			applyInitialGraphqlRoleHeader();
		}

		previousSession = newSession;
	});
}
