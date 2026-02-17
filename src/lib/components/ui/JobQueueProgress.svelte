<svelte:options runes={true} />

<script lang="ts">
	import {
		jobQueue,
		getTimeRemaining,
		getProgressPercent,
		type Job
	} from '$lib/stores/jobQueue.svelte';
	import AnimatedLogo from './AnimatedLogo.svelte';

	type Props = {
		/** The job ID to track */
		jobId: string;
		/** Callback when job completes successfully */
		onComplete?: (result: Job['result']) => void;
		/** Callback when job fails */
		onError?: (error: string) => void;
		/** Callback to cancel/abandon tracking (job continues on server) */
		onCancel?: () => void;
	};

	let { jobId, onComplete, onError, onCancel }: Props = $props();

	// Get job from store - access .jobs directly so Svelte 5 tracks the Map reactively
	let job = $derived(jobQueue.jobs.get(jobId));

	// Track previous status to detect completion
	let previousStatus = $state<string | null>(null);

	$effect(() => {
		if (!job) return;

		// Detect status changes
		if (previousStatus !== job.status) {
			console.log(`[JobQueueProgress] status change: ${previousStatus} -> ${job.status}`, {
				hasResult: !!job.result,
				hasError: !!job.error
			});
			if (job.status === 'completed' && job.result) {
				console.log('[JobQueueProgress] calling onComplete');
				onComplete?.(job.result);
			} else if (job.status === 'failed' && job.error) {
				console.log('[JobQueueProgress] calling onError');
				onError?.(job.error);
			}
			previousStatus = job.status;
		}
	});

	// Derived values
	let phase = $derived.by(() => {
		if (!job) return 'unknown';
		if (job.status === 'queued') return 'queued';
		if (job.status === 'completed') return 'complete';
		if (job.status === 'failed') return 'error';
		if (!job.progress) return 'starting';

		switch (job.progress.currentPass) {
			case 1:
				return 'extraction';
			case 2:
				return 'analysis';
			case 3:
				return 'synthesis';
			default:
				return 'processing';
		}
	});

	let progressPercent = $derived(job ? getProgressPercent(job) : 0);
	let timeRemaining = $derived(job ? getTimeRemaining(job) : null);

	let statusMessage = $derived.by(() => {
		if (!job) return 'Loading job status...';

		switch (phase) {
			case 'queued':
				return 'Job queued, waiting to start...';
			case 'starting':
				return 'Analysis starting...';
			case 'extraction':
				return 'Extracting claims from content...';
			case 'analysis': {
				const p = job.progress;
				if (p && p.claimsTotal > 0) {
					return `Analyzing claims: ${p.claimsCompleted}/${p.claimsTotal}`;
				}
				return 'Analyzing claims...';
			}
			case 'synthesis':
				return 'Synthesizing final analysis...';
			case 'complete':
				return 'Analysis complete!';
			case 'error':
				return 'Analysis failed';
			default:
				return 'Processing...';
		}
	});

	function handleCancel() {
		if (jobId) {
			jobQueue.stopPolling(jobId);
		}
		onCancel?.();
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		if (minutes > 0) {
			const remainingSeconds = seconds % 60;
			return `${minutes}m ${remainingSeconds}s`;
		}
		return `${seconds}s`;
	}

	// Calculate elapsed time
	let elapsedMs = $derived.by(() => {
		if (!job?.startedAt) return 0;
		return Date.now() - new Date(job.startedAt).getTime();
	});
</script>

