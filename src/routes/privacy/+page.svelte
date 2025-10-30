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
			<h1>Privacy Policy</h1>
			<p class="last-updated">Last Updated: January 2025</p>

			<section>
				<h2>1. Introduction</h2>
				<p>
					ReasonSmith ("we," "our," or "us") is committed to protecting your privacy. This Privacy
					Policy explains how we collect, use, disclose, and safeguard your information when you use
					our platform.
				</p>
			</section>

			<section>
				<h2>2. Information We Collect</h2>

				<h3>Personal Information</h3>
				<p>When you create an account or use our Service, we may collect:</p>
				<ul>
					<li>Email address</li>
					<li>Display name, handle, and profile information</li>
					<li>GitHub or Google account information (if using OAuth authentication)</li>
					<li>Avatar or profile photo (stored via Nhost storage)</li>
					<li>Communication and notification preferences</li>
					<li>Bio and social media links (Twitter, GitHub, LinkedIn, Mastodon, Bluesky, etc.)</li>
					<li>User role (user, site manager, admin) and permission levels</li>
				</ul>

				<h3>Content and Usage Data</h3>
				<ul>
					<li>Discussions, posts, and comments you create</li>
					<li>Citations and sources you reference in Chicago-style format</li>
					<li>Draft content stored locally and on servers</li>
					<li>Revision history and version control data</li>
					<li>Good-faith scores, analysis results, and moderation history</li>
					<li>Analysis credit usage and purchase history</li>
					<li>Rich text formatting and editor interactions</li>
					<li>Interactions with other users' content (likes, replies, etc.)</li>
					<li>Anonymous posting preferences and anonymous content metadata</li>
				</ul>

				<h3>Technical Information</h3>
				<ul>
					<li>IP address and device information</li>
					<li>Browser type, version, and user agent</li>
					<li>Operating system</li>
					<li>Usage patterns and analytics data via Vercel Analytics</li>
					<li>Log files and error reports</li>
					<li>Session data and authentication tokens</li>
					<li>Cookie data and local storage information</li>
					<li>Performance metrics and page load times</li>
				</ul>
			</section>

			<section>
				<h2>3. How We Use Your Information</h2>
				<p>We use collected information to:</p>
				<ul>
					<li>Provide, maintain, and improve the Service</li>
					<li>Create and manage your account with role-based permissions</li>
					<li>Process authentication via GitHub, Google, magic links, or email/password</li>
					<li>Generate good-faith scores using AI analysis from Anthropic Claude and OpenAI</li>
					<li>Track and manage analysis credits (monthly and purchased)</li>
					<li>Auto-save drafts locally and on servers to prevent data loss</li>
					<li>Moderate content and enforce Community Guidelines</li>
					<li>Enable citation network visualization through Neo4j</li>
					<li>Process Editor's Desk featured content approvals</li>
					<li>Maintain anonymous posting while enabling moderation</li>
					<li>Communicate with you about the Service via notifications</li>
					<li>Analyze usage patterns and improve user experience</li>
					<li>Detect and prevent fraud, abuse, or security issues</li>
					<li>Comply with legal obligations</li>
				</ul>
			</section>

			<section>
				<h2>4. AI-Assisted Content Analysis</h2>
				<p>
					ReasonSmith uses AI technology from multiple providers to analyze content for good-faith
					scoring:
				</p>

				<h3>AI Providers</h3>
				<ul>
					<li><strong>Anthropic Claude:</strong> Primary AI provider for post and discussion analysis</li>
					<li><strong>OpenAI:</strong> Additional AI provider for content scoring and moderation</li>
				</ul>

				<h3>What We Analyze</h3>
				<ul>
					<li>Tone and language for constructive discourse</li>
					<li>Citation quality and source credibility</li>
					<li>Logical fallacies and argument structure</li>
					<li>Claims and supporting arguments</li>
					<li>Potentially hostile or bad-faith language patterns</li>
					<li>Scoring on a 0-1 scale with detailed rationale</li>
				</ul>

				<h3>Data Processing</h3>
				<p>
					Content submitted for AI analysis is processed in accordance with our service providers'
					privacy policies (Anthropic's Privacy Policy and OpenAI's Privacy Policy). We do not use
					your content to train third-party AI models. Analysis is performed only when you
					explicitly request good-faith scoring and have available credits.
				</p>
			</section>

			<section>
				<h2>5. Local Storage and Drafts</h2>
				<p>
					ReasonSmith uses your browser's local storage to provide auto-save functionality:
				</p>

				<h3>What We Store Locally</h3>
				<ul>
					<li>Draft content as you type</li>
					<li>Editor preferences and formatting settings</li>
					<li>Authentication session state</li>
					<li>UI preferences (theme, layout options)</li>
				</ul>

				<h3>Local Storage Behavior</h3>
				<ul>
					<li>Data persists in your browser even after closing the tab</li>
					<li>Draft content is synced to our servers when online</li>
					<li>Offline edits are saved locally and synced when connection restores</li>
					<li>You can clear local storage through your browser settings</li>
					<li>Local data is not accessible to other websites</li>
				</ul>
			</section>

			<section>
				<h2>6. Information Sharing and Disclosure</h2>

				<h3>Public Content</h3>
				<p>
					Published discussions, posts, and comments are publicly visible. This includes your
					display name, avatar, handle, and any content you choose to publish. Anonymous posts do
					not display your identifying information publicly but may be linked internally for
					moderation purposes.
				</p>

				<h3>Service Providers</h3>
				<p>We share information with third-party service providers who help us operate:</p>
				<ul>
					<li>
						<strong>Nhost</strong> - Backend infrastructure, authentication (GitHub/Google OAuth), database
						hosting (PostgreSQL), and file storage for avatars and media
					</li>
					<li><strong>Vercel</strong> - Frontend hosting and analytics</li>
					<li><strong>Anthropic</strong> - AI-assisted content moderation and good-faith scoring via Claude API</li>
					<li><strong>OpenAI</strong> - Additional AI-assisted content moderation and scoring</li>
					<li><strong>Neo4j</strong> - Citation network graph database for relationship visualization</li>
					<li><strong>GitHub/Google</strong> - OAuth authentication services</li>
				</ul>

				<h3>Citation Network Data</h3>
				<p>
					Citations and their relationships are stored in Neo4j, a third-party graph database
					service. This data includes citation details, source information, and connections
					between discussions. Citation network data is public when associated with published
					content.
				</p>

				<h3>Legal Requirements</h3>
				<p>We may disclose information when required by law or to:</p>
				<ul>
					<li>Comply with legal processes or government requests</li>
					<li>Enforce our Terms of Service</li>
					<li>Protect our rights, property, or safety</li>
					<li>Investigate fraud or security issues</li>
					<li>De-anonymize content when legally required or for safety concerns</li>
				</ul>

				<h3>Business Transfers</h3>
				<p>
					In the event of a merger, acquisition, or sale of assets, your information may be
					transferred to the acquiring entity. We will notify you via email and/or prominent
					notice on our Service of any such change.
				</p>
			</section>

			<section>
				<h2>7. Data Storage and Security</h2>
				<p>
					We implement appropriate technical and organizational measures to protect your
					information, including:
				</p>
				<ul>
					<li>Encrypted data transmission (HTTPS/TLS)</li>
					<li>Secure authentication with OAuth 2.0 and industry-standard protocols</li>
					<li>Regular security audits and updates</li>
					<li>Role-based access controls and authentication requirements</li>
					<li>Database encryption at rest via Nhost/PostgreSQL</li>
					<li>Secure storage of payment information through third-party processors</li>
					<li>HTML sanitization to prevent XSS attacks</li>
					<li>Rate limiting and abuse detection</li>
				</ul>

				<h3>Data Location</h3>
				<p>
					Your data is stored across multiple service providers:
				</p>
				<ul>
					<li>PostgreSQL database (Nhost) - User accounts, content, citations</li>
					<li>Neo4j graph database - Citation network relationships</li>
					<li>Nhost storage - Uploaded files (avatars, media)</li>
					<li>Vercel edge network - Static assets and serverless functions</li>
					<li>Your browser's local storage - Draft content and preferences</li>
				</ul>

				<p>
					However, no method of transmission over the Internet is 100% secure. We cannot guarantee
					absolute security of your data.
				</p>
			</section>

			<section>
				<h2>8. Analysis Credits and Purchases</h2>
				<p>
					When you purchase analysis credits, we collect and process:
				</p>
				<ul>
					<li>Payment information (processed by third-party payment processors)</li>
					<li>Purchase history and transaction records</li>
					<li>Credit usage tracking (monthly and purchased credits)</li>
					<li>Monthly credit reset dates</li>
				</ul>
				<p>
					Credit usage data helps us understand platform engagement and improve our AI analysis
					features. This data is retained for accounting, taxation, and fraud prevention purposes.
				</p>
			</section>

			<section>
				<h2>9. Anonymous Posting</h2>
				<p>
					When you post anonymously:
				</p>
				<ul>
					<li>Your display name and profile are not shown publicly</li>
					<li>Content is still internally linked to your account for moderation</li>
					<li>We can identify you in cases of Terms violations or legal obligations</li>
					<li>Good-faith scores and moderation actions still apply</li>
					<li>Administrators can de-anonymize content if necessary</li>
				</ul>
				<p>
					Anonymous posting provides public anonymity but not complete anonymity from platform
					administrators or in cases of legal compliance.
				</p>
			</section>

			<section>
				<h2>10. Data Retention</h2>
				<p>We retain your information for as long as:</p>
				<ul>
					<li>Your account remains active</li>
					<li>Necessary to provide the Service</li>
					<li>Required to comply with legal obligations</li>
					<li>Needed to resolve disputes or enforce agreements</li>
					<li>Draft content remains in your account (retained for recovery purposes)</li>
				</ul>

				<h3>Published Content</h3>
				<p>
					Published content may remain in public archives even after account deletion, though it
					will be disassociated from your personal information. Citation network relationships may
					persist for editorial and research integrity.
				</p>

				<h3>Deleted Drafts</h3>
				<p>
					Deleted drafts are removed from our servers within 30 days. Local storage data must be
					cleared manually through your browser settings.
				</p>
			</section>

			<section>
				<h2>11. Your Rights and Choices</h2>

				<h3>Access and Correction</h3>
				<p>
					You can access and update your profile information, handle, bio, social links, and
					preferences through your account settings at any time.
				</p>

				<h3>Data Portability</h3>
				<p>
					You may request a copy of your data in a portable format (JSON) by contacting us at <a
						href="mailto:privacy@reasonsmith.com">privacy@reasonsmith.com</a
					>. This includes your discussions, posts, citations, and usage history.
				</p>

				<h3>Deletion</h3>
				<p>
					You may delete your account at any time through your profile settings. Upon deletion:
				</p>
				<ul>
					<li>Personal information will be removed from our active systems</li>
					<li>Published content may remain in archives but will be anonymized</li>
					<li>Citation network relationships may persist for research integrity</li>
					<li>Purchased credits will be forfeited</li>
					<li>Local storage data must be cleared manually</li>
				</ul>

				<h3>Anonymous Posting</h3>
				<p>
					You can choose to post anonymously on a per-post basis. This setting does not affect
					your profile information or previously published identified posts.
				</p>

				<h3>Communication Preferences</h3>
				<p>
					You can manage notification preferences in your account settings, including:
				</p>
				<ul>
					<li>Email notifications for replies and mentions</li>
					<li>Editor's Desk approval requests</li>
					<li>Good-faith analysis results</li>
					<li>Platform updates and announcements</li>
				</ul>
				<p>
					You can opt out of marketing communications while continuing to receive essential
					service-related emails.
				</p>
			</section>

			<section>
				<h2>12. Cookies and Tracking</h2>
				<p>We use cookies and similar technologies to:</p>
				<ul>
					<li>Maintain your session and authentication state</li>
					<li>Remember your preferences and settings</li>
					<li>Analyze usage patterns with Vercel Analytics</li>
					<li>Improve performance and user experience</li>
					<li>Track feature usage for product development</li>
				</ul>

				<h3>Types of Cookies</h3>
				<ul>
					<li><strong>Essential Cookies:</strong> Required for authentication and core functionality</li>
					<li><strong>Functional Cookies:</strong> Remember your preferences and settings</li>
					<li><strong>Analytics Cookies:</strong> Help us understand how users interact with the platform</li>
				</ul>

				<p>
					You can control cookie preferences through your browser settings, though some features
					may not function properly without essential cookies. Third-party services (GitHub,
					Google) may set their own cookies during OAuth authentication.
				</p>
			</section>

			<section>
				<h2>13. Third-Party Links and Citations</h2>
				<p>
					ReasonSmith may contain links to external websites, sources, and citations. We are not
					responsible for the privacy practices of third-party sites. We encourage you to review
					their privacy policies.
				</p>
				<p>
					When you include citations, you may be linking to third-party sources. We do not control
					the content or privacy practices of cited sources.
				</p>
			</section>

			<section>
				<h2>14. Children's Privacy</h2>
				<p>
					ReasonSmith is not intended for users under 13 years of age. We do not knowingly collect
					information from children under 13. If we discover we have collected information from a
					child under 13, we will delete it promptly.
				</p>
				<p>
					Parents or guardians who believe their child has provided personal information should
					contact us immediately at <a href="mailto:privacy@reasonsmith.com"
						>privacy@reasonsmith.com</a
					>.
				</p>
			</section>

			<section>
				<h2>15. International Data Transfers</h2>
				<p>
					Your information may be transferred to and processed in countries outside your
					jurisdiction, including:
				</p>
				<ul>
					<li>United States (Vercel, OpenAI, Neo4j)</li>
					<li>European Union (Nhost, depending on configuration)</li>
					<li>Cloud infrastructure locations used by our service providers</li>
				</ul>
				<p>
					We ensure appropriate safeguards are in place to protect your data in accordance with
					this Privacy Policy and applicable data protection laws (GDPR, CCPA, etc.).
				</p>
			</section>

			<section>
				<h2>16. California Privacy Rights (CCPA)</h2>
				<p>
					If you are a California resident, you have specific rights under the California Consumer
					Privacy Act (CCPA):
				</p>
				<ul>
					<li>Right to know what personal information is collected</li>
					<li>Right to know if personal information is sold or disclosed</li>
					<li>Right to say no to the sale of personal information</li>
					<li>Right to access your personal information</li>
					<li>Right to delete personal information</li>
					<li>Right to equal service and price</li>
				</ul>
				<p>
					<strong>Note:</strong> We do not sell personal information to third parties.
				</p>
				<p>
					To exercise these rights, contact us at <a href="mailto:privacy@reasonsmith.com"
						>privacy@reasonsmith.com</a
					>.
				</p>
			</section>

			<section>
				<h2>17. European Privacy Rights (GDPR)</h2>
				<p>
					If you are in the European Economic Area (EEA), you have rights under the General Data
					Protection Regulation (GDPR):
				</p>
				<ul>
					<li>Right to access your personal data</li>
					<li>Right to rectification of inaccurate data</li>
					<li>Right to erasure ("right to be forgotten")</li>
					<li>Right to restrict processing</li>
					<li>Right to data portability</li>
					<li>Right to object to processing</li>
					<li>Right to withdraw consent</li>
				</ul>
				<p>
					<strong>Legal Basis for Processing:</strong> We process your data based on:
				</p>
				<ul>
					<li>Your consent (e.g., account creation, AI analysis requests)</li>
					<li>Contract performance (providing the Service)</li>
					<li>Legitimate interests (improving the platform, fraud prevention)</li>
					<li>Legal obligations (compliance with laws)</li>
				</ul>
				<p>
					To exercise your GDPR rights or contact our Data Protection Officer, email <a
						href="mailto:privacy@reasonsmith.com">privacy@reasonsmith.com</a
					>.
				</p>
			</section>

			<section>
				<h2>18. Changes to This Privacy Policy</h2>
				<p>
					We may update this Privacy Policy from time to time. We will notify you of significant
					changes via email or through the Service. The "Last Updated" date at the top indicates
					when the policy was last revised.
				</p>
				<p>
					Material changes affecting data processing, third-party services, or your rights will be
					communicated at least 30 days in advance when possible.
				</p>
			</section>

			<section>
				<h2>19. Contact Us</h2>
				<p>
					For questions, concerns, or requests regarding this Privacy Policy or your data, please
					contact us at:
				</p>
				<p>
					<strong>Email:</strong>
					<a href="mailto:privacy@reasonsmith.com">privacy@reasonsmith.com</a>
				</p>
				<p>
					<strong>Legal Inquiries:</strong>
					<a href="mailto:legal@reasonsmith.com">legal@reasonsmith.com</a>
				</p>
				<p>
					<strong>Data Protection Officer:</strong> For GDPR-related inquiries, contact our DPO at
					<a href="mailto:privacy@reasonsmith.com">privacy@reasonsmith.com</a>
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
		border-radius: var(--border-radius-xl);
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

	.legal-content h3 {
		font-family: var(--font-family-display);
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 1.5rem 0 0.75rem 0;
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

	.legal-content strong {
		color: var(--color-text-primary);
		font-weight: 600;
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

		.legal-content h3 {
			font-size: 1rem;
		}
	}
</style>
