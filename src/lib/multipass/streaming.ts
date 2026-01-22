/**
 * Server-Sent Events (SSE) streaming utilities for multi-pass analysis
 *
 * Provides progress updates during long-running analysis operations.
 */

import type { ClaimAnalysisResult, ExtractedClaim, TokenUsage, MultiPassResult } from './types';

// ============================================================================
// Progress Event Types
// ============================================================================

export type ProgressEventType =
	| 'started'
	| 'pass1_started'
	| 'pass1_complete'
	| 'pass2_started'
	| 'pass2_batch_started'
	| 'pass2_batch_complete'
	| 'pass2_claim_complete'
	| 'pass2_complete'
	| 'pass3_started'
	| 'pass3_complete'
	| 'complete'
	| 'error';

export interface BaseProgressEvent {
	type: ProgressEventType;
	timestamp: number;
	/** Elapsed time since analysis started (ms) */
	elapsed: number;
}

export interface StartedEvent extends BaseProgressEvent {
	type: 'started';
	/** Showcase item ID for reconnection */
	showcaseItemId?: string;
}

export interface Pass1StartedEvent extends BaseProgressEvent {
	type: 'pass1_started';
	message: string;
}

export interface Pass1CompleteEvent extends BaseProgressEvent {
	type: 'pass1_complete';
	claimsExtracted: number;
	claims: ExtractedClaim[];
	usage: TokenUsage;
}

export interface Pass2StartedEvent extends BaseProgressEvent {
	type: 'pass2_started';
	totalClaims: number;
	totalBatches: number;
	batchSize: number;
	estimatedTimeMs: number;
}

export interface Pass2BatchStartedEvent extends BaseProgressEvent {
	type: 'pass2_batch_started';
	batchIndex: number;
	totalBatches: number;
	claimIndices: number[];
}

export interface Pass2BatchCompleteEvent extends BaseProgressEvent {
	type: 'pass2_batch_complete';
	batchIndex: number;
	totalBatches: number;
	succeeded: number;
	failed: number;
	results: ClaimAnalysisResult[];
}

export interface Pass2ClaimCompleteEvent extends BaseProgressEvent {
	type: 'pass2_claim_complete';
	claimIndex: number;
	totalClaims: number;
	status: 'completed' | 'failed';
	result: ClaimAnalysisResult;
}

export interface Pass2CompleteEvent extends BaseProgressEvent {
	type: 'pass2_complete';
	totalAnalyzed: number;
	totalFailed: number;
	results: ClaimAnalysisResult[];
	usage: TokenUsage;
}

export interface Pass3StartedEvent extends BaseProgressEvent {
	type: 'pass3_started';
	message: string;
}

export interface Pass3CompleteEvent extends BaseProgressEvent {
	type: 'pass3_complete';
	usage: TokenUsage;
}

export interface CompleteEvent extends BaseProgressEvent {
	type: 'complete';
	result: MultiPassResult;
}

export interface ErrorEvent extends BaseProgressEvent {
	type: 'error';
	error: string;
	phase?: 'pass1' | 'pass2' | 'pass3';
	/** Partial results if available */
	partialResult?: Partial<MultiPassResult>;
}

export type ProgressEvent =
	| StartedEvent
	| Pass1StartedEvent
	| Pass1CompleteEvent
	| Pass2StartedEvent
	| Pass2BatchStartedEvent
	| Pass2BatchCompleteEvent
	| Pass2ClaimCompleteEvent
	| Pass2CompleteEvent
	| Pass3StartedEvent
	| Pass3CompleteEvent
	| CompleteEvent
	| ErrorEvent;

// ============================================================================
// Progress Callback Type
// ============================================================================

export type ProgressCallback = (event: ProgressEvent) => void;

// ============================================================================
// SSE Helpers
// ============================================================================

/**
 * Format a progress event as an SSE message
 */
