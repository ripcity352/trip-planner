"use server";

/**
 * Server actions for /account/sign-in-and-security (M5/PR4).
 *
 * Two actions:
 *   1. changePasswordAction — State A / A+: verify current password via
 *      re-auth, then set new password. Revokes other sessions on success.
 *   2. setPasswordViaRecoveryAction — State C atomic flow: takes the 6-digit
 *      OTP token AND the new password, verifies the OTP and updates the
 *      password in ONE server call. The OTP verification is the proof-of-
 *      identity that gates the password update — no separate "OTP-already-
 *      verified" gate that an authed attacker could bypass via direct POST
 *      (see notes/decisions.md "M5 auth redesign" ADR: State C bypass fix).
 *
 * Security invariants:
 *   - Email is ALWAYS pinned from auth.getUser() server-side. The form does
 *     NOT submit an email field and this module never reads one from input.
 *   - Rate-limit scope: AUTH_CHANGE_PASSWORD (5 / 15 min per user.id).
 *   - Zod schemas are TOP-OF-FILE (M4 W1b — never split from consumer).
 *   - No idempotency_key — password rotation is not a money mutation;
 *     rate-limit is the sufficient guard.
 *   - signOut({scope:'others'}) is wrapped — if it fails AFTER the password
 *     was rotated, the action still reports success (degraded but correct).
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
import { markPasswordSet } from "@/lib/auth/has-password";

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

const setPasswordViaRecoverySchema = z.object({
  // 6-digit OTP token. The Supabase Email OTP Length is configured to 6 per
  // the M5/PR3 deploy walk — strict server-side enforcement matches client.
  token: z.string().length(6).regex(/^\d{6}$/),
  newPassword: z.string().min(6),
});

// setPasswordSchema — State B: first-ever password for OAuth/OTP-only users.
// No current-password field — there is no current password to verify.
// Per v3.2 ADR: no OTP gate, no signOut after success (nothing to invalidate).
const setPasswordSchema = z.object({
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

/**
 * Revokes all OTHER sessions for the current user, swallowing transient
 * failures. Called AFTER updateUser succeeds — the password is already
 * rotated by the time we get here, so a signOut failure must not flip the
 * outer action result to "network". Logs loudly so a regression surfaces
 * in Sentry. (Reviewer MEDIUM-1 on PR4.)
 */
