import { NhostClient } from '@nhost/nhost-js';
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

			// Wait for role upgrade before GraphQL requests
			if (url.includes('/graphql') && roleUpgradePromise) {
				await roleUpgradePromise;
			}

			// Log GraphQL requests with role headers
			if (url.includes('/graphql')) {
				const headers = init?.headers || {};
				const headersObj = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
				console.log('[GraphQL Request]', {
					url,
					role: headersObj['x-hasura-role'] || headersObj['X-Hasura-Role'],
					userId: headersObj['X-Hasura-User-Id'] || headersObj['x-hasura-user-id'],
					hasAuth: !!(headersObj['Authorization'] || headersObj['authorization'])
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

export const nhost = new NhostClient(nhostConfig);

// Track role upgrade completion
let roleUpgradePromise: Promise<void> | null = null;

// Apply initial GraphQL role header (authenticated users start as 'me')
function applyInitialGraphqlRoleHeader() {
	const user = nhost.auth.getUser();
	if (user) {
		nhost.graphql.setHeaders({
			'x-hasura-role': 'me',
			'X-Hasura-User-Id': user.id
		});
	} else {
		nhost.graphql.setHeaders({ 'x-hasura-role': 'anonymous' });
	}
}

// Upgrade role headers based on database role (call after initial auth)
async function upgradeRoleHeaders() {
	const user = nhost.auth.getUser();
	if (!user) {
		console.log('upgradeRoleHeaders: No user found');
		roleUpgradePromise = Promise.resolve();
		return;
	}

	console.log('upgradeRoleHeaders: Starting role upgrade for user', user.id);

	try {
		// Get user's role from database (using 'me' role initially)
		const result = await nhost.graphql.request(
			`
      query GetUserRole($userId: uuid!) {
        contributor_by_pk(id: $userId) {
          role
        }
      }
    `,
			{ userId: user.id }
		);

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
			userId: user.id
		});
		nhost.graphql.setHeaders({
			'x-hasura-role': hasuraRole,
			'X-Hasura-User-Id': user.id
		});
	} catch (err) {
		console.error('Failed to upgrade user role, staying as me:', err);
		console.error('Error details:', {
			message: err instanceof Error ? err.message : String(err),
			user: user.id,
			currentHeaders: nhost.graphql.getHeaders()
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

// Debug function for admin requests
export function debugAdminRequest(operation: string) {
	const user = nhost.auth.getUser();
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
// Set analysis_limit to 10 for new users (database trigger handles signup bonus)
const UPSERT_CONTRIBUTOR = `
  mutation UpsertContributor($id: uuid!, $display_name: String, $email: String) {
    insert_contributor_one(
      object: {
        id: $id,
        display_name: $display_name,
        email: $email,
        analysis_limit: 10,
        analysis_enabled: true
      },
      on_conflict: { constraint: user_pkey, update_columns: [email] }
    ) { id }
  }
`;

export async function ensureContributor() {
	const user = nhost.auth.getUser();
	if (!user) return;

	let displayName = user.displayName || user.email?.split('@')[0] || 'Anonymous';
	if (displayName.length > 50) displayName = displayName.slice(0, 50);
	const res = await nhost.graphql.request(UPSERT_CONTRIBUTOR, {
		id: user.id,
		display_name: displayName,
		email: user.email ?? null
	});
	if (res.error) {
		console.error('Failed to upsert contributor:', res.error);
	}
}

// Run on initial load (if already authenticated) and on sign-in events
if (isBrowser) {
	if (nhost.auth.getUser()) {
		applyInitialGraphqlRoleHeader();
		roleUpgradePromise = ensureContributor().then(() => {
			// After ensuring contributor exists, upgrade to proper role
			return upgradeRoleHeaders();
		});
	}
	nhost.auth.onAuthStateChanged(async (event) => {
		console.log('Auth state changed:', event);
		if (event === 'SIGNED_IN') {
			console.log('User signed in, applying initial role header');
			applyInitialGraphqlRoleHeader();
			console.log('Ensuring contributor exists');
			await ensureContributor();
			// After ensuring contributor exists, upgrade to proper role
			console.log('Upgrading role headers');
			roleUpgradePromise = upgradeRoleHeaders();
			await roleUpgradePromise;
		}
		if (event === 'SIGNED_OUT') {
			console.log('User signed out, resetting to anonymous');
			applyInitialGraphqlRoleHeader();
		}
	});
}
