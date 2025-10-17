<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import { GET_SUBSCRIPTION_PLANS } from '$lib/graphql/queries';
	import { Check } from '@lucide/svelte';

	let user = $state(nhost.auth.getUser());
	let plans = $state<any[]>([]);
	let loading = $state(true);
	let selectedPlan = $state<string | null>(null);

	onMount(async () => {
		// Check if user is authenticated
		const currentUser = nhost.auth.getUser();
		if (!currentUser) {
			await goto('/');
			return;
		}

		user = currentUser;

		// Fetch subscription plans using nhost GraphQL
		try {
			const result = await nhost.graphql.request(
				GET_SUBSCRIPTION_PLANS.loc?.source?.body || GET_SUBSCRIPTION_PLANS
			);

			plans = result.data?.subscription_plan || [];
		} catch (error) {
			console.error('Failed to load subscription plans:', error);
		} finally {
			loading = false;
		}
	});

	function handleSelectPlan(planName: string) {
		selectedPlan = planName;
		// TODO: Integrate with Stripe or payment provider
		alert(
			`Payment integration coming soon!\n\nSelected plan: ${planName}\n\nFor now, contact support to enable Pro features.`
		);
	}

	function formatPrice(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	function getPlanFeatures(features: any): string[] {
		if (typeof features === 'string') {
			features = JSON.parse(features);
		}

		const featureList = [];

		if (features.realtime_collaboration) {
			featureList.push('Real-time collaborative editing');
			featureList.push('See cursors and edits live');
			featureList.push('Automatic sync and conflict resolution');
		}

		if (features.max_collaborators) {
			featureList.push(`Up to ${features.max_collaborators} collaborators per draft`);
		}

		return featureList;
	}
</script>

<svelte:head>
	<title>Upgrade to Pro - ReasonSmith</title>
</svelte:head>

<div class="upgrade-page">
	<div class="container">
		<header class="page-header">
			<h1>Upgrade to Pro</h1>
			<p class="subtitle">
				Unlock real-time collaboration and work together seamlessly on complex discussions
			</p>
		</header>

		{#if loading}
			<div class="loading">
				<div class="spinner"></div>
				<p>Loading subscription plans...</p>
			</div>
		{:else if plans.length === 0}
			<div class="no-plans">
				<p>No subscription plans available at this time.</p>
				<a href="/" class="btn btn-primary">Go Home</a>
			</div>
		{:else}
			<div class="plans-grid">
				{#each plans as plan}
					{@const features = getPlanFeatures(plan.features)}
					<div class="plan-card" class:featured={plan.name === 'pro'}>
						{#if plan.name === 'pro'}
							<div class="featured-badge">Most Popular</div>
						{/if}

						<div class="plan-header">
							<h2>{plan.display_name}</h2>
							{#if plan.description}
								<p class="plan-description">{plan.description}</p>
							{/if}
						</div>

						<div class="plan-pricing">
							{#if plan.price_monthly === 0}
								<div class="price">
									<span class="amount">Free</span>
								</div>
							{:else}
								<div class="price">
									<span class="currency">$</span>
									<span class="amount">{formatPrice(plan.price_monthly)}</span>
									<span class="period">/month</span>
								</div>
							{/if}
						</div>

						<div class="plan-features">
							<h3>Features:</h3>
							{#if features.length > 0}
								<ul>
									{#each features as feature}
										<li>
											<Check size="18" />
											<span>{feature}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="no-features">Basic collaboration features</p>
							{/if}
						</div>

						<div class="plan-action">
							{#if plan.name === 'free'}
								<button class="btn btn-secondary" disabled> Current Plan </button>
							{:else}
								<button
									class="btn btn-primary"
									onclick={() => handleSelectPlan(plan.name)}
									disabled={selectedPlan !== null}
								>
									{selectedPlan === plan.name ? 'Processing...' : 'Upgrade Now'}
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<div class="faq-section">
				<h2>Frequently Asked Questions</h2>

				<div class="faq-item">
					<h3>How does real-time collaboration work?</h3>
					<p>
						When all collaborators on a draft have Pro subscriptions, you'll be able to edit
						together in real-time, similar to Google Docs. You'll see each other's cursors, edits
						appear instantly, and changes are automatically synced.
					</p>
				</div>

				<div class="faq-item">
					<h3>Can I cancel anytime?</h3>
					<p>
						Yes! There are no long-term commitments. You can cancel your subscription at any time,
						and you'll continue to have access until the end of your billing period.
					</p>
				</div>

				<div class="faq-item">
					<h3>What happens to my drafts if I cancel?</h3>
					<p>
						Your drafts and content remain yours forever. If you cancel, you'll lose access to
						real-time collaboration features, but you can still edit and collaborate using the basic
						asynchronous mode.
					</p>
				</div>

				<div class="faq-item">
					<h3>Do all collaborators need Pro?</h3>
					<p>
						Yes, for real-time editing to work, all users collaborating on a specific draft need to
						have active Pro subscriptions. This ensures the best experience for everyone.
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.upgrade-page {
		min-height: 100vh;
		padding: 2rem 1rem;
		background: var(--color-background);
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
	}

	.page-header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.page-header h1 {
		margin: 0 0 0.75rem 0;
		font-size: 2.5rem;
		font-weight: 700;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.subtitle {
		margin: 0;
		font-size: 1.125rem;
		color: var(--color-text-secondary);
		max-width: 600px;
		margin: 0 auto;
	}

	.loading,
	.no-plans {
		text-align: center;
		padding: 4rem 2rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.plans-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 2rem;
		margin-bottom: 4rem;
	}

	.plan-card {
		background: var(--color-surface);
		border: 2px solid var(--color-border);
		border-radius: var(--border-radius-lg);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		position: relative;
		transition: all 0.3s ease;
	}

	.plan-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
	}

	.plan-card.featured {
		border-color: #667eea;
		box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
	}

	.featured-badge {
		position: absolute;
		top: -12px;
		left: 50%;
		transform: translateX(-50%);
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-md);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.plan-header {
		margin-bottom: 1.5rem;
	}

	.plan-header h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.plan-description {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--color-text-secondary);
	}

	.plan-pricing {
		margin-bottom: 2rem;
	}

	.price {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}

	.currency {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.amount {
		font-size: 3rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.period {
		font-size: 1.125rem;
		color: var(--color-text-secondary);
	}

	.plan-features {
		flex: 1;
		margin-bottom: 2rem;
	}

	.plan-features h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.plan-features ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.plan-features li {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		font-size: 0.9375rem;
		color: var(--color-text);
	}

	.plan-features li :global(svg) {
		flex-shrink: 0;
		color: #52b788;
		margin-top: 0.125rem;
	}

	.no-features {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.btn {
		width: 100%;
		padding: 1rem;
		border-radius: var(--border-radius-md);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.btn-primary:hover:not(:disabled) {
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
		transform: translateY(-2px);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: transparent;
		color: var(--color-text-secondary);
		border: 2px solid var(--color-border);
	}

	.btn-secondary:disabled {
		cursor: not-allowed;
	}

	.faq-section {
		max-width: 800px;
		margin: 0 auto;
		padding-top: 3rem;
		border-top: 1px solid var(--color-border);
	}

	.faq-section > h2 {
		margin: 0 0 2rem 0;
		font-size: 2rem;
		font-weight: 700;
		text-align: center;
		color: var(--color-text);
	}

	.faq-item {
		margin-bottom: 2rem;
	}

	.faq-item h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.faq-item p {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.subtitle {
			font-size: 1rem;
		}

		.plans-grid {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.plan-card {
			padding: 1.5rem;
		}

		.amount {
			font-size: 2.5rem;
		}
	}
</style>
