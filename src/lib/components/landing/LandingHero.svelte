<script lang="ts">
	import EditorsDeskCarousel from '../EditorsDeskCarousel.svelte';

	let { editorsDeskPicks = [] } = $props<{
		editorsDeskPicks?: any[];
	}>();
</script>

<section class="landing-hero hero-grid">
	<a href="/login" class="login-icon" aria-label="Sign in">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
			<polyline points="10 17 15 12 10 7" />
			<line x1="15" y1="12" x2="3" y2="12" />
		</svg>
	</a>
	<div class="hero-primary">
		<p class="editorial-masthead">ReasonSmith Journal</p>
		<h1>Learn through thoughtful disagreement.</h1>
		<p class="editorial-lede hero-lede">
			ReasonSmith is a platform for developing critical thinking skills through constructive
			dialogue. Explore ideas through evidence-based discussion, learn to understand perspectives
			you disagree with, and build stronger reasoning through collaborative refinement.
		</p>
		<p class="alpha-notice">
			We're currently in <strong>Alpha</strong>. Many features and designs are subject to drastic
			changes as we iterate toward our Beta release in early-to-mid 2026.
		</p>
		<div class="hero-actions">
			<a class="cta-button" href="/login"> Start Learning </a>
			<a class="secondary-cta" href="/discussions">Explore Discussions</a>
		</div>
		<ul class="hero-pillars">
			<li>AI analysis helps you strengthen reasoning and avoid logical pitfalls</li>
			<li>Steelmanning teaches you to understand views you disagree with</li>
			<li>Citation practice builds research literacy and critical thinking</li>
			<li>Collaborative editing refines ideas through diverse perspectives</li>
		</ul>
	</div>
	{#if editorsDeskPicks.length > 0}
		<aside class="hero-spotlight" aria-label="Featured discussions">
			<div class="spotlight-header">
				<span class="editorial-kicker">Spotlight</span>
				<h2>Editors' desk picks</h2>
			</div>
			<EditorsDeskCarousel items={editorsDeskPicks} />
		</aside>
	{/if}
</section>

<style>
	.login-icon {
		position: absolute;
		top: clamp(1rem, 3vw, 1.5rem);
		right: clamp(1rem, 3vw, 2rem);
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: var(--border-radius-full);
		border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
		background: color-mix(in srgb, var(--color-surface) 80%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-secondary);
		text-decoration: none;
		transition: all 0.25s ease;
	}

	.login-icon:hover,
	.login-icon:focus {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 15%, transparent);
		outline: none;
	}

	.login-icon svg {
		width: 20px;
		height: 20px;
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
		margin-bottom: 4rem;
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

	@media (min-width: 1024px) {
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
		margin-bottom: 1rem;
	}

	.alpha-notice {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
		border-radius: var(--border-radius-sm);
		padding: 0.75rem 1rem;
		margin-bottom: clamp(1.5rem, 4vw, 2rem);
	}

	.alpha-notice strong {
		color: var(--color-warning);
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.cta-button {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		padding: 1rem 2.5rem;
		font-size: 1rem;
		font-weight: 600;
		border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		font-family: var(--font-family-ui);
		letter-spacing: 0.025em;
		text-decoration: none;
		display: inline-block;
	}

	.cta-button:hover {
		background: color-mix(in srgb, var(--color-primary) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 12%, transparent);
	}

	.secondary-cta {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.85rem 1.5rem;
		border-radius: var(--border-radius-full);
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
		border-radius: var(--border-radius-full);
		background: var(--color-primary);
		flex-shrink: 0;
	}

	.hero-spotlight {
		background: color-mix(in srgb, var(--color-surface) 85%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: var(--border-radius-xl);
		padding: 1.5rem;
		box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-self: start;
		min-width: 0;
		overflow: hidden;
	}

	.hero-spotlight :global(.editors-desk-carousel) {
		min-width: 0;
	}

	.spotlight-header {
		flex-shrink: 0;
	}

	.spotlight-header h2 {
		margin: 0;
		font-size: clamp(1.25rem, 2.5vw, 1.5rem);
		font-family: var(--font-family-display);
		line-height: 1.2;
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
	}

	@media (max-width: 768px) {
		.landing-hero {
			padding: 2rem 1rem;
			min-height: 90vh;
		}
	}
</style>
