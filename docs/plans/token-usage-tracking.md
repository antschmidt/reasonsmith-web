# Token Usage Tracking Plan

## Overview
Track Claude API token usage per user per request, plus maintain an overall tally of tokens used across the platform.

## Database Schema

### New Table: `api_usage_log`
```sql
CREATE TABLE public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid REFERENCES public.contributor(id),
  provider text NOT NULL DEFAULT 'claude',  -- 'claude', 'openai', etc.
  model text NOT NULL,                       -- 'claude-sonnet-4-20250514', etc.
  endpoint text NOT NULL,                    -- 'goodFaithClaude', 'goodFaithClaudeFeatured', etc.
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  total_tokens integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  post_id uuid REFERENCES public.post(id),
  discussion_id uuid REFERENCES public.discussion(id),
  request_metadata jsonb,                    -- Optional: store additional context
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_api_usage_log_contributor ON api_usage_log(contributor_id);
CREATE INDEX idx_api_usage_log_created_at ON api_usage_log(created_at);
CREATE INDEX idx_api_usage_log_provider ON api_usage_log(provider);
```

### New Table: `api_usage_summary` (materialized or updated via trigger)
```sql
CREATE TABLE public.api_usage_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid REFERENCES public.contributor(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  provider text NOT NULL,
  total_requests integer NOT NULL DEFAULT 0,
  total_input_tokens bigint NOT NULL DEFAULT 0,
  total_output_tokens bigint NOT NULL DEFAULT 0,
  total_tokens bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contributor_id, period_start, period_end, provider)
);

-- Platform-wide summary (contributor_id = NULL)
-- Per-user summaries (contributor_id = user's ID)
```

## API Changes

### 1. Modify `analyzeWithClaude` function
Return token usage along with the analysis result:

```typescript
interface ClaudeAnalysisResult {
  // existing fields...
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

async function analyzeWithClaude(fullContent: string): Promise<ClaudeAnalysisResult> {
  const msg = await anthropic.messages.create({...});
  
  return {
    ...normalizedResult,
    usage: {
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
      total_tokens: msg.usage.input_tokens + msg.usage.output_tokens
    }
  };
}
```

### 2. Log usage after successful API calls
In the POST handler, after getting the result:

```typescript
if (scored.usedAI && scored.usage) {
  await logApiUsage({
    contributorId,
    provider: 'claude',
    model: PROVIDER_CONFIGS.claude.model,
    endpoint: 'goodFaithClaude',
    inputTokens: scored.usage.input_tokens,
    outputTokens: scored.usage.output_tokens,
    postId: input.postId,
    discussionId: input.discussionContext?.discussion?.id
  });
}
```

### 3. Create shared logging utility
`src/lib/server/apiUsageLogger.ts`:

```typescript
export async function logApiUsage(params: {
  contributorId: string | null;
  provider: string;
  model: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  postId?: string;
  discussionId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Insert into api_usage_log table
  // Update api_usage_summary (current month)
}
```

## Hasura Permissions

### `api_usage_log`
- **anonymous**: No access
- **me/user**: SELECT own records only (`contributor_id = X-Hasura-User-Id`)
- **slartibartfast**: SELECT all records
- **admin**: Full access

### `api_usage_summary`
- **anonymous**: No access  
- **me/user**: SELECT own records only
- **slartibartfast**: SELECT all records
- **admin**: Full access

## Admin Dashboard (Future)

Add to admin panel:
- Total tokens used (all time, this month, today)
- Tokens per user breakdown
- Tokens per endpoint breakdown
- Cost estimation based on Claude pricing

## User Dashboard (Future)

Show users their own usage:
- Tokens used this month
- Historical usage chart
- Breakdown by analysis type

## Files to Modify

1. `nhost/migrations/` - Add new migration for tables
2. `nhost/metadata/databases/default/tables/` - Add table metadata + permissions
3. `src/routes/api/goodFaithClaude/+server.ts` - Capture and log usage
4. `src/routes/api/goodFaithClaudeFeatured/+server.ts` - Capture and log usage
5. `src/routes/api/goodFaith/+server.ts` - Capture and log usage (if OpenAI)
6. `src/lib/server/apiUsageLogger.ts` - New shared logging utility
7. `src/lib/graphql/queries/` - Add queries for fetching usage data

## Implementation Order

1. Create database migration for new tables
2. Add Hasura metadata and permissions
3. Create server-side logging utility
4. Modify Claude API endpoint to capture usage
5. Modify Featured Analysis API endpoint
6. Add GraphQL queries for fetching usage
7. (Future) Add admin dashboard view
8. (Future) Add user dashboard view

## Considerations

- **Performance**: Logging should be non-blocking (fire-and-forget with error handling)
- **Privacy**: Usage logs contain user IDs - ensure proper access controls
- **Retention**: Consider data retention policy for detailed logs vs summaries
- **Cost tracking**: Can add estimated_cost_usd column based on current Claude pricing
