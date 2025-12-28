# ReasonSmith

> Forge your strongest arguments

A platform for good-faith political discussion, where ideas are crafted and honed with the precision of a blacksmith's hammer. ReasonSmith combines editorial discipline with collaborative refinement, featuring AI-powered good-faith analysis, citation management, and transparent revision history.

---

## Key Features

### Core Writing & Discussion

- **Rich Text Editor**: Powered by TipTap with full formatting support (bold, italic, lists, headings, code blocks)
- **Citation System**: Chicago-style citations with automatic formatting and citation network visualization
- **Good-Faith Analysis**: AI-powered content moderation using Claude and OpenAI to score arguments for constructive discourse
- **Auto-Save Drafts**: Real-time draft persistence with local storage fallback and network sync
- **Writing Styles**: Multiple formats (journalistic, academic, quick point) with style-specific requirements
- **Anonymous Posting**: Optional anonymity for sensitive discussions
- **Content Quality Assessment**: Automated checks for citations, argument structure, and tone

### Growth & Progression

- **XP System**: Earn experience points for creating discussions, posting comments, and receiving good-faith scores
- **Leveling**: Progress through levels with titles (Novice Thinker, Apprentice Analyst, Journeyman Debater, etc.)
- **Achievements**: Unlock badges for milestones (first post, discussion streaks, quality contributions)
- **Activity Streaks**: Track consecutive days of participation
- **Progress Visualization**: Dashboard displays XP progress, current level, and achievements

### Social & Networking

- **Follow System**: Follow other contributors to see their discussions and activity
- **Collaboration Contacts**: Build a network of trusted collaborators with invite system
- **User Blocking**: Block users to prevent unwanted interactions
- **Saved Interests**: Save topic tags to personalize your discussion feed
- **Networking Dashboard**: Dedicated section for managing follows, contacts, and social connections

### Collaboration

- **Collaboration Invites**: Invite other users to collaborate on discussion drafts
- **Edit Locks**: Automatic locking prevents concurrent editing conflicts
- **Collaborator Chat**: Real-time messaging between discussion collaborators
- **Collaboration Status**: Track invite acceptance, pending requests, and active collaborations

### Events

- **Event Management**: Create and manage community events
- **Upcoming Events**: Dashboard display of upcoming events
- **Event Details**: Full event pages with descriptions, dates, and details

### Content Discovery

- **Filter Modes**: Filter discussions by All, Following (people you follow), or Interests (saved tags)
- **Tag System**: Tag discussions for categorization and discovery
- **Interest-Based Filtering**: Personalized feeds based on saved topic interests
- **Editor's Desk**: Curated featured content selected by site managers

### Notifications

- **Discussion Notifications**: Updates for mentions, approvals, and discussion activity
- **Social Notifications**: Alerts for new followers, follow requests, and contact invites
- **Collaboration Notifications**: Updates for collaboration invites, chat messages, and edit activity
- **Real-Time Updates**: WebSocket-based notification delivery

### Administration

- **Role-Based Access**: Three-tier system (user, site manager, admin) with granular permissions
- **Public Showcase**: Feature discussions on the public-facing showcase page
- **Credits System**: Monthly credits with optional purchased credits for good-faith analysis
- **User Statistics**: Track good-faith rate, source accuracy, and reputation scores
- **Citation Networks**: Neo4j-powered visualization of argument connections

### Authentication

- **Flexible Options**: GitHub, Google OAuth, magic links, or email/password

---

## Tech Stack

**Frontend:**
- SvelteKit 2 with TypeScript
- TipTap rich text editor
- Apollo Client for GraphQL
- Vercel deployment

**Backend:**
- Nhost (Hasura GraphQL + PostgreSQL)
- Neo4j for citation network graphs
- Nhost Auth with GitHub, Google OAuth

**AI & Moderation:**
- Vercel Serverless Functions
- Anthropic Claude API
- OpenAI API

**Additional Libraries:**
- isomorphic-dompurify for sanitization
- svelte-tiptap for Svelte integration
- Playwright for E2E testing
- Vitest for unit testing

---

