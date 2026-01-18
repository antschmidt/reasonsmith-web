<script lang="ts">
	import type { MultiPassTokenUsage } from '$lib/multipass/types';

	let {
		usage
	}: {
		usage: MultiPassTokenUsage;
	} = $props();

	// Format large numbers with commas
	function formatNumber(n: number): string {
		return n.toLocaleString();
	}

	// Calculate percentages for each pass
	const totalTokens = $derived(usage.total.totalTokens);
	const pass1Percent = $derived(totalTokens > 0 ? (usage.pass1.totalTokens / totalTokens * 100).toFixed(1) : '0');
	const pass2Tokens = $derived(usage.pass2.reduce((sum, u) => sum + u.totalTokens, 0));
	const pass2Percent = $derived(totalTokens > 0 ? (pass2Tokens / totalTokens * 100).toFixed(1) : '0');
	const pass3Percent = $derived(totalTokens > 0 ? (usage.pass3.totalTokens / totalTokens * 100).toFixed(1) : '0');

	// Cache efficiency
	const cacheCreated = $derived(usage.total.cacheCreationTokens || 0);
	const cacheRead = $derived(usage.total.cacheReadTokens || 0);
	const cacheEfficiency = $derived(
		cacheCreated + cacheRead > 0
			? ((cacheRead / (cacheCreated + cacheRead)) * 100).toFixed(0)
			: null
	);
</script>

<div class="token-breakdown">
	<h4>Token Usage Breakdown</h4>

	<div class="breakdown-grid">
		<!-- Pass 1 -->
		<div class="pass-row">
			<div class="pass-info">
				<span class="pass-name">Pass 1: Extraction</span>
				<span class="pass-model">Haiku</span>
			</div>
			<div class="pass-stats">
				<span class="tokens">{formatNumber(usage.pass1.inputTokens)} in / {formatNumber(usage.pass1.outputTokens)} out</span>
				<span class="percent">{pass1Percent}%</span>
			</div>
			<div class="progress-bar">
				<div class="progress-fill pass1" style="width: {pass1Percent}%"></div>
			</div>
		</div>

		<!-- Pass 2 -->
		<div class="pass-row">
			<div class="pass-info">
				<span class="pass-name">Pass 2: Claim Analysis</span>
				<span class="pass-model">{usage.pass2.length} calls</span>
			</div>
			<div class="pass-stats">
				<span class="tokens">
					{formatNumber(usage.pass2.reduce((s, u) => s + u.inputTokens, 0))} in /
					{formatNumber(usage.pass2.reduce((s, u) => s + u.outputTokens, 0))} out
				</span>
				<span class="percent">{pass2Percent}%</span>
			</div>
			<div class="progress-bar">
				<div class="progress-fill pass2" style="width: {pass2Percent}%"></div>
			</div>
		</div>

		<!-- Pass 3 -->
		<div class="pass-row">
			<div class="pass-info">
				<span class="pass-name">Pass 3: Synthesis</span>
				<span class="pass-model">Sonnet</span>
			</div>
			<div class="pass-stats">
				<span class="tokens">{formatNumber(usage.pass3.inputTokens)} in / {formatNumber(usage.pass3.outputTokens)} out</span>
				<span class="percent">{pass3Percent}%</span>
			</div>
			<div class="progress-bar">
				<div class="progress-fill pass3" style="width: {pass3Percent}%"></div>
			</div>
		</div>
	</div>

	<div class="totals">
		<div class="total-row">
			<span class="total-label">Total Tokens</span>
			<span class="total-value">{formatNumber(totalTokens)}</span>
		</div>
		<div class="total-row">
			<span class="total-label">Input</span>
			<span class="total-value">{formatNumber(usage.total.inputTokens)}</span>
		</div>
		<div class="total-row">
			<span class="total-label">Output</span>
			<span class="total-value">{formatNumber(usage.total.outputTokens)}</span>
		</div>
	</div>

	{#if cacheEfficiency !== null}
		<div class="cache-stats">
			<span class="cache-label">Prompt Cache</span>
			<div class="cache-info">
				<span class="cache-detail">{formatNumber(cacheRead)} tokens from cache</span>
				<span class="cache-efficiency">{cacheEfficiency}% efficiency</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.token-breakdown {
		margin-top: 1rem;
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius);
	}

	h4 {
		margin: 0 0 1rem 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.breakdown-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.pass-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.pass-info {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.pass-name {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.pass-model {
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
	}

	.pass-stats {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.tokens {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.percent {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.progress-bar {
		height: 4px;
		background: var(--color-border);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.progress-fill.pass1 {
		background: var(--color-success);
	}

	.progress-fill.pass2 {
		background: var(--color-primary);
	}

	.progress-fill.pass3 {
		background: var(--color-warning);
	}

	.totals {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.total-row {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.total-label {
		font-size: 0.7rem;
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.total-value {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.cache-stats {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.cache-label {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.cache-info {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.cache-detail {
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
	}

	.cache-efficiency {
		padding: 0.15rem 0.4rem;
		font-size: 0.7rem;
		font-weight: 500;
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
		border-radius: var(--border-radius-sm);
	}
</style>
