import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Import after we've confirmed the module is safe to import with no env set.
// We DO NOT pre-set Upstash env vars; the in-memory fallback should kick in.
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  __resolveUpstashCreds,
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

describe("__resolveUpstashCreds (env-var precedence, #124)", () => {
  // The Vercel Marketplace "Upstash for Redis" integration auto-injects
  // KV_REST_API_URL / KV_REST_API_TOKEN. Local dev and direct-Upstash
  // setups historically used UPSTASH_REDIS_REST_URL /
  // UPSTASH_REDIS_REST_TOKEN. Both must work; KV_* wins when present
  // because that's the live prod configuration after #124 closed.

  const empty = {};

  it("returns null when no creds are present", () => {
    expect(__resolveUpstashCreds(empty)).toBeNull();
  });

  it("returns null when only the URL half is present", () => {
    expect(
      __resolveUpstashCreds({
        KV_REST_API_URL: "https://example.upstash.io",
      }),
    ).toBeNull();
    expect(
      __resolveUpstashCreds({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      }),
    ).toBeNull();
  });

  it("returns null when only the token half is present", () => {
    expect(
      __resolveUpstashCreds({
        KV_REST_API_TOKEN: "tok",
      }),
    ).toBeNull();
  });

  it("resolves KV_* names (Vercel Marketplace auto-injection)", () => {
    expect(
      __resolveUpstashCreds({
        KV_REST_API_URL: "https://kv.upstash.io",
        KV_REST_API_TOKEN: "kv-tok",
      }),
    ).toEqual({ url: "https://kv.upstash.io", token: "kv-tok" });
  });

  it("resolves UPSTASH_REDIS_REST_* names (direct-Upstash / local dev)", () => {
    expect(
      __resolveUpstashCreds({
        UPSTASH_REDIS_REST_URL: "https://up.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "up-tok",
      }),
    ).toEqual({ url: "https://up.upstash.io", token: "up-tok" });
  });

  it("prefers KV_* over UPSTASH_* when both are present", () => {
    // Vercel Marketplace KV_* are the production source of truth after
    // #124; an inherited UPSTASH_* in the same environment must not
    // shadow them.
    expect(
      __resolveUpstashCreds({
        KV_REST_API_URL: "https://kv.upstash.io",
        KV_REST_API_TOKEN: "kv-tok",
        UPSTASH_REDIS_REST_URL: "https://up.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "up-tok",
      }),
    ).toEqual({ url: "https://kv.upstash.io", token: "kv-tok" });
  });

  it("treats empty-string values as absent", () => {
    expect(
      __resolveUpstashCreds({
        KV_REST_API_URL: "",
        KV_REST_API_TOKEN: "",
      }),
    ).toBeNull();
  });

  it("falls through from empty KV_* to populated UPSTASH_* (Vercel injects empty placeholder, .env.local has real value)", () => {
    // Realistic regression: an env where KV_* is declared-but-empty
    // (e.g., the integration was uninstalled but the placeholder env
    // var lingered) must not shadow a working UPSTASH_* fallback.
    expect(
      __resolveUpstashCreds({
        KV_REST_API_URL: "",
        KV_REST_API_TOKEN: "",
        UPSTASH_REDIS_REST_URL: "https://up.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "up-tok",
      }),
    ).toEqual({ url: "https://up.upstash.io", token: "up-tok" });
  });
});

