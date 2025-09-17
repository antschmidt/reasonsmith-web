<script>
	import '../app.css';
	import { nhost } from '$lib/nhostClient';
	import { theme } from '$lib/themeStore';
	import { dev } from '$app/environment';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';

	injectAnalytics({ mode: dev ? 'development' : 'production' });
	let user = nhost.auth.getUser();
	if (typeof window !== 'undefined') {
		nhost.auth.onAuthStateChanged(() => {
			user = nhost.auth.getUser();
		});
	}

	// Initialize theme immediately on page load
	let currentTheme;
	theme.subscribe((value) => {
		currentTheme = value;
		if (typeof window !== 'undefined') {
			document.documentElement.setAttribute('data-theme', value || 'light');
		}
	});
</script>

{#if user}
	<nav class="top-nav" aria-label="Main navigation">
		<a href="/" class="brand" aria-label="Go to Dashboard">
			<span class="brand-icon">
				<img src="/ReasonSmith-transparent.png" alt="ReasonSmith Home" />
			</span>
			<span class="sr-only">Dashboard</span>
		</a>
		<div class="nav-spacer"></div>
		<div class="nav-actions" role="group" aria-label="Primary actions">
			<a href="/discussions" class="nav-icon" aria-label="Browse all discussions">
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
					><path
						d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l4.25 4.25c.41.41 1.07.41 1.48 0s.41-1.07 0-1.48L15.5 14Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14Z"
					/></svg
				>
			</a>
			<a href="/profile" class="nav-icon" aria-label="Profile">
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
					<path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" />
				</svg>
			</a>

		</div>
	</nav>
{/if}

<div class="app-shell">
	<slot />
</div>

<style>
	.top-nav {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: linear-gradient(
			90deg,
			var(--color-surface) 0%,
			color-mix(in srgb, var(--color-primary) 6%, var(--color-surface)) 55%,
			color-mix(in srgb, var(--color-accent) 7%, var(--color-surface)) 100%
		);
		border-bottom: 1px solid var(--color-border);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
		backdrop-filter: saturate(1.2) blur(6px);
	}
	:global([data-theme='dark']) .top-nav {
		background: linear-gradient(
			90deg,
			var(--color-surface) 0%,
			color-mix(in srgb, var(--color-primary) 18%, var(--color-surface)) 55%,
			color-mix(in srgb, var(--color-accent) 20%, var(--color-surface)) 100%
		);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
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
		width: 48px;
		height: 48px;
		padding: 0.5rem;
		border-radius: 14px;
		background: #ffffff; /* Light mode: solid white for clarity */
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.1),
			0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent);
		transition:
			transform 140ms ease,
			box-shadow 180ms ease;
	}
	:global([data-theme='dark']) .brand-icon {
		background: white;
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.35),
			0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent);
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
		transform: translateY(-2px);
		box-shadow:
			0 4px 10px -2px rgba(0, 0, 0, 0.25),
			0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent);
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
	}
	.nav-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}
	.nav-icon {
		--_size: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--_size);
		height: var(--_size);
		border-radius: 12px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 55%, transparent),
			color-mix(in srgb, var(--color-accent) 45%, transparent)
		);
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.18),
			0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent);
		text-decoration: none;
		position: relative;
		transition:
			transform 120ms ease,
			box-shadow 160ms ease,
			background 220ms ease;
		color: var(--color-surface);
	}
	.nav-icon svg {
		width: 24px;
		height: 24px;
		fill: currentColor;
		opacity: 0.92;
	}
	.nav-icon:hover,
	.nav-icon:focus {
		transform: translateY(-2px);
		box-shadow:
			0 4px 10px -2px rgba(0, 0, 0, 0.28),
			0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent);
		outline: none;
	}
	.nav-icon:active {
		transform: translateY(0);
		box-shadow: 0 2px 6px -2px rgba(0, 0, 0, 0.35);
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
</style>
