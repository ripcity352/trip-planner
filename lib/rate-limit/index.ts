/**
 * Rate-limit seam for the trip-planner app (issue #68c).
 *
 * Two surfaces share one limiter:
 *
 *   1. `rateLimitRequest(req)` — HTTP-level guard composed in `middleware.ts`
 *      that 429s mutation-like requests before they reach a server action.
 *   2. `rateLimitedAction(scope, key, fn)` — server-action wrapper used by
 *      `createTrip`, `acceptInvite`, etc. Throws `RateLimitError` instead of
 *      returning an HTTP response so callers can surface a friendly toast.
 *
 * Upstash Redis is configured via `UPSTASH_REDIS_REST_URL` +
 * `UPSTASH_REDIS_REST_TOKEN`. When BOTH are present we wire the real
 * limiter. When either is missing:
 *
 *   - In dev / test (`NODE_ENV !== "production"`) we fall back to an
 *     in-memory shim that always allows. This keeps `pnpm build` green
 *     without secrets and lets unit tests run without network.
 *   - In production we still build the same shim at import time (so the
 *     deploy doesn't crash on cold-start), but every `.limit()` call
 *     FAILS CLOSED — `success: false`. The deploy will then surface
 *     rate-limit errors on every guarded path, which is the loud
 *     signal we want: "rate limit creds are missing from the env."
 *
 * Importing this module must never throw.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Subset of `@upstash/ratelimit`'s `RatelimitResponse` we depend on. The
 * upstream type isn't exported, so we mirror only the fields we touch
 * (success / limit / remaining / reset / pending). Keeping this local
 * also lets the in-memory shim satisfy the contract without pulling in
 * upstream's private types.
 */
interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending: Promise<unknown>;
}

// --- config ------------------------------------------------------------

/**
 * Default budget: 30 requests / 60s per identifier per scope. Generous
 * enough that a real user double-tapping in a flaky cell signal never
 * hits it; tight enough that a misbehaving client gets capped fast.
 */
const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW = "60 s" as const;

/** Sentinel for unknown clients (no IP header at all — typically tests). */
const ANON_CLIENT_ID = "anon";

/**
 * Scopes the action wrapper accepts. Keep this list narrow on purpose:
 * unrecognized scopes are rejected at the type level so callers can't
 * silently typo a new bucket into existence.
 *
 * `AUTH_MAGIC_LINK` (#102 fix-up) covers the `/login` server action and
 * shares the default budget (30 / 60s). The default is generous for an
 * auth-issuance endpoint; before production we should ratchet this
 * down to ~5 / hour by introducing a per-scope budget map. Tracking as
 * a follow-up: the surgical fix here keeps the seam in place without
 * rebuilding the limiter config surface.
 */
export const RATE_LIMIT_SCOPES = {
  CREATE_TRIP: "createTrip",
  ACCEPT_INVITE: "acceptInvite",
  AUTH_MAGIC_LINK: "authMagicLink",
} as const;

export type RateLimitScope =
  (typeof RATE_LIMIT_SCOPES)[keyof typeof RATE_LIMIT_SCOPES];

/** Mutation-like HTTP methods we guard at the edge. */
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Path matchers for mutation-like routes. We only guard server actions
 * and API endpoints; static assets and GET pages are skipped.
 */
const GUARDED_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/api\//,
  /^\/trips(\/|$)/,
  // `/invite/<token>/accept` is a public POST endpoint — unauthenticated
  // abuse needs the HTTP-edge throttle before it reaches the action.
  /^\/invite\//,
];

// --- error -------------------------------------------------------------

/**
 * Thrown by `rateLimitedAction` when the caller exceeds its budget.
 * Server actions can catch this and translate to a user-facing toast.
 */
export class RateLimitError extends Error {
  readonly scope: string;
  readonly reset: number;
  readonly remaining: number;

  constructor(scope: string, response: Pick<RateLimitResult, "reset" | "remaining">) {
    super(`Rate limit exceeded for scope "${scope}"`);
    this.name = "RateLimitError";
    this.scope = scope;
    this.reset = response.reset;
    this.remaining = response.remaining;
  }
}

// --- limiter (lazy) ----------------------------------------------------

/**
 * Lazy singleton. Module import must never touch process.env beyond a
 * tag-check, and must never construct a Redis client at load time —
 * otherwise importing this file in a test (where env vars are unset)
 * would crash the suite.
 */
let cachedLimiter: Ratelimit | InMemoryLimiter | null = null;

