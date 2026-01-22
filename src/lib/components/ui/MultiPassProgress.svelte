<svelte:options runes={true} />

<script lang="ts">
	import type {
		ProgressEvent,
		Pass1CompleteEvent,
		Pass2StartedEvent,
		Pass2BatchCompleteEvent,
		Pass2CompleteEvent,
		CompleteEvent,
		ErrorEvent
	} from '$lib/multipass';
	import AnimatedLogo from './AnimatedLogo.svelte';

	type Props = {
		/** Whether analysis is in progress */
		isAnalyzing: boolean;
		/** Current progress event */
		currentEvent: ProgressEvent | null;
		/** Error message if analysis failed */
		error: string | null;
		/** Callback when analysis completes */
		onComplete?: (result: CompleteEvent['result']) => void;
		/** Callback to cancel analysis */
		onCancel?: () => void;
	};

	let { isAnalyzing, currentEvent, error, onComplete, onCancel }: Props = $props();

	// Derived state from events
	let phase = $derived.by(() => {
		if (!currentEvent) return 'idle';
		switch (currentEvent.type) {
			case 'started':
				return 'starting';
			case 'pass1_started':
			case 'pass1_complete':
				return 'extraction';
			case 'pass2_started':
			case 'pass2_batch_started':
			case 'pass2_batch_complete':
			case 'pass2_claim_complete':
			case 'pass2_complete':
				return 'analysis';
			case 'pass3_started':
			case 'pass3_complete':
				return 'synthesis';
			case 'complete':
				return 'complete';
			case 'error':
				return 'error';
			default:
				return 'idle';
		}
	});

	let claimsExtracted = $state(0);
	let totalBatches = $state(0);
	let completedBatches = $state(0);
	let claimsAnalyzed = $state(0);
	let claimsFailed = $state(0);
	let totalClaims = $state(0);
	let estimatedTimeMs = $state(0);
	let elapsedMs = $state(0);

	// Track the last event type to detect new analysis runs
	let lastEventType = $state<string | null>(null);

	// Update state when events arrive
	$effect(() => {
		if (!currentEvent) {
			// Reset when currentEvent becomes null (analysis stopped/reset)
			lastEventType = null;
			claimsExtracted = 0;
			totalBatches = 0;
			completedBatches = 0;
			claimsAnalyzed = 0;
			claimsFailed = 0;
			totalClaims = 0;
			estimatedTimeMs = 0;
			elapsedMs = 0;
			return;
		}

		// Log all events for debugging
		console.log('[MultiPassProgress] Event:', currentEvent.type, currentEvent);

		// Reset counters when a new analysis starts (detected by 'started' event)
		if (currentEvent.type === 'started' && lastEventType !== 'started') {
			claimsExtracted = 0;
			totalBatches = 0;
			completedBatches = 0;
			claimsAnalyzed = 0;
			claimsFailed = 0;
			totalClaims = 0;
			estimatedTimeMs = 0;
		}

		lastEventType = currentEvent.type;
		elapsedMs = currentEvent.elapsed;

		switch (currentEvent.type) {
			case 'pass1_complete': {
				const e = currentEvent as Pass1CompleteEvent;
				claimsExtracted = e.claimsExtracted;
				console.log('[MultiPassProgress] Pass1 complete, claimsExtracted:', e.claimsExtracted);
				break;
			}
			case 'pass2_started': {
				const e = currentEvent as Pass2StartedEvent;
				totalClaims = e.totalClaims;
				totalBatches = e.totalBatches;
				estimatedTimeMs = e.estimatedTimeMs;
				completedBatches = 0;
				claimsAnalyzed = 0;
				claimsFailed = 0;
				console.log('[MultiPassProgress] Pass2 started, totalBatches:', e.totalBatches, 'totalClaims:', e.totalClaims);
				break;
			}
			case 'pass2_batch_complete': {
				const e = currentEvent as Pass2BatchCompleteEvent;
				completedBatches = e.batchIndex + 1;
				// succeeded/failed are per-batch counts, accumulate them
				claimsAnalyzed += e.succeeded;
				claimsFailed += e.failed;
				console.log('[MultiPassProgress] Batch complete:', completedBatches, '/', totalBatches);
				break;
			}
			case 'pass2_complete': {
				const e = currentEvent as Pass2CompleteEvent;
				claimsAnalyzed = e.totalAnalyzed;
				claimsFailed = e.totalFailed;
				break;
			}
			case 'complete': {
				const e = currentEvent as CompleteEvent;
				onComplete?.(e.result);
				break;
			}
		}
	});

	// Format time duration
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

	// Calculate progress percentage
	let progressPercent = $derived.by(() => {
		if (phase === 'complete') return 100;
		if (phase === 'error') return 0;
		if (phase === 'starting') return 2;
		if (phase === 'extraction') return 10;
		if (phase === 'synthesis') return 95;
		if (phase === 'analysis' && totalBatches > 0) {
			// Analysis phase is 10-90% of progress
			const batchProgress = completedBatches / totalBatches;
			return 10 + batchProgress * 80;
		}
		return 5;
	});

	// Status message
	let statusMessage = $derived.by(() => {
		switch (phase) {
			case 'starting':
				return 'Initializing analysis...';
			case 'extraction':
				if (claimsExtracted > 0) {
					return `Extracted ${claimsExtracted} claims`;
				}
				return 'Extracting claims from content...';
			case 'analysis':
				if (completedBatches > 0) {
					return `Analyzing claims: batch ${completedBatches}/${totalBatches} (${claimsAnalyzed}/${totalClaims} claims)`;
				}
				return `Preparing to analyze ${totalClaims} claims in ${totalBatches} batches...`;
			case 'synthesis':
				return 'Synthesizing final analysis...';
			case 'complete':
				return `Analysis complete! ${claimsAnalyzed} claims analyzed`;
			case 'error':
				return 'Analysis failed';
			default:
				return 'Ready to analyze';
		}
	});
