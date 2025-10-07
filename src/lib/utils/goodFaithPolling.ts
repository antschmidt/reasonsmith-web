/**
 * Polling utility for checking async analysis completion
 * Used when analysis is triggered and completes on the backend
 */

export type PollingOptions = {
	interval?: number; // Polling interval in milliseconds (default: 2000)
	maxPolls?: number; // Maximum number of polls before timeout (default: 60)
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
		interval = 2000,
		maxPolls = 60, // 2 minutes at 2 second intervals
		onProgress,
		onTimeout,
		onError
	} = options;

	let pollCount = 0;
	let isRunning = true;

	const intervalId = setInterval(async () => {
		if (!isRunning) {
			clearInterval(intervalId);
			return;
		}

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
					clearInterval(intervalId);
					isRunning = false;
					onComplete(status);
					return;
				}
			}

			// Check for timeout
			if (pollCount >= maxPolls) {
				clearInterval(intervalId);
				isRunning = false;
				onTimeout?.();
				console.log('Analysis polling timed out');
			}
		} catch (error) {
			console.error('Error polling for analysis:', error);
			onError?.(error);
		}
	}, interval);

	// Return cleanup function
	return () => {
		isRunning = false;
		clearInterval(intervalId);
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
