# Research Audit — Cross-check of audience + label reports against codebase

> Generated 2026-05-18 by audit subagent. Cross-references
> `audience-features.md`, `github-labels.md`, `CLAUDE.md`, `roadmap.md`,
> `decisions.md`, and `0001_init.sql`. Web access was also denied for this
> agent — claims here are reasoned, not re-verified.

---

## 1. Contradictions between the two reports

The two reports are mostly orthogonal, but there are real seams:

- **Co-organizer role gap.** Audience report (risk #2: "best-man churn")
  calls for a co-organizer role *from day one*. Label report has no
  `area:permissions` / `area:roles` label and the area taxonomy treats
  `area:trips` as a single bucket. **Not a contradiction, but the label set
  doesn't track this as a separable surface.** Recommend: keep it inside
  `area:trips` — splitting too early adds noise. No new label.

- **Money pool vs `area:expenses`.** Audience report wants a Venmo-deep-link
  "money pool" pre-Goal-7 (MVP-ish), distinct from full expense splitting.
  Label report defers `area:billing` and uses one `area:expenses` for both.
  **OK as-is** — both are "people owe money" features. Single label fine.

- **`area:invites` is missing.** Audience report's risk #1 (invite token
  leakage) and the "Partiful-style accountless RSVP" are both
  invite-flow-heavy. Label report folds invites into `area:trips`. Given
  invites are a distinct security surface (RLS gaps, token reuse,
  pre-auth flows), **recommend splitting `area:invites` out** — it earns its
  own label like `area:rls` does, for the same "distinct failure mode"
  reason.

- **`area:rsvp` is missing.** Audience report puts RSVP as the #1 MVP gap
  (Goal 2), separate from availability polls. Label report has
  `area:availability` but no `area:rsvp`. RSVP and availability are
  different primitives (one is "am I in for the trip?", the other is
  "which dates work?"). **Recommend: either rename `area:availability` to
  `area:rsvp-availability`, or add `area:rsvp` as a sibling.** I lean
  toward the second — keeps Goal 2 work and Goal 3 work distinguishable.

- **Audience report flags Resend (email) as a Goal 4 stretch.** Label
  report's `area:` taxonomy doesn't have a place for transactional email
  / notifications. Goes into `area:infra`? Or `area:announcements`? Both
  wrong. **Recommend: `area:notifications`** — covers email, SMS,
  realtime-broadcast plumbing. Worth one label.

## 2. Codebase vs research mismatches

This is the meatiest section — the schema is well ahead of the roadmap in
some places and behind the audience report in others.

### What `0001_init.sql` already supports (good)

- **RSVP is already separate from membership.** `trip_members` has both a
  `role` and an `rsvp_status` enum (`pending|going|maybe|declined`).
  Audience report's #1 MVP gap is **already in the schema** — the
  roadmap's Goal 2 just doesn't *mention* RSVP UI. **Action: update Goal 2
  DoD to explicitly include an RSVP control.** No migration needed.
