// Writing style types and utilities

export type WritingStyle = 'quick_point' | 'journalistic' | 'academic';

export interface Citation {
  id: string; // Unique ID for managing citations
  title: string;
  url: string;
  publishDate?: string; // Optional publish date
  pointSupported: string; // The specific point this citation supports
  relevantQuote: string; // Quote from the source
  pageNumber?: string; // For PDFs, documents, books (academic style)
  author?: string; // Optional author
  publisher?: string; // Optional publisher (academic style)
  accessed?: string; // Access date for web sources (journalistic style)
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
    requirements: ['Clear and concise', 'Single main point'],
  },
  journalistic: {
    label: 'Journalistic',
    description: 'Structured reporting with sources',
    minWords: 100,
    maxWords: 1000,
    placeholder: 'Report on the topic with context and sources...',
    requirements: ['Include sources', 'Answer who/what/when/where/why', 'Fact-based'],
  },
  academic: {
    label: 'Academic',
    description: 'Formal analysis with citations',
    minWords: 200,
    maxWords: 2000,
    placeholder: 'Provide analysis with proper citations...',
    requirements: ['Proper citations', 'Logical argument structure', 'Evidence-based'],
  },
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
  if (citation.publishDate) {
    formatted += (citation.publisher ? ', ' : '. ') + citation.publishDate;
  } else if (!citation.publisher) {
    // Add period if no publisher and no date
    formatted += '.';
  }
  
  // URL (clickable)
  formatted += ` <a href="${citation.url}" target="_blank" rel="noopener noreferrer">${citation.url}</a>`;
  
  // Page number (if available) - comes after URL for academic citations
  if (citation.pageNumber) {
    formatted += `, ${citation.pageNumber}`;
  }
  
  // Access date (for web sources) - typically for journalistic sources
  if (citation.accessed) {
    formatted += `. Accessed ${citation.accessed}`;
  }
  
  return formatted + '.';
}

// Citation Reference Management
export interface CitationReference {
  citationId: string;
  position: number; // Position in text where reference appears
}

export function insertCitationReference(content: string, position: number, citationId: string): string {
  const beforeText = content.slice(0, position);
  const afterText = content.slice(position);
  const citationNumber = getCitationNumberById(citationId, []);  // Will be improved
  return `${beforeText}[${citationNumber}]${afterText}`;
}

export function getCitationNumberById(citationId: string, citations: Citation[]): number {
  const index = citations.findIndex(citation => citation.id === citationId);
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
          if (!citation.pointSupported.trim()) issues.push(`Citation ${index + 1}: Point supported is required`);
          if (!citation.relevantQuote.trim()) issues.push(`Citation ${index + 1}: Relevant quote is required`);
        });
      }
      break;
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}