"use server";

/**
 * Server actions for the magic-link login flow (#71).
 *
 * Surface contract:
 *   - `requestMagicLink(email)` accepts an email string from the client
 *     form, validates with zod, and asks Supabase to email a magic link.
 *   - Always returns a discriminated union — `{ ok: true }` on success,
 *     `{ ok: false, errorKey: ErrorKey }` on any failure. Never throws.
 *
 * The redirect target after the user clicks the link is
 *   <origin>/auth/callback?next=/trips
 * which is the path the existing `app/auth/callback/route.ts` knows how
 * to handle. The origin is derived from request headers (forwarded
 * host/proto when behind a proxy, otherwise the literal host header) so
 * the link works in preview deploys without env coupling.
 *
 * NOTE on rate limiting:
 *   `lib/rate-limit` exposes `rateLimitedAction(scope, key, fn)` but
 *   `RateLimitScope` only includes `createTrip` and `acceptInvite` —
 *   both files are read-only for this wave. The HTTP-level guard in
 *   `middleware.ts` also skips `/login` (only `/api/**` and `/trips**`
 *   are in `GUARDED_PATH_PATTERNS`). Supabase itself rate-limits OTP
 *   issuance per email + per IP server-side, which is sufficient for
 *   M2. A follow-up issue can add an `AUTH_MAGIC_LINK` scope.
 */

import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { ErrorKey } from "@/lib/copy/errors";

export type MagicLinkResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/**
 * Maps a Supabase auth error string to one of our error-toast keys.
 * Defaults to `network` — the most plausible "couldn't reach" failure
 * mode from the user's perspective when something we don't recognize
 * went wrong.
 */
function mapAuthErrorToKey(message: string | undefined): ErrorKey {
  if (!message) return "network";
  const m = message.toLowerCase();
  if (m.includes("rate") || m.includes("too many") || m.includes("429")) {
    return "rate_limit";
  }
  if (m.includes("invalid") || m.includes("email")) {
    return "validation_failed";
  }
  return "network";
}

/**
 * Builds the origin (`https://example.com`) the magic-link redirect
 * should use. Prefers forwarded-host + forwarded-proto (Vercel preview
 * + prod path), falls back to the `host` header, and defaults to
 * localhost for the dev server.
 */
async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto");
  const host = forwardedHost ?? h.get("host") ?? "localhost:3000";
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestMagicLink(
  email: string,
): Promise<MagicLinkResult> {
  // 1. Validate
  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  // 2. Build redirect URL — `next=/trips` so the callback lands users
  //    on their trips index after the code exchange succeeds.
  const origin = await resolveOrigin();
  const emailRedirectTo = `${origin}/auth/callback?next=/trips`;

  // 3. Ask Supabase to issue the OTP / magic link.
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo,
        // Magic-link only — never create users via passwords. First
        // login provisions the auth.users row automatically.
        shouldCreateUser: true,
      },
    });

    if (error) {
      return { ok: false, errorKey: mapAuthErrorToKey(error.message) };
    }

    return { ok: true };
  } catch (err) {
    // Network failures, misconfigured env vars, etc. We never throw to
    // the caller — `_form.tsx` reads `errorKey` and renders a toast.
    const message = err instanceof Error ? err.message : undefined;
    return { ok: false, errorKey: mapAuthErrorToKey(message) };
  }
}
