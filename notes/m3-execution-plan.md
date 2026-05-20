# M3 Execution Plan — Trip is useful

> Dated 2026-05-20. Structured for a `/goal`-driven, subagent-parallel
> push. Mirrors `m2-execution-plan.md` shape. The goal loop reads this
> file on every turn — keep it terse and verifiable. Update the DoD
> checkboxes as work lands.
>
> Source of scope: `notes/roadmap.md` §M3 + the open issues on the
> `M3 — Trip is useful` milestone (21 at plan time:
> #35, #36, #37, #38, #39, #40, #77, #78, #79, #80, #107, #110, #116,
> #117, #120, #127, #129, #130, #137, #139–#141 — security follow-ups).
> Plus the load-bearing process changes mandated by
> `notes/retros/m2-retro.md` §5 + §6.

## Constraints (re-read every wave)

These extend the M2 constraints. Re-read M2's "Constraints" list — all
still apply unchanged unless overridden here. The OVERRIDES below are
non-negotiable for M3 (retro §5+§6).

### Override A — Real-browser smoke on every wave PR
**CI green ≠ feature works.** Every wave PR runs an MCP-driven Playwright
session against the Vercel preview URL at 375px before merge. Capture a
screenshot of the changed surface; paste into the PR body under
`## Preview smoke (375px)`. Without that section, the PR does not merge
even if CI is green and code-reviewer approved. This is M2-retro L1's
durable fix.

### Override B — Auth fixture (#120) lands FIRST in Wave 0
No wave-1+ authenticated e2e is allowed to be authored without the
storage-state fixture. If a wave-2+ agent says "we'll defer to a
follow-up like M2 did," the wave gate fails — they use the fixture or
write no e2e for that surface.

### Override C — Tests live in `lib/`, `components/`, `tests/unit/` only
`vitest.config.ts` excludes `app/` from the test glob. Tests placed
under `app/**/__tests__/` silently don't run (M2 had specs that were
ghost-passing because of this). Every wave PR's test paths get a
manual `grep -rEn "describe\(|test\(|it\(" app/` check by the wave
agent — non-empty = fail the wave gate.

### Override D — Reviewers dispatch in PARALLEL from PR open
On PR open, dispatch `security-reviewer` + `code-reviewer` in the same
batch (single message, two `Agent` calls). One consolidated fix-up
round; do not stage round-2 reviews. If both pass: merge. If either
finds an issue: fix all in one commit, re-request review of both in
parallel.

### Override E — DoD has a `verified` axis
Each DoD line below has two checkboxes:
- `[d]` *declared*: code shipped, CI green, code-reviewer approved
- `[v]` *verified*: feature exercised in a real browser on the prod
  preview URL (travelston.com) at 375px

Closure wave (Wave 5) ticks `[v]` only after the human/MCP-browser walks
the surface on prod. `[d]` ✓ is allowed mid-milestone; `[v]` ✓ is closure
only.

### Override F — Microcopy: no inline string literals in JSX
M2-retro L8: every UI string sourced from `lib/copy/*` palettes. New
keys added in Wave 0a alongside the plan doc; agents read-only thereafter.
Inline `"Add item"` literals in JSX leaf elements are a review-blocker.

### Override G — `app/page.tsx` ownership rule
Wave 5 closure either (a) updates `app/page.tsx` to reflect M3 reality
or (b) writes a one-line explicit "kept as-is, decision: …" entry in the
closure ADR. Orphaning the landing page through another milestone is
out of bounds.

---

## Schema reality check (state at M3 start)

Already on `main` from M1 + M2 (newest 5 migrations):

```
0001_init.sql
20260519123255_m1_foundation.sql
20260519191412_m2_trip_role_co_organizer.sql
20260519191413_m2_trips_and_invites.sql
20260519202859_m2_rsvp_idempotency_scope.sql
20260519204313_m2_date_poll.sql
```

