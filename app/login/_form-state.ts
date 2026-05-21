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

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export type Mode = "email-only" | "password" | "code-verify";

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
  password: z.string().min(6, { message: ERRORS.validation_failed }),
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
