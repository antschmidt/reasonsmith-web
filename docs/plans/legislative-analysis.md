# Legislative Analysis Feature Plan

## Overview

Add the ability to analyze US legislation (federal and state) using AI, display structured impact assessments, and use legislation as context for discussions.

---

## Key Decisions (Per User)

1. **AI Provider**: Claude only for MVP. OpenAI/Gemini deferred, admin-only for testing when added.
2. **Jurisdiction**: Federal + Minnesota to start. Add states on user request.
3. **UI Location**: Dedicated `/legislation` route. Later add homepage row under Featured Analysis.
4. **Bill Text**: Fetch on-demand, archive compressed copy to object storage at analysis time.
5. **Pricing Model**: Purchased credits only with cost estimation. Large bills may require chunked analysis.

---

## Architecture Decisions

### 1. Separate Table
Create new `legislation` and `legislation_analysis` tables rather than extending `public_showcase_item`:
- Different data model (bill metadata, voting records, impact assessments vs rhetoric analysis)
- Different caching needs (legislation status changes over time)
- Cleaner separation of concerns

### 2. New Route Structure
Create `/legislation` routes separate from `/featured`:
- `/legislation` - Browse/search legislation
- `/legislation/[id]` - Detail view with AI analysis
- Discussions can link via new `discussion.legislation_id` column

### 3. API Strategy
- **Federal**: Congress.gov API (official, 5k req/hour, free with API key)
- **Minnesota**: Open States API (free, covers all states) or LegiScan
- Unified abstraction layer for consistent interface

### 4. Bill Text Archival Strategy
- Fetch full text on-demand from source APIs
- On analysis: compress and store snapshot to Nhost Storage (object storage)
- Store reference (`archived_text_url`, `archived_at`) in `legislation` table
- Allows historical comparison if bill text changes

---

## Database Schema

### New Tables

```sql
-- Core legislation data
CREATE TABLE legislation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_bill_id TEXT NOT NULL,        -- e.g., "hr-1234-118"
    congress_number INTEGER,
    bill_type TEXT,                         -- "HR", "S", "HJRes", etc.
    bill_number INTEGER,
    jurisdiction TEXT NOT NULL,             -- "federal", "state"
    jurisdiction_code TEXT,                 -- "US", "CA", "NY"
    chamber TEXT,                           -- "house", "senate"
    title TEXT NOT NULL,
    short_title TEXT,
    summary TEXT,
    status TEXT NOT NULL,                   -- "introduced", "passed_house", "enacted", etc.
    status_date TIMESTAMPTZ,
    introduced_date DATE,
    last_action_date DATE,
    source_api TEXT NOT NULL,               -- "congress_gov", "legiscan"
    source_url TEXT,
    bill_text TEXT,
    sponsor_data JSONB,
    cosponsors_data JSONB,
    votes_data JSONB,                       -- Populated after votes occur
    subjects JSONB,
    fetched_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(external_bill_id, source_api)
);

-- AI analysis results
CREATE TABLE legislation_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legislation_id UUID NOT NULL REFERENCES legislation(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN DEFAULT TRUE,
    provider TEXT NOT NULL,                 -- "claude", "openai", "gemini"
    model TEXT NOT NULL,
    legislation_breakdown JSONB,            -- Structured breakdown of provisions
    positive_impacts JSONB,                 -- Who benefits (with reasoning/sources)
    negative_impacts JSONB,                 -- Who is harmed (with reasoning/sources)
    voting_analysis JSONB,                  -- Vote patterns analysis
    fiscal_impact JSONB,
    summary TEXT,
    tldr TEXT,
    sources_cited JSONB,
    input_tokens INTEGER,
    output_tokens INTEGER,
    analyzed_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES contributor(id)
);

-- Link to discussions
ALTER TABLE discussion ADD COLUMN legislation_id UUID REFERENCES legislation(id);
```

### Impact Assessment Schema

```typescript
interface ImpactAssessment {
  stakeholder_group: string;       // "Small business owners"
  impact_type: "positive" | "negative" | "mixed";
  impact_level: "high" | "medium" | "low";
  description: string;
  reasoning: string;
  sources: Array<{ name: string; url?: string; }>;
  provisions_referenced: string[]; // Which bill sections
}
```

---

## New Files to Create

