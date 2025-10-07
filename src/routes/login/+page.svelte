<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { getOAuthRedirectURL, isStandalone } from '$lib/utils/pwa';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let error: Error | null = null;
	let email = '';
	let password = '';
	let magicLinkEmail = '';
	let showMagicLink = false;
	let showEmailPassword = false;
	let magicLinkSent = false;
	let activeTab: 'signin' | 'signup' = 'signin';
	const currentYear = new Date().getFullYear();

	// Get redirect URL from query params
	let redirectTo = '';
	onMount(() => {
		redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard';
	});

	const handleGitHubSignIn = async () => {
		try {
			const isPWA = isStandalone();
			await nhost.auth.signIn({
				provider: 'github',
				options: {
					redirectTo: getOAuthRedirectURL('/auth/callback', isPWA)
				}
			});
		} catch (err) {
			error = err as Error;
		}
	};

	const handleGoogleSignIn = async () => {
		try {
			const isPWA = isStandalone();
			await nhost.auth.signIn({
				provider: 'google',
				options: {
					redirectTo: getOAuthRedirectURL('/auth/callback', isPWA)
				}
			});
		} catch (err) {
			error = err as Error;
		}
	};

	const handleMagicLinkSignIn = async () => {
		error = null;
		magicLinkSent = false;
		try {
			const isPWA = isStandalone();
			await nhost.auth.signIn({
				email: magicLinkEmail,
				options: {
					redirectTo: getOAuthRedirectURL('/auth/callback', isPWA)
				}
			});
			magicLinkSent = true;
		} catch (err) {
			error = err as Error;
		}
	};

	const handleEmailPasswordSignIn = async () => {
		error = null;
		try {
			const { error: signInError } = await nhost.auth.signIn({
				email,
				password
			});
			if (signInError) {
				error = signInError;
			} else {
				// Redirect after successful sign-in
				goto(redirectTo);
			}
		} catch (err) {
			error = err as Error;
		}
	};

	const handleEmailPasswordSignUp = async () => {
		error = null;
		try {
			const { error: signUpError } = await nhost.auth.signUp({
				email,
				password
			});
			if (signUpError) {
				error = signUpError;
			} else {
				// Redirect after successful sign-up
				goto(redirectTo);
			}
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
			<section class="auth-card" aria-labelledby="auth-heading">
				<div class="auth-tabs">
					<button
						type="button"
						class="auth-tab"
						class:active={activeTab === 'signin'}
						onclick={() => (activeTab = 'signin')}
					>
						Sign In
					</button>
					<button
						type="button"
						class="auth-tab"
						class:active={activeTab === 'signup'}
						onclick={() => (activeTab = 'signup')}
					>
						Sign Up
					</button>
				</div>

				<h1 id="auth-heading">{activeTab === 'signin' ? 'Sign in' : 'Create account'}</h1>
				<p>
					{activeTab === 'signin'
						? 'Choose your preferred method to access the ReasonSmith writing desk.'
						: 'Join ReasonSmith to start crafting well-sourced arguments.'}
				</p>
				<div class="auth-actions">
					<button
						type="button"
						class="auth-provider-button"
						onclick={handleGoogleSignIn}
						aria-label="Sign in with Google"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
								fill="#4285F4"
							/>
							<path
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
								fill="#34A853"
							/>
							<path
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
								fill="#FBBC05"
							/>
							<path
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
								fill="#EA4335"
							/>
						</svg>
						<span>{activeTab === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}</span>
					</button>

					<button
						type="button"
						class="auth-provider-button"
						onclick={handleGitHubSignIn}
						aria-label="Sign in with GitHub"
					>
						<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<path
								fill-rule="evenodd"
								d="M10 0C4.477 0 0 4.477 0 10c0 4.418 2.865 8.166 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.031-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.378.203 2.398.1 2.65.64.7 1.03 1.595 1.03 2.688 0 3.848-2.338 4.695-4.566 4.943.359.308.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.577.688.482A10.001 10.001 0 0020 10c0-5.523-4.477-10-10-10z"
								clip-rule="evenodd"
							/>
						</svg>
						<span>{activeTab === 'signin' ? 'Sign in with GitHub' : 'Sign up with GitHub'}</span>
					</button>

					<button
						type="button"
						class="auth-provider-button secondary"
						onclick={() => (showMagicLink = !showMagicLink)}
						aria-label="{activeTab === 'signin' ? 'Sign in' : 'Sign up'} with Magic Link"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path
								d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
							/>
						</svg>
						<span>{activeTab === 'signin' ? 'Sign in' : 'Sign up'} with Magic Link</span>
					</button>

					{#if showMagicLink}
						<div class="auth-form">
							<input
								type="email"
								bind:value={magicLinkEmail}
								placeholder="Enter your email"
								class="auth-input"
							/>
							<button
								type="button"
								class="auth-submit-button"
								onclick={handleMagicLinkSignIn}
								disabled={!magicLinkEmail}
							>
								Send Magic Link
							</button>
							{#if magicLinkSent}
								<p class="auth-success">Check your email for the magic link!</p>
							{/if}
						</div>
					{/if}

					<button
						type="button"
						class="auth-provider-button secondary"
						onclick={() => (showEmailPassword = !showEmailPassword)}
						aria-label="{activeTab === 'signin' ? 'Sign in' : 'Sign up'} with Email & Password"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path
								d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
							/>
						</svg>
						<span>{activeTab === 'signin' ? 'Sign in' : 'Sign up'} with Email & Password</span>
					</button>

					{#if showEmailPassword}
						<div class="auth-form">
							<input type="email" bind:value={email} placeholder="Email" class="auth-input" />
							<input
								type="password"
								bind:value={password}
								placeholder="Password"
								class="auth-input"
								maxlength="50"
							/>
							<button
								type="button"
								class="auth-submit-button"
								onclick={activeTab === 'signin'
									? handleEmailPasswordSignIn
									: handleEmailPasswordSignUp}
								disabled={!email || !password}
							>
								{activeTab === 'signin' ? 'Sign In' : 'Sign Up'}
							</button>
						</div>
					{/if}
				</div>
				{#if error}
					<p class="auth-error" role="alert">{error.message}</p>
				{/if}
			</section>

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
		min-height: 92vh;
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
		padding: 0.3rem 1rem;
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
		padding: 1rem;
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
		/* margin: 2rem 0; */
		font-size: 1.1rem;
	}

	.auth-tabs {
		display: flex;
		gap: 0;
		margin-bottom: 1rem;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
	}

	.auth-tab {
		flex: 1;
		padding: 0.875rem 1.5rem;
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
	}

	.auth-tab:first-child {
		border-right: 1px solid var(--color-border);
	}

	.auth-tab.active {
		background: var(--color-primary);
		color: white;
	}

	.auth-tab:not(.active):hover {
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		color: var(--color-text-primary);
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

	.auth-provider-button.secondary {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		box-shadow: none;
	}

	.auth-provider-button:hover {
		background: color-mix(in srgb, var(--color-primary) 90%, black);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.auth-provider-button.secondary:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.auth-provider-button:active {
		transform: translateY(0);
	}

	.auth-provider-button svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		border-radius: 8px;
		border: 1px solid var(--color-border);
	}

	.auth-input {
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		font-size: 1rem;
		background: var(--color-surface);
		color: var(--color-text-primary);
		transition: all 0.2s ease;
	}

	.auth-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.auth-submit-button {
		padding: 0.75rem 1.5rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.auth-submit-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-primary) 90%, black);
	}

	.auth-submit-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.auth-success {
		background: color-mix(in srgb, #10b981 10%, transparent);
		border: 1px solid color-mix(in srgb, #10b981 30%, transparent);
		color: #059669;
		padding: 0.75rem;
		border-radius: 8px;
		font-size: 0.875rem;
		margin: 0;
		text-align: center;
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
		padding: 1rem;
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