/**
 * Minimal in-memory shim that always allows. Used when Upstash env vars
 * are absent (local dev, CI, tests). We deliberately do NOT implement a
 * real in-memory counter here because:
 *   - Next.js middleware can be hot-reloaded, blowing away counters
 *   - Multi-instance prod deployments need shared state anyway (that's
 *     what Upstash is for)
 * In tests that want to assert "limit was hit", `rateLimitedAction` is
 * exercised against an injected mock instead.
 */
interface InMemoryLimiter {
  readonly limit: (identifier: string) => Promise<RateLimitResult>;
}

function buildInMemoryLimiter(): InMemoryLimiter {
  // Fail-closed in production: if we got here without Upstash creds,
  // the deploy is misconfigured. We deliberately don't crash imports
  // (that would brick cold-starts on every request); instead each call
  // returns `success: false` so guarded paths 429 visibly until the
  // operator fixes the env vars. Dev / test still get the always-allow
  // path so local work and CI don't need real creds.
  const failClosed = process.env.NODE_ENV === "production";
  return {
    limit: async (): Promise<RateLimitResult> => ({
      success: !failClosed,
      limit: DEFAULT_LIMIT,
      remaining: failClosed ? 0 : DEFAULT_LIMIT,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  };
}

function buildUpstashLimiter(url: string, token: string): Ratelimit {
  const redis = new Redis({ url, token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(DEFAULT_LIMIT, DEFAULT_WINDOW),
    analytics: false,
    prefix: "trip-planner/rl",
  });
}

function getLimiter(): Ratelimit | InMemoryLimiter {
  if (cachedLimiter) return cachedLimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  cachedLimiter =
    url && token ? buildUpstashLimiter(url, token) : buildInMemoryLimiter();
  return cachedLimiter;
}

/**
 * Test-only: replace the cached limiter with an injected double. Not
 * exported through the public surface (`@/lib/rate-limit`) of the app;
 * tests import this name directly.
 */
export function __setLimiterForTest(
  limiter: Pick<Ratelimit, "limit"> | null,
): void {
  cachedLimiter = limiter as Ratelimit | null;
}

// --- public API --------------------------------------------------------

/**
 * Derives a stable client identifier from request headers. Prefers
 * `x-forwarded-for` (the first hop, which is the real client when behind
 * Vercel's edge). Falls back to `x-real-ip`, then a literal sentinel so
 * a missing header doesn't crash callers.
 *
 * Note: `NextRequest#ip` was removed in Next.js 16, so we read headers
 * directly instead of `request.ip ?? ...`.
 */
export function getClientId(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can be "client, proxy1, proxy2" — take the first.
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return ANON_CLIENT_ID;
}

/**
 * Server-action wrapper. Each (scope, key) tuple gets its own bucket so
 * a user spamming `createTrip` doesn't starve their `acceptInvite`
 * budget. `key` is typically the user's id (preferred) or their client
 * id (fallback for unauthed flows).
 */
export async function rateLimitedAction<T>(
  scope: RateLimitScope,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const limiter = getLimiter();
  const identifier = `${scope}:${key}`;
  const result = await limiter.limit(identifier);
  if (!result.success) {
    throw new RateLimitError(scope, result);
  }
  return fn();
}

/**
 * HTTP-level guard for `middleware.ts`. Returns a 429 `NextResponse`
 * when the request should be blocked, or `null` to pass through to the
 * next middleware (Supabase session refresh).
 *
 * Skipped:
 *   - Non-mutation methods (GET, HEAD, OPTIONS) — reads are cheap and
 *     not the abuse vector we're worried about
 *   - Paths outside `GUARDED_PATH_PATTERNS`
 */
export async function rateLimitRequest(
  req: NextRequest,
): Promise<NextResponse | null> {
  if (!MUTATION_METHODS.has(req.method)) return null;

  const pathname = new URL(req.url).pathname;
  const guarded = GUARDED_PATH_PATTERNS.some((re) => re.test(pathname));
  if (!guarded) return null;

  const limiter = getLimiter();
  const clientId = getClientId(req);
  const identifier = `http:${req.method}:${clientId}`;
  const result = await limiter.limit(identifier);

  if (result.success) return null;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000),
  );

  return new NextResponse(
    JSON.stringify({
      error: "rate_limited",
      message: "Slow down a sec — too many requests.",
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfterSeconds),
        "x-ratelimit-limit": String(result.limit),
        "x-ratelimit-remaining": String(result.remaining),
        "x-ratelimit-reset": String(result.reset),
      },
    },
  );
}
