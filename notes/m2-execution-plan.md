# M2 Execution Plan — Trip is real

> Dated 2026-05-19. Structured for a `/goal`-driven, subagent-parallel
> push. Mirrors `m1-execution-plan.md` shape. The goal loop reads this
> file on every turn — keep it terse and verifiable. Update the DoD
> checkboxes as work lands.
>
> Source of scope: `notes/roadmap.md` §M2 + ADRs in `notes/decisions.md`
> 2026-05-19 block. M2 GitHub issues: #71 (auth), #72 (trip-create), #73
> (invite), #74 (RSVP), #75 (celebrant-weighted poll), #76 (PulsePoll).

## Constraints (re-read every wave)

- **No push to `main`.** Every wave produces feature branches + PRs.
  Claude opens PRs and (post-CI green + code-reviewer pass) merges via
  `gh pr merge --squash --delete-branch`. Pre-authorized by /goal directive.
- **Branch protection enforced.** Always rebase + `gh pr update-branch`
  when a sibling PR has landed before merging.
- **`co_organizer` enum + `accept_invite()` SECURITY DEFINER ship in
  Wave 2a's migration** (one timestamped file under `supabase/migrations/`).
- **RLS policies live in the same migration as the table.**
- **`/lib/db/types.ts` must update in the same PR as the migration**
  (hand-rolled types policy, `notes/database-workflow.md`).
- **New deps need a callout in the PR body** (project rule). None expected
  in M2 — Realtime ships via `@supabase/supabase-js` already installed.
- **No direct DB access in components.** Everything routes through
  `/lib/db/` for reads and `/lib/actions/` for writes.
- **Idempotency on every mutation server action** — accept a
  client-generated `idempotency_key`. Per-table unique scope per
  `notes/database-workflow.md`.
- **Microcopy review checklist on every UI PR** (PR template item).
  Every string passes "would you say this at a pre-trip dinner?".
- **No same-file collisions across parallel PRs.** Every parallel agent
  claims its file paths explicitly in its wave row below. Test-file
  claims are listed inline — *no agent writes to a test file claimed
  by another agent in the same wave*. Cross-wave file overlap is
  permitted **only** when the later wave is sequential-gated on the
  earlier wave merging first (e.g., Wave 2b edits the dashboard page
  Wave 2a creates — Wave 2b cannot dispatch until 2a is merged into
  `main` and `git pull` is clean).
- **`.env.example`** if touched — agents append at the bottom only,
  never modify existing lines (M1 learning).

## Schema reality check (state at M2 start)

Already on `main` from M1 (`0001_init.sql` + `20260519123255_m1_foundation.sql`):

- `trips`, `trip_members`, `invites`, `availability`, `announcements`,
  `itinerary_items`, `expenses`, `expense_splits`, `trip_member_days`
- `trip_role` enum = `('organizer','attendee')` — **needs `co_organizer`**
- `trip_kind` enum = `('bachelor')`
- `trip_visibility` enum = `('everyone','organizers_only','hide_from_celebrant','custom')`
- `is_celebrant boolean` on `trip_members` + partial unique
- `is_trip_member()` / `is_trip_organizer()` SECURITY DEFINER helpers
- `trip_members_visible_rsvp(viewer_id)` view (declining-whispers source)
- `invites(token uuid pk, trip_id, created_by, expires_at, uses_left)` — table exists; `accept_invite()` function does NOT

Gaps M2 fills:

1. `co_organizer` enum value + `is_trip_organizer()` update
2. `accept_invite(p_token uuid)` SECURITY DEFINER function
3. `idempotency_key` on `trip_members` + partial unique for accept_invite replay safety
4. Three new tables for the celebrant-weighted date poll
5. RLS for the date-poll tables (same migration)

---

## Wave 0 — Bootstrap (single PR, sequential)

One small PR: `chore/m2-bootstrap`. Foundational changes the parallel
wave depends on. Already done locally; needs PR.

**Touches:**
- `.gitignore` — add `.claude/worktrees/` (agent scratch)
- `eslint.config.mjs` — add `.claude/**` to globalIgnores (was failing
  lint on leftover agent worktree `.next/` artifacts)
- `notes/m2-execution-plan.md` — this file
- `components/ui/{badge,separator}.tsx` — newly scaffolded. M1 already
  shipped `button, input, label, card, avatar, dropdown-menu`. The
  shadcn `form` primitive is **not** in the `base-nova` registry and
  is intentionally not added — Wave 1a uses `react-hook-form` + `zod`
  directly with `<Input>` / `<Label>` / `<Button>` primitives, which
  is the same wiring under the hood.

