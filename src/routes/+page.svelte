<svelte:options runes={true} />

<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { nhost } from '$lib/nhostClient';
	import Dashboard from '$lib/components/Dashboard.svelte';
	import TopPostsCarousel from '$lib/components/TopPostsCarousel.svelte';
	import FeaturedAnalysesCarousel from '$lib/components/FeaturedAnalysesCarousel.svelte';
	import { theme, toggleTheme } from '$lib/themeStore';
	import { env as publicEnv } from '$env/dynamic/public';
	import type { PageData } from './$types';

	const SITE_URL = publicEnv.PUBLIC_SITE_URL;

	function getRedirect() {
		if (SITE_URL) return SITE_URL.replace(/\/$/, '') + '/auth/callback';
		if (typeof window !== 'undefined') return window.location.origin + '/auth/callback';
		return undefined;
	}

	const isOpen = writable(false);
	function toggle() {
		isOpen.update((v: boolean) => !v);
	}
	function close() {
		isOpen.set(false);
	}

	let user = $state(nhost.auth.getUser());
	let themeValue = $state('light');
	type PublicShowcaseItem = {
		id: string;
		title: string;
		subtitle?: string | null;
		media_type?: string | null;
		creator?: string | null;
		source_url?: string | null;
		summary?: string | null;
		analysis?: string | null;
		tags?: string[] | null;
		created_at: string;
	};

	const props = $props<{ data: PageData }>();
	let showcaseLoading = $state(false);
	let showcaseError = $state<string | null>(props.data?.showcaseError ?? null);
	let showcaseItems = $state<PublicShowcaseItem[]>(props.data?.showcaseItems ?? []);

	$effect(() => {
		showcaseItems = props.data?.showcaseItems ?? [];
		showcaseError = props.data?.showcaseError ?? null;
	});

	onMount(() => {
		const unsubTheme = theme.subscribe((v) => (themeValue = v || 'light'));
		nhost.auth.onAuthStateChanged((_event: string) => {
			user = nhost.auth.getUser();
		});
		return () => {
			unsubTheme();
		};
	});

	// Auth UI state
	let showAuthOverlay = $state(false);
	let activeAuthView = $state<'initial' | 'emailPassword' | 'magicLink' | 'securityKey'>('initial');
	let isLoginView = $state(true);
	let email = $state('');
	let password = $state('');
	let authError = $state<string | null>(null);
	let magicLinkSent = $state(false);

	function toggleAuthModeView(toLogin?: boolean) {
		if (typeof toLogin === 'boolean') isLoginView = toLogin;
		else isLoginView = !isLoginView;
		activeAuthView = 'initial';
		authError = null;
		magicLinkSent = false;
	}

	async function logout() {
		await nhost.auth.signOut();
		user = null;
	}
	async function signInWithGitHub() {
		try {
			await nhost.auth.signIn({ provider: 'github', options: { redirectTo: getRedirect() } });
		} catch (e: any) {
			authError = e.message;
		}
	}
	async function signInWithGoogle() {
		try {
			await nhost.auth.signIn({ provider: 'google', options: { redirectTo: getRedirect() } });
		} catch (e: any) {
			authError = e.message;
		}
	}
	async function login() {
		authError = null;
		try {
			await nhost.auth.signIn({ email, password });
		} catch (e: any) {
			authError = e.message;
		}
	}
	async function signup() {
		authError = null;
		try {
			await nhost.auth.signUp({ email, password });
		} catch (e: any) {
			authError = e.message;
		}
	}
	async function sendMagicLink() {
		authError = null;
		magicLinkSent = false;
		if (!email) {
			authError = 'Please enter an email first.';
			return;
		}
		try {
			const redirectTo = getRedirect();
			await nhost.auth.signIn({
				email,
				...(redirectTo ? { options: { redirectTo } } : {})
			});
			magicLinkSent = true;
		} catch (e: any) {
			console.error('Magic link request failed', e);
			const errorPayload = e?.error ?? e;
			if (errorPayload?.message) authError = errorPayload.message;
			else if (errorPayload?.error) authError = `${errorPayload.error}`;
			else authError = 'Failed to request magic link. Please try again shortly.';
		}
	}
	async function signInWithSecurityKey() {
		alert('Security key sign-in not yet implemented.');
	}
	async function signUpWithSecurityKey() {
		alert('Security key sign-up not yet implemented.');
	}
