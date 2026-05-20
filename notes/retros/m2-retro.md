# M2 Retro — *"Trip is real"*

> Dated 2026-05-19 (eve), authored after the user hit two production bugs
> on first live test of the freshly-closed M2 milestone:
> 1. The magic-link login form returns `"Easy, tiger. Give it a sec and
>    try again."` on the *first* submit — a rate-limit toast — blocking
>    sign-in entirely.
> 2. `app/page.tsx` (the landing page) still reads *"M1 placeholder.
>    Auth UI and trip creation land in M2."*
>
> CI was green on every M2 PR. The user-facing feature was not.
> This retro exists because of that gap.

---

## TL;DR

M2 shipped seven PRs, all green, all reviewed. The code is excellent.
The verification was theatrical — every wave verified that the *code*
worked in the *test* environment. No wave verified that the *feature*
worked in the *production* environment. Two undisclosed bugs (one
P0, one cosmetic) made it to production behind a green CI badge.

The most important learning is short and structural: **`pnpm typecheck
&& pnpm lint && pnpm test && pnpm build` is not a verification gate. It
is a compilation gate.** The Wave 4 closure agent ticked DoD without
opening the production URL once. That hole is the entire point of this
retro.

---

## Section 1 — What shipped (objective)

**Seven PRs landed on `main`** between commits `ddd5341` and `b0f22ea`:

- **#101** — Wave 0 bootstrap: M2 plan doc, eslint ignore for
  `.claude/worktrees/`, shadcn `badge` + `separator` primitives, M2
  copy palette keys.
- **#102** — Wave 1a: magic-link login at `/login` + `/auth/callback`,
  `requestMagicLink` server action with `AUTH_MAGIC_LINK` rate-limit
  scope, `safeNext()` open-redirect guard (`lib/auth/safe-next.ts`).
  Closes #71.
- **#103** — Wave 1b: `app/(authed)/layout.tsx` route group, header
  component with avatar + sign-out, `/trips` index, `signOut` action.
- **#105** — Wave 2a: trip creation (`/trips/new`), invite flow with
  logged-out preview (`/invite/[token]`), three SECURITY DEFINER
  functions (`accept_invite`, `invite_preview`,
  `create_trip_with_organizer`), `co_organizer` enum value, idempotency
  on `trip_members`. Closes #72, #73.
- **#109** — Wave 2b: three-state RSVP UI, glanceable count from
  `trip_members_visible_rsvp` view, idempotency-scope re-migration
  to `(trip_id, user_id, idempotency_key)`. Closes #74.
- **#114** — Wave 3: celebrant-weighted date poll, reusable
  `<PulsePoll>` Realtime component, `assert_candidate_not_vetoed_before_vote`
  trigger, `date_poll_*` tables with full RLS. Closes #75, #76.
- **#119** — Wave 4: closure docs (DoD ticks, decisions.md "M2 closed"
  entry, roadmap mark-done), `e2e/m2-golden-path.spec.ts` stub with
  `test.fixme` placeholders.
- **#123** — Roadmap follow-up: mark M1 + M2 done, set "Current phase"
  to M3. Closes #99.

