import { writable } from 'svelte/store';

interface ContributorData {
	avatar_url?: string | null;
	display_name?: string | null;
	handle?: string | null;
	role?: string | null;
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
		reset: () => set(null)
	};
}

export const contributorStore = createContributorStore();
