/**
 * Regression tests pinning the fail-CLOSED behavior for scopes that must
 * deny when the in-memory shim is active (W0c, M4 — issue #166 / #106).
 *
 * Three classes of assertions:
 *  A. Fail-CLOSED scopes: PLACES_AUTOCOMPLETE + MINT_INVITE → deny on shim
 *  B. Allow-with-warning scopes: AUTH_MAGIC_LINK + ACCEPT_INVITE → pass on shim
 *  C. Budget pin: MINT_INVITE cap is 10/hour (via mocked Upstash)
 *
 * Strategy: we use `__forceShimForTest` (a new test-only export) that
 * forces `getLimiter()` to return the in-memory shim regardless of env
 * vars — matching the pattern in index.test.ts where we use
 * `__setLimiterForTest(null)` to reset.
 *
 * For the shim-fail-closed tests we need to observe the shim directly
 * (not a mock limiter), so we call `__setLimiterForTest(null)` to clear
 * the cache and then call `rateLimitedAction` with no Upstash env set —
 * the shim kicks in automatically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RATE_LIMIT_SCOPES,
  FAIL_CLOSED_ON_SHIM,
  SCOPE_BUDGETS,
  RateLimitError,
  __setLimiterForTest,
  rateLimitedAction,
} from "@/lib/rate-limit";

afterEach(() => {
  __setLimiterForTest(null);
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// A. Fail-CLOSED scopes on in-memory shim
// ---------------------------------------------------------------------------

describe("PLACES_AUTOCOMPLETE — shim fail-closed (W0c)", () => {
  beforeEach(() => {
    // Ensure no Upstash creds are set so the shim activates.
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    // Clear cached limiter so a fresh shim is built.
    __setLimiterForTest(null);
  });

  it("PLACES_AUTOCOMPLETE is in the RATE_LIMIT_SCOPES catalogue", () => {
    expect(RATE_LIMIT_SCOPES.PLACES_AUTOCOMPLETE).toBe("placesAutocomplete");
  });

  it("PLACES_AUTOCOMPLETE is in the FAIL_CLOSED_ON_SHIM set", () => {
    expect(FAIL_CLOSED_ON_SHIM.has(RATE_LIMIT_SCOPES.PLACES_AUTOCOMPLETE)).toBe(true);
  });

  it("rateLimitedAction throws RateLimitError when shim is active (fail-closed)", async () => {
    // Silence the production-mode warning since we may not be in prod env.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Use vi.resetModules() so the shim cache is cleared in the fresh import.
    vi.resetModules();
    const { rateLimitedAction: fresh, RATE_LIMIT_SCOPES: SCOPES, RateLimitError: FreshRateLimitError } =
      await import("@/lib/rate-limit");

    const fn = vi.fn();
    await expect(
      fresh(SCOPES.PLACES_AUTOCOMPLETE, "user-abc", fn)
    ).rejects.toBeInstanceOf(FreshRateLimitError);
    expect(fn).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("MINT_INVITE — shim fail-closed (W0c)", () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __setLimiterForTest(null);
  });

  it("MINT_INVITE is in the FAIL_CLOSED_ON_SHIM set", () => {
    expect(FAIL_CLOSED_ON_SHIM.has(RATE_LIMIT_SCOPES.MINT_INVITE)).toBe(true);
  });

  it("rateLimitedAction throws RateLimitError when shim is active (fail-closed)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.resetModules();
    const { rateLimitedAction: fresh, RATE_LIMIT_SCOPES: SCOPES, RateLimitError: FreshRateLimitError } =
      await import("@/lib/rate-limit");

    const fn = vi.fn();
    await expect(
      fresh(SCOPES.MINT_INVITE, "user-abc", fn)
    ).rejects.toBeInstanceOf(FreshRateLimitError);
    expect(fn).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// B. Allow-with-warning scopes still pass on shim (regression guard)
// ---------------------------------------------------------------------------

describe("AUTH_MAGIC_LINK — shim still allow-with-warning (regression guard)", () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __setLimiterForTest(null);
  });

  it("AUTH_MAGIC_LINK is NOT in the FAIL_CLOSED_ON_SHIM set", () => {
    expect(FAIL_CLOSED_ON_SHIM.has(RATE_LIMIT_SCOPES.AUTH_MAGIC_LINK)).toBe(false);
  });

  it("rateLimitedAction succeeds (allows) when shim is active", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.resetModules();
    const { rateLimitedAction: fresh, RATE_LIMIT_SCOPES: SCOPES } =
      await import("@/lib/rate-limit");

    const fn = vi.fn().mockResolvedValue("ok");
    const result = await fresh(SCOPES.AUTH_MAGIC_LINK, "user-1", fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("ACCEPT_INVITE — shim still allow-with-warning (regression guard)", () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __setLimiterForTest(null);
  });

  it("ACCEPT_INVITE is NOT in the FAIL_CLOSED_ON_SHIM set", () => {
    expect(FAIL_CLOSED_ON_SHIM.has(RATE_LIMIT_SCOPES.ACCEPT_INVITE)).toBe(false);
  });

  it("rateLimitedAction succeeds (allows) when shim is active", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.resetModules();
    const { rateLimitedAction: fresh, RATE_LIMIT_SCOPES: SCOPES } =
      await import("@/lib/rate-limit");

    const fn = vi.fn().mockResolvedValue("accepted");
    const result = await fresh(SCOPES.ACCEPT_INVITE, "user-2", fn);
    expect(result).toBe("accepted");
    expect(fn).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// C. Budget pin: MINT_INVITE enforced at 10/hour (mock Upstash)
// ---------------------------------------------------------------------------

describe("SCOPE_BUDGETS catalogue (W0c)", () => {
  it("exports SCOPE_BUDGETS", () => {
    expect(SCOPE_BUDGETS).toBeDefined();
  });

  it("MINT_INVITE budget is 10 requests per hour", () => {
    const budget = SCOPE_BUDGETS[RATE_LIMIT_SCOPES.MINT_INVITE];
    expect(budget).toBeDefined();
    expect(budget?.limit).toBe(10);
    expect(budget?.window).toBe("1 h");
  });

  it("PLACES_AUTOCOMPLETE budget is 30 requests per 60 seconds", () => {
    const budget = SCOPE_BUDGETS[RATE_LIMIT_SCOPES.PLACES_AUTOCOMPLETE];
    expect(budget).toBeDefined();
    expect(budget?.limit).toBe(30);
    expect(budget?.window).toBe("60 s");
  });
});

describe("MINT_INVITE budget enforced at 10/hour when Upstash is live", () => {
  it("throws RateLimitError after 10 calls (mock Upstash limiter)", async () => {
    // Simulate a limiter that allows the first 10 calls then denies.
    let callCount = 0;
    __setLimiterForTest({
      limit: vi.fn().mockImplementation(async () => {
        callCount++;
        const allowed = callCount <= 10;
        return {
          success: allowed,
          limit: 10,
          remaining: Math.max(0, 10 - callCount),
          reset: Date.now() + 3_600_000,
          pending: Promise.resolve(),
        };
      }),
    });

    const fn = vi.fn().mockResolvedValue("minted");

    // Calls 1-10 should succeed.
    for (let i = 0; i < 10; i++) {
      await expect(
        rateLimitedAction(RATE_LIMIT_SCOPES.MINT_INVITE, "organizer-1", fn)
      ).resolves.toBe("minted");
    }

    // Call 11 should be denied.
    await expect(
      rateLimitedAction(RATE_LIMIT_SCOPES.MINT_INVITE, "organizer-1", fn)
    ).rejects.toBeInstanceOf(RateLimitError);

    expect(fn).toHaveBeenCalledTimes(10);
  });
});