async function revokeOtherSessions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: "change-password" | "recovery",
): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "others" });
  } catch (signOutErr) {
    console.error(
      `[account-security] signOut(others) failed AFTER password rotated (${context})`,
      {
        name: signOutErr instanceof Error ? signOutErr.name : "unknown",
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Changes the current user's password (State A / A+).
 *
 * Steps:
 *   1. getUser() — pins email from session (NEVER from form).
 *   2. Validate input shape via zod.
 *   3. Re-authenticate with current password (benign: rotates session
 *      cookies for the same user, documented here).
 *   4. updateUser({ password: newPassword }).
 *   5. signOut({ scope: 'others' }) — revoke all other sessions (wrapped).
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

  if (!user || !user.email) {
    return { ok: false, errorKey: "auth_unauthenticated" };
  }

  // Email is pinned from session. The form does NOT submit an email field.
  const email = user.email;

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

        // 4. Atomically mark has_password — same closure as updateUser,
        //    only reachable on success. W0 D6 (trip-readiness).
        const hp = await markPasswordSet(
          supabase,
          user.id,
          "account-security:changePassword",
        );
        if (!hp.ok) {
          return { ok: false, errorKey: "network" };
        }

        // 5. Revoke other sessions — wrapped so a transient blip doesn't
        //    flip a successful rotation into a "network" error.
        await revokeOtherSessions(supabase, "change-password");

        return { ok: true };
      },
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
 * Atomically verifies the 6-digit OTP token AND sets a new password.
 * State C atomic flow (M5/PR4 HIGH-1 fix per security-reviewer audit).
 *
 * Replaces the bypass-vulnerable two-action sequence
 * (verifyEmailCodeAction → setPasswordAfterRecoveryAction) with a single
 * server call where the OTP verification GATES the password update. An
 * attacker on a borrowed authed session cannot reach updateUser without
 * also providing a valid 6-digit OTP just sent to the victim's inbox.
 *
 * Steps:
 *   1. getUser() — pins email from session.
 *   2. Validate input (token shape + newPassword length) via zod.
 *   3. verifyOtp({email, token, type:'email'}) — invalid token short-
 *      circuits with errorKey:"auth_code_invalid" BEFORE updateUser is
 *      called. Identity is proved by the OTP, not by session presence.
 *   4. updateUser({ password: newPassword }).
 *   5. signOut({ scope: 'others' }) — wrapped.
 *
 * Rate-limit scope: AUTH_CHANGE_PASSWORD (5 / 15 min per user.id).
 */
export async function setPasswordViaRecoveryAction(input: {
  token: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { ok: false, errorKey: "auth_unauthenticated" };
  }

  const email = user.email;

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD,
      user.id,
      async (): Promise<ChangePasswordResult> => {
        // 1. Validate input shape.
        const parsed = setPasswordViaRecoverySchema.safeParse(input);
        if (!parsed.success) {
          return { ok: false, errorKey: "validation_failed" };
        }

        // 2. Verify OTP — this is the gate. Without a valid token, no
        //    password update happens. Email is server-pinned (not from form).
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          email,
          token: parsed.data.token,
          type: "email",
        });

        if (verifyErr) {
          console.error("[account-security] OTP verify failed (recovery)", {
            status: verifyErr.status,
            code: (verifyErr as { code?: string }).code,
          });
          return { ok: false, errorKey: "auth_code_invalid" };
        }

        // 3. Update password. Only reachable AFTER verifyOtp succeeded.
        const { error: updateErr } = await supabase.auth.updateUser({
          password: parsed.data.newPassword,
        });

        if (updateErr) {
          console.error(
            "[account-security] updateUser failed (recovery)",
            {
              status: updateErr.status,
              code: (updateErr as { code?: string }).code,
            },
          );
          const mapped = mapAuthErrorToKey(updateErr);
          return { ok: false, errorKey: mapped ?? "network" };
        }

        // 4. Atomically mark has_password — same closure as updateUser,
        //    only reachable on success. W0 D6 (trip-readiness).
        const hp = await markPasswordSet(
          supabase,
          user.id,
          "account-security:recovery",
        );
        if (!hp.ok) {
          return { ok: false, errorKey: "network" };
        }

        // 5. Revoke other sessions — wrapped.
        await revokeOtherSessions(supabase, "recovery");

        return { ok: true };
      },
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error("[account-security] app-layer rate-limit fired (recovery)", {
        scope: RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[account-security] setPasswordViaRecoveryAction threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}

/**
 * Sets a password for the first time (State B).
 *
 * For users who only have OAuth (Google) or OTP-based identities — no
 * existing password to rotate. No OTP gate; no signOut after success.
 *
 * v3.2 ADR locked:
 *   - NO current-password verify (there is none).
 *   - NO OTP gate (State B threat: attacker on borrowed-laptop adds a
 *     password the victim doesn't know — bad but victim's OAuth/OTP
 *     identities remain intact and they're NOT locked out).
 *   - NO signOut({scope:'others'}) — no prior credential to invalidate.
 *
 * Identity-state guard: if the user already has a password identity,
 * this action returns validation_failed — they should use State A
 * (changePasswordAction) instead.
 *
 * Rate-limit scope: AUTH_CHANGE_PASSWORD (5 / 15 min per user.id).
 */
export async function setPasswordAction(input: {
  newPassword: string;
}): Promise<ChangePasswordResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { ok: false, errorKey: "auth_unauthenticated" };
  }

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD,
      user.id,
      async (): Promise<ChangePasswordResult> => {
        // 1. Validate input shape.
        const parsed = setPasswordSchema.safeParse(input);
        if (!parsed.success) {
          return { ok: false, errorKey: "validation_failed" };
        }

        // 2. Guard: ensure this user is actually in State B (no-password).
        //    If they already have a password identity, they must use State A.
        const identities = user.identities ?? [];
        const hasPasswordIdentity = identities.some(
          (id) => id.provider === "email",
        );
        if (hasPasswordIdentity) {
          // This is State A territory — caller should use changePasswordAction.
          return { ok: false, errorKey: "validation_failed" };
        }

        // 3. Set the password for the first time.
        const { error: updateErr } = await supabase.auth.updateUser({
          password: parsed.data.newPassword,
        });

        if (updateErr) {
          console.error("[account-security] setPasswordAction updateUser failed", {
            status: updateErr.status,
            code: (updateErr as { code?: string }).code,
          });
          const mapped = mapAuthErrorToKey(updateErr);
          return { ok: false, errorKey: mapped ?? "network" };
        }

        // 4. Atomically mark has_password — same closure as updateUser,
        //    only reachable on success. W0 D6 (trip-readiness).
        const hp = await markPasswordSet(
          supabase,
          user.id,
          "account-security:setPassword",
        );
        if (!hp.ok) {
          return { ok: false, errorKey: "network" };
        }

        // NOTE: No signOut({scope:'others'}) — State B has no prior credential
        // to invalidate. Per v3.2 ADR.

        return { ok: true };
      },
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error("[account-security] app-layer rate-limit fired (setPassword)", {
        scope: RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD,
      });
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[account-security] setPasswordAction threw", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorKey: "network" };
  }
}
