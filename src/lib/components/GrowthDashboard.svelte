<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import { GET_CONTRIBUTOR_GROWTH_METRICS, GET_ALL_ACHIEVEMENTS } from '$lib/graphql/queries';
	import {
		calculateLevelFromXP,
		getXPForNextLevel,
		getLevelProgress,
		getLevelTitle,
		formatXP,
		getCategoryColor,
		getTierColor
	} from '$lib/utils/growthUtils';
	import {
		Shield,
		GitMerge,
		Handshake,
		TrendingUp,
		BookOpen,
		Users,
		MessageCircle,
		Lightbulb,
		HelpCircle,
		Brain,
		Trophy
	} from '@lucide/svelte';

	// Props
	let { contributorId, compact = false } = $props<{
		contributorId: string;
		compact?: boolean; // Compact mode for sidebar/profile
	}>();

	// State
	let loading = true;
	let error: string | null = null;

	// Growth data
	let totalXP = 0;
	let currentLevel = 1;
	let steelmanCount = 0;
	let steelmanQualityAvg: number | null = null;
	let synthesisCount = 0;
	let acknowledgmentCount = 0;
	let positionsChangedCount = 0;
	let clarifyingQuestionsCount = 0;
	let mindsOpenedCount = 0;

	// Achievements
	let earnedAchievements: any[] = [];
	let allAchievements: any[] = [];
	let recentXPActivity: any[] = [];

	// Computed values
	const levelTitle = $derived(getLevelTitle(currentLevel));
	const xpForNextLevel = $derived(getXPForNextLevel(currentLevel));
	const levelProgress = $derived(getLevelProgress(totalXP));
	const progressPercentage = $derived(
		(levelProgress.currentXP / levelProgress.xpForNextLevel) * 100
	);

	async function loadGrowthData() {
		try {
			loading = true;
			error = null;

			// Load growth metrics using Nhost GraphQL client
			const metricsResult = await nhost.graphql.request(GET_CONTRIBUTOR_GROWTH_METRICS, {
				contributorId
			});

			if (metricsResult.error) {
				throw new Error(metricsResult.error.message || 'Failed to load growth metrics');
			}

			const contributor = metricsResult.data?.contributor_by_pk;
			if (contributor) {
				totalXP = contributor.total_xp || 0;
				currentLevel = contributor.current_level || 1;
				steelmanCount = contributor.steelman_count || 0;
				steelmanQualityAvg = contributor.steelman_quality_avg;
				synthesisCount = contributor.synthesis_count || 0;
				acknowledgmentCount = contributor.acknowledgment_count || 0;
				positionsChangedCount = contributor.positions_changed_count || 0;
				clarifyingQuestionsCount = contributor.clarifying_questions_count || 0;
				mindsOpenedCount = contributor.minds_opened_count || 0;
			}

			earnedAchievements = metricsResult.data?.contributor_achievement || [];
			recentXPActivity = metricsResult.data?.xp_activity || [];

			// Load all achievements
			const achievementsResult = await nhost.graphql.request(GET_ALL_ACHIEVEMENTS);

			if (achievementsResult.error) {
				console.warn('Failed to load achievements:', achievementsResult.error);
			}

			allAchievements = achievementsResult.data?.achievement || [];
		} catch (err: any) {
			console.error('Error loading growth data:', err);
			error = err.message || 'Failed to load growth data';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadGrowthData();
	});

	// Group achievements by category
	const achievementsByCategory = $derived(
		allAchievements.reduce(
			(acc, achievement) => {
				if (!acc[achievement.category]) {
					acc[achievement.category] = [];
				}
				acc[achievement.category].push(achievement);
				return acc;
			},
			{} as Record<string, any[]>
		)
	);

	const earnedAchievementIds = $derived(new Set(earnedAchievements.map((ea) => ea.achievement_id)));

	function isAchievementEarned(achievementId: string): boolean {
		return earnedAchievementIds.has(achievementId);
	}

	function getAchievementIconComponent(achievement: any) {
		// Map achievement categories to Lucide icons
		const categoryIcons: Record<string, any> = {
			steelman: Shield,
			synthesis: GitMerge,
			humility: Handshake,
			growth: TrendingUp,
			evidence: BookOpen,
			community: Users
		};

		return categoryIcons[achievement.category] || Trophy;
	}

	function getMetricIconComponent(metricType: string) {
		const metricIcons: Record<string, any> = {
			steelman: Shield,
			synthesis: GitMerge,
			acknowledgment: Handshake,
			questions: HelpCircle,
			positions: Lightbulb,
			minds: Brain
		};

		return metricIcons[metricType] || MessageCircle;
	}

	function formatActivityType(type: string): string {
		return type
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}
</script>

