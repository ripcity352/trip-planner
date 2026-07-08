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
  | "idempotency_replayed"
  | "auth_failed"
  | "auth_link_sent"
  | "invite_expired"
  | "invite_exhausted"
  | "invite_not_found"
  | "trip_create_failed"
  | "rsvp_save_failed"
  // M3 error keys (Wave 0a). Naming follows the existing
  // `<feature>_<verb>_failed` pattern. Voice-tested — blame-free, warm,
  // specific. See `notes/m3-execution-plan.md` Override F.
  | "itinerary_save_failed"
  | "itinerary_delete_failed"
  | "item_rsvp_save_failed"
  | "item_flag_save_failed"
  | "announcement_post_failed"
  | "trip_notes_save_failed"
  | "travel_leg_save_failed"
  | "travel_leg_delete_failed"
  | "lodging_assign_failed"
  | "invite_mint_failed"
  | "invite_revoke_failed"
  // M4 error keys (Wave 0a). Naming follows `<feature>_<verb>_failed`.
  // Voice rule: blame-free, warm, specific — NO "An error occurred",
  // NO bare "error". These pass the "would you say this at a pre-trip
  // dinner?" test. Anti-corporate guard is pinned in
  // lib/copy/__tests__/m4-voice-locks.test.ts.
  // #372 — expenses MVP.
  | "expense_add_failed"
  | "address_lookup_failed"
  | "datetime_invalid"
  | "places_proxy_failed"
  // M5 auth error keys (PR2). Voice rule same as above — blame-free,
  // specific, no corporate language. Exact strings pinned in
  // lib/copy/__tests__/m5-auth-voice-locks.test.ts (Phase 4 audit H7).
  | "auth_wrong_password"
  | "auth_code_invalid"
  | "auth_code_expired"
  // Returned when "email me a code" hits a 422 otp_disabled — i.e. no
  // account exists for that email yet (shouldCreateUser:false). New
  // invitees must create an account with a password first (the prod-walk
  // dead-end fix). Replaces the misleading generic `network` it used to
  // fall through to.
  | "auth_no_account"
  // Placeholder for PR5 (OAuth). Not yet wired to any action — kept
  // here so the type union is complete and TypeScript enforces
  // exhaustiveness in the ERRORS record below.
  | "auth_email_taken_oauth"
  // M5 PR4 — account sign-in & security page.
  // auth_current_password_incorrect: Phase 4 audit H7 voice rewrite — exact
  // string locked. Do NOT change without updating the voice-lock test.
  // auth_unauthenticated: returned by server actions when auth.getUser() returns null.
  | "auth_current_password_incorrect"
  | "auth_unauthenticated"
  // M5 PR5 — Google OAuth redirect failure (e.g. Supabase returns no URL).
  | "oauth_redirect_failed";

export const ERRORS: Record<ErrorKey, string> = {
  network: "Couldn't reach the server. Pull to retry.",
  rls_denied: "Not your trip to see. Ask whoever invited you.",
  validation_failed:
    "Something in there isn't quite right. Give it another look.",
  rate_limit: "Easy, tiger. Give it a sec and try again.",
  idempotency_replayed: "Already done — no double-tap needed.",
  auth_failed: "Link's stale. Hop back to /login and try again.",
  auth_link_sent: "Link's on its way. Check your email — it's quick.",
  invite_expired: "That link expired. Ask whoever sent it for a fresh one.",
  invite_exhausted: "Link's been used up. Ask whoever sent it for another.",
  invite_not_found: "Can't find that invite. Double-check the link.",
  trip_create_failed:
    "Couldn't lock that in. Give it another shot in a sec.",
  rsvp_save_failed: "RSVP didn't save. Tap it again — it'll catch.",
  // M3 error strings — same voice rules.
  itinerary_save_failed:
    "Didn't save. Give it another tap — your connection's flaky.",
  itinerary_delete_failed: "Couldn't delete that. Try once more in a sec.",
  item_rsvp_save_failed:
    "Couldn't update your spot on that one. Tap again — it'll catch.",
  item_flag_save_failed:
    "Heads-up didn't save. Try once more — the organizers won't see it until it does.",
  announcement_post_failed:
    "Update didn't go out. Tap send again — the group hasn't seen it yet.",
  trip_notes_save_failed: "Notes didn't save. Try once more in a sec.",
  travel_leg_save_failed:
    "Leg didn't save. Tap again — your connection's flaky.",
  travel_leg_delete_failed: "Couldn't delete that leg. Try once more.",
  lodging_assign_failed:
    "Rooms didn't budge. Tap again — it'll catch.",
  invite_mint_failed:
    "Couldn't mint a link. Try once more — sometimes the server takes a sec.",
  invite_revoke_failed: "Couldn't revoke that link yet. Try once more.",
  expense_add_failed: "That one didn't stick. Log it again in a sec.",
  // M4 error strings — same voice rules. Blame-free, specific, no corporate language.
  // "Couldn't pull" / "snoozing" / "Type the address instead" — casual, actionable.
  address_lookup_failed:
    "Couldn't pull suggestions. Type the address instead.",
  datetime_invalid: "That doesn't look like a real time.",
  places_proxy_failed:
    "Place lookup's snoozing. Type the address instead.",
  // M5 auth error strings (PR2). Voice-critical per Phase 4 audit H7 —
  // exact wording rewritten from the original plan to pass the pre-trip
  // dinner test. Pinned in lib/copy/__tests__/m5-auth-voice-locks.test.ts.
  //
  // auth_wrong_password: rewritten from "That email and password didn't
  // match. Try again, or email me a code." → shorter, warmer, less
  // clinical; "combo" is casual, "get a code emailed" mirrors the button.
  auth_wrong_password:
    "That combo didn't match. Try again — or get a code emailed instead.",
  auth_code_invalid:
    "That code didn't take. Double-check or get a fresh one.",
  auth_code_expired: "Code's stale. Get a fresh one.",
  // No account yet for that email — point them at the password path (sign-up
  // is explicit; codes don't create accounts). Voice: blame-free, casual.
  auth_no_account: "No account on that email yet. Add a password to create one.",
  // PR5 placeholder — not wired yet. Copy ready so the error is
  // user-visible the moment OAuth lands without a follow-up copy sprint.
  auth_email_taken_oauth:
    "You signed up with Google before. Tap Continue with Google instead.",
  // M5 PR4 — account sign-in & security page.
  // auth_current_password_incorrect: H7-locked exact string — DO NOT change
  // without updating lib/copy/__tests__/m5-auth-voice-locks.test.ts.
  // Instructs the user to try once more OR recover via OTP code.
  auth_current_password_incorrect:
    "That's not the current password. Try once more — or use a code to reset.",
  // auth_unauthenticated: shown when the server action resolves getUser() to null.
  // Blame-free — the session just expired or was revoked on another device.
  auth_unauthenticated: "Your session expired. Sign in again to continue.",
  // M5 PR5 — returned when supabase.auth.signInWithOAuth() returns no redirect URL.
  // Blame-free, actionable.
  oauth_redirect_failed: "Couldn't start Google sign-in. Try again in a sec.",
};
