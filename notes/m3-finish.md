# M3 Finish — Continuation Bootstrap

> Fresh-session pickup doc. M3 is **5 of 6 waves merged**; Waves 3–5
> remain. Source of truth for **scope**: `notes/m3-execution-plan.md`.
> This doc captures the **session-level operating layer**: current
> state, remaining work, dispatch style, hard stops, pre-authorized
> actions, and read-order. Read it first; then read the plan.

## State on `main` (verified 2026-05-20)

5 of 6 waves merged. Latest commits:

- `9b6f1f5` Wave 2 — itinerary UI + per-item RSVP + per-item flag (#147)
- `e781209` Wave 1 — itinerary + announcements schema + data layer (#146)
- `2f1bfb3` Wave 0c — magic-link PKCE → token-hash (#137 via #144)
- `98a58f1` Wave 0b — Playwright auth fixture (#120 via #145)
- `f86c160` Wave 0a — plan doc + deployment-readiness + M3 copy keys (#143)

**Substrate available on `main`** (Waves 3–5 consume this):

- `supabase/migrations/20260520052357_m3_itinerary_announcements.sql`
- `lib/db/` — `itinerary.ts`, `announcements.ts`, `travel-legs.ts`,
  `trip-notes.ts`, `types.ts` (+ existing `trips.ts`, `rsvp.ts`,
  `invites.ts`, `date-poll.ts`, `index.ts`)
- `lib/actions/` — `itinerary.ts`, `announcements.ts`,
  `itinerary-rsvp.ts`, `item-flags.ts`, `travel-legs.ts`,
  `lodging-assignments.ts`, `trip-notes.ts` (all idempotent)
- `lib/copy/` — `empty-states.ts`, `errors.ts` (M3 keys present)
- `components/trip/itinerary/` — Wave 2 components (item-card,
  day-section, item-rsvp-chip, item-flag-form, add/edit-item-form +
  sheets, lodging-roster, maps-link)
- `lib/utils/maps-deep-link.ts`
- `tests/fixtures/auth.ts` — `STORAGE_STATE_PATH` constant
- `e2e/_setup/seed-test-user.ts` — Supabase Admin user seed
- `lib/auth/callback-handler.ts` — accepts both PKCE + token_hash
- 7 new rate-limit scopes shipped in Wave 1
- Realtime publication on `announcements` table is enabled

## Remaining work (per `notes/m3-execution-plan.md`)

### Wave 3 — Realtime content (2 parallel PRs)

**3a — `feat/m3-announcements`** (#79):
- `app/(authed)/trips/[tripId]/announcements/page.tsx`
- `components/trip/announcements/*`
- Realtime subscription on `announcements` table (publication already
  enabled — Wave 1)

**3b — `feat/m3-now-next-and-notes`** (#77, #78, #110):
- `components/trip/now-next-card.tsx`
- `components/trip/trip-notes-editor.tsx` + `trip-notes-view.tsx`
- `lib/utils/whats-happening-now.ts` (pure fn — unit test in `lib/`)
- Wire both into `app/(authed)/trips/[tripId]/page.tsx`
- Add `revalidatePath('/trips/[slug]')` in `lib/actions/rsvp.ts`
  `setRsvpAction` on success (#110)

### Wave 4 — Logistics + invite UI (3 parallel PRs)

**4a — `feat/m3-travel-legs`** (#37):
- `app/(authed)/trips/[tripId]/arrivals/page.tsx`
- `components/trip/arrivals/*`

**4b — `feat/m3-roster-and-contacts`** (#39, #40):
- `app/(authed)/trips/[tripId]/roster/page.tsx`
- `components/trip/roster/*` (vCard download + Copy-all-numbers)
- `lib/utils/vcard.ts` (pure vCard 3.0 builder — unit test in `lib/`)

**4c — `feat/m3-invite-ui`** (#129, #107):
- `app/(authed)/trips/[tripId]/invites/page.tsx`
- `components/trip/invites/*`
- Split `MINT_INVITE` from `ACCEPT_INVITE` in
  `lib/rate-limit/scopes` module (#107)

### Wave 5 — Closure (single PR `chore/m3-done`)

- `e2e/m3-golden-path.spec.ts` — uses storage-state fixture; covers:
  organizer creates trip → adds 3 itinerary items
  (event/lodging/meal) → assigns lodging room → posts announcement
  → mints invite → second user accepts → second user opts out of
  one item silently
- `app/page.tsx` — update for M3 reality OR explicit
  "kept as-is, decision: …" ADR entry (Override G)
- Link cards on `app/(authed)/trips/[tripId]/page.tsx`:
  Itinerary / Announcements / Arrivals / Roster / Invites
- `notes/decisions.md` — append "M3 — Trip is useful — milestone
  closed" entry with load-bearing in-execution decisions
- `notes/roadmap.md` — mark M3 done; set **Current phase → M4**
- `notes/m3-execution-plan.md` — tick final `[d]` and `[v]` DoD boxes
- `notes/retros/m3-retro.md` (new) — mirror
  `notes/retros/m2-retro.md` format

### Closure gate — production browser walk (Wave 5)

Walk the full M3 golden path on **https://travelston.com** at 375×812
via MCP-driven Playwright. Authenticated flow:

1. Sign in as `ripcity352@gmail.com` (real magic link from Gmail)
2. `/trips/new` — create a trip
3. `/trips/<id>/itinerary` — add 3 items (event / lodging / meal)
4. Assign lodging room
5. `/trips/<id>/arrivals` — add a flight leg
6. `/trips/<id>/announcements` — post + confirm Realtime delivery
   in a second tab
7. `/trips/<id>/invites` — mint + copy link
8. `/trips/<id>/roster` — vCard download + Copy-all-numbers

**8 screenshots** embedded in the closure PR body. **No console
errors** on any route.

## Human step still pending (from Wave 0c)

**Supabase Dashboard → Authentication → Email Templates → Magic Link**

Swap `{{ .ConfirmationURL }}` for
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`.

Until done, new magic links still use the PKCE format. The callback
handler accepts both via the backward-compat branch, but **cross-device
clicks fail until the dashboard flip**. PR #144 body has the exact
template change. Surface this to the user at session start as a
reminder; do not block on it for Wave 3/4 implementation work.

## Load-bearing overrides (every wave)

From `notes/m3-execution-plan.md` "Constraints" + M2 retro §5–§6:

- **A.** Real-browser smoke @375px on the Vercel preview before
  merging **each** wave PR. Paste screenshots in PR body under
  `## Preview smoke (375px)`. CI green ≠ feature works.
- **B.** Auth fixture (#120) is already on `main`; authed e2e specs
  use it via `tests/fixtures/auth.ts`. No bespoke login flows.
- **C.** Tests live in `lib/`, `components/`, `tests/unit/` **only**.
  Override C gate before merge:
  `grep -rEn "describe\(|test\(|it\(" app/` must return zero
  (vitest excludes `app/` from the test glob).
- **D.** `security-reviewer` + `code-reviewer` dispatched in
  **parallel** from PR open (single message, two `Agent` calls).
  One consolidated fix-up round.
- **E.** DoD has two axes: `[d]` declared (CI green + reviewer
  approved) and `[v]` verified (exercised on travelston.com at
  375px). `[v]` is closure-only.
- **F.** No inline JSX leaf literals — every UI string sourced from
  `lib/copy/empty-states.ts`, `lib/copy/errors.ts`, or the existing
  `M3_UI_STRINGS` palette.
- **G.** `app/page.tsx` ownership rule (Wave 5 only): update or
  write an explicit kept-as-is ADR entry.

Plus the always-on rules from `CLAUDE.md`:

- DB access through `lib/db/` **only**; mutations via Server Actions
  in `lib/actions/`; Server Components by default
- Idempotency keys required on every mutation; per-table scope per
  the ADR in `notes/decisions.md`
- Tap targets ≥44px (Apple HIG) → `h-11` minimum on chips/buttons
- Currency siblings on money fields (none in Waves 3–5 scope)
- Visibility column defaults declared in the migration, not patched

## Dispatch style (proven in prior session)

- Each wave branch gets its **own git worktree** under
  `/tmp/m3-wave-<n>` via `git worktree add` to keep the main working
  tree clean across background agents. Worktrees prevent the
  `git checkout` collision that occurs when multiple background
  agents share one working tree.
- Use the `tdd-guide` agent for implementation
  (RED → GREEN → REFACTOR).
- Use `gh pr merge --squash --delete-branch` after CI green +
  `code-reviewer` approval (plus `security-reviewer` approval on
  auth / data / money-touching PRs).
- Branch protection often returns `BLOCKED` on stale branches —
  run `gh pr update-branch <num>` then re-merge.

## Pre-authorized actions (unchanged across sessions)

- Open PRs from `feat/*` | `fix/*` | `chore/*` branches
- Squash-merge after CI + `code-reviewer` approval
- `gh pr update-branch`; `git rebase origin/main` +
  `git push --force-with-lease` on `feat/*` only
- **NEVER** force-push `main`
- **NEVER** merge without `code-reviewer` approval even if CI green
- **NEVER** skip hooks (`--no-verify`) or bypass signing
- **NEVER** add a new npm dependency without surfacing and asking

## Hard stop conditions

Surface state and ask the user. Any one of:

- 150 turns elapsed
- 2 consecutive wave-gate failures
- Migration ordering ambiguity surfaces
- New dependency request

## Read order (turn 1)

1. `CLAUDE.md`
2. **This file** (`notes/m3-finish.md`)
3. `notes/m3-execution-plan.md` (full plan, scope source of truth)
4. `notes/retros/m2-retro.md` §5–§6 (load-bearing process overrides)
5. `notes/deployment-readiness.md` (env + dashboard ownership)
6. `supabase/migrations/20260520052357_m3_itinerary_announcements.sql`
   (Wave 1 schema reality)
7. `lib/db/types.ts` + `lib/actions/itinerary.ts` +
   `lib/actions/announcements.ts` (substrate Waves 3+ consume)
8. `notes/research/persona-best-man.md`,
   `notes/research/persona-edge-attendees.md`,
   `notes/research/ux-design-principles.md` (voice + persona
   pressure-test for new UI surfaces)
9. `notes/killed-and-deferred.md` (don't re-propose what was cut)
10. `notes/decisions.md` (top 20 — M2 closure entries + per-table
    idempotency ADR)
