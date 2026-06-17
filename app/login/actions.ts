"use server";

/**
 * Server actions for the progressive-disclosure login flow (M5/PR2).
 *
 * Surface contract — all actions return a discriminated union:
 *   { ok: true } | { ok: false; errorKey: ErrorKey }
 * None throw. All wrapped in rateLimitedAction.
 *
 * Zod schemas are co-located with actions (M4 W1b — never split contract
 * from consumer).
 *
 * Security notes:
 *   - The redirect origin is built from a server-set env var
 *     (NEXT_PUBLIC_SITE_URL preferred, VERCEL_URL as Vercel-preview
 *     fallback). Never read from request headers (open-redirect vector).
 *   - signInWithPasswordAction / signUpAction use the AUTH_PASSWORD scope
 *     (5 / 15 min) — tighter than the default to blunt online brute-force.
 *   - verifyEmailCodeAction / requestEmailCode use AUTH_OTP_VERIFY scope.
 *   - requestEmailCode passes shouldCreateUser: false — explicit sign-up
 *     is now handled by signUpAction. An email-code request for an unknown
 *     address must NOT silently provision a phantom account.
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
import { safeNext } from "@/lib/auth/safe-next";
import { markPasswordSet } from "@/lib/auth/has-password";

// ---------------------------------------------------------------------------
// Zod schemas (M4 W1b — co-located with actions)
// ---------------------------------------------------------------------------

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const signInWithPasswordSchema = emailSchema.extend({
  // 6-char minimum — v3.2 locked. No complexity rules.
  password: z.string().min(6),
});

// signUpSchema has the same shape as signInWithPasswordSchema, different intent.
const signUpSchema = signInWithPasswordSchema;

const verifyEmailCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // 6 digits exactly.
  token: z.string().length(6).regex(/^\d{6}$/),
});

// signInWithOAuthSchema — only google for now; Apple deferred per ADR.
const signInWithOAuthSchema = z.object({
  provider: z.enum(["google"]),
  // 2048 cap matches RFC 7230 practical URL length; safeNext sanitizes
  // protocol-relative / off-origin / scheme-prefixed inputs further.
  next: z.string().max(2048).optional(),
});

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AuthResult = { ok: true } | { ok: false; errorKey: ErrorKey };

/**
 * OAuthStartResult: caller receives a URL to navigate to (window.location.assign).
 * Using a discriminated union so the caller never has to guess whether url is set.
 */
export type OAuthStartResult =
  | { ok: true; url: string }
  | { ok: false; errorKey: ErrorKey };

// Keep the old alias name for compatibility with any import that still
// uses MagicLinkResult (should be none after PR2 but belt-and-suspenders).
export type MagicLinkResult = AuthResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a Supabase AuthError to one of our error-toast keys.
 *
 * Uses typed fields (status + code) rather than message-substring matching.
 * Returns null when the input is null.
 */
function mapAuthErrorToKey(
  error: AuthError | { status?: number; code?: string | null; message?: string } | null,
): ErrorKey | null {
  if (!error) return null;
  // Supabase surfaces rate-limit responses as HTTP 429.
  if (error.status === 429) return "rate_limit";
  // 422 otp_disabled — "email me a code" for an address with no account.
  // shouldCreateUser:false (anti-phantom-account) means codes never create
  // users, so a new invitee dead-ends here. Surface a clear "create an
  // account" message instead of the generic network fallthrough below.
  if (error.code === "otp_disabled") return "auth_no_account";
  // Wrong password / invalid credentials — HTTP 400 with invalid_credentials code.
  if (
    error.status === 400 &&
    (error.code === "invalid_credentials" ||
      error.code === "email_not_confirmed" ||
      // Some Supabase versions use "invalid_grant" in error.code for bad creds
      error.code === "invalid_grant")
  ) {
    return "auth_wrong_password";
  }
  // Typed validation-error code from the GoTrue REST API.
  if (error.code === "validation_failed") return "validation_failed";
  // Anything else is a network/server-class failure.
  return "network";
}

/**
 * Maps an OTP/code verification error to one of our error keys.
 */
