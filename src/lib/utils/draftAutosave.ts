import { onMount } from 'svelte';

/**
 * Auto-save utility for draft content
 * Automatically saves changes at specified intervals
 *
 * @param getCurrentState - Function that returns current draft state to check for changes
 * @param getStoredState - Function that returns last saved state to compare against
 * @param saveFunction - Async function to call when save is needed
 * @param options - Configuration options
 * @returns Cleanup function
 */
export function useAutosave(
	getCurrentState: () => { title: string; description: string; citations: any[] },
	getStoredState: () => { title: string; description: string; citations: any[] },
	saveFunction: () => Promise<void>,
	options: {
		interval?: number;
		isSaving?: () => boolean;
		isPublishing?: () => boolean;
	} = {}
): () => void {
	const {
		interval = 10000, // 10 seconds default
		isSaving = () => false,
		isPublishing = () => false
	} = options;

	const intervalId = setInterval(() => {
		const current = getCurrentState();
		const stored = getStoredState();

		const citationsChanged =
			JSON.stringify(current.citations || []) !== JSON.stringify(stored.citations || []);

		if (
			!isSaving() &&
			!isPublishing() &&
			(current.title !== stored.title ||
				current.description !== stored.description ||
				citationsChanged)
		) {
			saveFunction();
		}
	}, interval);

	return () => {
		clearInterval(intervalId);
	};
}

/**
 * Svelte-specific autosave hook that cleans up automatically
 * Use this in components with $effect
 *
 * @example
 * $effect(() => {
 *   if (draft && !loading) {
 *     return setupAutosave(
 *       () => ({ title, description, citations: styleMetadata.citations || [] }),
 *       () => ({ title: draft.title, description: draft.description, citations: draft.citations || [] }),
 *       saveDraft,
 *       { isSaving: () => saving, isPublishing: () => publishing }
 *     );
 *   }
 * });
 */
export function setupAutosave(
	getCurrentState: () => { title: string; description: string; citations: any[] },
	getStoredState: () => { title: string; description: string; citations: any[] },
	saveFunction: () => Promise<void>,
	options?: {
		interval?: number;
		isSaving?: () => boolean;
		isPublishing?: () => boolean;
	}
): () => void {
	return useAutosave(getCurrentState, getStoredState, saveFunction, options);
}
