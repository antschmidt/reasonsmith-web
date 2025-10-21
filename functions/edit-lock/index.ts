import { Request, Response } from '@nhost/nhost-js';

interface EditLockArgs {
  input: {
    post_id: string;
    user_id: string;
    enabled?: boolean;
  };
}

interface EditLockResponse {
  success: boolean;
  message?: string;
  error?: string;
  current_editor_id?: string;
  collaboration_enabled?: boolean;
}

export default async (req: Request, res: Response) => {
  // Get Hasura admin secret from environment
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  const subdomain = process.env.NHOST_SUBDOMAIN;
  const region = process.env.NHOST_REGION;

  if (!adminSecret || !subdomain || !region) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Parse request body
  const body = req.body as EditLockArgs;
  const { post_id, user_id, enabled } = body.input;

  // Get action name from headers (Hasura sends this)
  const actionName = req.headers['x-hasura-action-name'] as string;

  if (!actionName) {
    return res.status(400).json({ error: 'Missing action name' });
  }

  // Determine which function to call
  let functionName: string;
  let args: any;

  switch (actionName) {
    case 'acquireEditLock':
      functionName = 'acquire_edit_lock';
      args = { p_post_id: post_id, p_user_id: user_id };
      break;
    case 'releaseEditLock':
      functionName = 'release_edit_lock';
      args = { p_post_id: post_id, p_user_id: user_id };
      break;
    case 'toggleCollaboration':
      functionName = 'toggle_collaboration';
      args = { p_post_id: post_id, p_user_id: user_id, p_enabled: enabled };
      break;
    default:
      return res.status(400).json({ error: 'Unknown action' });
  }

  try {
    // Call PostgreSQL function via Hasura GraphQL
    const graphqlUrl = `https://${subdomain}.graphql.${region}.nhost.run/v1/graphql`;

    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': adminSecret,
      },
      body: JSON.stringify({
        query: `
          query CallFunction($args: jsonb!) {
            ${functionName}(args: $args)
          }
        `,
        variables: { args },
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      return res.status(500).json({ error: result.errors[0]?.message || 'Function call failed' });
    }

    const functionResult = result.data?.[functionName]?.[0];

    if (!functionResult) {
      return res.status(500).json({ error: 'No result from function' });
    }

    // Return the response
    return res.status(200).json(functionResult as EditLockResponse);
  } catch (error) {
    console.error('Error calling edit lock function:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