describe("RATE_LIMIT_SCOPES (catalogue)", () => {
  it("includes the authOtpVerify scope used by /login (PR #102, renamed M5/PR1)", () => {
    // Lock in the contract that `app/login/actions.ts` depends on:
    // rate-limiting OTP issuance via this exact scope value.
    // If this scope ever gets renamed, the login action breaks closed
    // (rate-limit throws at runtime), which we want this test to flag
    // at CI time instead.
    expect(RATE_LIMIT_SCOPES.AUTH_OTP_VERIFY).toBe("authOtpVerify");
  });

  it("has a MINT_INVITE scope distinct from ACCEPT_INVITE (#107)", () => {
    // Issue #107: minting invite links and accepting invite links were
    // sharing the same `acceptInvite` bucket. A burst of mints could
    // starve accepts (or vice versa). The fix adds a dedicated bucket
    // for the mint path so each gets its own 30 req/60s budget.
    expect(RATE_LIMIT_SCOPES.MINT_INVITE).toBe("mintInvite");
    // Explicit inequality: the two scopes must be different strings so
    // rateLimitedAction creates separate Upstash bucket keys.
    expect(RATE_LIMIT_SCOPES.MINT_INVITE).not.toBe(
      RATE_LIMIT_SCOPES.ACCEPT_INVITE,
    );
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

  it("fails CLOSED when upstream returns success:true with reason:'timeout' (#138 H1)", async () => {
    // `@upstash/ratelimit` wraps every limit() call in a 5s timeout that
    // resolves `{success: true, reason: "timeout"}` if Upstash is
    // unreachable. Treating that as allow is a silent bypass during
    // Upstash outages — call sites must promote it to a deny.
    __setLimiterForTest({
      limit: vi.fn().mockResolvedValue({
        success: true,
        limit: 30,
        remaining: 0,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
        reason: "timeout",
      }),
    });
    const fn = vi.fn();
    await expect(
      rateLimitedAction(RATE_LIMIT_SCOPES.AUTH_OTP_VERIFY, "u", fn),
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
    // /profile is not in GUARDED_PATH_PATTERNS — use it as the example.
    // Note: /login IS now guarded (M5/PR2 added it), so we can't use that here.
    const req = makeReq("http://localhost/profile", { method: "POST" });
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

  it("returns a 429 when upstream returns success:true with reason:'timeout' (#138 H1)", async () => {
    // Mirror of the rateLimitedAction test — the HTTP-edge guard must
    // also promote timeout-allow to deny so /api/, /trips/, /invite/
    // don't silently bypass during Upstash outages.
    __setLimiterForTest({
      limit: vi.fn().mockResolvedValue({
        success: true,
        limit: 30,
        remaining: 0,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
        reason: "timeout",
      }),
    });
    const req = makeReq("http://localhost/api/webhooks/foo", {
      method: "POST",
      headers: { "x-forwarded-for": "3.3.3.3" },
    });
    const res = await rateLimitRequest(req);
    expect(res?.status).toBe(429);
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

describe("production-mode in-memory shim (#130)", () => {
  // Pins the post-#125 contract: when Upstash creds are absent in
  // production, the limiter is allow-with-warning (NOT fail-closed).
  // PR #125 fixed the production bricking; this test pins it so a
  // future refactor can't silently flip the posture back.
  //
  // Strategy: stub `NODE_ENV=production`, ensure Upstash env is empty,
  // reset the module cache, dynamically re-import. The module reads
  // `process.env.NODE_ENV` inside `buildInMemoryLimiter` so the stub
  // must be set BEFORE the dynamic import resolves.

  const SAVED_ENV: Record<string, string | undefined> = {};
  const RELEVANT_KEYS = [
    "NODE_ENV",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];

  beforeEach(() => {
    for (const key of RELEVANT_KEYS) {
      SAVED_ENV[key] = process.env[key];
    }
    // The test-only seam at the top of this file calls
    // `__setLimiterForTest(null)` in the file-wide afterEach — that
    // resets the module-cached limiter. Re-importing the module here
    // would also work; we use vi.stubEnv + resetModules + dynamic
    // import for clean isolation.
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    for (const key of RELEVANT_KEYS) {
      const v = SAVED_ENV[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rateLimitedAction returns the wrapped fn result without throwing", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { rateLimitedAction: fresh, RATE_LIMIT_SCOPES: SCOPES } =
      await import("@/lib/rate-limit");
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await fresh(SCOPES.AUTH_OTP_VERIFY, "user-1", fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    // The warning fires once per process boot — we expect it at least
    // once across the call, never zero.
    expect(consoleErrorSpy).toHaveBeenCalled();
    const msg = consoleErrorSpy.mock.calls[0]?.[0] as string;
    expect(msg).toMatch(/Upstash creds unset in production/);
    consoleErrorSpy.mockRestore();
  });

  it("warns only once across repeated calls (warned-flag latches)", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { rateLimitedAction: fresh, RATE_LIMIT_SCOPES: SCOPES } =
      await import("@/lib/rate-limit");
    const fn = vi.fn().mockResolvedValue("ok");

    await fresh(SCOPES.AUTH_OTP_VERIFY, "user-1", fn);
    await fresh(SCOPES.AUTH_OTP_VERIFY, "user-1", fn);
    await fresh(SCOPES.CREATE_TRIP, "user-1", fn);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it("rateLimitRequest passes the request through (no 429) without throwing", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { rateLimitRequest: fresh } = await import("@/lib/rate-limit");
    const req = makeReq("http://localhost/login", {
      method: "POST",
      headers: { "x-forwarded-for": "10.10.10.10" },
    });
    const res = await fresh(req);
    // Allow-with-warning: no 429 surfaced.
    expect(res).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});
