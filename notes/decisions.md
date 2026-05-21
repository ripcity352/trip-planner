# Decisions

Append-only log of architectural decisions and trade-offs. New entries at
the top. Format: date, decision, rationale, alternatives considered.

---

## 2026-05-21 — M5 — auth redesign — milestone closed

**Decision:** M5 closed. The v3.2 auth redesign shipped across 5
sequential PRs (#226 PR1 foundation → #227 PR2 password form → #228 PR3
template flip → #229 PR4 /account/sign-in-and-security → #231 PR5
Google OAuth + State B). Phase 6 closure walk on
`https://travelston.com` verified the end-to-end chain
(OTP sign-in → State C atomic recovery → password sign-in → /trips)
on production at 375×812. M3/M4 overrides A–I held; Override J
(deploy-ordering enforcement) earned its keep on PR3.

See `notes/retros/m5-retro.md` for the full closure retrospective
(reconciled from parallel code-reviewer + senior-engineer agent lenses
plus the production walk findings).

**What shipped (verified end-to-end on production):**

- Email + password as primary auth path (`signInWithPasswordAction`)
- 6-digit OTP code as fallback (`requestEmailCode` /
  `verifyEmailCodeAction` — Supabase template flipped from
  `{{ .ConfirmationURL }}` to `{{ .Token }}`)
- `signUpAction` for explicit signup (no auto-provision on first
  password attempt)
- `signInWithOAuthAction` for Google OAuth — button renders, server
  action wired; full round-trip walk deferred (Supabase Dashboard
  provider step pending)
- `/account/sign-in-and-security` route with State A/A+/B/C state
  machine, `changePasswordAction` (re-auth + `signOut({scope:'others'})`),
  and the atomic `setPasswordViaRecoveryAction({token, newPassword})`
  for State C OTP-recovery (PR4 HIGH-1 fix-up — the canonical
  atomic-action pattern)
- Three new rate-limit scopes: `AUTH_OTP_VERIFY` (renamed),
  `AUTH_PASSWORD`, `AUTH_CHANGE_PASSWORD`
- Inline auth on `/invite/[token]` — anon viewer sees the form on the
  preview card without bouncing through `/login?next=`
- Voice-locked canonical strings in `lib/copy/auth.ts` (~50 keys)
  pinned by `lib/copy/__tests__/m5-auth-voice-locks.test.ts`
- Consolidated v3.2 ADR section above this entry (PR3 + PR5 addendum)
- Runbook `notes/runbooks/auth-setup.md` (renamed from
  `auth-template-flip.md`) covers the operator's Supabase Dashboard
  click-path for both the OTP template flip and the Google OAuth
  provider setup

**Load-bearing decisions made during execution:**

1. **Atomic-action pattern for recovery flows (PR4 HIGH-1 fix-up
   `de83f8e`).** The original State C two-action sequence
   (`verifyEmailCodeAction` → `setPasswordAfterRecoveryAction`) was
   bypassable: any authed session satisfied `auth.getUser() != null`
   without proving OTP possession. Collapsed to a single
   `setPasswordViaRecoveryAction({token, newPassword})` where `verifyOtp`
   short-circuits before `updateUser` inside one `rateLimitedAction`
   closure. **Canonical pattern: any "verify-then-mutate" two-action
   sequence in an auth/recovery flow collapses to one atomic action
   where the credential is passed into the mutating action.**

2. **Override J (deploy-ordering enforcement) for milestone-coupled
   dashboard steps.** PR3 paired code with a Supabase Dashboard
   template flip + 1-hour drain. Flip timestamp recorded in PR body,
   `Monitor` watcher ran the drain, production walk caught a
   Supabase OTP-length config drift (set to 8, code expected 6) that
   no CI / typecheck / preview could have caught. Operator fixed in
   dashboard mid-walk. Carry pattern forward to any milestone pairing
   code with a dashboard/provider step.

3. **Dead-code wiring stripped from PR5 (HIGH-1 fix-up `9cefeef`).**
   The `OAuthExistingUserAlert` UI + tests + e2e + voice-locks all
   referenced an `auth_email_taken_oauth` error key that no server
   path returned. Detection requires server-side identity probing,
   which can't be done from app code without service-role access (banned
   per CLAUDE.md). UI scaffolding stripped; copy keys + voice-locks
   retained for the M5-followup PR; **issue #232** tracks proper
   detection via a new SECURITY DEFINER RPC or app-schema
   `has_password` tracking.

4. **OAuth-start has no inner rate-limit; middleware path-throttle
   handles per-IP at the edge (PR5 HIGH-2 fix-up `9cefeef`).** The
   original `signInWithOAuthAction` wrapped the call in
   `rateLimitedAction(AUTH_PASSWORD, "oauth-start", ...)` — a fixed
   key bucket that any single client could exhaust globally for 15
   minutes. Removed the inner limiter; rely on the existing
   `GUARDED_PATH_PATTERNS` for `/login` which keys by IP.

5. **`app/page.tsx` kept as-is.** The marketing landing page's CTA
   "Sign in to your trip" → `/login` is auth-method-agnostic — works
   for password / OTP / OAuth equally. No update needed; Override G
   acknowledged.

**Verified `[v]` (Phase 6 production walk, 2026-05-21 ~20:55-21:33 UTC):**

- `/login` email-only mode → password mode → "Email me a code instead"
  → real-inbox 6-digit code → `verifyEmailCodeAction` → `/trips` ✓
