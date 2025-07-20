import { NhostClient } from '@nhost/nhost-js';
import { PUBLIC_NHOST_SUBDOMAIN, PUBLIC_NHOST_REGION } from '$env/static/public';

const isBrowser = typeof window !== 'undefined';

export const nhost = new NhostClient({
  subdomain: PUBLIC_NHOST_SUBDOMAIN,
  region: PUBLIC_NHOST_REGION,
  clientStorage: isBrowser ? localStorage : undefined,
  clientStorageType: 'web',
  autoLogin: true,
  authUrl: isBrowser ? 'https://auth.reasonsmith.com/v1' : undefined,
  graphqlUrl: isBrowser ? 'https://graphql.reasonsmith.com/v1/graphql' : undefined,
  storageUrl: isBrowser ? 'https://storage.reasonsmith.com/v1' : undefined
});