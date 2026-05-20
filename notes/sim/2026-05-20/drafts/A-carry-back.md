# Carry-back drafts (Agent A)

> Drafts produced by the M4 sim carry-back agent on 2026-05-20. The lead executes
> all `gh issue create / comment / edit` calls after review. Nothing here has
> been posted.

---

## New issue: chore(m4): carry-back migration — bundle 9 schema/RLS deltas

- **Title:** `chore(m4): carry-back migration — bundle 9 schema/RLS deltas`
- **Labels:** `area:trips`, `area:invites`, `area:itinerary`, `security`, `type:chore`
- **Milestone:** `M4 — Trip is shippable`
- **Body:**

```markdown
Foundation PR for the M4 hardening wave. Bundles nine schema/RLS deltas
that share one theme — M4 carry-back hardening — into a single migration
file, per `notes/database-workflow.md:75-84` (one migration per logical
change; themed bundles allowed when the changes share a theme).

Source: `notes/sim/2026-05-20/findings.md`. Sim ran the M4 future-state
guide against three personas + a technical critic; six ship-blockers
surfaced, four of them schema/RLS. Bundling avoids five separate
migration files for changes that are all "the M3 close-out left this
half-built."

## Deltas (in order)

### 1. `itinerary_item_member_flags` — owner-self-read SELECT policy (NEW)

The chip-picker ship-blocker (`findings.md` §6 ship-blocker #1). Today
the only SELECT policy is `"item flags: organizers read"`
(`supabase/migrations/20260520052357_m3_itinerary_announcements.sql:502-512`).
A member SELECT of their own row returns zero, which means the #165
chip picker UI shows blank state after the user navigates away and
returns. On their second pick, the partial-unique `(item_id,
trip_member_id, flag)` constraint
(`20260520052357_m3_itinerary_announcements.sql:212`) collides — server
action either errors or silently no-ops. Three-persona convergence in
the sim (org O5, edge E1, critic pre-load).

Additive SELECT policy:

```sql
create policy "item flags: owner reads own"
  on public.itinerary_item_member_flags
  for select
  to authenticated
  using (
    trip_member_id in (
      select id from public.trip_members
      where user_id = auth.uid()
    )
  );
```

Stacks alongside the existing organizer-read policy; no policy drop
needed.

### 2. `invites.idempotency_key` column + partial unique (closes #158)

Column doesn't exist today
(`supabase/migrations/0001_init.sql:90-99`). The per-table idempotency
ADR (`notes/decisions.md`, organizer-acting bucket
`(trip_id, idempotency_key)`) was missed when `invites` shipped in M2.
Drunk-double-tap on "Mint a link" is the literal stated threat model
(`decisions.md:163`).

```sql
alter table public.invites
  add column idempotency_key uuid;

create unique index invites_idempotency
  on public.invites (trip_id, idempotency_key)
  where idempotency_key is not null;
```

Partial unique so legacy rows without keys are unaffected, consistent
with every other idempotency index in the project.

### 3. `invites.token` SELECT RLS — tighten to organizer-only (closes #155)

Today
`supabase/migrations/0001_init.sql:191-194` reads
`for select using (public.is_trip_member(trip_id))`. M3 shipped a
page-level `is_trip_organizer` gate at
`app/(authed)/trips/[tripId]/invites/page.tsx` as the load-bearing
guard; tightening the DB policy makes it belt-and-suspenders.

Safe because both `accept_invite` and `invite_preview` are SECURITY
DEFINER (RLS-bypass) per `decisions.md:94-98` — no app code path
relies on a regular-member SELECT.

```sql
drop policy "members can see invites for their trips" on public.invites;

create policy "organizers can see invites for their trips"
  on public.invites
  for select
  to authenticated
  using (public.is_trip_organizer(trip_id));
