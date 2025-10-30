<section class="resources-section">
	<div class="resources-card">
		<h3>Resources for disciplined debate</h3>
		<p>
			Our primers keep the community aligned on method: how to cite, how to disagree, how to spot
			bad reasoning.
		</p>
		<nav class="resource-links">
			<a href="/resources/good-faith-arguments">Good-Faith Arguments Guide</a>
			<a href="/resources/citation-best-practices">Citation Best Practices</a>
			<a href="/resources/community-guidelines">Community Guidelines</a>
		</nav>
	</div>
</section>

<style>
	.resources-section {
		padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 6vw, 5rem);
		background: var(--color-surface);
	}

	.resources-card {
		max-width: 880px;
		margin: 0 auto;
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: var(--border-radius-xl);
		padding: clamp(2rem, 5vw, 3rem);
		box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
		text-align: center;
	}

	.resources-card h3 {
		margin: 0 0 1rem;
		font-family: var(--font-family-display);
		font-size: clamp(1.5rem, 3vw, 2rem);
	}

	.resources-card p {
		margin: 0 0 1.5rem;
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
	}

	.resource-links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1rem;
	}

	.resource-links a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 1.25rem;
		border-radius: var(--border-radius-full);
		border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		text-decoration: none;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text-primary);
		transition: all 0.25s ease;
	}

	.resource-links a:hover,
	.resource-links a:focus {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	@media (max-width: 640px) {
		.resources-card {
			padding: clamp(1.5rem, 6vw, 2.25rem);
		}
	}
</style>