{#if loading}
	<div class="loading">
		<div class="spinner"></div>
		<p>Loading your growth journey...</p>
	</div>
{:else if error}
	<div class="error">
		<p>⚠️ {error}</p>
		<button on:click={loadGrowthData}>Retry</button>
	</div>
{:else}
	<div class="growth-dashboard" class:compact>
		<!-- Level & XP Section -->
		<section class="level-section">
			<div class="level-header">
				<div class="level-badge">
					<span class="level-number">{currentLevel}</span>
					<span class="level-title">{levelTitle}</span>
				</div>
				<div class="xp-display">
					<span class="xp-value">{formatXP(totalXP)} XP</span>
				</div>
			</div>

			<div class="level-progress">
				<div class="progress-bar">
					<div class="progress-fill" style="width: {progressPercentage}%"></div>
				</div>
				<div class="progress-text">
					<span
						>{formatXP(levelProgress.currentXP)} / {formatXP(levelProgress.xpForNextLevel)} XP</span
					>
					<span>{formatXP(levelProgress.xpToNextLevel)} to next level</span>
				</div>
			</div>
		</section>

		{#if !compact}
			<!-- Growth Metrics Section -->
			<section class="metrics-section">
				<h3>Growth Metrics</h3>
				<div class="metrics-grid">
					<div class="metric-card">
						<div class="metric-icon">
							<svelte:component
								this={getMetricIconComponent('steelman')}
								size={32}
								strokeWidth={1.5}
							/>
						</div>
						<div class="metric-content">
							<div class="metric-value">{steelmanCount}</div>
							<div class="metric-label">Steelmans</div>
							{#if steelmanQualityAvg !== null}
								<div class="metric-subtitle">
									Avg: {steelmanQualityAvg.toFixed(1)}/10
								</div>
							{/if}
						</div>
					</div>

					<div class="metric-card">
						<div class="metric-icon">
							<svelte:component
								this={getMetricIconComponent('synthesis')}
								size={32}
								strokeWidth={1.5}
							/>
						</div>
						<div class="metric-content">
							<div class="metric-value">{synthesisCount}</div>
							<div class="metric-label">Syntheses</div>
						</div>
					</div>

					<div class="metric-card">
						<div class="metric-icon">
							<svelte:component
								this={getMetricIconComponent('acknowledgment')}
								size={32}
								strokeWidth={1.5}
							/>
						</div>
						<div class="metric-content">
							<div class="metric-value">{acknowledgmentCount}</div>
							<div class="metric-label">Acknowledgments</div>
						</div>
					</div>

					<div class="metric-card">
						<div class="metric-icon">
							<svelte:component
								this={getMetricIconComponent('questions')}
								size={32}
								strokeWidth={1.5}
							/>
						</div>
						<div class="metric-content">
							<div class="metric-value">{clarifyingQuestionsCount}</div>
							<div class="metric-label">Clarifying Questions</div>
						</div>
					</div>

					<div class="metric-card">
						<div class="metric-icon">
							<svelte:component
								this={getMetricIconComponent('positions')}
								size={32}
								strokeWidth={1.5}
							/>
						</div>
						<div class="metric-content">
							<div class="metric-value">{positionsChangedCount}</div>
							<div class="metric-label">Positions Changed</div>
						</div>
					</div>

					<div class="metric-card">
						<div class="metric-icon">
							<svelte:component
								this={getMetricIconComponent('minds')}
								size={32}
								strokeWidth={1.5}
							/>
						</div>
						<div class="metric-content">
							<div class="metric-value">{mindsOpenedCount}</div>
							<div class="metric-label">Minds Opened</div>
						</div>
					</div>
				</div>
			</section>

			<!-- Achievements Section -->
			<section class="achievements-section">
				<h3>Achievements ({earnedAchievements.length}/{allAchievements.length})</h3>

				{#each Object.entries(achievementsByCategory) as [category, achievements]}
					<div class="achievement-category">
						<h4 class="category-title" style="color: {getCategoryColor(category)}">
							{category.charAt(0).toUpperCase() + category.slice(1)}
						</h4>
						<div class="achievements-grid">
							{#each achievements as achievement}
								{@const earned = isAchievementEarned(achievement.id)}
								{@const IconComponent = getAchievementIconComponent(achievement)}
								<div class="achievement-card" class:earned class:locked={!earned}>
									<div class="achievement-icon" class:grayscale={!earned}>
										<svelte:component this={IconComponent} size={28} strokeWidth={1.5} />
									</div>
									<div class="achievement-content">
										<div class="achievement-name">{achievement.name}</div>
										<div class="achievement-tier" style="color: {getTierColor(achievement.tier)}">
											{achievement.tier}
										</div>
										<div class="achievement-description">
											{achievement.description}
										</div>
										{#if !earned}
											<div class="achievement-requirement">
												{achievement.requirement_value}
												{achievement.requirement_type}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</section>

			<!-- Recent XP Activity -->
			<section class="activity-section">
				<h3>Recent Activity</h3>
				<div class="activity-list">
					{#each recentXPActivity as activity}
						<div class="activity-item">
							<div class="activity-xp">+{activity.xp_earned} XP</div>
							<div class="activity-details">
								<div class="activity-type">{formatActivityType(activity.activity_type)}</div>
								{#if activity.notes}
									<div class="activity-notes">{activity.notes}</div>
								{/if}
								<div class="activity-time">
									{new Date(activity.created_at).toLocaleDateString()}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}

<style>
	.growth-dashboard {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		font-family: var(--font-family-sans);
	}

	.growth-dashboard.compact {
		gap: var(--space-md);
	}

	.loading,
	.error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-xl);
		text-align: center;
		gap: var(--space-md);
		color: var(--color-text-secondary);
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid var(--color-border-light);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Level Section */
	.level-section {
		background: var(--color-surface);
		padding: var(--space-lg);
		border-radius: var(--border-radius-lg);
		border: 1px solid var(--color-border-light);
	}

	.level-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-md);
	}

	.level-badge {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
	}

	.level-number {
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--color-primary);
		font-family: var(--font-family-serif);
	}

	.level-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		font-family: var(--font-family-sans);
	}

	.xp-display {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
		font-family: var(--font-family-sans);
	}

	.level-progress {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.progress-bar {
		width: 100%;
		height: 24px;
		background: var(--color-surface-alt);
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid var(--color-border-light);
	}

	.progress-fill {
		height: 100%;
		background: var(--color-primary);
		transition: width 0.3s ease;
	}

	.progress-text {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	/* Metrics Section */
	.metrics-section {
		background: var(--color-surface);
		padding: var(--space-lg);
		border-radius: var(--border-radius-lg);
		border: 1px solid var(--color-border-light);
	}

	.metrics-section h3 {
		margin: 0 0 var(--space-md) 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		font-family: var(--font-family-serif);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--space-md);
	}

	.metric-card {
		display: flex;
		gap: var(--space-sm);
		padding: var(--space-md);
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border-light);
		align-items: center;
		transition: border-color 0.2s ease;
	}

	.metric-card:hover {
		border-color: var(--color-border);
	}

	.metric-icon {
		flex-shrink: 0;
		color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.metric-content {
		display: flex;
		flex-direction: column;
	}

	.metric-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: var(--font-family-sans);
	}

	.metric-label {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.metric-subtitle {
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
		margin-top: var(--space-xs);
	}

	/* Achievements Section */
	.achievements-section {
		background: var(--color-surface);
		padding: var(--space-lg);
		border-radius: var(--border-radius-lg);
		border: 1px solid var(--color-border-light);
	}

	.achievements-section h3 {
		margin: 0 0 var(--space-lg) 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		font-family: var(--font-family-serif);
	}

	.achievement-category {
		margin-bottom: var(--space-lg);
	}

	.achievement-category:last-child {
		margin-bottom: 0;
	}

	.category-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 var(--space-sm) 0;
		font-family: var(--font-family-sans);
		text-transform: capitalize;
	}

	.achievements-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--space-md);
	}

	.achievement-card {
		display: flex;
		gap: var(--space-sm);
		padding: var(--space-md);
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border-light);
		transition: all 0.2s ease;
	}

	.achievement-card.earned {
		border-color: var(--color-accent);
		background: var(--color-surface);
		box-shadow: 0 0 0 1px var(--color-accent);
	}

	.achievement-card.locked {
		opacity: 0.5;
	}

	.achievement-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-primary);
		transition: all 0.2s ease;
	}

	.achievement-card.earned .achievement-icon {
		color: var(--color-accent);
	}

	.achievement-icon.grayscale {
		color: var(--color-text-tertiary);
	}

	.achievement-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.achievement-name {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.9375rem;
	}

	.achievement-tier {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.achievement-description {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.achievement-requirement {
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
		margin-top: var(--space-xs);
		font-style: italic;
	}

	/* Activity Section */
	.activity-section {
		background: var(--color-surface);
		padding: var(--space-lg);
		border-radius: var(--border-radius-lg);
		border: 1px solid var(--color-border-light);
	}

	.activity-section h3 {
		margin: 0 0 var(--space-md) 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		font-family: var(--font-family-serif);
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.activity-item {
		display: flex;
		gap: var(--space-md);
		padding: var(--space-md);
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border-light);
		align-items: center;
		transition: border-color 0.2s ease;
	}

	.activity-item:hover {
		border-color: var(--color-border);
	}

	.activity-xp {
		font-weight: 700;
		color: var(--color-accent);
		font-size: 1.125rem;
		flex-shrink: 0;
		font-family: var(--font-family-sans);
	}

	.activity-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex-grow: 1;
	}

	.activity-type {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.9375rem;
	}

	.activity-notes {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.activity-time {
		font-size: 0.75rem;
		color: var(--color-text-tertiary);
	}

	button {
		padding: var(--space-sm) var(--space-md);
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		font-weight: 600;
		font-family: var(--font-family-sans);
		transition: background 0.2s ease;
	}

	button:hover {
		background: var(--color-primary-dark);
	}
</style>
