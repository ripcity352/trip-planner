# Database workflow

How we manage Supabase across local dev, staging, and (eventually) prod
with two developers. Decision context in
[`notes/decisions.md`](./decisions.md) — "local Supabase per dev + shared
staging".

## Three environments

| Env | Where it lives | Used for | Who can apply migrations |
|---|---|---|---|
| **Local** | `pnpm dlx supabase start` on your laptop, Postgres on `localhost:54322` | day-to-day dev, fast iteration, free resets | you (only affects you) |
| **Staging** | Shared Supabase project (free tier) | `main`-branch Vercel deploy, all PR preview URLs | merging a PR to `main` |
| **Prod** | Separate Supabase project (free tier → Pro when needed) | the real bachelor party | manual, after staging soaks ≥24h |

Prod doesn't exist yet — it's created when Goal 6 ships. Staging is the
project being created during Goal 1 setup.

## Local Supabase setup (one-time, per dev machine)

Prereqs: Docker Desktop running.

```bash
# Start the local stack (Postgres, GoTrue, Storage, Studio at :54323)
pnpm dlx supabase start

# Apply all migrations (re-runnable, idempotent for first-time use)
pnpm dlx supabase db reset
```

`supabase start` prints local URLs + keys — copy the **anon key** and
**service-role key** into your `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-start-output>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-start-output>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Studio (web UI for the local DB) is at <http://127.0.0.1:54323>.

To stop: `pnpm dlx supabase stop`. State persists between starts via
Docker volumes; `supabase stop --no-backup` wipes the volume.

## Staging linkage (one-time, per dev machine)

```bash
pnpm dlx supabase login                          # browser auth
pnpm dlx supabase link --project-ref <staging-ref>
```

The `<staging-ref>` comes from the staging project URL:
`https://app.supabase.com/project/<ref>`. Both devs link to the same
ref. Once linked, you can run `supabase db push` to apply migrations to
staging — but **don't**, that's CI's job (see "Applying migrations"
below).

## Writing a migration

```bash
# Create a new timestamped file
pnpm dlx supabase migration new <short_description>

# Edit supabase/migrations/<timestamp>_<short_description>.sql

# Apply locally to test
pnpm dlx supabase db reset

# Verify your app still works
pnpm dev
```

Rules (also in `CLAUDE.md`):
- One migration per logical change. Don't batch unrelated schema bumps.
- **RLS policies for new tables go in the SAME migration as the
  `create table`.** A PR that adds a table without RLS is not
  mergeable.
- Never edit a migration that has been applied anywhere (local doesn't
  count — anywhere shared). If you need to fix it, write a new migration
  that undoes-then-redoes.
- Don't write `drop table` / `drop column` / `alter ... rename` on
  shared-data tables without a paired-up review in the PR. Renames are
  invisible to RLS policies and break them silently.

## Applying migrations

| Env | Trigger | Mechanism |
|---|---|---|
| Local | `pnpm dlx supabase db reset` | local CLI re-applies from scratch |
| Staging | PR merged to `main` | CI workflow runs `supabase db push` |
| Prod | Manual, after staging soak | one dev runs `supabase db push --linked` against the prod ref |

**Why CI does staging push, not us locally:**
- One actor applies migrations to staging → no race condition between
  the two devs running `db push` at the same time.
- The audit trail is the merge commit on `main`.
- The migration history table on staging stays consistent with `main`.

(The CI step doesn't exist yet — it lands when staging is provisioned.
Track in an Issue when ready.)

## What goes in `.env.local`

Three contexts, three files (or one file with commented blocks — pick
your style):

- **Local Supabase** — values from `pnpm dlx supabase start` output
- **Staging** — values from `pnpm dlx vercel env pull` (we use staging
  vars as the default "preview" env in Vercel)
- **Prod** — same `vercel env pull` but with `--environment=production`
  — you almost never need this locally; use it only to verify a hotfix
  before it goes out

Default to local. Keep staging values around for the rare day you need
to repro a "works locally, fails on staging" bug.

## Common operations

| Need | Command |
|---|---|
| Reset local DB to clean state | `pnpm dlx supabase db reset` |
| Generate TS types from local schema | `pnpm dlx supabase gen types typescript --local > lib/db/types.ts` |
| See what migrations have been applied where | `pnpm dlx supabase migration list` (per-env) |
| Inspect local data | <http://127.0.0.1:54323> (Studio) |
| Pull a snapshot of staging data to local | `pnpm dlx supabase db dump --data-only --linked` then restore |

## When local diverges from staging

If your local schema has uncommitted changes and staging moves ahead
(another dev's PR merged), do:

```bash
git pull origin main
pnpm dlx supabase db reset    # re-applies all migrations in order
```

This is safe because local data is throwaway. If you have local data
you care about (rare), `pg_dump` it first.

## Future: Supabase branch DBs

Supabase has a "branch database" feature where each PR gets an
ephemeral DB. As of writing this is gated/paid; revisit if it becomes
free or cheap. Would replace the "all previews share staging" model.
