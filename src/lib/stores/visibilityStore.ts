import { writable } from 'svelte/store';

/**
 * Visibility Store
 *
 * Tracks whether the page is visible and focused. Used to pause subscriptions
 * and polling when the user is not actively viewing the app.
 *
 * Detection methods:
 * - Primary: visibilitychange event (tab switch, minimize, PWA background)
 * - Fallback: focus/blur events (window focus changes on desktop)
 *
 * Works for:
 * - Browser tab switches
 * - Window minimization
 * - Alt-tab to another app (desktop)
 * - PWA backgrounding (mobile and desktop)
 */

function createVisibilityStore() {
	const isVisible =
		typeof document !== 'undefined'
			? document.visibilityState === 'visible' && document.hasFocus()
			: true;

	const { subscribe, set } = writable(isVisible);

	if (typeof document !== 'undefined') {
		// Primary: visibility change (tab switch, minimize, PWA background)
		document.addEventListener('visibilitychange', () => {
			set(document.visibilityState === 'visible' && document.hasFocus());
		});

		// Fallback: focus/blur (window focus changes on desktop)
		window.addEventListener('blur', () => set(false));
		window.addEventListener('focus', () => {
			set(document.visibilityState === 'visible');
		});
	}

	return { subscribe };
}

export const isPageVisible = createVisibilityStore();
