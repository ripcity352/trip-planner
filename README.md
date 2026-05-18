# Trip Planner

A web app for planning group trips. MVP: bachelor party. Designed to
generalize to any "friends planning a trip together" use case.

**Stack:** Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui · Supabase · Vercel.
Mobile-first.

## Status

**Goal 1 — Foundation deployed.** See [`notes/roadmap.md`](./notes/roadmap.md).

## Onboarding a new developer

> Adding a second (or third) dev? Read
> [`notes/collaboration.md`](./notes/collaboration.md) first — it covers
> GitHub access, Vercel team, Supabase org, and the day-to-day PR
> workflow. The steps below are the bootstrap on a fresh machine.

### Prereqs

- Node 22+ (pnpm 11 needs `node:sqlite`, added in 22.13) and pnpm 11+
  (`npm install -g pnpm`)
- [Docker Desktop](https://docs.docker.com/desktop/) running (for local Supabase)
- Access to: the GitHub repo, the Vercel team, the Supabase organization
  (owner invites you)

### Bootstrap

```bash
# 1. Clone + install
git clone https://github.com/ripcity352/trip-planner.git
cd trip-planner
pnpm install

# 2. Pull secrets from Vercel (one-time link, then re-pull anytime)
pnpm dlx vercel login
pnpm dlx vercel link            # select the trip-planner project
pnpm dlx vercel env pull .env.local

# 3. Start local Supabase
pnpm dlx supabase start
pnpm dlx supabase db reset      # applies all migrations

# 4. Override the Supabase env vars in .env.local with the LOCAL values
#    printed by `supabase start` (the staging values pulled from Vercel
#    are kept around for repro work). See notes/database-workflow.md.

# 5. Run
pnpm dev
```

Visit <http://localhost:3000>.

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
| `pnpm dlx supabase start` | Spin up local Supabase (needs Docker) |
| `pnpm dlx supabase db reset` | Re-apply all migrations to local DB |
| `pnpm dlx vercel env pull .env.local` | Refresh secrets from Vercel |

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
/supabase/config.toml local Supabase service ports + config
/notes              roadmap, decisions, research, design notes
/tests/unit         Vitest unit tests
/e2e                Playwright E2E tests
/.github            CI, issue/PR templates, CODEOWNERS, Dependabot config
```

## Working with Claude Code

The repo has a [`CLAUDE.md`](./CLAUDE.md) at the root that defines
conventions. Open Claude Code in this directory and it will read it
automatically. Each dev's `.claude/` config is local; project context
lives in `CLAUDE.md` + `/notes/`.

Workflow skills installed:

- `/whereami` — project status dashboard
- `/create-issue` — investigate, then file a properly-labeled issue
- `/create-roadmap <feature idea>` — break a feature into tracked issues
- `/implement-phase <issue#>` — TDD-driven implementation of an issue
- `/pr-cycle` — open PR, review, fix, merge, clean up

Foundation research that shaped the roadmap and infra:

- [`notes/research/`](./notes/research/) — audience, feature gaps, label
  taxonomy, audit
- [`notes/decisions.md`](./notes/decisions.md) — ADRs
- [`notes/collaboration.md`](./notes/collaboration.md) — multi-dev
  workflow
- [`notes/database-workflow.md`](./notes/database-workflow.md) — local /
  staging / prod Supabase split + migration discipline

## Deploy

Pushes to `main` deploy to the staging Vercel project. Prod deploys are
manual until Goal 6.

Per-PR preview URLs are wired automatically by Vercel and use the
staging Supabase project.

## License

Private / not yet licensed.
