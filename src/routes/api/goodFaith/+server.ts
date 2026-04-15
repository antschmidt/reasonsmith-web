import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * DEPRECATED: OpenAI good-faith analysis endpoint.
 *
 * OpenAI has been removed from ReasonSmith (2026-04-15). All good-faith
 * analysis now flows through /api/goodFaithClaude. This endpoint returns
 * 410 Gone so any stragglers (cached clients, bookmarks, integrations)
 * get a clear signal rather than a silent failure.
 */
export const POST: RequestHandler = async () => {
	return json(
		{
			error:
				'This endpoint has been removed. Use /api/goodFaithClaude for good-faith analysis.',
			code: 'endpoint_removed'
		},
		{ status: 410 }
	);
};
