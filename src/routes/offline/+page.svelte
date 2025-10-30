<script lang="ts">
	function retry() {
		window.location.reload();
	}
</script>

<div class="offline-page">
	<div class="offline-content">
		<div class="offline-icon">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
				<path
					d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49.01.01.01-.01 3.9-4.86 3.32 3.32 1.27-1.27-3.46-3.46z"
				/>
			</svg>
		</div>

		<h1>You're offline</h1>

		<p class="offline-description">
			It looks like you've lost your internet connection. ReasonSmith needs an active connection to
			load new content and sync your work.
		</p>

		<div class="offline-actions">
			<button type="button" class="retry-button" onclick={retry}> Try Again </button>

			<a href="/" class="home-link">Go to Home</a>
		</div>

		<div class="offline-tips">
			<h2>While you're offline:</h2>
			<ul>
				<li>Check your internet connection</li>
				<li>Previously loaded pages may still be accessible</li>
				<li>Your drafts are saved locally and will sync when you're back online</li>
			</ul>
		</div>
	</div>
</div>

<style>
	.offline-page {
		min-height: 100vh;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-surface) 85%, var(--color-primary) 15%),
			color-mix(in srgb, var(--color-surface-alt) 80%, var(--color-accent) 12%)
		);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		font-family: var(--font-family-sans);
	}

	.offline-content {
		max-width: 500px;
		width: 100%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-xl);
		padding: 3rem;
		text-align: center;
		box-shadow: 0 12px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.offline-icon {
		width: 80px;
		height: 80px;
		margin: 0 auto 2rem;
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.offline-icon svg {
		width: 40px;
		height: 40px;
		fill: var(--color-primary);
	}

	.offline-content h1 {
		font-family: var(--font-family-display);
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 1rem 0;
	}

	.offline-description {
		color: var(--color-text-secondary);
		line-height: var(--line-height-relaxed);
		margin: 0 0 2rem 0;
	}

	.offline-actions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.retry-button {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 1rem 2rem;
		border-radius: var(--border-radius-md);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.retry-button:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.home-link {
		color: var(--color-link);
		text-decoration: none;
		font-weight: 500;
		padding: 0.75rem;
		transition: color 0.2s ease;
	}

	.home-link:hover {
		color: var(--color-link-hover);
		text-decoration: underline;
	}

	.offline-tips {
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 1.5rem;
		text-align: left;
	}

	.offline-tips h2 {
		font-family: var(--font-family-display);
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 1rem 0;
	}

	.offline-tips ul {
		margin: 0;
		padding-left: 1.5rem;
		color: var(--color-text-secondary);
		line-height: var(--line-height-relaxed);
	}

	.offline-tips li {
		margin-bottom: 0.5rem;
	}

	@media (max-width: 640px) {
		.offline-content {
			padding: 2rem 1.5rem;
		}

		.offline-content h1 {
			font-size: 1.5rem;
		}
	}
</style>
