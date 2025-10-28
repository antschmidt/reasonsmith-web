<section class="landing-features">
	<div class="section-heading">
		<span class="editorial-kicker">Why ReasonSmith</span>
		<h2>Build skills for constructive dialogue.</h2>
	</div>
	<div class="feature-columns">
		<article>
			<h3>Learn to reason better</h3>
			<p>
				Get real-time feedback on logical fallacies, tone, and reasoning quality. Improve your
				critical thinking through iterative refinement and AI-guided analysis.
			</p>
		</article>
		<article>
			<h3>Understand opposing views</h3>
			<p>
				Practice steelmanning to develop intellectual empathy. Learn to articulate perspectives you
				disagree with accurately, strengthening your own reasoning in the process.
			</p>
		</article>
		<article>
			<h3>Build research skills</h3>
			<p>
				Develop citation habits that support credible discourse. Track sources, evaluate evidence,
				and learn to distinguish strong claims from weak ones.
			</p>
		</article>
	</div>
</section>

<style>
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

	@media (max-width: 640px) {
		.feature-columns {
			grid-template-columns: 1fr;
		}
	}
</style>
