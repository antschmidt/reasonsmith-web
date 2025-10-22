// Writing style types and utilities

export type WritingStyle = 'quick_point' | 'journalistic' | 'academic';

export type PostType =
	| 'response'
	| 'counter_argument'
	| 'supporting_evidence'
	| 'question'
	| 'steelman' // NEW: Understanding opponent's strongest argument
	| 'synthesis' // NEW: Finding common ground between views
	| 'acknowledgment' // NEW: Conceding a point or changing position
	| 'clarifying_question' // NEW: Question focused on understanding
	| 'counter_with_steelman'; // NEW: Counter after demonstrating understanding

export interface DiscussionSection {
	id: string;
	title: string;
	content: string;
	anchor: string;
	order: number;
}

// Database-compatible citation interface (matches the new citation table)
export interface Citation {
	id: string;
	title: string;
	url: string;
	author?: string | null;
	publisher?: string | null;
	publish_date?: string | null;
	accessed_date?: string | null;
	page_number?: string | null;
	point_supported: string;
	relevant_quote: string;
	created_at?: string;
	created_by?: string;
}

// Legacy citation interface for backward compatibility with existing JSONB data
export interface LegacyCitation {
	id: string;
	title: string;
	url: string;
	publishDate?: string;
	pointSupported: string;
	relevantQuote: string;
	pageNumber?: string;
	author?: string;
	publisher?: string;
	accessed?: string;
}

export interface StyleMetadata {
	// Citations for all writing styles (replaces both sources and citations)
	citations?: Citation[];

	// Common fields
	wordCountTarget?: number;
	tags?: string[];

	// Style-specific flags
	hasOutline?: boolean;
	hasConclusion?: boolean;
	factsVerified?: boolean;
}

// Post type configurations
export const POST_TYPE_CONFIG = {
	// Growth-focused types (NEW - highest XP value)
	steelman: {
		label: 'Steelman',
		description: 'Represent the strongest version of an opposing view before critiquing',
		icon: '🛡️',
		color: 'gold',
		xp: 30,
		category: 'understanding'
	},
	synthesis: {
		label: 'Synthesis',
		description: 'Find common ground or bridge between opposing viewpoints',
		icon: '🌉',
		color: 'purple',
		xp: 50,
		category: 'understanding'
	},
	acknowledgment: {
		label: 'Acknowledgment',
		description: 'Acknowledge a valid point or update your position based on new information',
		icon: '🤝',
		color: 'teal',
		xp: 25,
		category: 'humility'
	},
	counter_with_steelman: {
		label: 'Thoughtful Counter',
		description: 'Counter-argument that first demonstrates understanding of the opposing view',
		icon: '⚖️',
		color: 'orange',
		xp: 20,
		category: 'reasoning'
	},
	clarifying_question: {
		label: 'Clarifying Question',
		description: 'Ask questions to better understand the position or reasoning',
		icon: '❓',
		color: 'blue',
		xp: 15,
		category: 'understanding'
	},

	// Standard types (maintained for compatibility)
	response: {
		label: 'Response',
		description: 'General response or comment to the discussion',
		icon: '💬',
		color: 'gray',
		xp: 5,
		category: 'engagement'
	},
	counter_argument: {
		label: 'Counter-Argument',
		description: 'Present an opposing viewpoint (consider using Thoughtful Counter instead)',
		icon: '🗡️',
		color: 'red',
		xp: 10,
		category: 'reasoning'
	},
	supporting_evidence: {
		label: 'Evidence',
		description: 'Provide additional evidence, data, or sources',
		icon: '📊',
		color: 'green',
		xp: 15,
		category: 'evidence'
	},
	question: {
		label: 'Question',
		description:
			'Ask a question about the topic (use Clarifying Question for understanding-focused queries)',
		icon: '❔',
		color: 'indigo',
		xp: 5,
		category: 'engagement'
	}
} as const;

export function getPostTypeConfig(type: PostType) {
	return POST_TYPE_CONFIG[type];
}

// Tag helpers for discussions
export const COMMON_DISCUSSION_TAGS = [
	'politics',
	'economics',
	'environment',
	'healthcare',
	'education',
	'technology',
	'social-issues',
	'foreign-policy',
	'research',
	'philosophy',
	'ethics',
	'culture',
	'science',
	'history'
] as const;

export type CommonTag = (typeof COMMON_DISCUSSION_TAGS)[number];

export function normalizeTag(tag: string): string {
	return tag.toLowerCase().trim().replace(/\s+/g, '-');
}

export function validateTags(tags: string[]): string[] {
	return tags
		.map((tag) => normalizeTag(tag))
		.filter((tag) => tag.length > 0 && tag.length <= 50)
		.slice(0, 10); // Max 10 tags
}

export interface PostWithStyle {
	id: string;
	content: string;
	writing_style: WritingStyle;
	style_metadata: StyleMetadata;
	style_word_count?: number;
	style_requirements_met: boolean;
}