### API Integration Layer
```
src/lib/legislation/
├── apis/
│   ├── index.ts              # Unified interface
│   ├── congressGov.ts        # Congress.gov API
│   ├── openStates.ts         # Open States API (for state legislation)
│   └── cache.ts              # Caching/rate limiting
├── prompts.ts                # AI analysis prompts
└── types.ts                  # TypeScript types
```

### API Endpoints
```
src/routes/api/
├── legislationAnalysis/
│   └── +server.ts            # AI analysis endpoint
└── legislation/
    ├── search/+server.ts     # Search legislation
    └── import/+server.ts     # Import from external API
```

### Frontend Components
```
src/lib/components/legislation/
├── LegislationAnalysisContext.svelte  # Context display in discussions
├── LegislationCard.svelte             # Card for lists
├── ImpactAssessmentCard.svelte        # Positive/negative impacts
└── VotingBreakdown.svelte             # Voting visualization
```

### Routes
```
src/routes/legislation/
├── +page.svelte              # Browse/search
├── +page.server.ts
├── [id]/
│   ├── +page.svelte          # Detail view
│   └── +page.server.ts
```

### GraphQL
```
src/lib/graphql/queries/legislation.ts  # Queries and mutations
src/lib/graphql/fragments/index.ts      # Add LEGISLATION_FIELDS fragment
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/graphql/queries/index.ts` | Export legislation queries |
| `src/routes/discussions/[id]/+page.svelte` | Add LegislationAnalysisContext |
| `src/routes/discussions/new/+page.svelte` | Support `?legislation=` param |
| `nhost/metadata/databases/default/tables/tables.yaml` | Register new tables |

---

## AI Analysis Prompt (Summary)

The AI will act as a "legislative impact expert" providing:
1. **Legislation Breakdown** - Provisions, key definitions, effective dates
2. **Positive Impacts** - Stakeholder groups that benefit, with reasoning and sources
3. **Negative Impacts** - Stakeholder groups harmed, with reasoning and sources  
4. **Voting Analysis** (if passed) - Party breakdown, crossover votes, patterns
5. **Fiscal Impact** - Budget implications if available

Output is structured JSON with strict political neutrality.

---

## Phased Implementation

### Phase 1: Foundation (MVP)
- [ ] Database migration for `legislation` and `legislation_analysis` tables
- [ ] Add `legislation_id` to `discussion` table
- [ ] Hasura metadata and permissions
- [ ] Congress.gov API integration with caching
- [ ] Open States API integration (Minnesota)
- [ ] GraphQL queries/mutations
- [ ] Token estimation utility

### Phase 2: AI Analysis (MVP)
- [ ] Create `/api/legislationAnalysis` endpoint (Claude only)
- [ ] Legislation-specific analysis prompts (impact expert persona)
- [ ] Tiered analysis: Summary vs Full
- [ ] Cost estimation before analysis
- [ ] Token tracking for legislation endpoint
- [ ] Bill text archival to Nhost Storage

### Phase 3: Frontend (MVP)
- [ ] `/legislation` browse/search page (federal + MN filter)
- [ ] `/legislation/[id]` detail page with cost estimate
- [ ] "Request Analysis" flow with credit confirmation
- [ ] Impact assessment visualization (positive/negative cards)
- [ ] Voting breakdown component (if bill has votes)
- [ ] Sponsor/cosponsor display (for unpassed bills)

### Phase 4: Discussion Integration (MVP)
- [ ] Start discussion from legislation
- [ ] Section selection UI for context
- [ ] `LegislationAnalysisContext.svelte` component
- [ ] Legislation context display in discussion pages

### Phase 5: Polish & Future
- [ ] Homepage "Legislative Analysis" row
- [ ] State filter on homepage row
- [ ] Add more states on request
- [ ] Admin: OpenAI/Gemini provider testing
- [ ] Chunking for very large bills (Tier 2 full analysis)

---

## Environment Variables Needed

```bash
CONGRESS_GOV_API_KEY=xxx
OPEN_STATES_API_KEY=xxx        # For Minnesota/state legislation
```

---

## Cost Estimation & Credit System

### Credit Model: Purchased Credits Only
Legislation analysis uses **purchased credits only** (not monthly subscription credits).
- Higher cost variability than standard good-faith analysis
- Users pay for what they use
- Leverages existing `purchased_credits` / `purchased_credits_used` in `contributor` table

### The Challenge
Large bills (e.g., omnibus spending bills) can be 1000+ pages. At ~500 tokens/page:
- 1000 page bill = ~500,000 tokens input
- Claude pricing: ~$15/million input tokens = ~$7.50 just for input
- Plus output tokens for analysis

