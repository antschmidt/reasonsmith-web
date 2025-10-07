<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import { isStandalone, isFromPWA, returnToPWA } from '$lib/utils/pwa';

	const currentYear = new Date().getFullYear();
	let showReturnButton = $state(false);
	let isSignedIn = $state(false);

	onMount(() => {
		let unsubscribe: Function | undefined;

		// Check if we're in browser context but auth came from PWA
		const standalone = isStandalone();
		const fromPWA = isFromPWA();

		// Check if already signed in (in case the event already fired)
		const checkAuthAndRedirect = async () => {
			let isAuthenticated = false;
			try {
				isAuthenticated = await nhost.auth.isAuthenticatedAsync();
			} catch (authError) {
				console.warn('Authentication check failed:', authError);
				// Fall back to checking current user state
				isAuthenticated = !!nhost.auth.getUser();
			}

			if (isAuthenticated) {
				isSignedIn = true;

				// If we're in browser but came from PWA, show "Return to App" button
				if (!standalone && fromPWA) {
					showReturnButton = true;
					// Auto-redirect after 3 seconds as fallback
					setTimeout(() => {
						returnToPWA('/');
					}, 3000);
				} else {
					// Normal flow: redirect immediately
					goto('/');
				}
				return true;
			}
			return false;
		};

		// Initialize the auth check
		const initAuth = async () => {
			// First, check if already authenticated
			const alreadyAuthenticated = await checkAuthAndRedirect();

			// If not already handled, listen for auth state changes
			if (!alreadyAuthenticated) {
				unsubscribe = nhost.auth.onAuthStateChanged(async (event) => {
					if (event === 'SIGNED_IN') {
						await checkAuthAndRedirect();
					}
				});
			}
		};

		initAuth();

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	});

	function handleReturnToApp() {
		returnToPWA('/');
	}
</script>

<div class="auth-page" aria-busy="true">
	<header class="auth-masthead">
		<a class="auth-brand" href="/" aria-label="Return to ReasonSmith home">ReasonSmith</a>
		<p>Journal of Constructive Argument</p>
	</header>

	<main class="auth-main">
		<div class="auth-panel">
			<section class="auth-card auth-card--status" aria-live="polite">
				{#if showReturnButton && isSignedIn}
					<div class="auth-success-icon">
						<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path
								d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
								fill="currentColor"
							/>
						</svg>
					</div>
					<h1>Signed in successfully!</h1>
					<p>You can now return to the ReasonSmith app.</p>
					<button type="button" class="return-button" onclick={handleReturnToApp}>
						Return to App
					</button>
					<p class="auto-redirect-note">Redirecting automatically in a few seconds...</p>
				{:else}
					<h1>Signing you in…</h1>
					<p>We are finalizing your session. This will only take a moment.</p>
					<div class="auth-progress" role="status" aria-hidden="true">
						<span class="progress-dot"></span>
						<span class="progress-dot"></span>
						<span class="progress-dot"></span>
					</div>
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
	.auth-card--status {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 1.5rem;
	}

	.auth-success-icon {
		width: 80px;
		height: 80px;
		background: color-mix(in srgb, #10b981 12%, transparent);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #10b981;
		animation: scaleIn 0.3s ease-out;
	}

	.auth-success-icon svg {
		width: 48px;
		height: 48px;
	}

	@keyframes scaleIn {
		from {
			transform: scale(0);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	.return-button {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 1rem 2rem;
		border-radius: 12px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		margin-top: 1rem;
	}

	.return-button:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
		transform: translateY(-1px);
	}

	.auto-redirect-note {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		font-style: italic;
		margin-top: 0.5rem;
	}

	.auth-progress {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.progress-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--color-primary) 70%, transparent);
		animation: dotPulse 1.4s ease-in-out infinite;
	}

	.progress-dot:nth-child(2) {
		animation-delay: 0.2s;
	}
	.progress-dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes dotPulse {
		0%,
		100% {
			opacity: 0.25;
			transform: translateY(0);
		}
		40% {
			opacity: 1;
			transform: translateY(-4px);
		}
		60% {
			opacity: 0.6;
		}
	}
</style>
