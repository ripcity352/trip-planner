# Database workflow

How we manage Supabase across local dev and the one shared project with
two developers. Original decision context in
[`notes/decisions.md`](./decisions.md) — "local Supabase per dev + shared
staging"; deployment reality re-recorded in the "CARRY — milestone
closed" ADR (2026-06-10) and issue #312.

## Two environments

| Env | Where it lives | Used for | Who can apply migrations |
|---|---|---|---|
| **Local** | `pnpm dlx supabase start` on your laptop, Postgres on `localhost:54322` | day-to-day dev, fast iteration, free resets | you (only affects you) |
| **Prod** | The lone shared Supabase project (free tier), ref `bonvqazcqwkrowtkdmuq` | `travelston.com`, the `main`-branch Vercel deploy, AND all PR preview URLs | merging a PR to `main` (CI pushes immediately) |

There is no staging project and no separate prod project. The shared
project is confusingly still **named** `trip-planner-staging` — a relic
of the original plan to split staging/prod at Goal 6, which never
happened — but it IS production: travelston.com reads and writes it.
**A merged migration is live in prod the moment main's CI job runs.**
There is no soak step and no manual prod push. Treat every migration PR
accordingly.

**Free-tier auto-pause is a PROD risk.** The project pauses after ~1
week of inactivity; symptom is main's migration CI job failing with
`project is paused` while code jobs stay green — and the live site going
down with it. The Supabase CLI has no restore command; restore via the
Management API (run by a human — needs a prior `pnpm dlx supabase login`
so the token is in the macOS keychain):

```bash
curl -s -X POST \
  -H "Authorization: Bearer $(security find-generic-password -s 'Supabase CLI' -w)" \
  https://api.supabase.com/v1/projects/bonvqazcqwkrowtkdmuq/restore
```

Then wait ~4 min for `ACTIVE_HEALTHY` and re-run the failed CI job
(`gh run rerun <run-id> --failed`).

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

### Base table grants after `db reset` (#361 — now durable)

The pinned local Postgres image ships a competing postgres-owned
`pg_default_acl` row for `public` tables that grants only
TRUNCATE/REFERENCES/TRIGGER — so a clean `db reset` used to leave
`anon`/`authenticated`/`service_role` with **no DML on any table**, and
every local run needed a manual `grant` repair before the app or e2e could
touch the DB. That repair is now a migration
(`20260711180000_restore_base_table_grants.sql`) — a fresh `db reset` comes
up working, no manual step. It's a no-op on prod (hosted Supabase already
provisions these grants).

**Do not re-introduce the old blanket `grant ... on all functions to anon`
repair.** The migration grants **tables + sequences only** and deliberately
leaves functions alone: SECURITY DEFINER functions that must not be
anon-callable REVOKE anon in their own migration, and a blanket function
grant silently re-opens every one of those revokes. If a future change
needs anon to call a specific new function, grant that one function
explicitly in its own migration — never all of them.

## Prod linkage (one-time, per dev machine)

```bash
pnpm dlx supabase login                          # browser auth
pnpm dlx supabase link --project-ref bonvqazcqwkrowtkdmuq
```

Both devs link to the same ref. Once linked, you can run
`supabase db push` to apply migrations — but **don't**: that's CI's job
(see "Applying migrations" below), and a manual push goes straight to
the production database.

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
| Prod | PR merged to `main` | CI workflow runs `supabase db push` — **live immediately** |

**Why CI does the push, not us locally:**
- One actor applies migrations to prod → no race condition between
  the two devs running `db push` at the same time.
- The audit trail is the merge commit on `main`.
- The migration history table on prod stays consistent with `main`.

The CI step is the `migrate-staging` job in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — the name
says "staging" for historical reasons; the target is the prod DB. It
runs only on push to `main` (not on PRs), gates on the existing
`verify` job so a broken main never pushes migrations, and no-ops when
the `SUPABASE_ACCESS_TOKEN` repo secret is absent. Wired up in #16.

Because merge = live, the local `pnpm dlx supabase db reset` proof
before opening the PR is the *only* rehearsal a migration gets. Don't
skip it, and be extra careful with anything destructive (see the rules
above).

Required repo secrets (provisioned once by `ripcity352`):
- `SUPABASE_ACCESS_TOKEN` — PAT scoped to the project, from
  <https://supabase.com/dashboard/account/tokens>
- `SUPABASE_PROJECT_REF` — `bonvqazcqwkrowtkdmuq`