```

### 4. `invites.expires_at` — column-scoped UPDATE policy for organizers (closes #154)

Today `invites` has SELECT / INSERT / DELETE only — no UPDATE policy
(`0001_init.sql:191-204`). M3 shipped a no-op-revoke detector in
`lib/db/invites.ts` as a band-aid. Pick: column-scoped UPDATE policy,
NOT SECURITY DEFINER RPC. Rationale: SECURITY DEFINER is the right
tool when RLS *can't* express the constraint (`accept_invite` needs an
atomic row-lock + decrement + insert); revoke is just an UPDATE the
organizer is allowed to do — RLS can say that directly. Less surface,
easier audit, no new RPC function to maintain.

```sql
create policy "organizers can update invites"
  on public.invites
  for update
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));
```

App-layer change (next PR, not this migration): the no-op-revoke
detector in `lib/db/invites.ts` becomes a regression alarm rather than
the load-bearing guard.

### 5. `trips.timezone` column (closes #108)

Today no `trips.timezone` column exists; `decisions.md:52-56` deferred
the choice. The "quickest" path in #108 (UTC mid-day anchor) is
demonstrably wrong the moment `datetime-local` (#167) ships —
anchoring at noon UTC erases real start times that users typed in
local TZ. Pick the right path now while it's still two lines:

```sql
alter table public.trips
  add column timezone text not null default 'America/Los_Angeles';
```

Render-site change (next PR): `date-fns-tz` imports at
`now-next-card.tsx`, the arrivals manifest, and item cards. `date-fns-tz`
is a transitive of the already-installed `date-fns` — no new top-level
dependency.

### 6. `itinerary_items.address_place_id` + `address_provider` (closes #166 schema)

Closes the schema portion of the address-autocomplete feature. Provider
locked to **Google Places** per the sim
(`findings-critic.md` re-audit). Custom address still possible by
typing freeform — if the user dismisses autocomplete,
`address_place_id` stays null and existing Maps-link fallback
behavior is preserved.

```sql
alter table public.itinerary_items
  add column address_place_id text,
  add column address_provider text;  -- 'google' for M4
```

### 7. `travel_legs.airline_iata` + `flight_number` (closes #168 schema)

Closes the schema portion of the airline-picker feature. Existing
`carrier text` column kept for the non-flight cases (train, drive,
other).

```sql
alter table public.travel_legs
  add column airline_iata    char(2),
  add column flight_number   text;