## Installation & Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/<your-org>/reasonsmith-web.git
   cd reasonsmith-web
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the project root with:

   ```env
   # Nhost Configuration
   PUBLIC_NHOST_SUBDOMAIN=<your-subdomain>
   PUBLIC_NHOST_REGION=<your-region>
   PUBLIC_SITE_URL=http://localhost:5173

   # AI Services
   OPENAI_API_KEY=<your-openai-api-key>
   ANTHROPIC_API_KEY=<your-anthropic-api-key>

   # Neo4j (optional - for citation networks)
   NEO4J_URI=<your-neo4j-uri>
   NEO4J_USERNAME=<your-username>
   NEO4J_PASSWORD=<your-password>
   ```

   **Custom Domains** (production):
   - Auth: auth.reasonsmith.com
   - GraphQL: graphql.reasonsmith.com
   - Storage: storage.reasonsmith.com

4. **Run the development server**

   ```bash
   pnpm dev
   ```

   Server runs at `http://localhost:5173`

5. **Build for production**

   ```bash
   pnpm build
   pnpm preview
   ```

---

## Project Structure

```
reasonsmith-web/
├─ src/
│  ├─ lib/
│  │  ├─ components/
│  │  │  ├─ admin/           # Admin & site manager tools
│  │  │  ├─ citations/       # Citation forms & network viz
│  │  │  ├─ collaboration/   # Collaboration invites, chat, edit locks
│  │  │  ├─ discussion/      # Discussion UI components
│  │  │  ├─ events/          # Event display components
│  │  │  ├─ growth/          # XP, leveling, achievements
│  │  │  ├─ landing/         # Marketing & onboarding
│  │  │  ├─ networking/      # Follow, contacts, blocking
│  │  │  ├─ posts/           # Post/comment components
│  │  │  └─ ui/              # Reusable UI primitives
│  │  ├─ graphql/
│  │  │  └─ queries.ts       # GraphQL queries & mutations
│  │  ├─ types/
│  │  │  └─ writingStyle.ts  # Style definitions & types
│  │  ├─ utils/
│  │  │  ├─ analysisCache.ts
│  │  │  ├─ contentQuality.ts
│  │  │  ├─ draftAutosave.ts
│  │  │  ├─ editLockManager.ts    # Collaboration edit locking
│  │  │  ├─ growthProgression.ts  # XP & leveling logic
│  │  │  ├─ notificationHelpers.ts
│  │  │  └─ ...
│  │  ├─ creditUtils.ts      # Credits & permissions logic
│  │  ├─ logger.ts           # Centralized logging
│  │  ├─ nhostClient.ts      # Nhost & auth setup
│  │  ├─ neo4jClient.ts      # Citation network client
│  │  └─ permissions.ts      # Role-based access control
│  ├─ routes/
│  │  ├─ api/                # Vercel serverless functions
│  │  │  ├─ goodFaith/
│  │  │  ├─ goodFaithClaude/
│  │  │  ├─ goodFaithClaudeFeatured/
│  │  │  ├─ syncCitations/
│  │  │  ├─ audio/[fileId]/
│  │  │  └─ image/[fileId]/
│  │  ├─ discussions/
│  │  │  ├─ +page.svelte              # Discussion list with filters
│  │  │  ├─ [id]/+page.svelte         # Discussion view
│  │  │  └─ [id]/draft/[draft_id]/    # Draft editor
│  │  ├─ events/             # Events list and details
│  │  ├─ admin/              # Admin dashboard
│  │  ├─ profile/            # User profile & interests
│  │  ├─ public/             # Public showcase page
│  │  ├─ u/[id]/             # Public user profiles
│  │  ├─ resources/          # Documentation pages
│  │  └─ +page.svelte        # Dashboard (home)
│  └─ app.html               # HTML template
├─ nhost/
│  ├─ migrations/            # Database migrations
│  └─ metadata/              # Hasura permissions & config
├─ static/                   # Static assets (logos, icons)
├─ tests/                    # E2E and unit tests
├─ .env                      # Environment variables (not committed)
├─ CLAUDE.md                 # Architecture documentation for Claude
├─ package.json              # Dependencies & scripts
└─ README.md
```

---

## Available Scripts

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `pnpm dev`           | Start development server at `localhost:5173`   |
| `pnpm build`         | Build for production                           |
| `pnpm preview`       | Preview production build                       |
| `pnpm check`         | Run SvelteKit type checking                    |
| `pnpm check:watch`   | Run type checking in watch mode                |
| `pnpm lint`          | Check code formatting with Prettier            |
| `pnpm format`        | Format code with Prettier                      |
| `pnpm test:unit`     | Run unit tests with Vitest                     |
| `pnpm test:e2e`      | Run E2E tests with Playwright                  |
| `pnpm test`          | Run all tests                                  |
| `pnpm generate-icons`| Generate optimized icon assets                 |

