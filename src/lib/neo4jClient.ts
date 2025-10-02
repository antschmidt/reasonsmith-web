import neo4j, { Driver, Session } from 'neo4j-driver';
import { env } from '$env/dynamic/private';

let driver: Driver | null = null;

// Neo4j connection configuration
const NEO4J_URI = env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USERNAME = env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = env.NEO4J_PASSWORD || 'password';

export function initNeo4jDriver(): Driver {
	if (!driver) {
		driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD), {
			// Connection pool settings
			maxConnectionPoolSize: 50,
			connectionAcquisitionTimeout: 60000, // 60 seconds
			// Encryption for production
			encrypted: NEO4J_URI.startsWith('neo4j+s://') || NEO4J_URI.startsWith('bolt+s://')
		});

		console.log('[Neo4j] Driver initialized:', NEO4J_URI);
	}
	return driver;
}

export function getNeo4jSession(): Session {
	const driverInstance = initNeo4jDriver();
	return driverInstance.session();
}

export async function closeNeo4jDriver(): Promise<void> {
	if (driver) {
		await driver.close();
		driver = null;
		console.log('[Neo4j] Driver closed');
	}
}

// Citation graph data models
export interface CitationNode {
	id: string;
	title: string;
	url: string;
	author?: string;
	publisher?: string;
	publishDate?: string;
	type: 'academic' | 'news' | 'web' | 'discussion' | 'internal';
}

export interface DiscussionNode {
	id: string;
	title: string;
	authorId: string;
	createdAt: string;
	goodFaithScore?: number;
}

export interface PostNode {
	id: string;
	discussionId: string;
	authorId: string;
	createdAt: string;
	goodFaithScore?: number;
}

// Citation relationships
export interface CitesRelationship {
	discussionId?: string;
	postId?: string;
	citationId: string;
	pointSupported: string;
	relevantQuote: string;
	pageNumber?: string;
	createdAt: string;
}

export interface ReferencesRelationship {
	fromDiscussionId?: string;
	fromPostId?: string;
	toDiscussionId?: string;
	toPostId?: string;
	createdAt: string;
}

// Basic Neo4j operations
export class CitationGraphService {
	private session: Session;

	constructor() {
		this.session = getNeo4jSession();
	}

	async close(): Promise<void> {
		await this.session.close();
	}

	// Create or update a citation node
	async upsertCitation(citation: CitationNode): Promise<void> {
		const query = `
      MERGE (c:Citation {id: $id})
      SET c.title = $title,
          c.url = $url,
          c.author = $author,
          c.publisher = $publisher,
          c.publishDate = $publishDate,
          c.type = $type,
          c.updatedAt = datetime()
      ON CREATE SET c.createdAt = datetime()
    `;

		await this.session.run(query, citation);
	}

	// Create or update a discussion node
	async upsertDiscussion(discussion: DiscussionNode): Promise<void> {
		const query = `
      MERGE (d:Discussion {id: $id})
      SET d.title = $title,
          d.authorId = $authorId,
          d.createdAt = datetime($createdAt),
          d.goodFaithScore = $goodFaithScore,
          d.updatedAt = datetime()
      ON CREATE SET d.createdAt = datetime($createdAt)
    `;

		await this.session.run(query, discussion);
	}

	// Create a citation relationship
	async createCitationRelationship(relationship: CitesRelationship): Promise<void> {
		const query = `
      MATCH (c:Citation {id: $citationId})
      ${
				relationship.discussionId
					? 'MATCH (d:Discussion {id: $discussionId}) MERGE (d)-[r:CITES]->(c)'
					: 'MATCH (p:Post {id: $postId}) MERGE (p)-[r:CITES]->(c)'
			}
      SET r.pointSupported = $pointSupported,
          r.relevantQuote = $relevantQuote,
          r.pageNumber = $pageNumber,
          r.createdAt = datetime($createdAt)
    `;

		await this.session.run(query, relationship);
	}

	// Get citations for a discussion
	async getDiscussionCitations(discussionId: string): Promise<any[]> {
		const query = `
      MATCH (d:Discussion {id: $discussionId})-[r:CITES]->(c:Citation)
      RETURN c, r
      ORDER BY r.createdAt DESC
    `;

		const result = await this.session.run(query, { discussionId });
		return result.records.map((record) => ({
			citation: record.get('c').properties,
			relationship: record.get('r').properties
		}));
	}

	// Find discussions that cite the same sources
	async findRelatedDiscussions(discussionId: string, limit: number = 10): Promise<any[]> {
		const query = `
      MATCH (d1:Discussion {id: $discussionId})-[:CITES]->(c:Citation)<-[:CITES]-(d2:Discussion)
      WHERE d1.id <> d2.id
      RETURN d2, count(c) as sharedCitations
      ORDER BY sharedCitations DESC
      LIMIT $limit
    `;

		const result = await this.session.run(query, { discussionId, limit });
		return result.records.map((record) => ({
			discussion: record.get('d2').properties,
			sharedCitations: record.get('sharedCitations').toNumber()
		}));
	}

	// Get citation network metrics
	async getCitationNetworkStats(): Promise<any> {
		const query = `
      MATCH (d:Discussion)-[:CITES]->(c:Citation)
      RETURN
        count(DISTINCT d) as totalDiscussions,
        count(DISTINCT c) as totalCitations,
        count(*) as totalCitationRelationships,
        avg(size((d)-[:CITES]->(:Citation))) as avgCitationsPerDiscussion
    `;

		const result = await this.session.run(query);
		return result.records[0].toObject();
	}
}

// Export singleton instance
export const citationGraph = new CitationGraphService();
