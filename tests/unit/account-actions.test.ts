/**
 * Unit tests for account sign-in-and-security server actions (M5/PR4).
 *
 * Covers:
 *   - changePasswordAction: zod validation, email pinning, rate-limit,
 *     current-password verification, signOut({scope:'others'}) side effect,
 *     error mapping, signOut-failure-degraded-to-success
 *   - setPasswordViaRecoveryAction (M5/PR4 HIGH-1 fix): atomic verify-OTP
 *     + updateUser + signOut; bypass-attempt regression test asserts
 *     updateUser is NOT called when verifyOtp fails
 *
 * All external dependencies (Supabase, rate-limiter) are mocked.
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mock setup ----------------------------------------------------------------

const mockGetUser = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();
const mockVerifyOtp = vi.fn();

// has_password shadow-column chain — DEFAULT-PASS mock (#245; carryback
// from PR #243 / trip-readiness W0).
//
// W0 made the password setters follow every successful auth mutation with a
// `.from("profiles").update({ has_password: true }).eq("id", …).select()
// .single()` write. The chain below stubs that write to SUCCEED
// unconditionally, so the pre-existing tests in this file — which predate
// the shadow column and assert only on auth behaviour — keep passing with
// zero per-test setup.
//
// Consequence of the default-pass: no test in THIS file asserts that the
// chain is called, called with the right args, or handles a chain failure.
// A regression that drops, reorders, or breaks the has_password write will
// NOT fail here. The real coverage — happy path (chain called with the
// authed user's id) and failure path (chain NOT called when the auth
// mutation fails) — lives in tests/unit/has-password-writes.test.ts.
//
// If you change has_password write behaviour, re-verify against
// has-password-writes.test.ts; green in this file proves nothing about it.
const mockHpSingle = vi.fn().mockResolvedValue({ data: { has_password: true }, error: null });
const mockHpSelect = vi.fn(() => ({ single: mockHpSingle }));
const mockHpEq = vi.fn(() => ({ select: mockHpSelect }));
const mockHpUpdate = vi.fn(() => ({ eq: mockHpEq }));
const mockHpFrom = vi.fn(() => ({ update: mockHpUpdate }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
        signInWithPassword: mockSignInWithPassword,
        updateUser: mockUpdateUser,
        signOut: mockSignOut,
        verifyOtp: mockVerifyOtp,
      },
      from: mockHpFrom,
    })
  ),
}));

// Rate-limiter: default to allow (pass-through) so tests focus on action logic.
const mockRateLimitedAction = vi.fn(
  async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
);

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMIT_SCOPES: {
    AUTH_OTP_VERIFY: "authOtpVerify",
    AUTH_PASSWORD: "authPassword",
    AUTH_CHANGE_PASSWORD: "authChangePassword",
  },
  RateLimitError: class RateLimitError extends Error {
    constructor(scope: string) {
      super(`Rate limit exceeded for scope "${scope}"`);
      this.name = "RateLimitError";
    }
  },
  rateLimitedAction: (...args: Parameters<typeof mockRateLimitedAction>) =>
    mockRateLimitedAction(...args),
}));

// Import AFTER mocks are set up.
import {
  changePasswordAction,
  setPasswordViaRecoveryAction,
  setPasswordAction,
} from "@/app/(authed)/account/sign-in-and-security/actions";
import { RateLimitError } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// changePasswordAction
// ---------------------------------------------------------------------------

describe("changePasswordAction", () => {
  const authedUser = {
    id: "user-123",
    email: "dave@example.com",
    identities: [{ provider: "email", id: "id-1" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  it("returns { ok: true } on successful password change", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: true });
  });

  it("pins email from session, NOT from form payload", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(mockSignInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dave@example.com" })
    );
  });

  it("calls signOut with scope='others' on success to revoke other sessions", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("returns auth_unauthenticated when auth.getUser() returns null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "auth_unauthenticated" });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns auth_unauthenticated when user has no email", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: null, identities: [] } },
      error: null,
    });

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "auth_unauthenticated" });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns auth_current_password_incorrect when current password is wrong", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" },
    });

    const result = await changePasswordAction({
      currentPassword: "wrongpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "auth_current_password_incorrect" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  // #432 item 1 — the re-auth branch used to return
  // auth_current_password_incorrect for ANY verify error. A rate-limited
  // user holding the RIGHT password was told it was incorrect (the
  // incident's exact failure shape on the password-change surface).
  it("returns rate_limit (NOT auth_current_password_incorrect) when the verify call is 429-throttled", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: {
        status: 429,
        code: "over_request_rate_limit",
        message: "Too many requests",
      },
    });

    const result = await changePasswordAction({
      currentPassword: "correct-password",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  // #432 item 2 — email_not_confirmed no longer lumps into "wrong current
  // password"; the fix is in the inbox, not in retyping.
  it("returns auth_email_not_confirmed when the verify call reports an unconfirmed email", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: {
        status: 400,
        code: "email_not_confirmed",
        message: "Email not confirmed",
      },
    });

    const result = await changePasswordAction({
      currentPassword: "correct-password",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({
      ok: false,
      errorKey: "auth_email_not_confirmed",
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  // #432 item 2 — invalid_grant is session-class in modern GoTrue, not
  // credential feedback (see lib/auth/auth-error-map.ts for the WHY).
  it("returns network (NOT auth_current_password_incorrect) for invalid_grant on verify", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "invalid_grant", message: "Invalid grant" },
    });

    const result = await changePasswordAction({
      currentPassword: "correct-password",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "network" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns network for an unrecognized 500 on verify", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 500, code: null, message: "Internal Server Error" },
    });

    const result = await changePasswordAction({
      currentPassword: "correct-password",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "network" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns validation_failed when newPassword is too short (under 6 chars)", async () => {
    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "abc",
    });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns validation_failed when currentPassword is empty", async () => {
    const result = await changePasswordAction({
      currentPassword: "",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns rate_limit when the rate-limiter throws RateLimitError", async () => {
    mockRateLimitedAction.mockRejectedValueOnce(
      new RateLimitError("authChangePassword", { remaining: 0, reset: 0 })
    );

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("uses AUTH_CHANGE_PASSWORD scope for rate-limiting", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      "authChangePassword",
      "user-123",
      expect.any(Function)
    );
  });

  it("keys rate-limit by user.id not email (prevents cross-account leakage)", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      expect.any(String),
      "user-123",
      expect.any(Function)
    );
  });

  it("returns network error when updateUser fails", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, code: null, message: "Internal Server Error" },
    });

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "network" });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  // MEDIUM-1 regression — signOut failure must NOT flip a successful
  // password rotation into a "network" error toast.
  it("still returns { ok: true } when signOut({scope:'others'}) throws (password was rotated)", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockRejectedValueOnce(new Error("Network blip"));

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateUser).toHaveBeenCalled();
  });

  it("never throws — catches unexpected errors and returns network key", async () => {
    mockRateLimitedAction.mockImplementation(async () => {
      throw new Error("Unexpected failure");
    });

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: false, errorKey: "network" });
  });
});

// ---------------------------------------------------------------------------
// setPasswordViaRecoveryAction (State C — atomic verify-OTP + updateUser)
// ---------------------------------------------------------------------------

describe("setPasswordViaRecoveryAction", () => {
  const authedUser = {
    id: "user-456",
    email: "dave@example.com",
    identities: [{ provider: "email", id: "id-2" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  it("returns { ok: true } on successful atomic verify+update", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: true });
  });

  it("calls verifyOtp with email from session AND form-supplied token", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "dave@example.com",
      token: "123456",
      type: "email",
    });
  });

  it("calls signOut with scope='others' on success", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("does NOT call signInWithPassword (no current-password verification step)", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  // M5/PR4 HIGH-1 — the bypass regression test.
  // Before the atomic refactor, an authed attacker could call the post-OTP
  // action directly via DevTools and rotate the password without ever proving
  // OTP possession. After the refactor, verifyOtp is the gate inside the
  // SAME server call as updateUser — without a valid token, no rotation.
  it("does NOT call updateUser when verifyOtp fails (bypass-prevention regression)", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "otp_expired", message: "Token has expired or is invalid" },
    });

    const result = await setPasswordViaRecoveryAction({
      token: "000000",
      newPassword: "attacker_chosen",
    });

    expect(result).toEqual({ ok: false, errorKey: "auth_code_invalid" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("returns auth_unauthenticated when auth.getUser() returns null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: false, errorKey: "auth_unauthenticated" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns auth_unauthenticated when user has no email", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-456", email: null, identities: [] } },
      error: null,
    });

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: false, errorKey: "auth_unauthenticated" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns validation_failed when newPassword is under 6 chars", async () => {
    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "abc",
    });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns validation_failed when token is not 6 digits", async () => {
    const result = await setPasswordViaRecoveryAction({
      token: "12345", // 5 digits
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns validation_failed when token contains non-digits", async () => {
    const result = await setPasswordViaRecoveryAction({
      token: "12345a",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns rate_limit when the rate-limiter throws", async () => {
    mockRateLimitedAction.mockRejectedValueOnce(
      new RateLimitError("authChangePassword", { remaining: 0, reset: 0 })
    );

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("uses AUTH_CHANGE_PASSWORD scope keyed by user.id", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      "authChangePassword",
      "user-456",
      expect.any(Function)
    );
  });

  it("returns network error when updateUser fails", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "Server error" },
    });

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: false, errorKey: "network" });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  // MEDIUM-1 regression for recovery path.
  it("still returns { ok: true } when signOut({scope:'others'}) throws (password was rotated)", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockRejectedValueOnce(new Error("Network blip"));

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateUser).toHaveBeenCalled();
  });

  it("never throws — returns network key on unexpected errors", async () => {
    mockRateLimitedAction.mockImplementation(async () => {
      throw new Error("Unexpected");
    });

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: false, errorKey: "network" });
  });
});

// ---------------------------------------------------------------------------
// setPasswordAction (State B — first-ever password, no OTP gate)
// ---------------------------------------------------------------------------

describe("setPasswordAction", () => {
  // OAuth-only user: Google identity, no email/password identity.
  const oauthOnlyUser = {
    id: "user-oauth",
    email: "dave@example.com",
    identities: [{ provider: "google", id: "google-1" }],
  };

  // OTP-only user: no identities at all (empty).
  const otpOnlyUser = {
    id: "user-otp",
    email: "dave@example.com",
    identities: [],
  };

  // User who already has a password (State A territory).
  const passwordUser = {
    id: "user-pw",
    email: "dave@example.com",
    identities: [{ provider: "email", id: "email-1" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("returns { ok: true } when OAuth-only user sets password for the first time", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "freshpassword" });
  });

  it("returns { ok: true } when OTP-only user (empty identities) sets password", async () => {
    mockGetUser.mockResolvedValue({ data: { user: otpOnlyUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: otpOnlyUser }, error: null });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "freshpassword" });
  });

  // -------------------------------------------------------------------------
  // Critical: signOut must NEVER be called (v3.2 locked — nothing to invalidate)
  // -------------------------------------------------------------------------

  it("does NOT call signOut after setPasswordAction success (v3.2 ADR locked)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });

    await setPasswordAction({ newPassword: "freshpassword" });

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("does NOT call signOut even on a failure path", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "Server error", name: "AuthError" },
    });

    await setPasswordAction({ newPassword: "freshpassword" });

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // State guard: user already has password identity → validation_failed
  // -------------------------------------------------------------------------

  it("returns validation_failed when user already has a password identity (State A territory)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: passwordUser }, error: null });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it("returns validation_failed when newPassword is under 6 chars", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });

    const result = await setPasswordAction({ newPassword: "abc" });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns validation_failed when newPassword is empty", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });

    const result = await setPasswordAction({ newPassword: "" });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------

  it("returns auth_unauthenticated when auth.getUser() returns null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "auth_unauthenticated" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns auth_unauthenticated when user has no email", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: { id: "user-no-email", email: null, identities: [] },
      },
      error: null,
    });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "auth_unauthenticated" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Rate limit
  // -------------------------------------------------------------------------

  it("returns rate_limit when the rate-limiter throws RateLimitError", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });
    mockRateLimitedAction.mockRejectedValueOnce(
      new RateLimitError("authChangePassword", { remaining: 0, reset: 0 })
    );

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("uses AUTH_CHANGE_PASSWORD scope keyed by user.id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });

    await setPasswordAction({ newPassword: "freshpassword" });

    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      "authChangePassword",
      "user-oauth",
      expect.any(Function)
    );
  });

  // -------------------------------------------------------------------------
  // Error paths
  // -------------------------------------------------------------------------

  it("returns network error when updateUser fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "Server error", name: "AuthError" },
    });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "network" });
  });

  it("never throws — returns network key on unexpected errors", async () => {
    mockGetUser.mockResolvedValue({ data: { user: oauthOnlyUser }, error: null });
    mockRateLimitedAction.mockImplementation(async () => {
      throw new Error("Unexpected");
    });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "network" });
  });
});