export function formatSSEMessage(event: ProgressEvent): string {
	const data = JSON.stringify(event);
	return `event: ${event.type}\ndata: ${data}\n\n`;
}

/**
 * Create a progress event with common fields
 */
export function createProgressEvent<T extends ProgressEventType>(
	type: T,
	startTime: number,
	data: Omit<Extract<ProgressEvent, { type: T }>, 'type' | 'timestamp' | 'elapsed'>
): Extract<ProgressEvent, { type: T }> {
	return {
		type,
		timestamp: Date.now(),
		elapsed: Date.now() - startTime,
		...data
	} as Extract<ProgressEvent, { type: T }>;
}

/**
 * Create a ReadableStream that sends SSE events
 */
export function createSSEStream(
	runAnalysis: (sendEvent: ProgressCallback) => Promise<void>
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();

	return new ReadableStream({
		async start(controller) {
			const sendEvent = (event: ProgressEvent) => {
				try {
					const message = formatSSEMessage(event);
					controller.enqueue(encoder.encode(message));
				} catch (err) {
					// Stream may have been closed
					console.error('[SSE] Failed to send event:', err);
				}
			};

			try {
				await runAnalysis(sendEvent);
			} catch (err) {
				// Send error event if analysis fails
				const errorEvent: ErrorEvent = {
					type: 'error',
					timestamp: Date.now(),
					elapsed: 0,
					error: err instanceof Error ? err.message : 'Unknown error'
				};
				sendEvent(errorEvent);
			} finally {
				controller.close();
			}
		}
	});
}

// ============================================================================
// Client-side SSE parsing
// ============================================================================

/**
 * Parse an SSE message from the server
 */
export function parseSSEMessage(data: string): ProgressEvent | null {
	try {
		return JSON.parse(data) as ProgressEvent;
	} catch {
		return null;
	}
}

/**
 * Create an EventSource-like interface for SSE streaming
 * Returns an object with methods to handle different event types
 */
export interface SSEClient {
	onEvent: (callback: (event: ProgressEvent) => void) => void;
	onError: (callback: (error: Error) => void) => void;
	onComplete: (callback: (result: MultiPassResult) => void) => void;
	close: () => void;
}

export function createSSEClient(url: string, options?: RequestInit): SSEClient {
	const eventCallbacks: ((event: ProgressEvent) => void)[] = [];
	const errorCallbacks: ((error: Error) => void)[] = [];
	const completeCallbacks: ((result: MultiPassResult) => void)[] = [];
	let abortController: AbortController | null = new AbortController();

	// Start the fetch
	(async () => {
		try {
			const response = await fetch(url, {
				...options,
				signal: abortController?.signal,
				headers: {
					...options?.headers,
					Accept: 'text/event-stream'
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No response body');
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Process complete messages (separated by double newlines)
				const messages = buffer.split('\n\n');
				buffer = messages.pop() || ''; // Keep incomplete message in buffer

				for (const message of messages) {
					if (!message.trim()) continue;

					// Parse SSE format: "event: type\ndata: json"
					const lines = message.split('\n');
					let eventData: string | null = null;

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							eventData = line.slice(6);
						}
					}

					if (eventData) {
						const event = parseSSEMessage(eventData);
						if (event) {
							eventCallbacks.forEach((cb) => cb(event));

							if (event.type === 'complete') {
								completeCallbacks.forEach((cb) => cb(event.result));
							} else if (event.type === 'error') {
								errorCallbacks.forEach((cb) => cb(new Error(event.error)));
							}
						}
					}
				}
			}
		} catch (err) {
			if (err instanceof Error && err.name !== 'AbortError') {
				errorCallbacks.forEach((cb) => cb(err));
			}
		}
	})();

	return {
		onEvent: (callback) => eventCallbacks.push(callback),
		onError: (callback) => errorCallbacks.push(callback),
		onComplete: (callback) => completeCallbacks.push(callback),
		close: () => {
			abortController?.abort();
			abortController = null;
		}
	};
}
