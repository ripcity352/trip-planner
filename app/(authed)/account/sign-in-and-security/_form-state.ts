/**
 * State-machine types + helpers for <SecurityForm />.
 *
 * Extracted per the PR2 precedent (_form-state.ts pattern) to keep
 * _form.tsx under the 250 LOC threshold. No React imports.
 *
 * State machine:
 *   A        — password-only user, standard change-password form
 *   A+       — password + OAuth user, same form + helper copy mentioning OAuth
 *   C-request — State C step 1: requesting OTP email
 *   C-verify  — State C step 2: entering OTP code
 *   C-set     — State C step 3: setting new password (no current-pass verify)
 *   success   — password updated, show toast
 *
 * IdentityState drives the initial render. FormMode drives the step-by-step
 * OTP recovery flow.
 */

import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { ERRORS } from "@/lib/copy/errors";

// ---------------------------------------------------------------------------
// Identity state (derived from User.identities on the server, passed as prop)
// ---------------------------------------------------------------------------

/** Whether the user has a password identity, OAuth only, or both. */
export type IdentityState = "A" | "A+" | "no-password";

/**
 * Derives the identity state from a Supabase User object.
 * Exported for use in the server component and in unit tests.
 */
export function deriveIdentityState(user: Pick<User, "identities">): IdentityState {
  const identities = user.identities ?? [];
  const hasPassword = identities.some((id) => id.provider === "email");
  const hasOAuth = identities.some((id) => id.provider !== "email");

  if (hasPassword && hasOAuth) return "A+";
  if (hasPassword) return "A";
  return "no-password";
}

// ---------------------------------------------------------------------------
// Form mode (internal state machine for the form component)
// ---------------------------------------------------------------------------

export type FormMode =
  | "change-password" // State A / A+ — both-fields change form
  | "C-requesting"    // State C step 1: awaiting requestEmailCode result
  | "C-verify"        // State C step 2: OTP code entry
  | "C-verifying"     // State C step 2: submitting OTP
  | "C-set"           // State C step 3: new-password entry (no current-pass)
  | "B-set"           // State B: first-ever password (no current-pass, no OTP gate)
  | "success";        // Password updated

// ---------------------------------------------------------------------------
// Zod schemas (client-side — mirrors server schemas in actions.ts)
// ---------------------------------------------------------------------------

export const changePasswordClientSchema = z.object({
  currentPassword: z.string().min(1, { message: ERRORS.validation_failed }),
  newPassword: z.string().min(6, { message: ERRORS.validation_failed }),
});

export const otpCodeClientSchema = z.object({
  token: z
    .string()
    .length(6, { message: ERRORS.validation_failed })
    .regex(/^\d{6}$/, { message: ERRORS.validation_failed }),
});

export const newPasswordClientSchema = z.object({
  newPassword: z.string().min(6, { message: ERRORS.validation_failed }),
});

// State B: set password for the first time (OAuth-only or OTP-only users).
// Mirrors the server-side setPasswordSchema in actions.ts.
// No current-password field — there is no current password.
export const setPasswordClientSchema = z.object({
  newPassword: z.string().min(6, { message: ERRORS.validation_failed }),
});

// ---------------------------------------------------------------------------
// Inferred form value types
// ---------------------------------------------------------------------------

export type ChangePasswordValues = z.infer<typeof changePasswordClientSchema>;
export type OtpCodeValues = z.infer<typeof otpCodeClientSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordClientSchema>;
export type SetPasswordValues = z.infer<typeof setPasswordClientSchema>;
