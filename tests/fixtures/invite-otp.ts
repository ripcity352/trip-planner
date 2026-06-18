/**
 * D4 — shared invite/OTP test fixture factory.
 *
 * Consumed by:
 *   - tests/unit/invite-otp-fixture.test.ts (smoke test)
 *   - tests/unit/accept-route-method.test.ts (#106 POST-only regression, W2)
 *   - lib/rate-limit budget assert (#141, via W0 rate-limit tests)
 *
 * Design constraints:
 *   - Pure factory: no app imports, no DB, no async.
 *   - Deterministic defaults so tests that share the factory produce
 *     stable, readable snapshots without coupling through shared state.
 *   - Each field is independently overridable via the optional `overrides`
 *     parameter (Partial<InviteOtpFixture>).
 */

export interface InviteOtpFixture {
  /** Invite token UUID (URL-safe). */
  token: string;
  /** Email address associated with the OTP request. */
  email: string;
  /** 6-digit numeric OTP code (string to preserve leading zeros). */
  otp: string;
}

const DEFAULTS: InviteOtpFixture = {
  token: "test-invite-token-abc123",
  email: "fixture@example.com",
  otp: "123456",
};

/**
 * Returns a fresh fixture object with deterministic defaults, optionally
 * merging in the provided overrides. Does not mutate DEFAULTS.
 */
export function makeInviteOtpFixture(
  overrides: Partial<InviteOtpFixture> = {},
): InviteOtpFixture {
  return { ...DEFAULTS, ...overrides };
}
