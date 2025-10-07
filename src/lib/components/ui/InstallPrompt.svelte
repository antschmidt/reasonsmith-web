<script lang="ts">
	import { onMount } from 'svelte';

	let showPrompt = $state(false);
	let deferredPrompt: any = null;
	let dismissed = $state(false);

	onMount(() => {
		// Check if already dismissed in this session
		const wasDismissed = sessionStorage.getItem('pwa-install-dismissed');
		if (wasDismissed) {
			dismissed = true;
			return;
		}

		// Check if already installed
		if (window.matchMedia('(display-mode: standalone)').matches) {
			return;
		}

		// Listen for the beforeinstallprompt event
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e;
			showPrompt = true;
		});

		// Listen for successful install
		window.addEventListener('appinstalled', () => {
			console.log('[PWA] App installed successfully');
			showPrompt = false;
			deferredPrompt = null;
		});
	});

	async function handleInstall() {
		if (!deferredPrompt) return;

		deferredPrompt.prompt();

		const { outcome } = await deferredPrompt.userChoice;
		console.log(`[PWA] User response to install prompt: ${outcome}`);

		if (outcome === 'accepted') {
			console.log('[PWA] User accepted the install prompt');
		}

		deferredPrompt = null;
		showPrompt = false;
	}

	function handleDismiss() {
		showPrompt = false;
		dismissed = true;
		sessionStorage.setItem('pwa-install-dismissed', 'true');
	}
</script>

{#if showPrompt && !dismissed}
	<div class="install-prompt">
		<div class="install-content">
			<div class="install-icon">
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
					<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor" />
				</svg>
			</div>
			<div class="install-text">
				<p class="install-title">Install ReasonSmith</p>
				<p class="install-description">
					Get quick access to your writing desk. Install our app for a faster, app-like experience.
				</p>
			</div>
			<div class="install-actions">
				<button type="button" class="install-button" onclick={handleInstall}> Install </button>
				<button type="button" class="dismiss-button" onclick={handleDismiss}> Not Now </button>
			</div>
		</div>
	</div>
{/if}

<style>
	.install-prompt {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		right: 1rem;
		z-index: 1000;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.install-content {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 16px;
		padding: 1.5rem;
		box-shadow: 0 12px 40px color-mix(in srgb, var(--color-primary) 20%, transparent);
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 1rem;
		align-items: center;
		max-width: 600px;
		margin: 0 auto;
	}

	.install-icon {
		width: 48px;
		height: 48px;
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-primary);
	}

	.install-icon svg {
		width: 24px;
		height: 24px;
	}

	.install-text {
		flex: 1;
	}

	.install-title {
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 0.25rem 0;
		font-size: 0.9375rem;
	}

	.install-description {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.4;
	}

	.install-actions {
		display: flex;
		gap: 0.5rem;
		flex-direction: column;
	}

	.install-button {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.install-button:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
	}

	.dismiss-button {
		background: transparent;
		color: var(--color-text-secondary);
		border: none;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.dismiss-button:hover {
		color: var(--color-text-primary);
	}

	@media (max-width: 640px) {
		.install-prompt {
			bottom: 0;
			left: 0;
			right: 0;
			border-radius: 0;
		}

		.install-content {
			border-radius: 16px 16px 0 0;
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.install-icon {
			display: none;
		}

		.install-actions {
			flex-direction: row;
			justify-content: stretch;
		}

		.install-button,
		.dismiss-button {
			flex: 1;
		}
	}
</style>
