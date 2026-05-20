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
  | "invite_revoke_failed";

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
};