### Proposed Solution: Tiered Analysis

**Tier 1: Summary Analysis (Default)**
- Use bill summary + key sections only (~10-50k tokens)
- Estimated cost: $0.50-2.00 worth of credits
- Provides: Overview, key impacts, voting record

**Tier 2: Full Analysis (Premium)**  
- Full bill text, chunked if necessary
- Estimated cost: Calculated based on actual token count
- Provides: Section-by-section breakdown, detailed impacts

### Cost Estimation Flow
```
1. User selects legislation
2. System fetches metadata + estimates token count
3. Display: "Estimated cost: X credits (you have Y available)"
   - Summary Analysis: A credits
   - Full Analysis: B credits (if bill is large)
4. If insufficient credits → prompt to purchase more
5. User confirms → credits reserved → analysis runs
6. Actual credits deducted (refund difference if estimate was high)
```

### Credit Calculation
```typescript
// Rough formula (to be tuned)
const INPUT_COST_PER_1K_TOKENS = 0.015;  // $0.015 per 1k input
const OUTPUT_COST_PER_1K_TOKENS = 0.075; // $0.075 per 1k output
const CREDITS_PER_DOLLAR = 100;          // 1 credit = $0.01

function estimateCredits(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1000) * INPUT_COST_PER_1K_TOKENS;
  const outputCost = (outputTokens / 1000) * OUTPUT_COST_PER_1K_TOKENS;
  return Math.ceil((inputCost + outputCost) * CREDITS_PER_DOLLAR * 1.2); // 20% buffer
}
```

### Chunking Strategy (for Tier 2)
For bills exceeding Claude's context window:
1. Split bill into logical sections (titles/divisions)
2. Analyze each section independently
3. Final synthesis pass combines section analyses
4. Store all chunks + synthesis as single `legislation_analysis`

### Database Additions for Pricing

```sql
-- Add to legislation table
ALTER TABLE legislation ADD COLUMN estimated_tokens INTEGER;
ALTER TABLE legislation ADD COLUMN estimated_credits INTEGER;

-- Add to legislation_analysis table  
ALTER TABLE legislation_analysis ADD COLUMN analysis_tier TEXT; -- 'summary' or 'full'
ALTER TABLE legislation_analysis ADD COLUMN chunks_count INTEGER DEFAULT 1;
ALTER TABLE legislation_analysis ADD COLUMN actual_credits_used INTEGER;
```

---

## Context Selection for Discussions

### The Problem
Users starting discussions can't include entire 1000-page bill as context.

### Solution: Section Selection
When starting discussion from legislation:
1. Display legislation table of contents / section list
2. User selects specific sections relevant to their discussion
3. Only selected sections included as context
4. Display token/credit estimate for selected context

### UI Flow
```
"Start Discussion about HR-1234"
  ↓
"Select sections to include as context:"
  [ ] Title I - Funding Provisions (est. 2,500 tokens)
  [x] Title II - Environmental Standards (est. 1,200 tokens)  
  [x] Section 203 - Emissions Requirements (est. 400 tokens)
  [ ] Title III - Enforcement (est. 3,100 tokens)
  
  Selected: 1,600 tokens (~$0.02 context cost)
  [Continue to Discussion]
```

---

## Concerns & Mitigations

| Concern | Mitigation |
|---------|------------|
| API rate limits | Aggressive caching, queue system for bulk imports |
| Large bill costs | Tiered pricing, clear estimates before purchase |
| Context window limits | Chunking strategy with synthesis |
| Bill text changes | Archive snapshots at analysis time |
| State API differences | Abstraction layer normalizes data |
| User sticker shock | Show estimates upfront, start with summary tier |

---

## Future Enhancements (Post-MVP)

- Homepage "Legislative Analysis" row with state filter
- OpenAI/Gemini providers (admin testing first)
- Bill comparison tool (compare two versions)
- Legislator voting history integration
- Email alerts for bill status changes
- Community-funded analysis (crowdfund analysis of expensive bills)

---

## Related: Credit System Review

Note: The current credit system needs holistic review. Currently there are:
- Monthly subscription credits (`analysis_limit`, `analysis_count_used`)
- Purchased credits (`purchased_credits`, `purchased_credits_used`)
- Role-based bypasses (admin, slartibartfast)

A future task should analyze and potentially redesign this system for clarity and flexibility.