**Six spec issues closed** (#71–#76 — the canonical M2 scope).
**Three SECURITY DEFINER functions** added (`accept_invite`,
`invite_preview`, `create_trip_with_organizer`).
**Four M2 migrations** under `supabase/migrations/`:
`20260519191412_m2_trip_role_co_organizer.sql`,
`20260519191413_m2_trips_and_invites.sql`,
`20260519202859_m2_rsvp_idempotency_scope.sql`,
`20260519204313_m2_date_poll.sql`.
**~155 unit test files** in the tree; **7 Playwright e2e specs**
(`auth-callback`, `home`, `login-magic-link`, `invite-flow`, `rsvp`,
`date-poll-bach`, `m2-golden-path`) with **5 `test.fixme` markers**
deferring authenticated multi-actor coverage behind the storage-state
auth fixture.

By the issues-and-PRs scoreboard, M2 was clean.

---

## Section 2 — What slipped (honest)

### S1. Production rate-limit fail-closed shim — **CRITICAL (P0)**

`lib/rate-limit/index.ts` exposes a fail-closed in-memory shim when
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent. In
production with neither var set, *every* call to `rateLimitedAction`
returns `success: false` immediately, the action throws
`RateLimitError`, and the caller maps it to `errorKey: "rate_limit"` →
*"Easy, tiger. Give it a sec and try again."* The user sees this on
**their first ever click**.

This is doubly bad because:

1. Sign-in is gated behind `AUTH_MAGIC_LINK` rate limiting (added in
   #102 as a security-reviewer fix-up). So the *very entrypoint* of
   the app is broken when env vars are missing.
2. The shim was **designed this way on purpose** — the docstring
   (lines 16–24) explicitly says "every `.limit()` call FAILS CLOSED
   so the deploy will surface rate-limit errors on every guarded
   path, which is the loud signal we want." This is reasonable as
   defensive infra. It is unreasonable as a behavior nobody flagged
   in any wave's PR body or in the closure ADR. Loud signals are
   only useful if a human is listening.

**Why CI missed it:** `NODE_ENV !== "production"` flips the shim to
always-allow in CI and in `pnpm build`. The fail-closed branch is
*unreachable in any automated environment we run*. There is no test
that pins production-mode shim behavior, and even if there were, it
wouldn't have caught this — the bug is "env vars must exist in
production", not "code is wrong."

**Where it lives now:** Not yet filed as an issue. Should be the very
next issue created (Section 3 below).

### S2. Landing page never updated — Cosmetic but trust-eroding

`app/page.tsx` still reads:

```
M1 placeholder. Auth UI and trip creation land in M2.
```

It was updated in #98 from "Goal 1" → "M1" taxonomy but never
revisited during M2 itself. No Wave 1a/1b/2a/2b/3/4 owned the file.
The Wave 4 closure agent ticked the roadmap entry but never opened
`/` in a browser. PR #98 narrowly updated copy *from old to new
placeholder*, which made it look "freshly touched" in `git blame`
and likely contributed to no agent picking it up again.

**Why CI missed it:** typecheck/lint/test/build never assert page
content. Even a snapshot would have only caught "did this string
change", not "is this string current with reality."

**Where it lives now:** Not yet filed. Suggested issue in Section 3.

### S3. Authenticated mobile-Safari e2e — auth-fixture blocker (#120)

5 `test.fixme()` markers across `rsvp.spec.ts`, `date-poll-bach.spec.ts`,
and `m2-golden-path.spec.ts` defer the full create-trip → invite → accept
→ RSVP → vote flow behind a missing Playwright storage-state fixture.
The DoD line "Logged-in user can complete the full loop on mobile
Safari preview" is unchecked.

**Where it lives now:** #120, milestoned M2 but post-closure. Filed
during Wave 3; should have been Wave 0.

### S4. Persimmon focus ring (#121)

Design-system token never wired to actual `:focus-visible` styles.
Unmilestoned. Spec gap — the design system token exists, the
component application doesn't.

### S5. Login form voice (#122)

Inline literal `"Email"` label and `"Send the link"` button bypassed
the copy palette. Voice review on the closure pass would have flagged
"Sign in" appearing somewhere (it doesn't — the button says "Send the
link" — but the form's overall framing wasn't run through the *would
you say this at a pre-trip dinner?* test). Tracked but not in M2.

### S6. Deep-link preservation across login (#104)

Documented in the closure ADR as deferred: the `x-invoke-path` header
sniff was unreliable in Next.js 16 App Router. So if a user clicks an
invite link while logged out, gets bounced to `/login`, and signs in,
they land on `/trips` instead of the invite they were trying to view.
Real-user impact: medium-high — this is the natural first-visit flow.

### S7. Trip-local timezone for dates (#108)

Dates render in the browser's local timezone, not the trip's. East-coast
bachelor party shown to a west-coast attendee will display 3 hours
shifted. The fix is small but real-trip relevant.

### S8. Invite-issuance UI

Per closure ADR: "Full invite-management UI (currently a placeholder
copy block; tokens minted via DB)". An organizer can't actually create
an invite from the UI yet. They have to insert one via SQL. This is
listed as out of scope and deferred to M5, but it makes the M2 DoD
("Trip dashboard shows trip name, dates, **invite link**") technically
unmet — there's no UI to *create* the invite link the dashboard would
display.

### S9. 375px screenshot evidence — partial

Per DoD: "375px screenshot evidence on every UI PR" — marked `[~]`
partial. Authenticated screens were exercised in RTL tests instead.
Same root cause as S3 (auth fixture).

### Slips not in the closure ADR

- **No documentation of the env-var production requirements anywhere**
  except buried in `lib/rate-limit/index.ts` source comments. No
  human-facing "before you deploy to prod, set these env vars" list.
- **No smoke that actually hits the live preview URL** as part of
  the verification gate. Every wave's gate is a local `pnpm`
  invocation.
- **The Wave 4 closure spec is a closure spec by metadata only.** The
  `m2-golden-path.spec.ts` file contains 4 `test()` calls, of which 2
  are real (anonymous bounce/preview) and 2 are `test.fixme(...)`. The
  authenticated half of the golden path was never run by anyone.

---

## Section 3 — Missed items (gaps not yet filed)

Each of the following should be filed as a new issue. Listing the
proposed shape rather than creating; the user runs `gh issue create`.

### NEW-1: fix(infra): rate-limit shim must not fail-closed in production deploys *(P0)*

- **Body:** When `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
  are absent in production, every `rateLimitedAction` call throws
  `RateLimitError` on the first try, blocking sign-in entirely.
  Two complementary fixes:
  1. **Loudly fail at boot in production** rather than per-request:
     if the env vars are missing on a production deploy, throw at the
     module top-level when first imported so the deploy *crashes*
     visibly instead of degrading silently. (Current shim defends
     cold-start at the cost of degrading every request — wrong
     tradeoff.)
  2. **Or fall back to in-memory always-allow** with a one-time
     `console.error` so the deploy stays up and rate-limiting is
     advisory until the operator wires Upstash.
  Decide on the tradeoff. Add a deploy-readiness checklist that
  includes these env vars.
- **Labels:** `bug`, `priority:p0`, `security`
- **Milestone:** keep in M2 (gate to production usability)

### NEW-2: chore: update landing page (app/page.tsx) to reflect M2 — auth + trip creation are live

- **Body:** `app/page.tsx` still says "M1 placeholder. Auth UI and
  trip creation land in M2." It should now show an authed user their
  trip list or anon users a one-click sign-in CTA. Voice-test the
  copy. Add an ownership rule: any milestone closure wave must verify
  the landing page reflects current reality (or call out
  intentionally not).
- **Labels:** `bug`, `priority:p1`, `voice`
- **Milestone:** keep in M2

### NEW-3: chore(infra): deployment-readiness checklist before main merge

- **Body:** Document in `notes/decisions.md` (or a new
  `notes/deployment-readiness.md`) the *human-only* env vars that must
  be set on the Vercel project before any wave that depends on them
  merges. Today's list:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SITE_URL` (for magic-link redirect resolution —
    `lib/auth/safe-next.ts` + login action)
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - Supabase Auth redirect-URL allowlist must include the production
    domain
  Each future wave that adds a new env-var dependency appends a row
  to this list as part of its PR body.
- **Labels:** `infra`, `documentation`
- **Milestone:** M2 closure-2 (this retro is the closure-2)

### NEW-4: chore(qa): every milestone closure wave includes a real-browser smoke

- **Body:** Wave-N-closure DoD must include "open prod preview URL in
  a real browser, log in with a real email, walk the golden path."
  Not a Playwright test — a human (or an MCP-driven browser session)
  with eyes on. Captured as a sign-off line in
  `notes/m{N}-execution-plan.md`'s closure checklist.
- **Labels:** `process`, `qa`
- **Milestone:** M2 closure-2

### NEW-5: chore(infra): supabase auth redirect URL allowlist documented

- **Body:** Supabase dashboard → Authentication → URL Configuration
  must include the production domain + Vercel preview wildcard. Not
  doing so silently breaks magic-link callbacks. Add to NEW-3's
  checklist and document in `notes/database-workflow.md`.
- **Labels:** `infra`, `documentation`
- **Milestone:** M2 closure-2

### NEW-6: feat: invite-issuance UI for organizers

- **Body:** The dashboard shows the invite link area as a placeholder.
  An organizer can't actually mint an invite from the UI; the DB-only
  workflow is acceptable for an alpha but the DoD line "Trip dashboard
  shows ... invite link" is unmet without it. Surface a "Mint invite
  link" button that calls `createInvite`. Voice-test the copy.
- **Labels:** `feature`
- **Milestone:** M3 (it's a real-trip blocker but adjacent to M3 scope)

### NEW-7: test(infra): production-mode rate-limit shim regression test

- **Body:** Test pinning that in `NODE_ENV=production` with absent
  Upstash env vars, `getLimiter()` returns the shape we want (after
  NEW-1 is decided). Will block recurrence of the current bug.
- **Labels:** `test`, `infra`
- **Milestone:** M2 closure-2

### NEW-8: chore: vibecoded-bans audit of M2 surfaces against killed-and-deferred.md

- **Body:** No wave explicitly cross-checked against
  `notes/killed-and-deferred.md`. A quick audit:
  - No leaderboards, streaks, badges — clean
  - No tooltips/onboarding banners — clean
  - No mascot — clean
  - The 3-state RSVP toggle uses three chips with text + color (good,
    matches "color is never the only signal")
  - `<PulsePoll>` is aggregate-only by default, voter-opt-in deferred
    (matches the kill rule)
  - One yellow flag: the date-poll page exposes vote counts per
    candidate — verify this can't slide into a de-facto leaderboard
    on a future iteration
- **Labels:** `audit`
- **Milestone:** M2 closure-2

---

## Section 4 — Follow-up triage (13 open issues in M2)

| # | Title | Recommended | Rationale |
|---|---|---|---|
| #104 | Preserve deep link across login bounce via middleware | **KEEP IN M2** | Real-trip first-visit flow is "click invite link → bounce to login → land back on invite". Without this, every first invitee lands on `/trips` (empty) instead of the invite they were sent. |
| #106 | Drop GET handler on `/invite/[token]/accept` | **KEEP IN M2** | Security tightening; small change; one of the things a security-reviewer round caught and a follow-up was filed instead of fixed in PR. Should land before any real trip. |
| #107 | Split MINT_INVITE rate-limit scope from ACCEPT_INVITE | **MOVE TO M3** | Bucket-separation is correctness-of-abuse-defense, not a real-trip blocker. M3's invite-issuance UI (NEW-6) is the natural place to land both. |
| #108 | Render trip dates in trip-local TZ | **KEEP IN M2** | Cross-coast bachelor parties will misread dates. Cheap fix, real impact. |
| #110 | revalidatePath on setRsvpAction success | **MOVE TO M3** | The dashboard's "what's happening now" card is M3 scope. Auto-revalidation matters more once there's live content to revalidate. |
| #111 | COUNT(*) head:true for organizer declined count | **MOVE TO M5** | Perf optimization; matters at scale; trip-of-12 doesn't notice. |
| #112 | Mint deterministic test user in rsvp e2e | **KEEP IN M2** | Tests that rely on `/admin/users[0]` are brittle and silently passing. Worth fixing alongside #120. |
| #113 | Multi-row coverage for getMyRsvp narrow | **KEEP IN M2** | Same theme as #112 — test correctness gap. |
| #115 | Enforce MAX_CANDIDATES_PER_TRIP at DB layer | **MOVE TO M5** | App-layer enforcement is fine for one-organizer trips; the closure ADR explicitly accepts the race. |
| #116 | Handle TIMED_OUT in PulsePoll alongside CHANNEL_ERROR | **MOVE TO M3** | Realtime polish; matters more when M3 introduces more Realtime surfaces (announcements). |
| #117 | Scope PulsePoll test-injection seam to dev/test only | **MOVE TO M3** | Production hygiene; will surface naturally during M3 PulsePoll reuse. |
| #120 | Authenticated e2e auth fixture | **KEEP IN M2 — promote to top** | This unblocks proper verification of *every* M2 feature. It is the root cause of S3, S9, and the entire `test.fixme` cluster. Should have been Wave 0. |
| #122 | Login form voice review | **KEEP IN M2** | Microcopy is load-bearing for this app's identity. Small. |

Summary: **6 keep in M2**, **4 move to M3**, **2 move to M5**, **0
close won't-fix**. The "keep in M2" list defines the *real* M2 closure
(call it "M2 closure-2"). Once those land plus NEW-1, NEW-2, the
milestone is genuinely done.

---

## Section 5 — Process learnings

### L1. CI green ≠ feature works *(the headline learning)*

The Wave 4 closure gate is:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dlx supabase db reset
pnpm exec playwright test --project=mobile-safari
gh issue list --milestone "M2 — Trip is real" --json state -q '[.[] | select(.state=="OPEN")] | length'   # → 0
```

Every command here verifies the codebase's *internal consistency*. None
verify the *external behavior* of the deployed feature. The bug that
broke production wasn't caught because the production-mode branch of
`lib/rate-limit/index.ts` is unreachable in any environment this gate
runs in.

**Recommendation:** Wave 4 must include a documented step that says,
literally, "open the production preview URL in a real browser, log
in with a real email, walk the documented golden path. Screenshot the
trip dashboard at 375px. Attach to the closure PR." No agent ticks
that for the human — the human (or a real-browser MCP session driven
by an agent) does it. The closure PR doesn't merge without the
screenshot in the body.

### L2. Production env-var configuration is a deploy-time prerequisite that no agent owns

The shim, the magic-link redirect (`resolveOrigin()`), the Supabase
auth callback allowlist — none of these are testable from the
codebase. They live in Vercel and Supabase dashboards. M2 introduced
or relied on at least three of them. None were verified.

**Recommendation:** A `notes/deployment-readiness.md` doc, owned by
the architect/closure agent, lists every env-var-and-dashboard-setting
prerequisite. A Wave 0 of every milestone re-validates the list,
adds new entries, and the closure wave fails if any entry is
unverified. (NEW-3 above.)

### L3. Closure waves should validate, not declare, DoD

The Wave 4 PR (#119) ticked every DoD box. The agent followed the
plan exactly. The plan said "tick the boxes" — it did not say "verify
the thing the box describes is true." DoD boxes are *aspirational
until verified in the deployed environment.*

**Recommendation:** Each DoD line item has two states: declared and
verified. The closure wave only ticks "verified" when a human or
real-browser session signs off. Declared-but-not-verified items are
allowed in M2-closure but block the next milestone's Wave 0.

### L4. Multi-agent + fix-up loops: was the 3-round rhythm right?

PR #102 (login) went through builder → security-reviewer → fix-up
(open-redirect via headers; missing rate-limit on magic-link;
substring-matched auth error mapping) → re-review. That's three
rounds of substantive findings — not noise. Security-reviewer
genuinely caught real bugs each round.

PR #105 (trip creation + invite) similarly caught widened invite
preview buckets, the `safeNext` open-redirect, and the
`(trip_id, idempotency_key)` scope mismatch. Real findings.

PR #109 (RSVP) caught the idempotency scope mismatch (separate
migration filed). PR #114 (date poll) caught the vote-stuffing
WITH CHECK clause.

**Verdict:** No false-positive HIGHs noticed. The 3-round rhythm
worked. It just *can't catch deploy-environment bugs* — only code
bugs. That's not the reviewer's job; that's the smoke-test's.

### L5. Plan-vs-execution drift was non-trivial

Examples from the closure ADR:

- **Idempotency scope.** Original Wave 2a: `(trip_id, idempotency_key)`.
  Wave 2b RSVP needed `(trip_id, user_id, idempotency_key)`. Solved
  with a follow-up migration. **Root cause:** the M2 plan said
  "Idempotency-key convention is per-table (see notes/database-workflow.md)"
  but the architect-phase didn't enumerate what each table's scope
  would be. Two waves picked different scopes for the same column.
- **Invite preview bucket cutoffs.** Originally 1/5/15; widened to
  3/8/20 by security-reviewer (enumeration oracle on single-attendee
  invites).
- **`AUTH_MAGIC_LINK` rate-limit scope.** Originally relied on
  Supabase's server-side throttle; rejected by reviewer as inadequate.
- **`/login` deep-link preservation.** Dropped from Wave 1b after
  the Next.js 16 `x-invoke-path` proved unreliable. Deferred to #104.

**Recommendation:** The architect-phase should enumerate *every*
table's idempotency scope (one row per mutation-heavy table), every
rate-limit scope (one row per server action), every redirect target
(one row per route that ever bounces). Drift on items not listed in
the plan up front is forgivable; drift on items that *were* listed
should be a load-bearing decision in the closure ADR.

### L6. The auth-fixture gap blocked 3+ specs and should have been Wave 0

#120 is the closure ADR's only honest admission of an upfront
miss. The Playwright storage-state setup is generic infrastructure;
once built, it unblocks every authenticated e2e in M2, M3, M4. It
was filed *during* Wave 3 instead of being identified during the
plan phase.

**Recommendation:** M3's plan phase explicitly identifies
cross-wave infrastructure (auth fixture, test factories, MSW mocks)
as *Wave 0 deliverables*, not "we'll get to it when a wave needs it."
Cross-wave infra is the most expensive thing to retrofit; the M2
`test.fixme` cluster is a downstream cost of skipping it.

### L7. Killed-and-deferred audit — clean (mostly)

A quick sweep of the M2 diff against `notes/killed-and-deferred.md`:
no re-introduction of Hot Seat / Drumroll / Lock-In Day / ICS export
/ Pin Drops / Crew Cards / Fear List swipe. The PulsePoll component
honors the "aggregate-only by default, per-name voter-opt-in" kill
rule. RSVP toggle uses three chips with text labels (not color-only).

One borderline observation: the date-poll page exposes per-candidate
vote counts as the primary surface. The plan and ADR explicitly want
this — it is not a leaderboard. But the pattern of "row with a
number that goes up" *can* slide into leaderboard-ness in future
iterations. NEW-8 captures the watch-flag.

---

## Section 6 — Recommended next session (`/goal` for M3)

When the user starts M3, the following should be different from M2's
kickoff:

1. **Wave 0 = real-deploy smoke.** First step of any `/goal` session
   on a milestone after M1 is: open production URL → log in with a
   real email → walk the prior milestone's golden path → confirm the
   not-yet-built M3 routes 404 gracefully. Document outcome in the
   M3 execution plan as a sign-off line.

2. **`notes/deployment-readiness.md` ADR lands before any rate-limit-touching
   or auth-touching wave.** Lists every env var, every dashboard
   toggle, every URL allowlist entry, every Supabase function the
   wave depends on existing in prod.

3. **Auth-fixture wave (#120) lands BEFORE Wave 1.** Promote it from
   "infra debt" to "Wave 0 deliverable." All authenticated e2e
   becomes a real test instead of a `fixme`.

4. **`app/page.tsx` ownership rule.** Add to `CLAUDE.md` or the M3
   plan: "Every milestone closure wave must update `app/page.tsx`
   to reflect current functionality or explicitly call out keeping
   it as-is." The landing page is the single most-likely first
   touchpoint for a new user; orphaning it is a brand-eroding miss.

5. **DoD line items have a `verified` axis.** The closure wave only
   ticks `[x] verified` for items it actually exercised on the prod
   preview. Items it merely confirmed compile/lint/test/build ship
   as `[~] declared`.

6. **The Wave 4 closure PR includes** (a) a 375px screenshot of the
   prod-preview-authenticated dashboard, (b) the rendered HTML of
   `/` (`curl -s` is fine — proves the placeholder is gone), (c) a
   timestamped magic-link sign-in event from Supabase Auth logs, (d)
   a successful `acceptInvite` row in the staging DB.

7. **Architect phase enumerates the per-mutation-action contract.**
   For every server action introduced in the milestone: idempotency
   scope, rate-limit scope, RLS gate, error map. One row each. Drift
   from this list is a load-bearing decision.

8. **Per-PR voice review must include a copy palette delta.** Inline
   string literals in UI code (label text, button text) bypass the
   palette — should be banned in the PR template's microcopy
   checklist or surfaced as a CI lint rule (`no inline-string in JSX
   leaf elements without an exception comment`).

---

## Section 7 — Verdict

**Was M2 actually shipped?** Functionally yes — the seven PRs
implement the M2 DoD as written. Two undisclosed production bugs (one
P0, one cosmetic) made the *user-visible app* broken until those are
patched. So:

- **Code reviewer's verdict:** "M2 shipped. Excellent execution. The
  multi-agent loop caught what it was designed to catch. Idempotency,
  RLS, open-redirect, vote-stuffing, the celebrant-weighted ranking
  algorithm — all rigorous. Three SECURITY DEFINER functions ship
  with full review trails. The closure ADR is honest about what was
  deferred."
- **Senior reviewer's verdict:** "The code is excellent. The
  verification was theatrical. You shipped a feature with sign-in
  broken. Nobody opened the URL. You wrote a `test.fixme()` for the
  exact e2e that would have caught it. CI green is not green."

Both are true. The first matters for the code; the second matters for
the next milestone's process. The user discovered both production
bugs *immediately* on their first live test — exactly the kind of
testing every wave should have run themselves.

**Net call:** M2 is *closed-pending-closure-2*. The seven shipped PRs
stand. NEW-1 (rate-limit shim fix) + NEW-2 (landing page) + #104
(deep-link) + #108 (TZ) land in a "closure-2" wave before M3 kickoff.
Process changes in Section 6 land in `CLAUDE.md` and `notes/m3-
execution-plan.md` before M3's Wave 0.

The single sentence to internalize: *the verification gate must run
against the production URL, not against the local repo.* Everything
else flows from there.

— retro authored 2026-05-19, post-real-test, post-production-bug.

---

## Addendum — 2026-05-19 PM (post-retro session)

The same session that produced this retro continued into a hands-on
production troubleshooting loop. End state: **M2 is genuinely shipped
and the golden path runs end-to-end on production.**

### What got fixed in the troubleshooting session

1. **PR #125** — rate-limit shim allow-with-warning (instead of
   fail-closed) when Upstash is unset; new anonymous landing on
   `app/page.tsx`. Unblocked initial sign-in attempt.
2. **PR #134** — non-PII diagnostic `console.error` on
   `signInWithOtp` + `exchangeCodeForSession` failure paths. **This
   PR paid for itself within minutes** — the next failed attempt
   surfaced `over_email_send_rate_limit` (project-wide Supabase free-
   tier email cap), which solved the troubleshooting in one read.
3. **Resend custom SMTP** — configured with sandbox sender
   `onboarding@resend.dev` + `ripcity352@gmail.com` in the Audience.
   Routed Supabase Auth's outgoing email through Resend, bypassing
   the project-wide cap. Magic-link email landed successfully on
   the first try after configuration.

### New issues filed in this session

- **#135** — Resend verified-domain setup before real attendees (M2,
  blocker for sending magic links to anyone not in the user's Resend
  Audience)

### Process learnings reinforced

- **L1 (CI green ≠ feature works)** was confirmed twice in this
  session — once for the rate-limit shim, once for the landing page,
  once for the URL-alias / PKCE mismatch, once for Supabase's hidden
  project-wide email cap.
- **L2 (env-var ownership)** was the underlying cause of three of
  the four bugs. The deployment-readiness checklist (#126) is
  load-bearing.
- **Diagnostic logging is cheap and high-leverage.** PR #134 was
  ~30 lines and turned a "we don't know why" into "we know exactly
  why" in one POST request. Standard practice for any new auth /
  external-service integration going forward.

### Verdict (updated)

M2 production end-to-end golden path manually verified by a real
human clicking a real magic-link in a real browser. Mobile-Safari-
at-375px portion of the DoD is still deferred behind #120 (auth
fixture), but the desktop verification is the load-bearing signal
the closure was missing.
