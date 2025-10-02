# ReasonSmith

> Forge your strongest arguments

A platform for good-faith political discussion, where ideas are crafted and honed with the precision of a blacksmith’s hammer. Users can post, debate, and refine arguments in a respectful, integrity-first environment.

---

## 🚀 Tech Stack

- **Frontend:** SvelteKit, TypeScript
- **Backend:** Nhost (Hasura GraphQL + PostgreSQL)
- **GraphQL Client:** Apollo Client
- **LLM Moderation:** Vercel Serverless Functions + OpenAI API

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
   VITE_NHOST_BACKEND_URL=https://<your-nhost-subdomain>.nhost.app
   VITE_NHOST_ANON_KEY=<your-nhost-anon-key>
   OPENAI_API_KEY=<your-openai-api-key>
   ```

4. **Run the development server**

   ```bash
   pnpm dev
   ```

5. **Build for production**

   ```bash
   pnpm build
   pnpm preview
   ```

---

## 📁 Folder Structure

```
reasonsmith-web/
├─ src/
│  ├─ lib/
│  │  └─ nhostClient.ts       # Nhost & GraphQL client setup
│  ├─ routes/
│  │  ├─ +layout.svelte       # Global layout & navbar
│  │  ├─ +page.svelte         # Home / discussions list
│  │  └─ discussion/[id]/
│  │     └─ +page.svelte      # Thread view
│  └─ app.html               # HTML template
├─ static/                   # Static assets (logo SVGs, icons)
├─ .env                     # Environment variables (not committed)
├─ package.json             # Scripts & dependencies
└─ README.md
```

---

## 📝 Scripts

| Command        | Description                          |
| -------------- | ------------------------------------ |
| `pnpm dev`     | Start dev server at `localhost:5173` |
| `pnpm build`   | Compile for production               |
| `pnpm preview` | Preview production build             |

---

## 🎨 Brand & Assets

- Logo: `static/logo.svg`, `static/logo-dark.svg`
- Color palette & typography details in `/docs/brand.md`

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](./LICENSE).

See the LICENSE file for the full terms and conditions.
