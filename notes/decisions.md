# Decisions

Append-only log of architectural decisions and trade-offs. New entries at
the top. Format: date, decision, rationale, alternatives considered.

---

## 2026-05-18 — Testing: Vitest + Playwright

**Decision:** Unit tests via **Vitest** (colocated `*.test.ts` files,
focused on `/lib/db/*` and non-obvious business logic). E2E via
**Playwright** (one golden-path test covering create-trip → invite → RSVP →
see itinerary, run in CI on iOS Safari + Chromium projects).

**Rationale:**
- Vitest is the de facto standard for Next.js App Router projects in 2026
  (esbuild speed, ESM-native, drop-in Jest API). Less config than Jest +
  SWC.
- Playwright is the only credible option for "test on real mobile Safari"
  in CI. Cypress doesn't do iOS.
- Test framework choice retrofitted late is painful — pick now.

**Alternatives considered:**
- *Jest:* slower in Next.js, more config friction.
- *Vitest browser mode only:* not stable enough for E2E yet.
- *No tests until needed:* CLAUDE.md already requires tests for `/lib/db`
  and business logic; no framework chosen makes that rule unenforceable.

---

## 2026-05-18 — Co-organizer role from day one

**Decision:** Add `co_organizer` to the `trip_role` enum in the Goal 2
migration, and update `is_trip_organizer()` to return true for either
`organizer` or `co_organizer`.

**Rationale:** Audience research risk #2 ("best-man churn") — if the sole
organizer disappears mid-trip-planning, every attendee loses write access
to shared state. Co-organizer is a one-line ALTER TYPE plus a helper
function update. Retrofitting after launch means an RLS rewrite.

**Alternatives considered:**
- *Single organizer + ownership-transfer flow:* still leaves a hole when
  the lone organizer abandons the trip and is unreachable.
- *Role-based ACL system:* overkill for the role count we have.

---

## 2026-05-18 — RSVP is per-trip AND per-day

**Decision:** Keep the existing `trip_members.rsvp_status` (trip-level
yes/no/maybe/declined) AND add a new table `trip_member_days (trip_id,
user_id, date, status)` for per-day opt-in. The trip-level status is the
"are you in for this at all" answer; the per-day table handles
late-arrivals and partial attendance.

**Rationale:** Audience research called per-day attendance an MVP-tier gap
("I can only do Friday + Saturday" is normal for bachelor parties). The
two are distinct primitives — overloading `rsvp_status` with per-day
state would require a separate row per day per member, breaking the
"one row per membership" model. Schema is small.

**Alternatives considered:**
- *Reuse `availability` table:* `availability` is for *proposing* dates
  pre-decision; reusing it post-decision overloads its semantics.
- *Skip per-day entirely for MVP:* leaves a real gap in the organizer's
  view of who's actually showing up Friday night.

---

## 2026-05-18 — Photos expire by default (Goal 7)

**Decision:** When the photo wall ships in Goal 7, the `photos` table will
have an `expires_at` column defaulting to `now() + interval '90 days'`.
Photos explicitly marked as `archived = true` are exempt. A daily cron
(Supabase scheduled function) deletes both the row and the Storage object
for expired un-archived photos.

**Rationale:** Audience research risk #3 (UGC liability) — photos taken
during a bachelor party may contain content the uploader regrets, third
parties who didn't consent, or content that's straightforwardly illegal in
some venues. Default-expiry plus an opt-in archive is the lightest-touch
mitigation: the trip stays useful in the moment, ephemera doesn't accrete
on Supabase Storage indefinitely. Also bounds storage cost.

**Alternatives considered:**
- *Indefinite retention with manual delete:* trusts users to clean up
  (they won't) and leaves us holding the cost and the legal exposure.
- *Never store photos, link to external (iCloud Shared Album):* breaks
  the in-app experience and removes the photo wall feature entirely.

---

## 2026-05-18 — No real-money handling without Stripe Connect (or equivalent PSP)

**Decision:** The Goal 6.5 "money pool" feature ships as **informational
only** — manual entry of amounts owed, Venmo/Cash App deep links, manual
"mark paid" by the organizer. No actual fund movement runs through our
infrastructure.

If real money handling is ever added, it MUST be via a Payment Service
Provider that handles KYC/AML (Stripe Connect Custom/Express, or
equivalent). Building our own would put us in Money Services Business
territory in many US states.

**Rationale:** Money is the #1 asked feature per audience research, but
the regulatory cost of holding/moving it is enormous for a hobby project.
The Venmo-deep-link version captures 90% of the coordination value with
zero MSB exposure.

**Alternatives considered:**
- *Build on Plaid + ACH directly:* untenable without legal counsel.
- *Skip the money feature entirely:* leaves the highest-leverage feature
  unbuilt. The informational version is enough.

---

## 2026-05-18 — Initial stack: Next.js + Supabase + Vercel

**Decision:** Next.js 15 (App Router) on Vercel, with Supabase for Postgres
+ auth + realtime + storage.

**Rationale:**
- One repo, one deploy, fast iteration
- Magic-link auth is the right fit for "send a link to your groomsmen"
- Supabase RLS lets us build multi-tenant from day one with the same code
  paths as a single-tenant MVP
- Stack is well-represented in Claude Code's training, fewer wrong turns

**Alternatives considered:**
- *Convex:* nicer realtime DX, but smaller ecosystem and Claude is less
  fluent. Revisit if Supabase realtime becomes a bottleneck.
- *Firebase:* works, but auth + Postgres + RLS combo at Supabase is more
  natural for a relational schema like trips → members → activities.
- *Custom backend (Hono/Express):* premature; Next.js server actions are
  enough until we have webhooks or non-web clients.

---

## 2026-05-18 — Multi-tenant from day one

**Decision:** Every user-scoped table joins to `trips` via `trip_id`, and
access is enforced exclusively by RLS policies that check membership in
`trip_members`.

**Rationale:** The pivot from "one bachelor party" to "many trips" is the
explicit goal of this project. Designing for it from the start adds maybe
a day of work; retrofitting it later would mean rewriting every query.

**Alternative considered:** Single-tenant MVP, refactor later. Rejected.
