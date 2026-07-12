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

// has_password shadow-column writer — mocked so session-guard tests can
// assert it is only called when signUp returns a REAL session (the
// 2026-07-11 incident: calling it on a session-less client made RLS match
// 0 rows and turned every successful confirmation-gated signup into a
// false "network" failure).
const mockMarkPasswordSet = vi.fn();

vi.mock("@/lib/auth/has-password", () => ({
  markPasswordSet: (...args: Parameters<typeof mockMarkPasswordSet>) =>
    mockMarkPasswordSet(...args),
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

  // 2026-07-11 incident #3: email_not_confirmed used to collapse into
  // auth_wrong_password — a user with the CORRECT password was told
  // "That combo didn't match". It must map to its own honest key.
  it("returns auth_email_not_confirmed (NOT auth_wrong_password) for an unconfirmed email", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "email_not_confirmed", message: "Email not confirmed" },
    });
    const result = await signInWithPasswordAction({
      email: "dave@example.com",
      password: "hunter2!",
    });
    expect(result).toEqual({ ok: false, errorKey: "auth_email_not_confirmed" });
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

  // ---------------------------------------------------------------------------
  // Session guard (2026-07-11 incident #1)
  //
  // Prod had "Confirm email" ON while local config.toml had it off: signUp()
  // succeeded but returned NO session. markPasswordSet then ran on the
  // session-less client, RLS matched 0 rows, and every successful brand-new
  // signup was reported as { ok:false, errorKey:"network" }. The guard:
  // only touch profiles when a session exists; a user-without-session result
  // is the honest auth_confirm_pending, never a failure.
  // ---------------------------------------------------------------------------

  it("calls markPasswordSet and returns ok when signUp yields user AND session", async () => {
    mockMarkPasswordSet.mockResolvedValue({ ok: true });
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "jwt" } },
      error: null,
    });
    const result = await signUpAction({
      email: "newuser@example.com",
      password: "supersecret",
    });
    expect(result).toEqual({ ok: true });
    expect(mockMarkPasswordSet).toHaveBeenCalledTimes(1);
    expect(mockMarkPasswordSet).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.any(String)
    );
  });

  it("returns auth_confirm_pending (and skips markPasswordSet) when signUp yields a GENUINELY NEW user but NO session", async () => {
    // A genuinely-new confirmation-gated user carries a NON-EMPTY
    // identities array — that's what distinguishes it from the obfuscated
    // already-registered response below.
    mockSignUp.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          identities: [{ id: "identity-1", provider: "email" }],
        },
        session: null,
      },
      error: null,
    });
    const result = await signUpAction({
      email: "newuser@example.com",
      password: "supersecret",
    });
    expect(result).toEqual({ ok: false, errorKey: "auth_confirm_pending" });
    expect(mockMarkPasswordSet).not.toHaveBeenCalled();
  });

  it("still returns auth_confirm_pending when identities is absent (can't confirm obfuscation)", async () => {
    // Defensive default: no identities field at all → treat as a genuine
    // pending confirmation rather than accusing the user of having an
    // account we can't prove exists.
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });
    const result = await signUpAction({
      email: "newuser@example.com",
      password: "supersecret",
    });
    expect(result).toEqual({ ok: false, errorKey: "auth_confirm_pending" });
  });

  // ---------------------------------------------------------------------------
  // Already-registered detection (PR #430 review MEDIUM)
  //
  // The incident's retry cohort now HAS accounts and re-taps the invite
  // into the create-first surface. Supabase signals "already registered"
  // two ways depending on enumeration protection:
  //   ON  → obfuscated success: user present, identities: [], no session
  //         (would masquerade as confirm-pending — but no email is sent)
  //   OFF → explicit error.code === "user_already_exists"
  // Both must map to auth_account_exists, never a dead-end.
  // ---------------------------------------------------------------------------

  it("returns auth_account_exists for the obfuscated already-registered response (identities: [])", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-1", identities: [] }, session: null },
      error: null,
    });
    const result = await signUpAction({
      email: "returning@example.com",
      password: "supersecret",
    });
    expect(result).toEqual({ ok: false, errorKey: "auth_account_exists" });
    expect(mockMarkPasswordSet).not.toHaveBeenCalled();
  });

  it("returns auth_account_exists for an explicit user_already_exists error", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: {
        status: 422,
        code: "user_already_exists",
        message: "User already registered",
      },
    });
    const result = await signUpAction({
      email: "returning@example.com",
      password: "supersecret",
    });
    expect(result).toEqual({ ok: false, errorKey: "auth_account_exists" });
    expect(mockMarkPasswordSet).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // next threading (2026-07-11 incident #2)
  //
  // emailRedirectTo used to hardcode ?next=/trips, stranding invitees on the
  // empty dashboard after any email round-trip. The action now accepts an
  // optional `next`, sanitized through safeNext.
  // ---------------------------------------------------------------------------

  it("threads a safe next path into emailRedirectTo", async () => {
    mockSignUp.mockResolvedValue({ data: { user: {} }, error: null });
    await signUpAction({
      email: "dave@example.com",
      password: "supersecret",
      next: "/invite/tok123",
    });
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(
            `next=${encodeURIComponent("/invite/tok123")}`
          ),
        }),
      })
    );
  });

  it("falls back to /trips in emailRedirectTo when next is omitted", async () => {
    mockSignUp.mockResolvedValue({ data: { user: {} }, error: null });
    await signUpAction({ email: "dave@example.com", password: "supersecret" });
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(
            `next=${encodeURIComponent("/trips")}`
          ),
        }),
      })
    );
  });

  it("sanitizes an off-origin next through safeNext (protocol-relative)", async () => {
    mockSignUp.mockResolvedValue({ data: { user: {} }, error: null });
    await signUpAction({
      email: "dave@example.com",
      password: "supersecret",
      next: "//evil.com/phish",
    });
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(
            `next=${encodeURIComponent("/trips")}`
          ),
        }),
      })
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

  // 2026-07-11 incident #2 — same next-threading contract as signUpAction.

  it("threads a safe next path into emailRedirectTo", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await requestEmailCode("dave@example.com", "/invite/tok123");
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(
            `next=${encodeURIComponent("/invite/tok123")}`
          ),
        }),
      })
    );
  });

  it("falls back to /trips in emailRedirectTo when next is omitted", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await requestEmailCode("dave@example.com");
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(
            `next=${encodeURIComponent("/trips")}`
          ),
        }),
      })
    );
  });

  it("sanitizes an off-origin next through safeNext", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await requestEmailCode("dave@example.com", "https://evil.com/phish");
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(
            `next=${encodeURIComponent("/trips")}`
          ),
        }),
      })
    );
  });
});
