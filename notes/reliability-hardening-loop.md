# Reliability-Hardening Loop — execution brief

A self-paced `/loop` brief for a fresh session. Goal: make the app's
correctness **invariants** hold codebase-wide, each locked by a **checker**
so it can never regress. Full-stack reliability (DB → action → error handling
→ UI) is the deep UX win — the app not breaking mid-trip beats the app looking
crisp. This is a **gate-safe polish wave**: no net-new features without
operator sign-off; it does **NOT** lift the M6 gate (like the DS/CARRY waves).

## How this loop is organized (this is the point — read it)

The unit of work is **one invariant, swept whole-repo, locked with a checker** —
NOT a feature, NOT a "journey," NOT a single bug. Journeys are only the
*coverage map* (did we miss an invariant?) and a place to catch novel,
non-class gaps; they are not the iteration unit.

**Checker-first.** Each iteration:
1. Pick the next invariant (backlog below, most-automatable / highest-leverage first).
2. State its precise **tell** (the mechanical signature of a violation).
3. Build the **checker** that *enumerates every violation* — prefer an ESLint
   rule (`eslint.config.mjs` / the custom-rule dir) or a Vitest **meta-test**
   that reads source / AST / schema and asserts. The checker is the deliverable.
4. Run it → get the violation list.
5. Fix each violation with the smallest change that satisfies the invariant.
   If the invariant reveals a *missing contract*, name the gap in the right
   notes file first (CLAUDE.md rule #2) before patching.
6. Verify: `typecheck · lint · test · build`. If schema/RLS touched: RLS psql
   harness + a `supabase_rest` embed curl. Local e2e (prod build + local-supabase
   env — **never `.env.local`, it points at PROD**) only where a fix changes a
   rendered flow.
7. **One focused PR** = the checker + all its fixes together. Self-merge on
   green CI (squash, delete branch; gate = `verify` + `playwright pixel-diff`;
   ignore the RED "push migrations → staging" infra job). Pair
   `security-reviewer` + `code-reviewer` on ANY change touching RLS or a server
   action.

Done-condition per iteration is **binary**: the checker returns clean and stays
in CI as a permanent regression gate. That is why this is more cohesive,
precise, and efficient than a journey walk — one mental model applied
everywhere, a testable done-state, and a guardrail left behind instead of a
stale audit.

**Cadence:** self-paced, one invariant per iteration. Proceed autonomously
through green PRs. Surface only: (a) the Journey-0 design, (b) any design/ADR
fork, (c) a one-line summary per merged PR.

---

## Opener — do this FIRST, before the invariant loop (design sign-off required)

**Journey 0 — cold self-serve: "land on travelston.com → sign up → create a
trip."** Operator's explicit goal: *a stranger can self-serve an account + a
trip from the front page.* This is a feature/design gap, not an invariant, so
it's a one-off opener — and because it's front-door design, **propose the
change and get operator sign-off BEFORE implementing.**

Current state (already traced — verify vs HEAD): the machinery exists
(`signUpAction` in `app/login/actions.ts`; `/trips/new` is reachable by any
authed user; `app/(authed)/trips/page.tsx` already has a "Start a trip" CTA),
but the front door is **invite-only-framed**:
- `app/page.tsx` (landing) — single CTA "Sign in to your trip" → `/login`; no
  signup, no create-trip, copy presumes you already have a trip.
- `app/login/_form.tsx` — defaults to **sign-in** intent; **"Create account
  instead" only surfaces after a wrong-password error** unless it's the invite
  surface (`inviteSurface`/#395). A cold visitor is never told they can sign up.

Files: `app/page.tsx`, `app/login/_form.tsx` + `_form-state.ts`,
`app/login/actions.ts::signUpAction`, `app/(authed)/trips/new/`,
`app/(authed)/trips/page.tsx`.

---

## Invariant backlog

Each entry: **INVARIANT** → *tell* → **checker** → prior incident. Ordered
**most-automatable-first** (fast, durable wins) — do I1, I4/#572, I5, I9, I10,
I11 early. Invariants that can't be fully static-checked (I3, I7, I12) start as
a **listing meta-test** that records current violations as a baseline, then
tighten as they're driven to zero.

**I1 — Read/write column completeness (data-loss; the single most-repeated defect).**
For every table, the `*_COLUMNS` select-list in `lib/db/<t>.ts` ⊇ the column
set its `lib/actions/<t>.ts` writes via `.insert(`/`.update(`. A column written
but not selected → `undefined` on read → blank form prefill → next edit writes
`null`. *Tell:* diff each `_COLUMNS` const against the action's write-key sets.
*Checker:* a Vitest meta-test that extracts both sets and asserts containment.
*Prior:* audit-report P0#1 (`TRAVEL_LEG_COLUMNS` omitted `airline_iata`,
`flight_number`); `trips.timezone` missing from `TRIP_COLUMNS` (#200).

**I2 — Idempotency on every mutation.** Every exported server action that
INSERTs accepts a client `idempotency_key` AND its table has `idempotency_key
uuid` + a partial unique index; replays self-heal (23505 → re-select, and
re-run fan-out for multi-row inserts). *Tell:* action insert with no key param;
missing index in migrations. *Checker:* meta-test enumerating mutation exports
vs an allowlist + a migration scan. *Prior:* rule #9; #158 invite key;
expense-split replay.

**I3 — Deterministic-vs-transient error split (#474).** Every mutation action
maps a *coded* PG/PostgREST error to a `*_rejected` (non-retry copy) key and
only *codeless* failures to `*_failed` (retry copy). *Tell:* actions collapsing
all coded errors into one retry key — `lib/actions/itinerary-rsvp.ts`,
`announcement-reactions.ts`, `rsvp.ts`; `date-poll.ts`/`polls.ts` use a
code-prefix taxonomy; `expenses.ts` uses `ExpenseDbError`. The #474 split is
implemented in only 4 of ~19 action files. *Checker:* start as a listing
meta-test naming actions without the `error.code ?` split; confirm per-feature
whether that's intentional, then fix drift. *Prior:* #474; audit P1#9.

**I4 — No 2nd-FK PostgREST embed (HTTP-300 trap).** No `lib/db` read embeds
`trip_members`/`profiles` from a table with ≥2 FKs to it; such reads go through
a `security_invoker` view exposing plain scalar ids, resolved app-side. *Tell:*
`.select(` with `trip_members(`/`profiles(` on a dual-FK table. *Checker:*
**this is issue #572** — build the embed-resolution smoke test (curl every
embed against local `supabase_rest`, assert ≠ 300). The durable form of the
manual check the ride-groups work did by hand. *Prior:* #550 crew-page outage;
`feedback_postgrest_embed_second_fk`.

**I5 — SECURITY DEFINER anon-revoke.** Every `SECURITY DEFINER` function in
`public` ships a paired `revoke execute … from public, anon` in the same
migration; `get_advisors` shows it only in the `authenticated` list, never
`anon`. *Tell:* `security definer` in a migration with no nearby revoke.
*Checker:* migration-scan meta-test + a periodic `get_advisors` assertion.
*Prior:* `project_security_definer_anon_oracle`; #422; #361 grant-repair
re-opens revokes.

**I6 — Names route through the display helpers (no PII leak, correct fallback).**
No JSX renders `.email`, `email.split('@')`, a raw UUID, or an inline
`display_name ??` fallback; all names go through `resolveMemberName` /
`useDisplayName` / `<Identifier>`. Author fallback "Someone" (missing author) ≠
roster "Guest" (not-on-trip) — never swapped. *Tell:* the existing ESLint
anti-tells (#182/#215/#216). *Checker:* verify those rules *fire on a fixture*,
extend coverage to the realtime announcement path (bypasses the post-fetch
author map), and add `truncate min-w-0` where 80-char names break 375px.
*Prior:* #377/#348; roster Guest-wall; W1a fallback split.

**I7 — Confirmed-only / direction / tenancy filters on travel reads.** Every
read feeding a "landed / everyone's in / who's confirmed" glance filters
`written_by_trip_member_id is null` + `direction` + `trip_id`. *Tell:* a new
consumer of `travel_legs`/`ride_group_members` missing a filter (canonical:
`getArrivalTimesByTrip`). Also RSVP counts not joined to `rsvp_status`
(counts declined/pending). *Checker:* listing meta-test over reads of these
tables asserting the filter set (documented exemptions allowed). *Prior:*
audit P1#6 (`getPerDayGoingCounts`); #477 return-flight double-count; #558.

**I8 — Timezone/date correctness.** No `datetime-local` ISO written into a
Postgres `time`/`date` column; date-only fields parsed local, not UTC;
`date-fns` imported only inside `components/ui/datetime/**`. *Tell:* the
existing `date-fns` ESLint anti-tell (#182) + a form-widget-vs-column-type
mismatch. *Checker:* extend ESLint + a schema-vs-form meta-test. *Prior:* audit
P0#2; ADR #382/#351/#396.

**I9 — `localStorage` in `useEffect`, not render (hydration).** No client
component reads `localStorage`/`window` at render scope or in a `useState`
initializer (default on SSR, upgrade in an effect). *Tell:* grep
`localStorage`/`window` at render scope — `travel-leg-form-sheet.tsx:73`
deviates. *Checker:* an ESLint rule (no browser API in render). Canonical:
`arrivals-manifest.tsx`. *Prior:* #254 hydration class;
`feedback_scripted_walk_hydration`.

**I10 — `next=` is GET-navigable.** No `next=` target resolves to a POST-only
route; all pass `lib/auth/safe-next.ts` (blocks `//evil.com`, rewrites the
POST-only `/invite/[token]/accept`). *Tell:* grep `next=` assignments and
`window.location.href`. *Checker:* `safe-next` unit coverage + a grep
meta-test. *Prior:* #316/#317 invite redirect; open-redirect caught W2a; #106.

**I11 — No hard-banned patterns.** No completion-ratio / progress bar /
leaderboard / streak / routine-action badge / passive-aggressive nudge; no
`rounded-full` on buttons. *Tell:* existing ESLint rule (d) for button pills;
grep `completion|progress|leaderboard|streak` on member-status surfaces.
*Checker:* extend ESLint + a meta-test. *Prior:* CLAUDE.md ban list; repeatedly
re-litigated (attendance-shaming, special-case badges).

**I12 — Client mutation: guarded + refreshed.** Every client mutation call site
either uses `callAction` (or resets its pending flag on a transport reject) AND
triggers a refresh — `revalidatePath` in the action OR `router.refresh()` at
the call site. `callAction` must never wrap a `redirect()` action. *Tell:*
`callAction` adoption is partial (~9 components); the no-`revalidatePath`
actions (expenses/invites/item-flags/itinerary/ride-groups/travel-legs/
trip-notes) rely on client refresh — a missing call = stale UI; high-tap
surfaces (`rsvp-toggle`, `day-attendance-chips`, `poll-card`, `item-rsvp-chip`,
arrivals/*) hand-roll try/catch. *Checker:* meta-test cross-referencing each
action (has `revalidatePath`?) with its call sites (has `router.refresh`?) +
a stuck-pending audit. *Prior:* `lib/ui/call-action.ts` contract.

**Also worth an invariant once the above land:** realtime channel staleness
(`pulse-poll.tsx` hand-tuned dep hash — subscribe→background→foreground→rebind);
empty-state CTA coverage (organizer-actionable empties like itinerary/expenses
have no next-action button); `?error=` actually rendered on
`app/invite/[token]/page.tsx`.

---

## Guardrails

- **Self-merge** your own PRs on green CI (squash, delete branch). Gate = the
  `verify` job + pixel-diff; the "push migrations → staging" job is separate
  infra and RED on main — ignore it.
- **One invariant / one PR at a time.** The PR bundles the checker + all its fixes.
- **Defer every design/ADR fork to the operator** — file an issue, don't guess.
  This includes Journey 0's front-door design.
- **Pair `security-reviewer` + `code-reviewer`** on ANY change that touches RLS
  or a server action. Re-run `security-reviewer` on additive RLS.
- **Always re-verify an issue's "current state" against HEAD** before building.
- **Migration prod-apply is operator-gated.** Hand the operator the drift-free
  Management-API curl: pipe the migration file + an explicit
  `insert into supabase_migrations.schema_migrations (version, name)
  values ('<filename-version>', '<name>')` through `jq -Rs '{query:.}'` to
  `POST /v1/projects/{ref}/database/query` (token in keychain `Supabase CLI`,
  ref `bonvqazcqwkrowtkdmuq`). MCP `apply_migration` is classifier-blocked.
- **`.env.local` points at PROD** (`supabase.co`) — never run local e2e/dev
  against it. Use a scratch env with the local keys from `supabase status`, and
  run e2e against a **prod build** (`pnpm build && pnpm start`) to dodge
  turbopack HMR ChunkLoadErrors + the hydration race; wrap toggle-click+assert
  in Playwright `expect(...).toPass()`.
- **Commit before launching any PR-gate workflow** (they diff `main...HEAD`).
- Use the **workflow audit-gate** pattern (`pipeline(implement → adversarial
  audit)` with worktree isolation, high-effort audit) for any non-trivial fix.

## Read first

CLAUDE.md (hard-banned UI list, microcopy voice test, rule #2, the DB-through-
`/lib/db` + Server-Actions + RLS + idempotency + visibility rules); the
`.claire/audit-report-2026-07-20.md` P0/P1 list; `notes/decisions.md` tail;
memory notes `project_581_ride_groups`, `feedback_postgrest_embed_second_fk`,
`feedback_scripted_walk_hydration`, `feedback_workflow_audit_gate`,
`project_local_db_grants_broken`, `project_branch_protection_no_selfmerge`,
`feedback_grant_repair_vs_revokes`.

## What NOT to do

- Don't turn an invariant sweep into a feature build.
- Don't fix one instance and move on — close the **class** (sweep + checker).
- Don't skip the checker because a fix "looks obvious" — the checker is the
  deliverable; it's what stops the regression.
- Don't guess a design fork (Journey 0, new contracts) — file it for the operator.
- Don't leave a partial sweep unlanded across sessions — one invariant, one PR,
  merged, before the next.