{#if job}
	<div
		class="progress-container"
		class:error={phase === 'error'}
		class:complete={phase === 'complete'}
	>
		<div class="progress-header">
			<div class="progress-title">
				{#if phase !== 'complete' && phase !== 'error'}
					<AnimatedLogo size="20px" isAnimating={true} />
				{:else if phase === 'complete'}
					<svg
						class="icon success"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				{:else if phase === 'error'}
					<svg
						class="icon error"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				{/if}
				<span>Background Analysis</span>
				<span class="job-badge">Job</span>
			</div>
			{#if phase !== 'complete' && phase !== 'error' && onCancel}
				<button type="button" class="cancel-btn" onclick={handleCancel}> Stop Tracking </button>
			{/if}
		</div>

		<div class="progress-bar-container">
			<div
				class="progress-bar"
				class:indeterminate={phase === 'queued' || phase === 'starting'}
				style="width: {progressPercent}%"
			></div>
		</div>

		<div class="progress-status">
			<span class="status-message">{statusMessage}</span>
			{#if elapsedMs > 0 && phase !== 'complete' && phase !== 'error'}
				<span class="elapsed-time">{formatDuration(elapsedMs)}</span>
			{/if}
		</div>

		{#if job.error}
			<div class="error-message">
				<strong>Error:</strong>
				{job.error}
			</div>
		{/if}

		{#if timeRemaining && phase !== 'complete' && phase !== 'error'}
			<div class="time-estimate">
				<span class="label">Estimated:</span>
				<span class="value">{timeRemaining}</span>
			</div>
		{/if}

		{#if job.progress && (phase === 'analysis' || phase === 'synthesis' || phase === 'complete')}
			<div class="stats-grid">
				<div class="stat">
					<span class="stat-value">{job.progress.claimsTotal || job.estimatedClaims || '?'}</span>
					<span class="stat-label">Claims Found</span>
				</div>
				<div class="stat">
					<span class="stat-value">{job.progress.claimsCompleted}</span>
					<span class="stat-label">Analyzed</span>
				</div>
				{#if job.progress.claimsFailed > 0}
					<div class="stat failed">
						<span class="stat-value">{job.progress.claimsFailed}</span>
						<span class="stat-label">Failed</span>
					</div>
				{/if}
				{#if job.progress.totalBatches}
					<div class="stat">
						<span class="stat-value"
							>{job.progress.currentBatch || 0}/{job.progress.totalBatches}</span
						>
						<span class="stat-label">Batches</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if phase === 'analysis' || phase === 'synthesis'}
			<div class="phase-indicator">
				<div class="phase completed">
					<span class="phase-dot"></span>
					<span class="phase-name">Extract</span>
				</div>
				<div
					class="phase-line"
					class:completed={phase === 'analysis' || phase === 'synthesis'}
				></div>
				<div
					class="phase"
					class:active={phase === 'analysis'}
					class:completed={phase === 'synthesis'}
				>
					<span class="phase-dot"></span>
					<span class="phase-name">Analyze</span>
				</div>
				<div class="phase-line" class:completed={phase === 'synthesis'}></div>
				<div class="phase" class:active={phase === 'synthesis'}>
					<span class="phase-dot"></span>
					<span class="phase-name">Synthesize</span>
				</div>
			</div>
		{/if}

		<div class="job-info">
			<span class="job-id">Job ID: {job.jobId.slice(0, 8)}...</span>
			{#if phase !== 'complete' && phase !== 'error'}
				<span class="job-note">Analysis continues even if you leave this page</span>
			{/if}
		</div>
	</div>
{:else}
	<div class="progress-container loading">
		<div class="progress-title">
			<AnimatedLogo size="20px" isAnimating={true} />
			<span>Loading job status...</span>
		</div>
	</div>
{/if}

<style>
	.progress-container {
		border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 1.25rem;
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
		margin: 1rem 0;
	}

	.progress-container.error {
		border-color: color-mix(in srgb, #ef4444 40%, transparent);
		background: color-mix(in srgb, #ef4444 5%, var(--color-surface));
	}

	.progress-container.complete {
		border-color: color-mix(in srgb, #22c55e 40%, transparent);
		background: color-mix(in srgb, #22c55e 5%, var(--color-surface));
	}

	.progress-container.loading {
		opacity: 0.7;
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.progress-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.job-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.15rem 0.4rem;
		background: color-mix(in srgb, var(--color-accent) 20%, transparent);
		color: var(--color-accent);
		border-radius: var(--border-radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.icon {
		width: 20px;
		height: 20px;
	}

	.icon.success {
		color: #22c55e;
	}

	.icon.error {
		color: #ef4444;
	}

	.cancel-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.85rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.cancel-btn:hover {
		background: color-mix(in srgb, var(--color-text-secondary) 10%, transparent);
		color: var(--color-text-primary);
	}

	.progress-bar-container {
		height: 8px;
		background: color-mix(in srgb, var(--color-border) 50%, transparent);
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.75rem;
	}

	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.progress-bar.indeterminate {
		width: 30% !important;
		animation: indeterminate 1.5s infinite ease-in-out;
	}

	@keyframes indeterminate {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}

	.progress-status {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
	}

	.status-message {
		font-weight: 500;
	}

	.elapsed-time {
		font-family: monospace;
		font-size: 0.85rem;
		color: var(--color-text-tertiary);
	}

	.error-message {
		padding: 0.75rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border-radius: var(--border-radius-sm);
		color: #ef4444;
		font-size: 0.9rem;
		margin-top: 0.75rem;
	}

	.time-estimate {
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		margin-top: 0.5rem;
	}

	.time-estimate .label {
		opacity: 0.8;
	}

	.time-estimate .value {
		font-family: monospace;
		font-weight: 500;
	}

	.stats-grid {
		display: flex;
		gap: 1.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.stat {
		text-align: center;
	}

	.stat-value {
		display: block;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: monospace;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.stat.failed .stat-value {
		color: #ef4444;
	}

	.phase-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.phase {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.phase-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-border);
		transition: all 0.3s ease;
	}

	.phase.completed .phase-dot {
		background: #22c55e;
	}

	.phase.active .phase-dot {
		background: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 30%, transparent);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 30%, transparent);
		}
		50% {
			box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-primary) 10%, transparent);
		}
	}

	.phase-name {
		font-size: 0.7rem;
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.phase.completed .phase-name,
	.phase.active .phase-name {
		color: var(--color-text-secondary);
	}

	.phase-line {
		width: 40px;
		height: 2px;
		background: var(--color-border);
		margin-bottom: 1rem;
	}

	.phase-line.completed {
		background: #22c55e;
	}

	.job-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
	}

	.job-id {
		font-family: monospace;
	}

	.job-note {
		font-style: italic;
	}
</style>
