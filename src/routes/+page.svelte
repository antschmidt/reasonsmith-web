<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import { writable } from 'svelte/store';
	import { theme, toggleTheme } from '$lib/themeStore';
	import { page } from '$app/stores';
	import '../app.css'; // Import global styles

	const user = writable(nhost.auth.getUser());
	const showAuthOverlay = writable(false); // Store for overlay visibility

	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.service-worker.ready.then((reg) => {
				reg.addEventListener('updatefound', () => {
					// notify user to refresh
				});
			});
		}
		nhost.auth.onAuthStateChanged((_event, session) => {
			user.set(session?.user ?? null);
		});
	});

	let email = '';
	let password = '';
	let isLoginView = true;
	let activeAuthView: 'initial' | 'emailPassword' | 'magicLink' | 'securityKey' = 'initial';

	function toggleAuthModeView(targetIsLoginView: boolean) {
		isLoginView = targetIsLoginView;
		activeAuthView = 'initial';
		email = '';
		password = '';
	}

	const login = async () => {
		await nhost.auth.signIn({ email, password });
	};

	const logout = async () => {
		await nhost.auth.signOut();
	};

	const signup = async () => {
		const { error } = await nhost.auth.signUp({ email, password });
		if (error) {
			alert(error.message);
			return;
		}
		alert('Signup successful! Please check your email to verify your account.');
		toggleAuthModeView(true);
	};

	const signInWithGoogle = async () => {
		const { error } = await nhost.auth.signIn({
			provider: 'google'
		});
		if (error) {
			alert(`Error signing in with Google: ${error.message}`);
		}
	};

	const signInWithGitHub = async () => {
		const { error } = await nhost.auth.signIn({
			provider: 'github'
		});
		if (error) {
			alert(`Error signing in with GitHub: ${error.message}`);
		}
	};

	const sendMagicLink = async () => {
		if (!email) {
			alert('Please enter your email address.');
			return;
		}
		const { error } = await nhost.auth.signIn({ email });
		if (error) {
			alert(`Error sending magic link: ${error.message}`);
		} else {
			alert('Magic link sent! Check your email to complete the sign-in process.');
			activeAuthView = 'initial';
		}
	};

	const signUpWithSecurityKey = async () => {
		if (!email) {
			alert('Please enter your email address to register with a security key.');
			return;
		}
		const { error, session } = await nhost.auth.signUp({
			email,
			securityKey: true
		});

		if (error) {
			alert(`Error signing up with security key: ${error.message}`);
		} else {
			alert(
				'Follow the browser prompts to register your security key. You might be asked to verify your email first if this is a new account.'
			);
			if (session) {
				user.set(session.user);
			} else {
				toggleAuthModeView(true);
			}
		}
	};

	const signInWithSecurityKey = async () => {
		if (!email) {
			alert('Please enter your email address to sign in with a security key.');
			return;
		}
		const { error, session } = await nhost.auth.signIn({
			email,
			securityKey: true
		});

		if (error) {
			alert(`Error signing in with security key: ${error.message}`);
		} else {
			if (session) {
				user.set(session.user);
			}
		}
	};
</script>

