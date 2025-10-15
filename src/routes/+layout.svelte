<script lang="ts">
	import '../app.css';
	import { nhost } from '$lib/nhostClient';
	import { hasAdminAccess as hasAdminAccessUtil } from '$lib/permissions';
	import { theme, toggleTheme } from '$lib/themeStore';
	import { dev } from '$app/environment';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { page } from '$app/stores';
	import InstallPrompt from '$lib/components/ui/InstallPrompt.svelte';

	injectAnalytics({ mode: dev ? 'development' : 'production' });
	let user = nhost.auth.getUser();
	let hasAdminAccess = false;
	let contributor: {
		role: string;
		avatar_url?: string;
		display_name?: string;
		handle?: string;
	} | null = null;

	function collectRoles(u: any): string[] {
		if (!u) return [];
		const roles = new Set<string>();
		if (Array.isArray(u?.roles)) u.roles.forEach((r: any) => typeof r === 'string' && roles.add(r));
		const defaultRole = u?.defaultRole ?? u?.default_role;
		if (typeof defaultRole === 'string') roles.add(defaultRole);
		if (Array.isArray(u?.metadata?.roles))
			u.metadata.roles.forEach((r: any) => typeof r === 'string' && roles.add(r));
		if (Array.isArray(u?.app_metadata?.roles))
			u.app_metadata.roles.forEach((r: any) => typeof r === 'string' && roles.add(r));
		if (typeof u?.role === 'string') roles.add(u.role);
		return Array.from(roles);
	}

	function getNavInitials(name: string | undefined): string {
		if (!name) return '?';
		return name
			.trim()
			.split(' ')
			.map((n: string) => n[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	async function checkAdminAccess() {
		if (!user) {
			hasAdminAccess = false;
			contributor = null;
			return;
		}

		// Check if session is valid
		const session = nhost.getUserSession();
		if (!session || !session.user) {
			hasAdminAccess = false;
			contributor = null;
			return;
		}

		try {
			// Wait for authentication to be ready (allows token refresh)
			await nhost.auth.isAuthenticatedAsync();

			const result = await nhost.graphql.request(
				`
				query GetCurrentUserRole($userId: uuid!) {
					contributor_by_pk(id: $userId) {
						role
						avatar_url
						display_name
						handle
					}
				}
			`,
				{ userId: user.id }
			);

			// Check for JWT errors
			if (result.error) {
				const errorMsg = Array.isArray(result.error)
					? result.error[0]?.message || ''
					: result.error.message || '';

				if (errorMsg.includes('JWT') || errorMsg.includes('JWTExpired')) {
					console.log('JWT expired in checkAdminAccess, will retry on next auth cycle');
					return;
				}
			}

			const contributorData = result.data?.contributor_by_pk;
			if (contributorData) {
				contributor = contributorData;
				hasAdminAccess = hasAdminAccessUtil(contributorData);
			} else {
				contributor = null;
				hasAdminAccess = false;
			}
		} catch (err: any) {
			// Check if it's a JWT error
			const errorMsg = err?.message || String(err);
			if (errorMsg.includes('JWT') || errorMsg.includes('JWTExpired')) {
				console.log('JWT expired in checkAdminAccess catch, will retry on next auth cycle');
				return;
			}

			console.error('Failed to get user role:', err);
			hasAdminAccess = false;
			contributor = null;
		}
	}

	function refreshUser() {
		user = nhost.auth.getUser();
		if (user) {
			checkAdminAccess();
		} else {
			hasAdminAccess = false;
		}
	}

	refreshUser();
	if (typeof window !== 'undefined') {
		nhost.auth.onAuthStateChanged(() => {
			refreshUser();
		});
	}

	// Initialize theme immediately on page load
	let currentTheme: string = 'dark';
	theme.subscribe((value) => {
		currentTheme = value;
		if (typeof window !== 'undefined') {
			document.documentElement.setAttribute('data-theme', value || 'dark');
		}
	});

	// Logout function
	async function logout() {
		await nhost.auth.signOut();
		window.location.href = '/';
	}

	// Check if we're on the profile page
	$: isProfilePage = $page.url.pathname === '/profile';
	// Check if we're on the login page
	$: isLoginPage = $page.url.pathname === '/login';
</script>

{#if user}
	<nav class="top-nav" aria-label="Main navigation">
		<a href="/" class="brand" aria-label="Go to Dashboard">
			<span class="brand-icon">
				<img src="/logo-only.png" alt="ReasonSmith Home" />
			</span>
			<span class="sr-only">Dashboard</span>
		</a>
		<a href="/discussions" class="nav-icon" aria-label="Browse all discussions">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
				><path
					d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l4.25 4.25c.41.41 1.07.41 1.48 0s.41-1.07 0-1.48L15.5 14Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14Z"
				/></svg
			>
		</a>
		<div class="nav-spacer">
			{#if isProfilePage}
				<div class="profile-nav-controls">
					<button
						type="button"
						onclick={toggleTheme}
						aria-label="Toggle theme"
						class="theme-toggle"
					>
						{currentTheme === 'light' ? '🌙' : '☀️'}
					</button>
					<span class="user-email-nav">{user.email}</span>
					<button type="button" onclick={logout} class="logout-button-nav">Logout</button>
				</div>
			{/if}
		</div>
		<div class="nav-actions" role="group" aria-label="Primary actions">
			{#if hasAdminAccess}
				<a href="/admin" class="nav-icon" aria-label="User management">
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zM4 18v-1c0-2.66 5.33-4 8-4s8 1.34 8 4v1H4zM12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"
						/>
					</svg>
				</a>
				<a href="/public" class="nav-icon" aria-label="Manage public showcase">
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d="M6 2a2 2 0 0 0-2 2v16l8-4 8 4V4a2 2 0 0 0-2-2H6Zm0 2h12v13.17l-6-3-6 3V4Z" />
					</svg>
				</a>
			{/if}
			<a href="/profile" class="nav-profile" aria-label="Profile">
				{#if contributor?.avatar_url}
					<img
						src={contributor.avatar_url}
						alt="{contributor.display_name || 'Your'} profile photo"
						class="nav-avatar"
					/>
				{:else}
					<div class="nav-avatar-placeholder">
						<span class="nav-initials"
							>{getNavInitials(contributor?.display_name || user?.email)}</span
						>
					</div>
				{/if}
			</a>
		</div>
	</nav>
{:else if $page.url.pathname !== '/'}
	<nav class="top-nav" aria-label="Main navigation">
		<a href="/" class="brand" aria-label="Go to Home">
			<span class="brand-icon">
				<img src="/logo-only.png" alt="ReasonSmith Home" />
			</span>
			<span class="sr-only">Home</span>
		</a>
		<div class="nav-spacer"></div>
		{#if !isLoginPage}
			<div class="nav-actions">
				<a href="/login" class="login-button">Login</a>
			</div>
		{/if}
	</nav>
{/if}

<div class="app-shell">
	<slot />
</div>

<InstallPrompt />

<style>
	.top-nav {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 2rem;
		background: #fafafa; /* Solid background for light mode */
		border-bottom: 1px solid var(--color-border);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
		backdrop-filter: blur(10px);
	}

	@media (max-width: 768px) {
		.top-nav {
			padding: 0.75rem 1rem;
		}
	}
	:global([data-theme='dark']) .top-nav {
		background: #1a1a1a; /* Solid background for dark mode */
		border-bottom-color: var(--color-border);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
		color: var(--color-text-primary);
	}
	.brand-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0.25rem;
		border-radius: var(--border-radius-sm);
		background: transparent;
		border: 0px solid var(--color-border);
		transition: all var(--transition-speed) ease;
	}
	:global([data-theme='dark']) .brand-icon {
		background: transparent;
		border-color: var(--color-border);
	}

	.brand-icon img {
		width: 100%;
		height: 100%;
		padding: 0.5rem;
		display: block;
		object-fit: contain;
		filter: brightness(1.05) saturate(1.15);
	}
	.brand:focus .brand-icon,
	.brand:hover .brand-icon {
		border-color: var(--color-primary);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
	}
	@media (max-width: 560px) {
		.brand-icon {
			padding: 0.5rem;
			width: 42px;
			height: 42px;
		}
	}
	.nav-spacer {
		margin-left: auto;
		display: flex;
		align-items: center;
		width: 100%;
	}
	.profile-nav-controls {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.theme-toggle {
		background: transparent;
		font-size: 1.5rem;
		cursor: pointer;
		border: 0;
		padding: 0.5rem;
		color: var(--color-text-primary);
		border-radius: var(--border-radius-sm);
		transition: background var(--transition-speed) ease;
	}
	.theme-toggle:hover {
		background: var(--color-surface);
	}
	.user-email-nav {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		padding: 0 0.5rem;
	}

	@media (max-width: 768px) {
		.user-email-nav {
			display: none;
		}
	}

	.logout-button-nav {
		padding: 0.5rem 1rem;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		font-size: 0.9rem;
	}
	.logout-button-nav:hover {
		background: rgba(0, 0, 0, 0.05);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}
	.nav-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}
	.nav-icon {
		--_size: 42px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--_size);
		height: var(--_size);
		border-radius: var(--border-radius-sm);
		background: transparent;
		border: 0px solid var(--color-border);
		text-decoration: none;
		transition: all var(--transition-speed) ease;
		color: var(--color-text-secondary);
	}
	.nav-icon svg {
		width: 24px;
		height: 24px;
		fill: currentColor;
		opacity: 0.92;
	}
	.nav-icon:hover,
	.nav-icon:focus {
		color: var(--color-primary);
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
		outline: none;
	}
	@media (max-width: 560px) {
		.nav-icon {
			--_size: 40px;
		}
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.app-shell {
		min-height: 100dvh;
	}

	/* Navigation Profile Avatar */
	.nav-profile {
		--_size: 42px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--_size);
		height: var(--_size);
		border-radius: 50%;
		background: var(--color-surface);
		border: 2px solid var(--color-border);
		text-decoration: none;
		transition: all var(--transition-speed) ease;
		overflow: hidden;
	}

	.nav-avatar,
	.nav-avatar-placeholder {
		width: 100%;
		height: 100%;
		border-radius: 50%;
	}

	.nav-avatar {
		object-fit: cover;
		display: block;
	}

	.nav-avatar-placeholder {
		background: var(--color-surface-alt);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.nav-initials {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.nav-profile:hover,
	.nav-profile:focus {
		border-color: var(--color-primary);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 20%, transparent);
		outline: none;
	}

	@media (max-width: 560px) {
		.nav-profile {
			--_size: 40px;
		}
	}

	/* Login Button */
	.login-button {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.login-button:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}
</style>