```

### 8. `MINT_INVITE` added to #141 per-scope rate-limit ratchet (10/hour)

`decisions.md:78-82` split `MINT_INVITE` from `ACCEPT_INVITE` in the
M3 close; the per-scope ratchet table in #141 currently omits
`MINT_INVITE`. Default budget (30 req / 60 s) is correct for high-
frequency surfaces (`SET_RSVP`, `CAST_DATE_VOTE`) and over-generous
for org-acting infrequent scopes. Add:

| Scope | Limit | Window |
|---|---|---|
| `MINT_INVITE` | 10 | 1 h |

Mirrors `ACCEPT_INVITE` — both are infrequent invite-flow scopes.

Code surface: `lib/rate-limit/index.ts` `SCOPE_BUDGETS` map per the
#141 sketch.

### 9. `MINT_INVITE` added to #139 fail-closed list

Today the fail-closed list in #139 covers `AUTH_MAGIC_LINK` and
`ACCEPT_INVITE`. `MINT_INVITE` is also an invite-flow abuse vector —
during a shim window with stuck retry loops, an allow-with-warning
posture mints unbounded links. Add:

```ts
const FAIL_CLOSED_ON_SHIM: ReadonlySet<RateLimitScope> = new Set([
  RATE_LIMIT_SCOPES.AUTH_MAGIC_LINK,
  RATE_LIMIT_SCOPES.ACCEPT_INVITE,
  RATE_LIMIT_SCOPES.MINT_INVITE,
]);
```

Code surface: `lib/rate-limit/index.ts`.

## References

- Synthesis: `notes/sim/2026-05-20/findings.md`
- Critic detail: `notes/sim/2026-05-20/findings-critic.md` (re-audit
  section, lines 415+, has the technical detail per delta)
- Migration discipline: `notes/database-workflow.md:75-84` (one
  migration per logical change; bundling allowed when changes share a
  theme)
- Idempotency ADR: `notes/database-workflow.md:273-289`
  (organizer-acting bucket = `(trip_id, idempotency_key)`)
- SECURITY DEFINER reasoning for #155: `notes/decisions.md:94-98`
- Closes: #108, #154, #155, #158, #166 (schema portion), #168 (schema
  portion). Partial close on #139 + #141 (this issue lands the
  `MINT_INVITE` additions; ratchet implementation is the rest of #141).

## Sequencing

This migration must land **before** the microcopy PR. The chip-picker
microcopy in the microcopy PR depends on owner-self-read RLS landing
first — without delta #1, the picker can't read back the user's own
selections and the new copy strings render on a broken UI surface.

Order:

1. This migration PR (delta 1–9).
2. Microcopy PR (chip rewrites + composer heading + empty-state keys).
3. Wave PRs (#163 / #164 / #165 / #166 / #167 / #168) consume the
   schema additions.

## Verification

Each delta maps to a test gate:

- [ ] **Delta 1** — RLS unit test: member SELECT against
      `itinerary_item_member_flags` for their own `trip_member_id`
      returns the row; SELECT for another member's row returns zero;
      organizer SELECT returns both.
- [ ] **Delta 2** — `lib/db/invites.ts` integration test:
      `createInviteAction` called twice with the same
      `idempotency_key` against the same trip returns the same row
      (no duplicate).
- [ ] **Delta 3** — RLS unit test: non-organizer member SELECT against
      `invites` for a trip they're a member of returns zero rows;
      organizer SELECT returns rows.
- [ ] **Delta 4** — RLS unit test: organizer UPDATE setting
      `expires_at = now()` succeeds; non-organizer UPDATE returns zero
      affected rows; the existing no-op-revoke detector in
      `lib/db/invites.ts` becomes a regression alarm, not the
      load-bearing guard.
- [ ] **Delta 5** — schema test: `trips.timezone` column present,
      default `'America/Los_Angeles'`, not null.
      Render-site test (next PR) pins cross-browser-TZ stability.
- [ ] **Delta 6** — schema test: `itinerary_items.address_place_id`
      and `address_provider` columns present, nullable. Existing
      itinerary-item RLS unchanged.
- [ ] **Delta 7** — schema test: `travel_legs.airline_iata char(2)`
      and `flight_number text` present, nullable.
- [ ] **Delta 8** — `lib/rate-limit/__tests__/index.test.ts` covers
      `MINT_INVITE` at 10/hour.
- [ ] **Delta 9** — `lib/rate-limit/__tests__/index.test.ts` covers
      `MINT_INVITE` in the shim fail-closed set.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all
      green.
- [ ] `pnpm dlx supabase db reset` applies cleanly locally before PR.
- [ ] `lib/db/types.ts` updated in the same PR (per
      `database-workflow.md:154-171` — hand-rolled types stay in sync).
```

---

