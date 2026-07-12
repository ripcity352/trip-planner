/**
 * Unit tests — atomic has_password writes (W0 / D7).
 *
 * For each of the 4 password setters, two assertions:
 *   1. Happy path: when the auth mutation succeeds, the
 *      `.from("profiles").update({has_password:true}).eq("id",…).select().single()`
 *      chain IS called with the authed user's id.
 *   2. Failure path: when the auth mutation fails (returns { error }),
 *      the has_password UPDATE is NOT called.
 *
 * TDD RED: written before the production implementation. Run `pnpm test
 * tests/unit/has-password-writes.test.ts` to confirm RED, then implement
 * D6 in the four server actions.
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Supabase client mock — auth + from("profiles") chain
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockSignUp = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSignInWithPassword = vi.fn();

// Profiles update chain mock — single chained object shared across calls.
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockEq = vi.fn(() => ({ select: mockSelect }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
        signUp: mockSignUp,
        updateUser: mockUpdateUser,
        signOut: mockSignOut,
        verifyOtp: mockVerifyOtp,
        signInWithPassword: mockSignInWithPassword,
      },
      from: mockFrom,
    }),
  ),
}));

// Rate-limiter: default pass-through so tests focus on action logic.
const mockRateLimitedAction = vi.fn(
  async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn(),
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

// Import AFTER mocks.
import { signUpAction, signInWithPasswordAction } from "@/app/login/actions";
import {
  changePasswordAction,
  setPasswordViaRecoveryAction,
  setPasswordAction,
} from "@/app/(authed)/account/sign-in-and-security/actions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const authedUser = {
  id: "user-abc",
  email: "test@example.com",
  identities: [{ provider: "google", id: "google-1" }],
};

const authedPasswordUser = {
  id: "user-abc",
  email: "test@example.com",
  identities: [{ provider: "email", id: "email-1" }],
};

// ---------------------------------------------------------------------------
// signUpAction — has_password write after signUp succeeds
// ---------------------------------------------------------------------------

describe("signUpAction — has_password atomic write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn(),
    );
    // Default: profiles update succeeds
    mockSingle.mockResolvedValue({ data: { id: "user-abc", has_password: true }, error: null });
  });

  it("calls .from('profiles').update({has_password:true}) after successful signUp", async () => {
    // Session included — the 2026-07-11 session guard only writes
    // has_password when signUp returns a REAL session (autoconfirm env).
    // A user-without-session signUp (confirmation-gated) skips the write
    // and returns auth_confirm_pending — covered in login-actions.test.ts.
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-abc" }, session: { access_token: "jwt" } },
      error: null,
    });

    const result = await signUpAction({
      email: "test@example.com",
      password: "password123",
    });

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledWith({ has_password: true });
    expect(mockEq).toHaveBeenCalledWith("id", "user-abc");
  });

  it("does NOT call .from('profiles').update when signUp returns an error", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "validation_failed", message: "Bad email" },
    });

    const result = await signUpAction({
      email: "test@example.com",
      password: "password123",
    });

    expect(result.ok).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signInWithPasswordAction — has_password self-heal write after sign-in
// succeeds (#F9). A successful password sign-in is definitive proof a
// password exists, even if it was set outside app code paths.
// ---------------------------------------------------------------------------

describe("signInWithPasswordAction — has_password self-heal write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn(),
    );
    mockSingle.mockResolvedValue({ data: { id: "user-abc", has_password: true }, error: null });
  });

  it("calls .from('profiles').update({has_password:true}) after successful password sign-in", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "user-abc" } },
      error: null,
    });

    const result = await signInWithPasswordAction({
      email: "test@example.com",
      password: "password123",
    });

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledWith({ has_password: true });
    expect(mockEq).toHaveBeenCalledWith("id", "user-abc");
  });

  it("does NOT call .from('profiles').update when sign-in returns an error", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "invalid_credentials", message: "Wrong password" },
    });

    const result = await signInWithPasswordAction({
      email: "test@example.com",
      password: "wrongpassword",
    });

    expect(result.ok).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// changePasswordAction — has_password write after updateUser succeeds
// ---------------------------------------------------------------------------

describe("changePasswordAction — has_password atomic write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: authedPasswordUser }, error: null });
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn(),
    );
    mockSingle.mockResolvedValue({ data: { id: "user-abc", has_password: true }, error: null });
  });

  it("calls .from('profiles').update({has_password:true}) after successful updateUser", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedPasswordUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedPasswordUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledWith({ has_password: true });
    expect(mockEq).toHaveBeenCalledWith("id", "user-abc");
  });

  it("does NOT call .from('profiles').update when updateUser returns an error", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: authedPasswordUser }, error: null });
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, code: null, message: "Server error" },
    });

    const result = await changePasswordAction({
      currentPassword: "oldpassword",
      newPassword: "newpassword123",
    });

    expect(result.ok).toBe(false);
    // from() may have been called for other reasons (none here), but update
    // must not have been called with has_password:true after a failed updateUser.
    expect(mockUpdate).not.toHaveBeenCalledWith({ has_password: true });
  });
});

// ---------------------------------------------------------------------------
// setPasswordViaRecoveryAction — has_password write after updateUser succeeds
// ---------------------------------------------------------------------------

describe("setPasswordViaRecoveryAction — has_password atomic write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn(),
    );
    mockSingle.mockResolvedValue({ data: { id: "user-abc", has_password: true }, error: null });
  });

  it("calls .from('profiles').update({has_password:true}) after successful atomic verify+update", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledWith({ has_password: true });
    expect(mockEq).toHaveBeenCalledWith("id", "user-abc");
  });

  it("does NOT call .from('profiles').update when updateUser returns an error", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: authedUser }, error: null });
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "Server error" },
    });

    const result = await setPasswordViaRecoveryAction({
      token: "123456",
      newPassword: "freshpassword",
    });

    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalledWith({ has_password: true });
  });

  it("does NOT call .from('profiles').update when verifyOtp fails", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "otp_expired", message: "Token expired" },
    });

    const result = await setPasswordViaRecoveryAction({
      token: "000000",
      newPassword: "freshpassword",
    });

    expect(result).toEqual({ ok: false, errorKey: "auth_code_invalid" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setPasswordAction (State B) — has_password write after updateUser succeeds
// ---------------------------------------------------------------------------

describe("setPasswordAction — has_password atomic write", () => {
  // OTP-only user: no email/password identity.
  const otpUser = {
    id: "user-abc",
    email: "test@example.com",
    identities: [] as { provider: string; id: string }[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: otpUser }, error: null });
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn(),
    );
    mockSingle.mockResolvedValue({ data: { id: "user-abc", has_password: true }, error: null });
  });

  it("calls .from('profiles').update({has_password:true}) after successful State-B password set", async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: otpUser }, error: null });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledWith({ has_password: true });
    expect(mockEq).toHaveBeenCalledWith("id", "user-abc");
  });

  it("does NOT call .from('profiles').update when updateUser returns an error", async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "Server error" },
    });

    const result = await setPasswordAction({ newPassword: "freshpassword" });

    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalledWith({ has_password: true });
  });
});
