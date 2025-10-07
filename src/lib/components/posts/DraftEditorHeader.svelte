<script lang="ts">
	import Button from '../ui/Button.svelte';
	import AnimatedLogo from '../ui/AnimatedLogo.svelte';

	let {
		discussionId,
		discussionTitle = 'Discussion',
		isPublishedVersion = false,
		canPublish = false,
		analysisPassedCriteria = false,
		hasCredits = false,
		isAnalyzing = false,
		analysisResultsDismissed = true,
		goodFaithTesting = false,
		saving = false,
		publishing = false,
		onAnalyze,
		onPublish,
		onContinueEditing,
		onBuyCredits
	} = $props<{
		discussionId: string;
		discussionTitle?: string;
		isPublishedVersion?: boolean;
		canPublish?: boolean;
		analysisPassedCriteria?: boolean;
		hasCredits?: boolean;
		isAnalyzing?: boolean;
		analysisResultsDismissed?: boolean;
		goodFaithTesting?: boolean;
		saving?: boolean;
		publishing?: boolean;
		onAnalyze?: () => void;
		onPublish?: () => void;
		onContinueEditing?: () => void;
		onBuyCredits?: () => void;
	}>();
</script>

<header class="editor-header">
	<div class="header-content">
		<h1>Editing Draft</h1>
		<p class="discussion-context">
			for <a href="/discussions/{discussionId}">{discussionTitle}</a>
		</p>
	</div>
	<div class="header-actions">
		<!-- Button 1: Continue Editing (shown only when form is disabled) -->
		{#if !analysisResultsDismissed && isAnalyzing && onContinueEditing}
			<Button variant="secondary" onclick={onContinueEditing}>Continue Editing</Button>
		{/if}

		<!-- Button 2: Analysis/Publish -->
		{#if isPublishedVersion}
			<!-- State: Already Published -->
			<Button variant="secondary" disabled>Published Version</Button>
		{:else if !canPublish}
			<!-- State A: Need Analysis -->
			{#if !hasCredits}
				<Button
					variant="secondary"
					onclick={onBuyCredits}
					title="You need credits to run analysis"
				>
					Out of Credits. Buy More or Subscribe
				</Button>
			{:else if onAnalyze}
				<Button
					variant="secondary"
					class="logo-btn"
					onclick={onAnalyze}
					disabled={goodFaithTesting || saving || publishing}
					title="Run good faith analysis to enable publishing"
				>
					{#if goodFaithTesting}
						<AnimatedLogo size="20px" isAnimating={true} />
						<div>Analyzing...</div>
					{:else}
						<img src="/logo-only-transparent.svg" alt="" width="40" height="40" />
						<div>Run Analysis to Enable Publishing</div>
					{/if}
				</Button>
			{/if}
		{:else if publishing}
			<!-- State B: Publishing -->
			<Button variant="accent" disabled>
				<AnimatedLogo size="20px" isAnimating={true} /> Publishing...
			</Button>
		{:else if analysisPassedCriteria && onPublish}
			<!-- State C: Analysis Passed - Can Publish -->
			<Button type="button" variant="accent" onclick={onPublish} disabled={saving}>
				<span class="check-icon">✓</span> Publish
			</Button>
		{:else if onContinueEditing}
			<!-- State D: Analysis Failed - Return to Forge -->
			<Button variant="secondary" onclick={onContinueEditing}>
				<span class="x-icon">✗</span> Return to the Forge
			</Button>
		{/if}
	</div>
</header>

<style>
	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--color-border);
	}

	.header-content h1 {
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 2.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 0.75rem 0;
		letter-spacing: -0.025em;
		line-height: 1.2;
	}

	.discussion-context {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.discussion-context a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.discussion-context a:hover {
		text-decoration: underline;
	}

	.header-actions {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.header-actions :global(button) {
		gap: 0.5rem;
		max-width: 12rem;
	}

	.header-actions :global(.logo-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.5rem;
		padding: 0.5rem;
	}

	.header-actions :global(.logo-btn img) {
		opacity: 0.8;
		transition: opacity 0.2s ease;
		object-fit: contain;
		transform: none;
		filter: none;
	}

	.header-actions :global(.logo-btn:hover:not(:disabled) img) {
		opacity: 1;
	}

	.check-icon {
		color: #10b981;
		font-weight: 600;
		margin-right: 0.5rem;
	}

	.x-icon {
		color: #ef4444;
		font-weight: 600;
		margin-right: 0.5rem;
	}

	@media (max-width: 768px) {
		.editor-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}

		.header-actions {
			justify-content: flex-end;
		}
	}
</style>
