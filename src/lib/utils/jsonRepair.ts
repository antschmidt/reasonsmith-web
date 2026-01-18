/**
 * Robust JSON repair utility for LLM outputs
 * Handles common issues like unescaped quotes, missing commas, etc.
 */

import { logger } from '$lib/logger';

/**
 * Attempt to parse JSON with automatic repair for common LLM issues
 */
export function parseJsonWithRepair<T = unknown>(text: string, context?: string): T {
	// First, try direct parse
	try {
		return JSON.parse(text);
	} catch (firstError) {
		// Continue to repair attempts
	}

	// Clean up markdown code blocks
	let cleaned = text.trim();
	if (cleaned.startsWith('```json')) {
		cleaned = cleaned.slice(7);
	} else if (cleaned.startsWith('```')) {
		cleaned = cleaned.slice(3);
	}
	if (cleaned.endsWith('```')) {
		cleaned = cleaned.slice(0, -3);
	}
	cleaned = cleaned.trim();

	// Extract JSON object/array if there's extra text
	if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
		const objStart = cleaned.indexOf('{');
		const arrStart = cleaned.indexOf('[');
		const start = objStart >= 0 && arrStart >= 0
			? Math.min(objStart, arrStart)
			: Math.max(objStart, arrStart);

		if (start >= 0) {
			const isObject = cleaned[start] === '{';
			const end = isObject ? cleaned.lastIndexOf('}') : cleaned.lastIndexOf(']');
			if (end > start) {
				cleaned = cleaned.slice(start, end + 1);
			}
		}
	}

	// Try parsing after basic cleanup
	try {
		return JSON.parse(cleaned);
	} catch (secondError) {
		// Continue to more aggressive repairs
	}

	// Apply progressive repairs
	let repaired = cleaned;

	// Pass 1: Fix control characters
	repaired = repaired.replace(/[\x00-\x1F\x7F]/g, (char) => {
		if (char === '\n') return '\\n';
		if (char === '\r') return '\\r';
		if (char === '\t') return '\\t';
		return '';
	});

	try {
		return JSON.parse(repaired);
	} catch (e) {
		// Continue
	}

	// Pass 2: Fix trailing commas
	repaired = repaired.replace(/,\s*([}\]])/g, '$1');

	try {
		return JSON.parse(repaired);
	} catch (e) {
		// Continue
	}

	// Pass 3: Fix missing commas between elements
	repaired = repaired
		.replace(/"\s*\n\s*"/g, '",\n"')
		.replace(/}\s*\n\s*{/g, '},\n{')
		.replace(/"\s+"/g, '", "')
		.replace(/]\s*\n\s*"/g, '],\n"')
		.replace(/"\s*\n\s*\[/g, '",\n[');

	try {
		return JSON.parse(repaired);
	} catch (e) {
		// Continue
	}

	// Pass 4: Try to fix unescaped quotes in strings
	// This is tricky - we need to identify strings and escape internal quotes
	repaired = fixUnescapedQuotes(repaired);

	try {
		const result = JSON.parse(repaired);
		logger.info(`[JSON Repair] Successfully repaired JSON${context ? ` for ${context}` : ''}`);
		return result;
	} catch (finalError) {
		// Log detailed error info
		const posMatch = finalError instanceof Error
			? finalError.message.match(/position (\d+)/)
			: null;

		if (posMatch) {
			const pos = parseInt(posMatch[1], 10);
			logger.error(`[JSON Repair] Failed at position ${pos}${context ? ` (${context})` : ''}:`, {
				context: repaired.substring(Math.max(0, pos - 50), pos + 50),
				char: repaired[pos],
				prevChars: repaired.substring(Math.max(0, pos - 10), pos),
				nextChars: repaired.substring(pos, pos + 10)
			});
		}

		throw new Error(
			`Failed to parse JSON${context ? ` for ${context}` : ''}: ${
				finalError instanceof Error ? finalError.message : 'Unknown error'
			}`
		);
	}
}

/**
 * Attempt to fix unescaped quotes within JSON string values
 * This is a heuristic approach that works for many common cases
 */
function fixUnescapedQuotes(json: string): string {
	const result: string[] = [];
	let i = 0;
	let inString = false;
	let stringStart = -1;

	while (i < json.length) {
		const char = json[i];
		const prevChar = i > 0 ? json[i - 1] : '';

		if (char === '"' && prevChar !== '\\') {
			if (!inString) {
				// Starting a string
				inString = true;
				stringStart = i;
				result.push(char);
			} else {
				// Potentially ending a string - check what comes next
				const nextNonWhitespace = findNextNonWhitespace(json, i + 1);

				if (isValidAfterString(nextNonWhitespace)) {
					// This is a legitimate string end
					inString = false;
					stringStart = -1;
					result.push(char);
				} else {
					// This quote is inside the string - escape it
					result.push('\\"');
				}
			}
		} else {
			result.push(char);
		}
		i++;
	}

	return result.join('');
}

/**
 * Find the next non-whitespace character
 */
function findNextNonWhitespace(str: string, start: number): string {
	for (let i = start; i < str.length; i++) {
		if (!/\s/.test(str[i])) {
			return str[i];
		}
	}
	return '';
}

/**
 * Check if a character is valid after a string value ends
 */
function isValidAfterString(char: string): boolean {
	// Valid characters after a string: , } ] :
	return [',', '}', ']', ':', ''].includes(char);
}
