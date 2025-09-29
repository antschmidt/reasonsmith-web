import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CitationGraphService, type CitationNode, type DiscussionNode } from '$lib/neo4jClient';
import type { Citation } from '$lib/types/writingStyle';

// Helper function to determine citation type from URL
function determineCitationType(url: string): 'academic' | 'news' | 'web' | 'discussion' | 'internal' {
  const lowerUrl = url.toLowerCase();

  // Academic sources
  if (lowerUrl.includes('doi.org') ||
      lowerUrl.includes('arxiv.org') ||
      lowerUrl.includes('scholar.google') ||
      lowerUrl.includes('jstor.org') ||
      lowerUrl.includes('pubmed') ||
      lowerUrl.includes('.edu/')) {
    return 'academic';
  }

  // News sources
  if (lowerUrl.includes('nytimes.com') ||
      lowerUrl.includes('washingtonpost.com') ||
      lowerUrl.includes('reuters.com') ||
      lowerUrl.includes('ap.org') ||
      lowerUrl.includes('bbc.com') ||
      lowerUrl.includes('cnn.com') ||
      lowerUrl.includes('bloomberg.com')) {
    return 'news';
  }

  // Internal discussions (your platform)
  if (lowerUrl.includes(process.env.ORIGIN || 'localhost') && lowerUrl.includes('/discussions/')) {
    return 'internal';
  }

  // Default to web
  return 'web';
}

// Convert Citation to CitationNode
function citationToCitationNode(citation: Citation): CitationNode {
  return {
    id: citation.id,
    title: citation.title,
    url: citation.url,
    author: citation.author,
    publisher: citation.publisher,
    publishDate: citation.publishDate,
    type: determineCitationType(citation.url)
  };
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { discussionId, title, authorId, createdAt, citations, goodFaithScore } = body;

    if (!discussionId || !authorId) {
      return json({ error: 'Discussion ID and author ID are required' }, { status: 400 });
    }

    const citationService = new CitationGraphService();

    try {
      // 1. Create/update discussion node
      const discussionNode: DiscussionNode = {
        id: discussionId,
        title: title || 'Untitled Discussion',
        authorId,
        createdAt: createdAt || new Date().toISOString(),
        goodFaithScore
      };

      await citationService.upsertDiscussion(discussionNode);

      // 2. Process citations if provided
      if (citations && Array.isArray(citations)) {
        for (const citation of citations) {
          try {
            // Create citation node
            const citationNode = citationToCitationNode(citation);
            await citationService.upsertCitation(citationNode);

            // Create citation relationship
            await citationService.createCitationRelationship({
              discussionId,
              citationId: citation.id,
              pointSupported: citation.pointSupported,
              relevantQuote: citation.relevantQuote,
              pageNumber: citation.pageNumber,
              createdAt: new Date().toISOString()
            });

            console.log(`[Neo4j Sync] Synced citation: ${citation.title}`);
          } catch (citationError) {
            console.error(`[Neo4j Sync] Failed to sync citation ${citation.id}:`, citationError);
            // Continue with other citations even if one fails
          }
        }
      }

      console.log(`[Neo4j Sync] Successfully synced discussion: ${discussionId}`);

      return json({
        success: true,
        discussionId,
        citationsSynced: citations?.length || 0
      });

    } finally {
      await citationService.close();
    }

  } catch (error: any) {
    console.error('[Neo4j Sync] Error syncing citations:', error);
    return json({
      error: 'Failed to sync citations to graph database',
      details: error.message
    }, { status: 500 });
  }
};

// GET endpoint to retrieve citation relationships
export const GET: RequestHandler = async ({ url }) => {
  const discussionId = url.searchParams.get('discussionId');

  if (!discussionId) {
    return json({ error: 'Discussion ID is required' }, { status: 400 });
  }

  const citationService = new CitationGraphService();

  try {
    const citations = await citationService.getDiscussionCitations(discussionId);
    const relatedDiscussions = await citationService.findRelatedDiscussions(discussionId, 5);

    return json({
      citations,
      relatedDiscussions,
      discussionId
    });

  } catch (error: any) {
    console.error('[Neo4j Query] Error retrieving citations:', error);
    return json({
      error: 'Failed to retrieve citation data',
      details: error.message
    }, { status: 500 });

  } finally {
    await citationService.close();
  }
};