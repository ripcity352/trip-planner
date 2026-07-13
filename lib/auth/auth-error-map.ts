/**
 * Shared Supabase AuthError → ErrorKey mapper (#432).
 *
 * Two surfaces sign in with email + password and need the SAME error
 * taxonomy for the result:
 *
 *   - `/login` (`app/login/actions.ts`) — a failed sign-in reads as
 *     "wrong password" → `auth_wrong_password`
 *   - `/account/sign-in-and-security` — the re-auth step of a password
 *     change reads as "wrong CURRENT password"
 *     → `auth_current_password_incorrect`
 *
 * Before this module each surface kept its own copy, and they drifted:
 * the account-side copy still lumped `email_not_confirmed` and
 * `invalid_grant` into "wrong current password" after PR #430 split
 * them on the login side. Same call (`signInWithPassword`), same GoTrue
 * error shapes — one mapper, parameterized on the one key that differs.
 *
 * Uses typed fields (status + code), never message-substring matching.
 */

import type { ErrorKey } from "@/lib/copy/errors";

/**
 * Structural supertype of `AuthError` from @supabase/supabase-js —
 * lets tests and non-SDK call sites pass plain objects without the
 * class import.
 */
export type AuthErrorLike = {
  status?: number;
  code?: string | null;
  message?: string;
} | null;

/**
 * The one surface-specific mapping: what a rejected email+password
 * combination means to the user on this surface.
 */
export type InvalidCredentialsKey =
  | "auth_wrong_password"
  | "auth_current_password_incorrect";

/**
 * Maps a Supabase auth error to one of our error-toast keys.
 * Returns null when the input is null.
 */
export function mapAuthErrorToKey(
  error: AuthErrorLike,
  invalidCredentialsKey: InvalidCredentialsKey
): ErrorKey | null {
  if (!error) return null;
  // Supabase surfaces rate-limit responses as HTTP 429. A rate-limited
  // user may be holding the RIGHT password — never report it as wrong
  // (the 2026-07-11 incident's exact failure shape).
  if (error.status === 429) return "rate_limit";
  // 422 otp_disabled — "email me a code" for an address with no account.
  // shouldCreateUser:false (anti-phantom-account) means codes never create
  // users, so a new invitee dead-ends here. Surface a clear "create an
  // account" message instead of the generic network fallthrough below.
  // (Login-surface only in practice; unreachable from password re-auth.)
  if (error.code === "otp_disabled") return "auth_no_account";
  // Correct password, unconfirmed email (2026-07-11 incident #3). This used
  // to collapse into the wrong-password key — users holding the RIGHT
  // password were told it didn't match. The fix is in their inbox, so it
  // gets its own honest key.
  if (error.code === "email_not_confirmed") return "auth_email_not_confirmed";
  // Wrong password / invalid credentials — HTTP 400 with the
  // invalid_credentials code. This is the ONLY shape that may read as
  // "your password is wrong" (#432 — no more lumping neighbors in).
  if (error.status === 400 && error.code === "invalid_credentials") {
    return invalidCredentialsKey;
  }
  // invalid_grant — deliberately NOT a credentials key (#432). Current
  // GoTrue (the managed Supabase we run against) emits
  // `invalid_credentials` for a rejected email+password; `invalid_grant`
  // is the legacy OAuth2 token-endpoint code that modern versions reserve
  // for stale/invalid grants (e.g. refresh-token reuse) — a session-class
  // failure, not credential feedback. Classifying it as "wrong password"
  // risks telling a user with the RIGHT password to keep retyping it
  // (the misdirect class this module exists to close), so it falls to the
  // honest generic-retry key instead.
  if (error.code === "invalid_grant") return "network";
  // Typed validation-error code from the GoTrue REST API.
  if (error.code === "validation_failed") return "validation_failed";
  // Anything else is a network/server-class failure.
  return "network";
}
