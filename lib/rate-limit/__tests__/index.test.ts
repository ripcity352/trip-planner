import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Import after we've confirmed the module is safe to import with no env set.
// We DO NOT pre-set Upstash env vars; the in-memory fallback should kick in.
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  __setLimiterForTest,
  getClientId,
  rateLimitRequest,
  rateLimitedAction,
} from "@/lib/rate-limit";

function makeReq(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(new URL(url), {
    method: init.method ?? "GET",
    headers: init.headers,
  });
}

afterEach(() => {
  __setLimiterForTest(null);
  vi.restoreAllMocks();
});

describe("module import safety", () => {
  it("does not throw when Upstash env vars are unset", () => {
    // The very fact that the imports at the top of this file resolved without
    // throwing is the assertion. Add a sanity check so the test is non-trivial.
    expect(process.env.UPSTASH_REDIS_REST_URL).toBeFalsy();
    expect(typeof rateLimitedAction).toBe("function");
  });
});

describe("getClientId", () => {
  it("prefers x-forwarded-for and returns the first hop", () => {
    const req = makeReq("http://localhost/trips", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(getClientId(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const req = makeReq("http://localhost/trips", {
      headers: { "x-real-ip": "5.6.7.8" },
    });
    expect(getClientId(req)).toBe("5.6.7.8");
  });

  it("returns a stable id for repeated calls on the same request", () => {
    const req = makeReq("http://localhost/trips", {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    expect(getClientId(req)).toBe(getClientId(req));
  });

  it("returns the anon sentinel when no headers identify the client", () => {
    const req = makeReq("http://localhost/trips");
    expect(getClientId(req)).toBe("anon");
  });
});

describe("rateLimitedAction", () => {
  beforeEach(() => {
    // Default: an "allow all" limiter so individual tests can override.
    __setLimiterForTest({
      limit: vi.fn().mockResolvedValue({
        success: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      }),
    });
  });

  it("invokes the wrapped fn when the limiter allows", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_TRIP,
      "user-1",
      fn,
    );
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws RateLimitError and skips fn when the limit is exceeded", async () => {
    __setLimiterForTest({
      limit: vi.fn().mockResolvedValue({
        success: false,
        limit: 30,
        remaining: 0,
        reset: Date.now() + 30_000,
        pending: Promise.resolve(),
      }),
    });
    const fn = vi.fn();
    await expect(
      rateLimitedAction(RATE_LIMIT_SCOPES.ACCEPT_INVITE, "user-2", fn),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("namespaces buckets per (scope, key) so scopes don't share a budget", async () => {
    const limit = vi.fn().mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });
    __setLimiterForTest({ limit });
    await rateLimitedAction(RATE_LIMIT_SCOPES.CREATE_TRIP, "u", async () => 1);
    await rateLimitedAction(RATE_LIMIT_SCOPES.ACCEPT_INVITE, "u", async () => 2);
    expect(limit).toHaveBeenNthCalledWith(1, "createTrip:u");
    expect(limit).toHaveBeenNthCalledWith(2, "acceptInvite:u");
  });
});

describe("rateLimitRequest", () => {
  it("returns null for GET requests (reads aren't rate-limited)", async () => {
    const limit = vi.fn();
    __setLimiterForTest({ limit });
    const req = makeReq("http://localhost/trips", { method: "GET" });
    expect(await rateLimitRequest(req)).toBeNull();
    expect(limit).not.toHaveBeenCalled();
  });

  it("returns null for non-guarded paths", async () => {
    const limit = vi.fn();
    __setLimiterForTest({ limit });
    const req = makeReq("http://localhost/login", { method: "POST" });
    expect(await rateLimitRequest(req)).toBeNull();
    expect(limit).not.toHaveBeenCalled();
  });

  it("passes through when the limiter allows", async () => {
    __setLimiterForTest({
      limit: vi.fn().mockResolvedValue({
        success: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      }),
    });
    const req = makeReq("http://localhost/trips/abc", {
      method: "POST",
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    expect(await rateLimitRequest(req)).toBeNull();
  });

  it("returns a 429 NextResponse when the limit is exceeded", async () => {
    __setLimiterForTest({
      limit: vi.fn().mockResolvedValue({
        success: false,
        limit: 30,
        remaining: 0,
        reset: Date.now() + 30_000,
        pending: Promise.resolve(),
      }),
    });
    const req = makeReq("http://localhost/api/webhooks/foo", {
      method: "POST",
      headers: { "x-forwarded-for": "2.2.2.2" },
    });
    const res = await rateLimitRequest(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    expect(res?.headers.get("retry-after")).toBeTruthy();
  });
});
