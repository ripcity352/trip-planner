/**
 * Error-toast copy palette — every server-action failure path and every
 * client-side error toast pulls its string from here.
 *
 * Voice test: "would you say this out loud at a pre-trip dinner?"
 * Warm, specific, blame-free. Anti-SaaS — no "Something went wrong",
 * no "Failed to save", no "An error has occurred."
 *
 * Use cases for each key:
 *   - `network`: fetch failed, offline, request timed out
 *   - `rls_denied`: Supabase RLS rejected the read/write — caller isn't
 *      a member of the trip or doesn't have the right role
 *   - `validation_failed`: zod parse failed on server or client form
 *   - `rate_limit`: caller hit a server-action throttle
 *   - `idempotency_replayed`: the same idempotency_key was re-submitted —
 *      drunk-user-on-bad-signal double-tap; the action was already
 *      processed, so this is informational, not an error in the
 *      destructive sense
 *
 * When adding a key:
 *   1. Add it to `ErrorKey`.
 *   2. Add a string to `ERRORS` (compiler enforces exhaustiveness).
 *   3. Read it aloud once. If it sounds corporate, rewrite.
 */

export type ErrorKey =
  | "network"
  | "rls_denied"
  | "validation_failed"
  | "rate_limit"
  | "idempotency_replayed";

export const ERRORS: Record<ErrorKey, string> = {
  network: "Couldn't reach the server. Pull to retry.",
  rls_denied: "Not your trip to see. Ask whoever invited you.",
  validation_failed:
    "Something in there isn't quite right. Give it another look.",
  rate_limit: "Easy, tiger. Give it a sec and try again.",
  idempotency_replayed: "Already done — no double-tap needed.",
};
