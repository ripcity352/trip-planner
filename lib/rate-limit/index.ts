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
 * Upstash Redis credentials are read via `__resolveUpstashCreds`, which
 * accepts either naming scheme (Vercel Marketplace's `KV_REST_API_*`
 * takes precedence over the legacy `UPSTASH_REDIS_REST_*`; see #124).
 * When BOTH a URL and token are present we wire the real limiter. When
 * either is missing we fall back to the in-memory shim documented at
 * `buildInMemoryLimiter`.
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
  /**
   * Upstream `@upstash/ratelimit` sets `reason: "timeout"` on a synthetic
   * `success: true` response when the Redis call exceeds the configured
   * timeout. Treat as **fail-closed** at every call site — silently
   * allowing during an Upstash outage is a rate-limit bypass. Typed as
   * `string` rather than a literal union so we stay compatible with
   * upstream's future enum additions (e.g., `"cacheBlock"`).
   */
  reason?: string;
}

/** Promote a successful-but-timeout response to a deny. See `reason` above. */
function isTimeoutAllow(result: RateLimitResult): boolean {
  return result.success && result.reason === "timeout";
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
  // `setRsvp` (#74) gets its own bucket so a user spamming RSVP taps
  // doesn't starve their `createTrip` / `acceptInvite` budget. Default
  // 30/60s is generous for the drunk-double-tap pattern.
  SET_RSVP: "setRsvp",
  // `castDateVote` (#75 / #76 — Wave 3) gets its own bucket. PulsePoll
  // is a high-tap surface (drunk user reconsidering on bad signal) and
  // we want it isolated from RSVP / createTrip budgets.
  CAST_DATE_VOTE: "castDateVote",
  // M3 Wave 1 scopes — one bucket per action surface so a user
  // spamming one path doesn't starve the others. All default to
  // 30/60s sliding window per notes/m3-execution-plan.md Appendix A.3.
  CREATE_ITINERARY_ITEM: "createItineraryItem",
  POST_ANNOUNCEMENT: "postAnnouncement",
  UPDATE_TRIP_NOTES: "updateTripNotes",
  SET_ITEM_RSVP: "setItemRsvp",
  SET_ITEM_FLAG: "setItemFlag",
  UPSERT_TRAVEL_LEG: "upsertTravelLeg",
  ASSIGN_LODGING: "assignLodging",
  // M3 Wave 4c — issue #107: minting invite links now has its own bucket
  // separate from `ACCEPT_INVITE` so a burst of organizer mints cannot
  // starve a member's accept attempt (or vice versa). Both paths default
  // to the standard 30 req / 60s sliding window.
  MINT_INVITE: "mintInvite",
  // M4 W0c — issue #166: server-side proxy to Google Places Autocomplete.
  // Isolated bucket so a burst of typeahead requests doesn't starve
  // other action budgets. 30 req / 60s matches the default; fail-CLOSED
  // on shim so the proxy can't be abused if Upstash is unconfigured.
  PLACES_AUTOCOMPLETE: "placesAutocomplete",
} as const;

export type RateLimitScope =
  (typeof RATE_LIMIT_SCOPES)[keyof typeof RATE_LIMIT_SCOPES];

/**
 * Per-scope budget overrides. Scopes not listed here inherit the module-level
 * defaults (`DEFAULT_LIMIT` / `DEFAULT_WINDOW`). Kept as a plain record so
 * tests can assert on it without importing Upstash types.
 *
 * Exported so the deployment-readiness tooling and tests can verify budgets
 * without instantiating a real Ratelimit instance.
 */
export const SCOPE_BUDGETS: Readonly<
  Partial<Record<RateLimitScope, { limit: number; window: string }>>
> = {
  [RATE_LIMIT_SCOPES.MINT_INVITE]: { limit: 10, window: "1 h" },
  [RATE_LIMIT_SCOPES.PLACES_AUTOCOMPLETE]: { limit: 30, window: "60 s" },
} as const;

/**
 * Scopes that must DENY when the in-memory shim is active (no Upstash creds).
 *
 * Rationale: `MINT_INVITE` and `PLACES_AUTOCOMPLETE` are sensitive enough
 * that an unconfigured deployment (shim active) should fail-closed rather
 * than silently allow. Contrast with `AUTH_MAGIC_LINK` and `ACCEPT_INVITE`
 * which keep the allow-with-warning posture so a bootstrapping deployment
 * doesn't brick login or invite acceptance.
 *
 * Exported so tests can assert membership without white-boxing the shim.
 */
export const FAIL_CLOSED_ON_SHIM: ReadonlySet<RateLimitScope> = new Set<RateLimitScope>([
  RATE_LIMIT_SCOPES.MINT_INVITE,
  RATE_LIMIT_SCOPES.PLACES_AUTOCOMPLETE,
]);

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
 * Minimal in-memory shim that always allows (or denies for fail-closed
 * scopes). Used when Upstash env vars are absent (local dev, CI, tests).
 * We deliberately do NOT implement a real in-memory counter here because:
 *   - Next.js middleware can be hot-reloaded, blowing away counters
 *   - Multi-instance prod deployments need shared state anyway (that's
 *     what Upstash is for)
 * In tests that want to assert "limit was hit", `rateLimitedAction` is
 * exercised against an injected mock instead.
 *
 * The `isShim` marker lets call sites detect that they're running against
 * the shim so they can apply fail-closed logic for sensitive scopes.
 */