</script>

{#if user}
	<nav class="main-nav">
		<button type="button" onclick={toggleTheme} aria-label="Toggle theme" class="theme-toggle">
			{themeValue === 'light' ? '🌙' : '☀️'}
		</button>
		<div class="user-email">{user.email}</div>
		<button type="button" onclick={logout} class="logout-button">Logout</button>
	</nav>
	<Dashboard {user} />
{:else}
	<div class="landing-hero">
		<div class="hero-logo">
			<img src="/logo-only.png" alt="ReasonSmith Logo" class="logo-image" />
		</div>
		<h1>Welcome to ReasonSmith</h1>
		<p>
			ReasonSmith is an application which forges arguments by enforcing good faith argumentation.
		</p>
		<ul class="features-list">
			<li>
				<strong>Structured Argumentation</strong>
				<div>Build clear and logical arguments with a
				structured format.</div>
			</li>
			<li>
				<strong>Good Faith Enforcement</strong>
				<div>Mechanisms to ensure respectful and productive
				debate.</div>
			</li>
			<li>
				<strong>Collaborative Forging</strong>
				<div>Work with others to strengthen and refine your
				arguments.</div>
			</li>
		</ul>
		<button
			class="cta-button"
			type="button"
			onclick={() => {
				showAuthOverlay = true;
				toggleAuthModeView(true);
			}}
		>
			Get Started
		</button>

		<!-- Featured Top Posts for guests -->
		<div class="landing-featured">
			<TopPostsCarousel />
		</div>

		<section class="showcase" aria-labelledby="showcase-title">
			<div class="showcase-heading">
				<p>Hand-curated evaluations of notable speeches, podcasts, and essays.</p>
			</div>
			{#if showcaseLoading}
				<p class="showcase-status">Loading featured analyses…</p>
			{:else if showcaseError}
				<p class="showcase-status error">{showcaseError}</p>
			{:else if showcaseItems.length === 0}
				<p class="showcase-status">Curated analyses will appear here soon.</p>
			{:else}
				<FeaturedAnalysesCarousel items={showcaseItems} />
			{/if}
		</section>

		<div class="public-resources" aria-labelledby="public-resources-title">
			<ul class="public-resources-list">
				<li><a href="/resources/good-faith-arguments">Good-Faith Arguments Guide</a></li>
				<li><a href="/resources/citation-best-practices">Citation Best Practices</a></li>
				<li><a href="/resources/community-guidelines">Community Guidelines</a></li>
			</ul>
		</div>
	</div>

	{#if showAuthOverlay}
		<div
			class="login-page-wrapper"
			role="dialog"
			aria-modal="true"
			aria-labelledby="auth-dialog-title"
		>
			<div class="login-container">
				<button
					class="close-auth-overlay"
					type="button"
					onclick={() => (showAuthOverlay = false)}
					aria-label="Close authentication panel">&times;</button
				>
				<h2 id="auth-dialog-title">{isLoginView ? 'Login' : 'Sign Up'}</h2>

				{#if activeAuthView === 'initial'}
					<div class="auth-method-buttons">
						<button 
							aria-label="Continue with Email/Password"
							type="button"
							class="oauth-button"
							onclick={() => (activeAuthView = 'emailPassword')}
							>Continue with Email/Password</button
						>
						<button
							type="button"
							class="oauth-button"
							onclick={() => (activeAuthView = 'magicLink')}
							>{isLoginView ? 'Use Magic Link to Sign In' : 'Use Magic Link to Sign Up'}</button
						>
						<button
							type="button"
							class="oauth-button"
							onclick={() => (activeAuthView = 'securityKey')}
							>{isLoginView ? 'Sign In' : 'Sign Up'} with Security Key</button
						>
					</div>

					<div class="oauth-buttons">
						<button
							type="button"
							class="oauth-button"
							onclick={signInWithGoogle}
							aria-label="Sign in with Google"><span>Sign in with Google</span></button
						>
						<button
							type="button"
							class="oauth-button"
							onclick={signInWithGitHub}
							aria-label="Sign in with GitHub"><span>Sign in with GitHub</span></button
						>
					</div>
					<button
						type="button"
						class="toggle-auth-mode"
						onclick={() => toggleAuthModeView(!isLoginView)}
						>{isLoginView
							? "Don't have an account? Sign up"
							: 'Already have an account? Log in'}</button
					>
				{:else if activeAuthView === 'emailPassword'}
					<input type="email" placeholder="Email" bind:value={email} />
					<input type="password" placeholder="Password" bind:value={password} />
					<button type="button" class="auth-primary-action" onclick={isLoginView ? login : signup}
						>{isLoginView ? 'Login' : 'Sign Up'}</button
					>
					<button
						type="button"
						class="toggle-auth-mode"
						onclick={() => (activeAuthView = 'initial')}>Back to options</button
					>
				{:else if activeAuthView === 'magicLink'}
					<input type="email" placeholder="Email" bind:value={email} />
					<button
						type="button"
						class="oauth-button"
						onclick={sendMagicLink}
						disabled={magicLinkSent}>{magicLinkSent ? 'Magic Link Sent' : 'Send Magic Link'}</button
					>
					<button
						type="button"
						class="toggle-auth-mode"
						onclick={() => (activeAuthView = 'initial')}>Back to options</button
					>
				{:else if activeAuthView === 'securityKey'}
					<input type="email" placeholder="Email (required for Security Key)" bind:value={email} />
					<button
						type="button"
						class="oauth-button"
						onclick={isLoginView ? signInWithSecurityKey : signUpWithSecurityKey}
						>{isLoginView ? 'Sign In' : 'Sign Up'} with Security Key</button
					>
					<button
						type="button"
						class="toggle-auth-mode"
						onclick={() => (activeAuthView = 'initial')}>Back to options</button
					>
				{/if}

				{#if authError}
					<p class="auth-error" aria-live="polite">{authError}</p>
				{/if}
				{#if magicLinkSent}
					<p class="auth-success" aria-live="polite">Magic link sent. Check your email.</p>
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
	.main-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		/* margin-bottom: 2rem; */
		background: var(--color-surface);
		color: var(--color-text-primary);
		border-radius: var(--border-radius-sm);
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
	.logout-button {
		padding: 0.75rem;
		border: none;
		background: var(--color-cta);
		color: var(--color-surface);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: background-color var(--transition-speed) ease;
	}
	.logout-button:hover {
		background: var(--color-primary);
	}

	.landing-hero {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 4rem 2rem;
		background: linear-gradient(135deg,
			var(--color-surface) 0%,
			color-mix(in srgb, var(--color-primary) 8%, var(--color-surface)) 35%,
			color-mix(in srgb, var(--color-accent) 6%, var(--color-surface)) 100%
		);
		position: relative;
		overflow: hidden;
	}

	.landing-hero::before {
		content: '';
		position: absolute;
		top: -50%;
		left: -50%;
		width: 200%;
		height: 200%;
		background: radial-gradient(
			circle at 30% 20%,
			color-mix(in srgb, var(--color-primary) 12%, transparent) 0%,
			transparent 50%
		),
		radial-gradient(
			circle at 70% 80%,
			color-mix(in srgb, var(--color-accent) 8%, transparent) 0%,
			transparent 50%
		);
		z-index: -1;
		animation: float 20s ease-in-out infinite;
	}

	@keyframes float {
		0%, 100% { transform: translate(0, 0) rotate(0deg); }
		33% { transform: translate(-2%, -1%) rotate(1deg); }
		66% { transform: translate(1%, -2%) rotate(-1deg); }
	}

	.hero-logo {
		margin-bottom: 0rem;
		position: relative;
		z-index: 1;
		animation: logoFloat 6s ease-in-out infinite;
	}

	.logo-image {
		width: clamp(120px, 20vw, 200px);
		height: auto;
		filter: drop-shadow(0 10px 30px color-mix(in srgb, var(--color-primary) 20%, transparent));
		transition: all 0.3s ease;
	}

	.logo-image:hover {
		transform: scale(1.05);
		filter: drop-shadow(0 15px 40px color-mix(in srgb, var(--color-primary) 30%, transparent));
	}

	@keyframes logoFloat {
		0%, 100% {
			transform: translateY(0px);
		}
		50% {
			transform: translateY(-10px);
		}
	}
	.landing-featured {
		max-width: 1200px;
		margin: 4rem auto 0;
		padding: 0 2rem;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(20px);
		border-radius: 30px;
		border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
	}

	.showcase {
		max-width: 1200px;
		margin: 4rem auto 0;
		padding: 3rem 2rem;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(20px);
		border-radius: 30px;
		border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
	}
	.showcase-heading {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.showcase-heading h2 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 2.5rem);
		font-weight: 800;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		letter-spacing: -0.01em;
	}
	.showcase-heading p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 1.125rem;
		line-height: 1.6;
	}
	.showcase-status {
		color: var(--color-text-secondary);
		font-size: 0.95rem;
	}
	.showcase-status.error {
		color: #f87171;
	}
	.landing-hero h1 {
		font-size: clamp(3rem, 8vw, 7rem);
		font-weight: 900;
		margin-bottom: 1.5rem;
		background: linear-gradient(135deg,
			var(--color-text-primary),
			var(--color-primary),
			var(--color-accent)
		);
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		line-height: 1.1;
		letter-spacing: -0.02em;
		text-align: center;
		position: relative;
	}

	.landing-hero h1::after {
		content: '';
		position: absolute;
		bottom: -10px;
		left: 50%;
		transform: translateX(-50%);
		width: 60px;
		height: 4px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 2px;
	}
	.landing-hero p {
		max-width: 700px;
		margin: 0 auto 3rem auto;
		font-size: clamp(1.125rem, 2.5vw, 1.375rem);
		color: var(--color-text-secondary);
		line-height: 1.6;
		text-align: center;
		font-weight: 400;
	}
	.features-list {
		list-style: none;
		margin: 3rem 0 4rem;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 2rem;
		max-width: 1200px;
		width: 100%;
	}

	.features-list li {
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px) saturate(1.2);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		padding: 2rem;
		border-radius: 20px;
		text-align: left;
		font-size: 1rem;
		color: var(--color-text-primary);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
		overflow: hidden;
	}

	.features-list li::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 20px 20px 0 0;
	}

	.features-list li:hover {
		transform: translateY(-8px);
		box-shadow: 0 20px 40px color-mix(in srgb, var(--color-primary) 20%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.features-list strong {
		color: var(--color-text-primary);
		font-weight: 700;
		font-size: 1.25rem;
		display: block;
		margin-bottom: 0.75rem;
		font-family: var(--font-family-display);
	}

	.features-list hr {
		display: none;
	}

	.features-list div {
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	.cta-button {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: var(--color-surface);
		padding: 1rem 3rem;
		font-size: 1.125rem;
		font-weight: 600;
		border: none;
		border-radius: 50px;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		margin-top: 2rem;
		position: relative;
		overflow: hidden;
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 30%, transparent);
		font-family: var(--font-family-display);
		letter-spacing: 0.025em;
	}

	.cta-button::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
		transition: left 0.5s;
	}

	.cta-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 20px 40px color-mix(in srgb, var(--color-primary) 40%, transparent);
		filter: brightness(1.1);
	}

	.cta-button:hover::before {
		left: 100%;
	}

	.cta-button:active {
		transform: translateY(0);
	}

	.login-page-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg,
			color-mix(in srgb, var(--color-surface) 40%, transparent) 0%,
			color-mix(in srgb, var(--color-primary) 8%, transparent) 50%,
			color-mix(in srgb, var(--color-accent) 6%, transparent) 100%
		);
		backdrop-filter: blur(20px) saturate(1.2);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	.login-container {
		position: relative;
		margin: 0;
		max-width: 480px;
		width: 100%;
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		backdrop-filter: blur(30px) saturate(1.3);
		border: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
		padding: 3rem;
		border-radius: 30px;
		box-shadow:
			0 20px 60px color-mix(in srgb, var(--color-primary) 15%, transparent),
			0 8px 32px color-mix(in srgb, var(--color-surface) 20%, transparent);
		color: var(--color-text-primary);
		display: flex;
		flex-direction: column;
		animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
	#auth-dialog-title {
		text-align: center;
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		font-weight: 900;
		color: var(--color-text-primary);
		margin-bottom: 2rem;
		font-family: var(--font-family-display);
		letter-spacing: -0.02em;
		position: relative;
	}

	#auth-dialog-title::after {
		content: '';
		position: absolute;
		bottom: -10px;
		left: 50%;
		transform: translateX(-50%);
		width: 40px;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 2px;
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
	.auth-method-buttons button,
	.auth-method-buttons .oauth-button,
	.oauth-buttons .oauth-button {
		margin-bottom: 0;
	}
	.toggle-auth-mode {
		background: none;
		border: none;
		color: var(--color-primary);
		cursor: pointer;
		padding: 1rem 0;
		margin-top: 1.5rem;
		text-decoration: none;
		text-align: center;
		width: 100%;
		font-weight: 500;
		transition: all 0.2s ease;
		border-radius: 12px;
	}
	.toggle-auth-mode:hover {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.auth-primary-action {
		width: 100%;
		padding: 1rem 2rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: var(--color-surface);
		border: none;
		border-radius: 16px;
		font-size: 1rem;
		font-weight: 600;
		font-family: var(--font-family-display);
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 8px 20px color-mix(in srgb, var(--color-primary) 25%, transparent);
		position: relative;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.auth-primary-action::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
		transition: left 0.5s;
	}

	.auth-primary-action:hover {
		transform: translateY(-2px);
		box-shadow: 0 12px 30px color-mix(in srgb, var(--color-primary) 35%, transparent);
		filter: brightness(1.05);
	}

	.auth-primary-action:hover::before {
		left: 100%;
	}

	.auth-primary-action:active {
		transform: translateY(0);
	}
	.close-auth-overlay {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 40px;
		height: 40px;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 12px;
		font-size: 1.5rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}
	.close-auth-overlay:hover {
		color: var(--color-text-primary);
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 10%, transparent);
	}
	.oauth-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-radius: 16px;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		font-weight: 500;
		position: relative;
		overflow: hidden;
	}

	.oauth-button::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
		transition: left 0.5s;
	}
	.oauth-button:hover {
		background: color-mix(in srgb, var(--color-surface) 70%, transparent);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 12%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.oauth-button:hover::before {
		left: 100%;
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
	.auth-error {
		color: #ef4444;
		margin-top: 0.75rem;
		font-size: 0.875rem;
	}
	.auth-success {
		color: #16a34a;
		margin-top: 0.75rem;
		font-size: 0.875rem;
	}
	.oauth-button[disabled] {
		opacity: 0.6;
		cursor: default;
	}

	.public-resources {
		margin: 4rem auto 0;
		max-width: 1200px;
		width: 90%;
		text-align: left;
		padding: 3rem 2rem;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(20px);
		border-radius: 30px;
		border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
	}
	.public-resources-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.public-resources-list li {
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		padding: 1.5rem;
		border-radius: 16px;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		transition: all 0.2s ease;
	}

	.public-resources-list li:hover {
		background: color-mix(in srgb, var(--color-surface) 70%, transparent);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.public-resources-list a {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 1rem;
		font-weight: 500;
		display: block;
	}

	.public-resources-list a:hover {
		color: var(--color-accent);
	}
	/* Add bottom spacing to the hero */
	.landing-hero {
		margin-bottom: 4rem;
	}

	@media (max-width: 768px) {
		.landing-hero {
			padding: 2rem 1rem;
			min-height: 90vh;
		}

		.features-list {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.features-list li {
			padding: 1.5rem;
		}

		.landing-featured,
		.showcase,
		.public-resources {
			margin: 2rem auto 0;
			padding: 2rem 1rem;
		}
	}
</style>
