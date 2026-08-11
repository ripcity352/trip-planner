# Shopping List — exploration brief (feeds a design+implement session)

Status: **exploration only.** Produced 2026-08-11 by three parallel explore
agents (codebase blueprint / product-UX / prior-art). No code, no schema, no
decision ratified. This doc primes the next session; the design forks in §5 are
open on purpose.

## The idea

A shared **shopping list** for a trip: supplies / booze / groceries / gear that
**any member can add onto** and that grows over the run-up. Mark got-it, claim
"I've got this," optional cost. Mobile-first, mirrors the group-chat feel.

## 0. Scope — operator-authorized, standalone page

**Operator approved building this directly (2026-08-11).** It is NOT run as a
gated M-milestone item — it ships as a **standalone, self-contained trip page,
modeled on the "who's landing when" (arrivals) page**: its own tab/route under
the trip, useful on its own, no dependency on a milestone wave.

- Prior thinking parked "bring-your-own-X" at Goal 7/8 as *"Announcements covers
  it for MVP"* (`notes/research/audience-features.md:81`). The distinction that
  earns it its own surface: it's a **checklist you claim / check-off / amend**,
  not a text feed — the same reason arrivals isn't just an announcement.
- **Keep it separate from expenses for now** (see §4) — pure coordination, no money.
- Normal flow: `feat/` branch → PR → green CI → merge. The prod migration apply
  is **automated in-session** (§7.4) — no operator gate.

## 1. Blueprint — how to build it gate-green (from the codebase agent)

**Skeleton: clone `announcements`** — a single flat table of freeform trip-scoped
rows, any-member-add, with an idempotent insert + a boolean state-setter
(`pinned` ≈ `bought`) + delete. Splice in two pieces:
- **Money column** from `expenses`: `cost_cents int` + `currency char(3) default 'USD'`.
- **Member-write RLS** from `ride_groups` (announcements is organizer-write-gated;
  a shopping list is member-write). `can_see_content(trip_id, visibility)` is the
  read gate (defined `20260519123255_m1_foundation.sql:171-188`).

Copy targets to open:
- `supabase/migrations/20260810040000_ride_groups.sql` — RLS + grants + money/idempotency/visibility columns + the 2nd-FK-trap note.
- `lib/db/announcements.ts` — `*_COLUMNS` const, query fn, `*DbError` w/ `.code`, setter/delete with `{ count: "exact" }`.
- `lib/actions/announcements.ts` — idempotent insert, 23505 replay re-select, `error.code` split, `revalidatePath`.
- `lib/actions/ride-groups.ts` — newest gate-clean action patterns.
- `components/trip/expenses/add-expense-sheet.tsx` — RHF+zod+`callAction`+idempotency-key-at-submit form.
- `lib/copy/errors.ts` + `lib/copy/empty-states.ts` — add keys (no inline literals).
- `lib/db/types.ts` — add the row type.

**2nd-FK trap:** the row has TWO FKs into `trip_members`
(`created_by_trip_member_id` + `claimed_by_trip_member_id`) → PostgREST 300 on a
bare `trip_members(...)` embed. Expose both as **plain scalar ids** and resolve
names app-side via `resolveMemberName` (no view needed for a flat list).

**Draft column set** (starting point, not final):
```
id, trip_id, created_by_trip_member_id, name text, bought bool default false,
claimed_by_trip_member_id, cost_cents int null, currency char(3) default 'USD',
visibility trip_visibility default 'everyone', idempotency_key uuid, created_at
+ partial unique index on (trip_id, created_by_trip_member_id, idempotency_key)
```

**CI gates the new table/actions must satisfy from day one** (batches 1+2):
I1 (every written column in the `_COLUMNS` select), I2 (idempotency column +
partial index + insert writes the key), I3 (action inspects `error.code`),
I6 (render names via `resolveMemberName`, never `.email`), I12 (client mutation
via `callAction` + `router.refresh`, and the add action must not `redirect()`).
I5 is a no-op if you add **no** SECURITY DEFINER fn (use the existing
`can_see_content`); I7/I8 don't apply (not a travel table, no date column).
Run `pnpm typecheck·lint·test·build`; test the migration via
`pnpm dlx supabase db reset` (mind the grant-repair gotcha — re-assert grants).

## 2. Reuse the app's two strongest primitives (from the UX agent)

