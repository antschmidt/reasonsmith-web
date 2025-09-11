import { NhostClient } from '@nhost/nhost-js';
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';

const isBrowser = typeof window !== 'undefined';

const PUBLIC_NHOST_SUBDOMAIN = env.PUBLIC_NHOST_SUBDOMAIN;
const PUBLIC_NHOST_REGION = env.PUBLIC_NHOST_REGION;

if (!PUBLIC_NHOST_SUBDOMAIN || !PUBLIC_NHOST_REGION) {
  console.warn('[nhostClient] Missing PUBLIC_NHOST_SUBDOMAIN or PUBLIC_NHOST_REGION; configure in Vercel project settings.');
}

// Create configuration based on environment
// FORCE subdomain usage to avoid CORS issues with custom domains
const nhostConfig = {
  subdomain: PUBLIC_NHOST_SUBDOMAIN,
  region: PUBLIC_NHOST_REGION,
  clientStorage: isBrowser ? localStorage : undefined,
  clientStorageType: isBrowser ? 'web' as const : undefined,
  autoLogin: true
};

// Add debugging to confirm configuration
if (isBrowser) {
  console.log('[nhostClient] FORCED subdomain config:', {
    subdomain: PUBLIC_NHOST_SUBDOMAIN,
    region: PUBLIC_NHOST_REGION,
    hostname: window.location.hostname
  });
}

export const nhost = new NhostClient(nhostConfig);

// Apply GraphQL role header dynamically (anonymous before auth; me after sign-in)
function applyGraphqlRoleHeader() {
  const user = nhost.auth.getUser();
  if (user) nhost.graphql.setHeaders({ 'x-hasura-role': 'me' });
  else nhost.graphql.setHeaders({}); // let Hasura use its unauthorized role
}
applyGraphqlRoleHeader();

// Correct constraint name (user_pkey) per contributor_constraint enum
const UPSERT_CONTRIBUTOR = `
  mutation UpsertContributor($id: uuid!, $display_name: String, $email: String) {
    insert_contributor_one(
      object: { id: $id, display_name: $display_name, email: $email },
      on_conflict: { constraint: user_pkey, update_columns: [display_name, email] }
    ) { id }
  }
`;

export async function ensureContributor() {
  const user = nhost.auth.getUser();
  if (!user) return;

  const displayName = user.displayName || user.email?.split('@')[0] || 'Anonymous';
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
    applyGraphqlRoleHeader();
    ensureContributor();
  }
  nhost.auth.onAuthStateChanged((event) => {
    if (event === 'SIGNED_IN') {
      applyGraphqlRoleHeader();
      ensureContributor();
    }
    if (event === 'SIGNED_OUT') {
      applyGraphqlRoleHeader();
    }
  });
}