export const WRITING_STYLES = {
	quick_point: {
		label: 'Quick Point',
		description: 'Brief, focused contributions',
		minWords: 0,
		maxWords: 280,
		placeholder: 'Share a quick thought or observation...',
		requirements: ['Clear and concise', 'Single main point']
	},
	journalistic: {
		label: 'Journalistic',
		description: 'Structured reporting with sources',
		minWords: 100,
		maxWords: 1000,
		placeholder: 'Report on the topic with context and sources...',
		requirements: ['Include sources', 'Answer who/what/when/where/why', 'Fact-based']
	},
	academic: {
		label: 'Academic',
		description: 'Formal analysis with citations',
		minWords: 200,
		maxWords: 2000,
		placeholder: 'Provide analysis with proper citations...',
		requirements: ['Proper citations', 'Logical argument structure', 'Evidence-based']
	}
} as const;

export function getStyleConfig(style: WritingStyle) {
	return WRITING_STYLES[style];
}

// Chicago Style Citation Formatting (17th Edition - Notes and Bibliography)
export function formatChicagoCitation(citation: Citation): string {
	let formatted = '';

	// Author (Last, First format for first author)
	if (citation.author) {
		formatted += citation.author;
	}

	// Title in quotes (for web sources and articles)
	const title = `"${citation.title}"`;
	formatted += (formatted ? '. ' : '') + title;

	// Publisher (if available) - typically for academic citations
	if (citation.publisher) {
		formatted += `. ${citation.publisher}`;
	}

	// Publication date (if available)
	if (citation.publish_date) {
		formatted += (citation.publisher ? ', ' : '. ') + citation.publish_date;
	} else if (!citation.publisher) {
		// Add period if no publisher and no date
		formatted += '.';
	}

	// URL (clickable)
	formatted += ` <a href="${citation.url}" target="_blank" rel="noopener noreferrer">${citation.url}</a>`;

	// Page number (if available) - comes after URL for academic citations
	if (citation.page_number) {
		formatted += `, ${citation.page_number}`;
	}

	// Access date (for web sources) - typically for journalistic sources
	if (citation.accessed_date) {
		formatted += `. Accessed ${citation.accessed_date}`;
	}

	return formatted + '.';
}

// Helper function to convert legacy citations to new format
export function convertLegacyCitation(
	legacy: LegacyCitation
): Omit<Citation, 'id' | 'created_at' | 'created_by'> {
	return {
		title: legacy.title,
		url: legacy.url,
		author: legacy.author || null,
		publisher: legacy.publisher || null,
		publish_date: legacy.publishDate || null,
		accessed_date: legacy.accessed || null,
		page_number: legacy.pageNumber || null,
		point_supported: legacy.pointSupported,
		relevant_quote: legacy.relevantQuote
	};
}

// Citation Reference Management
export interface CitationReference {
	citationId: string;
	position: number; // Position in text where reference appears
}

export function insertCitationReference(
	content: string,
	position: number,
	citationId: string
): string {
	const beforeText = content.slice(0, position);
	const afterText = content.slice(position);
	const citationNumber = getCitationNumberById(citationId, []); // Will be improved
	return `${beforeText}[${citationNumber}]${afterText}`;
}

export function getCitationNumberById(citationId: string, citations: Citation[]): number {
	const index = citations.findIndex((citation) => citation.id === citationId);
	return index >= 0 ? index + 1 : 1;
}

export function processCitationReferences(content: string, citations: Citation[]): string {
	// Replace [1], [2], etc. with proper superscript links
	return content.replace(/\[(\d+)\]/g, (match, num) => {
		const citationNumber = parseInt(num);
		if (citationNumber > 0 && citationNumber <= citations.length) {
			return `<sup><a href="#citation-${citationNumber}" class="citation-ref" onclick="document.getElementById('citation-${citationNumber}').scrollIntoView({behavior: 'smooth'})">${citationNumber}</a></sup>`;
		}
		return match;
	});
}

export function validateStyleRequirements(
	style: WritingStyle,
	content: string,
	metadata: StyleMetadata
): { isValid: boolean; issues: string[] } {
	const config = getStyleConfig(style);
	const issues: string[] = [];
	const wordCount = content.trim().split(/\s+/).length;

	// Word count validation
	if (config.minWords && wordCount < config.minWords) {
		issues.push(`Minimum ${config.minWords} words required (current: ${wordCount})`);
	}
	if (config.maxWords && wordCount > config.maxWords) {
		issues.push(`Maximum ${config.maxWords} words allowed (current: ${wordCount})`);
	}

	// Style-specific validation
	switch (style) {
		case 'journalistic':
		case 'academic':
			if (!metadata.citations || metadata.citations.length === 0) {
				issues.push(`At least one citation is required for ${style} posts`);
			} else {
				// Validate each citation has required fields
				metadata.citations.forEach((citation, index) => {
					if (!citation.title.trim()) issues.push(`Citation ${index + 1}: Title is required`);
					if (!citation.url.trim()) issues.push(`Citation ${index + 1}: URL is required`);
					if (!citation.point_supported.trim())
						issues.push(`Citation ${index + 1}: Point supported is required`);
					if (!citation.relevant_quote.trim())
						issues.push(`Citation ${index + 1}: Relevant quote is required`);
				});
			}
			break;
	}

	return {
		isValid: issues.length === 0,
		issues
	};
}
