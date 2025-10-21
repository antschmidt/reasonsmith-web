/**
 * Linkify utility for detecting and converting URLs in text to clickable links
 */

// URL regex pattern that matches http/https URLs
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

export interface TextSegment {
	type: 'text' | 'link';
	content: string;
	href?: string;
}

/**
 * Parse text and identify URL segments
 * @param text The text to parse
 * @returns Array of text segments with type and content
 */
export function parseTextWithLinks(text: string): TextSegment[] {
	const segments: TextSegment[] = [];
	let lastIndex = 0;

	// Reset regex lastIndex
	URL_REGEX.lastIndex = 0;

	let match;
	while ((match = URL_REGEX.exec(text)) !== null) {
		// Add text before the URL
		if (match.index > lastIndex) {
			segments.push({
				type: 'text',
				content: text.slice(lastIndex, match.index)
			});
		}

		// Add the URL as a link
		segments.push({
			type: 'link',
			content: match[0],
			href: match[0]
		});

		lastIndex = match.index + match[0].length;
	}

	// Add remaining text after the last URL
	if (lastIndex < text.length) {
		segments.push({
			type: 'text',
			content: text.slice(lastIndex)
		});
	}

	// If no URLs were found, return the entire text as a single segment
	if (segments.length === 0) {
		segments.push({
			type: 'text',
			content: text
		});
	}

	return segments;
}

/**
 * Check if text contains any URLs
 * @param text The text to check
 * @returns True if text contains URLs
 */
export function containsUrls(text: string): boolean {
	URL_REGEX.lastIndex = 0;
	return URL_REGEX.test(text);
}
