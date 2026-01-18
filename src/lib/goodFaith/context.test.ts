/**
 * Tests for context building utilities
 */

import { describe, it, expect } from 'vitest';
import { buildAnalysisContext, buildFullContent, hasContext } from './context';
import type { GoodFaithInput, DiscussionContext, ShowcaseContext, ImportData } from './types';

// Helper to create minimal input
function createInput(overrides: Partial<GoodFaithInput> = {}): GoodFaithInput {
	return {
		content: 'Test content for analysis',
		...overrides
	};
}

describe('buildAnalysisContext', () => {
	describe('empty context', () => {
		it('returns empty string when no context provided', () => {
			const input = createInput();
			expect(buildAnalysisContext(input)).toBe('');
		});

		it('returns empty string for empty discussionContext', () => {
			const input = createInput({ discussionContext: {} });
			expect(buildAnalysisContext(input)).toBe('');
		});
	});

	describe('discussion context', () => {
		it('includes discussion title', () => {
			const input = createInput({
				discussionContext: {
					discussion: {
						title: 'Test Discussion Title'
					}
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('DISCUSSION CONTEXT:');
			expect(context).toContain('Title: Test Discussion Title');
		});

		it('includes discussion description', () => {
			const input = createInput({
				discussionContext: {
					discussion: {
						description: 'This is the description of the discussion.'
					}
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('Description:');
			expect(context).toContain('This is the description of the discussion.');
		});

		it('includes both title and description', () => {
			const input = createInput({
				discussionContext: {
					discussion: {
						title: 'My Title',
						description: 'My Description'
					}
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('Title: My Title');
			expect(context).toContain('Description:');
			expect(context).toContain('My Description');
		});

		it('includes citations when provided', () => {
			const input = createInput({
				discussionContext: {
					discussion: {
						title: 'Discussion with Citations',
						citations: [
							{
								id: '1',
								title: 'First Source',
								url: 'https://example.com/1',
								point_supported: 'Supports claim A'
							},
							{
								id: '2',
								title: 'Second Source',
								url: 'https://example.com/2'
							}
						]
					}
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('CITATIONS:');
			expect(context).toContain('[1] First Source - https://example.com/1');
			expect(context).toContain('Supporting: Supports claim A');
			expect(context).toContain('[2] Second Source - https://example.com/2');
		});

		it('handles citations without title or url', () => {
			const input = createInput({
				discussionContext: {
					discussion: {
						citations: [{ id: '1' }]
					}
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('[1] Untitled - No URL');
		});

		it('adds separator after discussion section', () => {
			const input = createInput({
				discussionContext: {
					discussion: { title: 'Test' }
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('---');
		});
	});

	describe('showcase context', () => {
		it('includes showcase title with reference disclaimer', () => {
			const input = createInput({
				showcaseContext: {
					title: 'Featured Analysis Title'
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('FEATURED ANALYSIS CONTEXT');
			expect(context).toContain('for reference only');
			expect(context).toContain('DO NOT ANALYZE');
			expect(context).toContain('Title: Featured Analysis Title');
		});

		it('includes all showcase fields when provided', () => {
			const input = createInput({
				showcaseContext: {
					title: 'Test Title',
					subtitle: 'Test Subtitle',
					creator: 'John Doe',
					media_type: 'article',
					summary: 'This is the summary.',
					analysis: {
						summary: 'Analysis conclusion here.'
					}
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('Title: Test Title');
			expect(context).toContain('Subtitle: Test Subtitle');
			expect(context).toContain('Creator: John Doe');
			expect(context).toContain('Media Type: article');
			expect(context).toContain('Summary: This is the summary.');
			expect(context).toContain('Analysis Conclusion: Analysis conclusion here.');
		});

		it('returns empty for showcase without title', () => {
			const input = createInput({
				showcaseContext: {
					title: '',
					summary: 'Has summary but no title'
				} as ShowcaseContext
			});
			const context = buildAnalysisContext(input);
			expect(context).not.toContain('FEATURED ANALYSIS CONTEXT');
		});

		it('adds separator after showcase section', () => {
			const input = createInput({
				showcaseContext: { title: 'Test' }
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('---');
		});
	});

	describe('import context', () => {
		it('includes imported content from importData', () => {
			const input = createInput({
				importData: {
					content: 'This is the imported tweet content.',
					source: 'twitter',
					author: '@testuser'
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('IMPORTED SOCIAL MEDIA POST');
			expect(context).toContain('not subject to good faith evaluation');
			expect(context).toContain('Platform: twitter');
			expect(context).toContain('Author: @testuser');
			expect(context).toContain('This is the imported tweet content.');
		});

		it('includes imported content from discussionContext.importData', () => {
			const input = createInput({
				discussionContext: {
					importData: {
						content: 'Imported from discussion context.',
						source: 'facebook',
						author: 'Test Author'
					}
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('IMPORTED SOCIAL MEDIA POST');
			expect(context).toContain('Platform: facebook');
			expect(context).toContain('Author: Test Author');
			expect(context).toContain('Imported from discussion context.');
		});

		it('prefers top-level importData over discussionContext.importData', () => {
			const input = createInput({
				importData: {
					content: 'Top level content',
					source: 'twitter'
				},
				discussionContext: {
					importData: {
						content: 'Nested content',
						source: 'facebook'
					}
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('Top level content');
			expect(context).toContain('Platform: twitter');
			expect(context).not.toContain('Nested content');
		});

		it('includes date and url when provided', () => {
			const input = createInput({
				importData: {
					content: 'Test content',
					source: 'twitter',
					author: 'user',
					date: '2024-01-15',
					url: 'https://twitter.com/user/status/123'
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('Date: 2024-01-15');
			expect(context).toContain('URL: https://twitter.com/user/status/123');
		});

		it('uses Unknown for missing source and author', () => {
			const input = createInput({
				importData: {
					content: 'Just content, no metadata'
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('Platform: Unknown');
			expect(context).toContain('Author: Unknown');
		});

		it('returns empty for importData without content', () => {
			const input = createInput({
				importData: {
					source: 'twitter',
					author: '@user'
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).not.toContain('IMPORTED SOCIAL MEDIA POST');
		});
	});

	describe('selected comments', () => {
		it('includes selected comments', () => {
			const input = createInput({
				discussionContext: {
					selectedComments: [
						{
							id: 'comment-1',
							content: 'This is the first comment.',
							author: 'Alice',
							created_at: '2024-01-15T10:00:00Z',
							is_anonymous: false
						}
					]
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('REFERENCED COMMENTS IN THIS DISCUSSION');
			expect(context).toContain('Comment by Alice');
			expect(context).toContain('This is the first comment.');
		});

		it('includes multiple comments', () => {
			const input = createInput({
				discussionContext: {
					selectedComments: [
						{
							id: 'comment-1',
							content: 'First comment.',
							author: 'Alice',
							created_at: '2024-01-15T10:00:00Z',
							is_anonymous: false
						},
						{
							id: 'comment-2',
							content: 'Second comment.',
							author: 'Bob',
							created_at: '2024-01-16T12:00:00Z',
							is_anonymous: false
						}
					]
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('Comment by Alice');
			expect(context).toContain('First comment.');
			expect(context).toContain('Comment by Bob');
			expect(context).toContain('Second comment.');
		});

		it('formats date in comment header', () => {
			const input = createInput({
				discussionContext: {
					selectedComments: [
						{
							id: 'comment-1',
							content: 'Test',
							author: 'User',
							created_at: '2024-06-15T10:00:00Z',
							is_anonymous: false
						}
					]
				}
			});
			const context = buildAnalysisContext(input);
			// Date format depends on locale, just check it contains the author
			expect(context).toContain('Comment by User on');
		});

		it('returns empty for empty selectedComments array', () => {
			const input = createInput({
				discussionContext: {
					selectedComments: []
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).not.toContain('REFERENCED COMMENTS');
		});
	});

	describe('combined context', () => {
		it('includes all sections when all context provided', () => {
			const input = createInput({
				discussionContext: {
					discussion: {
						title: 'Discussion Title',
						description: 'Discussion description here.'
					},
					selectedComments: [
						{
							id: 'c1',
							content: 'A comment',
							author: 'Commenter',
							created_at: '2024-01-01T00:00:00Z',
							is_anonymous: false
						}
					]
				},
				showcaseContext: {
					title: 'Showcase Title',
					summary: 'Showcase summary'
				},
				importData: {
					content: 'Imported content',
					source: 'twitter',
					author: '@user'
				}
			});
			const context = buildAnalysisContext(input);
			expect(context).toContain('DISCUSSION CONTEXT');
			expect(context).toContain('Discussion Title');
			expect(context).toContain('FEATURED ANALYSIS CONTEXT');
			expect(context).toContain('Showcase Title');
			expect(context).toContain('IMPORTED SOCIAL MEDIA POST');
			expect(context).toContain('Imported content');
			expect(context).toContain('REFERENCED COMMENTS');
			expect(context).toContain('A comment');
		});

		it('maintains correct section order', () => {
			const input = createInput({
				discussionContext: {
					discussion: { title: 'Discussion' },
					selectedComments: [
						{
							id: 'c1',
							content: 'Comment',
							author: 'User',
							created_at: '2024-01-01T00:00:00Z',
							is_anonymous: false
						}
					]
				},
				showcaseContext: { title: 'Showcase' },
				importData: { content: 'Import', source: 'x', author: 'y' }
			});
			const context = buildAnalysisContext(input);

			const discussionIdx = context.indexOf('DISCUSSION CONTEXT');
			const showcaseIdx = context.indexOf('FEATURED ANALYSIS CONTEXT');
			const importIdx = context.indexOf('IMPORTED SOCIAL MEDIA POST');
			const commentsIdx = context.indexOf('REFERENCED COMMENTS');

			expect(discussionIdx).toBeLessThan(showcaseIdx);
			expect(showcaseIdx).toBeLessThan(importIdx);
			expect(importIdx).toBeLessThan(commentsIdx);
		});
	});
});

describe('buildFullContent', () => {
	it('returns just content when no context', () => {
		const input = createInput({ content: 'My analysis content' });
		expect(buildFullContent(input)).toBe('My analysis content');
	});

	it('prepends context with user content label', () => {
		const input = createInput({
			content: 'User written content',
			discussionContext: {
				discussion: { title: 'Test Discussion' }
			}
		});
		const fullContent = buildFullContent(input);
		expect(fullContent).toContain('DISCUSSION CONTEXT');
		expect(fullContent).toContain("USER'S CONTENT (evaluate this for good faith):");
		expect(fullContent).toContain('User written content');
	});

	it('places user content at the end', () => {
		const input = createInput({
			content: 'My content here',
			discussionContext: {
				discussion: { title: 'Discussion' }
			}
		});
		const fullContent = buildFullContent(input);
		const userContentIdx = fullContent.indexOf("USER'S CONTENT");
		const myContentIdx = fullContent.indexOf('My content here');

		expect(userContentIdx).toBeLessThan(myContentIdx);
		expect(fullContent.endsWith('My content here')).toBe(true);
	});
});

describe('hasContext', () => {
	it('returns false when no context provided', () => {
		const input = createInput();
		expect(hasContext(input)).toBe(false);
	});

	it('returns false for empty discussionContext', () => {
		const input = createInput({ discussionContext: {} });
		expect(hasContext(input)).toBe(false);
	});

	it('returns true when discussion is provided', () => {
		const input = createInput({
			discussionContext: {
				discussion: { title: 'Test' }
			}
		});
		expect(hasContext(input)).toBe(true);
	});

	it('returns true when showcaseContext with title is provided', () => {
		const input = createInput({
			showcaseContext: { title: 'Showcase' }
		});
		expect(hasContext(input)).toBe(true);
	});

	it('returns false for showcaseContext without title', () => {
		const input = createInput({
			showcaseContext: { title: '' } as ShowcaseContext
		});
		expect(hasContext(input)).toBe(false);
	});

	it('returns true when importData with content is provided', () => {
		const input = createInput({
			importData: { content: 'Imported content' }
		});
		expect(hasContext(input)).toBe(true);
	});

	it('returns true when discussionContext.importData with content is provided', () => {
		const input = createInput({
			discussionContext: {
				importData: { content: 'Nested import' }
			}
		});
		expect(hasContext(input)).toBe(true);
	});

	it('returns true when selectedComments are provided', () => {
		const input = createInput({
			discussionContext: {
				selectedComments: [
					{
						id: 'c1',
						content: 'Comment',
						author: 'User',
						created_at: '2024-01-01T00:00:00Z',
						is_anonymous: false
					}
				]
			}
		});
		expect(hasContext(input)).toBe(true);
	});

	it('returns false for empty selectedComments array', () => {
		const input = createInput({
			discussionContext: {
				selectedComments: []
			}
		});
		expect(hasContext(input)).toBe(false);
	});
});
