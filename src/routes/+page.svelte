<svelte:options runes={true} />

<script lang="ts">
	import { onMount } from 'svelte';
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
	<div class="landing-shell">
		<section class="landing-hero hero-grid">
			<div class="hero-primary">
				<p class="editorial-masthead">ReasonSmith Journal</p>
				<h1>Argue with structure. Publish with confidence.</h1>
				<p class="editorial-lede hero-lede">
					ReasonSmith is a writing desk for public argument: layered citations, transparent
					revisions, and good-faith scoring that keeps debate sharp yet civil.
				</p>
				<div class="hero-actions">
					<button
						class="cta-button"
						type="button"
						onclick={() => {
							showAuthOverlay = true;
							toggleAuthModeView(true);
						}}
					>
						Begin Writing
					</button>
					<a class="secondary-cta" href="/discussions">Browse Discussions</a>
				</div>
				<ul class="hero-pillars">
					<li>Structured claims &amp; citations</li>
					<li>Editorial moderation with AI scoring</li>
					<li>Collaborative revisions and published versions</li>
				</ul>
			</div>
			<aside class="hero-spotlight" aria-label="Featured discussions">
				<div class="spotlight-header">
					<span class="editorial-kicker">Spotlight</span>
					<h2>Editors' desk picks</h2>
				</div>
				<TopPostsCarousel />
			</aside>
		</section>

		<section class="landing-features">
			<div class="section-heading">
				<span class="editorial-kicker">Why ReasonSmith</span>
				<h2>Magazine discipline for modern discourse.</h2>
			</div>
			<div class="feature-columns">
				<article>
					<h3>Editorial workflow</h3>
					<p>
						Draft, revise, and publish with version control that mirrors a newsroom bullpen. Every
						change is tracked, every claim can be annotated.
					</p>
				</article>
				<article>
					<h3>Good-faith guardrails</h3>
					<p>
						AI-assisted scoring spots fallacies, hostile tone, and citation gaps so moderators can
						focus on judgment rather than triage.
					</p>
				</article>
				<article>
					<h3>Public conversation</h3>
					<p>
						Discussions feel like well-produced features—complete with context, sources, and a
						readable archive for readers who arrive later.
					</p>
				</article>
			</div>
		</section>

		<section class="landing-showcase">
			<div class="section-heading">
				<span class="editorial-kicker">Curated Analyses</span>
				<h2>Handpicked rhetoric worth studying.</h2>
				<p class="section-lede">
					Briefings on speeches, podcasts, and essays our editors dissect for sourcing discipline
					and reasoning craft.
				</p>
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

		<section class="resources-section">
			<div class="resources-card">
				<h3>Resources for disciplined debate</h3>
				<p>
					Our primers keep the community aligned on method: how to cite, how to disagree, how to
					spot bad reasoning.
				</p>
				<nav class="resource-links">
					<a href="/resources/good-faith-arguments">Good-Faith Arguments Guide</a>
					<a href="/resources/citation-best-practices">Citation Best Practices</a>
					<a href="/resources/community-guidelines">Community Guidelines</a>
				</nav>
			</div>
		</section>
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

	.landing-shell {
		background: var(--color-surface-alt);
	}

	.landing-hero {
		position: relative;
		padding: clamp(3rem, 6vw, 5rem) clamp(1.5rem, 6vw, 5rem);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-surface) 85%, var(--color-primary) 15%),
			color-mix(in srgb, var(--color-surface-alt) 80%, var(--color-accent) 12%)
		);
		border-bottom: 1px solid var(--color-border);
	}

	.landing-hero::before {
		content: '';
		position: absolute;
		top: 12%;
		left: -8%;
		width: clamp(180px, 22vw, 280px);
		height: clamp(180px, 22vw, 280px);
		background: radial-gradient(
			circle,
			color-mix(in srgb, var(--color-primary) 20%, transparent),
			transparent 70%
		);
		opacity: 0.4;
		filter: blur(18px);
	}

	.hero-grid {
		display: grid;
		gap: clamp(2.5rem, 5vw, 4rem);
		position: relative;
		z-index: 1;
	}

	@media (min-width: 980px) {
		.hero-grid {
			grid-template-columns: minmax(0, 1.15fr) minmax(320px, 1fr);
		}
	}

	.hero-primary h1 {
		font-family: var(--font-family-display);
		font-size: clamp(2.5rem, 5vw, 3.5rem);
		line-height: 1.05;
		margin: 0 0 1.5rem;
		color: var(--color-text-primary);
		letter-spacing: -0.015em;
	}

	.hero-lede {
		margin-bottom: clamp(2rem, 5vw, 2.5rem);
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.secondary-cta {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.85rem 1.5rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
		text-decoration: none;
		font-weight: 600;
		color: var(--color-text-primary);
		transition: all 0.25s ease;
	}

	.secondary-cta:hover,
	.secondary-cta:focus {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.hero-pillars {
		padding: 0;
		margin: 1rem 0 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		color: var(--color-text-secondary);
		font-size: 0.95rem;
	}

	.hero-pillars li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.hero-pillars li::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--color-primary);
		flex-shrink: 0;
	}

	.hero-spotlight {
		background: color-mix(in srgb, var(--color-surface) 85%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: 24px;
		padding: clamp(1.5rem, 4vw, 2.5rem);
		box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.spotlight-header h2 {
		margin: 0;
		font-size: clamp(1.35rem, 3vw, 1.75rem);
		font-family: var(--font-family-display);
	}

	.landing-features {
		padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 6vw, 5rem);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.section-heading {
		max-width: 720px;
		margin: 0 auto clamp(2rem, 5vw, 3rem);
		text-align: center;
	}

	.section-heading h2 {
		margin: 0;
		font-family: var(--font-family-display);
		font-size: clamp(1.8rem, 4vw, 2.5rem);
		letter-spacing: -0.01em;
	}

	.feature-columns {
		display: grid;
		gap: clamp(1.5rem, 4vw, 2.5rem);
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		max-width: 1024px;
		margin: 0 auto;
	}

	.feature-columns article {
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: 18px;
		padding: clamp(1.5rem, 4vw, 2.5rem);
		box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
	}

	.feature-columns h3 {
		margin: 0 0 0.75rem;
		font-family: var(--font-family-display);
		font-size: 1.25rem;
	}

	.feature-columns p {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
	}

	.landing-showcase {
		padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 6vw, 5rem);
		background: var(--color-surface-alt);
		border-bottom: 1px solid var(--color-border);
	}

	.section-lede {
		max-width: 620px;
		margin: 1rem auto 0;
		color: var(--color-text-secondary);
		line-height: var(--line-height-relaxed);
		text-align: center;
	}

	.resources-section {
		padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 6vw, 5rem);
		background: var(--color-surface);
	}

	.resources-card {
		max-width: 880px;
		margin: 0 auto;
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: 24px;
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
		border-radius: 999px;
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

	/* Responsive Design */
	@media (max-width: 900px) {
		.hero-grid {
			grid-template-columns: 1fr;
		}
		.hero-spotlight {
			order: -1;
		}
	}

	@media (max-width: 640px) {
		.landing-hero {
			padding: 3.5rem 1.25rem;
		}
		.hero-primary h1 {
			font-size: clamp(2.1rem, 8vw, 2.6rem);
		}
		.hero-pillars {
			font-size: 0.9rem;
		}
		.feature-columns {
			grid-template-columns: 1fr;
		}
		.resources-card {
			padding: clamp(1.5rem, 6vw, 2.25rem);
		}
	}
	.showcase-status {
		color: var(--color-text-secondary);
		font-size: 0.95rem;
	}
	.showcase-status.error {
		color: #f87171;
	}
	.cta-button {
		background: var(--color-primary);
		color: var(--color-surface);
		padding: 1rem 2.5rem;
		font-size: 1rem;
		font-weight: 600;
		border: none;
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		font-family: var(--font-family-ui);
		letter-spacing: 0.025em;
	}

	.cta-button:hover {
		background: var(--color-accent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.login-page-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(10px);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.login-container {
		position: relative;
		margin: 0;
		max-width: 420px;
		width: 100%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		padding: 3rem 2.5rem;
		border-radius: var(--border-radius-md);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
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

	/* Add bottom spacing to the hero */
	.landing-hero {
		margin-bottom: 4rem;
	}

	@media (max-width: 768px) {
		.landing-hero {
			padding: 2rem 1rem;
			min-height: 90vh;
		}

		.landing-featured,
		.showcase {
			margin: 2rem auto 0;
			padding: 2rem 1rem;
		}
	}
</style>
