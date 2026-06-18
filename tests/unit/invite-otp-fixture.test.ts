/**
 * Smoke test for the D4 shared invite/OTP fixture factory.
 *
 * Verifies:
 *   - Default shape: { token, email, otp }
 *   - Deterministic defaults (stable across calls without overrides)
 *   - Override behavior (each field individually overridable)
 *
 * Override C: lives under tests/unit/ only.
 */

import { describe, expect, it } from "vitest";
import { makeInviteOtpFixture } from "../fixtures/invite-otp";

describe("makeInviteOtpFixture (D4 shared factory)", () => {
  it("returns an object with token, email, and otp fields", () => {
    const fixture = makeInviteOtpFixture();
    expect(fixture).toHaveProperty("token");
    expect(fixture).toHaveProperty("email");
    expect(fixture).toHaveProperty("otp");
  });

  it("token is a non-empty string", () => {
    const { token } = makeInviteOtpFixture();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("email is a valid-looking email string", () => {
    const { email } = makeInviteOtpFixture();
    expect(typeof email).toBe("string");
    expect(email).toContain("@");
  });

  it("otp is a 6-digit numeric string", () => {
    const { otp } = makeInviteOtpFixture();
    expect(typeof otp).toBe("string");
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("returns deterministic defaults (same values on every call)", () => {
    const a = makeInviteOtpFixture();
    const b = makeInviteOtpFixture();
    expect(a.token).toBe(b.token);
    expect(a.email).toBe(b.email);
    expect(a.otp).toBe(b.otp);
  });

  it("honors a token override", () => {
    const { token } = makeInviteOtpFixture({ token: "custom-token-abc" });
    expect(token).toBe("custom-token-abc");
  });

  it("honors an email override", () => {
    const { email } = makeInviteOtpFixture({ email: "custom@example.com" });
    expect(email).toBe("custom@example.com");
  });

  it("honors an otp override", () => {
    const { otp } = makeInviteOtpFixture({ otp: "999888" });
    expect(otp).toBe("999888");
  });

  it("partial overrides leave non-overridden fields at defaults", () => {
    const defaults = makeInviteOtpFixture();
    const partial = makeInviteOtpFixture({ otp: "111222" });
    expect(partial.token).toBe(defaults.token);
    expect(partial.email).toBe(defaults.email);
    expect(partial.otp).toBe("111222");
  });
});