function mapOtpErrorToKey(
  error: AuthError | { status?: number; code?: string | null; message?: string } | null,
): ErrorKey | null {
  if (!error) return null;
  if (error.status === 429) return "rate_limit";
  // otp_expired covers both expired and invalid tokens in Supabase's GoTrue.
  if (error.code === "otp_expired" || error.status === 401) {
    return "auth_code_invalid";
  }
  if (error.code === "validation_failed") return "validation_failed";
  return "network";
}

/**
 * Builds the origin (https://example.com) the redirect should use.
 *
 * Strict env-var resolution, no header reads. Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL — operator-set, canonical
 *   2. VERCEL_URL — auto-populated on Vercel preview deploys
 *   3. http://localhost:3000 — dev fallback only
 *   4. Fail closed in production
 */
function resolveOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  throw new Error(
    "Origin unresolved — set NEXT_PUBLIC_SITE_URL or VERCEL_URL",
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Signs in a returning user with email + password.
 *
 * Rate-limit scope: AUTH_PASSWORD (5 / 15 min per email).
 * On wrong password: returns { ok: false, errorKey: "auth_wrong_password" }.
 */
export async function signInWithPasswordAction(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const parsed = signInWithPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { email, password } = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_PASSWORD,
      email,
      () => supabase.auth.signInWithPassword({ email, password }),
    );

    if (error) {
      console.error("[auth] signInWithPassword failed", {
        status: error.status,
        code: (error as { code?: string }).code,
        name: error.name,
      });
      const mapped = mapAuthErrorToKey(error);
      return { ok: false, errorKey: mapped ?? "network" };
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error("[auth] app-layer rate-limit fired", {
        scope: RATE_LIMIT_SCOPES.AUTH_PASSWORD,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[auth] signInWithPasswordAction threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}

/**
 * Creates a new account with email + password and signs in immediately.
 *
 * Rate-limit scope: AUTH_PASSWORD (5 / 15 min per email).
 */
export async function signUpAction(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { email, password } = parsed.data;

  let origin: string;
  try {
    origin = resolveOrigin();
  } catch {
    return { ok: false, errorKey: "network" };
  }
  const emailRedirectTo = `${origin}/auth/callback?next=/trips`;

  try {
    const supabase = await createClient();
    const { data, error } = await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_PASSWORD,
      email,
      () =>
        supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        }),
    );

    if (error) {
      console.error("[auth] signUp failed", {
        status: error.status,
        code: (error as { code?: string }).code,
        name: error.name,
      });
      const mapped = mapAuthErrorToKey(error);
      return { ok: false, errorKey: mapped ?? "network" };
    }

    // Atomically mark has_password in profiles — same closure as signUp,
    // so this only runs when signUp succeeds. W0 D6 (trip-readiness).
    const userId = data?.user?.id;
    if (userId) {
      const hp = await markPasswordSet(supabase, userId, "auth:signUp");
      if (!hp.ok) {
        return { ok: false, errorKey: "network" };
      }
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error("[auth] app-layer rate-limit fired", {
        scope: RATE_LIMIT_SCOPES.AUTH_PASSWORD,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[auth] signUpAction threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}

/**
 * Verifies a 6-digit email code (OTP) for the code-fallback login path.
 *
 * Rate-limit scope: AUTH_OTP_VERIFY.
 * On invalid/expired code: returns { ok: false, errorKey: "auth_code_invalid" }.
 */
export async function verifyEmailCodeAction(input: {
  email: string;
  token: string;
}): Promise<AuthResult> {
  const parsed = verifyEmailCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { email, token } = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_OTP_VERIFY,
      email,
      () => supabase.auth.verifyOtp({ email, token, type: "email" }),
    );

    if (error) {
      console.error("[auth] verifyOtp failed", {
        status: error.status,
        code: (error as { code?: string }).code,
        name: error.name,
      });
      const mapped = mapOtpErrorToKey(error);
      return { ok: false, errorKey: mapped ?? "network" };
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error("[auth] app-layer rate-limit fired", {
        scope: RATE_LIMIT_SCOPES.AUTH_OTP_VERIFY,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[auth] verifyEmailCodeAction threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}

/**
 * Sends a 6-digit OTP email to the given address.
 *
 * Renamed from `requestMagicLink` (M5/PR2). The rename signals a
 * deliberate API change: this now sends a numeric code rather than a
 * click-to-sign-in link.
 *
 * IMPORTANT — shouldCreateUser: false
 * The legacy requestMagicLink had shouldCreateUser: true (first-login
 * provisioning). After PR2, sign-up is explicit via signUpAction. Setting
 * shouldCreateUser: false here ensures that a code request for an unknown
 * email does NOT silently provision a phantom account in auth.users.
 *
 * Rate-limit scope: AUTH_OTP_VERIFY.
 */
export async function requestEmailCode(email: string): Promise<AuthResult> {
  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const normalizedEmail = parsed.data.email;

  let origin: string;
  try {
    origin = resolveOrigin();
  } catch {
    return { ok: false, errorKey: "network" };
  }
  const emailRedirectTo = `${origin}/auth/callback?next=/trips`;

  try {
    const supabase = await createClient();
    const { error } = await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_OTP_VERIFY,
      normalizedEmail,
      () =>
        supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            emailRedirectTo,
            // shouldCreateUser: false — explicit sign-up is now via
            // signUpAction. An email-code request for an unknown address
            // must NOT silently provision a phantom account.
            shouldCreateUser: false,
          },
        }),
    );

    if (error) {
      console.error("[auth] signInWithOtp failed", {
        status: error.status,
        code: (error as { code?: string }).code,
        name: error.name,
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
        scope: RATE_LIMIT_SCOPES.AUTH_OTP_VERIFY,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[auth] requestEmailCode threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}

/**
 * Starts a Google OAuth sign-in round-trip.
 *
 * Returns { ok: true, url } — caller does `window.location.assign(url)`.
 * The `next` param is sanitized by safeNext before embedding in redirectTo.
 *
 * Rate-limit scope: AUTH_PASSWORD (OAuth start is keyed by IP/device,
 * not by user; reusing the same scope keeps the budget shared with
 * password attempts from the same session).
 *
 * Security notes:
 *   - `next` is validated via safeNext before it reaches the redirectTo URL.
 *   - `provider` is constrained to the z.enum(["google"]) allowlist.
 *   - We never read the OAuth `state` parameter on the server — Supabase
 *     handles round-trip state internally (PKCE code verifier).
 *   - Origin is built from env vars, never from request headers.
 */
export async function signInWithOAuthAction(input: {
  provider: "google";
  next?: string;
}): Promise<OAuthStartResult> {
  const parsed = signInWithOAuthSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  let origin: string;
  try {
    origin = resolveOrigin();
  } catch {
    return { ok: false, errorKey: "network" };
  }

  const nextPath = safeNext(parsed.data.next ?? null);
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  // No app-layer rate-limit — OAuth start is pre-auth (no user.id, no email
  // yet), so the only sensible key would be IP. The middleware path-throttle
  // on `/login` already provides per-IP rate-limiting at the edge (see
  // GUARDED_PATH_PATTERNS in lib/rate-limit/index.ts). Stacking an action-
  // level limiter with a constant key would create a global DoS bucket where
  // any single client could exhaust the budget for all OAuth-start attempts.
  // Reviewer HIGH on PR #231 fix-up `<sha>` for the original mistake.
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: parsed.data.provider,
      options: { redirectTo },
    });

    if (error) {
      console.error("[auth] signInWithOAuth failed", {
        status: (error as { status?: number }).status,
        code: (error as { code?: string }).code,
        name: error.name,
      });
      return { ok: false, errorKey: "oauth_redirect_failed" };
    }

    if (!data.url) {
      console.error("[auth] signInWithOAuth returned no URL");
      return { ok: false, errorKey: "oauth_redirect_failed" };
    }

    return { ok: true, url: data.url };
  } catch (err) {
    if (err instanceof RateLimitError) {
      // Defensive — no inner rate-limit anymore, but if middleware-level
      // throttle bubbles up via a rejected promise we still translate.
      console.error("[auth] app-layer rate-limit fired (oauth-start)", {
        scope: RATE_LIMIT_SCOPES.AUTH_PASSWORD,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[auth] signInWithOAuthAction threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}
