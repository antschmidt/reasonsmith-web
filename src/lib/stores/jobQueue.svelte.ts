/**
 * Job Queue Store
 *
 * Manages state for long-running analysis jobs submitted to the external jobs worker.
 * Provides polling, status updates, and persistence across page reloads.
 */

import type { GoodFaithResult } from '$lib/goodFaith';

// ============================================================================
// Types
// ============================================================================

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface JobProgress {
	currentPass: number;
	claimsTotal: number;
	claimsCompleted: number;
	claimsFailed: number;
	currentBatch?: number;
	totalBatches?: number;
}

export interface JobResult {
	result: GoodFaithResult;
	strategy: string;
	claimsTotal: number;
	claimsAnalyzed: number;
	claimsFailed: number;
	claimAnalyses?: Array<{
		claimIndex: number;
		claim: {
			text: string;
			type: string;
			complexity: string;
		};
		status: string;
		validityScore?: number;
		evidenceScore?: number;
		fallacies?: string[];
	}>;
}

export interface Job {
	jobId: string;
	postId?: string;
	status: JobStatus;
	progress?: JobProgress;
	result?: JobResult;
	error?: string;
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
	estimatedClaims?: number;
	estimatedTimeMs?: number;
}

export interface JobQueueState {
	jobs: Map<string, Job>;
	activePolling: Set<string>;
}

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEY = 'reasonsmith_job_queue';

// ============================================================================
// Polling Configuration
// ============================================================================

const POLL_CONFIG = {
	initialIntervalMs: 1000,
	maxIntervalMs: 10000,
	backoffMultiplier: 1.5,
	maxPolls: 180 // 30 minutes at max interval
};

// ============================================================================
// Job Queue Store
// ============================================================================

class JobQueueStore {
	// Reactive state using Svelte 5 runes
	private _jobs = $state<Map<string, Job>>(new Map());
	private _activePolling = $state<Set<string>>(new Set());
	private pollingIntervals: Map<string, number> = new Map();
	private pollCounts: Map<string, number> = new Map();
	private abortControllers: Map<string, AbortController> = new Map();

	constructor() {
		// Load persisted jobs on initialization (client-side only)
		if (typeof window !== 'undefined') {
			this.loadFromStorage();
		}
	}

	// ========================================
	// Getters
	// ========================================

	get jobs(): Map<string, Job> {
		return this._jobs;
	}

	get activePolling(): Set<string> {
		return this._activePolling;
	}

	getJob(jobId: string): Job | undefined {
		return this._jobs.get(jobId);
	}

	getJobByPostId(postId: string): Job | undefined {
		for (const job of this._jobs.values()) {
			if (job.postId === postId && (job.status === 'queued' || job.status === 'processing')) {
				return job;
			}
		}
		return undefined;
	}

	hasActiveJob(postId: string): boolean {
		return this.getJobByPostId(postId) !== undefined;
	}

	// ========================================
	// Job Management
	// ========================================

	/**
	 * Add a new job to the queue and start polling
	 */
	addJob(job: Omit<Job, 'createdAt'>): void {
		const fullJob: Job = {
			...job,
			createdAt: new Date().toISOString()
		};

		this._jobs.set(job.jobId, fullJob);
		this.saveToStorage();

		// Start polling for this job
		this.startPolling(job.jobId);
	}

	/**
	 * Update an existing job
	 */
	updateJob(jobId: string, updates: Partial<Job>): void {
		const existing = this._jobs.get(jobId);
		if (existing) {
			this._jobs.set(jobId, { ...existing, ...updates });
			this.saveToStorage();
		}
	}

	/**
	 * Remove a job from the queue
	 */
	removeJob(jobId: string): void {
		this.stopPolling(jobId);
		this._jobs.delete(jobId);
		this.saveToStorage();
	}

	/**
	 * Clear all completed/failed jobs
	 */
	clearCompletedJobs(): void {
		for (const [jobId, job] of this._jobs) {
			if (job.status === 'completed' || job.status === 'failed') {
				this._jobs.delete(jobId);
			}
		}
		this.saveToStorage();
	}

	// ========================================
	// Polling
	// ========================================

	/**
	 * Start polling for job status updates
	 */
	startPolling(jobId: string): void {
		if (this._activePolling.has(jobId)) {
			return; // Already polling
		}

		this._activePolling.add(jobId);
		this.pollingIntervals.set(jobId, POLL_CONFIG.initialIntervalMs);
		this.pollCounts.set(jobId, 0);
		this.abortControllers.set(jobId, new AbortController());

		this.poll(jobId);
	}

	/**
	 * Stop polling for a specific job
	 */
	stopPolling(jobId: string): void {
		this._activePolling.delete(jobId);
		this.pollingIntervals.delete(jobId);
		this.pollCounts.delete(jobId);

		const controller = this.abortControllers.get(jobId);
		if (controller) {
			controller.abort();
			this.abortControllers.delete(jobId);
		}
	}

