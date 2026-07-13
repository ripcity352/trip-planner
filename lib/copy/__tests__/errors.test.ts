/**
 * Sanity tests for the error-toast copy palette. Voice is human-reviewed
 * in the PR; here we only verify shape and length.
 */

import { describe, expect, it } from "vitest";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";

const EXPECTED_KEYS: readonly ErrorKey[] = [
  "network",
  "rls_denied",
  "validation_failed",
  "rate_limit",
  "idempotency_replayed",
  "auth_failed",
  "auth_link_sent",
  "auth_no_account",
  "invite_expired",
  "invite_exhausted",
  "invite_not_found",
  "trip_create_failed",
  "trip_dates_reversed",
  "rsvp_save_failed",
  // #432 — RSVP UPDATE matched no row (membership vanished mid-session);
  // deterministic, retry-free
  "rsvp_not_member",
  // M3 keys (Wave 0a)
  "itinerary_save_failed",
  "itinerary_delete_failed",
  "item_rsvp_save_failed",
  "item_flag_save_failed",
  "announcement_post_failed",
  "trip_notes_save_failed",
  "travel_leg_save_failed",
  "travel_leg_delete_failed",
  "lodging_assign_failed",
  "invite_mint_failed",
  // #397 — shim fail-closed mint denial (deployment config gap, not a
  // throttle; retrying can't fix it)
  "invite_mint_unconfigured",
  "invite_revoke_failed",
  // M4 keys (Wave 0a)
  "address_lookup_failed",
  "datetime_invalid",
  "expense_add_failed",
  "places_proxy_failed",
  // #383/#384 — correctable money (edit/delete + the visibility backstop)
  "expense_update_failed",
  "expense_delete_failed",
  "expense_visibility_self_hidden",
  // #389 — announcement reactions (the ack loop)
  "reaction_save_failed",
  // M5 auth keys (PR2)
  "auth_wrong_password",
  "auth_code_invalid",
  "auth_code_expired",
  "auth_email_taken_oauth",
  // 2026-07-11 invite-incident split — confirmation-gated signup (no
  // session) + correct-password-but-unconfirmed-email sign-in
  "auth_confirm_pending",
  "auth_email_not_confirmed",
  // PR #430 review MEDIUM — create-account attempt for an already-
  // registered email (obfuscated identities:[] response or explicit
  // user_already_exists). Deterministic, retry-free.
  "auth_account_exists",
  // M5 PR4 account security keys
  "auth_current_password_incorrect",
  "auth_unauthenticated",
  // M5 PR5 — Google OAuth error key
  "oauth_redirect_failed",
  // #390 — generic poll primitive (closed/self-hidden are deterministic,
  // retry-free rejections)
  "poll_create_failed",
  "poll_vote_failed",
  "poll_closed",
  "poll_visibility_self_hidden",
  // #388 — day-scoped attendance chip save failure
  "member_day_save_failed",
  // #386 — organizer member management (guards are deterministic
  // rule-explanations; the _failed pair is transient-retry voice)
  "member_role_save_failed",
  "member_remove_failed",
  "member_remove_self",
  "member_remove_celebrant",
  "member_role_celebrant",
  "member_organizer_locked",
  // fix-first on #416 — money-invariant guard (deterministic, retry-free)
  "member_remove_has_expenses",
  // #368 / #262 — /me profile editor (phone-taken is deterministic)
  "profile_save_failed",
  "profile_phone_taken",
];

// Toasts are dismissed on a glance; over ~120 chars and the user
// scrolls them away before reading.
const MAX_LENGTH = 120;

describe("ERRORS", () => {
  it("covers every key in ErrorKey", () => {
    for (const key of EXPECTED_KEYS) {
      expect(ERRORS).toHaveProperty(key);
    }
    expect(Object.keys(ERRORS).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("has a non-empty string for every key", () => {
    for (const key of EXPECTED_KEYS) {
      const value = ERRORS[key];
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it(`keeps every string under ${MAX_LENGTH} characters`, () => {
    for (const key of EXPECTED_KEYS) {
      expect(ERRORS[key].length).toBeLessThanOrEqual(MAX_LENGTH);
    }
  });
});