interface InMemoryLimiter {
  readonly limit: (identifier: string) => Promise<RateLimitResult>;
  /** Marker: true only on the in-memory shim, never on a real Ratelimit. */
  readonly isShim: true;
}

function buildInMemoryLimiter(): InMemoryLimiter {
  // History on this shim:
  //   v1: always-allow (any env)
  //   v2: fail-closed in production (PR #105 security finding) — correct
  //       in spirit, wrong in practice during bootstrap. Production-
  //       without-real-users-yet (MVP) has no Upstash provisioned and
  //       fail-closed bricks magic-link login.
  //   v3: allow-with-loud-warning when Upstash is unconfigured,
  //       regardless of NODE_ENV. The warning routes through Sentry via
  //       console.error and tracks via the follow-up issue.
  //   v4 (this): #124 closed — Upstash for Redis is now provisioned via
  //       the Vercel Marketplace, injected as `KV_REST_API_URL` +
  //       `KV_REST_API_TOKEN`. This shim is therefore the *exception
  //       path* in production: if it fires, it means either an env-var
  //       regression on Vercel or a fresh fork running with no creds.
  //       The warning stays loud so a future regression is caught
  //       immediately. When Upstash IS configured but transiently
  //       fails, the upstream `Ratelimit` throws and the caller catches
  //       as a `RateLimitError` — that path is still fail-closed
  //       (correct).
  const isProd = process.env.NODE_ENV === "production";
  let warned = false;
  return {
    isShim: true as const,
    limit: async (): Promise<RateLimitResult> => {
      if (isProd && !warned) {
        warned = true;
        // Sentry picks this up. Once per process boot.
        console.error(
          "[rate-limit] Upstash creds unset in production — limiter is " +
            "ALWAYS-ALLOW. This is acceptable only during bootstrap " +
            "(no real users yet). Provision Upstash and set " +
            "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN before " +
            "sending the invite link to real attendees."
        );
      }
      return {
        success: true,
        limit: DEFAULT_LIMIT,
        remaining: DEFAULT_LIMIT,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      };
    },
  };
}

function buildUpstashLimiter(url: string, token: string): Ratelimit {
  const redis = new Redis({ url, token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(DEFAULT_LIMIT, DEFAULT_WINDOW),
    analytics: false,
    prefix: "trip-planner/rl",
    // Tighter than the upstream 5s default — Upstash p99 is well under
    // 1s, so 1500ms is a generous ceiling that still keeps end-user
    // latency bounded during a slow Redis. On timeout the upstream
    // returns `{success: true, reason: "timeout"}`; both call sites
    // check `isTimeoutAllow` and promote to a deny so we fail closed.
    timeout: 1500,
  });
}

/** Type-guard: returns true only when the limiter is the in-memory shim. */
function isInMemoryShim(
  limiter: Ratelimit | InMemoryLimiter,
): limiter is InMemoryLimiter {
  return (limiter as InMemoryLimiter).isShim === true;
}

function getLimiter(): Ratelimit | InMemoryLimiter {
  if (cachedLimiter) return cachedLimiter;

  const creds = __resolveUpstashCreds(process.env);

  cachedLimiter = creds
    ? buildUpstashLimiter(creds.url, creds.token)
    : buildInMemoryLimiter();
  return cachedLimiter;
}

/**
 * Resolves Upstash REST creds from the environment, accepting both the
 * Vercel-Marketplace naming (`KV_REST_API_URL` / `KV_REST_API_TOKEN`,
 * auto-injected by the "Upstash for Redis" integration since #124) and
 * the legacy direct-Upstash naming (`UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN`, still used in `.env.local` for devs who
 * provisioned outside the Marketplace).
 *
 * Precedence: `KV_*` wins when both pairs are present. The production
 * deploy is the source of truth, and Vercel always populates the `KV_*`
 * pair from the Marketplace install — a stray `UPSTASH_*` left behind
 * in an older env file must not shadow it.
 *
 * Returns `null` if either half (url or token) is missing — half-config
 * is broken-config, and the in-memory shim's loud warning is the
 * correct signal.
 *
 * Exported with the `__` prefix to mark it as test-surface; consumers
 * should use `rateLimitedAction` / `rateLimitRequest` instead.
 */
export function __resolveUpstashCreds(
  env: Readonly<Record<string, string | undefined>>,
): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
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

  // Fail-closed: scopes in FAIL_CLOSED_ON_SHIM are denied when the shim
  // is active (Upstash is unconfigured). The shim would otherwise allow,
  // which is the correct bootstrap posture for auth and invite acceptance
  // but NOT for MINT_INVITE or PLACES_AUTOCOMPLETE where an unconfigured
  // deployment must not silently open an abuse surface.
  if (isInMemoryShim(limiter) && FAIL_CLOSED_ON_SHIM.has(scope)) {
    throw new RateLimitError(scope, {
      remaining: 0,
      reset: Date.now() + 60_000,
    });
  }

  if (!result.success || isTimeoutAllow(result)) {
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

  if (result.success && !isTimeoutAllow(result)) return null;

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
