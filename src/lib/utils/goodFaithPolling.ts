/**
 * Polling utility for checking async analysis completion
 * Used when analysis is triggered and completes on the backend
 */

export type PollingOptions = {
	interval?: number; // Initial polling interval in milliseconds (default: 1000)
	maxPolls?: number; // Maximum number of polls before timeout (default: 30)
	useExponentialBackoff?: boolean; // Use exponential backoff (default: true)
	maxInterval?: number; // Maximum interval when using backoff (default: 10000)
	onProgress?: (pollCount: number, maxPolls: number) => void;
	onTimeout?: () => void;
	onError?: (error: unknown) => void;
};

export type AnalysisStatus = {
	good_faith_score: number | null;
	good_faith_label: string | null;
	good_faith_last_evaluated: string | null;
	good_faith_analysis: any;
	edited_at: string | null;
};

/**
 * Polls for analysis completion by checking if analysis timestamp is newer than edit timestamp
 *
 * @param fetchAnalysisStatus - Function to fetch current analysis status
 * @param onComplete - Callback when analysis is complete with updated data
 * @param options - Polling configuration
 * @returns Cleanup function to stop polling
 */
export function startPollingForAnalysis(
	fetchAnalysisStatus: () => Promise<AnalysisStatus>,
	onComplete: (status: AnalysisStatus) => void,
	options: PollingOptions = {}
): () => void {
	const {
		interval = 1000, // Start with 1 second
		maxPolls = 30, // Reduced from 60 since we use backoff
		useExponentialBackoff = true,
		maxInterval = 10000, // Cap at 10 seconds
		onProgress,
		onTimeout,
		onError
	} = options;

	let pollCount = 0;
	let isRunning = true;
	let currentInterval = interval;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	async function poll() {
		if (!isRunning) return;

		pollCount++;

		// Report progress if callback provided
		onProgress?.(pollCount, maxPolls);

		try {
			const status = await fetchAnalysisStatus();

			// Check if analysis completed
			if (status.good_faith_last_evaluated) {
				const analysisDate = new Date(status.good_faith_last_evaluated);
				const editDate = status.edited_at ? new Date(status.edited_at) : null;

				// Analysis is newer than last edit (or no edit date) = completed
				if (!editDate || analysisDate > editDate) {
					isRunning = false;
					onComplete(status);
					return;
				}
			}

			// Check for timeout
			if (pollCount >= maxPolls) {
				isRunning = false;
				onTimeout?.();
				console.log('Analysis polling timed out');
				return;
			}

			// Schedule next poll with exponential backoff
			if (useExponentialBackoff) {
				// Increase interval: 1s, 1.5s, 2.25s, 3.4s, 5s, 7.5s, 10s (capped)
				currentInterval = Math.min(currentInterval * 1.5, maxInterval);
			}

			timeoutId = setTimeout(poll, currentInterval);
		} catch (error) {
			console.error('Error polling for analysis:', error);
			onError?.(error);
			// Still schedule next poll on error
			if (isRunning && pollCount < maxPolls) {
				timeoutId = setTimeout(poll, currentInterval);
			}
		}
	}

	// Start first poll
	timeoutId = setTimeout(poll, currentInterval);

	// Return cleanup function
	return () => {
		isRunning = false;
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};
}

/**
 * Session storage helpers for tracking analysis state across navigation
 */
export const analysisSession = {
	/**
	 * Mark that analysis is in progress for a draft
	 */
	setInProgress(draftId: string): void {
		sessionStorage.setItem(`analysis-${draftId}`, 'true');
	},

	/**
	 * Check if analysis is in progress for a draft
	 */
	isInProgress(draftId: string): boolean {
		return sessionStorage.getItem(`analysis-${draftId}`) === 'true';
	},

	/**
	 * Clear analysis in-progress flag
	 */
	clear(draftId: string): void {
		sessionStorage.removeItem(`analysis-${draftId}`);
	}
};
