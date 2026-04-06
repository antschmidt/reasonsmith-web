<script lang="ts">
	interface Props {
		title: string;
		nodeCount: number;
		updatedAt: string;
	}

	let { title, nodeCount, updatedAt }: Props = $props();

	function formatRelativeTime(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHr = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHr / 24);

		if (diffSec < 60) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffHr < 24) return `${diffHr}h ago`;
		if (diffDay < 7) return `${diffDay}d ago`;

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="argument-header">
	<h1 class="argument-title" title={title}>{title}</h1>
	<div class="argument-meta">
		<span class="meta-item node-count">
			<span class="meta-value">{nodeCount}</span>
			<span class="meta-label">{nodeCount === 1 ? 'node' : 'nodes'}</span>
		</span>
		<span class="meta-separator">·</span>
		<span class="meta-item updated">
			<span class="meta-label">Updated</span>
			<time datetime={updatedAt}>{formatRelativeTime(updatedAt)}</time>
		</span>
	</div>
</div>

<style>
	.argument-header {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.argument-title {
		font-family: var(--font-family-display);
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
		line-height: 1.3;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.argument-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
		font-family: var(--font-family-ui);
	}

	.meta-item {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.meta-value {
		font-weight: 600;
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.meta-label {
		font-weight: 400;
	}

	.meta-separator {
		color: var(--color-border);
		user-select: none;
	}

	time {
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 768px) {
		.argument-title {
			font-size: 0.9rem;
			max-width: 140px;
		}

		.argument-meta {
			display: none;
		}
	}
</style>
