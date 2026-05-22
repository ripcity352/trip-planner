# Trip-Readiness Execution Plan — *"Safe to hand to real attendees"*

> Dated 2026-05-22.
> **NOT a milestone.** Between-milestones polish sweep scoped to the six
> P0 UX bugs filed during the post-M5 dogfood pass on 2026-05-21. M6 is
> hard-gated on a real-trip retrospective; this sweep is the bridge.
>
> **Goal:** Make the app safe to hand to real attendees before the
> bachelor party happens. Six P0s share one root cause — *surface built,
> path to surface missing.* Six issues, three waves, ≤7 PRs + closure.
>
> **Threat model unchanged:** bachelor-party insider. Friction < defense-
> in-depth (`feedback_friction_vs_security` memory). Rate limiting is
> the load-bearing control. This sweep adds *no* defense-in-depth; it
> adds *navigation* and *attribution* — the social plumbing missing from
> the dogfood pass.
>
> **Phase 6 closure:** append a short *"polish-sweep notes"* entry to
> `notes/decisions.md`. **No retro file.**

---

## Adapter notes — departures from `goal.md` defaults

| Field | Default | This sweep |
|---|---|---|
| DoD source | `notes/roadmap.md §<milestone>` | Inline MUST / SHOULD / OUT below |
| Plan file | `notes/m<N>-execution-plan.md` | `notes/trip-readiness-execution-plan.md` |
| Closure artifact | `notes/retros/m<N>-retro.md` | One short entry in `notes/decisions.md` |
| Override H (data-lock `lib/data/*`) | Active | **NO-OP** — no `lib/data/*` adds in scope |
| Overrides A–G + I + J | Active | **Active** — re-stated below |

---

## Two-axis labeling convention (Override E)

Each DoD line carries two checkboxes:

- `[d]` *declared* — code shipped, CI green, code-reviewer approved, merged to `main`
- `[v]` *verified* — feature exercised in a real browser on `https://travelston.com` at 375×812; outcome matches spec; screenshot in closure PR

`[v]` ticks land at closure. `[d]` is allowed mid-PR-chain. A `[v]` cannot be ticked without screenshot evidence; provisional `[v]` carries forward to next session.

---

## Overrides (A–J carried forward; H is no-op here)

- **A.** 375×812 real-browser smoke on Vercel preview before any wave PR merges. Screenshots under `## Preview smoke (375px)` in the PR body.
- **B.** Cross-wave infra (copy keys, shared helpers, schema) lands in **Wave 0**. No `test.fixme()` placeholders.
- **C.** Tests live in `lib/`, `components/`, `tests/unit/` only. `grep -rEn "describe\(|test\(|it\(" app/` returns empty before any merge.
- **D.** `security-reviewer` + `code-reviewer` dispatched in parallel in ONE message from PR-open. Fix-ups <100 LOC; one consolidated round per re-review.
- **E.** Two-axis DoD as above.
- **F.** No inline JSX leaf string literals. Every UI string sourced from `lib/copy/*`.
- **G.** `app/page.tsx` ownership at closure (update OR explicit "kept as-is" ADR).
- **H.** *NO-OP for this sweep.* No new `lib/data/*` entries are implied by any in-scope issue.
- **I.** Closure `[v]` for *"send invite link to real attendees"* requires a real Resend log + verified domain. **#135 gates this.** If `travelston.com` is not Resend-verified by closure, document as deferred — do not fake.
- **J.** Deploy-ordering — if any PR pairs code with a Supabase Dashboard step, capture flip timestamp + drain watcher + production walk. **Likely inactive this sweep** (`has_password` migration is schema-only; no Dashboard step required).

---

## Scope

### MUST (blockers; defines "trip-readiness")

| # | Issue | Surface |
|---|---|---|
| 1 | **#240** | Lodging + arrivals render raw `trip_member_id` UUID when memberMap lookup misses |
| 2 | **#239** | Announcements drop `authorDisplayName` (also realtime subscription payload) |
| 3 | **#236** | `/trips` populated list has no "New trip" CTA |
| 4 | **#237** | Crew tab has no "Invite people" CTA — unblocks M4 DoD *"send invite link to real attendees"* |
| 5 | **#238** | Header brand non-clickable + account menu missing `/trips` + `/account/sign-in-and-security` links |

### SHOULD (bundle in same waves; otherwise file `[carryback-defer]`)

| # | Issue | Surface | Bundle |
|---|---|---|---|
| 6 | **#241** | Travel-leg form: redundant Carrier+Airline; "leg" jargon | W1 sibling PR with #240 (same files) |
| 7 | **#233** | `/account/sign-in-and-security` State A for OTP-only users — option 3 `has_password` shadow column | W2 solo PR (migration blast radius) |
| 8 | Empty-state audit | Fresh-invitee POV: announcements / plans / crew / arrivals @ 0 | W2 small PR (≤4 string tweaks); itinerary "Dave's working on it" → "The organizers are on it." |

