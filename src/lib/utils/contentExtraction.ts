import type { WritingStyle, StyleMetadata, Citation } from '$lib/types/writingStyle';

/**
 * Generate a unique ID for citations
 */
function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Ensure all citations in metadata have IDs
 */
export function ensureIdsForCitationData(metadata: StyleMetadata): StyleMetadata {
	return {
		...metadata,
		citations:
			metadata.citations?.map(
				(citation) =>
					({
						...citation,
						id: (citation as any).id || generateId()
					}) as Citation
			) || []
	};
}

/**
 * Extract citation data from post content (temporary solution until database migration)
 */
export function extractCitationData(content: string): {
	cleanContent: string;
	citationData?: { writing_style: WritingStyle; style_metadata: StyleMetadata };
} {
	const citationMatch = content.match(/<!-- CITATION_DATA:(.*?)-->/s);
	if (citationMatch) {
		try {
			const parsed = JSON.parse(citationMatch[1]);
			const cleanContent = content.replace(/\n\n?<!-- CITATION_DATA:.*?-->/s, '');

			// Handle both comment format and discussion format
			if (parsed.writing_style && parsed.style_metadata) {
				// Discussion format - ensure IDs exist
				return {
					cleanContent,
					citationData: {
						writing_style: parsed.writing_style,
						style_metadata: ensureIdsForCitationData(parsed.style_metadata)
					}
				};
			} else if (parsed.style && parsed.metadata) {
				// Comment format - convert to discussion format and ensure IDs exist
				return {
					cleanContent,
					citationData: {
						writing_style: parsed.style,
						style_metadata: ensureIdsForCitationData(parsed.metadata)
					}
				};
			}

			// Fallback if format doesn't match either expected structure
			return { cleanContent };
		} catch (e) {
			// If parsing fails, return original content
			return { cleanContent: content };
		}
	}
	return { cleanContent: content };
}

/**
 * Extract reply reference from post content
 */
export function extractReplyRef(content: string): { cleanContent: string; replyRef?: any } {
	const match = content.match(/<!-- REPLY_TO:(.*?)-->/s);
	if (match) {
		try {
			const parsed = JSON.parse(match[1]);
			const cleanContent = content.replace(/\n\n?<!-- REPLY_TO:.*?-->/s, '');
			return { cleanContent, replyRef: parsed };
		} catch (e) {
			return { cleanContent: content };
		}
	}
	return { cleanContent: content };
}
