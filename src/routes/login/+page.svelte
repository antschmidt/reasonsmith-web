<script lang="ts">
	import { nhost } from '$lib/nhostClient';

	let error: Error | null = null;
	const currentYear = new Date().getFullYear();

	const handleSignIn = async () => {
		try {
			await nhost.auth.signIn({
				provider: 'github',
				options: {
					redirectTo: '/auth/callback'
				}
			});
		} catch (err) {
			error = err as Error;
		}
	};
</script>

<div class="auth-page">
	<header class="auth-masthead">
		<a class="auth-brand" href="/" aria-label="Return to ReasonSmith home">ReasonSmith</a>
		<p>Journal of Constructive Argument</p>
	</header>

	<main class="auth-main">
		<div class="auth-panel two-column">
			<section class="auth-intro">
				<h2>Forge arguments worth publishing.</h2>
				<p>
					ReasonSmith pairs editorial discipline with a collaborative workshop ethos. Surface the
					best version of your thinking, supported by citations and transparent revision history.
				</p>
				<p class="pull-quote">
					“Strong discourse starts with careful sourcing, patient tone, and a willingness to meet
					good faith halfway.”
				</p>
				<p>
					Sign in to access your writing desk, monitor good-faith scores, and join curated
					discussions.
				</p>
			</section>

			<section class="auth-card" aria-labelledby="auth-heading">
				<h1 id="auth-heading">Sign in</h1>
				<p>Continue with your GitHub account to enter the ReasonSmith writing desk.</p>
				<div class="auth-actions">
					<button
						type="button"
						class="auth-provider-button"
						on:click={handleSignIn}
						aria-label="Sign in with GitHub"
					>
						<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<path
								fill-rule="evenodd"
								d="M10 0C4.477 0 0 4.477 0 10c0 4.418 2.865 8.166 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.031-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.378.203 2.398.1 2.65.64.7 1.03 1.595 1.03 2.688 0 3.848-2.338 4.695-4.566 4.943.359.308.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.577.688.482A10.001 10.001 0 0020 10c0-5.523-4.477-10-10-10z"
								clip-rule="evenodd"
							/>
						</svg>
						<span>Sign in with GitHub</span>
					</button>
				</div>
				{#if error}
					<p class="auth-error" role="alert">{error.message}</p>
				{/if}
			</section>
		</div>
	</main>

	<footer class="auth-footer">
		<nav aria-label="Legal links">
			<a href="/terms">Terms</a>
			<a href="/privacy">Privacy</a>
			<a href="/resources/community-guidelines">Guidelines</a>
		</nav>
		<span>© {currentYear} ReasonSmith Media</span>
	</footer>
</div>

<style>
	/* Foreign Affairs/Atlantic inspired authentication page styling */
	.auth-page {
		min-height: 100vh;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-surface) 85%, var(--color-primary) 15%),
			color-mix(in srgb, var(--color-surface-alt) 80%, var(--color-accent) 12%)
		);
		display: flex;
		flex-direction: column;
		font-family: var(--font-family-sans);
	}

	.auth-masthead {
		padding: 2rem;
		text-align: center;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
	}

	.auth-brand {
		font-family: var(--font-family-display);
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text-primary);
		text-decoration: none;
		letter-spacing: -0.01em;
		margin-bottom: 0.5rem;
		display: block;
	}

	.auth-masthead p {
		margin: 0.5rem 0 0;
		color: var(--color-text-secondary);
		font-style: italic;
		font-size: 0.9rem;
	}

	.auth-main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.auth-panel {
		max-width: 900px;
		width: 100%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 24px;
		box-shadow: 0 12px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
		overflow: hidden;
	}

	.two-column {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 500px;
	}

	@media (max-width: 768px) {
		.two-column {
			grid-template-columns: 1fr;
		}
	}

	.auth-intro {
		padding: 3rem;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 5%, var(--color-surface)),
			color-mix(in srgb, var(--color-accent) 3%, var(--color-surface-alt))
		);
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.auth-intro h2 {
		font-family: var(--font-family-display);
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin-bottom: 1.5rem;
		line-height: var(--line-height-tight);
		letter-spacing: -0.01em;
	}

	.auth-intro p {
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
		margin-bottom: 1.5rem;
		font-size: 1rem;
	}

	.pull-quote {
		font-style: italic;
		color: var(--color-text-primary);
		border-left: 3px solid var(--color-primary);
		padding-left: 1rem;
		margin: 2rem 0;
		font-size: 1.1rem;
	}

	.auth-card {
		padding: 3rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1.5rem;
	}

	.auth-card h1 {
		font-family: var(--font-family-display);
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 1rem 0;
		text-align: center;
	}

	.auth-card > p {
		color: var(--color-text-secondary);
		text-align: center;
		margin: 0 0 2rem 0;
		line-height: var(--line-height-normal);
	}

	.auth-actions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.auth-provider-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem 2rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 12px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 15px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.auth-provider-button:hover {
		background: color-mix(in srgb, var(--color-primary) 90%, black);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.auth-provider-button:active {
		transform: translateY(0);
	}

	.auth-provider-button svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
	}

	.auth-error {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		color: #dc2626;
		padding: 1rem;
		border-radius: 8px;
		font-size: 0.875rem;
		margin: 1rem 0 0 0;
	}

	.auth-footer {
		padding: 2rem;
		text-align: center;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.auth-footer nav {
		display: flex;
		justify-content: center;
		gap: 2rem;
	}

	.auth-footer nav a {
		color: var(--color-link);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.auth-footer nav a:hover {
		color: var(--color-link-hover);
		text-decoration: underline;
	}

	.auth-footer span {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	/* Dark theme adjustments */
	:global([data-theme='dark']) .auth-provider-button {
		background: var(--color-primary);
		color: var(--color-surface);
	}

	:global([data-theme='dark']) .auth-provider-button:hover {
		background: var(--color-accent);
	}
</style>
