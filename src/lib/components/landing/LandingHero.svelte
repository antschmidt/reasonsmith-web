<script lang="ts">
	import EditorsDeskCarousel from '../EditorsDeskCarousel.svelte';

	let { editorsDeskPicks = [] } = $props<{
		editorsDeskPicks?: any[];
	}>();
</script>

<section class="landing-hero hero-grid">
	<div class="hero-primary">
		<p class="editorial-masthead">ReasonSmith Journal</p>
		<h1>Learn through thoughtful disagreement.</h1>
		<p class="editorial-lede hero-lede">
			ReasonSmith is a platform for developing critical thinking skills through constructive
			dialogue. Explore ideas through evidence-based discussion, learn to understand perspectives
			you disagree with, and build stronger reasoning through collaborative refinement.
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
	<aside class="hero-spotlight" aria-label="Featured discussions">
		<div class="spotlight-header">
			<span class="editorial-kicker">Spotlight</span>
			<h2>Editors' desk picks</h2>
		</div>
		{#if editorsDeskPicks.length > 0}
			<EditorsDeskCarousel items={editorsDeskPicks} />
		{/if}
	</aside>
</section>

<style>
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
		margin-bottom: clamp(2rem, 5vw, 2.5rem);
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
		height: 90%;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.spotlight-header h2 {
		margin: 0;
		font-size: clamp(1.35rem, 3vw, 1.75rem);
		font-family: var(--font-family-display);
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
