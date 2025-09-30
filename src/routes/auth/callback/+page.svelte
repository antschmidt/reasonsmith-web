<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';

	const currentYear = new Date().getFullYear();

	onMount(() => {
		const unsubscribe = nhost.auth.onAuthStateChanged((event) => {
			if (event === 'SIGNED_IN') {
				goto('/');
			}
		});

		return () => {
			unsubscribe();
		};
	});
</script>

<div class="auth-page" aria-busy="true">
	<header class="auth-masthead">
		<a class="auth-brand" href="/" aria-label="Return to ReasonSmith home">ReasonSmith</a>
		<p>Journal of Constructive Argument</p>
	</header>

	<main class="auth-main">
		<div class="auth-panel">
			<section class="auth-card auth-card--status" aria-live="polite">
				<h1>Signing you in…</h1>
				<p>We are finalizing your session. This will only take a moment.</p>
				<div class="auth-progress" role="status" aria-hidden="true">
					<span class="progress-dot"></span>
					<span class="progress-dot"></span>
					<span class="progress-dot"></span>
				</div>
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
