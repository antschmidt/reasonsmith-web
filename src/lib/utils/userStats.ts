export interface UserStats {
	goodFaithRate: number;
	sourceAccuracy: number;
	reputationScore: number;
	totalPosts: number;
	totalDiscussions: number;
	participatedDiscussions: number;
}

export interface RawUserStatsData {
	userPosts: Array<{
		id: string;
		good_faith_score?: number | null;
		good_faith_label?: string | null;
		created_at: string;
		style_metadata?: any;
	}>;
	userDiscussions: Array<{
		id: string;
		good_faith_score?: number | null;
		good_faith_label?: string | null;
		created_at: string;
	}>;
	discussionCount: { aggregate: { count: number } };
	postCount: { aggregate: { count: number } };
	participatedDiscussions: { aggregate: { count: number } };
}

export function calculateUserStats(data: RawUserStatsData): UserStats {
	const posts = data.userPosts || [];
	const discussions = data.userDiscussions || [];

	// Combine posts and discussions for overall metrics
	const allContent = [
		...posts.map((p) => ({
			good_faith_score: p.good_faith_score,
			good_faith_label: p.good_faith_label
		})),
		...discussions.map((d) => ({
			good_faith_score: d.good_faith_score,
			good_faith_label: d.good_faith_label
		}))
	];

	// Calculate Good Faith Rate
	const contentWithScores = allContent.filter(
		(item) => item.good_faith_score !== null && item.good_faith_score !== undefined
	);

	let goodFaithRate = 0;
	if (contentWithScores.length > 0) {
		const goodFaithThreshold = 0.6; // Consider anything above 60% as good faith
		const goodFaithCount = contentWithScores.filter(
			(item) => (item.good_faith_score || 0) >= goodFaithThreshold
		).length;
		goodFaithRate = Math.round((goodFaithCount / contentWithScores.length) * 100);
	}

	// Calculate Source Accuracy
	// This would ideally be based on citation data in style_metadata
	let sourceAccuracy = 0;
	const postsWithCitations = posts.filter(
		(post) =>
			post.style_metadata &&
			post.style_metadata.citations &&
			Array.isArray(post.style_metadata.citations) &&
			post.style_metadata.citations.length > 0
	);

	if (postsWithCitations.length > 0) {
		// For now, assume all citations are accurate (placeholder calculation)
		// In reality, this would need manual review or automated validation
		sourceAccuracy = 95; // Placeholder high score for users who cite sources
	} else if (posts.length > 0) {
		// Lower score for users who don't provide citations
		sourceAccuracy = 70;
	}

	// Calculate Reputation Score
	// Base score calculation considering multiple factors
	const totalDiscussions = data.discussionCount?.aggregate?.count || 0;
	const totalPosts = data.postCount?.aggregate?.count || 0;
	const participatedDiscussions = data.participatedDiscussions?.aggregate?.count || 0;

	let reputationScore = 0;

	// Base points for activity
	reputationScore += totalDiscussions * 50; // 50 points per discussion started
	reputationScore += totalPosts * 10; // 10 points per post/reply
	reputationScore += participatedDiscussions * 5; // 5 points per discussion participated in

	// Good faith multiplier
	if (goodFaithRate >= 80) {
		reputationScore *= 1.3; // 30% bonus for high good faith rate
	} else if (goodFaithRate >= 60) {
		reputationScore *= 1.1; // 10% bonus for decent good faith rate
	} else if (goodFaithRate < 40 && contentWithScores.length > 5) {
		reputationScore *= 0.7; // 30% penalty for consistently low good faith
	}

	// Source accuracy bonus
	if (sourceAccuracy >= 90) {
		reputationScore += 100; // Bonus for high source accuracy
	}

	// Cap the reputation score to prevent runaway scores
	reputationScore = Math.min(Math.round(reputationScore), 10000);

	return {
		goodFaithRate,
		sourceAccuracy,
		reputationScore,
		totalPosts,
		totalDiscussions,
		participatedDiscussions
	};
}

export function formatStatValue(value: number, type: 'percentage' | 'score' | 'count'): string {
	switch (type) {
		case 'percentage':
			return `${value}%`;
		case 'score':
			return value.toLocaleString();
		case 'count':
			return value.toLocaleString();
		default:
			return value.toString();
	}
}
