/**
 * State-machine types + zod schemas for `<LoginForm />`.
 *
 * Extracted per Phase 4 audit LOW #1 — keep `_form.tsx` under 250 LOC by
 * pulling the pure-data layer here. No React imports.
 *
 * Exported for tests and `_form.tsx`. Not part of the app's public surface.
 */

import { z } from "zod";
import { ERRORS } from "@/lib/copy/errors";
import { passwordField } from "@/lib/auth/password-field";

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export type Mode = "email-only" | "password" | "code-verify";

/**
 * Which primary affordance the password step leads with (invite surface
 * only — /login is always "sign-in"). The invite surface defaults to
 * "create": its most common persona is a never-seen invitee, and the old
 * sign-in-first labels walked brand-new users into the wrong branch
 * (2026-07-11 incident #5).
 */
export type AuthIntent = "create" | "sign-in";

// ---------------------------------------------------------------------------
// Zod schemas (client-side mirrors of the server-side schemas in actions.ts)
// ---------------------------------------------------------------------------

export const emailOnlySchema = z.object({
  email: z
    .string()
    .min(1, { message: ERRORS.validation_failed })
    .email({ message: ERRORS.validation_failed }),
});

export const passwordSchema = z.object({
  email: z.string().email(),
  // #471 — shared fragment splits empty ("enter it") vs too-short ("6+").
  password: passwordField,
});

export const codeSchema = z.object({
  email: z.string().email(),
  token: z
    .string()
    .length(6, { message: ERRORS.validation_failed })
    .regex(/^\d{6}$/, { message: ERRORS.validation_failed }),
});

// ---------------------------------------------------------------------------
// Inferred form value types
// ---------------------------------------------------------------------------

export type EmailOnlyValues = z.infer<typeof emailOnlySchema>;
export type PasswordValues = z.infer<typeof passwordSchema>;
export type CodeValues = z.infer<typeof codeSchema>;
