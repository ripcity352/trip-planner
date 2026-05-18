# Trip Planner

A web app for planning group trips. MVP: bachelor party. Designed to
generalize to any "friends planning a trip together" use case.

**Stack:** Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui · Supabase · Vercel.
Mobile-first.

## Status

**Goal 1 — Foundation deployed.** See [`notes/roadmap.md`](./notes/roadmap.md).

## Local setup

### Prereqs

- Node 20+
- pnpm 11+ (`npm install -g pnpm` or `corepack enable`)
- A Supabase project (free tier is fine)
- A Vercel account for deploys

### Install

```bash
pnpm install
```

### Configure

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY from the Supabase dashboard.
```

### Apply the initial migration

Open the Supabase SQL editor, paste the contents of
`supabase/migrations/0001_init.sql`, and run it. Or with the CLI:

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <your-ref>
pnpm dlx supabase db push
```

### Run

```bash
pnpm dev
```

Visit http://localhost:3000.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Run the built production server |
| `pnpm lint` | ESLint over all sources |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check |
| `pnpm test` | Run Vitest unit tests once |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:e2e` | Run Playwright E2E (requires `pnpm test:e2e:install` once first) |

## Project layout

See [`CLAUDE.md`](./CLAUDE.md) for the full conventions. High level:

```
/app                Next.js App Router routes
/components/ui      shadcn primitives
/components/trip    trip-specific composed components
/lib/supabase       server.ts, browser.ts, middleware.ts clients
/lib/db             typed query functions, one file per table
/lib/utils.ts       cn() helper
/supabase/migrations  SQL migrations, timestamped
/notes              roadmap, decisions, research, design notes
/tests/unit         Vitest unit tests
/e2e                Playwright E2E tests
/.github            CI, issue/PR templates, Dependabot config
```

## Working with Claude Code

The repo has a [`CLAUDE.md`](./CLAUDE.md) at the root that defines
conventions. Open Claude Code in this directory and it will read it
automatically.

Workflow skills installed:

- `/whereami` — project status dashboard
- `/create-issue` — investigate, then file a properly-labeled issue
- `/create-roadmap <feature idea>` — break a feature into tracked issues
- `/implement-phase <issue#>` — TDD-driven implementation of an issue
- `/pr-cycle` — open PR, review, fix, merge, clean up

See [`notes/research/`](./notes/research/) for the foundation research
(audience, feature gaps, label taxonomy, audit) that shaped the roadmap.

## Deploy

1. Push to GitHub (already wired).
2. Import the repo into Vercel.
3. Set the env vars from `.env.local` in Vercel project settings.
4. In Supabase **Authentication → URL Configuration**, add the Vercel
   preview/production URL to the allowed redirect URLs.

## License

Private / not yet licensed.
