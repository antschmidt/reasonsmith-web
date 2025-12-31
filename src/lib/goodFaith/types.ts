/**
 * Shared TypeScript types for good faith analysis across all providers
 */

// Input types

export interface ImportData {
	source?: string;
	url?: string;
	content?: string;
	author?: string;
	date?: string;
}

export interface ShowcaseContext {
	title: string;
	subtitle?: string;
	creator?: string;
	media_type?: string;
	summary?: string;
	analysis?: {
		summary?: string;
		[key: string]: unknown;
	};
}

export interface Citation {
	id?: string;
	title?: string;
	url?: string;
	author?: string;
	publisher?: string;
	publish_date?: string;
	accessed_date?: string;
	page_number?: string;
	point_supported?: string;
	relevant_quote?: string;
}

export interface SelectedComment {
	id: string;
	content: string;
	author: string;
	created_at: string;
	is_anonymous: boolean;
}

export interface DiscussionContext {
	discussion?: {
		title?: string;
		description?: string;
		citations?: Citation[];
	};
	importData?: ImportData;
	selectedComments?: SelectedComment[];
}

export interface GoodFaithInput {
	content: string;
	postId?: string;
	importData?: ImportData;
	discussionContext?: DiscussionContext;
	showcaseContext?: ShowcaseContext;
}

// Output types

export interface Argument {
	argument: string;
	score: number; // 1-10
	fallacies: string[];
	improvements?: string;
}

export interface Claim {
	claim: string;
	supportingArguments: Argument[];
}

export interface GoodFaithResult {
	// Core scoring
	good_faith_score: number; // 0-1 scale (normalized)
	good_faith_label: string; // "hostile" | "questionable" | "neutral" | "constructive" | "exemplary"

	// Detailed analysis
	claims: Claim[];
	fallacyOverload: boolean;
	cultishPhrases: string[];
	summary: string;
	rationale?: string;
	tags?: string[];

	// Growth metrics (0-10 scale)
	steelmanScore?: number;
	steelmanNotes?: string;
	understandingScore?: number;
	intellectualHumilityScore?: number;
	relevanceScore?: number;
	relevanceNotes?: string;

	// Metadata
	provider: 'claude' | 'openai' | 'gemini' | 'heuristic';
	usedAI: boolean;

	// Token usage (for API cost tracking)
	usage?: {
		input_tokens: number;
		output_tokens: number;
		total_tokens: number;
	};

	// Legacy compatibility (some consumers expect these)
	goodFaithScore?: number; // 0-100 scale (original)
	goodFaithDescriptor?: string;
	overallAnalysis?: string;
}

// Provider-specific raw response types

export interface ClaudeRawResponse {
	claims: Claim[];
	fallacyOverload: boolean;
	goodFaithScore: number; // 0-100
	goodFaithDescriptor?: string;
	cultishPhrases: string[];
	overallAnalysis: string;
	tags?: string[];
	steelmanScore?: number;
	steelmanNotes?: string;
	understandingScore?: number;
	intellectualHumilityScore?: number;
	relevanceScore?: number;
	relevanceNotes?: string;
}

export interface OpenAIRawResponse {
	claims: Claim[];
	fallacyOverload: boolean;
	goodFaithScore: number; // 0-100
	goodFaithDescriptor?: string;
	cultishPhrases: string[];
	summary: string;
	tags?: string[];
	steelmanScore?: number;
	steelmanNotes?: string;
	understandingScore?: number;
	intellectualHumilityScore?: number;
	relevanceScore?: number;
	relevanceNotes?: string;
}

// Provider configuration

export type ProviderName = 'claude' | 'openai' | 'gemini';

export interface ProviderConfig {
	name: ProviderName;
	model: string;
	maxTokens: number;
	temperature: number;
}

export const PROVIDER_CONFIGS: Record<ProviderName, ProviderConfig> = {
	claude: {
		name: 'claude',
		model: 'claude-sonnet-4-5-20250929',
		maxTokens: 20000,
		temperature: 0.2
	},
	openai: {
		name: 'openai',
		model: 'gpt-5',
		maxTokens: 16000,
		temperature: 1
	},
	gemini: {
		name: 'gemini',
		model: 'gemini-pro',
		maxTokens: 16000,
		temperature: 0.2
	}
};
