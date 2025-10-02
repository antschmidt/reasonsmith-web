/**
 * PWA (Progressive Web App) utility functions
 * Helps detect and handle PWA vs browser context
 */

/**
 * Detects if the app is running in standalone PWA mode
 * Works across iOS Safari, Android Chrome, and desktop browsers
 */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;

	// Check iOS Safari standalone mode
	const isIOSStandalone = (window.navigator as any).standalone === true;

	// Check Android/Desktop PWA standalone mode
	const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;

	// Check minimal-ui mode (also considered PWA context)
	const isMinimalUI = window.matchMedia('(display-mode: minimal-ui)').matches;

	return isIOSStandalone || isStandaloneDisplay || isMinimalUI;
}

/**
 * Detects if the app is installed as a PWA
 * Note: This only works if running in standalone mode
 */
export function isInstalled(): boolean {
	return isStandalone();
}

/**
 * Detects if the user is on a mobile device
 */
export function isMobile(): boolean {
	if (typeof window === 'undefined') return false;

	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		window.navigator.userAgent
	);
}

/**
 * Detects if the user is on iOS
 */
export function isIOS(): boolean {
	if (typeof window === 'undefined') return false;

	return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

/**
 * Detects if the user is on Android
 */
export function isAndroid(): boolean {
	if (typeof window === 'undefined') return false;

	return /Android/.test(window.navigator.userAgent);
}

/**
 * Gets the appropriate redirect URL for OAuth based on context
 * @param path The path to redirect to (e.g., '/auth/callback')
 * @param fromPWA Whether the auth was initiated from PWA
 */
export function getOAuthRedirectURL(path: string, fromPWA: boolean = false): string {
	if (typeof window === 'undefined') return path;

	const url = new URL(path, window.location.origin);

	// Add parameter to indicate auth came from PWA
	if (fromPWA || isStandalone()) {
		url.searchParams.set('pwa', '1');
	}

	return url.toString();
}

/**
 * Checks if current URL indicates we came from PWA context
 */
export function isFromPWA(): boolean {
	if (typeof window === 'undefined') return false;

	const params = new URLSearchParams(window.location.search);
	return params.get('pwa') === '1';
}

/**
 * Opens the PWA or redirects appropriately
 * Useful for "Return to App" buttons
 */
export function returnToPWA(path: string = '/'): void {
	if (typeof window === 'undefined') return;

	// If we're already in PWA, just navigate
	if (isStandalone()) {
		window.location.href = path;
		return;
	}

	// Try to focus existing PWA window (doesn't always work)
	// Fallback: navigate in current window
	window.location.href = path;
}