If a migration fails after merge, main is ahead of prod — write a
hotfix migration that resolves the divergence and merge it; the next
push to main re-runs the job. (The job also fails when the project has
auto-paused — see "Two environments" above for the restore curl.)

## What goes in `.env.local`

Two contexts, two blocks (or two files — pick your style):

- **Local Supabase** — values from `pnpm dlx supabase start` output
- **Prod** — values from `pnpm dlx vercel env pull`. Vercel's "preview"
  and "production" environments point at the same Supabase project, so
  there's only one set of remote values.

Default to local. Keep prod values around for the rare day you need to
repro a "works locally, fails deployed" bug — and remember that with
those values loaded, your local app is reading/writing the live DB.

## Common operations

| Need | Command |
|---|---|
| Reset local DB to clean state | `pnpm dlx supabase db reset` |
| Regenerate TS types from prod | `pnpm types:gen` (writes `lib/db/database.types.ts`; needs `SUPABASE_ACCESS_TOKEN`) |
| Regenerate TS types from local Supabase | `pnpm dlx supabase gen types typescript --local > lib/db/database.types.ts` |
| See what migrations have been applied where | `pnpm dlx supabase migration list` (per-env) |
| Inspect local data | <http://127.0.0.1:54323> (Studio) |
| Pull a snapshot of prod data to local | `pnpm dlx supabase db dump --data-only --linked` then restore |

## When local diverges from prod

If your local schema has uncommitted changes and prod moves ahead
(another dev's PR merged), do:

```bash
git pull origin main
pnpm dlx supabase db reset    # re-applies all migrations in order
```

This is safe because local data is throwaway. If you have local data
you care about (rare), `pg_dump` it first.

## Types policy

The data layer in `lib/db/` uses hand-rolled types in
[`lib/db/types.ts`](../lib/db/types.ts) as the source of truth for app
code. They were written from `supabase/migrations/0001_init.sql` and
are kept in sync by convention: anyone adding a migration also updates
`lib/db/types.ts` in the same PR.

To verify the hand-rolled types against the live schema, run
`pnpm types:gen` (requires `SUPABASE_ACCESS_TOKEN` in env). That writes
the full Supabase-generated `Database` type to `lib/db/database.types.ts`,
which is **not imported by app code** — it's a verification reference. If
the two diverge, the migration changed and `types.ts` needs an update.

We may switch to generated types as the primary source later (when
schema churn slows or the diff between hand-rolled vs generated proves
costly). For now hand-rolled wins on readability + zero-dependency
build.

## REST API recipes (for automation that hits CLI limits)

Some operations are awkward via the official CLIs when run from
non-TTY environments (CI jobs, agents, scripts). For those, the REST
APIs are more reliable. Both Supabase and Vercel APIs need a personal
access token in `Authorization: Bearer ...`.

### Re-sync Supabase API keys into Vercel env vars

The Supabase CLI's `projects api-keys` writes to stdout (visible in
logs); the Vercel CLI's `env add` is interactive in non-TTY contexts.
The REST-to-REST pipe avoids both problems:

```bash
SB_REF=bonvqazcqwkrowtkdmuq
VC_PROJECT_ID=$(jq -r .projectId .vercel/project.json)

# Pull keys (note: User-Agent is REQUIRED — Cloudflare blocks bare
# requests with a 403 / error 1010)
KEYS=$(curl -s \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "User-Agent: trip-planner-script/1.0" \
  "https://api.supabase.com/v1/projects/$SB_REF/api-keys?reveal=true")

ANON=$(echo "$KEYS" | jq -r '.[] | select(.name=="anon") | .api_key')
SRK=$(echo "$KEYS" | jq -r '.[] | select(.name=="service_role") | .api_key')

# Push to Vercel via REST (upsert handles already-exists)
push_env() {
  local name=$1 value=$2 target=$3 type=${4:-encrypted}
  curl -s -X POST \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.vercel.com/v10/projects/$VC_PROJECT_ID/env?upsert=true" \
    -d "{\"key\":\"$name\",\"value\":\"$value\",\"type\":\"$type\",\"target\":[\"$target\"]}"
}

for env in production preview development; do
  push_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$ANON" "$env" encrypted
  push_env SUPABASE_SERVICE_ROLE_KEY     "$SRK"  "$env" sensitive
done
```

