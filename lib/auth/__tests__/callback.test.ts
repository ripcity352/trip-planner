/**
 * Unit tests for the auth callback logic — covers both the legacy PKCE
 * `code` path and the new token-hash `verifyOtp` path, and the new
 * 6-digit OTP token path.
 *
 * The callback route itself is a Next.js route handler and can't be
 * unit-tested directly without the full request lifecycle. Instead, the
 * branching logic is extracted into `lib/auth/callback-handler.ts` and
 * tested here in isolation.
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

  // ── token-hash path (new default) ────────────────────────────────────────

  describe("token-hash path (verifyOtp)", () => {
    it("calls verifyOtp with token_hash and type when both are present", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        token_hash: "abc123",
        type: "email",
        token: null,
        email: null,
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(verifyOtpSpy).toHaveBeenCalledWith({
        token_hash: "abc123",
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
        error: { status: 400, name: "AuthApiError", message: "Invalid OTP" },
      });

      const params: CallbackParams = {
        token_hash: "bad-hash",
        type: "email",
        token: null,
        email: null,
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(result).toEqual({ ok: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] verifyOtp failed",
        expect.objectContaining({ message: "Invalid OTP" }),
      );

      consoleErrorSpy.mockRestore();
    });

    it("requires type to be present alongside token_hash — falls through to error if type is missing", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const params: CallbackParams = {
        token_hash: "abc123",
        type: null,
        token: null,
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

    it("preserves the next param through the success result", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        token_hash: "abc123",
        type: "email",
        token: null,
        email: null,
        code: null,
        next: "/trips/xyz-trip-id",
      };

      const result = await resolveCallbackResult(params);

      expect(result).toEqual({ ok: true, next: "/trips/xyz-trip-id" });
    });
  });

  // ── 6-digit OTP token path (new, form-entered code) ──────────────────────

  describe("6-digit OTP token path (verifyOtp with email + token + type)", () => {
    it("calls verifyOtp with email, token, and type when present and token_hash is absent", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        token_hash: null,
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

    it("returns ok:false and logs when verifyOtp returns an error on token path", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      verifyOtpSpy.mockResolvedValue({
        data: {},
        error: { status: 400, name: "AuthApiError", message: "Token has expired or is invalid" },
      });

      const params: CallbackParams = {
        token_hash: null,
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
        token_hash: null,
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

    it("enforces type allowlist on the token path — rejects 'not-a-real-type'", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const params: CallbackParams = {
        token_hash: null,
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

    it("does not call Supabase client when token is present but email is absent", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      const params: CallbackParams = {
        token_hash: null,
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
  });

  // ── PKCE code path (backward compat) ─────────────────────────────────────

  describe("PKCE code path (exchangeCodeForSession — backward compat)", () => {
    it("calls exchangeCodeForSession when code is present and token_hash is absent", async () => {
      exchangeCodeForSessionSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        token_hash: null,
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
        token_hash: null,
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

  // ── precedence: token_hash wins over all ─────────────────────────────────

  describe("precedence: token_hash wins over token and code", () => {
    it("uses verifyOtp(token_hash) when both token_hash and token are present", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        token_hash: "new-style-hash",
        type: "email",
        token: "123456",
        email: "user@example.com",
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(verifyOtpSpy).toHaveBeenCalledWith({
        token_hash: "new-style-hash",
        type: "email",
      });
      expect(exchangeCodeForSessionSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, next: "/trips" });
    });

    it("uses verifyOtp (not exchangeCodeForSession) when both token_hash and code are present", async () => {
      // This can happen during the template-flip transition window.
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        token_hash: "new-style-hash",
        type: "email",
        token: null,
        email: null,
        code: "legacy-pkce-code",
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(verifyOtpSpy).toHaveBeenCalledWith({
        token_hash: "new-style-hash",
        type: "email",
      });
      expect(exchangeCodeForSessionSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, next: "/trips" });
    });
  });

  // ── precedence: token wins over code ─────────────────────────────────────

  describe("precedence: token wins over code", () => {
    it("uses verifyOtp(token) when both token and code are present and token_hash is absent", async () => {
      verifyOtpSpy.mockResolvedValue({ data: {}, error: null });

      const params: CallbackParams = {
        token_hash: null,
        type: "email",
        token: "123456",
        email: "user@example.com",
        code: "legacy-pkce-code",
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
    it("returns ok:false when neither code nor token_hash nor token is present", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const params: CallbackParams = {
        token_hash: null,
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

  // ── unknown OTP type ──────────────────────────────────────────────────────

  describe("type allowlist", () => {
    it("rejects an unknown OTP type before calling Supabase (token_hash path)", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const params: CallbackParams = {
        token_hash: "abc123",
        // Intentionally not in the ALLOWED_OTP_TYPES allowlist.
        type: "not-a-real-otp-type",
        token: null,
        email: null,
        code: null,
        next: "/trips",
      };

      const result = await resolveCallbackResult(params);

      expect(result).toEqual({ ok: false });
      expect(verifyOtpSpy).not.toHaveBeenCalled();
      expect(createClientMock).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[auth] callback got unknown OTP type",
        { type: "not-a-real-otp-type" },
      );

      consoleErrorSpy.mockRestore();
    });

    it("accepts all six documented OTP types", async () => {
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
          token_hash: "h",
          type,
          token: null,
          email: null,
          code: null,
          next: "/trips",
        });
        expect(result).toEqual({ ok: true, next: "/trips" });
      }
    });
  });
});
