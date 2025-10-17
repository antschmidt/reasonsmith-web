<script lang="ts">
	// Modal prompt encouraging users to upgrade to Pro for real-time collaboration
	import { X } from '@lucide/svelte';

	let {
		isOpen = $bindable(false),
		usersWithoutAccess = [],
		onUpgrade = () => {}
	} = $props<{
		isOpen?: boolean;
		usersWithoutAccess?: string[];
		onUpgrade?: () => void;
	}>();

	function close() {
		isOpen = false;
	}

	function handleUpgrade() {
		onUpgrade();
		close();
	}
</script>

{#if isOpen}
	<div class="modal-backdrop" onclick={close}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<button class="close-btn" onclick={close} aria-label="Close">
				<X size="20" />
			</button>

			<div class="modal-header">
				<div class="icon-wrapper">
					<svg
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
						<circle cx="9" cy="7" r="4"></circle>
						<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
						<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
					</svg>
				</div>
				<h2>Upgrade to Real-Time Collaboration</h2>
				<p class="subtitle">Edit together, in real-time, like Google Docs</p>
			</div>

			<div class="modal-body">
				{#if usersWithoutAccess.length > 0}
					<div class="info-box">
						<p>
							<strong>Note:</strong> The following
							{usersWithoutAccess.length === 1 ? 'user needs' : 'users need'} to upgrade:
						</p>
						<ul>
							{#each usersWithoutAccess as user}
								<li>{user}</li>
							{/each}
						</ul>
						<p class="info-note">
							All collaborators must have Pro access for real-time editing to work.
						</p>
					</div>
				{/if}

				<div class="features-list">
					<h3>Pro Features Include:</h3>
					<ul>
						<li>
							<span class="feature-icon">✨</span>
							<div>
								<strong>Real-Time Collaboration</strong>
								<p>See cursors and edits as they happen, just like Google Docs</p>
							</div>
						</li>
						<li>
							<span class="feature-icon">👥</span>
							<div>
								<strong>Up to 10 Collaborators</strong>
								<p>Work together with larger teams on complex discussions</p>
							</div>
						</li>
						<li>
							<span class="feature-icon">💾</span>
							<div>
								<strong>Automatic Sync</strong>
								<p>Never lose changes - all edits are saved and synced instantly</p>
							</div>
						</li>
						<li>
							<span class="feature-icon">🎨</span>
							<div>
								<strong>Collaborative Cursors</strong>
								<p>See where everyone is editing with color-coded cursors</p>
							</div>
						</li>
					</ul>
				</div>

				<div class="pricing">
					<div class="price">
						<span class="amount">$9.99</span>
						<span class="period">/month</span>
					</div>
					<p class="price-note">Cancel anytime. No long-term commitment.</p>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn btn-secondary" onclick={close}>Maybe Later</button>
				<button class="btn btn-primary" onclick={handleUpgrade}>Upgrade to Pro</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	@media (prefers-color-scheme: light) {
		.modal-backdrop {
			background: rgba(255, 255, 255, 0.8);
		}
	}

	.modal-content {
		background: var(--color-surface);
		border-radius: var(--border-radius-lg);
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		position: relative;
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		transition: all 0.15s ease;
		z-index: 1;
	}

	.close-btn:hover {
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		color: var(--color-text);
	}

	.modal-header {
		text-align: center;
		padding: 2rem 2rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.icon-wrapper {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 80px;
		height: 80px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 50%;
		margin-bottom: 1rem;
		color: white;
	}

	.modal-header h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.subtitle {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text-secondary);
	}

	.modal-body {
		padding: 2rem;
	}

	.info-box {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		border-radius: var(--border-radius-md);
		padding: 1rem;
		margin-bottom: 2rem;
	}

	.info-box p {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
	}

	.info-box ul {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	.info-box li {
		margin: 0.25rem 0;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.info-note {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.features-list h3 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.features-list ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.features-list li {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.feature-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.features-list li div {
		flex: 1;
	}

	.features-list strong {
		display: block;
		margin-bottom: 0.25rem;
		font-size: 0.9375rem;
		color: var(--color-text);
	}

	.features-list p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.pricing {
		margin-top: 2rem;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
		border-radius: var(--border-radius-md);
		text-align: center;
	}

	.price {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}

	.amount {
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.period {
		font-size: 1.125rem;
		color: var(--color-text-secondary);
	}

	.price-note {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.modal-footer {
		padding: 1.5rem 2rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-md);
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
	}

	.btn-secondary {
		background: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}

	.btn-secondary:hover {
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
		color: var(--color-text);
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.btn-primary:hover {
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
		transform: translateY(-1px);
	}

	@media (max-width: 768px) {
		.modal-header {
			padding: 1.5rem 1.5rem 1rem;
		}

		.modal-header h2 {
			font-size: 1.5rem;
		}

		.modal-body {
			padding: 1.5rem;
		}

		.modal-footer {
			padding: 1rem 1.5rem;
			flex-direction: column;
		}

		.btn {
			width: 100%;
		}
	}
</style>