</script>

{#if isAnalyzing || phase === 'complete' || phase === 'error'}
	<div
		class="progress-container"
		class:error={phase === 'error'}
		class:complete={phase === 'complete'}
	>
		<div class="progress-header">
			<div class="progress-title">
				{#if isAnalyzing}
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
				<span>Multi-Pass Analysis</span>
			</div>
			{#if isAnalyzing && onCancel}
				<button type="button" class="cancel-btn" onclick={onCancel}> Cancel </button>
			{/if}
		</div>

		<div class="progress-bar-container">
			<div
				class="progress-bar"
				class:indeterminate={phase === 'starting'}
				style="width: {progressPercent}%"
			></div>
		</div>

		<div class="progress-status">
			<span class="status-message">{statusMessage}</span>
			{#if isAnalyzing && elapsedMs > 0}
				<span class="elapsed-time">{formatDuration(elapsedMs)}</span>
			{/if}
		</div>

		{#if error}
			<div class="error-message">
				<strong>Error:</strong>
				{error}
			</div>
		{/if}

		{#if phase === 'analysis' && estimatedTimeMs > 0}
			<div class="time-estimate">
				<span class="label">Estimated time remaining:</span>
				<span class="value">{formatDuration(Math.max(0, estimatedTimeMs - elapsedMs))}</span>
			</div>
		{/if}

		{#if phase === 'analysis' || phase === 'synthesis' || phase === 'complete'}
			<div class="stats-grid">
				<div class="stat">
					<span class="stat-value">{claimsExtracted}</span>
					<span class="stat-label">Claims Found</span>
				</div>
				<div class="stat">
					<span class="stat-value">{claimsAnalyzed}</span>
					<span class="stat-label">Analyzed</span>
				</div>
				{#if claimsFailed > 0}
					<div class="stat failed">
						<span class="stat-value">{claimsFailed}</span>
						<span class="stat-label">Failed</span>
					</div>
				{/if}
				<div class="stat">
					<span class="stat-value">{completedBatches}/{totalBatches}</span>
					<span class="stat-label">Batches</span>
				</div>
			</div>
		{/if}

		{#if phase === 'analysis'}
			<div class="phase-indicator">
				<div class="phase completed">
					<span class="phase-dot"></span>
					<span class="phase-name">Extract</span>
				</div>
				<div class="phase-line completed"></div>
				<div class="phase active">
					<span class="phase-dot"></span>
					<span class="phase-name">Analyze</span>
				</div>
				<div class="phase-line"></div>
				<div class="phase">
					<span class="phase-dot"></span>
					<span class="phase-name">Synthesize</span>
				</div>
			</div>
		{:else if phase === 'synthesis'}
			<div class="phase-indicator">
				<div class="phase completed">
					<span class="phase-dot"></span>
					<span class="phase-name">Extract</span>
				</div>
				<div class="phase-line completed"></div>
				<div class="phase completed">
					<span class="phase-dot"></span>
					<span class="phase-name">Analyze</span>
				</div>
				<div class="phase-line completed"></div>
				<div class="phase active">
					<span class="phase-dot"></span>
					<span class="phase-name">Synthesize</span>
				</div>
			</div>
		{/if}
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
		0%, 100% {
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
</style>
