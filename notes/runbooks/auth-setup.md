# Runbook — Auth setup (M5)

> **Renamed from `auth-template-flip.md`** (M5/PR5). The original runbook
> covered the email-template flip (PR3). This file now also covers the
> Google OAuth provider setup (PR5). Both are one-time operator steps.

> **Correction (2026-07-12, post-incident):** Section 1 below previously
> claimed the "Magic Link" template is used by `signInWithOtp`, `signUp`,
> **and** password-reset. That's false — GoTrue routes `/signup` through
> a **separate** "Confirm signup" template, which the PR3 flip never
> touched. That template still emitted `{{ .ConfirmationURL }}` in prod,
> and its fragment-bound link (unreadable by the server-side
> `/auth/callback`) was one of the four failure points in the
> 2026-07-11 invite-chain incident. See `notes/decisions.md`
> "Invite-chain incident 2026-07-11 → instant-session signup (Option A)"
> ADR. As of 2026-07-12, prod `mailer_autoconfirm` is ON, so the
> "Confirm signup" template is currently **unreachable** (no signup ever
> needs confirming) — it has NOT been flipped to `{{ .Token }}`, only
> made moot. **If confirmations are ever re-enabled, the "Confirm
> signup" template must be flipped to `{{ .Token }}` in the same change**
> — do not assume the Section 1 flip below already covers it.

---

# Section 1 — Supabase email-template flip (magic link → 6-digit code)

Operational guide for M5 PR3 of the auth redesign chain. This runbook is
the canonical record of the dashboard step that pairs with the code-only
changes in PR #228 (closes #223).

## Background

Until M5, Supabase Dashboard's "Magic Link" email template — used by
`signInWithOtp` **only** — emitted a magic-link URL
(`{{ .ConfirmationURL }}`). The callback handler verified the embedded
`token_hash` via `verifyOtp({token_hash, type})`.

**Note:** `signUp` and password-reset use their own separate GoTrue
templates ("Confirm signup" and "Reset password" respectively), not
this one. See the correction note at the top of this file — conflating
the three was the 2026-07-11 incident's documentation-side gap.

M5 demotes magic-link to a verification primitive and replaces the
primary flow with a 6-digit OTP code entered on a form. The dashboard
template now emits the raw token (`{{ .Token }}`); the server verifies
via `verifyOtp({email, token, type})`.

## Deploy ordering (load-bearing)

```
PR1 (#226) deploy → PR2 (#227) deploy → [DASHBOARD FLIP] → 1-hour drain
  → PR3 (#228) merge → deploy
```

- PR1 widened the callback handler to accept BOTH `token_hash` (legacy)
  and `token + email` (new). It must be in production before the
  template flip.
- PR2 ships the form UI that sends `email + token` to the callback.
- After PR2 is in production, the template flip is safe.
- After the flip, **1 hour drain** before PR3 merges: in-flight magic
  links sent under the old template have ~1h TTL; PR3 deletes the
  `token_hash` branch so any link still resolving after PR3 deploys
  would fail.

## Pre-flip checklist

Before performing the dashboard flip, confirm:

