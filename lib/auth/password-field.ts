/**
 * Shared zod fragment for password fields (#471).
 *
 * Both password-form surfaces (/login and /account/sign-in-and-security)
 * used a single `.min(6, validation_failed)`, which collapsed an EMPTY
 * field and a TOO-SHORT one into the same generic message. This fragment
 * splits them — and pins the ordering trap: emptiness is checked BEFORE
 * length, so an empty field never reads "too short".
 *
 * The 6-char minimum mirrors the server-side schemas (see the M5 auth
 * redesign ADR in notes/decisions.md for why 6, no breach check, etc.).
 */

import { z } from "zod";
import { ERRORS } from "@/lib/copy/errors";

/** Minimum password length — mirrors the Supabase-side setting (M5 ADR). */
export const PASSWORD_MIN_LENGTH = 6;

/** Required password field with the empty/too-short message split. */
export const passwordField = z
  .string()
  .min(1, { message: ERRORS.auth_password_required })
  .min(PASSWORD_MIN_LENGTH, { message: ERRORS.auth_password_too_short });
