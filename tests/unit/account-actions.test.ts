/**
 * Unit tests for account sign-in-and-security server actions (M5/PR4).
 *
 * Covers:
 *   - changePasswordAction: zod validation, email pinning, rate-limit,
 *     current-password verification, signOut({scope:'others'}) side effect,
 *     error mapping
 *   - setPasswordAfterRecoveryAction: no current-password verify step,
 *     rate-limit, signOut({scope:'others'}) side effect
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

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
        signInWithPassword: mockSignInWithPassword,
        updateUser: mockUpdateUser,
        signOut: mockSignOut,
      },
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
  setPasswordAfterRecoveryAction,
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
    // Even if a caller somehow passes an email field, it must be ignored.
    // The action only reads email from auth.getUser() server-side.
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    // Verify Supabase re-auth call used the session email, not a form-submitted one.
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

    // Must use user.id (not email) as the rate-limit key.
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
    // signOut({scope:'others'}) must NOT be called when updateUser fails.
    expect(mockSignOut).not.toHaveBeenCalled();
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
// setPasswordAfterRecoveryAction (State C — OTP verified, no current-pass check)
// ---------------------------------------------------------------------------

describe("setPasswordAfterRecoveryAction", () => {
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

  it("returns { ok: true } on successful password set", async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await setPasswordAfterRecoveryAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: true });
  });

  it("does NOT call signInWithPassword (no current-password verification step)", async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await setPasswordAfterRecoveryAction({ newPassword: "freshpassword" });

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("calls signOut with scope='others' on success", async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await setPasswordAfterRecoveryAction({ newPassword: "freshpassword" });

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("returns auth_unauthenticated when auth.getUser() returns null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await setPasswordAfterRecoveryAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "auth_unauthenticated" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns validation_failed when newPassword is under 6 chars", async () => {
    const result = await setPasswordAfterRecoveryAction({ newPassword: "abc" });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns rate_limit when the rate-limiter throws", async () => {
    mockRateLimitedAction.mockRejectedValueOnce(
      new RateLimitError("authChangePassword", { remaining: 0, reset: 0 })
    );

    const result = await setPasswordAfterRecoveryAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("uses AUTH_CHANGE_PASSWORD scope for rate-limiting", async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await setPasswordAfterRecoveryAction({ newPassword: "freshpassword" });

    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      "authChangePassword",
      "user-456",
      expect.any(Function)
    );
  });

  it("returns network error when updateUser fails", async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "Server error" },
    });

    const result = await setPasswordAfterRecoveryAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "network" });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("never throws — returns network key on unexpected errors", async () => {
    mockRateLimitedAction.mockImplementation(async () => {
      throw new Error("Unexpected");
    });

    const result = await setPasswordAfterRecoveryAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: false, errorKey: "network" });
  });
});