---

## Architecture Overview

### Authentication & Roles

ReasonSmith uses Nhost Auth with three role levels:

Default role - can create discussions, post comments, receive monthly analysis credits
Site manager - can feature content, manage disputes, moderate posts
Root admin - complete system control, unlimited credits

Permissions are managed centrally in `src/lib/permissions.ts`.

### Good-Faith Scoring System

Content moderation uses AI to score posts on constructive discourse:

1. **Heuristic Pre-check**: Fast client-side quality assessment
2. **AI Analysis**: Claude/OpenAI evaluates claims, arguments, and tone
3. **Score Assignment**: 0-1 scale (hostile → questionable → neutral → constructive → exemplary)
4. **Credit System**: Monthly credits + optional purchased credits for analysis

Scoring functions:
- `/api/goodFaith` - OpenAI-based scoring
- `/api/goodFaithClaude` - Claude-based scoring (posts)
- `/api/goodFaithClaudeFeatured` - Claude-based scoring (discussions)

### Draft & Publish Workflow

1. User creates discussion draft → auto-saved to localStorage + database
2. Optional good-faith analysis before publishing
3. Publish → draft becomes current version, old version archived
4. Version history maintained in `discussion_versions` table

Auto-save implementation in `src/lib/autosaveDraft.ts`:
- Debounced saves (800ms delay)
- Minimum interval between network writes (2.5s)
- Offline-first with localStorage
- Automatic retry on connection restore

### Citation Management

Chicago-style citations with:
- Manual entry via `CitationForm`
- Automatic formatting via `formatChicagoCitation()`
- Neo4j network visualization
- Link citations to specific points in arguments
- Sync citations across draft versions

### Credits System

Monthly credits reset at beginning of each month:
- Track usage in `contributor.analysis_count_used`
- Reset tracked in `analysis_count_reset_at`
- Purchased credits available when monthly exhausted
- Admins/site managers have unlimited credits

Implementation: `src/lib/creditUtils.ts`

### Growth & Progression System

XP-based progression with leveling:
- **XP Sources**: Creating discussions, posting comments, good-faith scores, achievements
- **Levels**: Novice Thinker → Apprentice Analyst → Journeyman Debater → Expert Rhetorician → Master Logician → Grand Philosopher
- **Achievements**: Milestone-based badges with XP rewards
- **Streaks**: Consecutive daily activity tracking

Implementation: `src/lib/utils/growthProgression.ts`, `src/lib/components/growth/`

### Social & Networking System

Follow-based social graph:
- **Follows**: Asymmetric follow relationships
- **Contacts**: Symmetric collaboration relationships with invite system
- **Blocking**: User blocking with interaction prevention
- **Interests**: Saved topic tags for personalized content filtering

Implementation: `src/lib/components/networking/`

### Collaboration System

Real-time collaboration features:
- **Invites**: Invite users to collaborate on discussion drafts
- **Edit Locks**: Pessimistic locking to prevent concurrent editing conflicts
- **Chat**: Real-time messaging between collaborators on a discussion

Implementation: `src/lib/utils/editLockManager.ts`, `src/lib/components/collaboration/`

---

## API Endpoints

### Serverless Functions (Vercel)

**Good-Faith Analysis:**
- `POST /api/goodFaith` - Score content with OpenAI
- `POST /api/goodFaithClaude` - Score posts with Claude
- `POST /api/goodFaithClaudeFeatured` - Score featured discussions with Claude

**Citation Management:**
- `POST /api/syncCitations` - Sync citations to Neo4j network

**Media Serving:**
- `GET /api/audio/[fileId]` - Serve audio files from Nhost storage
- `GET /api/image/[fileId]` - Serve images from Nhost storage

All functions include authentication checks and proper error handling.

---

## Database Schema Overview

### Core Tables

- **`discussion`**: Main discussion threads
  - Links to `discussion_versions` for versioning
  - Tracks anonymous status, approval state

- **`discussion_version`**: Version history for discussions
  - `version_type`: 'draft' or 'published'
  - Title, description, tags, citations
  - Good-faith scores and analysis

- **`post`**: Comments and responses
  - `post_type`: response, counter_argument, supporting_evidence, question
  - Draft content + published content
  - Writing style metadata
  - Good-faith scoring fields

- **`contributor`**: User profiles
  - Display name, handle, bio, social links
  - Role (user/slartibartfast/admin)
  - Analysis credits tracking
  - Reputation scores
  - `interests`: Saved topic tags for personalized filtering
  - XP, level, and streak tracking

