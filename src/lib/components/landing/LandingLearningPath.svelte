<section class="learning-path">
	<div class="section-heading">
		<span class="editorial-kicker">Your Learning Journey</span>
		<h2>Develop critical thinking through practice.</h2>
		<p class="section-description">
			ReasonSmith guides you from curious observer to skilled contributor, building intellectual
			rigor at every step.
		</p>
	</div>

	<div class="path-steps">
		<article class="step">
			<div class="step-number">1</div>
			<h3>Explore & Observe</h3>
			<p>
				Browse curated discussions that demonstrate constructive engagement. See examples of
				steelmanning, proper citation, and good-faith reasoning in action.
			</p>
			<div class="step-outcome">Learn what constructive dialogue looks like</div>
		</article>

		<article class="step">
			<div class="step-number">2</div>
			<h3>Practice & Receive Feedback</h3>
			<p>
				Write your own contributions and get AI-powered analysis on logical fallacies, tone, and
				reasoning quality. Iterate based on feedback to strengthen your arguments.
			</p>
			<div class="step-outcome">Identify and overcome reasoning weaknesses</div>
		</article>

		<article class="step">
			<div class="step-number">3</div>
			<h3>Steelman & Understand</h3>
			<p>
				Challenge yourself to articulate opposing viewpoints accurately and charitably. Develop
				intellectual empathy by engaging with perspectives you disagree with.
			</p>
			<div class="step-outcome">Build a deeper understanding</div>
		</article>

		<article class="step">
			<div class="step-number">4</div>
			<h3>Collaborate & Refine</h3>
			<p>
				Work with others to strengthen ideas through diverse perspectives. Learn from collaborative
				editing and see how different viewpoints create more nuanced arguments.
			</p>
			<div class="step-outcome">Create stronger, more balanced perspectives</div>
		</article>
	</div>

	<div class="path-cta">
		<p>Ready to develop your critical thinking skills?</p>
		<a class="cta-button" href="/login">Begin Your Journey</a>
	</div>
</section>

<style>
	.learning-path {
		padding: clamp(3rem, 6vw, 5rem) clamp(1.5rem, 6vw, 5rem);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 3%, var(--color-surface)),
			color-mix(in srgb, var(--color-accent) 2%, var(--color-surface-alt))
		);
		border-bottom: 1px solid var(--color-border);
	}

	.section-heading {
		max-width: 720px;
		margin: 0 auto clamp(3rem, 5vw, 4rem);
		text-align: center;
	}

	.section-heading h2 {
		margin: 0 0 1rem;
		font-family: var(--font-family-display);
		font-size: clamp(1.8rem, 4vw, 2.5rem);
		letter-spacing: -0.01em;
	}

	.section-description {
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
		font-size: 1.05rem;
		margin: 0;
	}

	.path-steps {
		display: grid;
		gap: clamp(1.5rem, 4vw, 2rem);
		max-width: 1200px;
		margin: 0 auto clamp(3rem, 5vw, 4rem);
		position: relative;
	}

	/* Connection line between steps on larger screens */
	@media (min-width: 768px) {
		.path-steps {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 1024px) {
		.path-steps {
			grid-template-columns: repeat(4, 1fr);
		}

		.path-steps::before {
			content: '';
			position: absolute;
			top: 3rem;
			left: 12%;
			right: 12%;
			height: 2px;
			background: linear-gradient(
				90deg,
				var(--color-primary),
				var(--color-accent),
				var(--color-primary)
			);
			opacity: 0.2;
			z-index: 0;
		}
	}

	.step {
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: var(--border-radius-xl);
		padding: clamp(1.5rem, 4vw, 2rem);
		box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
		position: relative;
		z-index: 1;
		transition: all 0.3s ease;
	}

	.step:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
		border-color: var(--color-primary);
	}

	.step-number {
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		background: linear-gradient(
			135deg,
			var(--color-primary),
			color-mix(in srgb, var(--color-accent) 75%, var(--color-primary))
		);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		font-weight: 700;
		font-family: var(--font-family-display);
		margin-bottom: 1rem;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.step h3 {
		margin: 0 0 0.75rem;
		font-family: var(--font-family-display);
		font-size: 1.25rem;
		color: var(--color-text-primary);
	}

	.step p {
		margin: 0 0 1rem;
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
		font-size: 0.95rem;
	}

	.step-outcome {
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		border-left: 3px solid var(--color-primary);
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-primary);
		font-style: italic;
	}

	.path-cta {
		text-align: center;
		max-width: 520px;
		margin: 0 auto;
	}

	.path-cta p {
		margin: 0 0 1.5rem;
		font-size: 1.15rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.cta-button {
		background: var(--color-primary);
		color: white;
		padding: 1rem 2.5rem;
		font-size: 1rem;
		font-weight: 600;
		border: none;
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: all var(--transition-speed) ease;
		font-family: var(--font-family-ui);
		letter-spacing: 0.025em;
		text-decoration: none;
		display: inline-block;
		box-shadow: 0 4px 14px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.cta-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 35%, transparent);
		background: color-mix(in srgb, var(--color-primary) 90%, black);
	}

	@media (max-width: 640px) {
		.path-steps {
			grid-template-columns: 1fr;
		}

		.step {
			padding: 1.5rem;
		}
	}
</style>