- H3 button order on password mode: Sign in → Email me a code →
  Continue with Google ✓
- `/account/sign-in-and-security` middleware redirect for anon → ✓
  (PR4 preview smoke + Phase 6 confirmation)
- State C OTP recovery: form C-verify → C-set → atomic
  `setPasswordViaRecoveryAction({token, newPassword})` → success toast
  *"Password updated. Other devices were signed out."* ✓
- Invalid token bounces form back to C-verify with voice-correct error
  *"That code didn't take. Double-check or get a fresh one."* ✓
- Sign out → email + password sign-in → `/trips` with existing trip
  data — confirms `signInWithPassword` works against the password that
  was set by State C ✓

**Deferred / carry-forward (`[v]` not yet ticked):**

- Google OAuth round-trip + State B set-password — requires Supabase
  Dashboard Google provider enabled + Vercel/Supabase env vars set.
  Operator chose to defer; tracks in **#232**.
- Cross-device `signOut({scope:'others'})` verification — covered by
  `e2e/account-change-password.spec.ts`; not exercised on production.
- Resend sender domain (`travelston.com`) verification — carried
  forward from M4 in **#135**. Phase 6 walk used the default Supabase
  sender; the carry remains open until Resend is verified.

**Newly filed M5 carry-back follow-ups:**

- **#230** — chronic flake in `components/trip/__tests__/rsvp-toggle.test.tsx:192`.
  Flaked in M4, flaked again on PR4's first CI run, passed on re-run with no
  code change. Two-deferral threshold hit. Gate M6 Wave 0 on the fix.
- **#232** — OAuth-existing-user alert detection wiring. UI scaffolding
  stripped from PR5 fix-up; copy keys + voice-locks retained for the
  follow-up PR.
- **#233** — `/account/sign-in-and-security` renders State A for OTP-only
  users (identity check is provider-only, not password-set). Discovered
  during Phase 6 walk. State C recovery path is unaffected; first-arrival
  UX is wrong. Recommended fix: track `has_password` in app schema
  (option 3 in the issue body — no service-role API required).

**Process learnings carried to M6 (from the retro):**

1. **Phantom-wiring audit** — pre-merge reviewer prompt: for each new
   error key / copy key / state branch, `rg <symbol>` must show both a
   producer AND a consumer. Only consumers → flag dead-code HIGH.
2. **`(human-step)` annotations** at plan-lock time for items requiring
   Dashboard, RPC creation, or third-party setup — the TDD chain
   stubs-and-defers rather than fake-and-passes.
3. **Pre-commit grep flagging tdd-guide softens-prod-for-tests
   patterns** — same class as M4's tdd-guide-hallucination, caught
   pre-review on PR2 (`0054bfd`).
4. **Atomic-action pattern codified** above; reviewer prompt: any
   multi-step auth action is one rate-limited closure.
5. **Supabase dashboard config-drift checklist** — pre-walk eyeball
   checks (OTP Length, Site URL, template body, Google OAuth state)
   should land in `notes/runbooks/auth-setup.md`. Next walk a glance,
   not a discovery.

**Memory:**
- `~/.claude/projects/-Users-carlchang-Projects-Party-Trip/memory/feedback_friction_vs_security.md`
  — updated alongside this closure to reflect M5's new reality
  (password + OTP + OAuth, magic-link demoted to recovery primitive).
  The underlying principle (low-friction default, defense-in-depth
  only where the actual threat model demands it) holds.

**Bright line unchanged from M4:** *use the app for one real bachelor
party.* M5 made the auth flow real; whether M1–M5 are sufficient is
still the post-trip retrospective gate. **Don't start M6 just because
the chain is green — gate on the actual trip.**

---

## 2026-05-21 — M5 auth redesign — password + OTP + OAuth (PR3 template flip)

**Decision:** Replace Supabase magic-link-as-primary with email+password
(primary) + 6-digit OTP code (fallback) + Google OAuth (alternative; PR5).
Magic link demoted to verification/recovery primitive only. Add
`/account/sign-in-and-security` for password rotation (PR4). Threat model
is bachelor-party-insider per `feedback_friction_vs_security` memory
note — friction < defense-in-depth, rate-limiting is the load-bearing
brute-force control.

**Supersedes:** the M3 W0c decision to use magic-link-via-`token_hash`
URLs as the primary auth path. The `token_hash` branch is deleted from
`lib/auth/callback-handler.ts` in this PR after the 1-hour link-drain.

### Why 6-character minimum password with no complexity rules

For a 12-person bachelor party, the realistic attack is an organizer
guessing another organizer's password. The defense against that is rate
limiting (`AUTH_PASSWORD`, 5 attempts / 15 min per email), not character
classes. Forcing "must contain a number and symbol" produces SaaS-y
friction that the user explicitly does not want and that the threat
model does not require. 6 characters is the floor below which even a
trivial brute-force becomes too cheap; above the floor, the rate limit
does the work.

**Alternatives considered:** 8+ characters with class rules; zxcvbn-style
strength meter; HaveIBeenPwned breach check. All rejected — each adds
user-perceptible friction without changing the threat-model math.

### Why no HaveIBeenPwned breach check

HIBP catches passwords reused from public breaches. At insider-only
scale (12 people, all known to the organizer), a breached-password
match is more likely to be a false-positive (Dave reuses his Spotify
password) than a true positive. The fetch also adds latency to the
sign-in path and a third-party dependency. Rejected.

### Why no recent-reauth gate before password change