## Update: #108
- **Action:** comment
- **Content:**

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this issue is now part of the
M4 carry-back migration bundle (#TBD — to be created). Locked decisions:

- **Pick:** `trips.timezone text not null default 'America/Los_Angeles'`
  + `date-fns-tz` imports at render sites
  (`now-next-card.tsx`, arrivals manifest, item cards). The "right"
  option in this issue, not the "quickest" UTC mid-day anchor.
- **Reasoning:** `datetime-local` (#167) granularity makes the anchor
  approach demonstrably wrong — anchoring at noon UTC erases real
  start times users type in local TZ. The right path is one column +
  one import (`date-fns-tz` is transitive of the already-installed
  `date-fns`, no new top-level dep).
- **Bundle linkage:** schema add lands in the carry-back migration;
  render-site changes land in the next PR after the migration soaks.

Cross-persona signal: organizer #3 + critic pre-load both surfaced
this; the persona walk independently picked the same path before
seeing the critic file.
```

---

## Update: #154
- **Action:** comment
- **Content:**

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this issue is now part of the
M4 carry-back migration bundle (#TBD — to be created). Locked decisions:

- **Pick:** column-scoped UPDATE policy on `invites.expires_at` for
  organizers via `using/with check (public.is_trip_organizer(trip_id))`.
  NOT SECURITY DEFINER RPC.
- **Reasoning:** SECURITY DEFINER is the right tool when RLS can't
  express the constraint — `accept_invite` needs an atomic row-lock +
  `uses_left` decrement + insert in one transaction. Revoke is just an
  UPDATE the organizer is allowed to do. RLS can say that directly:
  less surface, easier audit, no new RPC function to maintain.
- **Bundle linkage:** policy add lands in the carry-back migration;
  the no-op-revoke detector in `lib/db/invites.ts` becomes a regression
  alarm rather than the load-bearing guard.

Cross-persona signal: critic pre-load. Personas didn't surface this
(organizer doesn't think about UPDATE-policy mechanics); the critic
audit caught it.
```

---

## Update: #155
- **Action:** comment
- **Content:**

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this issue is now part of the
M4 carry-back migration bundle (#TBD — to be created). Locked decisions:

- **Pick:** tighten `invites.token` SELECT RLS from `is_trip_member` to
  `is_trip_organizer`. Drop the existing `"members can see invites for
  their trips"` policy; replace with `"organizers can see invites for
  their trips"`.
- **Safe to ship:** both `accept_invite` and `invite_preview` are
  SECURITY DEFINER (RLS-bypass) per `notes/decisions.md:94-98`. No app
  code path depends on a regular-member SELECT of `invites`. The
  page-level `is_trip_organizer` gate at
  `app/(authed)/trips/[tripId]/invites/page.tsx` becomes
  belt-and-suspenders.
- **Bundle linkage:** lands in the carry-back migration alongside the
  UPDATE policy (#154) and idempotency column (#158).

Cross-persona signal: critic pre-load + `notes/decisions.md:94-98`
already flagged this as a known M4 follow-up. The sim verified the
two SECURITY DEFINER readers are RLS-bypass and confirmed the
tightening is safe to land in one shot.
```

---

## Update: #158
- **Action:** comment
- **Content:**

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this issue is now part of the
M4 carry-back migration bundle (#TBD — to be created). Locked decisions:

- **Column doesn't exist today.** Verified against
  `supabase/migrations/0001_init.sql:90-99` — `invites` ships with
  `(token, trip_id, created_by, expires_at, uses_left, created_at)`,
  no `idempotency_key`. The M2 schema missed it.
- **Pick:** schema add per the org-acting per-table bucket:

  ```sql
  alter table public.invites
    add column idempotency_key uuid;

  create unique index invites_idempotency
    on public.invites (trip_id, idempotency_key)
    where idempotency_key is not null;
  ```

  Scope is `(trip_id, idempotency_key)` per the per-table ADR
  (`notes/database-workflow.md:273-289`) — `invites` is org-acting,
  not strictly-user.
- **Bundle linkage:** lands in the carry-back migration alongside the
  SELECT (#155) and UPDATE (#154) policies on the same table. Client
  wire-up of `idempotency_key` to `createInviteAction` is in this
  issue's scope but the next PR after the migration.

Cross-persona signal: critic pre-load. The drunk-double-tap use case
is literally the stated threat model (`decisions.md:163`); the sim
confirmed `invites` is the last org-acting table missing the column.
```

---

## Update: #166
- **Action:** comment
- **Content:**

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this issue is now part of the
M4 carry-back migration bundle (#TBD — to be created). Locked decisions:

- **Provider:** **Google Places**, locked. The three options listed in
  this issue (Google / Mapbox / Apple) were a real choice; the sim
  resolved it. Bach-trip queries land on US bars/restaurants where
  Google's coverage is best.
- **Key visibility:** **server-proxy via new
  `app/api/places/autocomplete/route.ts`.** NOT browser-exposed key —
  even HTTP-referrer restriction is spoofable. New rate-limit scope
  `PLACES_AUTOCOMPLETE` on the proxy.
- **Schema cols:** `address_place_id text, address_provider text` on
  `itinerary_items`. Provider column gives us a clean migration path
  if we ever swap providers; today it's always `'google'` for new
  rows.
- **Bundle linkage:** the two schema columns land in the carry-back
  migration. The proxy route + rate-limit scope + UI surfaces
  (`add-item-form.tsx`, `edit-item-form.tsx`, `maps-link.tsx`) land
  in the feature PR after the migration.
- **Dep flag:** Google Places API is a new external dependency. Per
  `CLAUDE.md` "don't add new deps without flagging," noting it
  explicitly here. Not a new npm package — fetch the autocomplete
  endpoint directly.

Cross-persona signal: organizer #17 + critic pre-load both surfaced
the API-key visibility concern. The proxy route is +1 file and
consistent with how `lib/rate-limit/` already gates server actions.
```

---

## Update: #168
- **Action:** comment
- **Content:**

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this issue is now part of the
M4 carry-back migration bundle (#TBD — to be created). Locked decisions:

- **UI shape:** **type-ahead autocomplete** over `lib/data/airlines.ts`
  constant — NOT a dropdown, NOT a grid. 50 items in a dropdown is
  thumb-hostile on mobile (375px); a grid is unusable. Use the shadcn
  `<Combobox>` primitive over the constant as corpus.
- **Schema cols:** explicit — `airline_iata char(2)` + `flight_number
  text` on `travel_legs`. Existing `carrier text` column kept for the
  non-flight cases (`kind in ('train', 'drive', 'other')`).
- **Mental-model fix:** `kind = 'flight'` is a `travel_leg_kind` enum
  value
  (`supabase/migrations/20260520052357_m3_itinerary_announcements.sql:53`),
  NOT an `itinerary_item_kind` value. The airline picker lives on the
  **travel_legs composer** (owner-write per
  `20260520052357_m3_itinerary_announcements.sql:387-397`), not the
  itinerary composer. Important if any future Claude reads the original
  guide's section 3 #6 framing literally — that framing muddles which
  composer the picker lives on.
- **Bundle linkage:** schema add lands in the carry-back migration; UI
  + render changes (`travel-leg-form.tsx`, `travel-leg-card.tsx`) land
  in the feature PR after the migration.

Cross-persona signal: critic pre-load (airline-picker shape +
schema-confusion correction). Personas didn't pressure-test this
directly.
```

---

## Update: #139
- **Action:** comment
- **Content:**

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this issue is now part of the
M4 carry-back migration bundle (#TBD — to be created). Locked decisions:

- **Add `MINT_INVITE` to the fail-closed-on-shim set.** Today the
  sketch in this issue covers `AUTH_MAGIC_LINK` and `ACCEPT_INVITE`.
  `MINT_INVITE` is also an invite-flow abuse vector and mirrors
  `ACCEPT_INVITE` — without inclusion, a stuck retry loop during a
  shim window mints unbounded links.

  ```ts
  const FAIL_CLOSED_ON_SHIM: ReadonlySet<RateLimitScope> = new Set([
    RATE_LIMIT_SCOPES.AUTH_MAGIC_LINK,
    RATE_LIMIT_SCOPES.ACCEPT_INVITE,
    RATE_LIMIT_SCOPES.MINT_INVITE,
  ]);
  ```

- **Bundle linkage:** code change lands in the carry-back PR
  (`lib/rate-limit/index.ts`); test additions in
  `lib/rate-limit/__tests__/index.test.ts` pin both scopes.
- **Posture unchanged for `SET_RSVP` / `CAST_DATE_VOTE` /
  `CREATE_TRIP`** — those stay allow-with-warning so an env-var
  regression doesn't brick the trip dashboard.

Cross-persona signal: critic pre-load (rate-limit cross-cut). #107
split the scope from `ACCEPT_INVITE`; this update finishes the split
on the fail-closed axis.
```

---

## Update: #141
- **Action:** comment
- **Content:**

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this issue is now part of the
M4 carry-back migration bundle (#TBD — to be created). Locked decisions:

- **Add `MINT_INVITE 10/hour` to the per-scope ratchet table.** Today
  the sketch in this issue omits `MINT_INVITE`. Mirrors
  `ACCEPT_INVITE` — both are infrequent invite-flow scopes; default
  30/60s is over-generous for org-acting buckets.

  Updated `SCOPE_BUDGETS` entry:

  ```ts
  [RATE_LIMIT_SCOPES.MINT_INVITE]: { limit: 10, window: "1 h" },
  ```

- **Persona-suggested 20/hour rejected in favor of 10/hour** per the
  critic re-audit — more defensible for a posture-ratchet milestone.
- **Bundle linkage:** the `MINT_INVITE` line lands in the carry-back
  PR (`lib/rate-limit/index.ts` `SCOPE_BUDGETS`); the rest of #141
  (ratchet for the other scopes) is the remainder of this issue's
  scope.

Cross-persona signal: organizer #10 + critic pre-load. #107 split the
scope in M3; this update finishes the budget-ratchet half.
```