{#if $user}
	<slot />
	<nav>
		<button on:click={toggleTheme} aria-label="Toggle theme" class="theme-toggle">
			{$theme === 'light' ? '🌙' : '☀️'}
		</button>
		<div>{$user.email}</div>
		<button on:click={logout}>Logout</button>
	</nav>
{:else if $page.url.pathname === '/privacy' || $page.url.pathname === '/terms'}
	<!-- Removed $ from $page -->
	<slot />
{:else}
	<div class="landing-hero">
		<h1>Welcome to ReasonSmith</h1>
		<p>
			ReasonSmith is an application which forges arguments by enforcing good faith argumentation.
		</p>
		<ul class="features-list">
			<li>
				<strong>Structured Argumentation</strong>: Build clear and logical arguments with a structured format.
			</li>
			<li><strong>Good Faith Enforcement</strong>: Mechanisms to ensure respectful and productive debate.</li>
			<li><strong>Collaborative Forging</strong>: Work with others to strengthen and refine your arguments.</li>
			<li>
				<strong>Secure Access</strong>: Sign in with email, magic link, OAuth, or security keys.
			</li>
		</ul>
		<button
			class="cta-button"
			on:click={() => {
				$showAuthOverlay = true;
				toggleAuthModeView(true);
			}}
		>
			Get Started
		</button>
	</div>

	{#if $showAuthOverlay}
		<div
			class="login-page-wrapper"
			role="dialog"
			aria-modal="true"
			aria-labelledby="auth-dialog-title"
		>
			<div class="login-container">
				<button
					class="close-auth-overlay"
					on:click={() => ($showAuthOverlay = false)}
					aria-label="Close authentication panel">&times;</button
				>
				<h2 id="auth-dialog-title">{isLoginView ? 'Login' : 'Sign Up'}</h2>

				{#if activeAuthView === 'initial'}
					<div class="auth-method-buttons">
						<button on:click={() => (activeAuthView = 'emailPassword')}>
							Continue with Email/Password
						</button>
						<button class="oauth-button" on:click={() => (activeAuthView = 'magicLink')}>
							{isLoginView ? 'Sign In' : 'Sign Up'} with Magic Link
						</button>
						<button class="oauth-button" on:click={() => (activeAuthView = 'securityKey')}>
							{isLoginView ? 'Sign In' : 'Sign Up'} with Security Key
						</button>
					</div>

					<div class="oauth-buttons">
						<button
							class="oauth-button"
							on:click={signInWithGoogle}
							aria-label="Sign in with Google"
						>
							<span>Sign in with Google</span>
						</button>
						<button
							class="oauth-button"
							on:click={signInWithGitHub}
							aria-label="Sign in with GitHub"
						>
							<span>Sign in with GitHub</span>
						</button>
					</div>
					<button class="toggle-auth-mode" on:click={() => toggleAuthModeView(!isLoginView)}>
						{isLoginView ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
					</button>
				{:else if activeAuthView === 'emailPassword'}
					<input type="email" placeholder="Email" bind:value={email} />
					<input type="password" placeholder="Password" bind:value={password} />
					<button class="auth-primary-action" on:click={isLoginView ? login : signup}>
						{isLoginView ? 'Login' : 'Sign Up'}
					</button>
					<button class="toggle-auth-mode" on:click={() => (activeAuthView = 'initial')}
						>Back to options</button
					>
				{:else if activeAuthView === 'magicLink'}
					<input type="email" placeholder="Email" bind:value={email} />
					<button class="oauth-button" on:click={sendMagicLink}>Send Magic Link</button>
					<button class="toggle-auth-mode" on:click={() => (activeAuthView = 'initial')}
						>Back to options</button
					>
				{:else if activeAuthView === 'securityKey'}
					<input type="email" placeholder="Email (required for Security Key)" bind:value={email} />
					<button
						class="oauth-button"
						on:click={isLoginView ? signInWithSecurityKey : signUpWithSecurityKey}
					>
						{isLoginView ? 'Sign In' : 'Sign Up'} with Security Key
					</button>
					<button class="toggle-auth-mode" on:click={() => (activeAuthView = 'initial')}
						>Back to options</button
					>
				{/if}

				<div class="legal-links">
					<a href="/terms">Terms of Service</a>
					<a href="/privacy">Privacy Policy</a>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	/* Base styles for input, button, nav, .theme-toggle should remain as they are if they were working */
	/* Assuming these are already present and correct from app.css or earlier in this style block */

	.login-page-wrapper {
		/* Reverted to overlay style */
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.6); /* Semi-transparent backdrop */
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000; /* Ensure it's on top */
		padding: 1rem; /* Padding for the backdrop, useful on small screens */
	}

	.login-container {
		position: relative; /* For positioning the close button */
		margin: 0; /* Centered by flex wrapper */
		max-width: 420px; /* Slightly wider */
		width: 100%;
		background-color: var(--color-surface);
		padding: 2.5rem; /* Increased padding */
		border-radius: var(--border-radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); /* Softer, more modern shadow */
		color: var(--color-text-primary);
		display: flex;
		flex-direction: column;
	}

	#auth-dialog-title {
		text-align: center;
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin-bottom: 1.5rem;
		font-family: var(--font-family-display);
	}

	.auth-primary-action {
		width: 100%;
		background-color: var(--color-accent);
		color: var(--color-surface);
		padding: 0.85rem;
		font-size: 1rem;
		font-weight: 500;
		margin-top: 0.5rem;
		margin-bottom: 1rem;
		border-radius: var(--border-radius-sm); /* Ensure it uses theme variable */
		cursor: pointer;
		transition: background-color var(--transition-speed) ease;
	}
	.auth-primary-action:hover {
		background-color: var(--color-primary);
	}

	.auth-method-buttons,
	.oauth-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.oauth-buttons {
		padding-top: 1.5rem;
		border-top: 1px solid var(--color-border);
	}

	/* Ensure buttons within these containers don't have extra bottom margin if gap is used */
	.auth-method-buttons button,
	.auth-method-buttons .oauth-button,
	.oauth-buttons .oauth-button {
		margin-bottom: 0;
	}

	.toggle-auth-mode {
		background: none;
		border: none;
		color: var(--color-accent);
		cursor: pointer;
		padding: 0.5rem 0;
		margin-top: 1.5rem;
		text-decoration: underline;
		text-align: center;
		width: 100%;
	}
	input {
		margin-bottom: 1rem;
	}

	.toggle-auth-mode:hover {
		color: var(--color-primary);
	}

	.close-auth-overlay {
		position: absolute;
		top: 0.75rem; /* Adjusted for new padding in .login-container */
		right: 0.75rem;
		background: transparent;
		border: none;
		font-size: 1.75rem; /* Made slightly larger */
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.5rem;
		line-height: 1;
	}
	.close-auth-overlay:hover {
		color: var(--color-text-primary);
	}

	/* Styles for landing-hero, features-list, cta-button are assumed to be fine or styled elsewhere */
	.landing-hero {
		text-align: center;
		padding: 2rem;
		background: var(--color-surface);
		color: var(--color-text-primary);
	}
	.landing-hero h1 {
		font-size: 2rem;
		margin-bottom: 1rem;
	}
	.landing-hero p {
		max-width: 600px;
		margin: 0 auto 1.5rem auto; /* Added bottom margin to paragraph */
		font-size: 1rem;
		color: var(--color-text-secondary);
	}
	.features-list {
		list-style: none;
		margin: 1rem 0 1.5rem;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}
	.features-list li {
		background: var(--color-surface-alt);
		padding: 1rem;
		border-radius: var(--border-radius-sm);
		text-align: left;
		font-size: 0.95rem;
		color: var(--color-text-primary);
	}
	.cta-button {
		background: var(--color-accent);
		color: var(--color-surface);
		padding: 0.75rem 2rem;
		font-size: 1rem;
		border: none;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		transition: background-color var(--transition-speed) ease;
		margin-top: 1rem;
	}
	.cta-button:hover {
		background: var(--color-primary);
	}

	/* Logged-in header/nav styling */
	nav {
		display: flex;
		justify-content: space-between;
		width: 90%;
		align-items: center;
		padding: 1rem;
		margin-bottom: 2rem;
		background: var(--color-surface);
    border: 0px;
		color: var(--color-text-primary);
    border-radius: var(--border-radius-sm);
	}

	button {
		padding: 0.75rem;
		border: none;
		background: var(--color-cta);
		color: var(--color-surface);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: background-color var(--transition-speed) ease;
	}

	button:hover {
		background: var(--color-primary);
	}

	.theme-toggle {
		background: transparent;
		font-size: 1.5rem;
		cursor: pointer;
		border: 0;
		padding: 0;
		margin: 0;
		color: var(--color-text-primary);
	}

	.theme-toggle:hover {
		background-color: var(--color-surface);
	}

	@media (max-width: 600px) {
		.login-container {
			padding: 2rem;
			/* For overlay, ensure it doesn't get too tall and becomes scrollable */
			max-height: 90vh;
			overflow-y: auto;
		}
		#auth-dialog-title {
			font-size: 1.5rem;
		}
		.landing-hero h1 {
			font-size: 1.8rem;
		}
		.features-list {
			grid-template-columns: 1fr;
		}
	}
	/* General button styling from app.css will apply to .oauth-button if not overridden here */
	/* Ensure .oauth-button specific styles are minimal if relying on global button styles */
	.oauth-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		/* padding: 0.75rem; */ /* Consider if global button style is better */
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: background-color var(--transition-speed) ease;
		border: 0px solid var(--color-border);
		background-color: var(--color-surface);
		color: var(--color-text-primary);
		/* width: 100%; */ /* Make OAuth buttons full width like primary action */
	}
	.oauth-button:hover {
		background-color: var(--color-input-bg);
	}

	.legal-links {
		margin-top: 1.5rem;
		text-align: center;
		font-size: 0.875rem;
	}

	.legal-links a {
		color: var(--color-text-secondary);
		text-decoration: none;
		margin: 0 0.5rem;
	}

	.legal-links a:hover {
		text-decoration: underline;
		color: var(--color-primary);
	}
</style>
