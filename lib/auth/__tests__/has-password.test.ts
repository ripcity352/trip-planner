/**
 * Unit tests for markPasswordSet helper (#244).
 *
 * The helper consolidates the duplicated `has_password = true` write block
 * that appeared in 4 password setter server actions after M5 / W0 D6
 * (trip-readiness). Behavior contract:
 *
 *   1. Issues the chained UPDATE: profiles → has_password=true → eq(id) →
 *      select() → single() — identical to the inlined block being replaced,
 *      so the existing has-password-writes.test.ts assertions stay green.
 *   2. Returns { ok: true } on success.
 *   3. Returns { ok: false } and logs a contextual error on failure (does
 *      NOT throw — callers translate to their action's errorKey).
 *
 * Override C compliance: tests live in lib/, not app/.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { markPasswordSet } from "@/lib/auth/has-password";

// PostgREST chain mock — shared single() resolves per-test.
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockEq = vi.fn(() => ({ select: mockSelect }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));

// Cast through unknown — the helper only touches .from(...).update(...) etc.
const makeSupabase = () =>
  ({ from: mockFrom }) as unknown as Parameters<typeof markPasswordSet>[0];

describe("markPasswordSet", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("issues UPDATE profiles SET has_password=true WHERE id=userId", async () => {
    mockSingle.mockResolvedValue({
      data: { id: "user-abc", has_password: true },
      error: null,
    });

    await markPasswordSet(makeSupabase(), "user-abc", "auth:signUp");

    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledWith({ has_password: true });
    expect(mockEq).toHaveBeenCalledWith("id", "user-abc");
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockSingle).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true } on success", async () => {
    mockSingle.mockResolvedValue({
      data: { id: "user-abc", has_password: true },
      error: null,
    });

    const result = await markPasswordSet(
      makeSupabase(),
      "user-abc",
      "auth:signUp",
    );

    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: false } and logs context on failure", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "row not found" },
    });

    const result = await markPasswordSet(
      makeSupabase(),
      "user-abc",
      "account-security:changePassword",
    );

    expect(result).toEqual({ ok: false });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // Log message includes the context tag — gives operators a needle for
    // grepping which call site failed.
    const [msg, payload] = errorSpy.mock.calls[0]!;
    expect(msg).toContain("account-security:changePassword");
    expect(msg).toContain("has_password write failed");
    expect(payload).toEqual({ code: "PGRST116" });
  });

  it("does not throw on supabase error — callers translate to errorKey", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "500", message: "internal" },
    });

    await expect(
      markPasswordSet(makeSupabase(), "user-abc", "auth:signUp"),
    ).resolves.toEqual({ ok: false });
  });
});
