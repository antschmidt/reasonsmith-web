# ReasonSmith

> Forge your strongest arguments

A platform for good-faith political discussion, where ideas are crafted and honed with the precision of a blacksmith's hammer. ReasonSmith combines editorial discipline with collaborative refinement, featuring AI-powered good-faith analysis, citation management, and transparent revision history.

---

## ✨ Key Features

- **📝 Rich Text Editor**: Powered by TipTap with full formatting support (bold, italic, lists, headings, code blocks)
- **📚 Citation System**: Chicago-style citations with automatic formatting and citation network visualization
- **🎯 Good-Faith Analysis**: AI-powered content moderation using Claude and OpenAI to score arguments for constructive discourse
- **👥 Role-Based Access**: Three-tier system (user, site manager, admin) with granular permissions
- **💾 Auto-Save Drafts**: Real-time draft persistence with local storage fallback and network sync
- **🏆 Editor's Desk**: Curated featured content selected by site managers
- **🔔 Notifications**: Real-time updates for mentions, approvals, and discussion activity
- **🎨 Writing Styles**: Multiple formats (journalistic, academic, quick point) with style-specific requirements
- **🔐 Flexible Authentication**: GitHub, Google OAuth, magic links, or email/password
- **📊 User Statistics**: Track good-faith rate, source accuracy, and reputation scores
- **🗂️ Citation Networks**: Neo4j-powered visualization of argument connections
- **🎭 Anonymous Posting**: Optional anonymity for sensitive discussions
- **💳 Credits System**: Monthly credits with optional purchased credits for good-faith analysis
- **🔍 Content Quality Assessment**: Automated checks for citations, argument structure, and tone

---

## 🚀 Tech Stack

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

## 🔧 Installation & Setup

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

## 📁 Project Structure

```
reasonsmith-web/
├─ src/
│  ├─ lib/
│  │  ├─ components/          # 37+ Svelte components
│  │  │  ├─ admin/           # Admin & site manager tools
│  │  │  ├─ citations/       # Citation forms & network viz
│  │  │  ├─ discussion/      # Discussion UI components
│  │  │  ├─ landing/         # Marketing & onboarding
│  │  │  ├─ posts/           # Post/comment components
│  │  │  └─ ui/              # Reusable UI primitives
│  │  ├─ graphql/
│  │  │  └─ queries.ts       # GraphQL queries & mutations
│  │  ├─ types/
│  │  │  └─ writingStyle.ts  # Style definitions & types
│  │  ├─ utils/              # 22 utility modules
│  │  │  ├─ analysisCache.ts
│  │  │  ├─ contentQuality.ts
│  │  │  ├─ draftAutosave.ts
│  │  │  ├─ editorsDeskUtils.ts
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
│  │  │  ├─ +page.svelte              # Discussion list
│  │  │  ├─ [id]/+page.svelte         # Discussion view
│  │  │  └─ [id]/draft/[draft_id]/    # Draft editor
│  │  ├─ admin/              # Admin dashboard
│  │  ├─ profile/            # User profile editor
│  │  ├─ u/[id]/             # Public user profiles
│  │  ├─ resources/          # Documentation pages
│  │  └─ ...
│  └─ app.html               # HTML template
├─ static/                   # Static assets (logos, icons)
├─ tests/                    # E2E and unit tests
├─ .env                      # Environment variables (not committed)
├─ CLAUDE.md                 # Architecture documentation for Claude
├─ package.json              # Dependencies & scripts
└─ README.md
```

---

## 📝 Available Scripts

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

## 🏗️ Architecture Overview

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

---

## 🔌 API Endpoints

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

## 🗄️ Database Schema Overview

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

- **`citation`**: Citation records
  - Chicago-style citation fields
  - Point supported, relevant quotes
  - Links to discussions/posts

- **`editors_desk_pick`**: Featured content
  - Requires author approval
  - Display order and publication status

---

## 🎨 Brand & Design

ReasonSmith follows a sophisticated, editorial aesthetic inspired by Foreign Affairs and The Atlantic:

- **Typography**: Display font for headings, sans-serif for body
- **Colors**: Defined in CSS custom properties (`--color-primary`, `--color-accent`)
- **Dark Mode**: Full theme support via `[data-theme='dark']`
- **Logo**: Available in `static/logo.svg` and `static/logo-dark.svg`

Design principles documented in `CLAUDE.md`.

---

## 🧪 Testing

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

## 🚀 Deployment

ReasonSmith is deployed on Vercel with:
- Automatic deployments from main branch
- Environment variables configured in Vercel dashboard
- Custom domain with SSL
- Serverless function cold starts optimized

**Adapter**: `@sveltejs/adapter-vercel`

---

## 🛠️ Development Guidelines

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
- **ui/**: Reusable primitives (buttons, modals, badges)
- **posts/**: Post-specific components (composer, item display)
- **discussion/**: Discussion-specific (header, edit form, references)
- **citations/**: Citation management (form, list, network)
- **admin/**: Admin-only tools
- **landing/**: Marketing and onboarding

---

## 📚 Additional Documentation

- **CLAUDE.md**: Comprehensive architecture documentation for AI assistants
- **Community Guidelines**: `/resources/community-guidelines`
- **Citation Best Practices**: `/resources/citation-best-practices`
- **Good-Faith Arguments**: `/resources/good-faith-arguments`

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](./LICENSE).

See the LICENSE file for the full terms and conditions.

---

## 🤝 Contributing

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
