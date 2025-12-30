/**
 * Context building utilities for good faith analysis
 * Constructs the context string that gets prepended to user content
 */

import type {
	GoodFaithInput,
	ImportData,
	ShowcaseContext,
	DiscussionContext,
	Citation,
	SelectedComment
} from './types';

/**
 * Build the complete analysis context from all available sources
 */
export function buildAnalysisContext(input: GoodFaithInput): string {
	let context = '';

	// Add discussion context (title, description, citations)
	if (input.discussionContext?.discussion) {
		context += buildDiscussionSection(input.discussionContext.discussion);
	}

	// Add showcase context (featured analysis being discussed)
	// This is for reference only - NOT subject to analysis
	if (input.showcaseContext) {
		context += buildShowcaseSection(input.showcaseContext);
	}

	// Add import context (social media post being analyzed)
	// This is for reference only - NOT subject to analysis
	const importData = input.importData || input.discussionContext?.importData;
	if (importData?.content) {
		context += buildImportSection(importData);
	}

	// Add selected comments context
	if (input.discussionContext?.selectedComments?.length) {
		context += buildCommentsSection(input.discussionContext.selectedComments);
	}

	return context;
}

/**
 * Build the discussion section (title, description, citations)
 */
function buildDiscussionSection(discussion: {
	title?: string;
	description?: string;
	citations?: Citation[];
}): string {
	let section = 'DISCUSSION CONTEXT:\n';

	if (discussion.title) {
		section += `Title: ${discussion.title}\n`;
	}

	if (discussion.description) {
		section += `Description:\n${discussion.description}\n`;
	}

	if (discussion.citations && discussion.citations.length > 0) {
		section += '\nCITATIONS:\n';
		discussion.citations.forEach((cit, idx) => {
			section += `[${idx + 1}] ${cit.title || 'Untitled'} - ${cit.url || 'No URL'}\n`;
			if (cit.point_supported) {
				section += `   Supporting: ${cit.point_supported}\n`;
			}
		});
	}

	section += '\n---\n\n';
	return section;
}

/**
 * Build the showcase section (featured analysis context)
 * This is for reference only - NOT subject to analysis
 */
function buildShowcaseSection(showcase: ShowcaseContext): string {
	if (!showcase.title) return '';

	let section = 'FEATURED ANALYSIS CONTEXT (for reference only - DO NOT ANALYZE this content):\n';
	section += 'The user is writing a discussion about the following featured analysis.\n';
	section +=
		"This context is provided for reference only - analyze the user's discussion content, NOT this featured analysis.\n\n";

	section += `Title: ${showcase.title}\n`;

	if (showcase.subtitle) {
		section += `Subtitle: ${showcase.subtitle}\n`;
	}

	if (showcase.creator) {
		section += `Creator: ${showcase.creator}\n`;
	}

	if (showcase.media_type) {
		section += `Media Type: ${showcase.media_type}\n`;
	}

	if (showcase.summary) {
		section += `Summary: ${showcase.summary}\n`;
	}

	if (showcase.analysis?.summary) {
		section += `Analysis Conclusion: ${showcase.analysis.summary}\n`;
	}

	section += '\n---\n\n';
	return section;
}

/**
 * Build the import section (social media post context)
 * This is for reference only - NOT subject to analysis
 */
function buildImportSection(importData: ImportData): string {
	if (!importData.content) return '';

	let section = 'IMPORTED SOCIAL MEDIA POST (for context only - not subject to good faith evaluation):\n';
	section += `Platform: ${importData.source || 'Unknown'}\n`;
	section += `Author: ${importData.author || 'Unknown'}\n`;

	if (importData.date) {
		section += `Date: ${importData.date}\n`;
	}

	if (importData.url) {
		section += `URL: ${importData.url}\n`;
	}

	section += `\nContent:\n${importData.content}\n`;
	section += '\n---\n\n';

	return section;
}

/**
 * Build the selected comments section
 */
function buildCommentsSection(comments: SelectedComment[]): string {
	if (!comments.length) return '';

	let section = 'REFERENCED COMMENTS IN THIS DISCUSSION:\n\n';

	comments.forEach((comment) => {
		const dateStr = new Date(comment.created_at).toLocaleDateString();
		section += `Comment by ${comment.author} on ${dateStr}:\n`;
		section += `${comment.content}\n\n---\n\n`;
	});

	return section;
}

/**
 * Build the full content string with context and user content
 */
export function buildFullContent(input: GoodFaithInput): string {
	const context = buildAnalysisContext(input);

	if (context) {
		return context + `USER'S CONTENT (evaluate this for good faith):\n${input.content}`;
	}

	return input.content;
}

/**
 * Check if there's any context to add
 */
export function hasContext(input: GoodFaithInput): boolean {
	return !!(
		input.discussionContext?.discussion ||
		input.showcaseContext?.title ||
		input.importData?.content ||
		input.discussionContext?.importData?.content ||
		input.discussionContext?.selectedComments?.length
	);
}
