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
 * Hardening notes (PR #102 fix-up):
 *   - The redirect origin is built from a server-set env var
 *     (`NEXT_PUBLIC_SITE_URL` preferred, `VERCEL_URL` as Vercel-preview
 *     fallback). Reading the origin from request headers (forwarded-host
 *     / forwarded-proto) was an open-redirect vector: an attacker who
 *     spoofed those headers could trick Supabase into emailing the magic
 *     link to a redirect URL pointing at attacker-controlled hosts.
 *   - Magic-link issuance is rate-limited per (lowercased) email via the
 *     `authMagicLink` scope. Prevents email-bombing arbitrary inboxes
 *     and bulk pollution of `auth.users` (we ship with
 *     `shouldCreateUser: true`). Supabase's own throttle is too generous
 *     to be the only line of defense.
 *   - Error mapping reads typed Supabase fields (`AuthError#status`,
 *     `AuthError#code`) rather than substring-matching the message —
 *     the message-based map mis-classified anything containing "email"
 *     (e.g. network errors with "email server unreachable") as
 *     `validation_failed`.
 */

import { z } from "zod";
import { AuthError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { ErrorKey } from "@/lib/copy/errors";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";

export type MagicLinkResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/**
 * Maps a Supabase `AuthError` to one of our error-toast keys.
 *
 * Uses typed fields (status + code) rather than message-substring
 * matching: the previous heuristic flagged anything containing "email"
 * as `validation_failed`, which silently mis-classified network errors
 * whose messages mentioned "email server" etc.
 *
 * Returns `null` when the input is `null` (no error to map).
 */
function mapAuthErrorToKey(error: AuthError | null): ErrorKey | null {
  if (!error) return null;
  // Supabase surfaces rate-limit responses as HTTP 429.
  if (error.status === 429) return "rate_limit";
  // Typed validation-error code from the GoTrue REST API.
  if (error.code === "validation_failed") return "validation_failed";
  // Anything else from Supabase is a network/server-class failure as
  // far as the user is concerned.
  return "network";
}

/**
 * Builds the origin (`https://example.com`) the magic-link redirect
 * should use.
 *
 * Strict env-var resolution, no header reads. The previous
 * implementation derived the origin from `x-forwarded-host` /
 * `x-forwarded-proto`, which an attacker could spoof to redirect
 * Supabase's magic-link email at evil.com.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_URL` — operator-set, canonical
 *   2. `VERCEL_URL` — auto-populated on Vercel preview deploys, served
 *      over HTTPS
 *   3. `http://localhost:3000` — dev fallback only
 *   4. Fail closed in production — refuse to issue the link
 */
function resolveOrigin(): string {
  // Prefer a configured site URL — these are server-set in Vercel.
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Dev fallback only when actually in dev.
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  // Fail closed in prod.
  throw new Error(
    "Origin unresolved — set NEXT_PUBLIC_SITE_URL or VERCEL_URL",
  );
}

export async function requestMagicLink(
  email: string,
): Promise<MagicLinkResult> {
  // 1. Validate. The zod schema lowercases the email — the same
  //    normalized value is used as the rate-limit key so casing tricks
  //    can't expand the budget.
  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const normalizedEmail = parsed.data.email;

  // 2. Build redirect URL — `next=/trips` so the callback lands users
  //    on their trips index after the code exchange succeeds.
  let origin: string;
  try {
    origin = resolveOrigin();
  } catch {
    // Mis-configured deploy — surface as a network-class failure to
    // the user (the action never throws to the caller).
    return { ok: false, errorKey: "network" };
  }
  const emailRedirectTo = `${origin}/auth/callback?next=/trips`;

  // 3. Ask Supabase to issue the OTP / magic link, wrapped in our
  //    rate-limiter so a single email can't be bombed.
  try {
    const supabase = await createClient();
    const { error } = await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_MAGIC_LINK,
      normalizedEmail,
      () =>
        supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            emailRedirectTo,
            // Magic-link only — first login provisions the auth.users
            // row automatically.
            shouldCreateUser: true,
          },
        }),
    );

    if (error) {
      // Diagnostic logging — surfaces the underlying Supabase failure in
      // Vercel/Sentry so we can distinguish per-IP throttle vs per-email
      // throttle vs PKCE mismatch vs allowlist rejection. Never logs the
      // email or any other PII at this layer.
      console.error("[auth] signInWithOtp failed", {
        status: error.status,
        code: (error as { code?: string }).code,
        name: error.name,
        message: error.message,
      });
    }
    const mapped = mapAuthErrorToKey(error);
    if (mapped) {
      return { ok: false, errorKey: mapped };
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error("[auth] app-layer rate-limit fired", {
        scope: RATE_LIMIT_SCOPES.AUTH_MAGIC_LINK,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    // Network failures, misconfigured env vars, etc. We never throw to
    // the caller — `_form.tsx` reads `errorKey` and renders a toast.
    console.error("[auth] requestMagicLink threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}
