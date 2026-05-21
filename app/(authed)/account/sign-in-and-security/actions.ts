"use server";

/**
 * Server actions for /account/sign-in-and-security (M5/PR4).
 *
 * Two actions:
 *   1. changePasswordAction — State A / A+: verify current password via
 *      re-auth, then set new password. Revokes other sessions on success.
 *   2. setPasswordAfterRecoveryAction — State C step 3: OTP already verified
 *      upstream (via verifyEmailCodeAction from PR2); just sets the new
 *      password without requiring current. Revokes other sessions on success.
 *
 * Security invariants:
 *   - Email is ALWAYS pinned from auth.getUser() server-side. The form does
 *     NOT submit an email field and this module never reads one from input.
 *   - Rate-limit scope: AUTH_CHANGE_PASSWORD (5 / 15 min per user.id).
 *   - Zod schemas are TOP-OF-FILE (M4 W1b — never split from consumer).
 *   - No idempotency_key — password rotation is not a money mutation;
 *     rate-limit is the sufficient guard.
 *
 * Tests: tests/unit/account-actions.test.ts (Override C — never under app/).
 */

import { z } from "zod";
import type { AuthError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { ErrorKey } from "@/lib/copy/errors";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Zod schemas (M4 W1b — co-located with actions, never split)
// ---------------------------------------------------------------------------

const changePasswordSchema = z.object({
  // currentPassword: min 1 — server-side only checks presence, not length,
  // because the Supabase re-auth call provides the ground truth.
  currentPassword: z.string().min(1),
  // newPassword: 6-char minimum — v3.2 locked, no complexity rules.
  newPassword: z.string().min(6),
});

const setPasswordAfterRecoverySchema = z.object({
  newPassword: z.string().min(6),
});

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a Supabase AuthError to one of our error-toast keys.
 * Uses typed fields (status + code), never message-substring matching.
 */
function mapAuthErrorToKey(
  error:
    | AuthError
    | { status?: number; code?: string | null; message?: string }
    | null,
): ErrorKey | null {
  if (!error) return null;
  if (error.status === 429) return "rate_limit";
  if (
    error.status === 400 &&
    (error.code === "invalid_credentials" ||
      error.code === "email_not_confirmed" ||
      error.code === "invalid_grant")
  ) {
    return "auth_current_password_incorrect";
  }
  if (error.code === "validation_failed") return "validation_failed";
  return "network";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Changes the current user's password.
 *
 * Steps:
 *   1. getUser() — pins email from session (NEVER from form).
 *   2. Validate input shape via zod.
 *   3. Re-authenticate with current password (benign: rotates session
 *      cookies for the same user, documented here).
 *   4. updateUser({ password: newPassword }).
 *   5. signOut({ scope: 'others' }) — revoke all other sessions.
 *
 * Rate-limit scope: AUTH_CHANGE_PASSWORD (5 / 15 min per user.id).
 */
export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, errorKey: "auth_unauthenticated" };
  }

  // Email is pinned from session. The form does NOT submit an email field.
  const email = user.email!;

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD,
      user.id,
      async (): Promise<ChangePasswordResult> => {
        // 1. Validate input shape.
        const parsed = changePasswordSchema.safeParse(input);
        if (!parsed.success) {
          return { ok: false, errorKey: "validation_failed" };
        }

        // 2. Verify current password via re-auth.
        //    NOTE: signInWithPassword rotates the session token for the same
        //    user — benign (no privilege change), but worth documenting.
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email,
          password: parsed.data.currentPassword,
        });

        if (verifyErr) {
          // Don't leak the underlying Supabase error — map to canonical key.
          console.error("[account-security] current-password verify failed", {
            status: verifyErr.status,
            code: (verifyErr as { code?: string }).code,
          });
          return { ok: false, errorKey: "auth_current_password_incorrect" };
        }

        // 3. Update password.
        const { error: updateErr } = await supabase.auth.updateUser({
          password: parsed.data.newPassword,
        });

        if (updateErr) {
          console.error("[account-security] updateUser failed", {
            status: updateErr.status,
            code: (updateErr as { code?: string }).code,
          });
          const mapped = mapAuthErrorToKey(updateErr);
          return { ok: false, errorKey: mapped ?? "network" };
        }

        // 4. Revoke all OTHER sessions (keep this one).
        await supabase.auth.signOut({ scope: "others" });

        return { ok: true };
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error("[account-security] app-layer rate-limit fired", {
        scope: RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[account-security] changePasswordAction threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}

/**
 * Sets a new password after OTP recovery (State C step 3).
 *
 * The OTP has already been verified upstream via verifyEmailCodeAction (PR2),
 * which refreshed the session. This action skips the current-password verify
 * step because the OTP verification already proved identity.
 *
 * Rate-limit scope: AUTH_CHANGE_PASSWORD (5 / 15 min per user.id).
 */
export async function setPasswordAfterRecoveryAction(input: {
  newPassword: string;
}): Promise<ChangePasswordResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, errorKey: "auth_unauthenticated" };
  }

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD,
      user.id,
      async (): Promise<ChangePasswordResult> => {
        // 1. Validate input shape.
        const parsed = setPasswordAfterRecoverySchema.safeParse(input);
        if (!parsed.success) {
          return { ok: false, errorKey: "validation_failed" };
        }

        // 2. Update password. No current-password verify — OTP already did it.
        const { error: updateErr } = await supabase.auth.updateUser({
          password: parsed.data.newPassword,
        });

        if (updateErr) {
          console.error("[account-security] setPasswordAfterRecovery updateUser failed", {
            status: updateErr.status,
            code: (updateErr as { code?: string }).code,
          });
          const mapped = mapAuthErrorToKey(updateErr);
          return { ok: false, errorKey: mapped ?? "network" };
        }

        // 3. Revoke all OTHER sessions (keep this one).
        await supabase.auth.signOut({ scope: "others" });

        return { ok: true };
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error("[account-security] app-layer rate-limit fired (recovery)", {
        scope: RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[account-security] setPasswordAfterRecoveryAction threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}
