/**
 * `resolveCallbackResult()` — core logic for the `/auth/callback` route.
 *
 * Extracted from the route handler so it can be unit-tested without the
 * full Next.js request lifecycle. The route handler calls this and then
 * translates the result into a NextResponse.
 *
 * ## Auth flow decision
 *
 * We support three token formats:
 *
 * 1. **token-hash** (`token_hash` + `type` params) — the preferred default.
 *    Self-contained: no `code_verifier` cookie required, works across
 *    devices and cookie jars. See #137.
 *
 * 2. **6-digit OTP code** (`token` + `email` + `type` params) — for when
 *    a user manually enters a 6-digit OTP from the email on a form.
 *    Both `token` and `email` must be present. Uses `verifyOtp({email,
 *    token, type})`. Wired in by PR2 of the M5 auth redesign.
 *
 * 3. **PKCE code** (`code` param) — the @supabase/ssr legacy default.
 *    Requires the `code_verifier` cookie from the requesting browser.
 *    Kept as backward-compat path for links in-flight during the
 *    template switch.
 *
 * Precedence order: `token_hash` → `token` → `code`. When multiple
 * params are present, the highest-priority branch wins. `token_hash`
 * takes precedence as the most self-contained path. `token` (6-digit
 * form entry) takes precedence over the legacy PKCE `code`. Each branch
 * instantiates the Supabase client only when it actually needs it so
 * a malformed callback (no params at all) doesn't waste a client
 * allocation just to bounce to `/login?error=auth`.
 */

import { createClient } from "@/lib/supabase/server";

export interface CallbackParams {
  /** token_hash from the new magic-link template (verifyOtp path) */
  token_hash: string | null;
  /** OTP type — always "email" for magic links */
  type: string | null;
  /** 6-digit OTP token entered on a form (verifyOtp with email+token+type) */
  token: string | null;
  /** Email address paired with token for the 6-digit OTP form path */
  email: string | null;
  /** PKCE code from the legacy ConfirmationURL template */
  code: string | null;
  /** Safe-next redirect path, already normalized by safeNext() */
  next: string;
}

export type CallbackResult = { ok: true; next: string } | { ok: false };

/**
 * Allowlist for OTP `type` query param. Supabase rejects unknown
 * values at runtime, but pre-filtering keeps junk out of the network
 * call and out of error-log noise. Mirrors the union @supabase/ssr
 * exports for `verifyOtp({ type })`.
 */
const ALLOWED_OTP_TYPES = [
  "email",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
  "signup",
] as const;

type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number];

function isAllowedOtpType(value: string): value is AllowedOtpType {
  return (ALLOWED_OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Resolves an auth callback to either a success (with redirect target)
 * or a failure.
 *
 * Precedence: token_hash + type → token + email + type → PKCE code → error.
 * Each branch instantiates the Supabase client only when it actually
 * needs it so a malformed callback (no params at all) doesn't waste a
 * client allocation just to bounce to `/login?error=auth`.
 */
export async function resolveCallbackResult(
  params: CallbackParams,
): Promise<CallbackResult> {
  const { token_hash, type, token, email, code, next } = params;

  // ── token-hash path (preferred, cross-device) ──────────────────────────
  if (token_hash && type) {
    if (!isAllowedOtpType(type)) {
      console.error("[auth] callback got unknown OTP type", { type });
      return { ok: false };
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return { ok: true, next };
    }
    console.error("[auth] verifyOtp failed", {
      status: error.status,
      name: error.name,
      message: error.message,
    });
    return { ok: false };
  }

  // ── 6-digit OTP token path (form-entered code, M5 PR2 wires this) ──────
  if (token && email && type) {
    if (!isAllowedOtpType(type)) {
      console.error("[auth] callback got unknown OTP type", { type });
      return { ok: false };
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type });
    if (!error) {
      return { ok: true, next };
    }
    console.error("[auth] verifyOtp failed", {
      status: error.status,
      name: error.name,
      message: error.message,
    });
    return { ok: false };
  }

  // ── PKCE code path (backward compat) ───────────────────────────────────
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return { ok: true, next };
    }
    console.error("[auth] exchangeCodeForSession failed", {
      status: error.status,
      code: (error as { code?: string }).code,
      name: error.name,
      message: error.message,
    });
    return { ok: false };
  }

  // ── nothing usable in the URL ───────────────────────────────────────────
  console.error("[auth] callback missing required params", {
    has_token_hash: Boolean(token_hash),
    has_type: Boolean(type),
    has_token: Boolean(token),
    has_email: Boolean(email),
    has_code: Boolean(code),
  });
  return { ok: false };
}