A recent-reauth gate ("you must enter your current password again
within the last 5 minutes to change it") defends against session-
hijack scenarios where the attacker has cookie access but not the
plaintext password. At this threat tier — insider-only, 12-person
trip — single-device-pwn = game over is the accepted floor. If
someone has Dave's unlocked phone, the trip is already over and a
recent-reauth gate doesn't change that. Rejected.

### Why no separate `/forgot-password` route

The 6-digit OTP fallback already serves as the recovery primitive.
A separate password-reset route would duplicate the email-code flow
under a different name. Users who forget their password tap "Email
me a code instead" on `/login`, get a 6-digit code, and (in PR4) can
set a new password from `/account/sign-in-and-security` via the
State C sub-flow. The single recovery primitive is cleaner.

### Why no "remove password" affordance in account UI

Footgun. If a user removes their password, they're left with OTP-as-
sole-auth, which is fine until they delete the email or change
addresses. Account-locked scenarios are recoverable for the owner
but painful for the user; not worth the surface area.

### Why we accept the OAuth-user-typing-password enumeration leak (PR5)

When PR5 lands, an attacker who types a wrong password for an email
that exists with a Google-only identity will see *"You signed up with
Google. Sign in with Google, or get a code emailed instead?"* — a
strong enumeration oracle. This is acceptable at this threat tier:

- The leak requires a `wrong-password` event on a real account, gated
  behind `AUTH_PASSWORD` rate-limit (5/15min per email).
- The user-experience gain is large — a confused organizer who forgot
  they signed up with Google sees an actionable prompt instead of a
  generic error.

Suppressing the leak would either require silent re-routing (poor UX)
or a generic error message that fails to help the legitimate user.

### Why State B (PR5) has no OTP gate before set-password

State B is the set-password flow for users who signed in via OAuth or
OTP and want to add a password. They are *already authenticated* via
their existing identity. An additional OTP gate would force a fresh
code email for a user who just clicked through one. The invite-flow
auto-signin precedent (M2 — accept-invite auto-creates the session
without an additional challenge) is the same reasoning. Asymmetric
with the password-change flow (PR4), which DOES verify the current
password — but that's because the current password is the existing
credential to be rotated. State B has no existing credential to
verify; the existing identity is the verification.

### PR5 addendum — State B no-OTP-gate rationale (2026-05-21)

This section expands the brief bullet above with the full threat-model
reasoning, written as the spec was locked (v3.2) and confirmed during PR5
implementation. It is NOT a re-litigation — this is the decision the operator
already made. The purpose is to document the reasoning deeply enough that
a future reviewer can reconstruct it without re-opening the spec conversation.

**The attack scenario for State B:**

A malicious actor has access to the victim's authenticated browser session
(borrowed laptop, unattended phone, XSS-escalated session token). They
navigate to `/account/sign-in-and-security`, see the State B form (because
the victim is an OAuth-only user), and set a password of their choosing.

**Why this is accepted:**

1. **The victim is NOT locked out.** The victim's Google OAuth identity
   remains intact. The attacker added a credential; they did NOT replace
   or remove the existing one. The victim can still sign in via Google
   and then (now that they have State A, not State B) change or remove
   the attacker's password via the existing `changePasswordAction`.

2. **The OTP gate would not meaningfully close the gap.** If an attacker
   has session-level access, they can also trigger the OTP request email.
   On a borrowed laptop, the victim's email inbox may also be open. The
   OTP gate is effective when we are trying to prove identity before
   crossing a privilege boundary (State C's rationale). In State B, we
   are not crossing such a boundary — the user is already authenticated
   at a session level.

3. **The invite-flow auto-signin precedent.** M2's accept-invite flow
   creates an authenticated session without a separate challenge after
   the invite link is clicked. That invite link IS the proof of
   identity. State B is structurally similar: the OAuth session IS the
   proof of identity. Both flows accept the risk of borrowed-session
   abuse as the price of frictionless UX for the real-trip use case.

4. **The friction cost is real.** The target user (bachelor-party
   attendee, likely on a phone, likely arriving via a group-chat link)
   setting a password for the first time after Google sign-in should
   not be interrupted by a second email code. The friction cost to
   legitimate users is high; the security benefit (against an attacker
   who already has session access) is low.

**What we DID NOT do (and why):**

- `signOut({scope:'others'})` after `setPasswordAction`: would log the
  current session out of other devices, which is surprising when the
  user just ADDED a credential rather than rotated one. No prior
  credential exists to invalidate.

- An OTP gate: see reasoning above (point 2). Explicitly rejected in
  the v3.2 spec and confirmed in PR5 implementation.

**The load-bearing memory file:**
`~/.claude/projects/-Users-carlchang-Projects-Party-Trip/memory/feedback_friction_vs_security.md`
encodes this trade-off at the project level. State B is a specific
instance of the general principle: "default to simplest auth/security
pattern that meets the actual (bachelor-party) threat model."

### Rate-limit posture

| Scope | Budget | Fail-closed on shim? |
|---|---|---|
| `AUTH_OTP_VERIFY` | 30/60s (default) | No (allow-with-warning during bootstrap) |
| `AUTH_PASSWORD` | 5/15 min per email | No (same rationale) |
| `AUTH_CHANGE_PASSWORD` (PR4) | 5/15 min per user | No |

The `FAIL_CLOSED_ON_SHIM` posture matches the existing
`AUTH_OTP_VERIFY` precedent — bootstrapping deploys without Upstash
should still allow auth (the deployment is too small to have an
abuse vector at that stage). The loud `console.error` in the shim
catches a future regression where Upstash provisioning silently
drops.

### M5 ship sequence (umbrella #220)

- **PR1 (#226):** widened `verifyOtp` to accept both `token_hash`
  (legacy) and `token + email + type` (new). Scope rename
  `AUTH_MAGIC_LINK` → `AUTH_OTP_VERIFY`. Merged 2026-05-21.
- **PR2 (#227):** progressive-disclosure form, `signInWithPasswordAction`,
  `signUpAction`, `verifyEmailCodeAction`, `requestEmailCode` (renamed),
  `AUTH_PASSWORD` rate-limit, inline auth on `/invite/[token]`,
  `lib/copy/auth.ts` palette. Merged 2026-05-21.
- **PR3 (#228, this PR):** Supabase Dashboard email-template flip
  ({{ .ConfirmationURL }} → {{ .Token }}), 1-hour link drain, deletion
  of the legacy `token_hash` branch from the callback handler, this
  ADR, `CLAUDE.md` auth-block update, runbook
  `notes/runbooks/auth-template-flip.md`. Closes #206.
- **PR4 (#224, next):** `/account/sign-in-and-security` page with State
  A / A+ / C; `changePasswordAction` with server-side email pinning +
  `signOut({scope:'others'})`; `AUTH_CHANGE_PASSWORD` rate-limit.
- **PR5 (#225, last):** Google OAuth + State B (set-password for
  identity-only users). Appends State-B-OTP-drop rationale to this
  same ADR.

**Alternatives considered for the sequencing:**

- Bundling PR3's dashboard flip into PR2: rejected because the 1-hour
  drain requires a holding pattern that breaks the per-PR workflow.
- Doing PR4+PR5 first (before the template flip): rejected because
  PR5's State B touches the same `_form.tsx` and `actions.ts` files
  as PR2, and parallel waves on a 360-LOC client component are a
  collision risk. The sequential plan is also simpler to reason
  about for the operator performing the dashboard flips.

**Memory:**
- `~/.claude/projects/-Users-carlchang-Projects-Party-Trip/memory/feedback_friction_vs_security.md` is load-bearing for every "no" above. Re-read it before flagging any of these decisions in a future PR review.
- `~/.claude/projects/-Users-carlchang-Projects-Party-Trip/memory/project_m5_auth_redesign.md` tracks the milestone status.

---

## 2026-05-21 — M4 — Trip is shippable — milestone closed

**Decision:** M4 closed. The MVP is shipped: five-tab IA, structured
inputs with freeform fallback, themed persimmon design system, legal
stubs, axe/Lighthouse a11y pass, and 15 wave PRs (#190–#204) plus this
closure PR landed on `main`. The app is real-trip ready. Per
`notes/roadmap.md`, **stop here** — use it for the actual bachelor
party, then gate M5 on the retro.

**What shipped (16 PRs):**

- **#190** — W0a: plan doc + copy/data lock, M4 execution plan bootstrap.
- **#191** — W0e: test infra — multi-persona fixtures (`seed-test-organizer`,
  `seed-test-celebrant`), `STORAGE_STATE_ORGANIZER_PATH`,
  `STORAGE_STATE_CELEBRANT_PATH`, `asOrganizer()` / `asCelebrant()` helpers.
- **#192** — W0b: carry-back migration (Deltas 1–7): `getFlagsForItem`
  data layer (#Delta 1), `trips.timezone` column (#Delta 2),
  `setTripNotes revalidatePath` (#159 / Delta 4), `invites` UPDATE RLS
  policy (#Delta 5), `trip_members` SELECT tightening (#Delta 6),
  `idempotency_key` on `createInviteAction` (#158 / Delta 7).
- **#193** — W0c: Google Places autocomplete server proxy (`/api/places/autocomplete`),
  `SCOPE_BUDGETS` wired through `buildUpstashLimiter` (Deltas 8 + 9),
  `MINT_INVITE` hardened to 10/hour, invite GET route drop.
- **#194** — W0d: bottom tab bar (`home / plans / posts / crew / me`),
  `/me` skeleton, deep-link middleware, `edit-item-form-sheet.tsx` pre-split
  into per-field sub-components.
- **#195** — W1a: dress-code preset chips (#163).
- **#196** — W1b: activity-tag chip picker (#164).
- **#197** — W1c: per-item member-flag chips + organizer view + member
  self-read (#165).
- **#199** — W2a: Places UI consumer + `address_place_id` persistence (#166).
- **#200** — W2b: `datetime-local` widget + trip timezone support (#167, #108),
  `trips.timezone` added to `TRIP_COLUMNS`.
- **#198** — W2c: airline picker + IATA enforcement + `CARRIER_SANITIZE_REGEX`
  corrected (#168).
- **#201** — W3a: theming pass — persimmon design tokens, focus-ring,
  hero image (#90, #121).
- **#202** — W3b: RSVP color + icon (color never the only signal) (#45).
- **#203** — W4a: legal stubs — `/legal/terms` + `/legal/privacy` (#81).
- **#204** — W4b: prod-walk fixes + `@axe-core/playwright` a11y sweep (#82).
- **W4c** (this PR): closure — retro authored, ADR recorded, roadmap updated,
  `CLAUDE.md` updated, m4-golden-path e2e spec, deployment-readiness
  closure status.

**Load-bearing decisions made during execution:**

1. **Wave 0 split into 5 sub-PRs (W0a–W0e)** after Lazy-Path Audit 1
   flagged the fat-PR risk. A single "M4 carry-back" PR would have been
   ~900 LOC across 20+ files — well above the per-PR ceiling and a
   collision hazard for the parallel structured-inputs wave. Splitting
   into W0a (plan), W0b (DB carry-back), W0c (proxy + rate-limit),
   W0d (nav), W0e (test infra) allowed Wave 1 to start in parallel
   against a stable base.

2. **`edit-item-form-sheet.tsx` pre-split into per-field sub-components**
   (W0d) to avoid a 4-way line-collision risk. Wave 1 agents (W1a dress
   code, W1b activity tag, W1c member flag) would each have needed to
   edit the same form component. The pre-split gave each wave its own
   file surface.

3. **`date-fns-tz` as a direct dependency (W2b).** `date-fns` alone
   cannot convert a UTC timestamp into a named timezone slot (e.g.
   `America/Los_Angeles`). The alternative — using the Intl API directly —
   produces format strings inconsistent with the existing `date-fns`
   usage across the codebase. `date-fns-tz` is the canonical companion
   library; adding it as a direct dep (not a devDep) is correct because
   it ships in the app bundle.

4. **`@axe-core/playwright` as a dev dependency (W4b).** The axe sweep
   runs in e2e specs only — never in the app bundle. `devDependencies`
   is the right home. The alternative (using `axe-core` directly with a
   custom runner) was rejected as unnecessary complexity given that
   `@axe-core/playwright` is the first-party companion.

5. **`SCOPE_BUDGETS` wiring fix (W0c).** W0c initially shipped
   `SCOPE_BUDGETS` as a declarative config object only — the values were
   defined but never passed through `buildUpstashLimiter`. Code-reviewer
   flagged this HIGH: the rate-limit scopes were completely bypassed in
   production. The consolidated fix-up wired all scopes through
   `buildUpstashLimiter` in the same W0c PR before merge.

6. **`trips.timezone` added to `TRIP_COLUMNS` (W2b).** The `datetime-local`
   widget wrote `trips.timezone` to the DB, but the shared `TRIP_COLUMNS`
   select constant — used in every `getTrip` call — did not include the
   new column. Security-reviewer caught this as a silent data-loss bug:
   the UI would render with an undefined timezone on every page that used
   the shared query, silently falling back to UTC. The fix added
   `timezone` to `TRIP_COLUMNS` in the same W2b PR.

7. **Airline picker `CARRIER_SANITIZE_REGEX` swap from `/[ \r\n]/g` to
   `/[\0\r\n]/g` (W2c).** The original regex stripped spaces from carrier
   names, which would corrupt airline names like "Air Canada" to
   "AirCanada." Code-reviewer and security-reviewer both flagged this
   CRITICAL: the intent was to strip NUL, carriage return, and newline
   (injection vectors), not spaces. The fix swapped space (`\x20`) for
   NUL (`\0`) in the character class.

**Verified DoD:** see `notes/m4-execution-plan.md` DoD checklist. All
`[d]` ticks landed wave-by-wave at PR merge. `[v]` ticks will land after
the production walk on travelston.com (orchestrator's responsibility
post-merge).

**MVP target reset:** M1–M4 are done. **Next: real-trip retrospective
gates M5.** See `notes/retros/m4-retro.md` for the full retro.

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

## 2026-05-20 — M4 sim: full-filter wins for hide_from_celebrant + decoy-item workaround pattern

**Decision:** For `visibility=hide_from_celebrant` content, the existing
M3 RLS-filter shape — row excluded from the celebrant's `SELECT`
entirely, no slot rendered — is the right answer. The frosted-blur
pattern described in `notes/research/ux-design-principles.md:51-73`
(celebrant sees the slot, content blurred) is **out of scope for M4
and most likely M5**. Revisit only if a real-trip retrospective
surfaces a concrete "celebrant felt the absence" moment.

For multi-hour surprise windows where the celebrant might notice a
literal time-gap, organizers use the **decoy-item pattern**: add a
`visibility=everyone` decoy item ("free time / regroup at 5:30",
"recovery at the Airbnb") in the same slot. Honest, no lie, fills the
gap. Works in M3+M4 today, zero schema change.

**Rationale:**

Three sources had to be reconciled:

1. `notes/research/persona-groom.md:41` — full-filter (celebrant
   doesn't see the slot at all).
2. M3 shipped RLS shape — `can_see_content()` (m1 migration:171–188) is
   a **boolean predicate** used inside the itinerary `SELECT` policy
   (m3 migration:233–237). Row is filtered server-side; client never
   receives it. Full-filter.
3. `notes/research/ux-design-principles.md:51-73` — frosted blur with
   slot visible.

Two of three sources agree. The technical critic (re-audit batch 2)
verified the blur path would require a **new masked-SELECT shape**:
`can_see_content()` is boolean, not a sanitizer, so a blur surface
would need either a separate view exposing slot metadata (`day`,
`start_time`, `category`) without the content, or a SECURITY DEFINER
RPC returning a sanitized projection. That's a new query path and a
new RLS surface. The full-filter pattern that already ships does the
right thing for the persona — `roadmap.md:194` STOP HERE held.

The celebrant walk independently surfaced the same call:
*"a frosted 9pm card with `Saturday 9pm · Activity` metadata visible
is a teaser by another name, and David would have started guessing.
Filter wins; just write it down."* (`findings-celebrant.md:168`)

**Decoy-item workaround pattern (LOAD-BEARING):**

The critic re-audited the decoy pattern against current RLS
(`findings-critic.md` re-audit batch 2):

- Celebrant `SELECT` returns only the `everyone` decoy row;
  organizer `SELECT` returns both. ✓
- No `(trip_id, day, start_time)` uniqueness constraint on
  `itinerary_items` — two items at the same slot is structurally
  indistinguishable from real scheduling overlap. **That's the
  win, not a leak — plausible deniability.**
- `itinerary_item_rsvps` on the decoy is innocuous (celebrant can
  RSVP `going` to "free time"); no cross-leak to the hidden item.
- `lodging_assignments` cross-trip guard (trigger
  `assert_lodging_item_kind_before_assignment`, m3 migration:557–582)
  blocks lodging-assignment to a non-lodging decoy.

Pattern is RLS-tight today, no schema delta needed. Organizer copy
guidance for the decoy lives in the M4 microcopy PR.

**Future-decisions guardrail (CRITICAL FOR M5+):**

**Never ship an activity feed, recent-changes surface, or any
visualization exposing `created_at` timestamps on itinerary items to
the celebrant.** The decoy pattern relies on slot-overlap plausible
deniability; a creation-timestamp-adjacent display would reveal the
decoy by adjacency (decoy and surprise are created seconds apart).
This guardrail is the load-bearing reason this ADR exists — without
recording it, future-Claude could re-propose an organizer-activity
or "what changed today" surface and silently leak the hidden item by
inference.

**Alternatives considered:**

- **Frosted-blur masked-SELECT (`ux-design-principles.md:51-73`).**
  Rejected because (a) it requires a new masked-SELECT shape because
  `can_see_content()` is boolean, not a sanitizer; (b) `roadmap.md:194`
  STOP HERE explicitly limits M4 polish; (c) the decoy-item pattern
  closes the same "celebrant might notice the gap" concern at zero
  engineering cost. The blur design earns its way back in only if a
  retro produces a specific celebrant-felt-the-absence moment that
  the decoy pattern couldn't cover.

**Implementation:**

- No code change. Filter shape already ships (m1 + m3 migrations).
- Microcopy PR ships organizer-facing copy guidance for the decoy
  pattern alongside the dress-code rename + member-flag composer
  heading.
- This ADR is the durable record of the call; cite it in any future
  PR/issue that re-opens the blur question.

**Sim citations:**

- Celebrant Finding C1 — `findings-celebrant.md:6` (blur vs filter,
  filter wins)
- Organizer Finding O2 — `findings-organizer.md:15` (hide_from_celebrant
  render path)
- Organizer cross-DM addendum — `findings-celebrant.md:81–85` (decoy
  pattern surfaced via celebrant walk)
- Critic pre-load — `findings-critic.md` (initial filter-wins recommendation)
- Critic re-audit batch 2 — `findings-critic.md:444–451` (decoy RLS
  verification + activity-feed guardrail)
- Synthesis Call A — `findings.md:52–53`

---

## 2026-05-20 — M4 sim: organizer-write-on-behalf for member-flags — M5+ scope, principle holds with attribution

**Decision:** Organizer-write-on-behalf for `itinerary_item_member_flags`
is **M5+ scope**, deferred from M4. **The master principle stated in
`persona-edge-attendees.md:11-18` (non-default attendees opt *in*, the
app doesn't *assume*) HOLDS with attribution + member-confirm** — the
M5 design must not treat this as a principle-inversion fight. The
principle protects against the app *assuming* a default; it does NOT
protect against an organizer *recording* what an attendee already
volunteered out-of-band. **This wording is load-bearing; do not soften
it.**

**Reconciliation of the disagreement:**

This call was contested through the sim:

1. **Initial critic framing (pre-load):** organizer-on-behalf inverts
   the opt-in principle — the app would be acting on behalf of a
   member who hasn't tapped, which looks like the same kind of
   "assume the default" pattern rule #8 was written to prevent.
2. **Organizer pushback (`findings-organizer.md:33–40`, Finding #4):**
   the M3 schema already lets organizers write on behalf of members
   for `lodging_assignments` (migration
   `20260520052357_m3_itinerary_announcements.sql:131-149`). That
   precedent shows the project can express "organizer banks an
   attendee fact" without violating the principle, *given the right
   attribution.* Workaround today ("text Marcus to open the app") is
   literally the asymmetric-labor problem
   `persona-best-man.md:69` names.
3. **Edge-attendee addendum (`findings-edge.md:90–99`, Finding #10):**
   the affected persona — Marcus, the one the principle was written
   to protect — sided with the organizer in his own filing:
   *"transcribing a fact the attendee specifically volunteered via
   DM is recording, not assuming."* He proposed the three
   preserve-conditions below.
4. **Critic walk-back (`findings-critic.md:440`, re-audit batch 1):**
   the initial principle-inversion framing was retracted. *"Marcus's
   `written_by` + member-confirm proposal closes the principle
   objection."* Severity downgraded to "nice-to-have for M4, M5 retro
   if no budget."

**Three preserve-conditions (REQUIRED for any M5 implementation —
copy verbatim from `findings-critic.md` re-audit batch 1):**

1. **Attribution column:**
   `written_by_trip_member_id uuid references public.trip_members(id)` —
   NOT `auth.users(id)`. This matches the M1 FK-retargeting convention
   (`database-workflow.md:256-271`) and the existing `trip_member_id`
   column shape on the same table.

2. **Additive INSERT policy (do NOT widen the existing owner-insert
   policy):**
   Keep `"item flags: owner insert"` (m3 migration:514-525) unchanged.
   Add a second, additive policy
   `"item flags: organizer insert on behalf"`:
   ```sql
   with check (
     public.is_trip_organizer(...)
     and written_by_trip_member_id in (
       select id from trip_members where user_id = auth.uid()
     )
     and trip_member_id <> written_by_trip_member_id
   )
   ```
   The third clause is **load-bearing defense-in-depth**: without it,
   an organizer could write a flag claiming the member wrote it
   themselves (forged self-attribution). The clause forces
   `written_by` to be the acting organizer's own membership row and
   forbids it from matching the target.

3. **Member-confirm UI:** Once the M4 self-read SELECT policy lands
   (the M4 carry-back ship-blocker, three-persona convergence), the
   member-side picker surfaces organizer-written rows with a
   one-tap `"Dave saved this for you — keep it?"` confirm/remove
   affordance. The attribution column is honest; the confirm/remove
   makes the principle hold *in the UX*, not just in the schema.

**Why M5+ scope, not M4:**

The feature requires four moves in one wave: (a) schema add
(`written_by_trip_member_id` column), (b) RLS policy add (additive
INSERT), (c) server action plumbing for organizer-acting
write-with-attribution, (d) member-confirm UI on the chip picker.
That's three-of-four M4 budget hats in a single feature — schema,
RLS, UI, plus the copy review for the confirm string. The M4
carry-back migration already ships the self-read fix
(cross-persona ship-blocker), which is what unblocks the picker
end-to-end for the actual M4 trip. Write-on-behalf lands when the
post-trip retro confirms the asymmetric-labor problem actually
fired (Dave actually had to text Marcus to open the app, Marcus
actually didn't, the chef-venue actually missed the allergy).

If the M5 retro confirms the friction, the implementation is
mechanically ready — three preserve-conditions above, ~80 lines of
migration + policy + server action + picker affordance.

**What this ADR PREVENTS:**

Future re-litigation of the principle question. If you find yourself
debating whether organizer-on-behalf "violates opt-in," re-read the
edge-attendee's addendum (`findings-edge.md` Finding #10). The
principle protects against the *app* assuming; it does not protect
against an *organizer* recording what the attendee volunteered. The
attribution + member-confirm UI is the bridge between those two
positions and is the right design.

**Alternatives considered:**

- **Land in M4 with the three preserve-conditions.** Rejected on
  scope: too many M4 budget hats in one feature, and the M4
  self-read fix already unblocks the picker for the actual trip.
  Save the write-on-behalf surface for the retro-confirmed need.
- **Widen the existing owner-insert policy to allow organizer
  writes.** Rejected: the additive-policy pattern is safer to
  audit and reason about. Mixing owner-self and organizer-on-behalf
  semantics in one policy makes the third-clause defense-in-depth
  ambiguous to read.
- **Use a SECURITY DEFINER RPC** like `accept_invite`. Rejected:
  RLS can express the constraint directly with the additive policy.
  SECURITY DEFINER is the right tool when RLS *can't* express the
  constraint (atomic invite accept), not when it can.

**Sim citations:**

- Organizer Finding #4 — `findings-organizer.md:33–40`
- Edge-attendee addendum Finding #10 — `findings-edge.md:90–99`
- Critic re-audit batch 1 — `findings-critic.md:428–442`
- Synthesis Call B — `findings.md:55`

---

## 2026-05-20 — M4 sim: Google Places API locked + server-proxy + PLACES_AUTOCOMPLETE rate-limit scope

**Decision:** Lock the M4 address-autocomplete provider (#166) to
**Google Places API**. A browser-visible API key
(`NEXT_PUBLIC_GOOGLE_PLACES_KEY` or similar) is **rejected** in favor
of a **server-proxy route handler** at
`app/api/places/autocomplete/route.ts`, fronted by a new rate-limit
scope `PLACES_AUTOCOMPLETE` in `lib/rate-limit/`.

**Rationale:**

- **Provider choice (Google):** team-lead lock during the sim
  (`findings-organizer.md:145`). Google Places has the best US bar /
  restaurant coverage for the actual use case (bachelor-trip venue
  picking). Mapbox and Apple MapKit JS were considered; Mapbox loses
  on small-business coverage in the US bar/restaurant long tail,
  Apple MapKit loses on cross-platform polish (the trip is shared
  across iOS + Android browsers). Closes
  `future-state-guide.md` open question #11.

- **Server-proxy, not browser-visible key:** the conventional move
  for a Next.js client-side Places integration is a `NEXT_PUBLIC_*`
  key with HTTP-referrer restrictions on the Google Cloud Console
  side. Three reasons we don't take that path:
  1. **HTTP-referrer is spoofable.** It's a header; anyone running
     curl can pretend to be `*.vercel.app`. Browser-visible keys are
     scrape-able from the bundled JS within seconds of a Vercel
     preview going live.
  2. **Places billing is real and abusable.** A leaked key with no
     rate-limit between it and the client is a cost-amplification
     surface. The MVP traffic is tiny but the abuse surface is
     globally addressable.
  3. **`lib/rate-limit/` already exists.** Routing through a server
     proxy lets us add a `PLACES_AUTOCOMPLETE` scope (per-user,
     consistent with `MINT_INVITE` / `ACCEPT_INVITE` / `SET_RSVP`
     buckets) and centralizes the key in Vercel project env. This
     is consistent with the #141 rate-limit ratchet posture.

- **Friction-vs-security clarification:** the project-memory note
  `feedback_friction_vs_security` addresses **user-flow** threats
  (e.g., PKCE-vs-token-hash on magic-link — see
  `decisions.md:137–207`). It does **not** apply to
  **infrastructure-cost** threats like an unauthenticated billing
  surface. The server proxy is +1 file (`route.ts`), zero
  user-visible friction. The user types in a chip picker; the proxy
  fetches and returns suggestions; the user never sees the seam.

**Schema impact (in M4 carry-back migration):**

```sql
alter table public.itinerary_items
  add column address_place_id text,
  add column address_provider text;
```

These columns close the schema portion of #166. The provider column
exists so a future Mapbox-or-other migration is a string-update, not
a re-key.

**Dependency declaration:**

This is a **new external dependency**. Per `CLAUDE.md` ("Don't add
new dependencies without flagging it in the response"): the dep is
Google Places Autocomplete API (Places API (New) endpoints, server-
side). **No new npm package** — the route handler uses Next.js's
built-in `fetch`. The only project-level deltas are:
- New env var `GOOGLE_PLACES_API_KEY` (server-only, Vercel-injected,
  documented in `.env.example`)
- One Google Cloud Console project + Places API enabled + billing
  card on file (owner action — `ripcity352`)
- New rate-limit scope constant added to `lib/rate-limit/`

**Alternatives considered:**

- **Mapbox** — bar/restaurant coverage gap (see provider choice).
- **Apple MapKit JS** — cross-platform polish gap; only worth it for
  iOS-only apps.
- **Browser-visible key with HTTP-referrer restriction** — spoofable,
  scrape-able, no rate-limit hook. Rejected.
- **OpenStreetMap / Nominatim** — usage policy forbids high-volume
  autocomplete; not designed for this workload.

**Sim citations:**

- Organizer Finding #17 — `findings-organizer.md:142–148`
- Critic pre-load — `findings-critic.md:94–100`
- Synthesis carry-back item — `findings.md:87`

---

## 2026-05-20 — M4 sim: silent "heading back" ping — retired ask, safety case → text-organizer-directly

**Decision:** The persona ask for an in-app silent "heading back"
ping from an attendee to the organizer (`persona-edge-attendees.md:48`,
sober persona) is **retired in the form proposed**. The right product
answer for the safety-coded use case is **text the organizer
directly** — the organizer's phone is already on the M3 roster, with
the copy-all-numbers and vCard download surfaces shipped in PR #151.

**Why retired, not deferred:**

The persona ask, in the form proposed (in-app silent push to
organizer-only), has two structural problems:

1. **In-app push fires only when the recipient has the app open.**
   The scenario is Marcus leaving a club at midnight, wanting Dave
   to *know* he's heading back (safety case). For that signal to be
   safety-grade, Dave has to *get* it. In-app delivery is
   unreliable for that — Dave isn't checking the app at midnight;
   he's at the club too, or in an Uber. The signal needs to land on
   Dave's lock screen via SMS or a push channel he actively
   monitors. The M4 product has neither.

2. **The killed notification-outbox seam is correctly killed**
   (`killed-and-deferred.md:26`). The retro should not re-propose
   the outbox under safety-coded framing. The kill rationale —
   "premature abstraction; an outbox seam with no second channel is
   a pattern, not a product" — applies as strongly to a safety
   primitive as it did to the general case. The second channel
   arrives with money-pool nudges in M5; the seam is designed
   *then*.

3. **The M3 roster already solves this.** Dave's phone number is on
   the roster page (`/trips/[tripId]/roster`); Marcus can copy it
   or download Dave's vCard in two taps. Texting Dave "heading
   back" via the OS SMS app delivers reliably on every device,
   surfaces on a lock screen, and creates zero new infrastructure.

**Future-decisions guardrail:**

If a retro re-proposes a silent organizer-only ping primitive under
safety framing — e.g., "we need a panic ping for the sober persona"
— point at this ADR. The principled response is *"the M3 roster
already solves the safety case via OS-native SMS; the proposed
primitive trades reliability for in-app cleanliness, and reliability
is the load-bearing property for a safety signal."* If a real-trip
retro surfaces a use case where SMS-the-organizer would have failed,
that's the moment to re-open — not before.

**What stays open:** the general "heading back" use case where the
member just wants to *log* their early departure (not summon
attention) — that's already covered by per-item RSVP `skipping`,
which fires no notifications by design. Marcus can mark himself
`skipping` on remaining items at midnight; the per-item RSVP is the
canonical low-noise surface.

**Alternatives considered:**

- **In-app silent push (the persona ask as written).** Rejected for
  reliability reasons above.
- **Defer to M5 with the outbox seam.** Rejected: the kill rationale
  in `killed-and-deferred.md:26` still applies; the second channel
  is what unlocks the seam, not the use case framing.
- **Add SMS to the M4 stack just for this.** Rejected — SMS provider
  + Twilio account + abuse hardening for a single primitive is
  dramatic scope creep. The OS SMS app is already on every device.

**Sim citations:**

- Edge-attendee Finding #5 — `findings-edge.md:43–50`
- Critic re-audit batch 3 — `findings-critic.md:499–500`
- Synthesis retired-ask — `findings.md:78–80`

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