- [ ] `git log origin/main -1 --oneline` shows PR1 (#226) and PR2 (#227)
      merged.
- [ ] Vercel **production** deployment of `main` reports the latest SHA
      green. (`vercel ls --prod` or the Vercel dashboard.)
- [ ] No active incident requiring a rollback.

If any check fails, **do not flip**. The hard-stop from
`notes/m5-auth-execution-plan.md` §B is unambiguous: dashboard flipped
before PR1+PR2 production-deployed → revert template immediately.

## Performing the flip

1. Open Supabase Dashboard → project `trip-planner` → **Authentication**
   → **Email Templates**.
2. Select the **"Magic Link"** template (this is used by
   `signInWithOtp` only — `signUp` and password-reset have their own
   separate templates; see the correction note at the top of this
   file).
3. Open the **Message body** editor. Find the line containing
   `{{ .ConfirmationURL }}`.
4. Replace the line with:
   ```
   Your code: {{ .Token }}
   ```
   (Adjust phrasing to taste; the canonical user-facing copy is in
   the dashboard, not in this repo.)
5. Verify the **Subject** line still reads "Your sign-in code" (or
   adjust — Supabase ships a magic-link-flavored default).
6. Click **Save**.
7. **Note the exact timestamp.** The 1-hour drain clock starts now.
   Record it in the PR #228 body under `## Drain timestamp`.

## During the drain (~60 minutes)

- Any user requesting a sign-in code will receive the new 6-digit form
  immediately.
- Magic-link URLs sent in the ~60 minutes before the flip remain valid
  for their TTL (~1h from issue). The callback handler still has the
  `token_hash` branch live, so these legacy links resolve cleanly.
- Do not merge PR #228 until `flip_timestamp + 1h` has elapsed.

## Merging PR #228

After the drain:

- [ ] Re-verify `mergeStateStatus: CLEAN` on PR #228.
- [ ] Confirm CI green on the latest commit.
- [ ] Squash-merge PR #228.
- [ ] Vercel auto-deploys `main` to production.
- [ ] Once deployed, monitor `[auth] callback missing required params`
      log entries for ~30 min. After PR3, the log emits
      `has_type / has_token / has_email / has_code` (no `has_token_hash`
      — that field was removed alongside the legacy branch). An entry
      with all four false (no useful query params at all) is the only
      remaining "this looks like a stale magic-link URL" signal —
      expected to be zero or trace volume given the 1-h drain.

## Rollback

If the flip causes user-visible breakage **before** PR #228 merges:

1. Return to the Supabase Dashboard email-template editor.
2. Restore the line `{{ .ConfirmationURL }}` (revert the change from
   step 4 above).
3. Click **Save**. Magic links resume immediately.
4. Update PR #228 body to reflect the revert and reset the drain.

If breakage surfaces **after** PR #228 merges, rollback options narrow:

1. Re-flip the dashboard template back to `{{ .ConfirmationURL }}`.
2. **Revert PR #228** on `main` (`git revert <sha>`) to restore the
   `token_hash` branch in the callback handler.
3. Both steps are required — the dashboard alone or the code alone
   won't fully restore the legacy path.

## Verification post-flip

Run the following as a real user (375px, production URL):

1. Navigate to `https://travelston.com/login`.
2. Enter your email; click **Continue**.
3. Click **Email me a code instead**.
4. Check inbox — message body should contain a 6-digit code, not a URL.
5. Paste the code into the verify form; click **Verify**.
6. Confirm redirect to `/trips`.

Any failure here is a rollback trigger. Otherwise, the flip is durable.

## See also (Section 1)

- `notes/decisions.md` — "M5 auth redesign — password + OTP + OAuth" ADR
- `notes/m5-auth-execution-plan.md` — full milestone plan
- `lib/auth/callback-handler.ts` — post-PR3 callback logic
- Issue #223 — PR3 tracking issue (closed by #228)
- Issue #206 — "verify template flip" — closed by this PR

---

# Section 2 — Enable Google OAuth provider (M5/PR5)

Operational guide for the Google OAuth dashboard step. This is a **one-time
operator step** — code changes that call `signInWithOAuthAction` are in
PR5 (#225). The code ships first; the dashboard step follows.

## Prerequisites

- PR5 (#225) merged and deployed to production.
- A Google Cloud project linked to `travelston.com` with the OAuth consent
  screen configured. (`ripcity352` owns the project.)
- The Supabase project's callback URL handy: it's on the Supabase Dashboard →
  Authentication → Providers → Google (before you enable — Supabase shows
  the redirect URL you need to whitelist in Google Cloud first).

## Deploy ordering

```
PR5 (#225) deploy → [DASHBOARD STEP] → smoke test
```

Unlike the template flip, this step is safe to revert: disabling the Google
provider in Supabase simply makes the OAuth button fail gracefully
(`oauth_redirect_failed` error toast) — it does not break password or OTP
sign-in for existing users.

## Step-by-step

### A — Google Cloud: create OAuth 2.0 credentials

1. Open [Google Cloud Console](https://console.cloud.google.com) → project
   `ripcity352` → APIs & Services → Credentials.
2. Click **+ Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Travelston (Supabase)` (or similar).
5. Under **Authorized redirect URIs**, add:
   - The Supabase callback URL shown in step B below. It looks like:
     `https://<project-ref>.supabase.co/auth/v1/callback`
6. Click **Create**. Copy the **Client ID** and **Client Secret** — you will
   not see the secret again after closing the dialog.

### B — Supabase Dashboard: enable the Google provider

1. Supabase Dashboard → project `trip-planner` → Authentication → Providers.
2. Find **Google** → click **Edit** → toggle **Enable**.
3. Paste the **Client ID** and **Client Secret** from step A.
4. Note the **Callback URL (for OAuth)** displayed — this is the redirect URI
   you added in Google Cloud step A.5 above. Confirm they match exactly.
5. Click **Save**.

### C — Vercel: add env vars

```bash
vercel env add GOOGLE_OAUTH_CLIENT_ID production
vercel env add GOOGLE_OAUTH_CLIENT_SECRET production
# Repeat for preview if you want OAuth working in preview deploys.
```

Then redeploy:

```bash
vercel deploy --prod
```

### D — Smoke test (production, 375px)

1. Navigate to `https://travelston.com/login`.
2. Click **Continue with Google**.
3. Confirm browser navigates to the Google consent screen.
4. Complete consent (use a test Google account, not your main one).
5. Confirm redirect to `https://travelston.com/trips` (or the `?next=` target).
6. Confirm the Supabase user record in the dashboard shows the Google identity.

### E — State B smoke test (optional but recommended)

If you have a test account with only a Google identity:

1. Sign in via Google OAuth (step D).
2. Navigate to `/account/sign-in-and-security`.
3. Confirm the "Add a password" form appears (not the "coming soon" stub and
   not the change-password form).
4. Set a password. Confirm the success toast.
5. Sign out. Sign back in with email + password.
6. Confirm the user now has both identities in the Supabase dashboard.

## Rollback

To disable Google OAuth:

1. Supabase Dashboard → Authentication → Providers → Google → toggle **off**.
2. Users who only have a Google identity will be unable to sign in until
   re-enabled. Notify them if this is intentional.
3. Remove `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` from Vercel
   env vars at your discretion — not strictly required for rollback.

## See also (Section 2)

- `notes/deployment-readiness.md` — `GOOGLE_OAUTH_CLIENT_ID` +
  `GOOGLE_OAUTH_CLIENT_SECRET` rows (H6 — env-var ownership)
- `notes/decisions.md` — "PR5 addendum — State B no-OTP-gate rationale"
- Issue #225 — PR5 tracking issue