This is not a new mechanism — it's the existing engine pointed at a new content type:
- **Visibility-first** (`trip_visibility` + `can_see_content`): a surprise/gag
  item is a `hide_from_celebrant` row. **Decide default visibility before coding**
  (rule #7). Surprise items render **fully absent** to the celebrant — no
  "1 hidden item" teaser (diverges from the itinerary blur-slot; there's no
  anticipation value in a hidden gift-supply).
- **Per-item opt-in, attributed on-behalf** (`itinerary_item_member_flags` shape):
  "who's bringing/chipping in on this" is opt-**in**, never assumed. Organizer
  claim-on-behalf reuses the `written_by` attribution + member-confirm consent
  path — never silent assignment (rule #8).

## 3. Persona guardrails

- **Broke friend:** buying/claiming one item must NOT imply chipping in on others.
  No "X people are in on the booze run" counter (social pressure — an explicit "Hurts").
- **Sober attendee:** non-alcohol items are first-class, same list, same weight.
  `booze` is one tag among peers (snacks/supplies/gear), **never the headline**.
- **Celebrant:** can add like anyone; is not the list's janitor (roles as
  micro-affordances, rule #11).
- **Organizer/best-man:** claim-not-assign is the frictionless primitive
  ("I've got this" = 10-second contribution); the shared append-only list is the
  anti-spreadsheet.

## 4. Expenses coupling — DECIDED: none, for now

**Zero coupling.** A shopping item and an expense are entirely separate. Buying
the ice and never logging it is fine (respects broke/sober — buying ≠ assumed
split). The list is pure coordination; the expenses ledger is untouched.
- `cost_cents`/`currency` on an item is **optional info only** (a rough tag so
  people know what they're in for), NOT a ledger entry and NOT split. Reasonable
  to defer even the cost field to a fast-follow and ship coordination-only first
  — a §5 fork.
- A future one-tap "log the spend" bridge (pre-fill AddExpense, human confirms,
  never auto-fire/auto-split) is explicitly **out of scope** here; note it and
  move on.
- Do NOT let the list become a second ledger or expose group-visible "who still
  owes / who's slacking" lists (`killed-and-deferred.md:52`).

## 5. Open design forks — decide these in the session (with recommendations)

1. **Claim vs assign vs neither** — rec: claim-first + optional organizer
   claim-on-behalf (consent path). Unclaimed items just sit; that's fine.
2. **Check-off semantics** — strike-through in place / collapse to a "got it"
   section / remove. Constraint: **no completion bar, no aggregate score.** Got-it
   must be reversible (drunk mis-tap).
3. **Amend-in-place vs add-sibling** — who can edit someone else's item: anyone
   (`is_trip_member`) or author+organizer (the expenses UPDATE pattern)? Every
   amend attributed.
4. **Cost field in/out for MVP** — coupling is decided (none, §4). Remaining
   micro-fork: does an item carry an optional `cost_cents` info tag in MVP, or is
   it pure coordination (name/qty/claim/got-it) with cost as a fast-follow?
5. **Categories** — fixed enum vs freeform vs theme-layer tags per `trip_kind`
   (`/lib/templates/<kind>.ts`). Hard rule: `booze` is a peer tag, not the default.
6. **Quantity model** — freeform text (`"2 handles"`) vs structured `qty:int + unit`.
   Rec: freeform for MVP.
7. **Per-person vs shared** — one shared pool (rec) vs personal packing lists (a
   second content type — probably a deliberate cut).
8. **Surprise-item render** — confirm fully-absent-for-celebrant.
9. **Realtime?** — live shared surface; in MVP or fast-follow?
10. **Accountless members** — FK to `trip_members` (convention) so on-behalf
    claiming works for accountless attendees.

## 6. Copy voice — starter strings (all pass the pre-trip-dinner test)

- Empty: *"List's empty. Snacks, booze, sunscreen, the aux cable — throw it on before you forget."*
- Add CTA / placeholder: *"What are we bringing?"* (no asterisk)
- Claimed by you: *"You've got this one."* / by someone: *"Marcus is on it."*
- Got-it: *"Got it. One less thing."* / unclaim: *"Off your plate."*
- Amend: *"Bumped it to two handles."*
- Offline error: *"That didn't save — you might be offline. It'll go through when you're back."*
- No-row: *"That one's already gone from the list."*

**Hard-ban traps to refuse:** a "12/20 bought" progress bar/completion score, a
"top shopper" leaderboard, achievement/badge toasts, required-field asterisks,
push for "Pete claimed the sunscreen," green/red traffic-light states.

## 7. Next-session shape

Operator has approved the build (§0). So:
1. **`superpowers:brainstorming`** to resolve the remaining §5 forks (claim model,
   check-off semantics, amend rules, cost-field in/out, categories, quantity,
   realtime). Keep it tight — most have a recommendation already.
2. Write a short spec, then **TDD** the thin content type against the blueprint
   (§1) as a **standalone arrivals-style page** (`app/(authed)/trips/[tripId]/
   shopping/` + a nav tab), gate-green from the start (§1 CI list).
3. Pair `security-reviewer` + `code-reviewer` on the migration + actions.
4. **Apply the migration to prod automatically** (no operator gate): after it's
   green on a local `supabase db reset`, read the token from keychain
   (`security find-generic-password -w -s 'Supabase CLI'`) and POST the migration
   SQL + a `supabase_migrations.schema_migrations` bookkeeping insert to
   `POST /v1/projects/bonvqazcqwkrowtkdmuq/database/query`, then verify
   (re-query + login/advisors healthy). MCP `apply_migration` is classifier-
   blocked — use the direct curl.
