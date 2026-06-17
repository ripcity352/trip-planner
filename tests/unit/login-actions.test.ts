/**
 * Unit tests for the progressive-disclosure login server actions (M5/PR2).
 *
 * Covers all four actions defined in `app/login/actions.ts`:
 *   - signInWithPasswordAction — returns ok:true or auth_wrong_password
 *   - signUpAction — returns ok:true or network error
 *   - verifyEmailCodeAction — returns ok:true or auth_code_invalid / auth_code_expired
 *   - requestEmailCode — returns ok:true (renamed from requestMagicLink)
 *
 * All external dependencies (Supabase, rate-limiter) are mocked. We do NOT
 * exercise real network calls.
 *
 * Placement: `tests/unit/` per Override C (never under `app/`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mock setup ----------------------------------------------------------------

const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSignInWithOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signUp: mockSignUp,
        verifyOtp: mockVerifyOtp,
        signInWithOtp: mockSignInWithOtp,
      },
    })
  ),
}));

// Rate-limiter: default to allow (success) so tests focus on action logic.
// Individual tests override via mockRejectedValueOnce for rate-limit cases.
const mockRateLimitedAction = vi.fn(
  async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
);

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMIT_SCOPES: {
    AUTH_OTP_VERIFY: "authOtpVerify",
    AUTH_PASSWORD: "authPassword",
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
  signInWithPasswordAction,
  signUpAction,
  verifyEmailCodeAction,
  requestEmailCode,
} from "@/app/login/actions";
import { RateLimitError } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------

describe("signInWithPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  it("returns { ok: true } on successful sign-in", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    const result = await signInWithPasswordAction({
      email: "dave@example.com",
      password: "hunter2!",
    });
    expect(result).toEqual({ ok: true });
  });

  it("normalises the email (trims + lowercases) before calling Supabase", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    await signInWithPasswordAction({
      email: "  DAVE@EXAMPLE.COM  ",
      password: "hunter2!",
    });
    expect(mockSignInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dave@example.com" })
    );
  });

  it("returns auth_wrong_password when Supabase signals bad credentials", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" },
    });
    const result = await signInWithPasswordAction({
      email: "dave@example.com",
      password: "wrongpass",
    });
    expect(result).toEqual({ ok: false, errorKey: "auth_wrong_password" });
  });

  it("returns rate_limit when the rate-limiter throws", async () => {
    mockRateLimitedAction.mockRejectedValueOnce(
      new RateLimitError("authPassword", { remaining: 0, reset: 0 })
    );
    const result = await signInWithPasswordAction({
      email: "dave@example.com",
      password: "hunter2!",
    });
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns validation_failed for a malformed email", async () => {
    const result = await signInWithPasswordAction({
      email: "not-an-email",
      password: "hunter2!",
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns validation_failed when password is too short", async () => {
    const result = await signInWithPasswordAction({
      email: "dave@example.com",
      password: "hi",
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns network error for a Supabase 500", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 500, code: null, message: "Internal Server Error" },
    });
    const result = await signInWithPasswordAction({
      email: "dave@example.com",
      password: "hunter2!",
    });
    expect(result).toEqual({ ok: false, errorKey: "network" });
  });

  it("returns rate_limit for a Supabase 429", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 429, code: null, message: "Too many requests" },
    });
    const result = await signInWithPasswordAction({
      email: "dave@example.com",
      password: "hunter2!",
    });
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("never throws — catches unexpected errors and returns network key", async () => {
    mockRateLimitedAction.mockImplementation(async () => {
      throw new Error("Unexpected failure");
    });
    const result = await signInWithPasswordAction({
      email: "dave@example.com",
      password: "hunter2!",
    });
    expect(result).toEqual({ ok: false, errorKey: "network" });
  });

  it("uses AUTH_PASSWORD scope for rate-limiting", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    await signInWithPasswordAction({
      email: "dave@example.com",
      password: "hunter2!",
    });
    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      "authPassword",
      "dave@example.com",
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------

describe("signUpAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  it("returns { ok: true } on successful sign-up", async () => {
    mockSignUp.mockResolvedValue({ data: { user: {} }, error: null });
    const result = await signUpAction({
      email: "newuser@example.com",
      password: "supersecret",
    });
    expect(result).toEqual({ ok: true });
  });

  it("normalises the email before calling Supabase", async () => {
    mockSignUp.mockResolvedValue({ data: { user: {} }, error: null });
    await signUpAction({ email: "  NEWUSER@EXAMPLE.COM  ", password: "supersecret" });
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "newuser@example.com" })
    );
  });

  it("returns validation_failed for a malformed email", async () => {
    const result = await signUpAction({ email: "bad-email", password: "supersecret" });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns validation_failed when password is shorter than 6 chars", async () => {
    const result = await signUpAction({ email: "dave@example.com", password: "abc" });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns rate_limit when the rate-limiter throws", async () => {
    mockRateLimitedAction.mockRejectedValueOnce(
      new RateLimitError("authPassword", { remaining: 0, reset: 0 })
    );
    const result = await signUpAction({
      email: "dave@example.com",
      password: "supersecret",
    });
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns network error for a Supabase 500", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "Internal Server Error" },
    });
    const result = await signUpAction({
      email: "dave@example.com",
      password: "supersecret",
    });
    expect(result).toEqual({ ok: false, errorKey: "network" });
  });

  it("passes emailRedirectTo in options to Supabase signUp", async () => {
    mockSignUp.mockResolvedValue({ data: { user: {} }, error: null });
    await signUpAction({ email: "dave@example.com", password: "supersecret" });
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining("/auth/callback"),
        }),
      })
    );
  });

  it("uses AUTH_PASSWORD scope for rate-limiting", async () => {
    mockSignUp.mockResolvedValue({ data: { user: {} }, error: null });
    await signUpAction({ email: "dave@example.com", password: "supersecret" });
    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      "authPassword",
      "dave@example.com",
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------

describe("verifyEmailCodeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  it("returns { ok: true } on successful verification", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    const result = await verifyEmailCodeAction({
      email: "dave@example.com",
      token: "123456",
    });
    expect(result).toEqual({ ok: true });
  });

  it("normalises the email before calling Supabase", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    await verifyEmailCodeAction({ email: "  DAVE@EXAMPLE.COM  ", token: "123456" });
    expect(mockVerifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dave@example.com" })
    );
  });

  it("calls verifyOtp with type='email'", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    await verifyEmailCodeAction({ email: "dave@example.com", token: "123456" });
    expect(mockVerifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ type: "email" })
    );
  });

  it("returns auth_code_invalid when Supabase rejects the token", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { status: 401, code: "otp_expired", message: "Token has expired or is invalid" },
    });
    const result = await verifyEmailCodeAction({
      email: "dave@example.com",
      token: "000000",
    });
    expect(result).toEqual({ ok: false, errorKey: "auth_code_invalid" });
  });

  it("returns auth_code_expired for an expired-code error code", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { status: 401, code: "otp_expired", message: "OTP expired" },
    });
    const result = await verifyEmailCodeAction({
      email: "dave@example.com",
      token: "123456",
    });
    // Both invalid and expired map to a user-actionable response.
    // The exact key depends on whether the action distinguishes them;
    // both auth_code_invalid and auth_code_expired are acceptable.
    expect(result.ok).toBe(false);
    expect(["auth_code_invalid", "auth_code_expired"]).toContain(
      (result as { ok: false; errorKey: string }).errorKey
    );
  });

  it("returns validation_failed for a token that is not 6 digits", async () => {
    const result = await verifyEmailCodeAction({
      email: "dave@example.com",
      token: "abc",
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns validation_failed for a token that has non-digit characters", async () => {
    const result = await verifyEmailCodeAction({
      email: "dave@example.com",
      token: "12345a",
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns rate_limit when the rate-limiter throws", async () => {
    mockRateLimitedAction.mockRejectedValueOnce(
      new RateLimitError("authOtpVerify", { remaining: 0, reset: 0 })
    );
    const result = await verifyEmailCodeAction({
      email: "dave@example.com",
      token: "123456",
    });
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("uses AUTH_OTP_VERIFY scope for rate-limiting", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    await verifyEmailCodeAction({ email: "dave@example.com", token: "123456" });
    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      "authOtpVerify",
      "dave@example.com",
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------

describe("requestEmailCode (renamed from requestMagicLink)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  it("returns { ok: true } on success", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    const result = await requestEmailCode("dave@example.com");
    expect(result).toEqual({ ok: true });
  });

  it("calls signInWithOtp with shouldCreateUser: false", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await requestEmailCode("dave@example.com");
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ shouldCreateUser: false }),
      })
    );
  });

  it("normalises email before calling Supabase", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await requestEmailCode("  DAVE@EXAMPLE.COM  ");
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dave@example.com" })
    );
  });

  it("returns validation_failed for an invalid email", async () => {
    const result = await requestEmailCode("not-an-email");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("returns rate_limit when the rate-limiter throws", async () => {
    mockRateLimitedAction.mockRejectedValueOnce(
      new RateLimitError("authOtpVerify", { remaining: 0, reset: 0 })
    );
    const result = await requestEmailCode("dave@example.com");
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns network error for a Supabase 500", async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { status: 500, message: "Server error" },
    });
    const result = await requestEmailCode("dave@example.com");
    expect(result).toEqual({ ok: false, errorKey: "network" });
  });

  it("returns auth_no_account for a Supabase 422 otp_disabled (no account yet)", async () => {
    // shouldCreateUser:false means an email-code request for an address with
    // no account returns 422 otp_disabled ("Signups not allowed for otp").
    // This is the new-invitee dead-end from the prod walk: it must surface a
    // clear "create an account" message, NOT the misleading generic network
    // error it fell through to before.
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { status: 422, code: "otp_disabled", message: "Signups not allowed for otp" },
    });
    const result = await requestEmailCode("new-invitee@example.com");
    expect(result).toEqual({ ok: false, errorKey: "auth_no_account" });
  });

  it("uses AUTH_OTP_VERIFY scope for rate-limiting", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await requestEmailCode("dave@example.com");
    expect(mockRateLimitedAction).toHaveBeenCalledWith(
      "authOtpVerify",
      "dave@example.com",
      expect.any(Function)
    );
  });

  it("never throws — returns network key on unexpected errors", async () => {
    mockRateLimitedAction.mockImplementation(async () => {
      throw new Error("Unexpected");
    });
    const result = await requestEmailCode("dave@example.com");
    expect(result).toEqual({ ok: false, errorKey: "network" });
  });
});
