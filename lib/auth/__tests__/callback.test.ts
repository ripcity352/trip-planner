/**
 * Unit tests for the auth callback logic — covers the 6-digit OTP token
 * `verifyOtp` path and the PKCE `code` path (used by OAuth in PR5).
 *
 * The callback route itself is a Next.js route handler and can't be
 * unit-tested directly without the full request lifecycle. Instead, the
 * branching logic is extracted into `lib/auth/callback-handler.ts` and
 * tested here in isolation.
 *
 * The legacy `token_hash` branch (M3 W0c, magic-link URLs) was removed
 * in M5 PR3 after the in-flight link drain expired.
 *
 * Override C compliance: tests live in lib/, not app/.
 */

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Declare spies at module scope so tests can configure them, but initialize
// inside beforeEach to avoid vi.mock hoisting order issues.
let exchangeCodeForSessionSpy: ReturnType<typeof vi.fn>;
let verifyOtpSpy: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

import {
  resolveCallbackResult,
  type CallbackParams,
} from "@/lib/auth/callback-handler";
import { createClient } from "@/lib/supabase/server";

const createClientMock = vi.mocked(createClient);

describe("resolveCallbackResult()", () => {
  beforeEach(() => {
    exchangeCodeForSessionSpy = vi.fn();
    verifyOtpSpy = vi.fn();
    createClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionSpy,
        verifyOtp: verifyOtpSpy,
      },
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 6-digit OTP token path (primary verify) ──────────────────────────────

  describe("6-digit OTP token path (verifyOtp with email + token + type)", () => {
    it("calls verifyOtp with email, token, and type when present", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        type: "email",
        token: "123456",
        email: "user@example.com",
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(verifyOtpSpy).toHaveBeenCalledWith({
        email: "user@example.com",
        token: "123456",
        type: "email",
      });
      expect(exchangeCodeForSessionSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, next: "/trips" });
    });

    it("returns ok:false and logs when verifyOtp returns an error", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      verifyOtpSpy.mockResolvedValue({
        data: {},
        error: { status: 400, name: "AuthApiError", message: "Token has expired or is invalid" },
      });

      const params: CallbackParams = {
        type: "email",
        token: "000000",
        email: "user@example.com",
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(result).toEqual({ ok: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] verifyOtp failed",
        expect.objectContaining({ message: "Token has expired or is invalid" }),
      );

      consoleErrorSpy.mockRestore();
    });

    it("falls through to error when token is present but email is absent", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const params: CallbackParams = {
        type: "email",
        token: "123456",
        email: null,
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(verifyOtpSpy).not.toHaveBeenCalled();
      expect(exchangeCodeForSessionSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] callback missing required params",
        expect.any(Object),
      );

      consoleErrorSpy.mockRestore();
    });

    it("falls through to error when email is present but token is absent", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const params: CallbackParams = {
        type: "email",
        token: null,
        email: "user@example.com",
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(verifyOtpSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] callback missing required params",
        expect.any(Object),
      );

      consoleErrorSpy.mockRestore();
    });

    it("enforces type allowlist on the token path — rejects 'not-a-real-type'", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const params: CallbackParams = {
        type: "not-a-real-type",
        token: "123456",
        email: "user@example.com",
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(result).toEqual({ ok: false });
      expect(verifyOtpSpy).not.toHaveBeenCalled();
      expect(createClientMock).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] callback got unknown OTP type",
        { type: "not-a-real-type" },
      );

      consoleErrorSpy.mockRestore();
    });

    it("does not allocate the Supabase client when token is present but email is absent", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      const params: CallbackParams = {
        type: "email",
        token: "123456",
        email: null,
        code: null,
        next: "/trips",
      };

      await resolveCallbackResult(params);

      expect(createClientMock).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it("preserves the next param through the success result", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        type: "email",
        token: "123456",
        email: "user@example.com",
        code: null,
        next: "/trips/xyz-trip-id",
      };

      const result = await resolveCallbackResult(params);

      expect(result).toEqual({ ok: true, next: "/trips/xyz-trip-id" });
    });

    it("accepts all six documented OTP types via the token path", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });
      for (const type of [
        "email",
        "magiclink",
        "recovery",
        "invite",
        "email_change",
        "signup",
      ] as const) {
        const result = await resolveCallbackResult({
          type,
          token: "123456",
          email: "user@example.com",
          code: null,
          next: "/trips",
        });
        expect(result).toEqual({ ok: true, next: "/trips" });
      }
    });
  });

  // ── PKCE code path (OAuth — PR5 wires Google sign-in) ────────────────────

  describe("PKCE code path (exchangeCodeForSession — OAuth)", () => {
    it("calls exchangeCodeForSession when code is present and OTP params are absent", async () => {
      exchangeCodeForSessionSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        type: null,
        token: null,
        email: null,
        code: "pkce-code-xyz",
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(exchangeCodeForSessionSpy).toHaveBeenCalledWith("pkce-code-xyz");
      expect(verifyOtpSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, next: "/trips" });
    });

    it("returns ok:false and logs when exchangeCodeForSession returns an error", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      exchangeCodeForSessionSpy.mockResolvedValue({
        data: {},
        error: {
          status: 400,
          code: "pkce_code_verifier_not_found",
          name: "AuthPKCECodeVerifierMissingError",
          message: "PKCE code verifier not found in storage.",
        },
      });

      const params: CallbackParams = {
        type: null,
        token: null,
        email: null,
        code: "stale-code",
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(result).toEqual({ ok: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] exchangeCodeForSession failed",
        expect.objectContaining({ code: "pkce_code_verifier_not_found" }),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ── precedence: token wins over code ─────────────────────────────────────

  describe("precedence: token wins over code", () => {
    it("uses verifyOtp(token) when both token+email+type and code are present", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        type: "email",
        token: "123456",
        email: "user@example.com",
        code: "stale-pkce-code",
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(verifyOtpSpy).toHaveBeenCalledWith({
        email: "user@example.com",
        token: "123456",
        type: "email",
      });
      expect(exchangeCodeForSessionSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, next: "/trips" });
    });
  });

  // ── no params ─────────────────────────────────────────────────────────────

  describe("missing params", () => {
    it("returns ok:false when neither token nor code is present", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const params: CallbackParams = {
        type: null,
        token: null,
        email: null,
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(result).toEqual({ ok: false });
      expect(verifyOtpSpy).not.toHaveBeenCalled();
      expect(exchangeCodeForSessionSpy).not.toHaveBeenCalled();
      // Per-branch createClient — when no params match, the Supabase
      // client is never allocated.
      expect(createClientMock).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] callback missing required params",
        expect.any(Object),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
