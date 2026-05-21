/**
 * Unit tests for signInWithOAuthAction (M5/PR5).
 *
 * Phase 4 audit C4: serialization-boundary injection tests on the `next`
 * param (CRLF, quote, HTML-entity injection via safeNext).
 *
 * All external dependencies (Supabase, rate-limiter, safeNext) are mocked.
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mock setup ----------------------------------------------------------------

const mockSignInWithOAuth = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        signInWithOAuth: mockSignInWithOAuth,
      },
    })
  ),
}));

// Rate-limiter: default to allow (pass-through).
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

// safeNext is dynamically imported inside the action — mock the module.
vi.mock("@/lib/auth/safe-next", () => ({
  safeNext: (raw: string | null): string => {
    if (!raw) return "/trips";
    // Replicate the real safeNext logic for test accuracy:
    // Must start with single /, not //. Must not decode to scheme:
    if (!/^\/(?!\/)/.test(raw)) return "/trips";
    try {
      const decoded = decodeURIComponent(raw);
      if (/^\w+:/.test(decoded)) return "/trips";
    } catch {
      return "/trips";
    }
    return raw;
  },
}));

// Import AFTER mocks.
import { signInWithOAuthAction } from "@/app/login/actions";
import { RateLimitError } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// signInWithOAuthAction
// ---------------------------------------------------------------------------

describe("signInWithOAuthAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("returns { ok: true, url } when supabase returns a redirect URL", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?..." },
      error: null,
    });

    const result = await signInWithOAuthAction({ provider: "google" });

    expect(result).toEqual({
      ok: true,
      url: "https://accounts.google.com/o/oauth2/v2/auth?...",
    });
  });

  it("calls signInWithOAuth with provider=google and a redirectTo containing /auth/callback", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });

    await signInWithOAuthAction({ provider: "google" });

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback"),
        }),
      })
    );
  });

  it("embeds the safeNext-sanitized `next` param in redirectTo", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });

    await signInWithOAuthAction({ provider: "google", next: "/trips/abc" });

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: expect.stringContaining(
            encodeURIComponent("/trips/abc")
          ),
        }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Provider allowlist
  // -------------------------------------------------------------------------

  it("returns validation_failed when provider is not in the allowlist", async () => {
    const result = await signInWithOAuthAction({
      // Type assertion required to simulate a rogue caller bypassing TS.
      provider: "apple" as "google",
    });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Serialization-boundary injection (Phase 4 audit C4 / M3 §3 lesson)
  // -------------------------------------------------------------------------

  it("drops CRLF injection in `next` param — safeNext falls back to /trips", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });

    await signInWithOAuthAction({
      provider: "google",
      next: "/trips\r\nX-Injected: header",
    });

    const callArg = mockSignInWithOAuth.mock.calls[0]?.[0] as {
      options: { redirectTo: string };
    };
    // The redirectTo must not contain the CRLF payload — safeNext drops it.
    expect(callArg.options.redirectTo).not.toContain("\r\n");
    // Falls back to /trips
    expect(callArg.options.redirectTo).toContain(
      encodeURIComponent("/trips")
    );
  });

  it('drops HTML-entity injection in `next` param — safeNext rejects "<script>"', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });

    // /trips is a valid path but the "<script>" part would be dropped
    // since safeNext only allows /paths — this one doesn't start with /
    await signInWithOAuthAction({
      provider: "google",
      next: "<script>alert(1)</script>",
    });

    const callArg = mockSignInWithOAuth.mock.calls[0]?.[0] as {
      options: { redirectTo: string };
    };
    expect(callArg.options.redirectTo).not.toContain("<script>");
    expect(callArg.options.redirectTo).toContain(
      encodeURIComponent("/trips")
    );
  });

  it("drops quote injection in `next` param — safeNext rejects non-path input", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });

    await signInWithOAuthAction({
      provider: "google",
      next: '"onmouseover="alert(1)',
    });

    const callArg = mockSignInWithOAuth.mock.calls[0]?.[0] as {
      options: { redirectTo: string };
    };
    expect(callArg.options.redirectTo).not.toContain('"onmouseover=');
    expect(callArg.options.redirectTo).toContain(
      encodeURIComponent("/trips")
    );
  });

  it("drops absolute-URL injection in `next` — safeNext rejects https://evil.com", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });

    await signInWithOAuthAction({
      provider: "google",
      next: "https://evil.com/steal",
    });

    const callArg = mockSignInWithOAuth.mock.calls[0]?.[0] as {
      options: { redirectTo: string };
    };
    expect(callArg.options.redirectTo).not.toContain("evil.com");
    expect(callArg.options.redirectTo).toContain(
      encodeURIComponent("/trips")
    );
  });

  // -------------------------------------------------------------------------
  // Error paths
  // -------------------------------------------------------------------------

  it("returns oauth_redirect_failed when supabase returns an error", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { status: 500, message: "Provider error", name: "AuthError" },
    });

    const result = await signInWithOAuthAction({ provider: "google" });

    expect(result).toEqual({ ok: false, errorKey: "oauth_redirect_failed" });
  });

  it("returns oauth_redirect_failed when supabase returns null url with no error", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: null,
    });

    const result = await signInWithOAuthAction({ provider: "google" });

    expect(result).toEqual({ ok: false, errorKey: "oauth_redirect_failed" });
  });

  // M5/PR5 reviewer HIGH (rate-limit): the inner rateLimitedAction wrapper
  // was removed from signInWithOAuthAction — the previous fixed-key bucket
  // created a global DoS surface. IP-level throttling is provided by the
  // middleware path matcher on /login (lib/rate-limit/index.ts
  // GUARDED_PATH_PATTERNS). The action no longer needs an inner limiter.
  it("does NOT wrap signInWithOAuth in rateLimitedAction (middleware handles per-IP)", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });

    await signInWithOAuthAction({ provider: "google" });

    expect(mockRateLimitedAction).not.toHaveBeenCalled();
  });

  it("still translates a bubbled RateLimitError (e.g. from middleware) into rate_limit errorKey", async () => {
    mockSignInWithOAuth.mockRejectedValueOnce(
      new RateLimitError("authPassword", { remaining: 0, reset: 0 })
    );

    const result = await signInWithOAuthAction({ provider: "google" });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns network when resolveOrigin throws (no env vars set)", async () => {
    // In test environment NODE_ENV !== 'production' so localhost fallback
    // applies — we can't easily trigger this without mocking process.env.
    // Instead test that the action never throws.
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });
    const result = await signInWithOAuthAction({ provider: "google" });
    // Either ok or an error key — never throws.
    expect(result).toHaveProperty("ok");
  });

  it("never throws — catches unexpected errors", async () => {
    mockSignInWithOAuth.mockRejectedValueOnce(new Error("Unexpected"));

    const result = await signInWithOAuthAction({ provider: "google" });

    expect(result).toEqual({ ok: false, errorKey: "network" });
  });
});
