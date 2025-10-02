<script lang="ts">
	const currentYear = new Date().getFullYear();
</script>

<div class="legal-page">
	<header class="legal-header">
		<a class="legal-brand" href="/" aria-label="Return to ReasonSmith home">ReasonSmith</a>
		<p>Journal of Constructive Argument</p>
	</header>

	<main class="legal-main">
		<div class="legal-content">
			<h1>Terms of Service</h1>
			<p class="last-updated">Last Updated: {currentYear}</p>

			<section>
				<h2>1. Acceptance of Terms</h2>
				<p>
					By accessing and using ReasonSmith ("the Service"), you agree to be bound by these Terms
					of Service. If you do not agree to these terms, please do not use the Service.
				</p>
			</section>

			<section>
				<h2>2. Description of Service</h2>
				<p>
					ReasonSmith is a platform for structured public discourse that combines editorial
					discipline with collaborative features. The Service provides tools for creating,
					publishing, and discussing well-sourced arguments with transparent revision history and
					good-faith scoring.
				</p>
			</section>

			<section>
				<h2>3. User Accounts</h2>
				<p>
					To access certain features of the Service, you must create an account. You are
					responsible for:
				</p>
				<ul>
					<li>Maintaining the confidentiality of your account credentials</li>
					<li>All activities that occur under your account</li>
					<li>Notifying us immediately of any unauthorized use of your account</li>
					<li>Providing accurate and current information during registration</li>
				</ul>
			</section>

			<section>
				<h2>4. Content Guidelines</h2>
				<p>When using ReasonSmith, you agree to:</p>
				<ul>
					<li>Provide accurate citations for all claims and sources</li>
					<li>Engage in good-faith discourse and avoid hostile or inflammatory language</li>
					<li>Respect intellectual property rights and properly attribute sources</li>
					<li>Not post content that violates our <a href="/resources/community-guidelines">Community Guidelines</a></li>
					<li>Not use the Service for spam, harassment, or malicious purposes</li>
				</ul>
			</section>

			<section>
				<h2>5. Content Ownership and License</h2>
				<p>
					You retain ownership of content you create on ReasonSmith. By posting content, you grant
					ReasonSmith a worldwide, non-exclusive, royalty-free license to use, display, and
					distribute your content on the platform.
				</p>
				<p>
					Published discussions and posts may be featured, curated, or showcased by our editorial
					team. You can delete your content at any time, though published versions may remain in
					archives.
				</p>
			</section>

			<section>
				<h2>6. Editorial Moderation</h2>
				<p>
					ReasonSmith uses a combination of AI-assisted scoring and human editorial judgment to
					evaluate content quality and good-faith participation. We reserve the right to:
				</p>
				<ul>
					<li>Review and moderate user-generated content</li>
					<li>Remove content that violates these Terms or our Community Guidelines</li>
					<li>Suspend or terminate accounts for repeated violations</li>
					<li>Feature or curate content based on editorial criteria</li>
				</ul>
			</section>

			<section>
				<h2>7. Good-Faith Scoring</h2>
				<p>
					Our AI-assisted good-faith scoring system analyzes posts for constructive discourse,
					proper sourcing, and civil tone. Scores are advisory and subject to editorial review.
					Consistently low scores may affect your ability to participate fully in the platform.
				</p>
			</section>

			<section>
				<h2>8. Prohibited Uses</h2>
				<p>You may not use ReasonSmith to:</p>
				<ul>
					<li>Violate any applicable laws or regulations</li>
					<li>Infringe on intellectual property rights</li>
					<li>Harass, threaten, or harm other users</li>
					<li>Spread misinformation or deliberately misleading content</li>
					<li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
					<li>Interfere with the proper functioning of the Service</li>
				</ul>
			</section>

			<section>
				<h2>9. Disclaimer of Warranties</h2>
				<p>
					ReasonSmith is provided "as is" without warranties of any kind, either express or
					implied. We do not guarantee that the Service will be uninterrupted, secure, or
					error-free.
				</p>
			</section>

			<section>
				<h2>10. Limitation of Liability</h2>
				<p>
					To the maximum extent permitted by law, ReasonSmith shall not be liable for any
					indirect, incidental, special, consequential, or punitive damages arising from your use
					of the Service.
				</p>
			</section>

			<section>
				<h2>11. Changes to Terms</h2>
				<p>
					We reserve the right to modify these Terms at any time. We will notify users of
					significant changes via email or through the Service. Continued use of the Service after
					changes constitutes acceptance of the modified Terms.
				</p>
			</section>

			<section>
				<h2>12. Termination</h2>
				<p>
					We may terminate or suspend your account at any time for violation of these Terms. You
					may terminate your account at any time by contacting us. Upon termination, your right to
					use the Service will immediately cease.
				</p>
			</section>

			<section>
				<h2>13. Governing Law</h2>
				<p>
					These Terms shall be governed by and construed in accordance with applicable laws,
					without regard to conflict of law principles.
				</p>
			</section>

			<section>
				<h2>14. Contact</h2>
				<p>
					For questions about these Terms of Service, please contact us at <a
						href="mailto:legal@reasonsmith.com">legal@reasonsmith.com</a
					>.
				</p>
			</section>
		</div>
	</main>

	<footer class="legal-footer">
		<nav aria-label="Legal links">
			<a href="/terms">Terms</a>
			<a href="/privacy">Privacy</a>
			<a href="/resources/community-guidelines">Guidelines</a>
		</nav>
		<span>© {currentYear} ReasonSmith Media</span>
	</footer>
