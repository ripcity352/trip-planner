# Onboarding — Trip Planner

You've been added as a collaborator to
<https://github.com/ripcity352/trip-planner> and the Supabase
organization. This guide gets your machine set up and you to your
first PR. It's intentionally short — the deep references are
[`CLAUDE.md`](./CLAUDE.md) (architecture, voice, rules) and
[`notes/collaboration.md`](./notes/collaboration.md) (full workflow).

Audience: any co-collaborator who is **not** the repo owner. The owner
has a different env-var path (see `notes/collaboration.md` §Secrets).

## Prerequisites

- macOS, Linux, or WSL2 (commands below assume bash/zsh)
- Node 20+
- [pnpm](https://pnpm.io) — **always** in this repo, never `npm` or `yarn`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (local Supabase needs it)
- [GitHub CLI](https://cli.github.com) (`gh`) — used for PRs and issue triage
- Claude Code installed and authed
- A GitHub SSH key on this machine, **or** a PAT for HTTPS auth

## Step 1 — Clone

```bash
# SSH (recommended once your key is on GitHub):
git clone git@github.com:ripcity352/trip-planner.git

# Or HTTPS:
git clone https://github.com/ripcity352/trip-planner.git

cd trip-planner
```

If you prefer a different local path, that's fine — none of the tooling
assumes a specific directory name.

## Step 2 — Install

```bash
pnpm install
pnpm dlx playwright install --with-deps   # one-time, for E2E
```

If `pnpm` isn't found: `corepack enable` (ships with Node 20+) or
`npm i -g pnpm`. The repo pins pnpm 11 via `packageManager` in
`package.json`.

## Step 3 — Create `.env.local`

Collaborators are **not** on the Vercel team (Hobby plan caps teams at
1 member). Pull keys directly from the Supabase dashboard instead.

1. Open
   <https://supabase.com/dashboard/project/bonvqazcqwkrowtkdmuq/settings/api>
2. Create `.env.local` at the repo root with:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://bonvqazcqwkrowtkdmuq.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<copy "anon public" key>
   SUPABASE_SERVICE_ROLE_KEY=<click "Reveal", copy "service_role" key>
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

These are **staging** values. In Step 4 you'll override the three
Supabase values with **local** values printed by `supabase start` —
keep the staging block commented out so you can swap back when you
need to hit staging data.

`.env.local` is gitignored. Never commit it; never share these keys
over chat/email/iMessage. If keys rotate, the rotator opens an Issue
labeled `security` so the other dev sees it and re-pulls.

## Step 4 — Start local Supabase

Each dev runs their own local stack via Docker.

```bash
# One-time per machine: auth the Supabase CLI.
# Get a PAT at https://supabase.com/dashboard/account/tokens
pnpm dlx supabase login --token <YOUR_PAT>

# Start the stack (first run pulls images, ~2 min):
pnpm dlx supabase start

# Apply all migrations to your local DB:
pnpm dlx supabase db reset
```

`supabase start` prints local URL, anon key, and service-role key.
**Override the three Supabase values in `.env.local`** with these
local values for day-to-day work.

Deeper local/staging/prod context:
[`notes/database-workflow.md`](./notes/database-workflow.md).

## Step 5 — Run the app

```bash
pnpm dev
```

Open <http://localhost:3000>. Login is via magic link — locally the
email lands in Inbucket at <http://127.0.0.1:54324>, not your real
inbox.

## Step 6 — Verify the toolchain

Before your first PR, confirm everything passes on an unmodified
`main`:

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # vitest run
pnpm build       # next build (slower; run for non-trivial changes)
```

If any fail on a clean checkout, fix your environment before starting
feature work — don't paper over it.

## Step 7 — Claude Code setup

This repo treats Claude Code as a first-class development tool.

- **`CLAUDE.md` is auto-loaded** when you open Claude Code in this
  directory. Don't paste it; don't reference it manually.
- **Each dev's `~/.claude/` is per-machine.** Project-level context
  that matters lives in `CLAUDE.md` and `/notes/`. If you find
  yourself relying on a memory the other dev doesn't have, promote it
  into one of those files via PR.
- **Authenticate the MCP servers once per machine** — highest-ROI
  tooling for this stack:
  - `supabase` — schema, RLS, migration help
  - `vercel` — deployments, env, project status
  - Both prompt OAuth on first use; one-time per session.
- **Skills worth knowing** (invoked via the `Skill` tool):
  - `supabase:supabase` — call before any Supabase-touching task
  - `vercel:nextjs` — App Router patterns
  - `security-review` — pair with every server action
  - Full guide: [`notes/research/tooling-and-skills.md`](./notes/research/tooling-and-skills.md)
- **Agents worth knowing** (invoked via the `Agent` tool):
  - `security-reviewer` + `code-reviewer` before any commit touching
    `/lib/db/`, `/supabase/migrations/`, or server actions
  - `planner` for any new feature
  - `tdd-guide` for new code with data-layer impact

## Step 8 — Workflow at a glance

```bash
git pull origin main
git checkout -b feat/<short-name>      # or fix/, chore/
# ... work ...
pnpm typecheck && pnpm lint && pnpm test
git push -u origin feat/<short-name>
gh pr create --fill
```

Then: CI passes → other dev reviews → squash-merge → delete branch.
Never push directly to `main` — branch protection enforces it, but
the rule predates the protection.

Full workflow (review expectations, when to request review, merge
conflict policy for protected files): [`notes/collaboration.md`](./notes/collaboration.md) §Day-to-day workflow.

## Step 9 — Picking work

```bash
gh issue list --state open --json number,title,milestone,labels
```

- [`notes/roadmap.md`](./notes/roadmap.md) — milestone plan (M1–M5)
- Issues labeled `status:ready` are unblocked
- Assign yourself to claim
- If the other dev is mid-milestone-closeout (check open PRs), coordinate
  before picking issues that are part of that closeout

## Required reading before your first PR

In order of priority:

1. [`CLAUDE.md`](./CLAUDE.md) — architecture rules, voice/microcopy
   guide, the **hard-banned UI patterns** list. Non-negotiable.
2. [`notes/decisions.md`](./notes/decisions.md) — the *why* behind
   every rule in `CLAUDE.md`. Skim the top entries.
3. [`notes/research/INDEX.md`](./notes/research/INDEX.md) — one-line
   summary of every research artifact. The personas (`persona-groom`,
   `persona-best-man`, `persona-edge-attendees`) are load-bearing.
4. [`notes/roadmap.md`](./notes/roadmap.md) — milestone plan and what
   got cut.
5. [`notes/collaboration.md`](./notes/collaboration.md) — full
   collaboration workflow.

## When this guide is wrong

Update it via PR. It lives in the repo and the other dev reviews.
