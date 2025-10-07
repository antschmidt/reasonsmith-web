<footer class="landing-footer">
	<nav aria-label="Legal links">
		<a href="/terms">Terms</a>
		<a href="/privacy">Privacy</a>
		<a href="/resources/community-guidelines">Guidelines</a>
	</nav>
	<span>© {new Date().getFullYear()} ReasonSmith Media</span>
</footer>

<style>
	.landing-footer {
		padding: 2rem;
		text-align: center;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.landing-footer nav {
		display: flex;
		justify-content: center;
		gap: 2rem;
	}

	.landing-footer nav a {
		color: var(--color-link);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.landing-footer nav a:hover {
		color: var(--color-link-hover);
		text-decoration: underline;
	}

	.landing-footer span {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}
</style>
