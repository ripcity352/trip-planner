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
 * Provider-controlled hosts for the rate-limit Redis. `.upstash.io` covers
 * both direct Upstash and the Vercel-Marketplace Upstash integration;
 * `.kv.vercel-storage.com` covers Vercel-KV REST hosts specifically (bare
 * `.vercel-storage.com` also fronts Blob/Postgres, which we don't want).
 * An env-var write to any other host is refused so a leaked/hostile env
 * can't redirect the Bearer token to an attacker (#140).
 */
const ALLOWED_UPSTASH_HOST_SUFFIXES = [
  ".upstash.io",
  ".kv.vercel-storage.com",
] as const;

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
 * `AUTH_OTP_VERIFY` (#102 fix-up, renamed M5/PR1) covers the `/login`
 * server action. Per-scope budget (10 / 15 min per email) is set in
 * `SCOPE_BUDGETS` — see #141. AUTH_OTP_VERIFY covers both magic-link
 * URLs and 6-digit codes — both call verifyOtp.
 */
export const RATE_LIMIT_SCOPES = {
  CREATE_TRIP: "createTrip",
  ACCEPT_INVITE: "acceptInvite",
  AUTH_OTP_VERIFY: "authOtpVerify",
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
  // #372 — expenses MVP: logging spends is a high-tap dinner-table
  // surface; own bucket so a burst doesn't starve other budgets.
  // Fail-OPEN on shim (it's a ledger entry, not credential minting).
  ADD_EXPENSE: "addExpense",
  // #383 — correctable money: edit/delete mirror ADD_EXPENSE (own
  // bucket, fail-OPEN on shim, default 30/60s budget) so a burst of
  // corrections can't starve fresh logging or vice versa.
  UPDATE_EXPENSE: "updateExpense",
  DELETE_EXPENSE: "deleteExpense",
  // #389 — announcement reactions: a whole crew acking a post at once
  // is the highest-tap surface in the app; own bucket so a reaction
  // burst can't starve other budgets. Fail-OPEN on shim (it's an ack,
  // not credential minting). Default 30/60s budget.
  TOGGLE_REACTION: "toggleReaction",
  // #388 — day-scoped attendance: the /me day chips are a tap-toggle
  // surface (same drunk-double-tap profile as SET_RSVP). Own bucket so
  // a burst of day taps can't starve the RSVP budget or vice versa.
  // Default 30/60s; fail-OPEN on shim (attendance rows, not credentials).
  SET_MEMBER_DAY: "setMemberDay",
  // #386 — organizer member management (role flip + remove). One bucket
  // each so a burst of roster edits can't starve other budgets. Default
  // 30/60s is plenty for a human cleaning a roster. RLS gates WHO may
  // write and — as of #418 — WHAT (role values + seat protections via
  // WITH CHECK); the action layer mirrors it. NOT in FAIL_CLOSED_ON_SHIM — same
  // posture as the other authed trip mutations (a bootstrapping deploy
  // must not brick them).
  SET_MEMBER_ROLE: "setMemberRole",
  REMOVE_MEMBER: "removeMember",
  // #368 / #262 — self-service name + phone editing on /me. Own bucket
  // so a fumbled profile save can't starve roster-management budgets.
  // Default 30/60s; NOT in FAIL_CLOSED_ON_SHIM (identity strings on the
  // caller's own row, not credential minting). RLS pins WHO (own row
  // only) and keeps role/is_celebrant immutable via the #418 WITH CHECK.
  UPDATE_MY_PROFILE: "updateMyProfile",
  // Celebrant assignment — founder-only, at most a handful of taps per
  // trip lifetime, but it shares the roster-management posture: own
  // bucket, default 30/60s, NOT in FAIL_CLOSED_ON_SHIM (authed trip
  // mutation; a bootstrapping deploy must not brick it). The RPC itself
  // is naturally idempotent, so a rate-limited retry is always safe.
  SET_CELEBRANT: "setCelebrant",
  // M4 W0c — issue #166: server-side proxy to Google Places Autocomplete.
  // Isolated bucket so a burst of typeahead requests doesn't starve
  // other action budgets. 30 req / 60s matches the default; fail-CLOSED
  // on shim so the proxy can't be abused if Upstash is unconfigured.
  PLACES_AUTOCOMPLETE: "placesAutocomplete",
  // M5 PR2 — password sign-in and sign-up. Deliberately tighter than
  // the default (5 / 15 min) because brute-forcing a password requires
  // many rapid attempts. NOT in FAIL_CLOSED_ON_SHIM so bootstrapping
  // deploys (no Upstash yet) can still use the password form — consistent
  // with AUTH_OTP_VERIFY precedent.
  AUTH_PASSWORD: "authPassword",
  // M5 PR4 — /account/sign-in-and-security password rotation. Same
  // tighter budget as AUTH_PASSWORD (5 / 15 min) to blunt any attempt
  // to cycle through passwords. NOT in FAIL_CLOSED_ON_SHIM — matches
  // AUTH_PASSWORD precedent so a bootstrapping deploy isn't bricked.
  AUTH_CHANGE_PASSWORD: "authChangePassword",
  // #390 — generic poll primitive. CREATE_POLL is the organizer composer
  // (low-tap; default budget is plenty). CAST_POLL_VOTE mirrors
  // CAST_DATE_VOTE: a high-tap surface (drunk user reconsidering on bad
  // signal) isolated so vote spam can't starve other budgets. Both
  // fail-OPEN on shim (votes aren't credential minting).
  CREATE_POLL: "createPoll",
  CAST_POLL_VOTE: "castPollVote",
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
  // OTP verify: 10 attempts per 15 minutes per email (#141). Tight enough
  // to blunt online brute-force of OTP codes; loose enough that a real
  // user checking their inbox a few times doesn't hit the cap.
  // NOT in FAIL_CLOSED_ON_SHIM — the email-OTP factor still needs inbox
  // access, so a bootstrapping deploy must not be bricked (#139).
  [RATE_LIMIT_SCOPES.AUTH_OTP_VERIFY]: { limit: 10, window: "15 m" },
  [RATE_LIMIT_SCOPES.MINT_INVITE]: { limit: 10, window: "1 h" },
  [RATE_LIMIT_SCOPES.PLACES_AUTOCOMPLETE]: { limit: 30, window: "60 s" },
  // Password auth: 5 attempts per 15 minutes per email. Tight enough
  // to blunt online brute-force; loose enough that a real user with
  // fat fingers never hits it (5 bad attempts in 15 min is unusual).
  [RATE_LIMIT_SCOPES.AUTH_PASSWORD]: { limit: 5, window: "15 m" },
  // Password rotation: 5 attempts / 15 min per user-id. Same rationale
  // as AUTH_PASSWORD — brute-forcing an authenticated rotation requires
  // the same tight window.
  [RATE_LIMIT_SCOPES.AUTH_CHANGE_PASSWORD]: { limit: 5, window: "15 m" },
} as const;

/**
 * Scopes that must DENY when the in-memory shim is active (no Upstash creds).
 *
 * Rationale: `MINT_INVITE` and `PLACES_AUTOCOMPLETE` are sensitive enough
 * that an unconfigured deployment (shim active) should fail-closed rather
 * than silently allow. Contrast with `AUTH_OTP_VERIFY` and `ACCEPT_INVITE`
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
  // M5 PR2 — password sign-in / sign-up POST and auth callback are now
  // mutation-class paths that need the HTTP-edge throttle. The action-
  // level AUTH_PASSWORD scope is the primary defence; the path pattern
  // here is a belt-and-suspenders guard at the edge.
  /^\/login(\/|$)/,
  /^\/auth\//,
  // M5 PR4 — /account/* is an authed mutation surface (password rotation).
  // HTTP-edge throttle mirrors the pattern for /trips/*.
  /^\/account\//,
];

// --- error -------------------------------------------------------------

/**
 * Why a denial happened (#397). The distinction matters for the user-facing
 * copy, NOT for the posture (both deny):
 *
 *   - `budget_exceeded`: a genuine throttle (or fail-closed Upstash
 *     timeout) — transient, retrying later can succeed.
 *   - `shim_fail_closed`: the scope is in `FAIL_CLOSED_ON_SHIM` and Upstash
 *     is unconfigured — a deployment config gap; retrying can NEVER succeed
 *     until env vars change, so the UI must not suggest "try again".
 */
export type RateLimitDenialReason = "budget_exceeded" | "shim_fail_closed";

/**
 * Thrown by `rateLimitedAction` when the caller exceeds its budget.
 * Server actions can catch this and translate to a user-facing toast;
 * `reason` tells them WHICH toast (transient throttle vs config gap).
 */
export class RateLimitError extends Error {
  readonly scope: string;
  readonly reset: number;
  readonly remaining: number;
  readonly reason: RateLimitDenialReason;

  constructor(
    scope: string,
    response: Pick<RateLimitResult, "reset" | "remaining">,
    reason: RateLimitDenialReason = "budget_exceeded",
  ) {
    super(`Rate limit exceeded for scope "${scope}" (${reason})`);
    this.name = "RateLimitError";
    this.scope = scope;
    this.reset = response.reset;
    this.remaining = response.remaining;
    this.reason = reason;
  }
}

// --- limiter (lazy) ----------------------------------------------------

/**
 * Lazy per-scope cache. Module import must never touch process.env
 * beyond a tag-check, and must never construct a Redis client at load
 * time — otherwise importing this file in a test (where env vars are
 * unset) would crash the suite.
 *
 * Keyed by scope so each `SCOPE_BUDGETS` entry gets its own Ratelimit
 * instance with the right `slidingWindow(limit, window)` config. Scopes
 * not in `SCOPE_BUDGETS` share the default-budget instance keyed under
 * `DEFAULT_LIMITER_KEY`. Without per-scope keying, `MINT_INVITE`'s
 * 10/hour budget never reaches Upstash and silently inherits 30/60s —
 * the W0c code-review HIGH.
 */
const DEFAULT_LIMITER_KEY = "__default__";
const cachedLimiters = new Map<
  RateLimitScope | typeof DEFAULT_LIMITER_KEY,
  Ratelimit | InMemoryLimiter
>();
/**
 * Test override limiter — when set, takes precedence over `cachedLimiters`
 * for all scopes. Cleared via `__setLimiterForTest(null)`.
 */
let testOverrideLimiter: Ratelimit | InMemoryLimiter | null = null;

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

function buildUpstashLimiter(
  url: string,
  token: string,
  scope?: RateLimitScope,
): Ratelimit {
  const redis = new Redis({ url, token });
  const budget = scope ? SCOPE_BUDGETS[scope] : undefined;
  const limit = budget?.limit ?? DEFAULT_LIMIT;
  const window = (budget?.window ?? DEFAULT_WINDOW) as Parameters<
    typeof Ratelimit.slidingWindow
  >[1];
  // Prefix per scope so different budgets don't share a counter bucket
  // (an organizer's MINT_INVITE state and a member's SET_RSVP state are
  // already keyed by `${scope}:${userId}` at call sites, but distinct
  // prefixes also keep Upstash analytics readable).
  const prefix = scope ? `trip-planner/rl/${scope}` : "trip-planner/rl";
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
    prefix,
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

function getLimiter(
  scope?: RateLimitScope,
): Ratelimit | InMemoryLimiter {
  if (testOverrideLimiter) return testOverrideLimiter;

  // Scopes WITHOUT a custom budget share the default-keyed limiter.
  // Scopes WITH a budget get their own keyed limiter so the
  // `slidingWindow(limit, window)` config actually takes effect.
  const cacheKey: RateLimitScope | typeof DEFAULT_LIMITER_KEY =
    scope && SCOPE_BUDGETS[scope] ? scope : DEFAULT_LIMITER_KEY;

  const existing = cachedLimiters.get(cacheKey);
  if (existing) return existing;

  const creds = __resolveUpstashCreds(process.env);
  const limiter = creds
    ? buildUpstashLimiter(
        creds.url,
        creds.token,
        cacheKey === DEFAULT_LIMITER_KEY ? undefined : cacheKey,
      )
    : buildInMemoryLimiter();
  cachedLimiters.set(cacheKey, limiter);
  return limiter;
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

  // Hostname allow-list (#140): refuse any URL whose host is not a known
  // provider-controlled suffix. These creds are consumed at limiter
  // CONSTRUCTION (cached in getLimiter), so a hostile env-var write would
  // otherwise forward the Bearer token to an attacker the moment the
  // limiter is first built.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.error(
      "[rate-limit][SECURITY] refusing malformed Upstash URL",
      { url },
    );
    return null;
  }

  // Require HTTPS: a hostile env writer could downgrade https→http and
  // expose the Bearer token to a network MITM even on a valid host.
  if (parsed.protocol !== "https:") {
    console.error(
      "[rate-limit][SECURITY] refusing non-HTTPS Upstash URL",
      { protocol: parsed.protocol },
    );
    return null;
  }

  const hostname = parsed.hostname;
  const allowed = ALLOWED_UPSTASH_HOST_SUFFIXES.some((suffix) =>
    hostname.endsWith(suffix),
  );
  if (!allowed) {
    console.error(
      "[rate-limit][SECURITY] refusing Upstash URL with disallowed host",
      { hostname },
    );
    return null;
  }

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
  testOverrideLimiter = limiter as Ratelimit | null;
  if (limiter === null) {
    // Clear scope-keyed cache too so the next getLimiter() rebuilds
    // (otherwise back-to-back tests would share an old shim instance).
    cachedLimiters.clear();
  }
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
  const limiter = getLimiter(scope);
  const identifier = `${scope}:${key}`;
  const result = await limiter.limit(identifier);

  // Fail-closed: scopes in FAIL_CLOSED_ON_SHIM are denied when the shim
  // is active (Upstash is unconfigured). The shim would otherwise allow,
  // which is the correct bootstrap posture for auth and invite acceptance
  // but NOT for MINT_INVITE or PLACES_AUTOCOMPLETE where an unconfigured
  // deployment must not silently open an abuse surface.
  if (isInMemoryShim(limiter) && FAIL_CLOSED_ON_SHIM.has(scope)) {
    // #397: tag the denial as a config gap, not a throttle, so the action
    // layer can surface "this deployment isn't configured" instead of the
    // transient "give it a sec" copy. The deny itself is unchanged.
    throw new RateLimitError(
      scope,
      { remaining: 0, reset: Date.now() + 60_000 },
      "shim_fail_closed",
    );
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
