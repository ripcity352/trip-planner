# Decisions

Append-only log of architectural decisions and trade-offs. New entries at
the top. Format: date, decision, rationale, alternatives considered.

---

## 2026-05-18 — Collaboration: invite a second Claude Code dev on a separate machine

**Decision:** Add a second developer to this project. Three sub-decisions
follow as their own ADRs below; this one captures the overall shape.

**Shape of the collaboration:**
- Both devs work in Claude Code on separate machines, branching off
  `main`, opening PRs, requesting review from each other.
- `main` is protected via free public-repo branch protection (see ADR
  below). Pro is no longer required.
- Database, secrets, and deploy infra are documented in
  `notes/database-workflow.md` and `notes/collaboration.md` so the
  second dev can onboard from the repo alone.
- Each dev's Claude Code memory (`.claude/memory/`) is local and not
  shared — project context lives in `CLAUDE.md` + `/notes/`.

**Rationale:** Two devs roughly doubles MVP velocity for Goals 2–6
(audit + roadmap suggest these as multi-week each at solo pace). The
research-driven foundation already established (RLS conventions, label
taxonomy, decisions log) is what makes a second dev viable without
spending the first week re-explaining the project.

**Alternatives considered:**
- *Stay solo until Goal 6 ships:* simpler but slower. The MVP has a real
  deadline (the actual bachelor party); two devs is a hedge.
- *Hire/contract a third party:* not the relationship here; trusted
  collaborator is already identified.

---

## 2026-05-18 — Repo goes public; branch protection is free, interaction-limited to collaborators

**Decision:** Flip `ripcity352/trip-planner` from private to **public**.
Branch protection is free on public repos, so the owner doesn't need
GitHub Pro for the merge gate. To compensate for "anyone can fork and
PR", we stack three controls:

1. **Repo-level interaction limit** set to `collaborators_only`,
   expires in 6 months (renewable). Blocks non-collab issues, PRs, and
   comments at the GitHub level.
2. **`.github/workflows/close-external-prs.yml`** — defense-in-depth.
   If a PR is opened from a fork by a non-collaborator (e.g. if the
   interaction limit lapses), the workflow auto-closes it with a
   polite comment.
3. **Branch protection** with required status checks, linear history,
   no force-push, no deletion — same set we would have applied behind
   Pro on private.

