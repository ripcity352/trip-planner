# Collaboration guide

How two devs working on separate machines, both using Claude Code,
co-develop this project. Decisions behind these choices live in
[`notes/decisions.md`](./decisions.md).

## Access & accounts

Each dev needs:

1. **GitHub repo access** to
   <https://github.com/ripcity352/trip-planner>. The repo is public
   and branch-protected; the owner adds collaborators via
   `gh api -X PUT repos/ripcity352/trip-planner/collaborators/<handle>`
   (or GitHub web UI → Settings → Collaborators). GitHub Pro is **not**
   required for the collaborator — branch protection gates on the
   owner's tier only.
2. **Supabase organization membership** — owner invites collaborator
   from the Supabase dashboard org settings. Free. Gives the
   collaborator access to staging (and later prod) keys via the
   dashboard.
3. **Vercel: owner only.** Vercel Hobby plan limits teams to a single
   member; multi-member teams require Pro ($20/mo) which we don't
   pay for. The collaborator does NOT join the Vercel team; they get
   what they need (env vars from Supabase, preview URLs from GitHub
   PR comments) without it. See "Secrets" below.

Each dev uses their own:
- Claude Code installation (per-machine)
- `~/.claude/` config (not shared)
- Local Supabase stack (per-machine via Docker)
- Local Supabase CLI auth (`pnpm dlx supabase login --token <PAT>` or
  `SUPABASE_ACCESS_TOKEN` env var; each dev generates their own PAT
  at <https://supabase.com/dashboard/account/tokens>)

## Secrets

| Secret | How owner gets it | How collaborator gets it |
|---|---|---|
| Supabase URL + anon + service-role | `pnpm dlx vercel env pull .env.local` | Copy from Supabase dashboard → Settings → API (one-time, then keep in `.env.local`) |
| Future non-Supabase secrets (Resend, Sentry, Stripe…) | `vercel env pull` | Manual share via 1Password shared vault (preferred) or per-secret bootstrap doc |

When keys rotate (e.g., Supabase service-role compromised), the rotator
posts an issue or PR with `security` label so the other dev knows to
re-pull. Owner re-pulls via `vercel env pull`; collaborator re-copies
from Supabase dashboard.

Never share secrets via chat / email / iMessage. Screenshots cache
forever.

## First-time onboarding

Both devs share most of the bootstrap. Step 3 (env vars) differs by role.

```bash
# 1. Clone + install
git clone https://github.com/ripcity352/trip-planner.git
cd trip-planner
pnpm install
pnpm dlx playwright install --with-deps   # for E2E
```

### Step 3 — Get the staging env vars

**Owner path** (sole Vercel team member):

```bash
pnpm dlx vercel login
pnpm dlx vercel link            # select the trip-planner project
pnpm dlx vercel env pull .env.local
```

**Collaborator path** (no Vercel team access; reads from Supabase):

```bash
# Create .env.local by hand from the Supabase dashboard:
# https://supabase.com/dashboard/project/bonvqazcqwkrowtkdmuq/settings/api
#
# .env.local contents:
#   NEXT_PUBLIC_SUPABASE_URL=https://bonvqazcqwkrowtkdmuq.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<copy from dashboard>
#   SUPABASE_SERVICE_ROLE_KEY=<copy from dashboard, click "Reveal">
#   NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Or, with a Supabase PAT in `SUPABASE_ACCESS_TOKEN`, run the curl
recipe in [`notes/database-workflow.md`](./database-workflow.md)
("Re-sync Supabase API keys") writing to `.env.local` instead of
piping to Vercel.

### Step 4 — Start local Supabase + run

```bash
# Start local Supabase (needs Docker Desktop running)
pnpm dlx supabase start
pnpm dlx supabase db reset      # applies all migrations

# Override the Supabase env vars in .env.local with the LOCAL values
# that `supabase start` printed. Keep the staging values around in a
# comment block for quick swap-back. See notes/database-workflow.md.

# Run
pnpm dev
```

Open Claude Code in the repo and it picks up `CLAUDE.md` automatically.

## Day-to-day workflow

```
git pull origin main
git checkout -b feat/<short-name>
# ... work ...
pnpm typecheck && pnpm lint && pnpm test
git push -u origin feat/<short-name>
gh pr create --fill                       # or use /pr-cycle
```

Then:

1. **CI must pass** before merge (typecheck, lint, test, build).
2. **At least one approval** from the other dev — branch protection
   enforces this once both devs have Pro.
3. **Conversations resolved** before merge — if either dev leaves a
   comment, it gets explicitly resolved (not just dismissed).
4. **Squash-and-merge** is the default. Keeps `main` linear.
5. Author deletes the feature branch after merge.

### When to ask for review

| Situation | Action |
|---|---|
| Touches `/lib/db/*`, `/supabase/migrations/`, or RLS | Always request review |
| Edits `CLAUDE.md`, `notes/decisions.md`, `notes/roadmap.md` | Always request review |
| Touches `.github/` (CI, templates, CODEOWNERS) | Always request review |
| Pure UI tweak, no schema/data layer changes | Review still nice, can self-merge after the other dev acks in a comment |
| Hot fix for shipped trip (Goal 6+) | Self-merge OK if explicitly tagged in the PR; tell the other dev in a comment after |

## Merge conflicts in protected files

These three files get the most awkward conflicts:

- `/supabase/migrations/` — timestamps collide if both devs create
  migrations the same day
- `/lib/db/<table>.ts` — both devs touching the same query module
- `/notes/decisions.md` — both adding ADRs at the top

**Resolution policy:**

- **Migrations:** the second-to-merge migration always gets renamed to a
  later timestamp. Don't try to reorder.
- **`/lib/db/`:** resolve manually with a fresh review pass — small file
  conflicts hide subtle logic bugs.
- **`decisions.md`:** both entries land, in order of merge. Cross-link
  if they relate.

## Issue triage

- New issues land via the templates in `.github/ISSUE_TEMPLATE/`. They
  start with `status:needs-plan` for features/research.
- The `/whereami` Claude Code skill surfaces the open issue list and
  what each dev is working on (read from `status:in-progress` label).
- Either dev can claim an issue by assigning themselves and flipping
  the label to `status:ready` or `status:in-progress`.
- If both devs want the same issue, lower-issue-number wins; the other
  picks another.

## Where to chat

- **Async, repo-scoped:** GitHub Discussions (enabled in repo
  settings). Use for "should we?" design questions that don't yet have
  an issue.
- **Per-PR:** review comments. Resolve before merge.
- **Per-issue:** issue comments. Use for scope/spec questions on a
  specific issue.
- **Synchronous:** out of band (text, call, whatever — not enforced
  here).

Avoid duplicating context between channels. If a Discussion turns into
a plan, the next step is an Issue.

## Memory & Claude Code state

Each dev's `~/.claude/projects/<this-project>/memory/` is local and
not shared. That's fine — project-level context that matters lives in:

- `CLAUDE.md` (the project's brain for any new session)
- `/notes/` (decisions, roadmap, research)

If you find yourself relying on a memory the other dev doesn't have,
that's a signal to promote it into `CLAUDE.md` or a `notes/*.md`.

## When this guide is wrong

Update it in a PR. Both devs review (it's in CODEOWNERS).
