/**
 * `resolveCallbackResult()` — core logic for the `/auth/callback` route.
 *
 * Extracted from the route handler so it can be unit-tested without the
 * full Next.js request lifecycle. The route handler calls this and then
 * translates the result into a NextResponse.
 *
 * ## Auth flow decision
 *
 * We support two token formats for backward compatibility during the
 * Supabase Dashboard email-template flip window:
 *
 * 1. **token-hash** (`token_hash` + `type` params) — the new default.
 *    Self-contained: no `code_verifier` cookie required, works across
 *    devices and cookie jars. See #137.
 *
 * 2. **PKCE code** (`code` param) — the @supabase/ssr legacy default.
 *    Requires the `code_verifier` cookie from the requesting browser.
 *    Kept as backward-compat path for links in-flight during the
 *    template switch.
 *
 * When both are present, token-hash wins (prefer the self-contained path).
 */

import { createClient } from "@/lib/supabase/server";

export interface CallbackParams {
  /** token_hash from the new magic-link template (verifyOtp path) */
  token_hash: string | null;
  /** OTP type — always "email" for magic links */
  type: string | null;
  /** PKCE code from the legacy ConfirmationURL template */
  code: string | null;
  /** Safe-next redirect path, already normalized by safeNext() */
  next: string;
}

export type CallbackResult = { ok: true; next: string } | { ok: false };

/**
 * Resolves an auth callback to either a success (with redirect target)
 * or a failure.
 *
 * Precedence: token_hash + type → PKCE code → error.
 */
export async function resolveCallbackResult(
  params: CallbackParams,
): Promise<CallbackResult> {
  const { token_hash, type, code, next } = params;
  const supabase = await createClient();

  // ── token-hash path (preferred, cross-device) ──────────────────────────
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as Parameters<typeof supabase.auth.verifyOtp>[0]["type"] });
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
    has_code: Boolean(code),
  });
  return { ok: false };
}