### OUT (file `[carryback-defer]` if surfaced; do NOT expand into this sweep)

- **#230** — rsvp-toggle CI flake (M6 Wave 0 per M5 retro)
- **#232** — OAuth `auth_email_taken_oauth` detection (needs SECURITY DEFINER RPC; M6)
- **#135** — Resend verified sender domain (ops/human action; parallel; do not gate)
- **#218 / #212 / #214 / #219 / #181 / #179 / #182** — design-system stack (own milestone)
- All remaining M5-bucket features (money pool, expenses, photos, retention, templates) — hard-gated on real-trip retro

**If `planner` or `architect` proposes ANY item from the OUT list, file `[carryback-defer]` instead of expanding scope.** No exceptions without operator approval.

---

## Wave map

Three waves + closure walk PR. Target ≤7 PRs total (6 implementation + 1 closure).

| Wave | PR | Branch | Closes | Status |
|------|----|--------|--------|--------|
| **W0** | W0 | `chore/trip-readiness-w0-foundations` | (sets up #240/#239/#241/#233/#236/#237/#238) | Ready |
| **W1** | W1a | `fix/240-member-name-resolution` | #240 | Blocked by W0 |
| **W1** | W1b | `fix/241-travel-leg-form` | #241 | Sibling to W1a |
| **W1** | W1c | `fix/239-announcement-author` | #239 | Sequential after W1a merges |
| **W2** | W2a | `fix/238-nav-affordances` | #237, #238 | Blocked by W0 |
| **W2** | W2b | `fix/236-trips-new-cta` | #236 | Independent |
| **W2** | W2c | `fix/233-has-password-state-b` | #233 | Independent (migration blast radius) |
| **Closure** | C | `chore/trip-readiness-done` | Closure walk + `[v]` ticks + decisions.md entry | Final |

**W1 worktrees are NOT pre-created until W0 lands on `main`** (M4 collision lesson per memory `feedback_wave_worktree_timing`).

**Empty-state audit** rides W2b if ≤4 string tweaks; otherwise files `[carryback-defer]`.

---

## Wave 0 — Foundations

**Single PR.** Branch `chore/trip-readiness-w0-foundations`. Lands the helper, the copy keys, the migration, and the atomic `has_password` writes — every CRITICAL/HIGH audit finding closed before W1 begins.

### Deliverables

#### Shared helper

- **`lib/utils/member-display.ts`** (new) — exported function:
  ```ts
  export function resolveMemberName(
    memberMap: ReadonlyMap<string, { display_name?: string | null }>,
    id: string,
  ): string {
    return memberMap.get(id)?.display_name ?? M3_UI_STRINGS.roster_member_fallback_name
  }
  ```
  Pure function, 3 lines. No factory, no registry. Reuses existing `M3_UI_STRINGS.roster_member_fallback_name = "Guest"` for the lookup-miss fallback (per voice audit, "Guest" is correct here — `announcements_author_fallback` is the distinct fallback string for the realtime-payload context).
- **`lib/utils/__tests__/member-display.test.ts`** (new) — three assertions:
  - hit: returns display_name
  - miss: returns "Guest"
  - null display_name: returns "Guest"

#### Copy keys (5 new keys appended; 1 existing key reused)

Append to `lib/copy/empty-states.ts` `M3_UI_STRINGS` namespace (M4 W0 precedent — append for grep-anchoring per-surface):

| Key | Value | Consumer (wave) |
|---|---|---|
| `tripsList_newTrip_cta` | `"Start a trip"` | #236 W2b |
| `nav_account_trips_link` | `"Your trips"` | #238 W2a (account-menu dropdown link) |
| `nav_brand_label` | `"Party Trip"` | #238 W2a (header brand `<Link>`) |
| `crew_invite_cta` | `"Add to the crew"` | #237 W2a |
| `announcements_author_fallback` | `"Someone"` | #239 W1c (realtime payload fallback) |

**Reuse, do NOT duplicate:**
- `AUTH_COPY.accountSecurity_meNavLink = "Sign-in & security"` → #238 W2a account-menu dropdown link
- `M3_UI_STRINGS.roster_member_fallback_name = "Guest"` → `resolveMemberName` fallback

**Voice rewrites of EXISTING values (W1/W2, not new keys):**
- `arrivals_*` keys: replace user-facing "leg" with "travel" / "trip in" / "trip out" — see W1b (#241).
- `itinerary_empty` (or equivalent): "Dave's working on it." → "The organizers are on it." — see W2 empty-state audit.

#### Voice-lock pins

- **`lib/copy/__tests__/trip-readiness-voice-locks.test.ts`** (new file; keep M5 locks frozen) — exact-string pins for the 5 new keys. Anti-pattern check on `announcements_author_fallback`: no UUID-shape regex (`/[0-9a-f]{8}-/`), no "user" substring, no exclamation.

#### Migration — `has_password` shadow column

- **`supabase/migrations/20260522<HHMMSS>_trip_readiness_has_password.sql`**:

  ```sql
  alter table public.profiles
    add column has_password boolean not null default false;

  comment on column public.profiles.has_password is
    'True iff this user has set a password identity. Mirrors '
    'auth.users.encrypted_password presence without exposing the auth '
    'schema to RLS. Written atomically inside the same server-action '
    'closure as updateUser({password}) — never via a trigger.';

  -- Backfill from auth.users (migration runs in service-role context).
  update public.profiles p
    set has_password = true
    from auth.users u
    where p.id = u.id
      and u.encrypted_password is not null
      and u.encrypted_password <> '';
  ```

  **RLS:** M1's existing `"users can update their own profile"` UPDATE policy covers `has_password` via row-level scope (column-level grants not used). **VERIFY before merge** by re-reading the M1 migration; if missing, append:
  ```sql
  create policy "users can update has_password on own profile"
    on public.profiles for update to authenticated
    using (auth.uid() = id) with check (auth.uid() = id);
  ```

  **No new index.** `profiles` is keyed by `id` (already indexed). Reads are point-lookups by `auth.uid()`.

  **Shared-select audit:** `rg "from\(['\"]profiles['\"]"` returns zero `lib/` consumers as of W0. The first reader lands in W2c (#233 PR). No M4 `TRIP_COLUMNS`-style replay risk.

#### Server-action edits — atomic `has_password` writes

Every server action that sets a password writes `has_password = true` inside the **same** `rateLimitedAction` closure that calls `updateUser({password})` / `signUp({password})`. **Never a trailing UPDATE.** Pattern (after the password mutation succeeds):

```ts
const { error: hpErr } = await supabase
  .from('profiles')
  .update({ has_password: true })
  .eq('id', user.id)
  .select()
  .single() // zero affected rows throws → caught → mapped to 'network'

if (hpErr) {
  Sentry.captureException(hpErr, { tags: { scope: '<action>' } })
  return { ok: false, errorKey: 'network' }
}
```

| Action | File:line | Branch (after which `updateUser/signUp` call) |
|---|---|---|
| `signUpAction` | `app/login/actions.ts:240` | After `supabase.auth.signUp()` success |
| `setPasswordViaRecoveryAction` | `app/(authed)/account/sign-in-and-security/actions.ts:289` | After atomic `updateUser({password})`, before `revokeOtherSessions` |
| `changePasswordAction` | `app/(authed)/account/sign-in-and-security/actions.ts:189` | After `updateUser({password})` success |
| `setPasswordAction` (State B) | `app/(authed)/account/sign-in-and-security/actions.ts:380` | After `updateUser({password})` — canonical State B → State A transition |

**Tests (new in W0):**
- `tests/unit/has-password-writes.test.ts` — for each of the 4 setters, assert: (a) on `updateUser` success, the `.update({has_password:true})` runs; (b) on `updateUser` failure, the `has_password` write does NOT run.

#### Phantom-wiring gate (W0 PR description)

Before merging W0, paste into the PR body:

```
## Phantom-wiring audit
For each new key + helper, both a producer (W0) AND a staged consumer (W1/W2) must exist:

| Symbol | Producer | Staged consumer |
|---|---|---|
| resolveMemberName | lib/utils/member-display.ts | W1a lodging-roster + arrivals-manifest + organizer-flag-view |
| tripsList_newTrip_cta | lib/copy/empty-states.ts | W2b /trips populated-list CTA |
| nav_account_trips_link | lib/copy/empty-states.ts | W2a header-menu dropdown |
| nav_brand_label | lib/copy/empty-states.ts | W2a header brand Link |
| crew_invite_cta | lib/copy/empty-states.ts | W2a crew tab |
| announcements_author_fallback | lib/copy/empty-states.ts | W1c AnnouncementCard + lib/db/announcements.ts realtime payload |
| has_password column | migration | W2c lib/db/profiles.ts (new reader) |
```

#### W0 DoD

- [d] [v] `resolveMemberName` exported + unit-tested (3 assertions)
- [d] [v] 5 new copy keys in `M3_UI_STRINGS` + voice-locked
- [d] [v] `has_password` migration applied locally + on staging; `auth.users.encrypted_password` backfill runs
- [d] [v] 4 server actions write `has_password` atomically (test asserts no separate post-success call)
- [d] [v] Phantom-wiring audit table present in PR body
- [d] [v] `pnpm typecheck && pnpm lint && pnpm test` green
- [d] [v] No `lib/data/*` adds (Override H NO-OP confirmed)
- [d] [v] 375px Vercel preview smoke on `/login` (regression check — the `has_password` writes touch the signup path)

---

## Wave 1 — Member-display

**Worktrees created only AFTER W0 lands on `main`** (`git log origin/main | head -5` shows W0 commit).

### W1a — `fix/240-member-name-resolution` (closes #240)

**Files:**

| File | Change |
|---|---|
| `components/trip/itinerary/lodging-roster.tsx:115` | Replace `{memberMap.get(a.trip_member_id) ?? a.trip_member_id}` with `{resolveMemberName(memberMap, a.trip_member_id)}` |
| `components/trip/itinerary/lodging-roster.tsx:154` | Replace `<option>` label fallback `m.display_name ?? m.email ?? m.id` with `resolveMemberName`-style fallback (UUID never visible) |
| `components/trip/arrivals/arrivals-manifest.tsx:65` | Replace `ownerName={memberNameMap.get(leg.trip_member_id) ?? leg.trip_member_id}` with helper |
| `components/trip/itinerary/organizer-flag-view.tsx:59` | **(bundled-in 3rd consumer)** Replace `memberNames[memberId] ?? memberId` with helper |
| `tests/unit/lodging-roster.test.tsx` | Add UUID-leak regression test: missing member id renders "Guest", not the UUID |
| `tests/unit/arrivals-manifest.test.tsx` | Same regression assertion |
| `tests/unit/organizer-flag-view.test.tsx` | Same regression assertion |

**DoD:**
- [d] [v] `resolveMemberName` consumed by all 3 surfaces
- [d] [v] No raw UUID renders in any user-facing string (verified by grep + 3 unit regressions)
- [d] [v] 375px preview smoke: assign two members to a lodging unit; remove one; fallback renders "Guest"

### W1b — `fix/241-travel-leg-form` (closes #241) — sibling to W1a, same files

**Files:**

| File | Change |
|---|---|
| `components/trip/arrivals/travel-leg-form.tsx:229-277` | Collapse redundant `Carrier` + `AirlinePicker` rendering: `AirlinePicker` writes into `carrier`, so render only the picker for `flight` kind; render plain `carrier` text input for non-flight kinds. No simultaneous double-render. |
| `lib/copy/empty-states.ts` | Update `arrivals_addLeg_cta`, `arrivals_editLeg_cta`, `arrivals_empty` values: replace user-facing "leg" with "travel" / "trip in" / "trip out". **Schema names unchanged** (`travel_legs` table, `kind` enum). Keys are kept; values change. |
| `tests/unit/travel-leg-form.test.tsx` | Update: non-flight kinds show carrier-only; flight kind shows AirlinePicker only |
| `tests/unit/copy-jargon.test.ts` | New voice-lock: ensure no `arrivals_*` value contains the substring " leg " or " legs " |

**No `CARRIER_SANITIZE_REGEX` change.** PR body explicitly asserts this (M4 regex-strip-spaces replay guard).

**DoD:**
- [d] [v] Flight kind: only `AirlinePicker` rendered; carrier auto-populated by picker selection
- [d] [v] Non-flight kinds: plain carrier text input
- [d] [v] No "leg" jargon in user-facing copy (voice-lock test green)
- [d] [v] 375px preview smoke: add a flight leg + a drive leg; both render cleanly

**Sibling sequencing:** W1a + W1b share `arrivals-manifest.tsx` references but edit disjoint regions. Verify zero file overlap in PR-body matrix; if overlap discovered mid-execution, serialize (W1a → W1b).

### W1c — `fix/239-announcement-author` (closes #239) — sequential after W1a merges

**Files:**

| File | Change |
|---|---|
| `lib/db/announcements.ts` | `getAnnouncements`: extend SELECT to join `trip_members(display_name)` via FK. Realtime payload assembly in `subscribeToAnnouncements`: enrich payload with `trip_members.display_name` lookup before passing to subscriber callback. |
| `components/trip/announcements/announcement-list.tsx` | Pass `authorDisplayName` prop to `<AnnouncementCard>` (the prop already exists; producer never wired it). |
| `components/trip/announcements/announcement-card.tsx` | Use `announcements_author_fallback` ("Someone") when `authorDisplayName` is missing — NOT `roster_member_fallback_name` ("Guest"). |
| `tests/unit/announcement-card.test.tsx` | Assert: present author renders name; missing author renders "Someone"; never renders UUID or "Guest". |
| `tests/unit/announcements-db.test.ts` | Assert SELECT shape includes `trip_members.display_name`; realtime payload assembly populates `authorDisplayName`. |

**DoD:**
- [d] [v] `getAnnouncements` and realtime payload both carry `authorDisplayName`
- [d] [v] Voice-lock: realtime fallback renders "Someone", not "Guest"
- [d] [v] 375px preview smoke: post announcement from one tab; second tab sees author name immediately (not "Someone"); hard-refresh still shows name

---

## Wave 2 — Nav + auth

### W2a — `fix/238-nav-affordances` (closes #237, #238) — bundled

Header brand + account dropdown + crew CTA all share the nav-affordances copy palette + dropdown component. Bundle.

**Files:**

| File | Change |
|---|---|
| `components/trip/header.tsx:40-42` | Wrap brand text in `<Link href="/trips" aria-label={M3_UI_STRINGS.nav_brand_label}>`. The text content stays `M3_UI_STRINGS.nav_brand_label`. |
| `components/trip/header-menu.tsx:37-60` | Append two `<DropdownMenuItem>` entries: `Your trips` → `/trips` and `Sign-in & security` → `/account/sign-in-and-security`. Existing "Sign out" stays. |
| `components/trip/crew-tab.tsx` (or `roster-page.tsx` — whichever owns the crew tab UI) | Add "Add to the crew" CTA wired to existing invite-mint action / `/invites` route (do NOT re-implement minting). Verify the CTA is reachable without home-tab detour. |
| `tests/unit/header.test.tsx` | Brand link renders; aria-label uses copy key |
| `tests/unit/header-menu.test.tsx` | Three menu items render: Your trips / Sign-in & security / Sign out |
| `tests/unit/crew-tab.test.tsx` | "Add to the crew" CTA renders for organizer; clicking it navigates to invites surface |

**DoD:**
- [d] [v] Header brand is a clickable `<Link>` to `/trips`
- [d] [v] Account-menu dropdown exposes both `/trips` and `/account/sign-in-and-security`
- [d] [v] Crew tab has "Add to the crew" CTA reachable without detour
- [d] [v] 375px preview smoke: from trip detail → click brand → land `/trips`; open account menu → click "Sign-in & security" → land there

### W2b — `fix/236-trips-new-cta` (closes #236)

**Files:**

| File | Change |
|---|---|
| `app/(authed)/trips/page.tsx` | Render a "Start a trip" CTA above (or alongside) the populated trip list — currently only the empty-state has the CTA. Use `tripsList_newTrip_cta` copy key. |
| `tests/unit/trips-list-page.test.tsx` (or e2e) | Populated list renders "Start a trip" CTA in addition to trip cards |
| `lib/copy/empty-states.ts` (already-shipped W0 keys) | n/a |

**Empty-state audit ride-along:** Update `itinerary_empty` value from `"Nothing booked yet. Dave's working on it."` → `"Nothing booked yet. The organizers are on it."` (fresh-invitee POV). Voice-lock test pins the new string. If empty-state audit surfaces >3 additional string tweaks, file `[carryback-defer]` for the overflow.

**DoD:**
- [d] [v] Populated `/trips` list renders "Start a trip" CTA
- [d] [v] Itinerary empty-state name-drop removed
- [d] [v] 375px preview smoke: signed in with ≥1 trip → CTA visible without scroll on 375×812

### W2c — `fix/233-has-password-state-b` (closes #233)

**Files:**

| File | Change |
|---|---|
| `lib/db/profiles.ts` (new file OR existing) | Add `getProfile(userId)` reader that selects `id, has_password` (explicit columns — no `select('*')`). First reader of this table; sets the shared-select convention. |
| `app/(authed)/account/sign-in-and-security/page.tsx` | Replace `deriveIdentityState()`'s identity-provider check with: read `profiles.has_password`; if `false`, render **State B** (set-password) regardless of `identities` array. State A/A+/C unchanged. |
| `tests/unit/sign-in-and-security-page.test.tsx` | Assert: `has_password=false` + OTP-only identities → State B; `has_password=true` + email identity → State A. |

**State B copy:** existing `accountSecurity_stateB_helperOtpOnly` ("You currently sign in with a code…") and `accountSecurity_setPasswordTitle` ("Add a password") are voice-correct per audit. No new copy keys needed.

**Migration blast radius:** W2c is solo (no sibling PR). The migration already landed in W0; W2c only consumes `has_password`. No new Dashboard step → Override J inactive.

**DoD:**
- [d] [v] OTP-only user on `/account/sign-in-and-security` renders **State B** (not State A)
- [d] [v] Password-set user renders State A
- [d] [v] 375px preview smoke: fresh OTP-only signup → visit security page → State B form renders

---

## Closure walk PR — `chore/trip-readiness-done`

Authed production walk on `https://travelston.com` at **375×812**. Walk evidence → `notes/trip-readiness-screenshots/` (mirrors `notes/m5-screenshots/` precedent from PR #235). Closure PR embeds screenshots in the body.

### Pre-walk eyeball check (M5 OTP-length drift lesson)

Supabase Dashboard → Auth → Sign In / Providers → Email:
- Site URL: `https://travelston.com`
- OTP Length: **6**
- Magic Link template body emits `{{ .Token }}` (not `{{ .ConfirmationURL }}`)
- Google OAuth provider: enabled OR explicitly noted as deferred (#232 still pending)

Vercel project → Settings → Environment Variables:
- `vercel env ls production` includes `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL = https://travelston.com`

### Walk scenarios — one screenshot per scenario, minimum 6

| # | Scenario | Issues exercised | Pass criteria |
|---|---|---|---|
| 1 | **Fresh-invitee path** | #236, #238 | Open invite link → sign up → land on trip → click header brand → land on `/trips` → click "Start a trip" → land on `/trips/new` |
| 2 | **Crew-tab self-serve** | #237 | Existing member opens crew tab → click "Add to the crew" → copy invite link → no detour through home tab |
| 3 | **Author attribution under realtime** | #239 | Post announcement from device A → device B sees author name immediately AND on hard refresh; missing-member edge renders "Someone" not "Guest" not UUID |
| 4 | **Member-name resolution + fallback** | #240, #241 | Assign two members to a lodging unit + a travel leg → names render, never raw UUIDs; remove one member → fallback renders "Guest" not UUID/undefined; travel-leg form: flight kind shows AirlinePicker only, non-flight shows carrier only |
| 5 | **OTP-only State B** | #233 | Sign up via OTP only → visit `/account/sign-in-and-security` → **State B** renders (not State A) → set password → State A renders post-set |
| 6 | **iOS Safari keyboard-up pass** | All UI changes | 375×812 with keyboard visible: post-composer + travel-leg form remain usable (no safe-area collision; no input clipped) |

### Console-error gate

Zero console errors across all 6 scenarios. Informational accessibility hints (e.g., hidden-username heuristic warnings) are allowed.

### Closure PR contents

- Updated `notes/trip-readiness-execution-plan.md` with `[v]` ticks
- Screenshots embedded in PR body
- `app/page.tsx` update OR explicit "kept as-is" note (Override G)
- `notes/decisions.md` short *"polish-sweep notes"* entry covering: in-execution decisions, any deferred `[v]`, the bundled-in `organizer-flag-view.tsx` + `/account/sign-in-and-security` dropdown finds, and the `has_password` atomic-write pattern as a reusable note
- `CLAUDE.md` "Current phase" update IF any phrasing needs adjustment (likely none — M5 closed; trip-readiness is interstitial)

---

## Reading list (per wave)

### W0
- `lib/copy/empty-states.ts` (M3_UI_STRINGS shape; existing `roster_member_fallback_name`)
- `lib/copy/auth.ts` (AUTH_COPY shape; existing `accountSecurity_meNavLink`)
- `app/login/actions.ts` + `app/(authed)/account/sign-in-and-security/actions.ts` (the 4 password setters)
- `supabase/migrations/0001_init.sql` (M1 profiles UPDATE policy verification)
- `notes/database-workflow.md` (migration discipline)

### W1
- `components/trip/itinerary/lodging-roster.tsx`
- `components/trip/arrivals/arrivals-manifest.tsx`
- `components/trip/itinerary/organizer-flag-view.tsx`
- `components/trip/announcements/announcement-card.tsx` + `announcement-list.tsx`
- `lib/db/announcements.ts`

### W2
- `components/trip/header.tsx` + `header-menu.tsx`
- `app/(authed)/trips/page.tsx`
- `app/(authed)/account/sign-in-and-security/page.tsx`
- `lib/db/profiles.ts` (new) — establishes shared-select convention for this table

---

## Risks + sentinels

### Hard stops (surface state, ask operator)

- **>4 waves OR >8 PRs estimated** — split signal (`goal.md:111`); current plan is 3 waves / 7 PRs.
- **Migration ordering ambiguity** — `has_password` migration is additive; rollback is `alter table … drop column`. If W0 fails post-merge, revert + investigate, don't paper over.
- **New dependency** — none planned. If `tdd-guide` requests one, stop.
- **Contract drift** — if the per-action contract table needs an existing rate-limit scope rename or a new RLS policy mid-execution, ADR-it before coding.
- **2 consecutive wave-gate failures** — escalate.

### Soft sentinels (mid-execution discipline)

- **`[carryback-defer]` for unrelated bugs.** No expanding the in-flight PR.
- **Verify against `git show origin/main:<file>`** before accepting any "pre-existing failure" claim from `tdd-guide` (M4 hallucination memory).
- **Reviewer dispatch always parallel, always one message.** Sequential = process bug.
- **No `test.fixme()`, no `@ts-expect-error`, no `eslint-disable` without inline justification.**
- **Pre-commit grep** for tdd-guide softening prod signatures (M5 PR2 lesson) — e.g., `git diff main...HEAD -- '*.ts' | rg '^-.*\b(string|number|Required)\b' | rg '^\+.*\?:'`.
- **W1 worktree timing:** create only AFTER W0 lands on `main` (M4 memory).

---

## Appendix — Wave-0 file ownership matrix

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| W0 | `chore/trip-readiness-w0-foundations` | (foundations for #240/#239/#241/#233/#236/#237/#238) | `lib/utils/member-display.ts` (new), `lib/utils/__tests__/member-display.test.ts` (new), `lib/copy/empty-states.ts` (append 5 keys + voice-rewrites), `lib/copy/__tests__/trip-readiness-voice-locks.test.ts` (new), `supabase/migrations/20260522<HHMMSS>_trip_readiness_has_password.sql` (new), `app/login/actions.ts:240` (atomic write in `signUpAction`), `app/(authed)/account/sign-in-and-security/actions.ts:189,289,380` (atomic writes in 3 setters), `tests/unit/has-password-writes.test.ts` (new) | `member-display.test.ts`, `trip-readiness-voice-locks.test.ts`, `has-password-writes.test.ts` | Low — additive only. Highest-risk surface is the migration; backfill is deterministic from `auth.users.encrypted_password`. |

---

## Appendix — Per-server-action contract table

| Action (file:line) | Idempotency scope | Rate-limit scope | RLS gate | Error map keys | `has_password` atomic? |
|---|---|---|---|---|---|
| `signUpAction` — `app/login/actions.ts:216` | n/a (Supabase dedupes by email) | `AUTH_PASSWORD` | `profiles` UPDATE (M1 self-policy) | `validation_failed`, `auth_wrong_password`, `rate_limit`, `network` | YES — write inside same `rateLimitedAction` closure after `signUp()` succeeds |
| `setPasswordViaRecoveryAction` — `app/(authed)/account/sign-in-and-security/actions.ts:243` | n/a | `AUTH_CHANGE_PASSWORD` | `profiles` UPDATE (M1 self-policy) | `validation_failed`, `auth_code_invalid`, `auth_current_password_incorrect`, `rate_limit`, `auth_unauthenticated`, `network` | YES — write inside closure after `updateUser({password})`, before `revokeOtherSessions` |
| `changePasswordAction` — `app/(authed)/account/sign-in-and-security/actions.ts:142` | n/a | `AUTH_CHANGE_PASSWORD` | `profiles` UPDATE (M1 self-policy) | `validation_failed`, `auth_current_password_incorrect`, `rate_limit`, `auth_unauthenticated`, `network` | YES — idempotent write after `updateUser` |
| `setPasswordAction` (State B) — `app/(authed)/account/sign-in-and-security/actions.ts:343` | n/a | `AUTH_CHANGE_PASSWORD` | `profiles` UPDATE (M1 self-policy) | `validation_failed`, `rate_limit`, `auth_unauthenticated`, `network` | YES — write after `updateUser` (canonical State B → State A transition) |
| `upsertTravelLeg` (touched by #241) — `lib/actions/travel-legs.ts` | `(trip_member_id, idempotency_key)` (existing) | `UPSERT_TRAVEL_LEG` (existing) | `is_trip_member_by_member_id` (existing) | `travel_leg_save_failed`, `validation_failed`, `rate_limit` | n/a — field-collapse + jargon copy only |

**No new rate-limit scopes. No new idempotency scopes.** Every mutation reuses existing scopes from M2/M4/M5.

---

## DoD (rollup — source of truth)

### MUST
- [d] [v] #240 — no raw UUID renders in lodging or arrivals; helper consumed
- [d] [v] #239 — announcement author renders name (initial fetch + realtime); fallback is "Someone" not "Guest" not UUID
- [d] [v] #236 — populated `/trips` list shows "Start a trip" CTA
- [d] [v] #237 — crew tab shows "Add to the crew" CTA without home-tab detour
- [d] [v] #238 — header brand clickable to `/trips`; account dropdown has `Your trips` + `Sign-in & security`

### SHOULD
- [d] [v] #241 — travel-leg form: no double-render of Carrier+Airline; no "leg" jargon in user copy
- [d] [v] #233 — OTP-only user lands on State B (not State A); `has_password` atomic across 4 setters
- [d] [v] Empty-state audit — itinerary "Dave" name-drop removed; ≤3 other tweaks bundled or deferred

### Process
- [d] [v] Phantom-wiring audit table in W0 PR body
- [d] [v] Override D (parallel reviewer dispatch) followed on every PR
- [d] [v] Override A (375px preview smoke) on every PR
- [d] [v] `app/page.tsx` ownership decision recorded at closure
- [d] [v] Closure walk: 6 scenarios + iOS keyboard pass; screenshots in PR body
- [d] [v] `notes/decisions.md` polish-sweep entry committed

---

*Plan locked 2026-05-22. Operator CONFIRM gates Wave 0 dispatch (Phase 4 hard gate).*

---

## Phase 6 closure — verification status (2026-05-22)

Production walk on `https://travelston.com` at 375×812 performed 2026-05-22 ~17:34 UTC. Session was already authed (cookie persistence from W0 walk). Screenshots in `notes/trip-readiness-screenshots/closure-walk-*.png` (8 files, 1 per scenario).

### Verified `[v]` end-to-end on production

| Issue / scope | Wave | Evidence file | Status |
|---|---|---|---|
| #238 — header brand `<Link>` | W2a | `closure-walk-01-trips-authed-before-cta-deploy.png` (banner row shows brand as a link) | ✅ `[v]` live |
| #238 — account dropdown adds Your trips + Sign-in & security | W2a | `closure-walk-02-account-dropdown-w2a.png` | ✅ `[v]` live |
| #233 — `/account/sign-in-and-security` State A (passworded account) | W2c | `closure-walk-03-account-security-state-a-w2c.png` | ✅ `[v]` live (State A) |
| #236 — `/trips` populated list "Start a trip" CTA | W2b | `closure-walk-04-trips-list-start-cta-w2b.png` | ✅ `[v]` live |
| #237 — crew tab "Add to the crew" CTA → `/invites` | W2a | `closure-walk-05-crew-add-cta-w2a.png` | ✅ `[v]` live |
| #239 — announcement author renders "Someone" fallback (no UUID) | W1c | `closure-walk-06-announcement-someone-fallback-w1c.png` | ✅ `[v]` live (fallback path; real-name path covered by unit tests + producer enrichment is wired) |
| #240 — lodging shows "Guest" not UUID | W1a | `closure-walk-07-lodging-guest-fallback-w1a.png` | ✅ `[v]` live |
| #240 — arrivals shows "Guest" not UUID | W1a | `closure-walk-08-arrivals-guest-flight-w1a-w1b.png` | ✅ `[v]` live |
| #241 — travel-leg form: Flight kind single-field render + "Add your travel" voice | W1b | `closure-walk-08-arrivals-guest-flight-w1a-w1b.png` | ✅ `[v]` live |
| Empty-state — itinerary "Dave" name-drop removed | W0 | `rg "Dave's working on it" lib/` → 0 matches; voice-lock test green | ✅ `[v]` via test guard |

### Provisional `[v]` — carries to next session

| Item | Why provisional | Issue tracker |
|---|---|---|
| #233 — fresh OTP-only signup → State B path | Needed an OTP-only account; walked session was already passworded. State B is covered by 9 unit tests + the deterministic backfill SQL. | **#255** |
| iOS Safari keyboard-up pass on post-composer + travel-leg form | Playwright doesn't drive iOS Safari well; needs an operator's real device. | (consolidated under closure; can re-walk on real device) |

### Console errors observed

`/trips/[id]/arrivals` surfaces a single React error #418 (hydration text mismatch — likely a date-format SSR/client drift on the new date-fns-tz output). Page renders correctly visually; not user-visible. **Not introduced by this sweep — pre-existing pattern on the arrivals route.** Tracked: **#254**.

### Pre-walk eyeball check

Skipped — no Supabase Dashboard step paired with code in this sweep (Override J inactive). Vercel preview deploys eventually surfaced "Ready" status on all 7 PRs after stale-comment refresh via no-op trigger commits.

### Override G — `app/page.tsx` decision

**Kept as-is.** This sweep added navigation + author attribution + nav-affordance copy — all post-sign-in surfaces. The marketing landing page's CTA ("Sign in to your trip") is auth-method-agnostic and unaffected. Same call as M5 closure.

### Carry-back / out-of-PR follow-ups filed during execution

| # | Title | Source |
|---|---|---|
| #244 | refactor: consolidate atomic `has_password` writes into `markPasswordSet` helper | W0 code-review MEDIUM-1 |
| #245 | docs: note `account-actions.test.ts` default-passes the new `has_password` chain | W0 code-review LOW-1 |
| #248 | fix: cross-field guard for travel-leg `kind != flight` | W1b both reviewers (pre-existing) |
| #250 | refactor: consolidate announcements author-enrichment via SQL view OR drop unused param | W1c code-review LOW |
| #254 | fix: React hydration mismatch (#418) on `/arrivals` | Closure walk observation |
| #255 | chore: fresh OTP-only signup walk for State B (#233 `[v]`) | Closure walk provisional |

### Final commit chain on `main`

```
300ea1b fix(#236): add 'Start a trip' CTA to populated /trips list (#252)
8f2396e fix(#233): /account/sign-in-and-security uses has_password shadow column for State B detection (#253)
5117e03 fix(#237+#238): nav affordances — header brand link, account dropdown adds Your trips + Sign-in & security, crew tab 'Add to the crew' CTA (#251)
008e90f fix(#239): wire authorDisplayName through announcements — initial fetch + realtime payload (#249)
587147a fix(#241): travel-leg form — collapse redundant Carrier+AirlinePicker into kind-conditional render (#247)
69acbe6 fix(#240): replace raw trip_member_id UUID with resolveMemberName helper at 4 sites (#246)
e025115 chore(trip-readiness): W0 foundations — resolveMemberName helper + copy keys + has_password migration + atomic setters (#243)
```

**Sweep target met:** 3 waves, 7 PRs + closure (within the ≤4 waves / ≤8 PRs budget per `goal.md:111`).
