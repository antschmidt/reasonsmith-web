<svelte:options runes={true} />

<script lang="ts">
	/**
	 * InterruptedAnalysisBanner
	 *
	 * Displays a banner when an interrupted analysis session is detected,
	 * allowing users to resume, retry failed claims, or start fresh.
	 */

	import type { AnalysisStatusResponse, ResumeAction } from '$lib/multipass';

	type Props = {
		status: AnalysisStatusResponse;
		onResume: (action: Exclude<ResumeAction, 'start_fresh'>) => void;
		onStartFresh: () => void;
		onDismiss: () => void;
	};

	let { status, onResume, onStartFresh, onDismiss }: Props = $props();

	const phaseLabels: Record<string, string> = {
		pass1: 'Extraction interrupted',
		pass2_incomplete: 'Analysis in progress',
		pass2_complete: 'Analysis complete (with failures)',
		ready_for_synthesis: 'Ready for synthesis',
		failed: 'Analysis failed'
	};

	const phaseDescriptions: Record<string, string> = {
		pass1: 'The claim extraction was interrupted. You will need to start fresh.',
		pass2_incomplete:
			'Some claims have been analyzed. You can continue from where you left off.',
		pass2_complete:
			'All claims were processed but some failed. You can retry the failed ones or generate a summary with what we have.',
		ready_for_synthesis:
			'All claims have been analyzed. You can generate the final summary now.',
		failed: 'The analysis encountered an error. You can retry or start fresh.'
	};

	// Format time since last update
	function formatTimeSince(dateStr: string | undefined): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
	}
</script>

<div class="interrupted-banner">
	<div class="banner-header">
		<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="10" />
			<polyline points="12 6 12 12 16 14" />
		</svg>
		<span class="title">Interrupted Analysis Found</span>
		<button class="dismiss-btn" onclick={onDismiss} aria-label="Dismiss">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>

	<div class="banner-body">
		<p class="status-text">
			<strong>{phaseLabels[status.phase] || 'Unknown state'}</strong>
			{#if status.claimsTotal > 0}
				<span class="claim-count">
					&mdash; {status.claimsCompleted}/{status.claimsTotal} claims analyzed
				</span>
			{/if}
			{#if status.claimsFailed > 0}
				<span class="failed-count">({status.claimsFailed} failed)</span>
			{/if}
		</p>

		<p class="description">
			{phaseDescriptions[status.phase] || 'Previous analysis state detected.'}
		</p>

		{#if status.session?.updated_at}
			<p class="timestamp">Last updated: {formatTimeSince(status.session.updated_at)}</p>
		{/if}

		<div class="actions">
			{#if status.canResume}
				<button class="btn-primary" onclick={() => onResume('continue')}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polygon points="5 3 19 12 5 21 5 3" />
					</svg>
					Continue Analysis
				</button>
			{/if}

			{#if status.canRetryFailed}
				<button class="btn-secondary" onclick={() => onResume('retry_failed')}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="1 4 1 10 7 10" />
						<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
					</svg>
					Retry Failed ({status.claimsFailed})
				</button>
			{/if}

			{#if status.canResynthesize}
				<button class="btn-secondary" onclick={() => onResume('resynthesize')}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 20V10" />
						<path d="M18 20V4" />
						<path d="M6 20v-4" />
					</svg>
					Generate Summary
				</button>
			{/if}

			<button class="btn-text" onclick={onStartFresh}> Start Fresh </button>
		</div>
	</div>
</div>

<style>
	.interrupted-banner {
		border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 40%, transparent);
		border-radius: var(--border-radius-lg, 12px);
		background: color-mix(in srgb, var(--color-warning, #f59e0b) 8%, var(--color-surface, #fff));
		margin: 1rem 0;
		overflow: hidden;
	}

	.banner-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-warning, #f59e0b) 15%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 20%, transparent);
	}

	.banner-header .icon {
		width: 20px;
		height: 20px;
		color: var(--color-warning, #f59e0b);
		flex-shrink: 0;
	}

	.title {
		font-weight: 600;
		flex: 1;
		color: var(--color-text, #1f2937);
	}

	.dismiss-btn {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.dismiss-btn:hover {
		opacity: 1;
	}

	.dismiss-btn svg {
		width: 18px;
		height: 18px;
	}

	.banner-body {
		padding: 1rem;
	}

	.status-text {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
	}

	.claim-count {
		color: var(--color-text-secondary, #6b7280);
	}

	.failed-count {
		color: var(--color-error, #ef4444);
		font-weight: 500;
	}

	.description {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #6b7280);
	}

	.timestamp {
		margin: 0 0 1rem;
		font-size: 0.8rem;
		color: var(--color-text-tertiary, #9ca3af);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm, 6px);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color 0.2s,
			transform 0.1s;
	}

	.btn-primary:active,
	.btn-secondary:active {
		transform: scale(0.98);
	}

	.btn-primary svg,
	.btn-secondary svg {
		width: 16px;
		height: 16px;
	}

	.btn-primary {
		background: var(--color-primary, #3b82f6);
		color: white;
		border: none;
	}

	.btn-primary:hover {
		background: color-mix(in srgb, var(--color-primary, #3b82f6) 85%, black);
	}

	.btn-secondary {
		background: var(--color-surface, #fff);
		border: 1px solid var(--color-border, #e5e7eb);
		color: var(--color-text, #1f2937);
	}

	.btn-secondary:hover {
		background: var(--color-surface-hover, #f9fafb);
	}

	.btn-text {
		background: none;
		border: none;
		color: var(--color-text-secondary, #6b7280);
		cursor: pointer;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.btn-text:hover {
		color: var(--color-text, #1f2937);
	}

	/* Dark mode adjustments */
	@media (prefers-color-scheme: dark) {
		.interrupted-banner {
			background: color-mix(in srgb, var(--color-warning, #f59e0b) 10%, var(--color-surface, #1f2937));
		}

		.banner-header {
			background: color-mix(in srgb, var(--color-warning, #f59e0b) 20%, transparent);
		}
	}
</style>
