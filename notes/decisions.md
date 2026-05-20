# Decisions

Append-only log of architectural decisions and trade-offs. New entries at
the top. Format: date, decision, rationale, alternatives considered.

---

## 2026-05-20 (late PM) — Tab-based IA locked + 3-axis labeling scheme

**Decision:** The trip surface ships as a **5-tab bottom navigation**:
`home / plans / posts / crew / me`. Mirrors the Claude Design mockup
(external Figma, not versioned in repo). Money does **not** get a 6th
tab — it surfaces as a "your move" CTA on `home` (e.g. "Send Dave
$312"). Settlement detail is a deep-link route or bottom-sheet, never
a top-level tab. Closes the IA gap the nine open expenses issues
(#46–#54, #57) have been carrying.

**3-axis issue labeling — `milestone × area × tab`:**

- **`milestone:Mx`** — when we ship it. Already in use.
- **`area:*`** — engineering/feature domain. Already in use; expanding
  with `area:copy` for microcopy-only changes.
- **`tab:*`** — where the user encounters it. **New axis, optional.**
  Use only when an issue has a clear user-facing home. `tab:none` for
  genuinely cross-cutting work (RLS, infra, auth, design system).

**Triage rule:** every issue gets `milestone` + `area` required;
`tab` optional. Multiple `tab:*` labels allowed for issues that span
tabs (e.g. #45 RSVP color+icon touches `home` + `plans` + `crew`).

**Code structure stays as-is.** Next.js App Router routes (already
organized by feature under `app/(authed)/trips/[tripId]/...`) remain
the source of truth. Do not bend folder structure to tab labels — the
URL tree and the nav tree are allowed to diverge.

**Why not promote `tab` to a milestone axis:** milestones today answer
*"what does this unlock for a real trip?"* — a stable framing that's
survived three closures (M1, M2, M3). Tab-keyed milestones would
force *placement* questions (the wrong unit) and couple the schedule
to the IA (the least stable layer in this stack). Tab IA may shift
(e.g. `crew` could split into `roster` + `invites`); a label retag is
cheap, a milestone restructure isn't.

**Why money lives on `home`, not its own tab:** money is the #1 asked
feature per audience research, but the user-action shape is "settle
one balance, then forget about it." It belongs in the "your move"
slot on `home` alongside RSVP nudges and itinerary acks, not in a
permanent IA position that promises ongoing engagement we won't
deliver. Aligns with the 2026-05-18 "no real-money handling" ADR —
informational settlement doesn't warrant tab-level real estate.

**What unlocks next (files separately, post-merge):**

- **Nav-refactor M4 carry-back issue** — `components/BottomTabBar.tsx`
  + `app/(authed)/trips/[tripId]/layout.tsx` + new `/me` route.
  ~200 LOC. `milestone:M4`, `area:nav`, `tab:none`.
- **`/me` composition issue** — what surfaces on the new self-tab
  (profile, my RSVPs, my expenses, leave-trip). `milestone:M4`,
  `area:me`, `tab:me`.
- **7-issue Claude Design feedback batch** — Prompts 1–5, 7, 10 from
  the mockup walkthrough. Each filed with appropriate `tab:*` label.

**Out of scope for this ADR:** the actual tab-bar component, the
`/me` route, the visual treatment of the "your move" home CTA. Those
ship as code in the issues above.

**Alternatives considered:**

- **6-tab IA with `money` as a peer:** rejected per money-shape
  argument above. Also pushes tab targets below the 44pt mobile-tap
  comfort zone on 375px screens.
- **`tab` as a required label:** rejected — most infra and design-
  system work has no user-facing home. `tab:none` is honest;
  required-everywhere would force false placement.
- **Drop the `area` axis, use only `milestone` + `tab`:** rejected —
  `area` is what the engineering side queries on; `tab` is what
  product/UX queries on. Both audiences need their own slice.

---

## 2026-05-20 (PM) — M3 — Trip is useful — milestone closed

**Decision:** M3 closed. The MVP-target trio is now reachable from one
URL: itinerary, announcements (with Realtime), trip notes, arrivals
manifest, roster with vCard mass-download + copy-all-numbers, and
organizer invite minting with the rate-limit scope properly split from
the accept path. Per-item RSVP + per-item member-flag (dietary / sober /
late-arrival) ship as silent opt-ins per the "don't encode a default"
ADR.

**What shipped (9 PRs):**

- **#143** Wave 0a — plan doc, deployment-readiness, M3 copy keys, #116/#117/#130.
- **#145** Wave 0b — Playwright auth fixture (#120).
- **#144** Wave 0c — PKCE → token-hash for cross-device magic-link clicks (#137).
- **#146** Wave 1 — `m3_itinerary_announcements` migration + data layer +
  idempotent server actions for itinerary, announcements, lodging,
  travel legs, trip notes, item RSVPs, item flags.
- **#147** Wave 2 — itinerary UI + per-item RSVP chip + organizer-only
  per-item flag form (#35, #38, #80; lodging UI portion of #36).
- **#148** Wave 3a — announcements page + Realtime feed (#79).
- **#149** Wave 3b — now/next dashboard card + trip notes editor +
  `revalidatePath` on `setRsvpAction` success (#77, #78, #110).
- **#150** Wave 4a — arrivals manifest + travel-leg form (#37).
- **#151** Wave 4b — roster page + vCard mass-download + copy-numbers
  (#39, #40).
- **#152** Wave 4c — invite-issuance UI + `MINT_INVITE` rate-limit scope
  split from `ACCEPT_INVITE` (#129, #107).

**Load-bearing decisions made during execution:**

1. **Idempotency-key scope per the per-table ADR** held: organizer-
   acting tables (`itinerary_items`, `announcements`, `lodging_assignments`)
   use `(trip_id, idempotency_key)`; strictly-user tables
   (`itinerary_item_rsvps`, `itinerary_item_member_flags`, `travel_legs`)
   include `trip_member_id` in the partial unique scope. Migration
   #146 enforces this end-to-end.

2. **`revalidatePath("/trips", "layout")` on RSVP success** chosen over
   per-slug invalidation. Per-slug would have required an extra DB
   round-trip in the hot RSVP path to fetch `trips.slug` from the
   membership row. Layout-wide is broader but the cost is negligible —
   the cache miss only matters for surfaces already showing RSVP counts.

3. **Browser-local TZ for the now/next pure function (#108 still deferred).**
   `whatsHappeningNow` takes `now: Date` as a parameter and uses it
   directly. Cross-coast trips will see the viewer's local clock at
   render time. The trip-local TZ fix is M4+ territory; the timeline
   has a one-line dashboard-footer caveat as planned.

4. **Reusable shadcn `Select` + `Textarea` primitives added** via
   `pnpm dlx shadcn@latest add`. No new npm dependency in `package.json`
   — `@base-ui/react` was already a transitive dep of the existing
   shadcn primitives, so the new components ride that pin.

5. **Emoji icons swapped for `lucide-react` SVG** in the arrivals card
   per design-system §581 (icons are SVG; emoji reserved for reactions
   and user-generated copy). The reciprocal cleanup on
   `components/trip/itinerary/item-card.tsx` is tracked as a follow-up.

6. **vCard CRLF escaping is a security guarantee, not a formatting nit.**
   A user-controlled `display_name` containing `\r\n` could inject
   forged `BEGIN:VCARD` / `END:VCARD` blocks into every other member's
   downloaded `.vcf`. `escapeVCardText` now escapes CR/LF/CRLF to `\\n`
   BEFORE the comma/semicolon/backslash escapes. `sanitisePhone` strips
   newlines from the TEL value as defense-in-depth. Three new tests
   pin the attack vector closed (full payload, lone CR/LF, malformed
   phone). Both reviewers independently surfaced this; the fix was
   the highest-severity find of Wave 4.

7. **`MINT_INVITE` rate-limit scope split from `ACCEPT_INVITE` (#107).**
   `createInviteAction` and `acceptInviteAction` now use distinct
   buckets per `(scope, user_id)`. A burst of mints can no longer
   starve the accept path (or vice versa). Default budget (30 req / 60 s
   sliding window) applies to both; ratchet review (#141) is post-M3.

8. **Revoke RLS no-op detector.** The `invites` table currently has
   SELECT/INSERT/DELETE RLS policies but no UPDATE policy. A denied
   UPDATE returns success with zero affected rows — not an error.
   `lib/db/invites.ts` `revokeInvite` now chains `.select("token")`
   on the UPDATE and throws if the affected-row count is zero. Without
   this, `revokeInviteAction` would have been a silent no-op for every
   caller and the UI would have lied about revocation. The proper fix
   (UPDATE policy or `revoke_invite` SECURITY DEFINER RPC) is an M4
   migration follow-up; the in-action check is the M3-scope band-aid.

9. **`invites.token` SELECT RLS is `is_trip_member`, not organizer-only.**
   The page-level `is_trip_organizer` check in
   `app/(authed)/trips/[tripId]/invites/page.tsx` is the load-bearing
   gate. Docstring corrected in `lib/db/invites.ts`. Tightening the
   SELECT policy is an M4 follow-up.

10. **Override G — `app/page.tsx` kept as-is.** The landing page
    written for M2 ("Plan the trip without the group-chat chaos.")
    accurately describes the M3 product surface. No changes needed for
    M3 reality. Tracked as an explicit kept-as-is decision per the
    plan's Override G ownership rule.

**Process learnings (full retro in `notes/retros/m3-retro.md`):**

- Parallel `tdd-guide` agents on independent worktrees worked well for
  Wave 3 (2 PRs) and Wave 4 (3 PRs). No file collisions; PR open ↔ merge
  cycle averaged ~1 hour per wave including reviewer turnaround.
- `security-reviewer` + `code-reviewer` dispatched in parallel (Override
  D) consistently caught issues the implementation agent missed —
  most notably the vCard CRLF injection and the `revokeInvite` RLS
  no-op. The pattern is keeping; the only friction was self-PR approval
  blocked by GitHub, which the agents handled by posting comment reviews
  with explicit "clear to merge" language.
- Session limits hit twice during Wave 4 re-reviews. The fix-up commits
  were demonstrably aligned with the prior review findings (verified
  against the diff manually), so the orchestrator merged. Future mitigation:
  smaller, more atomic fix-up commits keep the re-review window short.
- Real-browser smoke at 375px on the Vercel preview (Override A) caught
  zero new issues this milestone — the screenshots became more of a
  smoke-test ritual than a defect surface. The closure walk on
  travelston.com (Override E `[v]` axis) is what catches what CI misses.

**Verified DoD:** see `notes/m3-execution-plan.md` final DoD checklist.
All `[d]` boxes ticked at PR-merge time; `[v]` boxes ticked at closure
after the production walk on travelston.com (PR body embeds the 8
screenshots).

**MVP target reset:** M1 → M3 are done. Next: M4 — Trip is shippable.
Per `notes/roadmap.md`, **stop at M4** — use the app for one real
bachelor party before opening M5.

---

## 2026-05-20 — M3 Wave 0c — Switch magic-link from PKCE to token-hash for cross-device clicks (#137)

**Decision:** Replace the `exchangeCodeForSession(code)` PKCE exchange in
`/auth/callback` with `verifyOtp({ token_hash, type })`. The legacy PKCE
`code` branch is retained for backward compat during the Supabase Dashboard
email-template flip window. `token_hash` takes precedence when both params
are present.

**Why we deviated from the `@supabase/ssr` PKCE default:**

`@supabase/ssr` ships with PKCE as the default auth flow. PKCE stores a
`code_verifier` cookie on the browser that initiated `signInWithOtp`. When
the user clicks the link on a *different* device — the dominant real-world
pattern for a bachelor-party app where links travel through group chats and
email clients — there is no `code_verifier` cookie in that context and auth
fails with `AuthPKCECodeVerifierMissingError`.

Failure modes caught in production (2026-05-19):
- User requests link on phone Safari → clicks in Gmail app (different
  in-app browser) → fails
- User requests link on laptop → clicks in phone's mail app → fails
- Email-client URL prefetch (Gmail Smart Compose, antivirus scanners)
  consumes the code → the real click fails

**Friction-vs-security rationale** (see
`~/.claude/projects/.../memory/feedback_friction_vs_security.md`):

The threat model here is "drunk friend mistypes their email," not
"nation-state phishing campaign." PKCE's protection against authorization
code interception doesn't earn its friction in this context. The token-hash
flow gives us the same one-time-use guarantee (the hash is burned after
`verifyOtp`) without requiring same-browser round-trip.

From the memory note: *"I'm not sure why we even need such high security
and email verification for what should be a simple website (low friction)."*
That feedback is load-bearing product direction.

**Implementation:**
- `lib/auth/callback-handler.ts` — new module, extracted from the route so
  it can be unit-tested. Contains all branching logic.
- `app/auth/callback/route.ts` — now delegates entirely to
  `resolveCallbackResult()`. No inline auth logic.
- `lib/supabase/server.ts`, `lib/supabase/browser.ts` — no changes needed;
  `verifyOtp` works on the standard `@supabase/ssr` server client without
  any flow-type override.
- `lib/auth/safe-next.ts` — unchanged.
- `lib/auth/__tests__/callback.test.ts` — 8 new unit tests covering both
  paths (token-hash, PKCE) and edge cases (missing params, both params
  present).
- `e2e/cross-device-magic-link.spec.ts` — cross-device E2E using two
  isolated browser contexts + Supabase Admin API `generateLink` to mint
  a real `token_hash` without needing an inbox.

**Human-only Supabase Dashboard step (not automated):**
Authentication → Email Templates → Magic Link: change the link from
`{{ .ConfirmationURL }}` to the token-hash variant. See PR body for exact
template text. Without this change, the Dashboard still generates PKCE
`code` URLs — the callback handles those as backward-compat, but new links
will continue to be cross-device-fragile until the template is flipped.

**Alternatives considered:**
- **Option A — implicit flow** (`flowType: 'implicit'` on
  `createServerClient`): `@supabase/ssr` v0.x doesn't fully support
  implicit flow on the server-side cookie client; the package is optimized
  for PKCE and the implicit path is not documented for SSR. Option B
  (token-hash) is the Supabase-recommended pattern for cross-device flows.
- **OTP code entry fallback UI**: explicitly killed per issue body. Adds
  a step, breaks the "link just works" mental model, out of scope for this
  app's threat model.

---

## 2026-05-19 (late PM) — M2 follow-up — Upstash provisioned via Vercel Marketplace (#124)

**Decision:** Provisioned Upstash for Redis through the Vercel Marketplace ("Upstash for Redis" integration, `upstash/upstash-kv` product slug), region `us-east-1`. Auto-injects `KV_REST_API_URL` + `KV_REST_API_TOKEN` (plus `KV_URL`, `REDIS_URL`, `KV_REST_API_READ_ONLY_TOKEN`) into Production, Preview, and Development environments.

**Why this matters:** Closes the M2 follow-up gate that blocked sending the invite link to real attendees. Until #124, the rate-limit module fell through to the in-memory always-allow shim on prod — `AUTH_MAGIC_LINK`, `CREATE_TRIP`, `ACCEPT_INVITE`, `SET_RSVP`, `CAST_DATE_VOTE` had no per-user budget, and email-bombing was technically possible against any inbox. Real users gate.

**Load-bearing implementation details:**

- **Dual-name env var resolution.** Vercel Marketplace injects `KV_*` naming; existing dev setups and `.env.example` documented `UPSTASH_*`. The rate-limit module now reads both via `__resolveUpstashCreds()`, preferring `KV_*` when present so the production source of truth (Vercel) always wins over a stale local override. Test coverage in `lib/rate-limit/__tests__/index.test.ts` pins this precedence (7 cases) so a future rename doesn't silently regress to the in-memory shim.
- **`buildInMemoryLimiter` shim retained, not deleted.** The v4 history comment in `lib/rate-limit/index.ts` documents why: a future env-var regression on Vercel or a fresh fork running without provisioning must still bootstrap. The shim's loud Sentry warning (`console.error`) is the regression alarm.
- **Direct-Upstash console NOT used.** The Marketplace path was chosen over `console.upstash.com` direct provisioning despite the Marketplace's paid-only plan presentation, because unified Vercel billing + auto-injection + dashboard visibility outweighed the (negligible at MVP traffic) per-request cost on the cheapest paid plan.
- **Scope budgets unchanged.** The default 30-req / 60-sec sliding window applies uniformly across all scopes for now. Issue tracking a per-scope ratchet (e.g., `AUTH_MAGIC_LINK` should likely drop to ~5/hr for production-grade abuse resistance) lives at the JSDoc comment at `RATE_LIMIT_SCOPES.AUTH_MAGIC_LINK` and is deferred to a follow-up.

**Alternatives considered:**

- **Direct Upstash + manually injected env vars** — true $0 free tier, but split billing and a manual env-var sync chore on token rotation. Marketplace path won on operational simplicity for a two-dev project.
- **Rename in code to KV_\* only** — would have been the simplest patch but breaks the documented `.env.example` for anyone running local Upstash. Dual-name resolution costs ~10 LoC and preserves both setup paths.
- **Skip the env-var rename, manually mirror `KV_*` → `UPSTASH_*` on Vercel** — would have kept the code untouched, but adds an invisible env-var dependency that future Carl would not remember. Code change is the durable solution.

**In-PR fix (#138 H1, pre-merge):** Security review surfaced that `@upstash/ratelimit` fails OPEN on network timeout — the upstream returns `{success: true, reason: "timeout"}` after its internal 5s ceiling, silently bypassing rate-limit during an Upstash outage. Two-line fix in this PR: tighten `Ratelimit.timeout` to 1500ms and add an `isTimeoutAllow()` guard at both call sites (`rateLimitedAction`, `rateLimitRequest`) that promotes timeout-allow to a deny. Two new tests (one per call site) pin the behavior. Brings live tests to 23/23 in this module, 162/162 overall.

**Follow-ups (not blocking #124 closure):**

- #130 — pin production-mode rate-limit shim behavior (separate test surface; the v4 path is now the assumed default and worth a regression guard)
- #139 — per-scope fail-closed when shim is active (defense-in-depth from #138 M1; deliberate punt per [[feedback-friction-vs-security]])
- #140 — hostname allow-list on Upstash REST URL (defense-in-depth from #138 M2; same deliberate punt)
- Per-scope budget ratcheting (especially `AUTH_MAGIC_LINK` → ~5/hr) — file as new issue if not already
- Confirm the Vercel Marketplace billing line item appears as expected on next invoice; if usage is genuinely zero across the month, no surprise

**Pre-merge acceptance (verified):** 159/159 unit tests green (7 new for env precedence in `lib/rate-limit/__tests__/index.test.ts`); typecheck + lint + build clean.

**Post-merge smoke (gates #124 closure):** prod auto-deploy from `main`; 35-request burst against a guarded scope should surface the `rate_limit` toast on the 31st; Vercel logs should stop emitting `[rate-limit] Upstash creds unset in production` on cold start. Update this entry to "verified" once observed.

---

## 2026-05-19 (PM) — M2 — Trip is real — milestone closed

**Decision:** M2's seven planned PRs all landed on `main` with CI + code-reviewer + (where applicable) security-reviewer approval:

- #101 — Wave 0 bootstrap (plan, eslint ignore, shadcn primitives, copy palette M2 keys)
- #102 — Wave 1a magic-link login flow (closes #71)
- #103 — Wave 1b authed layout + header + /trips index
- #105 — Wave 2a trip creation + invite flow with logged-out preview (closes #72 #73)
- #109 — Wave 2b 3-state RSVP UI + glanceable count from declining-whispers view (closes #74)
- #114 — Wave 3 celebrant-weighted date poll + reusable PulsePoll Realtime component (closes #75 #76)

**Load-bearing decisions made during execution (not in the original plan):**

- **invite_preview bucket cutoffs widened to 3/8/20** (originally 1/5/15) to remove the single-attendee enumeration oracle. Caught by security-reviewer on Wave 2a.
- **lib/auth/safe-next.ts** introduced to close a protocol-relative open-redirect (`next=//evil.com`) on `/auth/callback`. Caught on Wave 2a.
- **`AUTH_MAGIC_LINK` rate-limit scope** added on the login server action (originally relied on Supabase server-side throttle; reviewer rejected as inadequate).
- **`trip_members.idempotency_key` unique scope rescoped** from `(trip_id, idempotency_key)` to `(trip_id, user_id, idempotency_key)` to satisfy the per-table ADR for both `accept_invite` and `setRsvpAction`. New migration in Wave 2b.
- **PulsePoll's `subscribeTableConfig` hash-stable dep array** — defensive backstop so an unstable caller (inline literal config) doesn't tear down the Realtime channel on every render. JSDoc'd the stable-reference contract.
- **`/login` deep-link preservation deferred to a follow-up** (#104) — the `x-invoke-path` header sniff was unreliable in Next.js 16 App Router; dropped from Wave 1b in favor of literal `redirect("/login")`.

**Follow-ups filed during M2 (open, milestoned M2):**
- #104 deep-link preservation via middleware
- #106 drop GET on /invite/[token]/accept
- #107 split MINT_INVITE rate-limit scope
- #108 trip-local TZ for date rendering
- #110 revalidatePath on setRsvpAction success
- #111 perf: count exact head:true for organizer declined count
- #112 mint deterministic test user in rsvp e2e
- #113 multi-row coverage for getMyRsvp narrow
- #115 enforce MAX_CANDIDATES_PER_TRIP at DB layer
- #116 handle TIMED_OUT in PulsePoll
- #117 scope PulsePoll __supabaseClient injection seam

Plus the broad e2e auth-fixture gap (storage-state setup that would unblock authenticated e2e in Waves 2b + 3). Recommend filing a meta-issue if not already.

**Out of scope (deferred to M5, per killed-and-deferred.md and the M2 plan):**
- Co-organizer spend cap
- Per-name vote visibility opt-in UI (Wave 3 reserved the prop, but the toggle isn't built)
- Full invite-management UI (currently a placeholder copy block; tokens minted via DB)
- Authenticated multi-actor e2e covering the full create-trip → invite → accept → RSVP → vote loop on mobile-safari (auth fixture blocker)

**Still-open follow-ups (post-M2):** the 11 issues above + any new ones surfaced by the real-trip retrospective (M5 is gated on that).

---

## 2026-05-19 (PM) — proposeDateCandidates 4-cap is app-level; TOCTOU race deferred

**Decision:** The `proposeDateCandidatesAction` enforces
`MAX_CANDIDATES_PER_TRIP = 4` via an app-layer count check before
INSERT. Two concurrent organizers can both pass the check and push
past the cap. We accept this for MVP.

**Rationale:** The expected concurrency on this surface is near-zero
(one organizer typing on their phone). The UI surfaces the cap as a
polite "drop one before adding" message; the actual data-integrity
risk if exceeded is minor (an extra candidate row that can be
deleted).

**When to revisit:** when we see >1 active organizer per trip (Wave
2a shipped `co_organizer`; not yet in UI). At that point, promote
the cap to a `BEFORE INSERT` trigger or PG function — the trigger
pattern is already proven in Wave 3 via
`assert_candidate_not_vetoed_before_vote`. Tracked in #115.

**Caught by:** code-reviewer agent during PR #114 review.

---

## 2026-05-19 (PM) — Unify trip_members idempotency-key scope to (trip_id, user_id, idempotency_key)

**Decision:** Drop the original Wave-2a `(trip_id, idempotency_key)` partial unique on `trip_members.idempotency_key` and replace with `(trip_id, user_id, idempotency_key)`. Update `accept_invite()` lookup to include `user_id`.

**Rationale:** The original Wave-2a index was correct for `accept_invite` (one row per trip per actor) but violated the 2026-05-19 idempotency-scope ADR for `setRsvpAction` (strictly user-scoped). The per-(trip, user, key) scope satisfies both operations: accept_invite still has unique semantics per actor, and setRsvp gets its correct per-user scope. Practical collision risk is zero either way; this fix aligns implementation with the ADR.

**Caught by:** code-reviewer agent during PR #109 review.

---

## 2026-05-19 — M1 foundation + schema — all PRs open, awaiting merge

**Decision:** The M1 execution plan from the same date completed authoring.
Seven PRs are open against `main` with CI green on all:

- #86 — design-system PR checklist (`chore/ds-pr-checklist`)
- #87 — PWA manifest + apple-touch-icon + Vercel Analytics (`feat/pwa-manifest`)
- #88 — copy palettes `lib/copy/empty-states.ts` + `lib/copy/errors.ts`
  (`chore/copy-palettes`)
- #89 — Sentry server + browser + sourcemaps (`feat/sentry`)
- #91 — visual-regression Playwright pixel-diff in CI (`feat/visual-regression-ci`)
- #92 — Upstash rate-limit middleware seam (`feat/rate-limit`)
- #93 — foundation migration + `lib/db/types.ts` sync
  (`feat/m1-foundation-migration`)

Milestone closure happens when the DoD checklist in
`notes/m1-execution-plan.md` is fully ticked — i.e. *after* these PRs land
on `main`, not at the moment this entry is written.

**Load-bearing decisions made *during* execution (not in the original plan
or issue bodies):**

- **One foundation migration file, not one-per-issue.**
  `20260519123255_m1_foundation.sql` is a single timestamped SQL file
  collapsing #20, #21, #22, #23, #24, #25, #26, #66, #67, #70. RLS rewrites
  for the changed tables ship in the same migration as the schema changes
  that triggered them — atomicity over per-issue clarity.
- **`trip_visibility` lands on `announcements`, `itinerary_items`,
  `expenses` *in M1*,** not per-feature in M3. The helper
  `can_see_content(trip_id, visibility)` is the single source of truth for
  content-visibility RLS; pushing the column out of M1 would have meant
  three separate RLS rewrites in M3.
- **`trip_member_days` SELECT is trip-wide for members, not own-row only.**
  The roster view ("who's around on Saturday night?") is the load-bearing
  query and own-row RLS would have forced an N+1 client-side join.
- **Two triggers on `trip_member_days`, not one.** In addition to the
  RSVP=going seed, a second trigger fires on `trips.starts_at/ends_at
  UPDATE` to re-seed days. This covers the common "name the trip first,
  pick dates later" path — without it, members who RSVPd before dates
  were locked would have empty day rows.
- **`content_visibility_grants` deferred to the first `custom`-audience
  consumer (likely M3 announcements).** The polymorphic-by-content-type vs
  per-type join-table decision is left open until there's a real consumer
  to design against. The `trip_visibility` enum already accepts `custom`
  as a value; the grants table can be added without an enum migration.

**Still-open follow-ups (post-M1):**

- **#90** — design-system v2 token + font wiring (deferred from M1; not
  blocking the milestone).
- **Human-only steps from the docs PR (this one):**
  - Vercel dashboard SSO flip (see the ADR entry below).
  - Supabase PAT provisioning for the CI staging-migration workflow in #16.

---

## 2026-05-19 — Vercel preview SSO — off for preview, on for production

**Decision:** Turn SSO **off** for Vercel Preview deployments. Production
stays gated by SSO if/when production handles real attendee data.

**Rationale:** Aligns with the "code is public, data is private"
architecture already accepted for this repo. Preview deploys point at the
staging Supabase project, which holds only test data, so the data-leak
risk on a public preview URL is low. The upside — being able to text a
preview URL to a designer or to the groom for early feedback without
asking them to authenticate against a team they're not on (Vercel Hobby
caps team size at 1) — outweighs the marginal indexing risk.

**Alternatives considered:**

- **Keep SSO on everywhere** — rejected. Adds friction for design feedback
  loops and means the second collaborator can't see their own preview URL
  without an out-of-band login.
- **Lock previews behind a shared static password** — rejected. Vercel's
  password-protect feature is a paid Pro-plan tier; the Hobby plan we're
  on doesn't support it. SSO-off + private staging data is simpler and
  costs nothing.

**Indexing concern:** Vercel preview subdomains return a `noindex` header
by default. Verify with `curl -I` against a preview URL after the flip,
from a logged-out browser, to confirm both the 200 and the noindex header.

**Action items (human-only — `ripcity352`):**

1. Vercel dashboard → Project → Settings → Deployment Protection → set
   Preview to "Only Preview Deployments are not protected" (or equivalent
   per the current Vercel UI).
2. From a logged-out browser, hit a fresh preview URL and confirm `curl -I`
   returns a 200 with `x-robots-tag: noindex` (or equivalent).
3. Track completion as a follow-up comment on #17 after this docs PR
   merges; close #17 only once both steps are verified.

---

## 2026-05-19 — Multi-perspective review: prune + restructure

**Decision:** Replace the Goal 1 / 1.5 / 1.6 / 2 / 3 / 4 / 5 / 6 / 6.5 / 7 / 8
sequence with five milestones (M1–M5). Aggressively prune MVP scope per
six parallel agent reviews (architect, groom persona, best-man persona,
edge-attendees personas, mobile-UX critic, product strategy). Ten issues
closed; eight new ones created. See `notes/killed-and-deferred.md` for the
canonical kill log.

**Rationale:** The original 51-issue roadmap conflated "post-trip earned"
features with "MVP load-bearing" features, and several "delight" items
(Hot Seat, Drumroll, Lock-In Day, Fear List swipe) carried tone or trust
risk that one bad screenshot would crater. The five-bucket structure makes
the **M4 stop-here line** a bright threshold instead of a creeping Goal 6.

**Milestone structure (replaces Goal 1–8):**
- **M1 — Foundation + Schema** — infra + schema primitives + copy palettes
- **M2 — Trip is real** — auth, trip creation, RSVP, bach-specific date poll, logged-out invite preview
- **M3 — Trip is useful** — itinerary first, then announcements + realtime; per-item RSVP UI; "what's happening now" card
- **M4 — Trip is shippable** — domain, microcopy review, a11y pass, ToS stub, send to real attendees. **STOP HERE.**
- **M5 — Earned post-trip** — money pool, expenses, photos, retention loops, multi-tenant pivot. Gated on real-trip retrospective.

**Alternatives considered:**
- Keep the 8-goal sequence — rejected; the goal-numbering hid the stop-here
  line and treated post-trip features as continuous with MVP.
- Two milestones (MVP / post-MVP) — rejected; too coarse to make progress
  visible.

---

## 2026-05-19 — Synthetic PK on `trip_members`; feature FKs target `trip_member_id`

**Decision:** Add `trip_members.id uuid primary key default gen_random_uuid()`.
Drop the existing composite PK `(trip_id, user_id)`. Add partial uniques:
`(trip_id, user_id) where user_id is not null`,
`(trip_id, lower(email)) where email is not null`,
`(trip_id, phone_e164) where phone_e164 is not null`.
Every feature table that currently FKs `(trip_id, user_id)` retargets to
`trip_member_id`.

**Rationale:** The accountless-attendee path (`user_id` nullable) silently
breaks `(trip_id, user_id)` as a PK. Without retargeting feature FKs to
`trip_member_id`, accountless attendees can't be referenced by
`expense_splits`, `lodging_assignments`, `travel_legs`, `availability`,
`itinerary_item_rsvps`. Architect flagged as the single biggest miss in
the original Goal 1.6 plan — the silent retrofit pain the round-2 audit
was already half-baked-in for.

**Implications:**
- `citext` extension on `trip_members.email` for case-insensitive
  magic-link claim matching
- Convention documented in `notes/database-workflow.md`: any feature
  table referencing an attendee uses `trip_member_id`, not `user_id`

**Alternatives considered:**
- Keep composite PK, make `user_id` non-nullable, use a sentinel "shadow"
  user — rejected; auth.users sentinel rows are an anti-pattern and break
  Supabase Auth assumptions.

---

## 2026-05-19 — Defer `audit_log` and `content_visibility_grants` from M1

**Decision:** Pull both out of the foundation migration.
- `audit_log` deferred to M5 (Money Pool). Re-design when revived —
  current single-table polymorphic JSONB before/after is wrong (no FK
  from `row_id`, no useful indexes, JSONB diffs are awkward to query).
  Consider per-table `*_history` tables scoped narrowly to money.
- `content_visibility_grants` deferred until the first `custom` audience
  consumer ships. Land the `trip_visibility` enum now; design the join
  (polymorphic by `content_type, content_id` vs per-type tables) under
  real requirements.

**Rationale:** Both are YAGNI for MVP. Worse, both have unresolved design
questions (polymorphic vs typed for grants; single-table vs per-table for
audit) where the wrong call retrofits expensively. Better to defer than
guess.

**Alternatives considered:**
- Ship the polymorphic versions now — rejected; the "join across UNION
  of content types with no FK integrity" RLS pattern is exactly what we
  want to avoid.

---

## 2026-05-19 — Idempotency unique-index scope is per-table, not uniform

**Decision:** Document in `notes/database-workflow.md` that idempotency
unique-index scope depends on the mutation's actor model.
- Organizer-acting-on-behalf tables (`announcements`, `money_pool_entries`):
  `(trip_id, idempotency_key)`
- Strictly user-scoped mutations (RSVP, availability, per-item RSVP):
  `(trip_id, user_id, idempotency_key)`

**Rationale:** Organizers commonly mutate on behalf of others (posting
announcements, marking someone paid). A `(trip_id, user_id, idempotency_key)`
unique would let two different organizers' replays both succeed because
their `user_id` differs — defeating the point of the key. Per-table
scoping is the only correct shape.

---

## 2026-05-19 — Schema-enforced "going broadcasts, declining whispers"

**Decision:** Three coordinated changes.
1. **Declined-RSVP per-name visibility default = `organizers_only`** —
   enforced via a helper view `trip_members_visible_rsvp(viewer_id)`.
   Non-organizers see aggregate counts only; per-name decline data is
   organizer-only.
2. **Pulse Poll aggregate-only by default** — per-name "going/declining"
   visibility is opt-in *by the voter*, not opt-out.
3. **Dietary as per-item private flag** (`itinerary_item_member_flags`),
   not a profile column on `trip_members`. The original
   `trip_members.dietary_notes` plan stamps an edge attendee's situation
   on their member row, visible across the trip.
4. **Money-Front badge is organizer-private by default** — never
   "passively visible to the group." Organizer can choose to share with
   a one-tap action.

**Rationale:** Principle #7 ("Going broadcasts, declining whispers") and
edge-attendees research flagged these as the wedge that decides whether
marginal attendees use the app or quietly opt out of the trip. Enforcing
asymmetry at the schema layer (not aspirationally) is the only durable
move — UI-layer enforcement gets bypassed the first time someone adds a
debug view.

**Alternatives considered:**
- UI-only convention — rejected; will drift the first time a new screen
  is added.

---

## 2026-05-19 — Trip-date selection is celebrant-weighted (bachelor kind)

**Decision:** For `trip.kind = 'bachelor'`, the trip-date selection flow
is asymmetric: organizer proposes 2–4 candidate windows → celebrant marks
each as `works | works-with-effort | no-go` → other members vote only on
windows the celebrant didn't veto. Generic symmetric polling (every voter
counts equally) lives elsewhere.

**Rationale:** For a bach party the celebrant's availability is the
*constraint*, not one vote among many. Standard equal-vote polling
mis-models this — the celebrant could be outvoted on a weekend that
doesn't work for him. Other trip kinds may add symmetric polling at
multi-template pivot (M5); bachelor is the wedge case.

**Alternatives considered:**
- Symmetric equal-vote polling — rejected; mis-models the celebrant role.
- Organizer picks dates alone — rejected; loses the "we're picking
  together" social affordance.

---

## 2026-05-18 PM — Research wave: roadmap reshape

A second research wave dispatched 8 subagents (personas, UX design,
architect audit, integration feasibility, party/delight, tooling/skills)
plus an initial bachelor-trip-norms research agent. Findings live in
`notes/research/*` (see `notes/research/INDEX.md`). Synthesis +
roadmap-update proposal lives in `notes/synthesis-2026-05-18.md`.

The 15 ADRs that follow are the concrete decisions extracted from that
synthesis. Each is its own entry for archaeology, but they share the
synthesis doc as common context — read it before reading these.

---

## 2026-05-18 PM — Don't encode a default

**Decision:** When designing any user-facing data primitive — RSVP,
expense splits, dietary, dress code, visibility — default to
**per-item granular**, not "uniform attendee assumed and exceptions
opt out." Non-default attendees opt **into** participation, not out
of assumptions.

**Rationale:** Across all six edge-case attendee personas
(`notes/research/persona-edge-attendees.md`) the failure mode is
identical — the app assumes a uniform attendee (fully-funded,
fully-available, fully-typical-diet, drinking, present-for-all-days,
of-the-tribe) and forces anyone who diverges to *self-identify the
divergence*, usually in front of the group. The fix isn't six
special-case features; it's making the primitives granular by
default so every attendee is configuring their own trip from the
same neutral form.

**Implications:**
- Per-item RSVP (not just per-day)
- Per-line itemized money pool (not equal-split-everything)
- Per-event dress code, dietary check, activity tag
- No "budget mode" toggle, no "sober" badge — the granular primitives
  do the work without labeling anyone

**Alternatives considered:**
- Special-case features (sober badge, broke mode, dietary alert) —
  rejected; they segregate the people they're meant to help.

---

## 2026-05-18 PM — Generic `visibility` enum across user-content tables

**Decision:** Every new user-content table (`itinerary_items`,
`announcements`, `polls`, `expenses`, `pins`, `photos`) ships with a
`visibility trip_visibility not null default 'everyone'` column.
Enum values: `everyone | organizers_only | hide_from_celebrant |
custom`. Custom audiences via a `content_visibility_grants` join.

**Rationale:** Per-field surprise visibility is the killer
differentiator from the bach-trip research (every existing tool
assumes one shared view). Sprinkling `visible_to_groom boolean`
across five tables is the retrofit-painful path. One enum +
one column per table = clean RLS clauses like
`using (visibility <> 'hide_from_celebrant' or not is_celebrant)`.

**Alternatives considered:**
- Polymorphic `visibility_rules` table — over-engineered for MVP.
- Boolean column per table — retrofit pain.

---

## 2026-05-18 PM — `is_celebrant` flag on `trip_members` from day one

**Decision:** Add `trip_members.is_celebrant boolean not null
default false` plus a partial unique index
(`where is_celebrant`) capping at one per trip. Ships in the same
migration as the visibility enum above.

**Rationale:** The celebrant (groom / bride / birthday-haver) is
the only attendee that matters for surprise filtering. Without
this column, every visibility RLS policy needs rewriting once
"hide from the celebrant" becomes a feature. One column now =
no rewrite later. For trip kinds with no celebrant (e.g., a ski
trip), `false` for everyone is fine — the flag is opt-in per
trip kind.

**Alternatives considered:**
- Encode celebrant as a `trip_role` enum value — collapses
  `organizer + celebrant` ambiguity (e.g., the groom is also
  the trip creator). Two columns is right.

---

## 2026-05-18 PM — `trip_kind` enum on `trips` from day one

**Decision:** Add `trips.kind trip_kind not null default 'bachelor'`
plus `trips.is_template boolean default false`. The enum starts
with `bachelor` only; `bachelorette`, `ski`, `wedding_weekend`,
`generic` are added as Goal 8 templates ship.

**Rationale:** Every later filter, default-itinerary seed,
theming hook, and analytics cut depends on the kind column
existing. Adding it post-launch is trivial; backfilling
untyped trips with heuristics is not. The
`/lib/templates/<kind>.ts` config files (palette, copy, default
tags) read from this enum.

**Alternatives considered:**
- Defer to Goal 8 — column is load-bearing for templates;
  adding it later means every existing trip needs a backfill
  + a heuristic for "is this a bach party?".

---

## 2026-05-18 PM — Accountless attendees: decouple `trip_members.user_id` from `auth.users`

**Decision:** Make `trip_members.user_id uuid nullable` and add
`display_name text`, `phone_e164 text`, `email text` columns.
A member can exist on a trip *without* an auth.users row;
they "claim" the membership on first magic-link login.

**Rationale:** The "guy who won't download anything" is real
(per audience research). Splid's wedge ("host has account,
attendees don't") is gated by this decoupling. Refactor
post-launch is one of the worst in social-app history —
every RLS policy, every FK, every `/lib/db/` query function
touched. Pay the cost now or pay 10× later.

**RLS implications:** Policies that currently key on
`auth.uid() = user_id` get a second clause for the
shadow-attendee path. Documented as part of the migration.

**Alternatives considered:**
- Separate `shadow_profiles` table — more tables, more JOINs,
  harder RLS. Nullable `user_id` is simpler.

---

## 2026-05-18 PM — Idempotency keys on mutation-heavy tables

**Decision:** Every mutation-heavy table
(`money_pool_entries`, `expenses`, `announcements`, future
`pins`, `polls`) ships with `idempotency_key uuid` + partial
unique index. Server actions accept a client-generated key per
invocation; double-submit = no-op.

**Rationale:** The actual use case is drunk-user-on-bad-cell-
signal double-tapping "mark paid." Without idempotency, this
creates two rows and a support nightmare. One column + one
index per table.

**Alternatives considered:**
- Database-level dedup via constraints on `(user_id,
  amount_cents, created_at-bucket)` — fragile and surprising.
- App-level dedup with timestamp windows — same fragility.

---

## 2026-05-18 PM — Currency-aware money fields from day one

**Decision:** Every money column ships with a
`currency char(3) not null default 'USD'` sibling. Applies to
`expenses`, future `money_pool_entries`, future tip/fee
columns.

**Rationale:** `amount_cents` assumes USD implicitly. The
destination-wedding-in-Mexico use case breaks this. One
column now = no migration pain at the first
international trip. Cost: 3 bytes per row, no code change at
MVP since everything reads `default 'USD'`.

**Alternatives considered:**
- Defer to "internationalization sprint" — there is no such
  sprint planned; gets retrofitted on demand under pressure.

---

## 2026-05-18 PM — Photo storage is Supabase Storage, not Google Photos

**Decision:** Goal 7 photo wall stores photos in Supabase
Storage. Google Photos integration is link-out only (organizer
pastes a shared-album URL, we render a tile).

**Rationale:** Google killed the
`photoslibrary.sharing` / `photoslibrary` / `photoslibrary.readonly`
scopes on **March 31, 2025**. `sharedAlbums.share/.join/.leave`
all return `403 PERMISSION_DENIED`. We can technically upload via
`photoslibrary.appendonly` but only our app can see those albums —
useless for sharing with a roster.

**Trade-offs accepted:** We host the storage cost. Mitigated by
photo expiry default (90d) and per-trip storage cap (both already
in Goal 7 DoD).

**Reference:** `notes/research/integration-feasibility.md` §3.

---

## 2026-05-18 PM — Splitwise = deep-link prefill, not bidirectional sync

**Decision:** When/if Splitwise integration ships, it's a
deep-link prefill flow (open Splitwise with the expense pre-filled,
user taps save). NOT bidirectional create-expense-from-our-app.

**Rationale:** Splitwise's free tier caps users at **3 expenses
per day** as of 2024, with a 10-second cooldown and ads. Any flow
that creates expenses via API burns the user's free-tier quota and
makes our app look broken. Deep-link prefill respects whatever
plan the user is on.

**Reference:** `notes/research/integration-feasibility.md` §1.

---

## 2026-05-18 PM — Stripe Connect language: "deposit + delayed payout," never "escrow"

**Decision:** All copy + decisions.md + docs use "deposit and
delayed payout" (Stripe's actual product) not "escrow" (which
Stripe does NOT offer). The mechanic for the bachelor party: charge
attendees → hold in platform balance → delayed payout to organizer
up to 90 days max (Custom/Express only). Goal 6.5 stays
informational/Venmo-deep-link; real Stripe is a separate decision
at Goal 7+.

**Rationale:** "Escrow" is a regulated term implying funds held by
a neutral third party with statutory protections. Stripe Connect is
not that. Using the wrong word in copy or contracts is a
legal-precision issue. Per Stripe support and
[connect/manual-payouts](https://docs.stripe.com/connect/manual-payouts),
delayed payout ≤90 days is the available behavior.

**Reference:** `notes/research/integration-feasibility.md` §2.

---

## 2026-05-18 PM — No SMS at MVP; email-first for transactional

**Decision:** Magic-link auth and all transactional notifications
ship via email (Resend at Goal 4). SMS via Twilio is deferred
until users explicitly ask.

**Rationale:** US **A2P 10DLC** registration is mandatory for SMS
sending (~$19 one-time + $4/mo per campaign + $0.003/msg + carrier
fees). Group MMS to >10 recipients is filtered aggressively. There
is no programmatic iMessage send for third parties. Email beats
SMS in 2026 for "trip created" / "you have an invite" / "RSVP
cliff approaching" — same delivery rate, no carrier compliance.

**Trade-offs accepted:** The friend without an inbox-checking
habit may miss the magic link. Magic-link email is short-lived;
the invite link itself remains shareable in iMessage.

**Reference:** `notes/research/integration-feasibility.md` §10.

---

## 2026-05-18 PM — Notification outbox + dispatcher seam from Goal 4

**Decision:** Even though Goal 4 ships only realtime broadcasts (no
email/SMS yet), introduce a `notifications` outbox table + single
dispatcher function from the start. Every server action that needs
to notify writes to the outbox; the dispatcher fans out to channels
(realtime now, email later, push later).

**Rationale:** Resend / Sentry / push will each be tempting as
ad-hoc calls from server actions. Once one lands, every later
channel becomes a parallel ad-hoc call, and there's no single
place to apply per-user mute, batching, retry, or
delivery-receipt logic. Build the seam at Goal 4 even with one
channel; add channels as needed.

**Alternatives considered:**
- Wait until 2 channels exist — by then the cleanup is rework.

---

## 2026-05-18 PM — Tooling defaults: Supabase MCP + Vercel MCP authenticated; disable noise plugins

**Decision:** Authenticate the Supabase MCP server and the
Vercel MCP server in this project. Disable the following
plugins (re-enable on demand for a specific session):
`voltagent-core-dev`, `figma`, `shopify`, `shopify-ai-toolkit`,
`feature-dev`, `claude-md-management`.

**Rationale:** Supabase MCP exposes `execute_sql` (iterate on
schema in-session without writing migration history),
`get_advisors` (RLS lint), and `search_docs` (current docs) —
single highest-ROI MCP for our stack. Vercel MCP is read-only
deployment / log inspection for "why did the preview fail?".
The disabled plugins either cover the wrong domain
(`shopify`, `figma`) or duplicate global agents the
performance.md rules already select for (`voltagent-core-dev`,
`feature-dev`).

**Reference:** `notes/research/tooling-and-skills.md` §3, §7.

---

## 2026-05-18 PM — App voice/personality is load-bearing

**Decision:** Every UI string ships under a one-question voice
test: *"Would you say this out loud at a pre-trip dinner?"*. If
yes, ship. If it sounds like a SaaS onboarding email, rewrite.
This becomes a PR-template checklist item for any UI-touching
PR.

**Style boundary conditions:**
- RIGHT: warm, irreverent, self-aware, specific to the occasion
  (Partiful invite copy, Cash App confirmations, the best-man
  speech that lands without cringe)
- WRONG: corporate enthusiasm, hollow hype, frat-coded,
  passive-aggressive, gender-assuming, penis-coded

**Rationale:** Three personas independently flagged voice as
load-bearing — the groom (anti-cringe), the best man
(system-as-shield not nag), the +1 bridge (warm not
performative). Bad voice is the #1 reversible feature that
turns the app from "celebration tool" into "Asana for
friends."

**Reference:**
`notes/research/ux-design-principles.md` Personality & Voice.

---

## 2026-05-18 PM — Roles add micro-affordances, not gates

**Decision:** Role differences (celebrant, organizer,
co-organizer, member, +1) surface as **UI micro-affordances**
(a private drawer, a badge graphic, one bespoke string per
phase) not as access-denied messages. Celebrant doesn't see
"you can't edit the itinerary"; celebrant sees *"Dave's got
this. Here's what they're cooking up."*

**Rationale:** Per `notes/research/fun-and-delight.md` "roles
as personality" — same DB column, different UI treatment per
role. The +1 explicitly does NOT want a "newcomer" badge
(`persona-edge-attendees.md`). The co-organizer's spend cap
reads as a perk ("trusted lieutenant"), not a limit. The
celebrant's hidden-content view is a blurred card, not a
missing slot.

**Implementation principle:** roles map to columns in the DB
schema; UI never references the column name directly.

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