- **`maybe` RSVP state exists.** 3-state RSVP requirement met.
- **Invites with `expires_at` and `uses_left`** — the schema is already
  set up for single-use / expiring tokens (audience risk #1 mitigation).
  Application code just needs to honor `uses_left` and decrement on use.
  **No schema change needed; flag this for Goal 2 implementation notes.**
- **Slugs already first-class** (`trips.slug` unique not null). Matches
  the audience report's `/trip/nashville-jake-2026` URL recommendation.
  Need a slug generator in app code; no migration.
- **`trip_role` enum** is open to extension. Adding `'co_organizer'` is
  one ALTER TYPE in a new migration — trivial.

### What's missing in the schema for audience MVP recommendations

For each, the specific change required:

| Audience-report gap | Required schema change |
|---|---|
| **Per-day partial attendance** ("I can only do Friday + Saturday") | New table `trip_member_days (trip_id, user_id, date, status)`. Distinct from `availability` (which is about *proposing* dates pre-decision). Or reuse `availability` semantics post-lockdown — but that overloads the table. Recommend new table. |
| **Dietary / sober / allergy notes (organizer-visible)** | Add `trip_members.dietary_notes text` (free-form, nullable). Add RLS rule: only the member or organizers can `select` the field. **Requires column-level RLS or a view** — Postgres can do this with a `security_barrier` view; simpler is to just put the field on `profiles` if global, or accept that all members can read it. Worth flagging as a design call. |
| **Co-organizer role** | `alter type trip_role add value 'co_organizer';` Then update `is_trip_organizer()` to include both roles, or add `is_trip_co_organizer()`. **Migration is one-liner. RLS function update is the real work.** |
| **Money pool (pre-Stripe)** | New table `money_pool_entries (trip_id, user_id, amount_cents, paid_to, status, marked_paid_at)`. Manual marks only — no payment provider. Plus a `payment_handles` table or column on `profiles` for Venmo / Cash App usernames. |
| **Activity polls / votes (beyond date polls)** | New tables `polls (id, trip_id, question, …)` + `poll_options` + `poll_votes`. Generalizes availability voting. Could refactor availability onto this primitive in Goal 8 — premature for MVP. |
| **Ownership transfer / co-organizer churn** | No schema work needed beyond co-organizer role; transfer is just `update trip_members set role = 'organizer' where …`. But: `trips.created_by` is currently used as an implicit "owner" in places — confirm no RLS policy treats `created_by` as authoritative. Quick read of the SQL: **good news**, RLS uses `is_trip_organizer()`, not `created_by`. No change needed. |
| **Per-attendee notes the groom doesn't see** | New table `private_notes (trip_id, author_id, visible_to user_id[], body)` with RLS gating by visibility list. Defer — Goal 6/7. |
| **OG card / preview metadata for invite link** | Not a schema concern. App-code only (`generateMetadata` per route). |
| **PWA manifest** | Not schema. App config. |
| **Calendar export (ICS)** | Not schema — generate from `itinerary_items` on-the-fly. |
| **Forward-email-to-import (TripIt-style)** | Big lift — webhook + parser + inbox identity per trip. Goal 8+ territory. |

### What the schema has that research didn't account for

- **`profiles` table is global (no `trip_id`).** Audience report's "bachelor
  party privacy needs" (don't surface real names to other trips later in
  multi-tenant) means display_name being globally-readable across trips is
  fine for MVP but worth a follow-up — Goal 8 might want per-trip
  display names ("Jake (Best Man)" vs "Jake Smith"). Not urgent. Flag.
- **`expenses.occurred_on date` defaults to current_date.** Reasonable, but
  bachelor party expenses are often pre-paid (Airbnb deposit, golf
  reservation). UI should let user backdate.
- **No `created_by` on `availability`** — uses `(trip_id, user_id, date)`
  composite PK, so it's implicit. Fine.
- **`announcements` is organizer-write only** per the RLS. Audience report
  recommends "announcements + comments" for MVP. **No `comments` table
  exists** — Goal 4 will need a migration if comments land in MVP.

### CLAUDE.md / decisions.md vs research

- **No contradictions.** Both research reports respect the existing rules
  (RLS-first, server-actions-by-default, multi-tenant from day one).
- **CLAUDE.md says "tests for data-layer functions" but mentions no test
  framework.** This is a real gap — see §3.
- **CLAUDE.md doesn't mention OpenGraph or PWA**, both of which the
  audience report puts in "first-class deliverable" territory. Worth a
  decisions.md entry.

## 3. Things both reports missed

Be opinionated. Concrete picks:

- **GitHub issue + PR templates.** Strong concern. The repo will live or
  die by `/create-issue` quality; issue templates give the agent
  structured input. Recommend templates for `feature`, `bug`,
  `research-spike`. PR template should require: linked issue,
  test plan, screenshots-on-mobile for UI changes. **High value, low
  cost.**

- **CODEOWNERS / branch protection.** Solo dev — *some* value: enforce
  CI green before merge, require linear history, block force-push to
  `main`. CODEOWNERS itself is overkill solo. **Recommend: branch
  protection on `main` (CI must pass, no force-push). Skip CODEOWNERS.**

