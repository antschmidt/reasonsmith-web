/**
 * Job Status Proxy Endpoint
 *
 * GET /api/analysis/queue/status?jobId=xxx
 *
 * Proxies job status requests to the Go jobs worker service.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';

export const GET: RequestHandler = async ({ url }) => {
	const JOBS_API_URL = env.JOBS_API_URL || 'https://jobs.reasonsmith.com';
	const JOBS_API_KEY = env.JOBS_API_KEY || '';

	if (!JOBS_API_KEY) {
		return json({ error: 'Jobs service not configured' }, { status: 503 });
	}

	const jobId = url.searchParams.get('jobId');
	if (!jobId) {
		return json({ error: 'jobId is required' }, { status: 400 });
	}

	try {
		const response = await fetch(`${JOBS_API_URL}/api/v1/jobs/${jobId}`, {
			headers: {
				'X-API-Key': JOBS_API_KEY
			}
		});

		const data = await response.json();

		if (!response.ok) {
			return json(data, { status: response.status });
		}

		return json(data);
	} catch (error) {
		logger.error('[Queue Status] Failed to get job status:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to get job status' },
			{ status: 500 }
		);
	}
};