**Verification gate:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm dlx supabase db reset && pnpm build
```
All pass before Wave 1 dispatches.

**Out of scope for Wave 0:** no schema changes (those land in Wave 2a),
no new pages, no copy additions (those are Wave 1c).

---

## Wave 1 — Parallel UI primitives (2 agents, 2 PRs)

Dispatch via `superpowers:dispatching-parallel-agents`. Each row is a
separate subagent on its own branch + isolated worktree + own PR.
The M2 copy keys (`trips_mine`, `invites_for_trip`, `auth_failed`,
`auth_link_sent`, `invite_expired`, `invite_exhausted`,
`invite_not_found`, `trip_create_failed`, `rsvp_save_failed`) are
**already in `lib/copy/{empty-states,errors}.ts` as of Wave 0** — both
agents read them, neither writes to those files.

| ID | Issue | Branch | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **1a** | #71 | `feat/m2-login-page` | `app/login/page.tsx`, `app/login/_form.tsx`, `app/login/actions.ts` (requestMagicLink server action), `app/auth/callback/route.ts` (error-path polish using `auth_failed` key) | `app/login/__tests__/login-form.test.tsx`, `e2e/login-magic-link.spec.ts` | low |
| **1b** | — | `feat/m2-dashboard-shell` | `app/(authed)/layout.tsx` (new route group), `components/trip/header.tsx` (avatar + sign-out), `lib/actions/auth.ts` (signOut), `app/trips/page.tsx` (list-my-trips index, minimal — uses `trips_mine` empty state) | `components/trip/__tests__/header.test.tsx`, `lib/actions/__tests__/auth.test.ts` | low |

**Coordination rule:** zero file overlap. 1a owns `app/login/**` +
auth-callback error polish. 1b owns `app/(authed)/**` + `app/trips/page.tsx`
+ `components/trip/header.tsx` + `lib/actions/auth.ts`. Neither
touches `lib/copy/**` — copy palettes are read-only for Wave 1.

**Each agent's PR must:**
- Pass: `pnpm typecheck && pnpm lint && pnpm test`
- Include a `@375px` mobile screenshot in the PR body (M2 mobile-first
  is real for the first time)
- Pull a `code-reviewer` agent review before merge
- Pass the microcopy voice test on every new string

**Verification gate after Wave 1:**
```
# Locally, after each PR merges to main:
git checkout main && git pull && pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
gh pr checks <number>   # green on every still-open PR
```

If sibling PR conflicts on `pnpm-lock.yaml` after a merge:
```
git checkout feat/m2-<sibling>
git fetch origin main && git rebase origin/main
git checkout --theirs pnpm-lock.yaml && pnpm install --lockfile-only
git add pnpm-lock.yaml && git rebase --continue
git log --oneline -3   # CONFIRM HEAD is the rebased commit
git push --force-with-lease origin HEAD:feat/m2-<sibling>
```

---

## Wave 2a — Trip creation + invite flow (one PR, sequential agents)

Dispatch order: `architect` (sign off on accept_invite atomicity +
membership-row insertion semantics) → `tdd-guide` → `security-reviewer`
→ `code-reviewer`. Sequential, not parallel.

Single branch: `feat/m2-trips-and-invites`. Single PR. Closes #72 + #73.

**Migration:** `<timestamp>_m2_trips_and_invites.sql`

Author order inside the SQL (dependency-correct):

1. `alter type trip_role add value if not exists 'co_organizer'`
2. `create or replace function public.is_trip_organizer(p_trip_id uuid) ...`
   — return true for either `organizer` or `co_organizer`
3. `alter table public.trip_members add column idempotency_key uuid` +
   partial unique `(trip_id, idempotency_key) where idempotency_key is not null`
4. `create function public.accept_invite(p_token uuid, p_idempotency_key uuid)`
   `returns uuid security definer ...`
   - Locks invite row; rejects if expired or `uses_left = 0`
   - Inserts `trip_members` row (role=`attendee`, user_id=auth.uid(),
     idempotency_key=p_idempotency_key) — on conflict returns existing
   - Decrements `uses_left` if non-null
   - Returns `trip_members.id`
5. `create function public.invite_preview(p_token uuid)
   returns table(trip_name text, starts_at timestamptz, ends_at timestamptz, host_display_name text, attendee_count_bucket text)
   security definer stable` — for logged-out preview; locks down columns
   exposed to anonymous callers (no celebrant flag, no member emails).
   **`attendee_count_bucket` is bucketed** (`'just-getting-started'`
   for 0-1, `'small-crew'` for 2-5, `'full-house'` for 6-15,
   `'big-group'` for 15+) to prevent the raw integer from acting as an
   enumeration oracle when a single-use invite is forwarded.

**Companion edits in the same PR:**

- `lib/db/types.ts` — add `co_organizer` to `TripRole`; add `Invite`
  fields already present; export `InvitePreview` type
- `lib/db/trips.ts` — extend `createTrip` to insert organizer
  membership in the same transaction (RPC, not two queries)
- `lib/db/invites.ts` (new) — `getInvitePreview(token)` calls the
  SECURITY DEFINER fn; `getTripInvites(tripId)` for organizer list
- `lib/actions/trips.ts` (new) — `createTrip(input, idempotencyKey)`
  server action; zod-validated; rate-limited via existing
  `lib/rate-limit`
- `lib/actions/invites.ts` (new) — `createInvite`, `acceptInvite`,
  `revokeInvite` server actions; idempotency on accept
- `app/trips/new/page.tsx` (new) — form: name, optional dates, optional
  vibe_tags. Creator becomes `organizer`. **Creator is NOT
  celebrant** (M2 DoD) — celebrant flag is set in a separate step
  (later milestone or organizer toggle, not in this wave).
- `app/trips/[tripId]/page.tsx` (new) — dashboard skeleton: trip name,
  dates, invite-link area, placeholder for counts (RSVP wiring in 2b)
- `app/invite/[token]/page.tsx` (new) — **logged-out preview**: trip
  name, dates, host display name, attendee count. "Accept" CTA routes
  to `/login?next=/invite/<token>/accept` if unauthenticated; on
  callback the accept handler invokes `acceptInvite` then redirects to
  `/trips/<tripId>`.
- `app/invite/[token]/accept/route.ts` (new) — POST/GET handler that
  calls `acceptInvite` server action with an idempotency key derived
  from `(auth.uid(), token)` so double-tap is a no-op.

**Test files claimed (no overlap with M1's `lib/db/__tests__/trips.test.ts`):**

- `lib/db/__tests__/invites.test.ts`
- `lib/db/__tests__/trips.test.ts` — **edit only**, append new tests
  for the organizer-membership-insertion path. Do not rewrite.
- `lib/actions/__tests__/trips.test.ts`
- `lib/actions/__tests__/invites.test.ts`
- `e2e/invite-flow.spec.ts` (logged-out preview → login → accept → redirect)

**Verification gate after Wave 2a:**
```
pnpm dlx supabase db reset           # clean apply
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm exec playwright test --project=mobile-safari e2e/invite-flow.spec.ts
# Manual RLS smoke:
#   - Anonymous: GET invite_preview by token works; SELECT on invites table denied
#   - Non-member: accept_invite consumes a use; trip_member row appears
#   - Organizer: createInvite works; non-organizer denied
#   - Replay accept_invite with same idempotency_key: no extra row, no extra decrement
```

**Risk: HIGH.** `accept_invite` is the load-bearing atomic operation —
must lock-then-update-then-insert under a single transaction.
`security-reviewer` agent specifically reviews:
- No leaked PII in `invite_preview` (no emails, no phones)
- Rate-limit applied to acceptInvite server action
- `uses_left` decrement cannot underflow
- Idempotent replay is truly idempotent (no row duplication)

---

## Wave 2b — RSVP UI + dashboard counts (one PR, sequential agents)

Runs **after** Wave 2a merges. Same agent chain: `tdd-guide` →
`security-reviewer` → `code-reviewer`.

Single branch: `feat/m2-rsvp`. Single PR. Closes #74.

**No migration in this wave** — `trip_members.rsvp_status` already
exists; trip_member_days auto-seed trigger already lives in M1
foundation.

**Touches:**

- `lib/db/rsvp.ts` (new) — `getRsvpCountsForTrip(tripId)` returns
  `{ going, maybe, invited }` from `trip_members_visible_rsvp` view
- `lib/actions/rsvp.ts` (new) — `setRsvp(tripId, status, idempotencyKey)`
  server action; updates `trip_members.rsvp_status` where
  `user_id = auth.uid()`; idempotency on `(trip_id, user_id,
  idempotency_key)` — strictly user-scoped per ADR
- `components/trip/rsvp-toggle.tsx` (new) — client component, 3-state
  going/maybe/declined chips; uses optimistic local state with
  rollback on error
- `app/trips/[tripId]/page.tsx` — **edit only** — wire glanceable
  count + `<RsvpToggle>` into the dashboard skeleton from Wave 2a

**Glanceable-count rule:** "3 going, 1 maybe, 4 invited" — NEVER
"3 going, 2 declined" (declining whispers). Source is
`trip_members_visible_rsvp(viewer_id)` view; if the viewer is an
organizer they see per-name declines elsewhere (not in this wave).

**Test files claimed (no overlap with anything in 2a):**

- `lib/db/__tests__/rsvp.test.ts`
- `lib/actions/__tests__/rsvp.test.ts`
- `components/trip/__tests__/rsvp-toggle.test.tsx`
- `e2e/rsvp.spec.ts`

**Verification gate after Wave 2b:**
```
pnpm dlx supabase db reset && pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm exec playwright test --project=mobile-safari e2e/rsvp.spec.ts
# Manual: change RSVP from going → declined; refresh; count drops correctly
# Manual: declined member's name is NOT visible to non-organizer viewers
```

**Risk: MEDIUM.** Optimistic UI + rollback is the failure mode to guard;
RLS already prevents per-name decline leakage if the view is queried
correctly.

---

## Wave 3 — Celebrant-weighted date poll + PulsePoll (one PR, architect-led)

Highest design risk. Dispatch: **`architect` FIRST** to confirm the
weighting algorithm matches the ADR in `notes/decisions.md`
("Trip-date selection is celebrant-weighted (bachelor kind)") and
write the algorithm pseudocode into this plan as an appendix before
any code is written. Then `tdd-guide` → `security-reviewer` →
`code-reviewer`.

Single branch: `feat/m2-date-poll`. Single PR. Closes #75 + #76.

**Migration:** `<timestamp>_m2_date_poll.sql`

1. `create type public.date_poll_celebrant_mark as enum
   ('works','works-with-effort','no-go')`
2. `create table public.date_poll_candidates (
     id uuid primary key default gen_random_uuid(),
     trip_id uuid not null references trips(id) on delete cascade,
     label text not null,
     starts_on date not null,
     ends_on date not null,
     created_by uuid not null references auth.users(id),
     created_at timestamptz not null default now(),
     check (ends_on >= starts_on)
   )` + index on `trip_id`
3. `create table public.date_poll_celebrant_marks (
     candidate_id uuid primary key references date_poll_candidates(id) on delete cascade,
     mark date_poll_celebrant_mark not null,
     marked_by uuid not null references auth.users(id),
     marked_at timestamptz not null default now()
   )`
4. `create table public.date_poll_votes (
     candidate_id uuid not null references date_poll_candidates(id) on delete cascade,
     trip_member_id uuid not null references trip_members(id) on delete cascade,
     vote boolean not null,
     voted_at timestamptz not null default now(),
     idempotency_key uuid,
     primary key (candidate_id, trip_member_id)
   )` + partial unique on `(candidate_id, trip_member_id, idempotency_key)
   where idempotency_key is not null`
5. RLS for all three tables in the same migration:
   - **Candidates:** read = members of trip; write = organizers (organizer + co_organizer) or celebrant
   - **Celebrant marks:** read = members; write = the celebrant only (`auth.uid() = trip_member.user_id and is_celebrant`)
   - **Votes:**
     - read = aggregate-visible to members (per-name visibility opt-in only — ADR)
     - `with check` clause **must bind `trip_member_id` to the caller**:
       `trip_member_id in (select id from trip_members where trip_id = (select trip_id from date_poll_candidates where id = candidate_id) and user_id = auth.uid())`
       — without this, any member can stuff votes on behalf of others by passing a spoofed `trip_member_id`
     - the candidate-not-vetoed gate is enforced by a separate trigger
       (RLS `with check` can't cleanly reference a sibling table)
6. Trigger `assert_candidate_not_vetoed_before_vote` on
   `date_poll_votes` INSERT/UPDATE: raise exception if the
   `date_poll_celebrant_marks.mark` for the candidate is `no-go`

**Companion edits in the same PR:**

- `lib/db/types.ts` — `DatePollCelebrantMark` enum, `DatePollCandidate`,
  `DatePollCelebrantMarkRow`, `DatePollVote`
- `lib/db/date-poll.ts` (new) — `listCandidates(tripId)`,
  `getCelebrantMarks(tripId)`, `getVoteCountsByCandidate(tripId)`
- `lib/actions/date-poll.ts` (new) — `proposeDateCandidates`,
  `setCelebrantMark`, `castDateVote` (all idempotent)
- `components/trip/pulse-poll.tsx` (new) — **reusable, aggregate-only
  default**. Supabase Realtime subscription on `date_poll_votes` for
  the candidate set. Offline behavior:
  1. Optimistic local state updates instantly
  2. If the network errors, the vote is queued locally (in-memory
     for this wave; no IndexedDB)
  3. On reconnect, reconcile queued votes against server state;
     local-wins iff `voted_at` is older than server's last touch
  Voter-opt-in per-name visibility is a prop `revealVoterNames: boolean`
  set at the call site, default `false`.
- `app/trips/[tripId]/dates/page.tsx` (new) — split view:
  - Celebrant sees: candidate list + 3-state chips (works /
    works-with-effort / no-go); their no-go vetoes vanish from
    other members' vote UI
  - Non-celebrant members see: candidates whose mark is not `no-go`,
    `<PulsePoll>` per candidate, aggregate counts only
  - Organizer-only chip in the corner to add a new candidate (max 4)

**Test files claimed:**

- `lib/db/__tests__/date-poll.test.ts`
- `lib/actions/__tests__/date-poll.test.ts`
- `components/trip/__tests__/pulse-poll.test.tsx` (test optimistic +
  rollback + reconnect reconcile in isolation; mock the Supabase
  channel)
- `e2e/date-poll-bach.spec.ts` (organizer proposes → celebrant marks
  one no-go → non-celebrant member sees only the non-vetoed → votes)

**Verification gate after Wave 3:**
```
# Gate-0: Appendix A must be populated. If still "(populated at Wave 3 start)",
# the architect agent has not signed off — Wave 3 cannot merge.
grep -q "(populated at Wave 3 start)" notes/m2-execution-plan.md && echo BLOCK_MERGE && exit 1

pnpm dlx supabase db reset && pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm exec playwright test --project=mobile-safari e2e/date-poll-bach.spec.ts
# Manual: with two browser windows (one celebrant, one member), prove
# realtime: celebrant marks no-go → member's UI removes that candidate
# Manual: airplane-mode the member browser, cast a vote, restore
# network, prove the vote lands
# Manual security: try POSTing a vote with someone else's trip_member_id
# in the request body — must 403 (the with-check clause does the work)
```

**Risk: HIGH.** Realtime + offline reconcile + the no-go-veto gate are
each independent failure modes. `architect` agent signs off on the
weighting + reconcile algorithm *before any code is written*; that
sign-off is appended to this plan as Appendix A.

---

## Wave 4 — Verification + DoD wiring (one PR)

Single branch: `chore/m2-done`. Single small PR.

**Touches:**

- `notes/decisions.md` — append "M2 — Trip is real — milestone closed"
  entry at the top, with the load-bearing decisions made *during*
  execution (anything that surprised us; mirrors M1's pattern)
- `notes/roadmap.md` — mark M2 done, update **Current phase** to M3
- `notes/m2-execution-plan.md` (this file) — final DoD checkboxes
  ticked
- `e2e/m2-golden-path.spec.ts` (new) — full loop on `mobile-safari`
  project: load `/` → login (magic-link mocked via Mailpit-equivalent
  fixture) → /trips/new → invite → /invite/<token> logged-out preview
  → accept → RSVP → set celebrant-weighted poll vote

**Final M2 gate:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dlx supabase db reset
pnpm exec playwright test --project=mobile-safari
pnpm test:visual    # only if visual baselines exist for new components
gh issue list --milestone "M2 — Trip is real" --json state -q '[.[] | select(.state=="OPEN")] | length'   # → 0
```

---

## M2 DoD checklist (the source of truth — check as work lands)

- [x] Magic-link auth at `/login` + `/auth/callback` (#71) — #102
- [x] `/trips/new` creates a trip with `kind = 'bachelor'`; creator is
      organizer, **not celebrant** (#72) — #105
- [x] `/invite/[token]` shows a logged-out preview before forcing
      login; accept decrements `uses_left` via SECURITY DEFINER (#73) — #105
- [x] Trip dashboard shows trip name, dates, invite link, glanceable
      confirmed-count ("3 going, 1 maybe, 4 invited" — never per-name
      for declines) — #109
- [x] 3-state RSVP UI (going / maybe / declined) on dashboard (#74) — #109
- [x] `co_organizer` enum value; `is_trip_organizer()` returns true
      for both. **No spend cap yet** (deferred to M5 — do NOT add a
      cap column or check; roadmap explicitly defers) — #105
- [x] Trip date selection — celebrant-weighted for bach kind: 2–4
      candidate windows, celebrant marks works /
      works-with-effort / no-go, others vote only on non-vetoed (#75) — #114
- [x] Reusable `<PulsePoll>` component with Realtime, aggregate-only
      default; per-name visibility opt-in by voter (#76) — #114.
      Note: the `revealVoterNames` prop is reserved on the component
      contract but the user-facing toggle UI ships in M5 (no consumer
      surface in M2 needs it).
- [x] Header with avatar + sign-out — #103
- [x] Every M2 UI string sourced from `lib/copy/*` palettes; PR
      template microcopy review enforced
- [~] Mobile-Safari mobile-first verification on every screen —
      **partial**. Anonymous routes (`/`, `/login`, `/auth/callback`,
      `/invite/[token]` preview, `/trips/<slug>` unauthenticated bounce,
      `/trips/<slug>/dates` unauthenticated bounce) verified via the
      `mobile-safari` Playwright project at 375x812. Authenticated
      screens (RSVP toggle, date-poll multi-actor flow, full create
      loop) are deferred behind the storage-state auth-fixture gap
      tracked as a Wave-4 meta follow-up (see closure ADR).
- [~] 375px screenshot evidence on every UI PR — **partial** for the
      same reason. Anon surfaces have evidence; authenticated screens
      were exercised in unit + RTL tests in lieu of mobile-safari
      screenshots until the auth fixture lands.
- [~] Logged-in user can complete the full loop on mobile Safari
      preview — **partial**. Manually verified on desktop Safari
      2026-05-19 PM (post-#125 + #134 + Resend SMTP setup):
      `/login` → magic-link email arrives → click link → `/trips`
      lands → `/trips/new` CTA works. Mobile-Safari-at-375px portion
      of this DoD line is deferred behind the auth-fixture blocker
      (#120); stub spec already lives in `e2e/m2-golden-path.spec.ts`
      as `test.fixme(...)` ready for when the fixture lands.

---

## Explicitly out of scope (do not build in M2)

These were killed or deferred per `notes/killed-and-deferred.md` /
`notes/roadmap.md` §M2. Re-proposing any of these in an M2 PR is a
review-blocker. The list exists to prevent scope creep mid-wave (M1
learning material).

- Fear List 3-card swipe ceremony (#29 killed)
- Crew Cards / member directory with "how do you know" field (#31 killed)
- Dietary as a profile column on `trip_members` (moved to M3 as per-item flag)
- OG share cards (M5)
- Co-organizer **spend cap** (deferred to M5)
- Per-name "going / declining" visibility on poll components by
  default — must be voter-opt-in
- Push notification preferences settings screen
- Tooltips / onboarding banners / progress bars / completion scores
- Required fields with asterisks
- Notification outbox / dispatcher (#33 killed)

---

## M1 learnings applied to M2

1. **Dependency PRs cause `pnpm-lock.yaml` conflicts on subsequent
   merges.** Rebase sibling onto just-merged main: `git checkout
   --theirs pnpm-lock.yaml && pnpm install --lockfile-only` then
   force-push.
2. **Before force-push, ALWAYS** `git log --oneline -3` to confirm HEAD
   is the rebased commit. Pushing the wrong SHA auto-closes the PR.
3. **`.env.example` is appended-to by multiple agents** — each agent
   appends at the bottom only.
4. **Dispatch a `code-reviewer` agent against every Wave 2+ PR before
   merge** (M1 caught 3 HIGH findings via this).
5. **When `gh pr merge` says "head branch is not up to date with the
   base branch", run `gh pr update-branch <num>` first.**
6. **`.claude/worktrees/` stays locked until session end** — leave
   them. Added to `.gitignore` + `.eslintignore` in Wave 0 so they
   stop polluting local lint.
7. **Supabase MCP + Vercel MCP** should be authenticated at session
   start via `/mcp` if not already.
8. **Invoke `supabase:supabase` skill for any DB task; pair
   `security-reviewer` + `code-reviewer` on every server action.**

---

## Appendix A — Celebrant-weighted poll algorithm (architect-signed)

> Architect-signed Wave 3 contract for the celebrant-weighted date poll
> + the reusable `<PulsePoll>` Realtime component. Pseudocode +
> invariants + RLS + API surface. Aligned with the
> `notes/decisions.md` 2026-05-19 entries on celebrant-weighted dates,
> declining-whispers (aggregate-only voting), per-voter opt-in, and
> the unified trip_members idempotency-key scope.

### A.1 Invariants

Constraints that must hold across the entire system (schema-enforced
where possible; app-level checks only when SQL can't express them):

1. **At most one celebrant per trip** — enforced by the M1
   `trip_members_one_celebrant` partial unique index.
2. **Organizers (`organizer` or `co_organizer`) and the celebrant can
   propose candidates.** Maximum 4 active candidates per trip — enforced
   at the action layer (cheap, no migration cost; a later wave can
   promote to a check function if needed).
3. **Only the celebrant can set celebrant marks** — RLS WITH CHECK
   binds `auth.uid()` to a `trip_members` row with `is_celebrant = true`
   on the candidate's trip.
4. **Members vote only on candidates whose celebrant mark is not
   `no-go`** — defended in three places, layered:
   1. UI filters `no-go` candidates out of the member view-model
   2. Server action mirrors the filter as defense-in-depth
   3. SQL trigger `assert_candidate_not_vetoed_before_vote` raises
      P0001 if anyone tries to bypass the upper layers
5. **Vote idempotency.** Same `(candidate_id, trip_member_id,
   idempotency_key)` tuple is a no-op on replay — partial unique index.
   Composite PK `(candidate_id, trip_member_id)` guarantees one vote
   per member per candidate regardless of replay; the idempotency
   surface is purely for the network-flake retry path.
6. **Aggregate-only voting by default.** `date_poll_votes` reads to
   members surface vote *counts*, never voter names. The
   `vote_visibility` per-voter-opt-in column is reserved for a future
   wave; Wave 3 ships the aggregate path only.
7. **Vote stuffing is structurally impossible.** The `date_poll_votes`
   INSERT/UPDATE policies' WITH CHECK binds `trip_member_id` to a
   `trip_members` row owned by `auth.uid()` on the candidate's trip.
   Without this clause, any member could spoof a peer's
   `trip_member_id`; the Wave 2a security review (H1 finding) flagged
   this pattern explicitly.

### A.2 Weighting algorithm (pseudocode)

The algorithm only *ranks* candidates — it never auto-decides. The
organizer manually locks in the winner (stretch action
`lockInCandidate`).

```
function buildDatePollViewModel(candidates, marks, voteCounts, myVotes):
  // Aggregate-only by design. Per-voter names are not threaded through
  // this surface.
  let viewModel = []
  for candidate in candidates:
    let mark = marks[candidate.id]            // works | works-with-effort | no-go | null
    viewModel.push({
      candidate,
      mark,
      yes_votes: voteCounts[candidate.id]?.yes ?? 0,
      no_votes:  voteCounts[candidate.id]?.no  ?? 0,
      my_vote:   myVotes[candidate.id] ?? null,
    })
  return viewModel

function filterForMemberView(viewModel):
  // Members never see vetoed candidates — keeps the celebrant's hard
  // pass invisible to peers (avoids social pressure on the celebrant).
  return viewModel.filter(row => row.mark !== 'no-go')

function rankCandidates(viewModel):
  // Stable sort by: (a) celebrant mark priority, (b) yes-vote count
  // descending, (c) candidate.created_at ascending (oldest first wins
  // ties — proposers don't get penalized for moving first).
  const markPriority = { 'works': 3, 'works-with-effort': 2, null: 1, 'no-go': 0 }
  return [...viewModel].sort((a, b) => {
    const dp = markPriority[b.mark] - markPriority[a.mark]
    if (dp !== 0) return dp
    const dv = b.yes_votes - a.yes_votes
    if (dv !== 0) return dv
    return a.candidate.created_at.localeCompare(b.candidate.created_at)
  })
```

Notes:

- Pure function — fully unit-testable without a DB. The ranking lives
  in TS (not SQL) so tests can pin the comparator without spinning up
  a database. The SQL layer only enforces invariants.
- `null` (unmarked) sorts above `no-go` and below explicit
  `works-with-effort` — surfaces "celebrant hasn't weighed in" with a
  voice-tested badge instead of hiding the candidate.
- Tiebreaker is `created_at ascending`, NOT `updated_at` — the proposer
  who moved first keeps the tie. Stable across re-renders.

### A.3 PulsePoll Realtime + offline reconcile

The `<PulsePoll>` component is the reusable Realtime primitive; the
date-poll page is the first consumer, but the contract holds for
future Pulse-Poll-style features (lodging vote, time-of-day poll,
etc.).

```
on mount:
  1. render `initialData` (server-side)
  2. open channel `supabase.channel(channelKey)`
  3. for each table in subscribeTableConfig:
       channel.on('postgres_changes', { event: '*', schema: 'public',
                  table, filter }, _ => refetch())
  4. channel.subscribe(status => {
       if status === 'CLOSED': mark isStale = true
       if status === 'SUBSCRIBED' after a CLOSED: refetch()
     })

on user vote:
  1. set optimistic local state immediately
  2. mint a fresh `idempotency_key = crypto.randomUUID()`
  3. send to server via castDateVoteAction
  4a. action succeeds → do NOT mutate state; the realtime broadcast
       will refresh us. Ours is one of N votes the channel sees.
  4b. action fails (network) → keep optimistic state, mark as
       "queued"; surface a small "unsynced — will retry" indicator
       at the row level.
  5. on Realtime reconnect (CLOSED → SUBSCRIBED): replay queued votes
     with the SAME idempotency_key (server-side replay is a no-op
     thanks to the partial unique index).
```

Local-wins-vs-server-wins:

- Wave 3 deliberately keeps the local cache in-memory only (no
  IndexedDB) — page reload drops queued votes. That's acceptable
  because the server idempotency check is the load-bearing guarantee:
  if the user lost their queue but the request landed once, the
  server is the source of truth. If neither landed, the user re-taps.
- A future wave can promote the queue to IndexedDB if real-world data
  shows ghost-tap loss is common.

The `voted_at`-vs-server-touch comparison is intentionally NOT
implemented at this layer — the server's partial unique on
`(candidate_id, trip_member_id, idempotency_key)` makes replay
deterministic without an explicit timestamp compare. The simpler
contract is the more durable one.

### A.4 Security & RLS

Every access path is gated by RLS in the migration; the action layer
is defense-in-depth. The full SQL is in Phase 1; the contract is:

| Table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `date_poll_candidates` | `is_trip_member(trip_id)` | INSERT/UPDATE/DELETE only for organizers (`is_trip_organizer`) or the celebrant (USING+WITH CHECK on a `trip_members` row with `is_celebrant`) |
| `date_poll_celebrant_marks` | members of the candidate's trip | only the celebrant (`auth.uid()` matches a `trip_members` row with `is_celebrant` on the candidate's trip) |
| `date_poll_votes` | members of the candidate's trip (aggregate-only enforced at app layer; per-name reserved for future opt-in) | WITH CHECK binds `trip_member_id` to caller's own `trip_members.id` on the candidate's trip — vote stuffing structurally impossible |

The trigger `assert_candidate_not_vetoed_before_vote` fires
BEFORE INSERT OR UPDATE on `date_poll_votes` and raises P0001 if the
celebrant mark for the candidate is `'no-go'`. The action layer maps
P0001 from this code path to the generic `validation_failed` ErrorKey
so a non-celebrant can't enumerate vetoed-vs-non-existent candidates
by probing the action.

### A.5 API surface

Exports from `lib/actions/date-poll.ts`. Every action returns a
discriminated union; nothing throws to the caller.

```
proposeDateCandidates(
  tripId: string,
  candidates: Array<{ label: string; starts_on: string; ends_on: string }>,
  idempotencyKey: string,
): Promise<{ ok: true; created: number } | { ok: false; errorKey }>
  - Organizer OR celebrant only (RLS gate is the authoritative check)
  - Rate-limited under CREATE_TRIP scope (organizer activity profile)
  - Validates: 1..4 candidates, ends_on >= starts_on per row,
    total active candidates <= 4 per trip (app-level pre-flight)

setCelebrantMark(
  candidateId: string,
  mark: 'works' | 'works-with-effort' | 'no-go',
  idempotencyKey: string,
): Promise<{ ok: true; mark } | { ok: false; errorKey }>
  - Celebrant only (RLS WITH CHECK enforces it)
  - Upserts the marks row by candidate_id PK
  - Rate-limited under CREATE_TRIP scope

castDateVote(
  candidateId: string,
  vote: boolean,
  idempotencyKey: string,
): Promise<{ ok: true; vote } | { ok: false; errorKey }>
  - Member only; RLS binds trip_member_id to auth.uid()
  - Rejects if candidate is `no-go` (trigger), mapped to validation_failed
  - Idempotent on (candidate_id, trip_member_id, idempotency_key)
  - Rate-limited under CAST_DATE_VOTE scope (its own bucket; drunk
    double-tap doesn't starve other actions)

lockInCandidate(candidateId: string): Promise<...>  // STRETCH
  - Organizer only
  - Sets trips.starts_at / ends_at from the candidate
  - Deferred from Wave 3 if time-boxed; see PR body
```

— architect sign-off, 2026-05-19, Wave 3.

---

## New dependencies this milestone introduces

None expected. Realtime ships via `@supabase/supabase-js` already
installed in M1. Flag any agent-introduced dep in its PR body.
