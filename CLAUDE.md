# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Development:**

- `pnpm dev` - Start development server at localhost:5173
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build

**Quality Assurance:**

- `pnpm lint` - Run Prettier linting
- `pnpm format` - Format code with Prettier
- `pnpm check` - Run SvelteKit type checking
- `pnpm check:watch` - Run type checking in watch mode

**Testing:**

- `pnpm test:unit` - Run unit tests with Vitest
- `pnpm test:e2e` - Run end-to-end tests with Playwright
- `pnpm test` - Run all tests (unit + e2e)

## Architecture

**Tech Stack:**

- Frontend: SvelteKit 2 with TypeScript, deployed on Vercel
- Backend: Nhost (Hasura GraphQL + PostgreSQL)
- Authentication: Nhost Auth with GitHub OAuth
- AI Moderation: Vercel Functions with OpenAI API integration
- Package Manager: pnpm

**Key Components:**

1. **Authentication & User Management:**
   - `src/lib/nhostClient.ts` - Nhost client configuration with custom auth domain (auth.reasonsmith.com)
   - Hasura roles: 'anonymous' (unauthenticated), 'me' (authenticated)
   - Application roles: 'user' (default), 'slartibartfast' (site manager - featured content, disputes, operations), 'admin' (root admin with complete system control)
   - Auto-creates contributor records on sign-in

2. **Data Layer:**
   - GraphQL queries/mutations in `src/lib/graphql/queries.ts`
   - Core entities: discussions, posts, contributors
   - Post lifecycle: draft → pending → approved
   - Good-faith scoring system with AI evaluation

3. **Good-Faith Scoring:**
   - `functions/goodFaith/index.ts` - Serverless function for content moderation
   - Uses heuristic scoring (placeholder for full LLM integration)
   - Scores posts on 0-1 scale with labels (hostile, questionable, neutral, constructive)

4. **Draft System:**
   - Auto-saving drafts with `src/lib/autosaveDraft.ts`
   - Posts start as drafts, get scored, then published to pending status

**Database Structure:**

- `discussion` - Main discussion threads
- `post` - Individual posts/comments with draft_content and published content
- `contributor` - User profiles linked to auth.users
- Good-faith scoring fields: `good_faith_score`, `good_faith_label`, `good_faith_last_evaluated`

**Environment Configuration:**

- Uses `PUBLIC_NHOST_SUBDOMAIN` and `PUBLIC_NHOST_REGION` for Nhost connection
- Custom domain endpoints: auth.reasonsmith.com, graphql.reasonsmith.com, storage.reasonsmith.com
- OAuth configured with GitHub (client credentials in nhost.toml)

**Key Patterns:**

- SvelteKit file-based routing in `src/routes/`
- Real-time auth state management with Nhost callbacks
- GraphQL fragments for consistent data fetching
- Responsive design with custom CSS properties
- Uses pnpm with specific esbuild dependency constraints