Tables present and load-bearing for M3:
- `trips` — has `kind`, `vibe_tags`, `starts_at`, `ends_at`, `notes`?
  → CHECK: `notes` does NOT exist yet — Wave 1 adds it (#78)
- `trip_members` — synthetic PK, `is_celebrant`, `rsvp_status`
- `itinerary_items` — exists from M1 with basic shape; M3 extends
- `announcements` — exists from M1 shell; M3 fills it in
- `trip_visibility` enum already present (`everyone | organizers_only |
  hide_from_celebrant | custom`)
- `can_see_content(trip_id, visibility, content_id)` helper already exists

Gaps M3 fills (one migration, Wave 1):

1. `itinerary_item_kind` enum + extensions on `itinerary_items`
   (`activity_tag text[]`, `dress_code text`, `address text`,
   `visibility trip_visibility default 'everyone'`,
   `idempotency_key uuid` + partial unique on
   `(trip_id, idempotency_key)`)
2. `lodging_assignments (item_id, trip_member_id, room_label)`
3. `travel_legs (trip_id, trip_member_id, kind, depart_at, arrive_at,
   carrier, confirmation_code, notes)` — kind enum
   `'flight' | 'train' | 'drive' | 'other'`
4. `itinerary_item_rsvps (item_id, trip_member_id, status,
   idempotency_key)` — silent opt-out per item (#38). `status` enum
   `'going' | 'skipping'`; absence = inherits day-level RSVP
5. `itinerary_item_member_flags (item_id, trip_member_id, flag, note)` —
   generic per-item flag for dietary, sober, late-arrival, etc.
   Organizer-visible only. `flag text` freeform (not enum — encoding a
   default is exactly what we're avoiding per ADR)
6. `trips.notes text` (#78)
7. `announcements` extensions — already has `trip_id`, `body`,
   `created_at`; add `created_by uuid`, `visibility trip_visibility`,
   `idempotency_key uuid` + partial unique on
   `(trip_id, idempotency_key)`. Realtime publication on this table
8. RLS for every new/altered table in the same migration

---

## Wave 0 — Foundation of trust (3 parallel PRs)

The retro §6 mandates that Wave 0 closes three load-bearing process
gaps before any feature work. Three independent PRs; touch no
overlapping files.

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **0a** | `chore/m3-bootstrap` | — | `notes/m3-execution-plan.md` (this file), `notes/deployment-readiness.md` (new), `lib/copy/empty-states.ts` + `lib/copy/errors.ts` (M3 keys append), `lib/rate-limit/__tests__/index.test.ts` (#130 pin), `components/trip/pulse-poll.tsx` (#116 TIMED_OUT + #117 dev-only seam) | `lib/rate-limit/__tests__/index.test.ts`, `components/trip/__tests__/pulse-poll.test.tsx` (edit only) | low |
| **0b** | `feat/m3-auth-fixture` | #120 | `tests/fixtures/auth.ts` (new), `playwright.config.ts` (add `storageState`-emitting project), `e2e/_setup/seed-test-user.ts` (Supabase Admin API call), `e2e/_setup/auth.setup.ts`, `.env.example` (append `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD` if needed) | `tests/fixtures/__tests__/auth.test.ts` (smoke), `e2e/_setup/auth.setup.ts` | medium |
| **0c** | `fix/m3-magic-link-cross-device` | #137 | `app/login/actions.ts` (drop PKCE, use token-hash), `app/auth/callback/route.ts` (handle `token_hash` + `type` query params), `lib/supabase/server.ts` (if `auth.flowType` configurable) | `lib/auth/__tests__/safe-next.test.ts` (edit only — add cross-device case), `app/login/__tests__/login-action.test.ts` | medium |

**Coordination rule:**
- 0a touches `lib/copy/**` (append-only), `notes/**`, infra config — no auth code
- 0b touches `tests/**`, `e2e/_setup/**`, `playwright.config.ts`,
  `.env.example` (append-only)
- 0c touches `app/login/**`, `app/auth/callback/**`, `lib/supabase/**`
- Zero file overlap. 0a's `.env.example` append is at the bottom; if 0b
  also appends, sequential merge handles the conflict trivially

**Gate to Wave 1 (run AFTER all three merge to main):**

1. Local: `pnpm typecheck && pnpm lint && pnpm test && pnpm dlx supabase db reset && pnpm build`
2. Local Playwright dry-run of the auth fixture: `pnpm exec playwright test --project=setup` produces a `storage-state.json` artifact
3. **Production M2 golden-path smoke** (this is the retro §6.1 mandate):
   open https://travelston.com in MCP-driven Playwright at 375x812 →
   click "Send the link" → click magic link in Resend → land on `/trips`
   → create a trip → view dashboard. Screenshot each step into a
   Wave-0-closure comment on PR 0c (the last to merge). Walk validates
   #137 in production.
4. Confirm `notes/deployment-readiness.md` lists every env-var + dashboard
   setting M3 will depend on (no new ones beyond M2's set in Wave 0).

**Out of scope for Wave 0:**
- No schema changes (Wave 1)
- No new pages (Waves 2+)
- No itinerary-content work

**Risk: medium (0b, 0c each).** 0b is fresh infra; auth-fixture
patterns are well-known but Supabase Admin API needs the
`SUPABASE_SERVICE_ROLE_KEY` available to the test runner (CI secret
already exists; verify in `.env.example`). 0c rewrites a working flow —
test against both same-device and cross-device clicks before merge.
`security-reviewer` on 0c specifically reviews: token-hash isn't logged,
the callback doesn't echo `token_hash` to the client, `safeNext()` still
guards the redirect.

---

## Wave 1 — Schema + data layer (one PR, sequential agents)

Runs after all Wave 0 PRs merge. Single branch: `feat/m3-schema-and-data-layer`.
Single PR. Closes none directly — provides the substrate for #35, #36,
#37, #38 (schema), #78, #79 (schema), #80 (schema).

Dispatch order: `architect` (sign off on table shapes + RLS in the
appendix) → `tdd-guide` → `security-reviewer` → `code-reviewer`.
Sequential. Architect's sign-off appended below as Appendix A before
any SQL is written.

**Migration:** `<timestamp>_m3_itinerary_announcements.sql`

Author order inside the SQL (dependency-correct):

1. `create type public.itinerary_item_kind as enum
   ('event','lodging','transport','meal','activity')`
2. `create type public.travel_leg_kind as enum
   ('flight','train','drive','other')`
3. `create type public.itinerary_item_rsvp_status as enum
   ('going','skipping')`
4. `alter table public.itinerary_items`:
   - add `kind itinerary_item_kind not null default 'activity'`
     (data backfill: existing rows = `'activity'`; check existing rows
     count via `pnpm dlx supabase db reset` and re-add seeds if any)
   - add `activity_tag text[] not null default '{}'`
   - add `dress_code text`
   - add `address text`
   - add `visibility trip_visibility not null default 'everyone'`
   - add `idempotency_key uuid`
   - partial unique `(trip_id, idempotency_key) where idempotency_key
     is not null`
5. `alter table public.trips add column notes text`
6. `alter table public.announcements`:
   - add `created_by uuid references auth.users(id)`
   - add `visibility trip_visibility not null default 'everyone'`
   - add `idempotency_key uuid`
   - partial unique `(trip_id, idempotency_key) where idempotency_key
     is not null`
7. `create table public.lodging_assignments (
     id uuid primary key default gen_random_uuid(),
     item_id uuid not null references itinerary_items(id) on delete cascade,
     trip_member_id uuid not null references trip_members(id) on delete cascade,
     room_label text,
     created_at timestamptz not null default now(),
     unique (item_id, trip_member_id)
   )` — only valid when the referenced item has `kind = 'lodging'`
   (enforced via trigger `assert_lodging_item_kind_before_assignment`)
8. `create table public.travel_legs (
     id uuid primary key default gen_random_uuid(),
     trip_id uuid not null references trips(id) on delete cascade,
     trip_member_id uuid not null references trip_members(id) on delete cascade,
     kind travel_leg_kind not null,
     depart_at timestamptz,
     arrive_at timestamptz,
     carrier text,
     confirmation_code text,
     notes text,
     idempotency_key uuid,
     created_at timestamptz not null default now()
   )` + index on `(trip_id, arrive_at)` (arrivals manifest sort) +
   partial unique on `(trip_id, idempotency_key)` where not null
9. `create table public.itinerary_item_rsvps (
     item_id uuid not null references itinerary_items(id) on delete cascade,
     trip_member_id uuid not null references trip_members(id) on delete cascade,
     status itinerary_item_rsvp_status not null,
     idempotency_key uuid,
     updated_at timestamptz not null default now(),
     primary key (item_id, trip_member_id)
   )` + partial unique on `(item_id, trip_member_id, idempotency_key)`
   where not null — strictly user-scoped per `notes/database-workflow.md`
10. `create table public.itinerary_item_member_flags (
     id uuid primary key default gen_random_uuid(),
     item_id uuid not null references itinerary_items(id) on delete cascade,
     trip_member_id uuid not null references trip_members(id) on delete cascade,
     flag text not null,
     note text,
     created_at timestamptz not null default now(),
     unique (item_id, trip_member_id, flag)
   )` — organizer-visible only via RLS; freeform `flag` (no enum) per
   "don't encode a default" ADR
11. RLS policies for every new/altered table in the same migration
    (see Appendix A.4 for the matrix)
12. `alter publication supabase_realtime add table public.announcements`
13. Trigger `assert_lodging_item_kind_before_assignment` on
    `lodging_assignments` INSERT/UPDATE: raise P0001 if
    referenced `itinerary_items.kind <> 'lodging'`

**Companion edits in the same PR:**

- `lib/db/types.ts` — add `ItineraryItemKind`, `TravelLegKind`,
  `ItineraryItemRsvpStatus` enums; types for new tables;
  `ItineraryItem` extended; `Announcement` extended; `Trip` extended
  with `notes`
- `lib/db/itinerary.ts` (new) — `getItineraryByTrip(tripId)`,
  `getItineraryItem(itemId)`, `getMyItemRsvps(tripId)`,
  `getItemFlagsForOrganizer(tripId)`,
  `getLodgingAssignments(itemId)`
- `lib/db/announcements.ts` (new) — `getAnnouncements(tripId)`,
  `subscribeToAnnouncements(tripId, callback)` (Realtime channel
  factory for the announcement feed component)
- `lib/db/travel-legs.ts` (new) — `getTravelLegsByTrip(tripId)` ordered
  by `arrive_at` ASC (arrivals manifest)
- `lib/db/trip-notes.ts` (new) — `getTripNotes(tripId)`,
  `updateTripNotes(tripId, notes, idempotencyKey)` returns; tiny
- `lib/actions/itinerary.ts` (new) — `addItineraryItem`,
  `updateItineraryItem`, `deleteItineraryItem` (idempotency-key required
  on every mutation; organizer-only via RLS; rate-limited under a new
  `CREATE_ITINERARY_ITEM` scope)
- `lib/actions/announcements.ts` (new) — `postAnnouncement(input,
  idempotencyKey)` (organizer-only)
- `lib/actions/trip-notes.ts` (new) — `setTripNotes` (organizer-only,
  idempotent)
- `lib/actions/itinerary-rsvp.ts` (new) — `setItemRsvp(itemId, status,
  idempotencyKey)` — strictly user-scoped, silent (no notification)
- `lib/actions/item-flags.ts` (new) — `addItemFlag`, `removeItemFlag`
  — strictly user-scoped (the member sets their own flag); read
  RLS restricts to organizers
- `lib/actions/travel-legs.ts` (new) — `upsertTravelLeg(input,
  idempotencyKey)`, `deleteTravelLeg(legId)` — owner-only write
  (`trip_member_id = my member id`); read = trip-wide
- `lib/actions/lodging-assignments.ts` (new) —
  `assignMemberToLodging(itemId, tripMemberId, roomLabel,
  idempotencyKey)`, `removeLodgingAssignment(id)` — organizer-only

**Rate-limit scope additions** (in `lib/rate-limit/scopes.ts` or
equivalent): `CREATE_ITINERARY_ITEM`, `POST_ANNOUNCEMENT`,
`UPDATE_TRIP_NOTES`, `SET_ITEM_RSVP`, `SET_ITEM_FLAG`,
`UPSERT_TRAVEL_LEG`, `ASSIGN_LODGING`. Default budget per M2's
30-req/60-sec sliding-window applies; revisit ratchet (#141) post-M3.

**Test files claimed:**

- `lib/db/__tests__/itinerary.test.ts`
- `lib/db/__tests__/announcements.test.ts`
- `lib/db/__tests__/travel-legs.test.ts`
- `lib/db/__tests__/trip-notes.test.ts`
- `lib/actions/__tests__/itinerary.test.ts`
- `lib/actions/__tests__/announcements.test.ts`
- `lib/actions/__tests__/trip-notes.test.ts`
- `lib/actions/__tests__/itinerary-rsvp.test.ts`
- `lib/actions/__tests__/item-flags.test.ts`
- `lib/actions/__tests__/travel-legs.test.ts`
- `lib/actions/__tests__/lodging-assignments.test.ts`

**Verification gate after Wave 1:**
```
pnpm dlx supabase db reset           # clean apply
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rl "from ['\"]vitest['\"]" app/ ; [ $? -eq 1 ] || echo "TEST_IN_APP_DIR=FAIL"
# Manual RLS smoke (4 personas):
#   - Anonymous: SELECT on all new tables denied
#   - Non-member: SELECT on all denied
#   - Member non-organizer: itinerary_items SELECT works; own item_rsvps RW works; flags SELECT denied; lodging_assignments insert denied
#   - Organizer: full RW on itinerary; can read all flags; can assign lodging; cannot impersonate another member on their travel_leg
#   - Celebrant: items with visibility=hide_from_celebrant invisible
# Manual replay smoke: addItineraryItem twice with same idempotency_key → one row, no duplicate
```

**Risk: HIGH.** Largest schema delta of the milestone. The
lodging-kind trigger and the celebrant-visibility hide-path are the
two paths most likely to break in subtle ways. `security-reviewer`
specifically reviews:
- visibility RLS clauses across all four new tables
- `idempotency_key` partial-uniques per the per-table ADR
  (organizer-acting tables = `(trip_id, idempotency_key)`;
  strictly-user tables = `(item_id, trip_member_id, idempotency_key)`)
- No PII leakage in `subscribeToAnnouncements` (Realtime payload
  honors RLS — verify in the smoke matrix)
- Travel-leg owner-only write enforced (`with check` clause binds
  `trip_member_id` to caller's own membership row)

---

## Wave 2 — Itinerary UI + per-item RSVP (one PR, sequential agents)

Runs after Wave 1 merges. Single branch: `feat/m3-itinerary-ui`.
Single PR. Closes #35, #36 (UI portion), #38, #80 (UI portion).

Dispatch order: `architect` (sign off on the day-section + item-card
shape against personas) → `tdd-guide` → `security-reviewer` →
`code-reviewer`.

**Touches:**

- `app/(authed)/trips/[tripId]/itinerary/page.tsx` (new) — server
  component; day-by-day vertical timeline auto-generated from
  `trips.starts_at`/`ends_at`; one section per day; items grouped by
  day via `starts_at` falling within the day window in trip's local TZ
  (defer #108 fix — out of scope for M3; documented hold)
- `components/trip/itinerary/day-section.tsx` (new) — heading: weekday
  + date in trip-local TZ format; ordered list of items
- `components/trip/itinerary/item-card.tsx` (new) — title, time,
  optional address (Maps deep link), kind icon, activity_tag chips,
  dress_code line, visibility badge for celebrant (frosted-glass blur
  per `ux-design-principles.md` Pattern 2 — defer the actual blur to a
  later wave; for M3, surface a "Something planned" placeholder when
  `hide_from_celebrant` and viewer is celebrant)
- `components/trip/itinerary/item-rsvp-chip.tsx` (new) — silent
  opt-out chip; client component; calls `setItemRsvp`; default state
  reads the inherited day-level RSVP
- `components/trip/itinerary/item-flag-form.tsx` (new) — per-item
  flag entry (dietary text + note); private to caller; organizer
  read-only surface ships in Wave 4
- `components/trip/itinerary/add-item-form.tsx` (new) — organizer-only;
  bottom sheet; fields: title, kind (select), starts_at, ends_at,
  address, dress_code, visibility, activity_tag (multi-select)
- `components/trip/itinerary/edit-item-form.tsx` (new) — same shape;
  organizer-only; delete button
- `components/trip/itinerary/maps-link.tsx` (new) — Apple-Maps + Google
  Maps universal link; uses `navigator.userAgent` only to pick the
  default; both links visible. No new deps.
- `lib/utils/maps-deep-link.ts` (new) — pure URL builder; unit-tested
- `app/(authed)/trips/[tripId]/page.tsx` — **edit only** — add a
  prominent "Itinerary" link card on dashboard; reads first upcoming
  item via `lib/db/itinerary.getNextUpcoming(tripId)` (new helper —
  add to wave-1 `itinerary.ts` if not already? — **CLAIM**: add the
  helper here in this PR; lib/db/itinerary.ts is the only Wave-1 file
  this wave edits. Append a function, no other line touched.)
- `lib/copy/empty-states.ts` — append `itinerary_empty`,
  `itinerary_loading`, `item_flag_empty` keys (Wave 0a should have
  added all M3 keys already; if any was missed, claim it here)

**Test files claimed (no overlap with anything in Wave 1):**

- `components/trip/itinerary/__tests__/day-section.test.tsx`
- `components/trip/itinerary/__tests__/item-card.test.tsx`
- `components/trip/itinerary/__tests__/item-rsvp-chip.test.tsx`
- `components/trip/itinerary/__tests__/item-flag-form.test.tsx`
- `components/trip/itinerary/__tests__/add-item-form.test.tsx`
- `components/trip/itinerary/__tests__/maps-link.test.tsx`
- `lib/utils/__tests__/maps-deep-link.test.ts`
- `e2e/m3-itinerary.spec.ts` — uses the storage-state fixture from
  Wave 0b (Override B): organizer creates a trip → adds two items
  (one event, one lodging) → member sees both → member silently opts
  out of one → organizer-view confirms the opt-out is invisible to
  peers

**Verification gate after Wave 2:**
```
pnpm dlx supabase db reset && pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rl "from ['\"]vitest['\"]" app/ ; [ $? -eq 1 ] || echo "TEST_IN_APP_DIR=FAIL"
pnpm exec playwright test --project=mobile-safari e2e/m3-itinerary.spec.ts
# MCP-Playwright (Override A) on the preview URL at 375px:
#   - Anonymous: /trips/<id>/itinerary bounces to /login
#   - Member: timeline renders; address tap opens Maps in new tab
#   - Member: opts out of one item; refresh; chip state persists
#   - Organizer: adds an item with hide_from_celebrant; celebrant view
#     shows "Something planned" placeholder, not the title
#   Screenshots into PR body
```

**Risk: HIGH.** Mobile-first UI density at 375px is where the M2
auth-fixture-gap was hiding all M2 visual debt. Every screen
exercised on real-browser preview at 375px before merge.

---

## Wave 3 — Realtime content (2 parallel PRs)

Runs after Wave 2 merges. Two PRs; touch no overlapping files.

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **3a** | `feat/m3-announcements` | #79 | `app/(authed)/trips/[tripId]/announcements/page.tsx`, `components/trip/announcements/announcement-list.tsx`, `components/trip/announcements/announcement-composer.tsx`, `components/trip/announcements/announcement-card.tsx`, `lib/copy/*` (read-only) | `components/trip/announcements/__tests__/*`, `e2e/m3-announcements.spec.ts` | medium |
| **3b** | `feat/m3-now-next-and-notes` | #77, #78, #110 | `components/trip/now-next-card.tsx` (new), `components/trip/trip-notes-editor.tsx` (new), `components/trip/trip-notes-view.tsx` (new), `app/(authed)/trips/[tripId]/page.tsx` (edit — wire in card + notes view), `lib/actions/rsvp.ts` (edit — `revalidatePath` on success for #110), `lib/utils/whats-happening-now.ts` (new pure function), `lib/utils/__tests__/whats-happening-now.test.ts` | `components/trip/__tests__/now-next-card.test.tsx`, `components/trip/__tests__/trip-notes-editor.test.tsx`, `components/trip/__tests__/trip-notes-view.test.tsx`, `lib/actions/__tests__/rsvp.test.ts` (edit — add revalidate assertion) | medium |

**Coordination rule:**
- 3a owns `app/(authed)/trips/[tripId]/announcements/**` (new
  directory) + `components/trip/announcements/**` (new directory)
- 3b owns `components/trip/now-next-card.tsx`,
  `components/trip/trip-notes-*.tsx`, and edits the dashboard page
- Both read `lib/db/announcements.ts` / `lib/db/itinerary.ts` /
  `lib/db/trip-notes.ts` from Wave 1 (read-only). Neither writes to
  `lib/db/**` in this wave.

**"What's happening now/next" semantics** (3b appendix):

```
function whatsHappeningNow(items, now):
  // items pre-sorted by starts_at ASC
  const inProgress = items.find(i => i.starts_at <= now && (i.ends_at ?? +Infinity) > now)
  const next       = items.find(i => i.starts_at > now)
  return { now: inProgress ?? null, next: next ?? null }
```

Pre-trip: `now = null`, surface "Trip starts in N days" + countdown +
first item. Trip-day: surface current + next. Post-trip: surface
"Trip ended N days ago" with a "Recap (coming soon)" placeholder
(NOT an active link — M5 territory).

**Verification gate after Wave 3:**
```
pnpm dlx supabase db reset && pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rl "from ['\"]vitest['\"]" app/ ; [ $? -eq 1 ] || echo "TEST_IN_APP_DIR=FAIL"
pnpm exec playwright test --project=mobile-safari e2e/m3-announcements.spec.ts
# MCP-Playwright preview at 375px:
#   - Organizer posts announcement; member's announcement page receives via Realtime within 2s
#   - Non-organizer cannot see the composer
#   - Dashboard now-card shows "Trip starts in N days" pre-trip
#   - Manually advance trip starts_at to today in a test trip → now-card shows current item
#   - Organizer edits notes; member view re-renders
#   - RSVP toggle flip: aggregate count updates immediately (revalidate fix #110)
```

**Risk: medium.** Realtime parallel-to-Wave-3a is the only novel
surface; 3b is mostly composition over existing Wave-1 helpers.

---

## Wave 4 — Logistics + invite (3 parallel PRs)

Runs after Wave 3 merges. Three PRs; touch no overlapping files.

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **4a** | `feat/m3-travel-legs` | #37 | `app/(authed)/trips/[tripId]/arrivals/page.tsx`, `components/trip/arrivals/travel-leg-card.tsx`, `components/trip/arrivals/travel-leg-form.tsx`, `components/trip/arrivals/arrivals-manifest.tsx` | `components/trip/arrivals/__tests__/*`, `e2e/m3-arrivals.spec.ts` | low |
| **4b** | `feat/m3-roster-and-contacts` | #39, #40 | `app/(authed)/trips/[tripId]/roster/page.tsx`, `components/trip/roster/roster-list.tsx`, `components/trip/roster/vcard-download-button.tsx`, `components/trip/roster/copy-numbers-button.tsx`, `lib/utils/vcard.ts` (pure vCard 3.0 builder), `lib/utils/__tests__/vcard.test.ts` | `components/trip/roster/__tests__/*`, `e2e/m3-roster.spec.ts` | low |
| **4c** | `feat/m3-invite-ui` | #129, #107 | `app/(authed)/trips/[tripId]/invites/page.tsx`, `components/trip/invites/invite-list.tsx`, `components/trip/invites/create-invite-form.tsx`, `components/trip/invites/copy-link-button.tsx`, `lib/rate-limit/scopes.ts` (split `MINT_INVITE` from `ACCEPT_INVITE`), `lib/actions/invites.ts` (edit — surface `createInvite`-bound rate limit + return `invite_url`) | `components/trip/invites/__tests__/*`, `e2e/m3-invite-ui.spec.ts`, `lib/actions/__tests__/invites.test.ts` (edit — add scope-split assertion) | medium |

**Coordination rule:**
- 4a, 4b, 4c each create a new page route in
  `app/(authed)/trips/[tripId]/<route>/` with no overlap
- 4c edits `lib/rate-limit/scopes.ts` and `lib/actions/invites.ts` —
  no other wave-4 agent touches those files
- 4b's `lib/utils/vcard.ts` is a pure utility — no DB access
- None of the three edits the dashboard page (Wave 3b's surface);
  cross-link from dashboard to these routes is deferred to Wave 5
  closure if needed

**Dashboard links:** Wave 4 closes with three new sub-routes that are
NOT yet reachable from the dashboard. Wave 5 closure adds the link
cards as part of the closure UI sweep (single-line additions to
`app/(authed)/trips/[tripId]/page.tsx`) — collision-free because
Wave 5 is sequential after Wave 4.

**Verification gate after Wave 4:**
```
pnpm dlx supabase db reset && pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rl "from ['\"]vitest['\"]" app/ ; [ $? -eq 1 ] || echo "TEST_IN_APP_DIR=FAIL"
pnpm exec playwright test --project=mobile-safari e2e/m3-arrivals.spec.ts e2e/m3-roster.spec.ts e2e/m3-invite-ui.spec.ts
# MCP-Playwright preview at 375px:
#   - Member adds their own flight (depart/arrive/carrier); other members see it
#   - Member CANNOT edit another member's leg (API rejection, UI doesn't surface edit)
#   - Roster page lists every member; vCard download is a single .vcf file containing every member with a phone
#   - Copy-all-numbers writes a comma-separated string to clipboard
#   - Organizer creates an invite from /invites; copy-link button copies the deep link
#   - Non-organizer cannot see the create form
#   - MINT_INVITE bucket cap reached separately from ACCEPT_INVITE (verify in test, not prod)
```

**Risk: medium.** 4c is the highest because rate-limit scope splits
have a regression footprint — `security-reviewer` reviews the
`lib/rate-limit/__tests__/scopes.test.ts` coverage for the new scope
keys.

---

## Wave 5 — Closure (one PR)

Single branch: `chore/m3-done`. Single PR.

**Touches:**

- `e2e/m3-golden-path.spec.ts` (new) — full M3 loop using auth fixture:
  load `/` → sign in via fixture (no email) → `/trips/new` → add 3
  itinerary items (event/lodging/meal) → assign lodging room → add
  travel leg → post announcement → invite a second test user →
  second user accepts → second user opts out of one item silently →
  organizer views dashboard with now/next card populated. Asserts
  every surface renders within mobile-safari at 375x812.
- `app/page.tsx` — update to reflect M3 reality OR explicit one-liner
  decision per Override G. Recommended update: anon sees a one-line
  "Travelston — plan your bach trip without making it weird";
  authed sees a list of their trips.
- `app/(authed)/trips/[tripId]/page.tsx` — add three link cards
  (Itinerary, Announcements, Arrivals, Roster, Invites) so every
  sub-route from Waves 2-4 is reachable
- `notes/decisions.md` — append "M3 — Trip is useful — milestone closed"
  entry at the top with load-bearing decisions made during execution
- `notes/roadmap.md` — mark M3 done, update **Current phase** to M4
- `notes/m3-execution-plan.md` (this file) — final DoD checkboxes
  ticked (both `[d]` and `[v]` axes)
- `notes/retros/m3-retro.md` (new) — mirrors `m2-retro.md` format:
  TL;DR, what shipped, what slipped, missed items, follow-up triage,
  process learnings, recommendation for next session

**Final M3 gate (this is the closure-on-prod gate per Override A):**

1. Local green: `pnpm typecheck && pnpm lint && pnpm test && pnpm dlx supabase db reset && pnpm build`
2. Test-in-app check: `grep -rEn "describe\(|test\(|it\(" app/` returns 0 lines
3. Playwright local: `pnpm exec playwright test --project=mobile-safari`
4. **Production walk** (https://travelston.com, MCP-driven Playwright at 375x812):
   - Anon: `/` renders the M3 landing copy (not the M1 placeholder)
   - Sign in with a real magic-link email to `ripcity352@gmail.com`
   - `/trips/new` → create a fresh "M3 closure test" trip
   - `/trips/<id>/itinerary` → add 3 items (event/lodging/meal)
   - Assign yourself to the lodging room
   - `/trips/<id>/arrivals` → add a flight leg
   - `/trips/<id>/announcements` → post a test announcement; confirm
     Realtime delivery in a second tab (or `curl` the API)
   - `/trips/<id>/invites` → mint an invite; confirm the copy-link
     button copies a URL containing the token
   - `/trips/<id>/roster` → confirm vCard downloads and Copy-numbers
     copies a clipboard string with at least one number
   - Dashboard renders the now/next card showing the first item
   - Open dev tools network panel: confirm no console errors on any
     route, no 4xx/5xx other than expected (e.g., realtime channel
     setup probe)
5. Screenshot each surface (8 screens) → embed all in the closure PR
   body under `## Production walk (375px)`
6. Issue queue empty: `gh issue list --milestone "M3 — Trip is useful" --state open --json state -q '. | length'` → 0
7. Append `notes/retros/m3-retro.md` mirroring M2's structure
8. After merge, flip roadmap §M3 status to ✓ in a follow-up if not
   already in this PR

---

## M3 DoD checklist (the source of truth — check as work lands)

Each line has two axes per Override E. Closure wave ticks `[v]` only
after the prod walk.

**Itinerary**
- [d] [v] Day-by-day view auto-generated from start/end dates (#35)
- [d] [v] `itinerary_items` extended with `kind`, `activity_tag`,
  `dress_code`, `address` (#35)
- [d] [v] Items inherit `visibility` enum (hide_from_celebrant
  end-to-end)
- [d] [v] Add/edit/delete via server actions with idempotency keys
- [d] [v] Address tap → opens Maps deep link
- [d] [v] Mobile-first vertical timeline at 375px
- [d] [v] Per-item RSVP — silent opt-out chip per item (#38)
- [d] [v] Per-item dietary/participation flag — organizer-visible (#80)
- [d] [v] Lodging assignments — table + UI (#36)

**Home / dashboard**
- [d] [v] "What's happening right now / next" home card (#77)
- [d] [v] Editable trip-level FAQ / notes field — `trips.notes` (#78)
- [d] [v] revalidatePath on `setRsvpAction` success (#110)

**Logistics**
- [d] [v] Travel legs / arrivals manifest (#37)
- [d] [v] vCard mass-download (#39)
- [d] [v] Copy all numbers button (#40)

**Communication**
- [d] [v] Announcements — organizer-write, member-read; visibility;
  Realtime; idempotency (#79)
- [d] [v] No chat / replies (decision preserved — no implementation)

**Invites (NEW-6 from M2 retro)**
- [d] [v] Invite-issuance UI for organizers (#129)
- [d] [v] MINT_INVITE rate-limit scope split from ACCEPT_INVITE (#107)

**Process / infra (load-bearing per M2 retro §6)**
- [d] [v] Auth-fixture for authenticated e2e (#120) — Wave 0
- [d] [v] `notes/deployment-readiness.md` ADR landed — Wave 0
- [d] [v] M2 prod golden-path smoke walked at Wave 0 close
- [d] [v] Production smoke (375px real browser) on every wave PR
- [d] [v] PKCE → token-hash for cross-device magic-link clicks (#137)
- [d] [v] `app/page.tsx` updated for M3 reality OR explicit kept-as-is
  decision (Override G)
- [d] [v] PulsePoll TIMED_OUT handling alongside CHANNEL_ERROR (#116)
- [d] [v] PulsePoll test-injection seam scoped to dev/test only (#117)
- [d] [v] Production-mode rate-limit shim regression test pinned (#130)
- [d] [v] `notes/retros/m3-retro.md` authored at closure

---

## Explicitly out of scope (do not build in M3)

Re-proposing any of these in an M3 PR is a review-blocker. The list
exists to prevent scope creep mid-wave.

- **Money / expenses** — entire M5 territory; even a stub "Expenses"
  card on the dashboard is out of bounds
- **Photos** — M5
- **Chat / message replies / threads** — explicitly preserved decision
  (use group text)
- **Pin Drops** (#32 killed)
- **ICS calendar export** (#41 killed)
- **Notification outbox / dispatcher** (#33 killed)
- **Push notifications** of any kind — wired only via the existing
  smart-default (none for content events; logistics only — and even
  that ships M4+)
- **Multi-tenant kind toggle** — `trip.kind` is `'bachelor'` only at
  M3
- **Per-item RSVP visibility broadcast** — opt-outs are silent (no
  notification, no peer-visibility surface in M3)
- **Co-organizer spend cap** — deferred to M5
- **AI itinerary extraction / OCR** — M5 research spike
- **Wallet pass / Apple PassKit** — M5 research
- **Hot Seat, Drumroll, Lock-In Day, Fear List swipe, Crew Cards,
  Group Recap, Time Capsule, Disposable Cam** — all killed or M5
- **Per-name vote visibility opt-in UI** — Wave-3-PulsePoll-reserved
  prop only; no surface
- **`audit_log` triggers** — M5
- **`content_visibility_grants` join** — defer until first `custom`
  audience consumer; M3 ships visibility enum values only, not the
  grants table
- **Trip-local timezone rendering** (#108) — explicit hold; itinerary
  uses browser-local TZ for M3 with a noted follow-up. Cross-coast
  bach parties get a one-line caveat in the dashboard footer.

---

## M2 learnings applied to M3

In addition to the global overrides A-G above:

1. **No same-file collisions across parallel PRs** — every wave row
   declares its file paths explicitly. Cross-wave file overlap is
   permitted **only** when the later wave is sequential-gated on the
   earlier merging first (e.g., Wave 5 edits the dashboard page
   Wave 2 created; Wave 5 cannot dispatch until Wave 4 is merged).
2. **`.env.example` is appended-to** — each agent appends at the
   bottom only.
3. **Before force-push, ALWAYS** `git log --oneline -3` to confirm
   HEAD is the rebased commit.
4. **`gh pr update-branch <num>`** before `gh pr merge` if the head
   isn't up to date.
5. **`.claude/worktrees/`** stays locked until session end.
6. **Supabase MCP + Vercel MCP** authenticated at session start.
7. **`supabase:supabase` skill** invoked for every DB-touching task.
8. **`security-reviewer` + `code-reviewer`** dispatched in parallel
   (Override D); pair on every server action and every migration.
9. **Idempotency scope follows the per-table ADR** —
   organizer-acting-on-behalf tables (`announcements`,
   `itinerary_items` add/edit) use `(trip_id, idempotency_key)`;
   strictly-user tables (`itinerary_item_rsvps`,
   `itinerary_item_member_flags`, `travel_legs` owned by member) use
   `(scope_pk, trip_member_id, idempotency_key)`.
10. **Microcopy palette is read-only after Wave 0a** — agents who need
    a new key open a one-line PR against `lib/copy/*` (Override F).

---

## Appendix A — Schema + RLS sign-off (architect-signed, Wave 1)

> Populated by the architect agent at Wave 1 start. Until then, this
> section reads `(populated at Wave 1 start)` and the Wave 1 gate
> blocks merge via:
>
> ```
> grep -q "(populated at Wave 1 start)" notes/m3-execution-plan.md && echo BLOCK_MERGE && exit 1
> ```

**A.1 Invariants** — *(populated at Wave 1 start)*

**A.2 RLS matrix** — *(populated at Wave 1 start)*

**A.3 Rate-limit scope additions** — *(populated at Wave 1 start)*

**A.4 Realtime publication contract** — *(populated at Wave 1 start)*

---

## Appendix B — Per-wave hard-stop conditions

The /goal directive imposes:
- 150 turns OR 2 consecutive wave-gate failures OR migration ordering
  ambiguity OR new dependency request → STOP and surface

Per-wave:
- **Wave 0**: 1 wave-gate failure → stop; the auth fixture is the
  foundation, can't proceed without it
- **Wave 1**: 2 sequential agent-chain failures (e.g.,
  security-reviewer re-rejects after fix-up round) → stop
- **Wave 2-4**: 2 wave-gate failures → stop; surface what's failing
- **Wave 5**: failed production walk → fix-then-retry once, then stop

---

## New dependencies this milestone introduces

None expected. M3 ships with the existing `@supabase/supabase-js`
Realtime, the existing `react-hook-form` + `zod` stack, the existing
shadcn primitives, and standard browser `navigator.share`,
`navigator.clipboard.writeText`, and `Blob` for vCard download.
Flag any agent-introduced dep in its PR body — hard-stop trigger.
