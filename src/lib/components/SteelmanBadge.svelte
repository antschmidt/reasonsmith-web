<script lang="ts">
	import { POST_TYPE_CONFIG } from '$lib/types/writingStyle';

	export let steelmanScore: number | null = null;
	export let steelmanNotes: string | null = null;
	export let understandingScore: number | null = null;
	export let intellectualHumilityScore: number | null = null;
	export let postType: string | null = null;
	export let compact: boolean = false;

	// Determine which scores to display based on post type
	$: showSteelmanScore = steelmanScore !== null && steelmanScore > 0;
	$: showUnderstandingScore = understandingScore !== null && understandingScore > 0;
	$: showHumilityScore = intellectualHumilityScore !== null && intellectualHumilityScore > 0;

	// Get steelman quality label
	function getSteelmanQualityLabel(score: number): {
		label: string;
		color: string;
		emoji: string;
	} {
		if (score >= 9) return { label: 'Exceptional', color: '#10b981', emoji: '🏆' };
		if (score >= 7) return { label: 'Strong', color: '#3b82f6', emoji: '🛡️' };
		if (score >= 5) return { label: 'Fair', color: '#8b5cf6', emoji: '⚖️' };
		if (score >= 3) return { label: 'Weak', color: '#f59e0b', emoji: '⚠️' };
		return { label: 'Poor', color: '#ef4444', emoji: '❌' };
	}

	function getScoreColor(score: number): string {
		if (score >= 8) return '#10b981'; // Green
		if (score >= 6) return '#3b82f6'; // Blue
		if (score >= 4) return '#f59e0b'; // Orange
		return '#ef4444'; // Red
	}

	// Get post type icon and label
	$: postTypeConfig = postType ? POST_TYPE_CONFIG[postType as keyof typeof POST_TYPE_CONFIG] : null;
</script>

{#if showSteelmanScore || showUnderstandingScore || showHumilityScore}
	<div class="steelman-badge" class:compact>
		{#if showSteelmanScore && steelmanScore}
			{@const quality = getSteelmanQualityLabel(steelmanScore)}
			<div class="score-item steelman" title={steelmanNotes || 'Steelman Quality'}>
				<span class="emoji">{quality.emoji}</span>
				<div class="score-details">
					<div class="score-label">Steelman</div>
					<div class="score-value" style="color: {quality.color}">
						{steelmanScore.toFixed(1)}/10
						<span class="quality-label">{quality.label}</span>
					</div>
					{#if steelmanNotes && !compact}
						<div class="score-notes">{steelmanNotes}</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if showUnderstandingScore && understandingScore}
			<div class="score-item understanding" title="Understanding of opposing views">
				<span class="emoji">🧠</span>
				<div class="score-details">
					<div class="score-label">Understanding</div>
					<div class="score-value" style="color: {getScoreColor(understandingScore)}">
						{understandingScore.toFixed(1)}/10
					</div>
				</div>
			</div>
		{/if}

		{#if showHumilityScore && intellectualHumilityScore}
			<div class="score-item humility" title="Intellectual humility">
				<span class="emoji">🤝</span>
				<div class="score-details">
					<div class="score-label">Humility</div>
					<div class="score-value" style="color: {getScoreColor(intellectualHumilityScore)}">
						{intellectualHumilityScore.toFixed(1)}/10
					</div>
				</div>
			</div>
		{/if}

		{#if postTypeConfig && (postType === 'steelman' || postType === 'synthesis' || postType === 'acknowledgment')}
			<div class="post-type-badge" style="background-color: {postTypeConfig.color}10; color: {postTypeConfig.color}">
				<span class="post-type-icon">{postTypeConfig.icon}</span>
				<span class="post-type-label">{postTypeConfig.label}</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.steelman-badge {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #f8f9fa;
		border-radius: 6px;
		border-left: 3px solid var(--color-primary, #007bff);
		margin-top: 0.5rem;
	}

	.steelman-badge.compact {
		padding: 0.5rem;
		gap: 0.5rem;
		flex-direction: row;
		align-items: center;
	}

	.score-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.steelman-badge.compact .score-item {
		align-items: center;
	}

	.emoji {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.steelman-badge.compact .emoji {
		font-size: 1rem;
	}

	.score-details {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.steelman-badge.compact .score-details {
		flex-direction: row;
		align-items: center;
		gap: 0.25rem;
	}

	.score-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary, #666);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.steelman-badge.compact .score-label {
		display: none;
	}

	.score-value {
		font-size: 0.875rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.quality-label {
		font-size: 0.75rem;
		font-weight: 600;
		opacity: 0.8;
	}

	.steelman-badge.compact .quality-label {
		display: none;
	}

	.score-notes {
		font-size: 0.75rem;
		color: var(--color-text-tertiary, #999);
		font-style: italic;
		margin-top: 0.25rem;
		line-height: 1.4;
	}

	.post-type-badge {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.post-type-icon {
		font-size: 1rem;
	}

	.steelman-badge.compact .post-type-badge {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
	}

	.steelman-badge.compact .post-type-icon {
		font-size: 0.875rem;
	}

	.steelman-badge.compact .post-type-label {
		display: none;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.steelman-badge {
			flex-direction: column;
		}

		.quality-label {
			display: none;
		}
	}
</style>