**What we tried that didn't work:** disabling forking on the repo.
GitHub's API rejects this on personal-account public repos —
"`Allow forks setting can only be changed on org-owned private
repositories`." Interaction limits + the auto-close workflow cover the
gap in practice.

**Rationale:**
- $0/mo vs $48/yr (Pro). For a hobby/MVP project this is meaningful.
- Free **secret scanning + push protection** unlock automatically on
  public repos. The audit had flagged secret scanning as a gap that
  would only be filled if we went public OR paid. Solved for free.
- Nothing sensitive lives in source (data is in Supabase with RLS,
  secrets are env vars on Vercel). The bachelor-party content the
  audit's risk #3 worried about is runtime data, not code.
- If the project commercializes later, we can flip back to private OR
  move to an Org — both reversible.

**Trade-offs accepted:**
- The Supabase **project URL is now technically discoverable** by anyone
  reading the source (it's a `NEXT_PUBLIC_*` value bundled to the
  browser anyway). RLS is the gate.
- Anyone can fork the repo. They cannot merge anything, and
  Interaction Limits + the auto-close workflow stop them from even
  opening PRs.
- Vulnerability advisories are still private to maintainers (Dependabot
  alerts don't become public unless a Security Advisory is published).

**Renewal cadence:** Interaction Limit expires
2026-11-18 — set a calendar reminder to renew. The auto-close
workflow doesn't expire.

**Supersedes:** the "GitHub: owner upgrades to Pro on personal account"
ADR below — that decision is reversed. No Pro upgrade required.

---

## 2026-05-18 — GitHub: owner upgrades to Pro on personal account (not Org)

> **Superseded** by the "Repo goes public; branch protection is free"
> ADR above. Going public unlocked the same feature for free. Kept
> here as history; the user did briefly upgrade to Pro before this
> reversal landed.



**Decision:** The repo owner (`ripcity352`) upgrades their personal
GitHub account to Pro ($4/mo). The repo stays under
`ripcity352/trip-planner` with the second dev added as a collaborator.
**The collaborator does NOT need Pro** to participate — branch
protection on a private repo gates on the owner's tier only.

**Rationale:**
- Branch protection on private repos requires Pro on the owner's
  account; once enabled, the rules bind everyone with push access,
  regardless of their own plan tier.
- A free GitHub Organization works for unlimited collaborators but
  *also* doesn't have branch protection — Org + Team is $4/user/mo, no
  cheaper than personal Pro and adds migration pain.
- Personal account avoids the migration pain of moving the repo to an
  Org, which would invalidate the current URL and force everyone to
  re-clone.
- Future-proofing for a third collaborator: if/when we add more devs,
  we'll move to a free Org (with no branch protection) or pay for Team.
  Two-person team doesn't justify the move yet.

**Cost:** $4/mo total (owner only). Earlier draft of this ADR said
$8/mo "both on Pro" — that was incorrect; collaborators don't need
their own Pro for this repo. They may upgrade independently for *their
own* repos / features, which is unrelated.

**Alternatives considered:**
- *Move to a free GitHub Org:* no branch protection, same friction as
  staying free.
- *Move to a Team Org:* same monthly cost but more migration work.
- *Stay free + rely on convention:* explicitly rejected by the previous
  ADR (now superseded — see below).

**Supersedes:** the 2026-05-18 "GitHub free-tier private repo: no
branch protection" entry below. That ADR's "when to revisit" trigger
("collaborators added") has fired.

---

## 2026-05-18 — Database: local Supabase per dev + shared staging project

**Decision:** Each developer runs Supabase locally via `pnpm dlx supabase
start` for day-to-day work. A single shared **staging** Supabase project
backs the `main`-branch Vercel deploy (and the Vercel preview URLs for
PRs). Production is a separate shared **prod** Supabase project,
created only when Goal 6 ships to real attendees.

**Why three environments:**
- **Local** = isolated, throwaway, fast iteration. Resets are free.
- **Staging** = single source of truth between the two devs. Catches
  "works locally but not after a migration" before prod sees it.
- **Prod** = real attendee data, no migrations on Fridays, backups
  enabled.

**Migration discipline:**
- Every schema change is a new timestamped file in
  `/supabase/migrations/`. Never edit a migration that's been applied
  anywhere.
- RLS policies for new tables go in the same migration. No PR is
  mergeable that adds a table without RLS.
- Migrations are applied in this order: local (during the PR) →
  staging (when PR merges to `main`) → prod (manually, after the
  staging deploy is observed for ≥24h).
- The `staging.deployed_migrations` (Supabase tracks this automatically
  via `supabase migration list`) is the audit trail.

**Rationale:**
- Local-per-dev avoids the "Alice deleted Bob's seed data" failure
  mode that a shared dev project would have.
- Shared staging catches integration bugs that local can't (e.g., RLS
  function name collisions, search_path mistakes).
- Prod is separate from staging so that staging can be torn down and
  reseeded freely.

**Alternatives considered:**
- *Single shared Supabase dev project:* ruled out (data collisions).
- *Local-only, no staging:* ruled out — every PR's preview deploy
  needs *some* database, and pointing previews at prod is too risky.
- *Branch databases (Supabase's branch DB feature):* worth revisiting
  when out of beta and pricing is known; defers to that future ADR.

---

## 2026-05-18 — Secrets sharing: owner uses Vercel env pull, collaborator reads Supabase dashboard

**Decision:** Two-tier path because Vercel Hobby plan limits teams to
**one** member; adding a second dev requires Pro ($20/mo) which we're
not paying for.

- **Owner** (`ripcity352`, sole Vercel team member): `pnpm dlx vercel
  link` once, then `pnpm dlx vercel env pull .env.local` to sync.
- **Collaborator** (`wchang236` and any future devs): get Supabase
  staging keys directly from the Supabase dashboard (Settings → API).
  Once added to the Supabase org, this is a one-time copy-paste into
  their own `.env.local`. For automation, the curl recipe in
  `notes/database-workflow.md` ("Re-sync Supabase API keys") pulls
  the same values via the Supabase REST API given a personal access
  token.

For **future non-Supabase secrets** (Resend in Goal 4, Sentry in
Goal 6, Stripe-Connect in some far-off goal): each gets its own
sharing decision in this log. Default channel: 1Password shared vault
($2.99/user/mo Families). Don't share secrets in chat/email/iMessage —
screenshots cache forever.

**Why not pay for Vercel Pro:**
- $20/mo vs $0 — meaningful for a hobby project.
- The collaborator gets 90% of what `vercel env pull` would have given
  them by reading Supabase keys directly from the source-of-truth
  dashboard, and the only thing they lose (per-environment auto-
  swapping) is something they don't need — `wchang236` works against
  local Supabase + occasional staging, both of which are environment
  variables they paste manually.
- Vercel's GitHub integration covers preview URLs + deploy status in
  PR comments without team membership.

**Trade-offs accepted:**
- When Supabase keys rotate, both devs update manually rather than one
  central `vercel env update` propagating. Mitigation: post an issue
  with `security` label on rotation so the other dev sees it.
- When non-Supabase secrets land, we'll need to introduce 1Password
  (or similar). Plan for that ADR when we get there.
- Collaborator's first-time setup has an extra copy-paste step
  (documented in `notes/collaboration.md`).

**Supersedes:** the prior "Secrets: managed via Vercel env pull, not
1Password or chat" decision — that decision was based on my incorrect
claim that Vercel team membership was free. It isn't, for multi-user
teams. Kept as history below.

**Original ADR (superseded):**

> All shared secrets live in the Vercel project's environment
> variables. Each dev runs `pnpm dlx vercel link` once, then
> `pnpm dlx vercel env pull .env.local` to sync.
>
> Rationale at the time: "Vercel team membership is already required
> for deploys; reusing it for secret distribution adds zero new
> accounts. Free tier of Vercel includes this."
>
> What turned out to be wrong: Vercel Hobby plan caps team membership
> at 1 user. Adding a second user requires Pro. The "free tier"
> rationale was incorrect.

---

## 2026-05-18 — GitHub free-tier private repo: no branch protection

> **Superseded** later the same day by the "GitHub: both devs upgrade to
> Pro" ADR above. The "collaborators added" trigger fired. Branch
> protection landed once both Pro upgrades completed. Kept here as
> history.

**Decision:** Skip branch protection, rulesets, and secret scanning on
the repo for now. These features are paywalled behind GitHub Pro
($4/mo) for private repos on the free tier.

**Mitigations in place instead:**
- CI workflow runs on every PR (`/.github/workflows/ci.yml`)
- Dependabot vulnerability alerts + automated security fixes are enabled
  (both free)
- Convention: never push to `main` directly; always go through a PR via
  `/pr-cycle`
- `.gitignore` covers `.env*.local` and the supabase service-role key
  never appears in committed code

**When to revisit:** if open-sourcing happens (Goal 8) we get all features
free. Otherwise, upgrade to Pro when collaborators are added or when
shipping anything that handles user PII.

**Alternative considered:** make the repo public from day one. Rejected
because the MVP includes real bachelor-party attendee data once Goal 6
ships.

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