	/**
	 * Perform a single poll for job status
	 */
	private async poll(jobId: string): Promise<void> {
		if (!this._activePolling.has(jobId)) {
			return;
		}

		const pollCount = (this.pollCounts.get(jobId) || 0) + 1;
		this.pollCounts.set(jobId, pollCount);

		if (pollCount > POLL_CONFIG.maxPolls) {
			this.updateJob(jobId, {
				status: 'failed',
				error: 'Polling timeout - job may still be running'
			});
			this.stopPolling(jobId);
			return;
		}

		try {
			const controller = this.abortControllers.get(jobId);
			const response = await fetch(`/api/analysis/queue/status?jobId=${jobId}`, {
				signal: controller?.signal
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json();

			// Update job with latest status
			this.updateJob(jobId, {
				status: data.status,
				progress: data.progress,
				result: data.result,
				error: data.error,
				startedAt: data.startedAt,
				completedAt: data.completedAt
			});

			// Stop polling if job is complete
			if (data.status === 'completed' || data.status === 'failed') {
				this.stopPolling(jobId);
				return;
			}

			// Schedule next poll with backoff
			const currentInterval = this.pollingIntervals.get(jobId) || POLL_CONFIG.initialIntervalMs;
			const nextInterval = Math.min(
				currentInterval * POLL_CONFIG.backoffMultiplier,
				POLL_CONFIG.maxIntervalMs
			);
			this.pollingIntervals.set(jobId, nextInterval);

			setTimeout(() => this.poll(jobId), nextInterval);
		} catch (error) {
			if ((error as Error).name === 'AbortError') {
				return; // Polling was cancelled
			}

			console.error(`[JobQueue] Poll error for ${jobId}:`, error);

			// Retry on error with backoff
			const currentInterval = this.pollingIntervals.get(jobId) || POLL_CONFIG.initialIntervalMs;
			const nextInterval = Math.min(currentInterval * 2, POLL_CONFIG.maxIntervalMs);
			this.pollingIntervals.set(jobId, nextInterval);

			setTimeout(() => this.poll(jobId), nextInterval);
		}
	}

	// ========================================
	// Persistence
	// ========================================

	private saveToStorage(): void {
		if (typeof window === 'undefined') return;

		try {
			const data = Array.from(this._jobs.entries());
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch (e) {
			console.error('[JobQueue] Failed to save to storage:', e);
		}
	}

	private loadFromStorage(): void {
		if (typeof window === 'undefined') return;

		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) {
				const data: [string, Job][] = JSON.parse(stored);
				this._jobs = new Map(data);

				// Resume polling for active jobs
				for (const [jobId, job] of this._jobs) {
					if (job.status === 'queued' || job.status === 'processing') {
						this.startPolling(jobId);
					}
				}
			}
		} catch (e) {
			console.error('[JobQueue] Failed to load from storage:', e);
		}
	}
}

// ============================================================================
// Singleton Export
// ============================================================================

export const jobQueue = new JobQueueStore();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Submit a job and track it in the queue
 */
export async function submitJob(params: {
	content: string;
	postId?: string;
	writingStyle?: string;
	discussionContext?: unknown;
	showcaseContext?: unknown;
}): Promise<{ success: boolean; jobId?: string; error?: string }> {
	try {
		const response = await fetch('/api/goodFaithClaude', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(params)
		});

		const data = await response.json();

		// Check if it was queued (202 response with jobId)
		if (data.queued && data.jobId) {
			jobQueue.addJob({
				jobId: data.jobId,
				postId: params.postId,
				status: 'queued',
				estimatedClaims: data.estimatedClaims,
				estimatedTimeMs: data.estimatedTimeMs
			});

			return { success: true, jobId: data.jobId };
		}

		// If not queued, it was processed inline - no job tracking needed
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to submit job'
		};
	}
}

/**
 * Get formatted time remaining for a job
 */
export function getTimeRemaining(job: Job): string | null {
	if (!job.estimatedTimeMs || !job.startedAt) return null;

	const elapsed = Date.now() - new Date(job.startedAt).getTime();
	const remaining = Math.max(0, job.estimatedTimeMs - elapsed);

	if (remaining < 1000) return 'Almost done...';

	const seconds = Math.floor(remaining / 1000);
	const minutes = Math.floor(seconds / 60);

	if (minutes > 0) {
		return `~${minutes}m ${seconds % 60}s remaining`;
	}
	return `~${seconds}s remaining`;
}

/**
 * Get progress percentage for a job
 */
export function getProgressPercent(job: Job): number {
	if (job.status === 'completed') return 100;
	if (job.status === 'failed') return 0;
	if (!job.progress) return 5;

	const { currentPass, claimsTotal, claimsCompleted } = job.progress;

	// Pass 1 is 10%, Pass 2 is 10-90%, Pass 3 is 90-100%
	if (currentPass === 1) return 10;
	if (currentPass === 3) return 95;

	if (currentPass === 2 && claimsTotal > 0) {
		const pass2Progress = claimsCompleted / claimsTotal;
		return 10 + pass2Progress * 80;
	}

	return 5;
}
