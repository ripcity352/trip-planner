# M5 closure walk — production screenshots (travelston.com @ 375×812)

Captured 2026-05-21 via MCP-Playwright against the live production deploy
of `travelston.com` at 375×812 viewport. Used as the `[v]` axis evidence
for the M5 DoD per Override A + Override I (see
`notes/m5-auth-execution-plan.md` § "Phase 6 closure — `[v]` verification
status" for the full ✓ / ⊙ / ⏳ status per DoD item).

The walk exercised the **OTP sign-in → State C atomic recovery → password
sign-in** end-to-end chain — the load-bearing v3.2 auth flow that M5
shipped. The Google OAuth round-trip + State B walk are deferred to
follow-up (#232 — Supabase Dashboard Google provider not yet enabled).

## Anonymous surfaces (no auth required)

The marketing landing page `/` is kept as-is per Override G — the CTA
"Sign in to your trip" → `/login` is auth-method-agnostic. See
[`notes/m4-screenshots/m4-walk-01-landing-anon.png`](../m4-screenshots/m4-walk-01-landing-anon.png)
for the unchanged landing capture.

| # | Surface | Screenshot | What was verified |
|---|---------|-----------|---------|
| 01 | `/login` (email-only mode) | `m5-walk-01-login-anon-email-only.png` | New progressive-disclosure form lands users in email-only mode. "Continue" button (PR2 rename — replaces M4's "Send the link") + "Continue with Google" button (PR5 — available pre-email since OAuth doesn't need an address first). Voice intact. Persimmon theme tokens render. |
| 05 | `/account/sign-in-and-security` (anon access) | `m5-walk-05-account-middleware-redirect-anon.png` | **Middleware redirect verified.** Anon nav to `/account/sign-in-and-security` redirects to `/login?next=%2Faccount%2Fsign-in-and-security` — proves the PR4 addition of `/account` to `middleware.ts` `AUTHED_PREFIXES` works, with deep-link preserved (`safeNext()` round-trips on next return to `/auth/callback`). Image is the `/login` form (same as 01) — the verification is the *redirect behavior*, not a different visual. Phase 4 audit C3 (no regression to `/trips/*` routes) covered by `tests/unit/middleware.test.ts`. |

## Auth path — OTP sign-in (PR2 + PR3, exercised by the walk)

Operator (@ripcity352) provided OTP codes from real-inbox during the
walk. The 6-digit code email body (NOT a magic-link URL) is the load-
bearing PR3 template-flip outcome.

| # | Surface | Screenshot | What was verified |
|---|---------|-----------|---------|
| 02 | `/login` (password mode, after Continue) | `m5-walk-02-login-password-mode-h3-ordering.png` | After "Continue" the form enters password mode with **H3 button ordering verified**: Sign in → "Email me a code instead" link → "Continue with Google" button. OTP-as-floor first (universal), Google-as-affordance second. Email pinned ("ripcity352@gmail.com") above the password field. Show/Hide password toggle present. Helper copy reads "6+ characters. Make it something you'll remember." — voice-correct, palette-sourced. Hidden `username` autocomplete field renders inside the form for iOS Keychain pairing (heuristically reported by Chrome as missing — informational only; the field IS present). |
| 03 | `/login` (code-verify mode) | `m5-walk-03-login-code-verify.png` | After "Email me a code instead" → server fires `requestEmailCode(email)` → form transitions to code-verify mode. Helper copy: *"Code's heading to ripcity352@gmail.com. Pop it in below."* — voice-correct. 6-digit code input + "Verify" CTA. Real-inbox 6-digit code `162796` was entered. |
| 04 | `/trips` (post-OTP-signin) | `m5-walk-04-trips-after-otp-signin.png` | Verify → `verifyEmailCodeAction({email, token, type: 'email'})` → server-side session minted → redirect to `/trips`. Title "Bachelor Party Planner". The existing "M3 prod walk" trip card renders, confirming session pinned to the right user. Zero console errors across the OTP round-trip. |

## State C atomic recovery on `/account/sign-in-and-security` (PR4 core surface)

The **PR4 HIGH-1 fix** (`de83f8e` — atomic-action pattern) walked end-
to-end on production. The form's State C flow takes the user from
"forgot my current password" → request OTP → enter code (client-side
transition) → enter new password → ONE atomic server call
(`setPasswordViaRecoveryAction({token, newPassword})`) that verifies
the OTP and updates the password in the same `rateLimitedAction`
closure. Invalid token short-circuits before `updateUser` is called —
the bypass surface (where any authed session could rotate the password
without proving OTP possession) is eliminated structurally.

| # | Surface | Screenshot | What was verified |
|---|---------|-----------|---------|
| 06 | `/account/sign-in-and-security` (initial render) | `m5-walk-06-account-state-a-rendered-bug-233.png` | **⚠️ Bug discovered during walk — filed as #233.** Page rendered **State A** (Current password + New password fields) even though the test account had only ever signed in via OTP — never set a password. Root cause: `deriveIdentityState()` in `_form-state.ts` checks `identities.some(id => id.provider === "email")` which Supabase assigns to OTP-signin accounts regardless of whether `auth.users.encrypted_password` is set. Conflation of "has email identity" with "has password." State C recovery path remained accessible via the "Forgot your current password?" link — the user can still recover. Filed as **#233** with recommended fix (track `has_password` in app schema). Image identical to #09 (post-set State A) — same form, different context (pre-set vs post-set). |
| 07 | `/account/sign-in-and-security` (State C — code-verify) | `m5-walk-07-account-state-c-verify.png` | After clicking "Forgot your current password? Email me a code instead" → `requestEmailCode(userEmail)` fired → form transitioned to State C-verify. Helper copy reads *"Code's heading to ripcity352@gmail.com. Enter it to reset your password."* — voice-correct, palette-sourced (`AUTH_COPY.accountSecurity_codeRequestHelper`). 6-digit code input + "Verify" CTA + "Never mind — go back" cancel link (returns to State A). |
| 08 | `/account/sign-in-and-security` (success toast) | `m5-walk-08-account-state-c-success-toast.png` | After fresh OTP `813973` entered + new password `123456` submitted → atomic `setPasswordViaRecoveryAction({token: '813973', newPassword: '123456'})` → success toast *"Password updated. Other devices were signed out."* — voice-correct (`AUTH_COPY.accountSecurity_successToast`). The toast's "Other devices were signed out" line confirms `signOut({scope:'others'})` fired (atomic step 4). Earlier in the walk, an expired token (`186554`) was tested: the action returned `auth_code_invalid` and the form bounced back to State C-verify with voice-correct error *"That code didn't take. Double-check or get a fresh one."* — the PR4 fix-up's bounce-back behavior verified end-to-end. |

## State A post-set (proves the rotation actually took)

| # | Surface | Screenshot | What was verified |
|---|---------|-----------|---------|
| 09 | `/account/sign-in-and-security` (State A — post-set) | `m5-walk-09-account-state-a-post-password-set.png` | After State C set the password, signed out, then signed BACK in via email + the new password (`123456`) — landed on `/trips` (proving the password rotation persisted in `auth.users.encrypted_password`). Re-visited `/account/sign-in-and-security` — State A now renders **correctly** (user has a password). Image identical to #06 since both are State A; the verification is contextual (this one is the *legitimate* State A render after a real password exists). |

## Override I verification (load-bearing M5 ship gate)

- ✅ **Real-recipient send** — both `requestEmailCode` (PR2) and the
  State C OTP recovery (PR4) delivered 6-digit codes to
  `ripcity352@gmail.com`. Format verified: **email body contains a
  numeric code, NOT a magic-link URL** — confirms PR3's Supabase
  Dashboard template flip (`{{ .ConfirmationURL }}` →
  `{{ .Token }}`) is in effect on the production project.
- ✅ **OTP length config — operator-corrected mid-walk.** Initial PR3
  walk surfaced a config drift: Supabase project was set to OTP length
  8, code expected 6. Operator fixed in dashboard → Auth → Sign In /
  Providers → Email → OTP Length = 6. Codified in
  `notes/runbooks/auth-setup.md` as a pre-walk eyeball check.
- ✅ **Atomic-action bypass-prevention** — exercised the invalid-token
  bounce-back path with an expired OTP (`186554`); action returned
  `auth_code_invalid` and the form bounced to State C-verify with
  voice-correct error. **The PR4 HIGH-1 fix is real, not just unit-
  tested.**
- ✅ **No console errors** across the OTP/password/State-C round-trip.
  One VERBOSE DOM accessibility warning on State A about the hidden
  `username` field — Chrome heuristic noise; the field IS present in
  the rendered JSX (`_form.tsx`), pinned by unit tests.
- ✅ **Persimmon theme tokens** rendered on every surface
  (`[data-theme=bachelor]` cascade carried from M4 W3a).
- ⚠️ **Resend domain (#135) still open** from M4 carry-back. Walk
  proved end-to-end auth works against the default Supabase sender
  (`onboarding@resend.dev` or similar). Real-attendee invitations sent
  to non-owner emails will require Resend domain verification — covered
  in the M5 retro carry-forward list.

## Walk-driven discoveries (filed during/after walk)

- **#233** — `/account/sign-in-and-security` renders State A for
  OTP-only users. Filed during walk (between #06 capture and #07).
  See README §"State C atomic recovery" → row 06 for details.
- **OTP length drift** caught at PR3 walk (Supabase set to 8 digits,
  code expects 6). Fixed mid-walk via dashboard; documented in
  `notes/runbooks/auth-setup.md` pre-flight checklist.

## What this walk did NOT directly exercise (covered by unit + e2e tests in CI)

- **Google OAuth round-trip** — Supabase Dashboard Google provider
  not enabled yet. Deferred per operator decision; tracks at #232 +
  the pending dashboard step.
- **State B set-password for a genuine no-password user** — gated on
  #233 fix. The walk hit State A by accident (the bug), exercised
  State C recovery as the workaround.
- **State A+ (mixed-identity)** — no OAuth account on prod yet; walk
  deferred to OAuth-enabled follow-up.
- **Cross-device `signOut({scope:'others'})` verification** — covered
  by `e2e/account-change-password.spec.ts` (CI playwright pixel-diff
  pass). The State C success toast text confirms the action fires;
  cross-device behavior not separately exercised on prod.
- **Wrong-current-password on State A change-password flow** — only
  reachable via the State A path which the walk hit only briefly
  (#233 bug); the e2e spec covers the wrong-current path.
- **Invite-link inline auth** (`/invite/[token]` anon viewer sees
  `<LoginForm />`) — covered by `e2e/invite-inline-auth.spec.ts`. Not
  exercised on prod during M5 walk (no fresh invite to test against).
- **Signup happy path** (`signUpAction` auto-signs-in new user) —
  covered by `tests/unit/login-actions.test.ts` + e2e. Test account
  for the walk pre-existed; signup path not re-exercised.
- **`signInWithOAuthSchema.next` injection protection** — covered by
  `tests/unit/oauth-actions.test.ts` (4 serialization-boundary cases:
  CRLF, HTML, quote, absolute-URL). Cannot exercise on prod without
  the OAuth provider enabled.

For a real-trip-grade verification of the full feature surface, the
user's upcoming bachelor party usage IS the M6-gating test (per
`notes/roadmap.md` "stop at M5 + retro" bright line).
