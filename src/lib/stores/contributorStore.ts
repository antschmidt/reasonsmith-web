import { writable } from 'svelte/store';
import type { ReviewerRegister } from '$lib/goodFaith';
import type { LevelDisplayMode } from '$lib/utils/growthUtils';

export type GrowthVisibility = 'hidden' | 'quiet' | 'normal';
export type OnboardingState =
	| 'not_started'
	| 'steelman_prompt'
	| 'analysis_shown'
	| 'revision_offered'
	| 'published'
	| 'completed'
	| 'skipped';

interface ContributorData {
	id?: string | null;
	avatar_url?: string | null;
	display_name?: string | null;
	handle?: string | null;
	role?: string | null;
	reviewer_register?: ReviewerRegister | null;
	prefers_plain_language?: boolean | null;
	growth_visibility?: GrowthVisibility | null;
	level_display_mode?: LevelDisplayMode | null;
	onboarding_state?: OnboardingState | null;
	onboarding_discussion_id?: string | null;
	onboarding_completed_at?: string | null;
}

function createContributorStore() {
	const { subscribe, set, update } = writable<ContributorData | null>(null);

	return {
		subscribe,
		set,
		updateAvatar: (avatarUrl: string | null) => {
			update((data) => {
				if (data) {
					return { ...data, avatar_url: avatarUrl };
				}
				return data;
			});
		},
		updatePreferences: (prefs: Partial<ContributorData>) => {
			update((data) => {
				if (data) {
					return { ...data, ...prefs };
				}
				return data;
			});
		},
		reset: () => set(null)
	};
}

export const contributorStore = createContributorStore();
