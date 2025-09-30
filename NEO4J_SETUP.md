# Neo4j Citation Tracking Setup

This guide explains how to complete the Neo4j citation tracking integration for ReasonSmith.

## ✅ What's Already Implemented

### 1. Neo4j Client & Data Models

- **File**: `src/lib/neo4jClient.ts`
- **Features**: Connection management, citation nodes, discussion nodes, relationship creation
- **Services**: `CitationGraphService` with methods for upserting data and querying relationships

### 2. API Endpoint

- **File**: `src/routes/api/syncCitations/+server.ts`
- **POST**: Syncs discussion citations to Neo4j
- **GET**: Retrieves citation networks and related discussions

### 3. Frontend Integration

- **Citation Sync**: Automatically syncs citations when discussions are published
- **Citation Network Component**: `src/lib/components/CitationNetwork.svelte`
- **Import Added**: Component imported in discussion details page

### 4. Environment Configuration

- Neo4j connection variables added to `.env`

## 🛠️ Setup Instructions

### Step 1: Install Neo4j

**Option A: Neo4j Desktop (Recommended for Development)**

1. Download [Neo4j Desktop](https://neo4j.com/download/)
2. Create a new project
3. Add a local database
4. Set password and start the database
5. Default connection: `bolt://localhost:7687`

**Option B: Neo4j Aura (Cloud)**

1. Sign up at [Neo4j Aura](https://neo4j.com/cloud/aura/)
2. Create a free tier database
3. Note the connection URI (starts with `neo4j+s://`)
4. Download the credentials

### Step 2: Configure Environment Variables

Update your `.env` file with your Neo4j credentials:

```bash
# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687  # or your Aura URI
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_actual_password_here
```

### Step 3: Add CitationNetwork Component to Discussion Page

In `src/routes/discussions/[id]/+page.svelte`, add the component after the discussion content:

```svelte
<!-- Add this somewhere in the main discussion display area -->
{#if discussion?.id}
	<CitationNetwork discussionId={discussion.id} showRelated={true} />
{/if}
```

**Suggested placement**: After the discussion description/content, before the posts section.

### Step 4: Initialize Neo4j Schema (Optional)

Create indexes for better performance:

```cypher
// Run these in Neo4j Browser or Desktop
CREATE INDEX citation_id_index FOR (c:Citation) ON (c.id);
CREATE INDEX discussion_id_index FOR (d:Discussion) ON (d.id);
CREATE INDEX post_id_index FOR (p:Post) ON (p.id);
```

## 🧪 Testing the Integration

### 1. Create a Discussion with Citations

1. Start your development server: `pnpm dev`
2. Create a new discussion with citations
3. Publish the discussion (must pass good faith check)
4. Check browser console for Neo4j sync logs

### 2. View Citation Network

1. Navigate to a published discussion
2. Look for the "Citation Network" section
3. Should display citations with relationship info
4. May show "Related Discussions" if other discussions cite similar sources

### 3. Debug Neo4j Connection

```bash
# Check if Neo4j is running
curl -I http://localhost:7474  # Neo4j Browser interface

# Test API endpoint
curl "http://localhost:5173/api/syncCitations?discussionId=some-id"
```

## 📊 Graph Data Model

### Nodes

- **Citation**: External sources (academic, news, web, internal)
- **Discussion**: Main discussion threads
- **Post**: Individual comments/replies

### Relationships

- **CITES**: Discussion/Post → Citation
- **REFERENCES**: Discussion/Post → Discussion/Post (internal references)

### Example Queries

**Find discussions citing similar sources:**

```cypher
MATCH (d1:Discussion)-[:CITES]->(c:Citation)<-[:CITES]-(d2:Discussion)
WHERE d1.id <> d2.id
RETURN d1, d2, count(c) as sharedCitations
ORDER BY sharedCitations DESC
```

**Citation network for a discussion:**

```cypher
MATCH (d:Discussion {id: "discussion-id"})-[r:CITES]->(c:Citation)
RETURN d, r, c
```

## 🔧 Advanced Features (Future)

### 1. Citation Quality Scoring

- Add citation reliability scores based on source type
- Track citation usage patterns
- Implement citation recommendation system

### 2. Argument Structure Mapping

- Model logical relationships between claims
- Track supporting vs. contradicting evidence
- Build argument graphs

### 3. User Expertise Networks

- Track user citation patterns
- Identify domain experts
- Build knowledge networks

## 🚨 Troubleshooting

### Common Issues

**1. "Failed to sync citations to Neo4j"**

- Check Neo4j is running: `systemctl status neo4j` or Neo4j Desktop
- Verify connection URI and credentials in `.env`
- Check firewall settings (port 7687)

**2. "CitationNetwork component not displaying"**

- Ensure component is placed in the correct location in the template
- Check browser console for JavaScript errors
- Verify discussion has citations to display

**3. "No related discussions found"**

- This is normal for new/unique discussions
- Related discussions only appear when multiple discussions cite the same sources

### Development Tips

1. **Start Simple**: Test with basic citation sync first
2. **Use Neo4j Browser**: Explore data visually at http://localhost:7474
3. **Check Logs**: Monitor both browser console and server logs
4. **Fallback Gracefully**: Neo4j failures shouldn't break discussion functionality

## 📈 Benefits Realized

Once fully set up, you'll have:

1. **Citation Networks**: Visual representation of source relationships
2. **Related Content Discovery**: Find discussions with shared citations
3. **Research Patterns**: Track how sources are used across discussions
4. **Knowledge Graphs**: Build comprehensive citation networks over time

The system is designed to fail gracefully - if Neo4j is unavailable, discussions still work normally, just without the enhanced citation features.
