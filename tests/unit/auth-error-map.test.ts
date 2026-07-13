/**
 * Unit tests for the shared auth-error mapper (#432).
 *
 * The mapper is consumed by two surfaces that sign in with
 * email + password — `/login` and the account-security re-auth step —
 * and is parameterized on the one key that differs between them (what a
 * rejected combination means to the user). These tests pin the taxonomy
 * for BOTH parameter values so the surfaces can't drift apart again.
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, expect, it } from "vitest";

import {
  mapAuthErrorToKey,
  type InvalidCredentialsKey,
} from "@/lib/auth/auth-error-map";

const SURFACE_KEYS: readonly InvalidCredentialsKey[] = [
  "auth_wrong_password",
  "auth_current_password_incorrect",
];

describe("mapAuthErrorToKey()", () => {
  it("returns null when the error is null", () => {
    for (const key of SURFACE_KEYS) {
      expect(mapAuthErrorToKey(null, key)).toBeNull();
    }
  });

  // The incident shape (#432): a rate-limited user may hold the RIGHT
  // password — a 429 must never read as a credentials failure.
  it("maps 429 to rate_limit on both surfaces, never the credentials key", () => {
    for (const key of SURFACE_KEYS) {
      expect(
        mapAuthErrorToKey({ status: 429, message: "Too many requests" }, key)
      ).toBe("rate_limit");
    }
  });

  it("maps 400 invalid_credentials to the surface-specific key", () => {
    expect(
      mapAuthErrorToKey(
        { status: 400, code: "invalid_credentials", message: "bad creds" },
        "auth_wrong_password"
      )
    ).toBe("auth_wrong_password");
    expect(
      mapAuthErrorToKey(
        { status: 400, code: "invalid_credentials", message: "bad creds" },
        "auth_current_password_incorrect"
      )
    ).toBe("auth_current_password_incorrect");
  });

  // 2026-07-11 incident #3 / #432 item: correct password, unconfirmed
  // email — the fix is in the inbox, not in retyping the password.
  it("maps email_not_confirmed to auth_email_not_confirmed, never a credentials key", () => {
    for (const key of SURFACE_KEYS) {
      expect(
        mapAuthErrorToKey(
          { status: 400, code: "email_not_confirmed", message: "unconfirmed" },
          key
        )
      ).toBe("auth_email_not_confirmed");
    }
  });

  // #432 deliberate decision: current GoTrue emits invalid_credentials for
  // rejected email+password; invalid_grant is the legacy OAuth2 code modern
  // versions reserve for stale/invalid grants — session-class, not
  // credential feedback. It must not tell a user their password is wrong.
  it("maps invalid_grant to network on both surfaces, never a credentials key", () => {
    for (const key of SURFACE_KEYS) {
      expect(
        mapAuthErrorToKey(
          { status: 400, code: "invalid_grant", message: "invalid grant" },
          key
        )
      ).toBe("network");
    }
  });

  it("maps otp_disabled to auth_no_account (no-account code request)", () => {
    for (const key of SURFACE_KEYS) {
      expect(
        mapAuthErrorToKey(
          { status: 422, code: "otp_disabled", message: "signups disabled" },
          key
        )
      ).toBe("auth_no_account");
    }
  });

  it("maps validation_failed through unchanged", () => {
    for (const key of SURFACE_KEYS) {
      expect(
        mapAuthErrorToKey(
          { status: 400, code: "validation_failed", message: "bad shape" },
          key
        )
      ).toBe("validation_failed");
    }
  });

  it("falls back to network for unrecognized server errors", () => {
    for (const key of SURFACE_KEYS) {
      expect(
        mapAuthErrorToKey({ status: 500, message: "Internal error" }, key)
      ).toBe("network");
    }
  });
});
