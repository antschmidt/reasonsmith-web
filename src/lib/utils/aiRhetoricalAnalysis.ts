/**
 * AI Rhetorical Analysis Client
 *
 * Calls the /api/arguments/analyze-node endpoint to get AI-powered
 * rhetorical analysis for argument nodes. Includes debouncing,
 * caching, and graceful error handling so the UI never blocks.
 */

import type { ArgumentNodeType, ArgumentEdgeType } from '$lib/types/argument';

// ============================================
// Types
// ============================================

export interface AIAnalysisAlert {
	id: string;
	label: string;
	description: string;
	explanation: string;
	category: 'fallacy' | 'manipulative' | 'cultish' | 'weak';
	severity: 'info' | 'warning' | 'error';
	matchedText?: string;
	source: 'ai';
}

export interface AIAnalysisResult {
	alerts: AIAnalysisAlert[];
	overallQuality: 'strong' | 'adequate' | 'weak' | 'problematic';
	suggestion?: string;
	analyzedAt: string;
	model: string;
}

export interface ContextNode {
	type: ArgumentNodeType;
	content: string;
	relationship?: string;
}

export type AIAnalysisStatus = 'idle' | 'pending' | 'done' | 'error';

export interface AIAnalysisState {
	status: AIAnalysisStatus;
	result: AIAnalysisResult | null;
	error: string | null;
}

// ============================================
// Cache
// ============================================

/** Cache key = hash of content + nodeType */
const analysisCache = new Map<string, AIAnalysisResult>();
const MAX_CACHE_SIZE = 100;

function makeCacheKey(content: string, nodeType: ArgumentNodeType): string {
	// Simple hash — content + type is sufficient for cache identity
	return `${nodeType}::${content.trim()}`;
}

function getCached(content: string, nodeType: ArgumentNodeType): AIAnalysisResult | null {
	const key = makeCacheKey(content, nodeType);
	return analysisCache.get(key) ?? null;
}

function setCached(content: string, nodeType: ArgumentNodeType, result: AIAnalysisResult): void {
	const key = makeCacheKey(content, nodeType);

	// Evict oldest entries if cache is full
	if (analysisCache.size >= MAX_CACHE_SIZE) {
		const firstKey = analysisCache.keys().next().value;
		if (firstKey !== undefined) {
			analysisCache.delete(firstKey);
		}
	}

	analysisCache.set(key, result);
}

// ============================================
// Debounce tracking
// ============================================

/** Track pending debounce timers by node ID so we can cancel on re-trigger */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Track in-flight AbortControllers by node ID so we can cancel on re-trigger */
const pendingAborts = new Map<string, AbortController>();

// ============================================
// Core API call
// ============================================

async function callAnalyzeEndpoint(
	content: string,
	nodeType: ArgumentNodeType,
	contextNodes: ContextNode[],
	signal?: AbortSignal
): Promise<AIAnalysisResult> {
	const response = await fetch('/api/arguments/analyze-node', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			content,
			nodeType,
			contextNodes
		}),
		signal
	});

	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.error || `Analysis failed (${response.status})`);
	}

	return response.json();
}

// ============================================
// Public API
// ============================================

/**
 * Request AI analysis for a node. Returns immediately with the current state
 * and calls `onUpdate` when results arrive. Debounces by nodeId so rapid
 * edits don't flood the API.
 *
 * @param nodeId - Unique node ID (used for debounce + abort tracking)
 * @param content - The node's text content
 * @param nodeType - The node's type (claim, evidence, etc.)
 * @param contextNodes - Optional surrounding nodes for context
 * @param onUpdate - Callback fired when analysis state changes
 * @param debounceMs - Debounce delay in ms (default 1500ms)
 */
