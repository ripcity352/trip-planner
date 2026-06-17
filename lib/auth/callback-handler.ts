/**
 * `resolveCallbackResult()` — core logic for the `/auth/callback` route.
 *
 * Extracted from the route handler so it can be unit-tested without the
 * full Next.js request lifecycle. The route handler calls this and then
 * translates the result into a NextResponse.
 *
 * ## Auth flow decision
 *
 * After the M5 template flip (PR3), Supabase Dashboard's email template
 * issues 6-digit codes ({{ .Token }}) instead of magic-link URLs. The
 * legacy `token_hash` branch (M3 W0c) was removed once the in-flight
 * link drain expired (~1 h after the dashboard flip). Two formats now
 * survive:
 *
 * 1. **6-digit OTP code** (`token` + `email` + `type` params) — the
 *    primary verify path. The user enters the 6-digit code from the
 *    email on a form; the server action POSTs to `/auth/callback`.
 *    Uses `verifyOtp({email, token, type})`.
 *
 * 2. **PKCE code** (`code` param) — the @supabase/ssr default for
 *    OAuth callbacks (PR5). Requires the `code_verifier` cookie from
 *    the requesting browser. Stays load-bearing for Google sign-in.
 *
 * Precedence: `token + email + type` → `code`. Both branches lazy-
 * instantiate the Supabase client so a malformed callback (no params
 * at all) doesn't waste a client allocation.
 */

import { createClient } from "@/lib/supabase/server";

export interface CallbackParams {
  /** OTP type — "email" for the 6-digit code flow */
  type: string | null;
  /** 6-digit OTP token entered on a form (verifyOtp with email+token+type) */
  token: string | null;
  /** Email address paired with token for the 6-digit OTP form path */
  email: string | null;
  /** PKCE code from OAuth callbacks (PR5 Google sign-in) */
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
 * Precedence: token + email + type → PKCE code → error. Each branch
 * lazy-instantiates the Supabase client so a malformed callback (no
 * params at all) doesn't waste a client allocation just to bounce to
 * `/login?error=auth`.
 */
export async function resolveCallbackResult(
  params: CallbackParams,
): Promise<CallbackResult> {
  const { type, token, email, code, next } = params;

  // ── 6-digit OTP token path (primary verify) ────────────────────────────
  if (token && email && type) {
    if (!isAllowedOtpType(type)) {
      console.error("[auth] callback got unknown OTP type", { type });
      return { ok: false };
    }
    // try/catch is load-bearing: verifyOtp / exchangeCodeForSession can
    // THROW (not just return {error}) — most notably exchangeCodeForSession
    // when the PKCE code_verifier cookie is absent, which is the norm when an
    // emailed link opens in a different browser than the one that requested
    // it. The route handler has no boundary, so an uncaught throw renders a
    // 500 with an empty body — the blank "/auth/callback" page from the prod
    // walk. Collapsing the throw to ok:false lets the route redirect to
    // /login?error=auth instead of dead-ending. (#316 follow-up.)
    try {
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
    } catch (err) {
      // Covers both createClient() and verifyOtp() throwing — either way the
      // OTP verify path failed and we fail closed.
      console.error("[auth] OTP verify path threw", {
        name: err instanceof Error ? err.name : "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    }
  }

  // ── PKCE code path (OAuth callbacks) ───────────────────────────────────
  if (code) {
    try {
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
    } catch (err) {
      // Covers both createClient() and exchangeCodeForSession() throwing.
      console.error("[auth] PKCE exchange path threw", {
        name: err instanceof Error ? err.name : "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    }
  }

  // ── nothing usable in the URL ───────────────────────────────────────────
  console.error("[auth] callback missing required params", {
    has_type: Boolean(type),
    has_token: Boolean(token),
    has_email: Boolean(email),
    has_code: Boolean(code),
  });
  return { ok: false };
}
