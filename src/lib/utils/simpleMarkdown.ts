/**
 * Minimal markdown-to-HTML for discussion descriptions.
 *
 * Handles: **bold**, *italic*, newlines → <br>/<p>, and [text](url) links.
 * Does NOT handle headers, lists, code blocks, images, etc.
 * For anything heavier, add a real parser (marked, micromark).
 *
 * Paragraphs that begin with a bold label (e.g. **Your prompt:**) are
 * wrapped in a `<div class="hint-callout">` so the page can style them
 * differently from regular discussion content.
 *
 * Output is intended for use inside {@html ...} — callers should ensure
 * the source string is trusted (DB content, not raw user input).
 */
export function simpleMarkdown(src: string): string {
	if (!src) return '';

	// Split on double-newlines to process paragraphs individually.
	const paragraphs = src.split(/\n\n+/);

	const rendered = paragraphs.map((para) => {
		let html = para
			// Escape angle brackets
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			// Bold: **text**
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			// Italic: *text*
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			// Links: [text](url)
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
			// Single newlines → line breaks
			.replace(/\n/g, '<br>');

		// Detect hint paragraphs: starts with <strong>…:</strong>
		if (/^<strong>[^<]+:<\/strong>/.test(html)) {
			return `<div class="hint-callout"><p>${html}</p></div>`;
		}

		return `<p>${html}</p>`;
	});

	return rendered.join('');
}
