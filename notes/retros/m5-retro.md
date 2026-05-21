# M5 retro — auth redesign

> Dated 2026-05-21. Closes M5 ("auth redesign" — password + OTP + OAuth,
> replacing magic-link as primary). 5 sequential PRs (#226–#231) + 4
> closure follow-ups (#230, #232, #233 + #135 carried from M4).
> Reconciled from two parallel-agent retro lenses (code-reviewer +
> senior-engineer) + the Phase 6 production walk on `https://travelston.com`.

---

## TL;DR

M5 shipped the v3.2 auth redesign: email + password (primary), 6-digit
OTP code (fallback), Google OAuth (alternative; round-trip deferred to
follow-up), and `/account/sign-in-and-security` with State A/A+/B/C
state machine. M3/M4 overrides A–I held; Override J (deploy ordering)
earned its keep on PR3. Phase 6 closure walk verified end-to-end on
production: OTP sign-in → State C atomic recovery → password sign-in →
`/trips`. Three follow-ups carried back: chronic flake (#230), OAuth
detection wiring (#232), State-B identity check (#233).

---

## What shipped

| PR | Branch | Closes | Surface |
|---|---|---|---|
| **#226 (PR1)** | `refactor/m5-auth-otp-foundation` | #221 | Foundation refactor: widened `verifyOtp` callback handler to accept `token + email + type` alongside legacy `token_hash`; renamed `AUTH_MAGIC_LINK` → `AUTH_OTP_VERIFY`. Dormant — zero UX delta. |
| **#227 (PR2)** | `feat/m5-auth-password-form` | #222 | Progressive-disclosure `/login` form (4 modes) + 3 new server actions (`signInWithPasswordAction`, `signUpAction`, `verifyEmailCodeAction`) + `requestEmailCode` rename with `shouldCreateUser:false` + inline auth on `/invite/[token]` + new `lib/copy/auth.ts` palette + `AUTH_PASSWORD` rate-limit scope. Largest PR (+2,103 / -257). |
| **#228 (PR3)** | `chore/m5-auth-template-flip` | #223, #206 | Supabase Dashboard email-template flip (`{{ .ConfirmationURL }}` → `{{ .Token }}`) paired with 1h drain before deleting the legacy `token_hash` branch. Consolidated v3.2 ADR landed in `notes/decisions.md`. Runbook `notes/runbooks/auth-template-flip.md`. |
| **#229 (PR4)** | `feat/m5-auth-account-security` | #224 | `/account/sign-in-and-security` route + State A/A+/C state machine + `changePasswordAction` (re-auth + `signOut({scope:'others'})`) + atomic `setPasswordViaRecoveryAction` (HIGH-1 fix-up). Middleware regression test on `/trips/*`. |
| **#231 (PR5)** | `feat/m5-auth-oauth-state-b` | #225 | Google OAuth + State B set-password. HIGH-1 dead-code wiring stripped; HIGH-2 OAuth rate-limit DoS removed. Runbook renamed `auth-template-flip.md` → `auth-setup.md` with Google OAuth provider section. |

**Carry-back follow-ups (filed during M5):**
- **#230** — chronic flake in `components/trip/__tests__/rsvp-toggle.test.tsx:192`. Flaked in M4, flaked again on PR4 first CI run. Two-deferral threshold hit; gate on M6 Wave 0.
- **#232** — OAuth-existing-user alert detection wiring. UI scaffolding stripped from PR5 fix-up; copy keys + voice-lock tests retained for the follow-up PR.
- **#233** — `/account/sign-in-and-security` renders State A for OTP-only users (identity check is provider-only, not password-set). Discovered during Phase 6 production walk.
- **#135 (carried from M4)** — Resend sender domain (`travelston.com`) verification. Production walk used real inbox via the default Supabase sender; the M4 carry-forward remains open.

---

## Phase 6 closure — production walk

Performed 2026-05-21 ~20:55-21:33 UTC on `https://travelston.com` at 375×812. Drove via MCP Playwright with operator providing OTP codes from inbox.

| Step | Result | Notes |
|---|---|---|
| `/login` email-only mode renders | ✅ | "Continue" + "Continue with Google" both visible |
| Enter email → password mode | ✅ | H3 button order verified: Sign in → Email me a code → Continue with Google |
| Click "Email me a code instead" → request OTP | ✅ | `requestEmailCode` returned ok; transition to code-verify |
| Enter 6-digit code → Verify | ✅ | OTP `162796` verified; redirect to `/trips` |
| Visit `/account/sign-in-and-security` | ⚠️ | Page rendered **State A** even though account had never set a password (OTP-only). **#233 filed.** State C recovery still works as fallback. |
| Click "Forgot your current password? Email me a code instead" | ✅ | Helper copy reads "Code's heading to ripcity352@gmail.com. Enter it to reset your password." — voice-correct |
| Enter old/expired token (`186554`) → bounce-back | ✅ | Atomic `setPasswordViaRecoveryAction` returned `auth_code_invalid` → form bounced to C-verify with error *"That code didn't take. Double-check or get a fresh one."* — the PR4 fix-up bounce-back behavior worked end-to-end |
| Enter fresh token (`813973`) → set new password `123456` | ✅ | Success toast: *"Password updated. Other devices were signed out."* — atomic verify + update + signOut all in one server call |
| Sign out → sign in via email + password | ✅ | Landed on `/trips` with existing trip data visible — proves password was actually set on the auth user |
| Re-visit `/account/sign-in-and-security` post-set | ✅ | State A renders correctly now (legitimately — user has a password) |
| Console errors across walk | ✅ | Zero errors; one VERBOSE DOM accessibility hint (informational only — hidden username field IS present, Chrome heuristic misses it) |

**OAuth round-trip NOT walked** — Google provider isn't enabled in Supabase Dashboard. Operator chose to defer to a follow-up; #232 also tracks the OAuth-existing-user alert wiring that depends on detection infrastructure not yet built.

---

## What worked

The disciplines from M3/M4 carried this milestone with very different shape (sequential auth-substrate work vs. M4's parallel wave fan-out):

- **Override C (test placement) — zero ghost tests.** Every PR body reports `rg "describe(|test(|it(" app/` → empty. Tests live in `tests/unit/` and `lib/.../__tests__/`. The grep ran before each commit.

- **C2 zod schema co-location (M4 W1b)** — all 4 PR2 schemas, both PR4 schemas, and both PR5 schemas sit top-of-file in their `actions.ts`. No extracted-schema files. The `_form-state.ts` extractions in PR2/PR4 are client-side mirrors, not contract splits.

- **Copy palette discipline.** `lib/copy/auth.ts` grew ~50 keys across PR2 + PR4 + PR5. Verified: zero inline JSX literals in `_form.tsx` files. `m5-auth-voice-locks.test.ts` pins the H7-rewritten strings ("That combo didn't match", "That's not the current password") so a future tdd-guide rewrite can't quietly drift them back to SaaS phrasing.

- **TDD discipline visible in commit log.** Every PR ships `test(...)-RED → feat(...)-GREEN → refactor(...)` as 2-3 commits before squash-merge. Audit-able after the fact.

- **Parallel reviewer dispatch (Override D)** — every PR fired `security-reviewer` + `code-reviewer` in a single message. **100% finding rate across 5 PRs:** PR1 LOW drift, PR2 signature softening + log shape, PR3 stale e2e + runbook key, PR4 HIGH-1 State C bypass + MEDIUM-1, PR5 HIGH-1 dead-code wiring + HIGH-2 fixed-key OAuth DoS. Sequential would have caught these one at a time, doubling cycle time.

- **Atomic-action pattern crystallized.** PR4's State C fix-up (`de83f8e`) turned a two-call sequence (verifyOtp then setPassword) into one `setPasswordViaRecoveryAction({token, newPassword})` where the OTP verification gates the password update inside one `rateLimitedAction` closure. This pattern is reusable for any recovery-credential flow.

- **Override J (deploy ordering) earned its keep on PR3.** Operator confirmed PR1+PR2 prod-deployed pre-flip, recorded flip timestamp + drain expiry in PR body, `Monitor` watcher ran for the 1-hour drain, walk **caught the OTP-length config drift** (Supabase project set to 8 digits, PR2 form schema hardcodes `length(6)`) mid-walk. Operator fixed in dashboard. Without the walk, the first post-flip user hits silent-fail validation on chars 7-8. That's the bug class Override J exists for.

- **ADR-lock posture worked.** Reviewers flagged State B's missing OTP gate as a potential bypass in PR5 round 1. Pointing them at the v3.2 ADR ("State B no-OTP-gate accepted per invite-flow precedent") closed the finding. Without the ADR-first framing the reviewers would have re-litigated three locked items per PR.

---

## What slipped / surprised

### PR2 fix-up `0054bfd` — production code yielding to test convenience

The tdd-guide agent softened `RateLimitError`'s constructor from `(scope, response)` to `(scope, response?)` — purely so its new test sites could write `new RateLimitError("authPassword")`. Orchestrator caught this *before* dispatching reviewers; fix-up restored the 2-arg signature and patched the 4 new test sites to pass `{ remaining: 0, reset: 0 }` matching 11 existing files.

**Same class as M4's tdd-guide-hallucination, different angle.** When an agent's first instinct is to weaken a production signature to accommodate a *test it just wrote*, the arrow is pointing the wrong way.

### PR4 HIGH-1 — State C bypass

Original `setPasswordAfterRecoveryAction({newPassword})` gated purely on `auth.getUser() != null`. Any authed session (including a borrowed laptop or stolen cookie) satisfies that gate; the OTP verification happened in a *separate* server-action upstream with nothing tying the two together at the wire.

Fix-up (`de83f8e`) replaced the two-call sequence with the atomic `setPasswordViaRecoveryAction({token, newPassword})` where `verifyOtp` short-circuits *before* `updateUser` runs, inside one `rateLimitedAction` closure. Regression test asserts `updateUser` is NOT called when `verifyOtp` fails.

**Phase 6 production walk verified the fix end-to-end:** an old token (186554, invalidated by the newer 813973) actually returned `auth_code_invalid`, bouncing the form back to C-verify — the atomic action's gate-then-mutate behavior is real, not just unit-tested.

### PR5 HIGH-1 — dead-code wiring of `auth_email_taken_oauth`

5 unit tests + 1 e2e block + voice-lock pins all referenced `auth_email_taken_oauth` and asserted the OAuthExistingUserAlert renders — but the server path that returns that key was never wired. The detection requires "email exists with only OAuth identity," which needs a public RPC the agent couldn't write (service-role from app code is banned per `CLAUDE.md`). Both reviewers caught the dead-code wiring HIGH.

Operator decision: strip the UI scaffolding + tests, keep the copy keys + voice-locks for grep-anchoring, file **#232** for the proper detection wiring.

**TDD assumes the agent can write both halves.** When one half requires server-side surface the agent can't author (RPC, dashboard config, third-party integration), TDD without orchestrator-side acknowledgment of the split produces dead-code wiring that *looks* green.

### #233 — State B identity-check gap (discovered at Phase 6 walk)

`deriveIdentityState()` checks `identities.some(id => id.provider === "email")` to detect a password identity. Supabase assigns `provider: "email"` to OTP-signin accounts regardless of whether `auth.users.encrypted_password` is set. So `hasPasswordIdentity` returns `true` for an OTP-only user → State A renders → user sees "Current password" with no current password to enter.

**This is exactly what `[v]` verification is for.** Unit tests passed (the mocked user shape happened to have a `password` identity), e2e tests passed (the spec assumed a password-set user as fixture), reviewers cleared the logic on paper. Real production usage with an OTP-only account surfaced the conflation.

**Filed as #233** — recommended fix is option 3 (track `has_password` in app schema, no service-role API needed).

### Chronic flake (#230)

`components/trip/__tests__/rsvp-toggle.test.tsx:192` flaked in M4, flaked again on PR4's first CI run, passed on re-run with no code change. **Two-deferral threshold hit.** Local 5x runs pass cleanly; the flake is CI-only and timing-sensitive. Likely race between rollback effect and click-handler eligibility check.

### OTP-length config drift caught at walk time

Supabase project was configured `Email OTP Length: 8` but PR2's form schema hardcodes `length(6)`. Caught at the PR3 walk; operator fixed via Supabase Dashboard → Auth → Sign In / Providers → Email → OTP Length = 6. **The runbook now documents this as a pre-flip eyeball check** (`notes/runbooks/auth-setup.md`).

---

## Process learnings

1. **Phantom-wiring audit** — every PR should include a `rg <symbol>` audit for new error keys / copy keys / state branches, requiring both a producer AND consumer. If only consumers, flag as dead-code wiring HIGH. 30-second cost; would have caught PR5's class of bug before reviewer dispatch.

2. **Atomic-action pattern for recovery flows** — any "verify-then-mutate" two-action sequence collapses to one atomic action where the credential is *passed into* the mutating action. Trust-the-prior-step patterns are bypass-rich. **Codify in `notes/decisions.md` as a reusable cross-cutting pattern.**

3. **`[v]` ticks contingent on a Phase 6 walk are *provisional*.** PR2's password sign-in success ticks were absorbed informally by PR3's real-inbox walk. PR4 + PR5 ticks were partially deferred to this closure walk. **Make this explicit:** in M6, mark each DoD item with which PR / phase actually exercises it, so `[v]` provenance is auditable post-merge.

4. **`(human-step)` annotations for dashboard / RPC / secret-rotation items** — at plan-lock time, mark each DoD item with the agent that owns it. Items requiring human-only steps (Dashboard, RPC creation, secret rotation, third-party setup) get `(human-step)` so the TDD chain knows to *stub-and-defer* rather than *fake-and-pass*.

5. **Pre-commit grep flagging "tdd-guide softens production for test ergonomics."** Same orchestrator-side gate that re-reads agent diffs and asks "did the agent change anything in production code that a test was the only reason for?" Catches the M5 PR2 + M4 tdd-guide-hallucination class.

6. **Voice-lock tests are cheap and load-bearing.** Keep the `m5-auth-voice-locks.test.ts` pattern. Anti-regression for one of the project's load-bearing differentiators.

---

## Recommendation for next session

1. **Run the deferred OAuth walk + State B walk on `travelston.com`** once the Supabase Dashboard Google OAuth provider is enabled. Until then, the OAuth-related `[v]` ticks in `notes/m5-auth-execution-plan.md` are provisional. Track the dashboard step in #232.

2. **Pick up #230 (chronic flake) in M6 Wave 0.** Two-deferral threshold hit. Effort < 1 day. Investigate the rollback-vs-click-handler race in `RsvpToggle` rather than papering over with retries.

3. **Pick up #233 (State B identity-check) early in M6.** Real production users without passwords get the wrong UX — the State C recovery path still works but the first impression is broken. Option 3 (track `has_password` in app schema) is the recommended fix.

4. **Codify the atomic-action pattern in `notes/decisions.md`.** PR4's `setPasswordViaRecoveryAction` is canonical. Reviewer prompt: any multi-step auth action collapses to one rate-limited closure.

5. **Add a Supabase dashboard config-drift checklist to `notes/runbooks/auth-setup.md`.** Pre-walk eyeball checks: OTP Length = 6, Site URL = prod domain, Magic Link template emits `{{ .Token }}`, Google OAuth enabled with Authorized Redirect URIs matching `https://travelston.com/auth/callback`. **Next walk a glance, not a discovery.**

6. **Tighten "no UI wiring without server detection" in the M6 brief.** Close the #232 class at brief-time, not reviewer-time.

7. **Override J carries forward.** Any milestone pairing code with a Supabase Dashboard step adopts the PR3 pattern: flip timestamp + drain watcher + production walk.

**Bright line unchanged from M4:** *use the app for one real bachelor party.* M5 made the auth flow real; whether M4+M5 are sufficient is still the post-trip retrospective gate. Don't start M6 just because the chain is green; gate on the actual trip.
