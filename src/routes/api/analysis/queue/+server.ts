/**
 * Queue Proxy Endpoint
 * 
 * Forwards analysis requests to the Go jobs worker service.
 * This allows the frontend to queue long-running jobs without hitting Vercel's timeout.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';

const JOBS_API_URL = env.JOBS_API_URL || 'https://jobs.reasonsmith.com';
const JOBS_API_KEY = env.JOBS_API_KEY || '';

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!JOBS_API_KEY) {
		logger.error('[Queue] JOBS_API_KEY not configured');
		return json({ error: 'Jobs service not configured' }, { status: 503 });
	}

	try {
		const body = await request.json();

		logger.info(`[Queue] Forwarding analysis request to jobs service`);

		const response = await fetch(`${JOBS_API_URL}/api/v1/analyze`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-API-Key': JOBS_API_KEY
			},
			body: JSON.stringify(body)
		});

		const data = await response.json();

		if (!response.ok) {
			logger.error(`[Queue] Jobs service error: ${response.status}`, data);
			return json(data, { status: response.status });
		}

		logger.info(`[Queue] Job queued: ${data.jobId}`);
		return json(data, { status: 202 });
	} catch (error) {
		logger.error('[Queue] Failed to queue job:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to queue job' },
			{ status: 500 }
		);
	}
};
