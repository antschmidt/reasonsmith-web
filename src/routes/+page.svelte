<svelte:options runes={true} />
<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { nhost } from '$lib/nhostClient';
	import Dashboard from '$lib/components/Dashboard.svelte';
 	import TopPostsCarousel from '$lib/components/TopPostsCarousel.svelte';
	import { GET_PUBLIC_SHOWCASE_PUBLISHED } from '$lib/graphql/queries';
	import { theme, toggleTheme } from '$lib/themeStore';
	import { env as publicEnv } from '$env/dynamic/public';

	const SITE_URL = publicEnv.PUBLIC_SITE_URL;

	function getRedirect() {
		if (SITE_URL) return SITE_URL.replace(/\/$/, '') + '/auth/callback';
		if (typeof window !== 'undefined') return window.location.origin + '/auth/callback';
		return undefined;
	}

	const isOpen = writable(false);
	function toggle() { isOpen.update((v: boolean) => !v); }
	function close() { isOpen.set(false); }

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

	let showcaseLoading = $state(true);
	let showcaseError = $state<string | null>(null);
	let showcaseItems = $state<PublicShowcaseItem[]>([]);

	async function loadShowcaseItems() {
		showcaseLoading = true;
		showcaseError = null;
		try {
			const { data, error: gqlError } = await nhost.graphql.request(GET_PUBLIC_SHOWCASE_PUBLISHED);
			if (gqlError) throw (Array.isArray(gqlError) ? new Error(gqlError.map((e:any)=>e.message).join('; ')) : gqlError);
			showcaseItems = (data as any)?.public_showcase_item ?? [];
		} catch (err: any) {
			showcaseError = err?.message ?? 'Failed to load featured analyses.';
		} finally {
			showcaseLoading = false;
		}
	}

	function formatShowcaseText(value?: string | null) {
		if (!value) return '';
		const escaped = value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
		return escaped.replace(/(?:\r\n|\r|\n)/g, '<br />');
	}

	onMount(() => {
		const unsubTheme = theme.subscribe(v => themeValue = v || 'light');
		nhost.auth.onAuthStateChanged((_event: string) => { user = nhost.auth.getUser(); });
		loadShowcaseItems();
		return () => { unsubTheme(); };
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
		if (typeof toLogin === 'boolean') isLoginView = toLogin; else isLoginView = !isLoginView;
		activeAuthView = 'initial';
		authError = null;
		magicLinkSent = false;
	}

	async function logout() { await nhost.auth.signOut(); user = null; }
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
		try { await nhost.auth.signIn({ email, password }); } catch (e: any) { authError = e.message; }
	}
	async function signup() {
		authError = null;
		try { await nhost.auth.signUp({ email, password }); } catch (e: any) { authError = e.message; }
	}
	async function sendMagicLink() {
		authError = null; magicLinkSent = false;
		if (!email) { authError = 'Please enter an email first.'; return; }
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
	async function signInWithSecurityKey() { alert('Security key sign-in not yet implemented.'); }
	async function signUpWithSecurityKey() { alert('Security key sign-up not yet implemented.'); }
</script>

{#if user}
	<nav class="main-nav">
		<button type="button" onclick={toggleTheme} aria-label="Toggle theme" class="theme-toggle">
			{themeValue === 'light' ? '🌙' : '☀️'}
		</button>
		<div class="user-email">{user.email}</div>
		<button type="button" onclick={logout} class="logout-button">Logout</button>
	</nav>
	<Dashboard user={user} />
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
				<h2 id="showcase-title">Featured Analyses</h2>
				<p>Hand-curated evaluations of notable speeches, podcasts, and essays.</p>
			</div>
			{#if showcaseLoading}
				<p class="showcase-status">Loading featured analyses…</p>
			{:else if showcaseError}
				<p class="showcase-status error">{showcaseError}</p>
			{:else if showcaseItems.length === 0}
				<p class="showcase-status">Curated analyses will appear here soon.</p>
			{:else}
				<ul class="showcase-list">
					{#each showcaseItems as item}
						<li>
							<h3>{item.title}</h3>
							{#if item.subtitle}
								<p class="showcase-subtitle">{@html formatShowcaseText(item.subtitle)}</p>
							{/if}
							<div class="showcase-meta">
								{#if item.media_type}<span>{item.media_type}</span>{/if}
								{#if item.creator}<span>{item.creator}</span>{/if}
								<span>{new Date(item.created_at).toLocaleDateString()}</span>
							</div>
							{#if item.summary}
								<p class="showcase-summary">{@html formatShowcaseText(item.summary)}</p>
							{/if}
							{#if item.analysis}
								<p class="showcase-analysis">{@html formatShowcaseText(item.analysis)}</p>
							{/if}
							{#if item.source_url}
								<a class="showcase-link" href={item.source_url} target="_blank" rel="noopener">
									Original source ↗
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<div class="public-resources" aria-labelledby="public-resources-title">
			<h2 id="public-resources-title" class="public-resources-title">Learn More</h2>
			<ul class="public-resources-list">
				<li><a href="/resources/good-faith-arguments">Good-Faith Arguments Guide</a></li>
				<li><a href="/resources/citation-best-practices">Citation Best Practices</a></li>
				<li><a href="/resources/community-guidelines">Community Guidelines</a></li>
			</ul>
		</div>
	</div>

	{#if showAuthOverlay}
		<div class="login-page-wrapper" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
			<div class="login-container">
				<button class="close-auth-overlay" type="button" onclick={() => (showAuthOverlay = false)} aria-label="Close authentication panel">&times;</button>
				<h2 id="auth-dialog-title">{isLoginView ? 'Login' : 'Sign Up'}</h2>

				{#if activeAuthView === 'initial'}
					<div class="auth-method-buttons">
						<button type="button" onclick={() => (activeAuthView = 'emailPassword')}>Continue with Email/Password</button>
						<button type="button" class="oauth-button" onclick={() => (activeAuthView = 'magicLink')}>{isLoginView ? 'Use Magic Link to Sign In' : 'Use Magic Link to Sign Up'}</button>
						<button type="button" class="oauth-button" onclick={() => (activeAuthView = 'securityKey')}>{isLoginView ? 'Sign In' : 'Sign Up'} with Security Key</button>
					</div>

					<div class="oauth-buttons">
						<button type="button" class="oauth-button" onclick={signInWithGoogle} aria-label="Sign in with Google"><span>Sign in with Google</span></button>
						<button type="button" class="oauth-button" onclick={signInWithGitHub} aria-label="Sign in with GitHub"><span>Sign in with GitHub</span></button>
					</div>
					<button type="button" class="toggle-auth-mode" onclick={() => toggleAuthModeView(!isLoginView)}>{isLoginView ? "Don't have an account? Sign up" : 'Already have an account? Log in'}</button>
				{:else if activeAuthView === 'emailPassword'}
					<input type="email" placeholder="Email" bind:value={email} />
					<input type="password" placeholder="Password" bind:value={password} />
					<button type="button" class="auth-primary-action" onclick={isLoginView ? login : signup}>{isLoginView ? 'Login' : 'Sign Up'}</button>
					<button type="button" class="toggle-auth-mode" onclick={() => (activeAuthView = 'initial')}>Back to options</button>
				{:else if activeAuthView === 'magicLink'}
					<input type="email" placeholder="Email" bind:value={email} />
					<button type="button" class="oauth-button" onclick={sendMagicLink} disabled={magicLinkSent}>{magicLinkSent ? 'Magic Link Sent' : 'Send Magic Link'}</button>
					<button type="button" class="toggle-auth-mode" onclick={() => (activeAuthView = 'initial')}>Back to options</button>
				{:else if activeAuthView === 'securityKey'}
					<input type="email" placeholder="Email (required for Security Key)" bind:value={email} />
					<button type="button" class="oauth-button" onclick={isLoginView ? signInWithSecurityKey : signUpWithSecurityKey}>{isLoginView ? 'Sign In' : 'Sign Up'} with Security Key</button>
					<button type="button" class="toggle-auth-mode" onclick={() => (activeAuthView = 'initial')}>Back to options</button>
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
		text-align: center;
		padding: 2rem;
		background: var(--color-surface);
		color: var(--color-text-primary);
	}
.landing-featured { max-width: 900px; margin: 1rem auto 0; padding: 0 1rem; }

.showcase { max-width: 900px; margin: 2rem auto 0; padding: 0 1rem 2rem; }
.showcase-heading { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.showcase-heading h2 { margin: 0; font-size: 1.5rem; }
.showcase-heading p { margin: 0; color: var(--color-text-secondary); }
.showcase-status { color: var(--color-text-secondary); font-size: 0.95rem; }
.showcase-status.error { color: #f87171; }
.showcase-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; }
.showcase-list li { border: 1px solid var(--color-border); border-radius: var(--border-radius-md); padding: 1rem; background: var(--color-surface); box-shadow: 0 6px 18px color-mix(in srgb, var(--color-border) 18%, transparent); }
.showcase-list h3 { margin: 0 0 0.35rem; font-size: 1.15rem; }
.showcase-subtitle { margin: 0 0 0.5rem; color: var(--color-text-secondary); }
.showcase-meta { display: flex; gap: 0.75rem; flex-wrap: wrap; font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 0.65rem; }
.showcase-summary { margin: 0 0 0.5rem; font-weight: 500; }
.showcase-analysis { margin: 0 0 0.75rem; }
.showcase-link { color: var(--color-primary); font-weight: 600; text-decoration: none; }
.showcase-link:hover { text-decoration: underline; }
	.landing-hero h1 {
		font-size: 2rem;
		margin-bottom: 1rem;
	}
	.landing-hero p {
		max-width: 600px;
		margin: 0 auto 1.5rem auto;
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

	.login-page-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		padding: 1rem;
	}
	.login-container {
		position: relative;
		margin: 0;
		max-width: 420px;
		width: 100%;
		background-color: var(--color-surface);
		padding: 2.5rem;
		border-radius: var(--border-radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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
		color: var(--color-accent);
		cursor: pointer;
		padding: 0.5rem 0;
		margin-top: 1.5rem;
		text-decoration: underline;
		text-align: center;
		width: 100%;
	}
	.toggle-auth-mode:hover {
		color: var(--color-primary);
	}
	.close-auth-overlay {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		background: transparent;
		border: none;
		font-size: 1.75rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.5rem;
		line-height: 1;
	}
	.close-auth-overlay:hover {
		color: var(--color-text-primary);
	}
	.oauth-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: background-color var(--transition-speed) ease;
		border: 1px solid var(--color-border);
		background-color: var(--color-surface);
		color: var(--color-text-primary);
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
	.auth-error { color: #ef4444; margin-top: 0.75rem; font-size: 0.875rem; }
	.auth-success { color: #16a34a; margin-top: 0.75rem; font-size: 0.875rem; }
	.oauth-button[disabled] { opacity: 0.6; cursor: default; }

	.public-resources { margin:2.5rem auto 0; max-width:800px; text-align:left; }
	.public-resources-title { font-size:1.25rem; font-weight:600; margin:0 0 0.75rem; font-family: var(--font-family-display); }
	.public-resources-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.5rem; }
	.public-resources-list a { color: var(--color-primary); text-decoration:none; font-size:0.95rem; }
	.public-resources-list a:hover { text-decoration:underline; }
	@media (min-width:640px){ .public-resources-list { flex-direction:row; flex-wrap:wrap; gap:0.75rem 1.5rem; } }
</style>