export function requestAIAnalysis(
	nodeId: string,
	content: string,
	nodeType: ArgumentNodeType,
	contextNodes: ContextNode[] = [],
	onUpdate: (state: AIAnalysisState) => void,
	debounceMs: number = 1500
): void {
	// Cancel any existing pending request for this node
	cancelAIAnalysis(nodeId);

	// Don't analyze empty or very short content
	if (!content || content.trim().length < 10) {
		onUpdate({ status: 'idle', result: null, error: null });
		return;
	}

	// Check cache first
	const cached = getCached(content, nodeType);
	if (cached) {
		onUpdate({ status: 'done', result: cached, error: null });
		return;
	}

	// Signal that analysis is pending
	onUpdate({ status: 'pending', result: null, error: null });

	// Debounce the actual API call
	const timer = setTimeout(async () => {
		pendingTimers.delete(nodeId);

		const abortController = new AbortController();
		pendingAborts.set(nodeId, abortController);

		try {
			const result = await callAnalyzeEndpoint(
				content,
				nodeType,
				contextNodes,
				abortController.signal
			);

			// Cache the result
			setCached(content, nodeType, result);

			// Only update if this request wasn't cancelled
			if (!abortController.signal.aborted) {
				onUpdate({ status: 'done', result, error: null });
			}
		} catch (err: unknown) {
			if (err instanceof Error && err.name === 'AbortError') {
				// Request was cancelled — don't update state
				return;
			}

			const message = err instanceof Error ? err.message : 'AI analysis failed';

			if (!abortController.signal.aborted) {
				onUpdate({ status: 'error', result: null, error: message });
			}
		} finally {
			pendingAborts.delete(nodeId);
		}
	}, debounceMs);

	pendingTimers.set(nodeId, timer);
}

/**
 * Trigger AI analysis immediately (no debounce). Used after a node is
 * saved/created, when we know the content is final.
 */
export async function analyzeNodeImmediate(
	nodeId: string,
	content: string,
	nodeType: ArgumentNodeType,
	contextNodes: ContextNode[] = []
): Promise<AIAnalysisResult | null> {
	// Cancel any pending debounced request
	cancelAIAnalysis(nodeId);

	if (!content || content.trim().length < 10) {
		return null;
	}

	// Check cache
	const cached = getCached(content, nodeType);
	if (cached) return cached;

	try {
		const result = await callAnalyzeEndpoint(content, nodeType, contextNodes);
		setCached(content, nodeType, result);
		return result;
	} catch {
		return null;
	}
}

/**
 * Cancel any pending or in-flight analysis for a node.
 */
export function cancelAIAnalysis(nodeId: string): void {
	const timer = pendingTimers.get(nodeId);
	if (timer) {
		clearTimeout(timer);
		pendingTimers.delete(nodeId);
	}

	const abort = pendingAborts.get(nodeId);
	if (abort) {
		abort.abort();
		pendingAborts.delete(nodeId);
	}
}

/**
 * Build context nodes from the graph for a given node.
 * Extracts directly connected nodes with their relationship types.
 */
export function buildContextForNode(
	nodeId: string,
	allNodes: Array<{ id: string; type: ArgumentNodeType; content: string }>,
	allEdges: Array<{
		from_node: string;
		to_node: string;
		type: ArgumentEdgeType;
	}>
): ContextNode[] {
	const context: ContextNode[] = [];
	const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

	for (const edge of allEdges) {
		if (edge.from_node === nodeId) {
			const target = nodeMap.get(edge.to_node);
			if (target) {
				context.push({
					type: target.type,
					content: target.content,
					relationship: `this node ${edge.type} it`
				});
			}
		} else if (edge.to_node === nodeId) {
			const source = nodeMap.get(edge.from_node);
			if (source) {
				context.push({
					type: source.type,
					content: source.content,
					relationship: `${edge.type} this node`
				});
			}
		}
	}

	return context;
}

/**
 * Clear the entire analysis cache. Useful if the user wants to
 * re-analyze everything fresh.
 */
export function clearAnalysisCache(): void {
	analysisCache.clear();
}

/**
 * Get the icon name for the overall quality level.
 */
export function getQualityIcon(
	quality: AIAnalysisResult['overallQuality']
): 'brain' | 'alert-triangle' | 'help-circle' | 'target' {
	switch (quality) {
		case 'strong':
			return 'brain';
		case 'adequate':
			return 'help-circle';
		case 'weak':
			return 'alert-triangle';
		case 'problematic':
			return 'alert-triangle';
		default:
			return 'help-circle';
	}
}

/**
 * Get a color for the overall quality level.
 */
export function getQualityColor(quality: AIAnalysisResult['overallQuality']): string {
	switch (quality) {
		case 'strong':
			return '#4BE87A';
		case 'adequate':
			return '#8B8B8B';
		case 'weak':
			return '#E8B84B';
		case 'problematic':
			return '#E84B4B';
		default:
			return '#8B8B8B';
	}
}