Get `VERCEL_TOKEN` from <https://vercel.com/account/tokens>. Get
`SUPABASE_ACCESS_TOKEN` from
<https://supabase.com/dashboard/account/tokens>.

### Update Supabase auth redirect allowlist

When a new Vercel domain is added (custom domain, new preview pattern):

```bash
SB_REF=bonvqazcqwkrowtkdmuq
SITE_URL="https://your-domain.example"
ALLOW="https://your-domain.example/auth/callback,https://*.vercel.app/auth/callback,http://localhost:3000/auth/callback"

curl -s -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: trip-planner-script/1.0" \
  "https://api.supabase.com/v1/projects/$SB_REF/config/auth" \
  -d "{\"site_url\":\"$SITE_URL\",\"uri_allow_list\":\"$ALLOW\"}"
```

### Gotchas to remember

- **Supabase API requires `User-Agent`** — Cloudflare WAF blocks bare
  curl requests with `error code 1010` / HTTP 403. Always set a UA
  string.
- **Vercel CLI `env add` is non-TTY-broken** as of late 2025 — falls
  back to printing a `{"next":[...]}` hint instead of completing.
  Use the REST API for any scripted use.
- **`?reveal=true` is required** on Supabase's `api-keys` GET to get
  the actual key values; without it the response masks them.
- **`upsert=true`** on Vercel's env POST avoids "already exists"
  errors when re-running the script.

## M1 foundation conventions

Codified in `supabase/migrations/20260519123255_m1_foundation.sql`. Every
new table/migration that lands after M1 must respect these or update the
section to record the deliberate exception.

### FK convention — attendee identity goes through `trip_member_id`

Any feature table that references *an attendee of the trip* uses
`trip_member_id uuid references trip_members(id) on delete cascade`,
**never** `user_id uuid references auth.users(id)`. The exception is
**author** columns (`announcements.author_id`, `expenses.payer_id`,
`itinerary_items.created_by`) — those record who *acted* and continue to
reference `auth.users(id)`.

Rationale: accountless attendees (invited by email/phone before they
sign in) have no `auth.users` row. A `trip_member_id` FK keeps the
relationship intact through the claim-the-seat flow.

RLS for retargeted tables uses `is_trip_member_by_member_id(p_member_id)`
instead of `is_trip_member(trip_id)` since the table no longer carries
`trip_id` directly.

### Idempotency-key scope

Every mutation server action accepts a client-generated
`idempotency_key`. The scope of the partial unique index follows who can
act:

- **Organizer-acting-on-behalf tables** — scope `(trip_id, idempotency_key)`.
  Applies to `announcements`, `expenses`. An organizer might post the
  same announcement on behalf of someone else; the (trip, key) tuple
  guarantees they don't double-post even if their client retries.
- **Strictly user-scoped tables** — scope
  `(trip_member_id, idempotency_key)` (or table-equivalent). Applies to
  `availability`, `trip_member_days`. Only the member writes their own
  row, so the key scope mirrors that.

All idempotency indexes are *partial* (`where idempotency_key is not
null`) so legacy rows without keys are unaffected.

### Currency convention

Every money column ships with a sibling
`currency char(3) not null default 'USD'`. Applied to
`expenses.amount_cents`, `expense_splits.amount_cents`,
`itinerary_items.cost_cents`. Cheap now, no migration pain at the first
international trip.

### Declining-RSVP visibility

Never expose `rsvp_status='declined'` per-row to non-organizers; non-
declined statuses (`pending`, `going`, `maybe`) flow through unchanged.
App code reads RSVP from the `trip_members_visible_rsvp` view, which
returns `null` for the declined-status field when the viewer is not an
organizer and not the row's own user. The view is declared
`security_invoker = true` so RLS on the underlying table runs against
the caller's identity.

### Visibility column convention

Every new user-content table ships with
`visibility trip_visibility not null default 'everyone'`. The enum is
`everyone | organizers_only | hide_from_celebrant | custom`. RLS SELECT
policies on those tables call `can_see_content(trip_id, visibility)`.

The `content_visibility_grants` join table for `custom` audiences is
deferred — for M1 `custom` falls back to membership (same as
`everyone`).

## Future: Supabase branch DBs

Supabase has a "branch database" feature where each PR gets an
ephemeral DB. As of writing this is gated/paid; revisit if it becomes
free or cheap. Would replace the "all previews share the prod project"
model — which is the strongest argument for it, given that model is
what we're actually running today.
