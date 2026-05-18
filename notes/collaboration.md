# Collaboration guide

How two devs working on separate machines, both using Claude Code,
co-develop this project. Decisions behind these choices live in
[`notes/decisions.md`](./decisions.md).

## Access & accounts

Each dev needs:

1. **GitHub Pro account** with access to
   <https://github.com/ripcity352/trip-planner>. Owner adds the
   collaborator via `gh api -X PUT
   repos/ripcity352/trip-planner/collaborators/<handle>` or the
   GitHub web UI (Settings → Collaborators).
2. **Vercel team membership** — owner invites collaborator from
   Vercel team settings. Free tier supports two-person teams.
3. **Supabase organization membership** — owner invites collaborator
   from the Supabase dashboard org settings. The collaborator gets
   access to staging (and later prod) via the same org.

Each dev uses their own:
- Claude Code installation (per-machine)
- `~/.claude/` config (not shared)
- Local Supabase stack (per-machine via Docker)
- Vercel CLI auth (`pnpm dlx vercel login` once)

## First-time onboarding (collaborator side)

```bash
# 1. Clone
git clone https://github.com/ripcity352/trip-planner.git
cd trip-planner

# 2. Install
pnpm install
pnpm dlx playwright install --with-deps   # for E2E

# 3. Link Vercel + pull secrets
pnpm dlx vercel login
pnpm dlx vercel link            # select the trip-planner project
pnpm dlx vercel env pull .env.local

# 4. Start local Supabase (needs Docker Desktop running)
pnpm dlx supabase start
pnpm dlx supabase db reset      # applies all migrations

# 5. Override Supabase env vars in .env.local with the local values
#    that `supabase start` printed (URL, anon key, service-role key).
#    See notes/database-workflow.md.

# 6. Run
pnpm dev
```

That's it. Open Claude Code in the repo and it picks up `CLAUDE.md`
automatically.

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