- **Dependabot.** Strong concern given Supabase JS client + Next.js are
  fast-moving. Auto-PR weekly grouped by ecosystem. **Recommend: enable
  with weekly cadence, grouped, ignore major bumps for Next/React until
  manually triaged.**

- **GitHub Discussions vs Issues.** No concern yet. Solo dev, no
  community. Defer to Goal 8.

- **Security: secret scanning + push protection + private vulnerability
  reporting.** Strong concern. `.env.local` is gitignored but
  `SUPABASE_SERVICE_ROLE_KEY` is exactly the kind of thing that ends up
  in a stray commit. **Recommend: enable secret scanning AND push
  protection on day one — both free for public repos and for private
  repos under most plans. Also enable private vulnerability reporting.**

- **Analytics / observability.** Worth flagging now. Roadmap is silent.
  - **Vercel Analytics** — free tier, one-line add. Recommend at Goal 6.
  - **Sentry** — error tracking. Recommend at Goal 6 *before* sharing
    with real users. Free tier is generous.
  - **PostHog** — product analytics, session replay. Overkill for
    bachelor-party MVP. Defer to Goal 8 (multi-tenant pivot — that's
    when "did anyone click 'create trip'?" matters).

- **Legal — ToS, Privacy Policy, content moderation.** Audience report
  flags this as risk #3 but says "before Goal 7." That's too late.
  **Recommend: stub ToS + Privacy Policy at Goal 6 (before sharing the
  invite link to real attendees)**, even if it's a one-page "this is a
  hobby project, photos are private, don't upload illegal content,
  delete with mailto:".
  - Photo auto-delete after N days unless archived (audience risk #3
    mitigation) — bake into the Goal 7 schema as a `expires_at` column
    on `photos`, not retrofitted.

- **Accessibility from day one.** Concern. Label report adds
  `accessibility` label but no roadmap goal references a11y. **Concrete
  add: a sub-bullet in every UI-touching goal's DoD: "passes
  axe-core lighthouse check, focus order, semantic landmarks."**
  Mobile-first ≠ accessible (e.g. tiny tap targets, contrast on photos).

- **i18n / locale.** No concern for MVP. Bachelor party is English-only
  US. Flag for Goal 8 if "destination wedding" audience is real —
  Spanish locale would matter then.

- **Testing strategy.** Real gap. CLAUDE.md punts but no framework is
  chosen. **Recommend: Vitest for unit tests (`/lib/db/*` test files,
  `*.test.ts` colocated), Playwright for E2E (one golden-path test:
  create trip → invite → RSVP → see itinerary). Add both at Goal 1 or
  Goal 2 — retrofitting is painful.** Add a decisions.md entry.

- **Real-money / Stripe / KYC.** Concern. Once "money pool" stops being
  Venmo-deep-link and starts being actual fund collection (Goal 7+),
  you're a Money Services Business in some states unless you use a
  PSP that handles it (Stripe Connect "Custom" or "Express"). **Don't
  build money flow without a PSP.** Worth a decisions.md entry now
  even though we're not building it.

- **Database backups.** Supabase free tier has limited backup retention
  (7 days). For a one-shot bachelor party that's fine. For multi-tenant
  Goal 8, plan for Supabase Pro or external pg_dump cron. **Note for
  Goal 8 planning, not now.**

- **Rate limiting.** CLAUDE.md global rules say "rate limiting on all
  endpoints." Next.js server actions don't have built-in rate limiting.
  Need Upstash / Vercel KV / Supabase-based limiter. **Concrete: add to
  Goal 6 polish DoD — rate-limit `createTrip`, `acceptInvite`,
  `postAnnouncement`.**

- **`bachelor-party-starter.zip` in repo root.** Random observation:
  there's a 14KB zip in the repo root that's probably the original
  starter scaffold. Should be `.gitignore`d or moved to `/notes/`.

## 4. Claims worth re-verifying with web access

Top 5, ranked by leverage:

1. **Supabase Storage pricing for photo wall (audience honorable
   mention).** "8GB per trip × 1,000 trips = 8TB" math depends on
   current Supabase Pro included storage (last known: 100GB Pro
   tier, then $0.021/GB). If this has changed, the photo-cap policy
   changes. **Highest leverage** — directly affects whether Goal 7
   needs per-trip storage limits.
