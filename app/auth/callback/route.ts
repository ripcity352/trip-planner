import { DEFAULT_NEXT, safeNext } from "@/lib/auth/safe-next";
import { resolveCallbackResult } from "@/lib/auth/callback-handler";
import { NextResponse } from "next/server";

/**
 * `/auth/callback` — handles the 6-digit OTP verify path and OAuth PKCE.
 *
 * ## Token formats
 *
 * **6-digit OTP:** `?token=<code>&email=<email>&type=email&next=/trips`
 *   Issued by the Supabase Dashboard email template ({{ .Token }}) after
 *   the M5 template flip. Verified server-side via `verifyOtp({email,
 *   token, type})`. Primary verify path.
 *
 * **OAuth PKCE:** `?code=<code>&next=/trips`
 *   Used by Google sign-in (M5 PR5). Requires the `code_verifier` cookie
 *   from the requesting browser, set during the OAuth round-trip.
 *
 * The legacy `token_hash` branch (M3 W0c, magic-link URLs in the email)
 * was removed in PR3 of the M5 redesign after the in-flight link drain.
 *
 * ## safeNext()
 * Collapses `null`, protocol-relative (`//evil.com/x`), off-origin
 * (`https://evil.com`), and scheme-prefixed (`javascript:alert(1)`)
 * inputs to the default `/trips` target. See `lib/auth/safe-next.ts`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const params = {
    type: searchParams.get("type"),
    token: searchParams.get("token"),
    email: searchParams.get("email"),
    code: searchParams.get("code"),
    next: safeNext(searchParams.get("next")),
  };

  const result = await resolveCallbackResult(params);

  if (result.ok) {
    return NextResponse.redirect(`${origin}${result.next}`);
  }

  // #433: carry the safeNext-validated `next` through the failure bounce —
  // an invitee whose emailed code/link verification fails keeps the invite
  // context on /login instead of being re-stranded. Skip the param when
  // it's the default target so the common URL stays clean.
  const nextSuffix =
    params.next === DEFAULT_NEXT
      ? ""
      : `&next=${encodeURIComponent(params.next)}`;
  return NextResponse.redirect(`${origin}/login?error=auth${nextSuffix}`);
}