- **`citation`**: Citation records
  - Chicago-style citation fields
  - Point supported, relevant quotes
  - Links to discussions/posts

- **`editors_desk_pick`**: Featured content
  - Requires author approval
  - Display order and publication status

### Social & Networking Tables

- **`follow`**: User follow relationships
  - `follower_id`, `following_id`
  - Follow status (active, pending for private accounts)

- **`contact`**: Collaboration contacts
  - Trusted collaborator relationships
  - Contact status

- **`contact_request`**: Pending contact invitations
  - Request status (pending, accepted, rejected)

- **`block`**: User blocking
  - Prevents interactions between users

### Collaboration Tables

- **`collaboration_invite`**: Discussion collaboration invites
  - Links collaborators to discussions
  - Invite status (pending, accepted, rejected)

- **`collaboration_chat_message`**: Real-time collaborator messaging
  - Messages between discussion collaborators

- **`edit_lock`**: Concurrent editing prevention
  - Tracks active editors on discussions

### Growth & Gamification Tables

- **`achievement`**: Achievement definitions
  - Name, description, XP reward, icon
  - Unlock criteria

- **`contributor_achievement`**: Earned achievements
  - Links contributors to unlocked achievements
  - Unlock timestamp

### Events Tables

- **`event`**: Community events
  - Title, description, date/time
  - Location, organizer

### Notification Tables

- **`notification`**: User notifications
  - Multiple notification types (discussion, social, collaboration)
  - Read status, metadata

---

## Brand & Design

ReasonSmith follows a sophisticated, editorial aesthetic inspired by Foreign Affairs and The Atlantic:

- **Typography**: Display font for headings, sans-serif for body
- **Colors**: Defined in CSS custom properties (`--color-primary`, `--color-accent`)
- **Dark Mode**: Full theme support via `[data-theme='dark']`
- **Logo**: Available in `static/logo.svg` and `static/logo-dark.svg`

Design principles documented in `CLAUDE.md`.

---

## Testing

**Unit Tests** (Vitest):
```bash
pnpm test:unit
```

**E2E Tests** (Playwright):
```bash
pnpm test:e2e
```

Test files located in `tests/` and `*.test.ts` files.

---

## Deployment

ReasonSmith is deployed on Vercel with:
- Automatic deployments from main branch
- Environment variables configured in Vercel dashboard
- Custom domain with SSL
- Serverless function cold starts optimized

**Adapter**: `@sveltejs/adapter-vercel`

---

## Development Guidelines

### Using the Logger

Replace `console.log/error/warn` with the centralized logger:

```typescript
import { logger } from '$lib/logger';

logger.debug('Debug info');  // Only in development
logger.info('Informational'); // Only in development
logger.warn('Warning');       // Always logged
logger.error('Error');        // Always logged
```

### Permission Checks

Use centralized permission utilities:

```typescript
import { hasAdminAccess, canEdit, canModerate } from '$lib/permissions';

if (hasAdminAccess(contributor)) {
  // Admin-only functionality
}

if (canEdit(contributor, resourceOwnerId, userId)) {
  // Show edit button
}
```

### Component Organization

Components are organized by function:
- **ui/**: Reusable primitives (buttons, modals, badges, notifications)
- **posts/**: Post-specific components (composer, item display)
- **discussion/**: Discussion-specific (header, edit form, references)
- **citations/**: Citation management (form, list, network)
- **growth/**: XP display, level badges, achievement cards, streak indicators
- **networking/**: Follow buttons, contact lists, blocking UI
- **collaboration/**: Invite management, collaborator chat, edit lock indicators
- **events/**: Event cards, event lists, event details
- **admin/**: Admin-only tools, public showcase manager
- **landing/**: Marketing and onboarding

---

## Additional Documentation

- **CLAUDE.md**: Comprehensive architecture documentation for AI assistants
- **Community Guidelines**: `/resources/community-guidelines`
- **Citation Best Practices**: `/resources/citation-best-practices`
- **Good-Faith Arguments**: `/resources/good-faith-arguments`

---

## License

This project is licensed under the [GNU General Public License v3.0](./LICENSE).

See the LICENSE file for the full terms and conditions.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`pnpm test`)
4. Run type checking (`pnpm check`)
5. Format code (`pnpm format`)
6. Commit changes (`git commit -m 'Add amazing feature'`)
7. Push to branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

---

**Built with ❤️ for constructive discourse**