2. **Partiful's current product surface.** Audience report leans
   heavily on the "Partiful model" for unauthenticated RSVP. If
   Partiful has since added itinerary/expenses/photos (Jan 2026 cutoff
   is recent but not live), the "wedge" claim weakens. Re-verify
   feature list.
3. **Splid's account model.** "Works without accounts" is the core
   differentiator claim. If Splid has gone account-required since
   training cutoff, the "accountless attendee mode" pattern needs a
   different exemplar.
4. **Actual label lists at vercel/next.js and supabase/supabase.**
   Label report uses these as the strongest exemplars; if they've
   restructured (especially supabase, which is most-relevant to our
   stack), the recommended taxonomy may diverge. Run `gh label list
   --repo supabase/supabase` and `gh label list --repo vercel/next.js`
   when web access is back.
5. **iOS market share for bachelor-party demographic ("~75% iOS").**
   Used to justify mobile-Safari-first emphasis. If it's actually 60/40
   or 80/20, the conclusion (test iOS Safari first) doesn't change,
   but the explanatory framing does. **Lowest leverage** of the five.

Stable enough to act on without re-verification: GitHub's own docs on
labels (key:value convention), git/dependabot/CI best practices,
WCAG/a11y guidance, general schema design.

## 5. Recommendations to add to the plan

### Add to label set (beyond the 26)

- **`area:invites`** — distinct surface, security-sensitive
- **`area:rsvp`** — distinct from `area:availability`
- **`area:notifications`** — email/SMS/realtime plumbing
- **`legal`** *(cross-cutting)* — ToS, privacy, content moderation
- **`needs-research`** *(status)* — spike not yet broken into issues

Net new: 5 labels → 31 total. Still under the noise threshold for solo
dev (~35).

### Add to milestones / roadmap

- **Goal 1.5 — Repo hygiene** (between Goal 1 and Goal 2): issue
  templates, branch protection, Dependabot, secret scanning, Vitest +
  Playwright skeletons. Roughly half a day. Should not be folded into
  Goal 1 ("foundation deployed") — different concern.
- **Goal 2 DoD update**: explicit RSVP UI control (the schema already
  supports it), dietary-notes field, per-day attendance table
  migration.
- **Goal 6 DoD update**: ToS + Privacy stub, Sentry + Vercel
  Analytics, rate limiting, axe-core check, OG card + PWA manifest.
- **New mini-goal between 6 and 7**: "Money pool (manual)" — the
  Venmo-deep-link version. Audience report calls this out as
  highest-asked feature.
- **Goal 7 schema**: include photo `expires_at` from day one.

### Add to `/notes/`

- **`/notes/decisions.md` new entries** (top of file):
  - Testing framework: Vitest + Playwright (with rationale)
  - Co-organizer role from day one (with `trip_role` ALTER plan)
  - RSVP is per-trip *and* per-day (two tables)
  - Photos expire by default (mitigation for risk #3)
  - No real-money handling without Stripe Connect (defer KYC concern)
- **`/notes/moderation.md`** — stub policy: takedown email,
  auto-archive of photos, ToS bullets. One page.
- **`/notes/og-and-pwa.md`** — short note on social-card + PWA
  manifest plan, since both research reports treat them as
  important but neither goal currently owns them.

### Add to repo infrastructure (the `workflow-setup` execution)

- `.github/ISSUE_TEMPLATE/feature.yml`,
  `.github/ISSUE_TEMPLATE/bug.yml`,
  `.github/ISSUE_TEMPLATE/research.yml`
- `.github/pull_request_template.md` (linked issue, test plan,
  mobile screenshot)
- `.github/dependabot.yml` — weekly, grouped, npm + github-actions
- Branch protection rule on `main`: require status checks, no
  force-push, no deletion
- Enable: secret scanning, push protection, private vulnerability
  reporting (all repo settings, not files)
- `.github/workflows/ci.yml` — pnpm typecheck + lint + test on PR
  (referenced by branch protection)
- Add `bachelor-party-starter.zip` to `.gitignore` or delete it
