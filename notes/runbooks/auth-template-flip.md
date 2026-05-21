# Runbook — Supabase email-template flip (magic link → 6-digit code)

Operational guide for M5 PR3 of the auth redesign chain. This runbook is
the canonical record of the dashboard step that pairs with the code-only
changes in PR #228 (closes #223).

## Background

Until M5, Supabase Dashboard's email template for OTP-class flows
(`signInWithOtp`, signup, password reset) emitted a magic-link URL
(`{{ .ConfirmationURL }}`). The callback handler verified the embedded
`token_hash` via `verifyOtp({token_hash, type})`.

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
2. Select the **"Magic Link"** template (this is the one used by
   `signInWithOtp`, `signUp`, and password-reset email).
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
      log entries for ~30 min. Any `has_token_hash: true` entries are
      lingering legacy links — expected to be zero or trace volume.

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

## See also

- `notes/decisions.md` — "M5 auth redesign — password + OTP + OAuth" ADR
- `notes/m5-auth-execution-plan.md` — full milestone plan
- `lib/auth/callback-handler.ts` — post-PR3 callback logic
- Issue #223 — PR3 tracking issue (closed by #228)
- Issue #206 — "verify template flip" — closed by this PR
