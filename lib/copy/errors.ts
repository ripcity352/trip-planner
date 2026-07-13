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
  // #405-D — reversed trip dates. The createTripAction `.refine()` already
  // authored a specific message; before this key every zod failure collapsed
  // to the generic `validation_failed` and that specific line never reached
  // the user. A dedicated key lets both the client date-field highlight and
  // the server backstop name the actual problem.
  | "trip_dates_reversed"
  | "rsvp_save_failed"
  // #432 — RSVP UPDATE matched no row: the caller's membership vanished
  // mid-session (removed from the trip / id mismatch). DETERMINISTIC —
  // the retry-framed rsvp_save_failed would loop forever, so this key
  // names the real state instead.
  | "rsvp_not_member"
  // M3 error keys (Wave 0a). Naming follows the existing
  // `<feature>_<verb>_failed` pattern. Voice-tested — blame-free, warm,
  // specific. See `notes/m3-execution-plan.md` Override F.
  | "itinerary_save_failed"
  | "itinerary_delete_failed"
  | "item_rsvp_save_failed"
  | "item_flag_save_failed"
  | "announcement_post_failed"
  | "trip_notes_save_failed"
  // Trip name/location edit from the dashboard header. Same
  // `<feature>_<verb>_failed` pattern; retry-framed (transient).
  | "trip_update_failed"
  | "travel_leg_save_failed"
  | "travel_leg_delete_failed"
  | "lodging_assign_failed"
  | "invite_mint_failed"
  // #397 — MINT_INVITE is fail-closed on the shim: on a deployment with
  // no Upstash creds every mint is denied by design. That denial is a
  // config gap, not a throttle — it must NOT reuse the transient
  // rate_limit copy ("give it a sec"), because retrying can never
  // succeed until env config changes.
  | "invite_mint_unconfigured"
  | "invite_revoke_failed"
  // M4 error keys (Wave 0a). Naming follows `<feature>_<verb>_failed`.
  // Voice rule: blame-free, warm, specific — NO "An error occurred",
  // NO bare "error". These pass the "would you say this at a pre-trip
  // dinner?" test. Anti-corporate guard is pinned in
  // lib/copy/__tests__/m4-voice-locks.test.ts.
  // #372 — expenses MVP.
  | "expense_add_failed"
  // #383/#384 — correctable money. `expense_visibility_self_hidden` is the
  // action-level backstop for an actor-unreadable visibility pick: a
  // DETERMINISTIC rejection, so the copy must not be retry-framed (the
  // #384 bug was a permanent failure wearing "log it again in a sec").
  | "expense_update_failed"
  | "expense_delete_failed"
  | "expense_visibility_self_hidden"
  // #389 — announcement reactions (the ack loop). Same voice rules.
  | "reaction_save_failed"
  // #388 — day-scoped attendance. Own-day chip save failure; transient,
  // retry-framed like rsvp_save_failed (same tap-toggle surface).
  | "member_day_save_failed"
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
  // 2026-07-11 invite-incident split: a confirmation-gated environment
  // ("Confirm email" ON in Supabase) makes signUp() succeed WITHOUT a
  // session. That is not a failure — the account exists; the user just has
  // to confirm before signing in. Before this key, the session-less path
  // fell into markPasswordSet → RLS 0-rows → a false "network" failure on
  // every successful brand-new signup.
  | "auth_confirm_pending"
  // 2026-07-11 invite-incident split: email_not_confirmed used to collapse
  // into auth_wrong_password — users with the CORRECT password were told
  // "That combo didn't match". Deterministic, non-retry state: the fix is
  // in their inbox, not in retyping.
  | "auth_email_not_confirmed"
  // Create-account attempt for an already-registered email (PR #430 review
  // MEDIUM — the incident's retry cohort now HAS accounts and re-taps the
  // invite into the create-first surface). Two Supabase shapes: enumeration
  // protection ON returns an obfuscated user (identities: []) with no
  // session — which would masquerade as auth_confirm_pending and promise
  // an email that never arrives — and protection OFF returns an explicit
  // user_already_exists error, which fell to the generic network copy.
  // Deterministic rejection; the fix is the sign-in branch.
  | "auth_account_exists"
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
  | "oauth_redirect_failed"
  // #390 — generic poll primitive. Naming follows `<feature>_<verb>_failed`.
  // `poll_closed` and `poll_visibility_self_hidden` are DETERMINISTIC
  // rejections (like expense_visibility_self_hidden) — no retry framing.
  | "poll_create_failed"
  | "poll_vote_failed"
  | "poll_closed"
  | "poll_visibility_self_hidden"
  // #386 — organizer member management. The three guard keys are
  // DETERMINISTIC rejections (self / celebrant / founder), so their copy
  // must explain the rule, never suggest a retry. The two `_failed` keys
  // follow the `<feature>_<verb>_failed` transient pattern.
  | "member_role_save_failed"
  | "member_remove_failed"
  | "member_remove_self"
  | "member_remove_celebrant"
  | "member_role_celebrant"
  | "member_organizer_locked"
  // Money-invariant guard (fix-first on PR #416): splits cascade with
  // the member row, so removal is refused while expense ties exist.
  // Deterministic rejection — retry-free copy.
  | "member_remove_has_expenses";

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
  // #405-D — the specific line the `.refine()` authored, now actually
  // surfaced (was collapsing to the generic validation_failed).
  trip_dates_reversed: "End date can't be before the start date.",
  rsvp_save_failed: "RSVP didn't save. Tap it again — it'll catch.",
  // #432 — deterministic, so no "tap again" framing: tapping again can't
  // put them back on the roster.
  rsvp_not_member:
    "You're not on this trip's list anymore. Ask whoever's organizing.",
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
  trip_update_failed: "That didn't save. Give it another go in a sec.",
  travel_leg_save_failed:
    "Leg didn't save. Tap again — your connection's flaky.",
  travel_leg_delete_failed: "Couldn't delete that leg. Try once more.",
  lodging_assign_failed:
    "Rooms didn't budge. Tap again — it'll catch.",
  invite_mint_failed:
    "Couldn't mint a link. Try once more — sometimes the server takes a sec.",
  // #397 — shim fail-closed mint denial. Honest about it being permanent:
  // no "try again" nudge, because a retry can't fix missing env config.
  invite_mint_unconfigured:
    "Invite links are down on this deployment — server setup, not you. Retrying won't fix it.",
  invite_revoke_failed: "Couldn't revoke that link yet. Try once more.",
  expense_add_failed: "That one didn't stick. Log it again in a sec.",
  // #383/#384 — correctable money. Same voice rules; the visibility one is
  // deliberately retry-free (deterministic rejection, not a flaky save).
  expense_update_failed: "Change didn't stick. Give it another go in a sec.",
  expense_delete_failed: "Couldn't take that one off the tab. Try once more.",
  expense_visibility_self_hidden:
    "That'd hide it from you too. Pick one you'd still see.",
  // #389 — announcement reactions. Blame-free, retry-framed (a toggle on
  // flaky cell signal is always safe to tap again).
  reaction_save_failed: "Didn't stick. Give it another tap.",
  // #388 — day-scoped attendance. Same voice rules; retry-framed.
  member_day_save_failed: "That day didn't stick. Tap it again — it'll catch.",
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
  // Signup succeeded but the environment gates on email confirmation, so
  // there's no session yet. Honest about what happened (account exists)
  // and what's next (confirm, then sign in) — never a false failure.
  auth_confirm_pending:
    "Account's created — check your email to confirm, then sign in here.",
  // Correct password, unconfirmed email. Deterministic — the fix is in
  // their inbox, so no "try again" framing and no blame.
  auth_email_not_confirmed:
    "You're in the books — check your email to confirm first.",
  // Already registered — deterministic rejection; the fix is the sign-in
  // branch (the invite form flips itself there), never a retry.
  auth_account_exists: "You've already got an account — sign in instead.",
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
  // #390 — polls. Same voice rules: blame-free, specific, no corporate
  // language. The closed/self-hidden pair is deliberately retry-free.
  poll_create_failed: "The poll didn't take. Run it back in a sec.",
  poll_vote_failed: "That vote didn't land. Tap it again — it'll catch.",
  poll_closed: "Voting's closed on this one. The crew has spoken.",
  poll_visibility_self_hidden:
    "That'd hide it from you too. Pick one you'd still see.",
  // #386 — member management. Guard strings are rule-explanations
  // (retry-free); the _failed pair is transient-retry voice.
  member_role_save_failed: "Role didn't flip. Try once more in a sec.",
  member_remove_failed:
    "Couldn't take them off the trip. Try once more.",
  member_remove_self:
    "That's you. If you're out, set your RSVP instead.",
  member_remove_celebrant:
    "Can't remove the guest of honor — they're the whole point of the trip.",
  member_role_celebrant:
    "The guest of honor's seat stays as-is — they're the whole point of the trip.",
  member_organizer_locked:
    "That's whoever started this trip. Their seat stays put.",
  member_remove_has_expenses:
    "Settle their expenses first — they're on the hook for a few things.",
};