</div>

<style>
	.legal-page {
		min-height: 100vh;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-surface) 85%, var(--color-primary) 15%),
			color-mix(in srgb, var(--color-surface-alt) 80%, var(--color-accent) 12%)
		);
		display: flex;
		flex-direction: column;
		font-family: var(--font-family-sans);
	}

	.legal-header {
		padding: 2rem;
		text-align: center;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
	}

	.legal-brand {
		font-family: var(--font-family-display);
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text-primary);
		text-decoration: none;
		letter-spacing: -0.01em;
		margin-bottom: 0.5rem;
		display: block;
	}

	.legal-header p {
		margin: 0.5rem 0 0;
		color: var(--color-text-secondary);
		font-style: italic;
		font-size: 0.9rem;
	}

	.legal-main {
		flex: 1;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 3rem 2rem;
	}

	.legal-content {
		max-width: 800px;
		width: 100%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 24px;
		padding: 3rem;
		box-shadow: 0 12px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.legal-content h1 {
		font-family: var(--font-family-display);
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 0.5rem 0;
		letter-spacing: -0.01em;
	}

	.last-updated {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin: 0 0 2rem 0;
		font-style: italic;
	}

	.legal-content section {
		margin-bottom: 2rem;
	}

	.legal-content h2 {
		font-family: var(--font-family-display);
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 1rem 0;
	}

	.legal-content p {
		color: var(--color-text-secondary);
		line-height: var(--line-height-relaxed);
		margin: 0 0 1rem 0;
	}

	.legal-content ul {
		margin: 0 0 1rem 0;
		padding-left: 1.5rem;
		color: var(--color-text-secondary);
		line-height: var(--line-height-relaxed);
	}

	.legal-content li {
		margin-bottom: 0.5rem;
	}

	.legal-content a {
		color: var(--color-link);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.legal-content a:hover {
		color: var(--color-link-hover);
		text-decoration: underline;
	}

	.legal-footer {
		padding: 2rem;
		text-align: center;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.legal-footer nav {
		display: flex;
		justify-content: center;
		gap: 2rem;
	}

	.legal-footer nav a {
		color: var(--color-link);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.legal-footer nav a:hover {
		color: var(--color-link-hover);
		text-decoration: underline;
	}

	.legal-footer span {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	@media (max-width: 768px) {
		.legal-main {
			padding: 2rem 1rem;
		}

		.legal-content {
			padding: 2rem 1.5rem;
		}

		.legal-content h1 {
			font-size: 2rem;
		}

		.legal-content h2 {
			font-size: 1.25rem;
		}
	}
</style>
