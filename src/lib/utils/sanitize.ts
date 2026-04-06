/**
 * Shared HTML sanitization utilities.
 * Uses a tag-allowlist approach that works in both SSR and browser contexts
 * without requiring isomorphic-dompurify (which has CJS/ESM issues with jsdom).
 */

const ALLOWED_TAGS = new Set([
	'br', 'strong', 'em', 'b', 'i', 'a', 'sup', 'sub', 'mark',
	'p', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div',
	'details', 'summary'
]);

const ALLOWED_ATTRS = new Set([
	'href', 'class', 'id', 'data-citation', 'target', 'rel'
]);

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Sanitize HTML by stripping disallowed tags and attributes.
 * Allowed tags are kept; everything else is escaped.
 */
export function sanitizeHtml(html: string): string {
	// Match HTML tags (opening, closing, self-closing)
	return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/g, (match, tagName: string, attrs: string = '') => {
		const tag = tagName.toLowerCase();

		if (!ALLOWED_TAGS.has(tag)) {
			return escapeHtml(match);
		}

		// Filter attributes to only allowed ones
		const cleanAttrs = attrs
			.match(/([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/g)
			?.filter((attr) => {
				const name = attr.split(/[=\s]/)[0].toLowerCase();
				return ALLOWED_ATTRS.has(name);
			})
			.join(' ') || '';

		// Detect closing tag
		if (match.startsWith('</')) {
			return `</${tag}>`;
		}

		const attrStr = cleanAttrs ? ` ${cleanAttrs}` : '';
		const selfClose = match.endsWith('/>') ? ' /' : '';
		return `<${tag}${attrStr}${selfClose}>`;
	});
}

/** Escape all HTML and convert newlines to <br> tags. */
export function sanitizeMultiline(text: string): string {
	return escapeHtml(text).replace(/\n/g, '<br>');
}
