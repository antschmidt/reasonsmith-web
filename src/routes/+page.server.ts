import type { PageServerLoad } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { print } from 'graphql';
import { GET_PUBLIC_SHOWCASE_PUBLISHED } from '$lib/graphql/queries';

const HASURA_GRAPHQL_ENDPOINT =
  privateEnv.HASURA_GRAPHQL_ENDPOINT || privateEnv.GRAPHQL_URL || '';
const HASURA_ADMIN_SECRET = privateEnv.HASURA_ADMIN_SECRET || '';

export const load: PageServerLoad = async ({ fetch }) => {
  let showcaseItems: any[] = [];
  let showcaseError: string | null = null;

  if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_ADMIN_SECRET) {
    showcaseError = 'Showcase temporarily unavailable.';
  } else {
    try {
      const response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
          'x-hasura-role': 'anonymous'
        },
        body: JSON.stringify({ query: print(GET_PUBLIC_SHOWCASE_PUBLISHED) })
      });
      const json = await response.json();
      console.log('GraphQL response:', json);
      if (json.errors) {
        showcaseError = json.errors[0]?.message || 'Failed to load showcase.';
      } else {
        showcaseItems = json.data?.public_showcase_item ?? [];
        console.log('Showcase items loaded:', showcaseItems.length);
      }
    } catch (error: any) {
      showcaseError = error?.message || 'Failed to load showcase.';
    }
  }

  return {
    showcaseItems,
    showcaseError
  };
};
