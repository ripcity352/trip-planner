/**
 * Tests for `lib/actions/date-poll.ts`.
 *
 * Three actions to exercise; one stretch action. We assert:
 *
 *   - validation_failed on bad input (uuid, dates, marks)
 *   - auth_failed when no user
 *   - rate_limit when the limiter throws
 *   - rls_denied on 42501
 *   - validation_failed on P0001 (the no-go trigger) — confirms the
 *     anti-enumeration mapping so a member can't probe celebrant marks
 *   - the propose action enforces the MAX_CANDIDATES_PER_TRIP cap
 *   - the vote action does NOT spoof trip_member_id — it looks up
 *     the caller's own id from trip_members
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks ----------------------------------------------------------

const getUserMock = vi.fn();
// resolver per table; reset per test
const tableResolvers = new Map<string, () => { data: unknown; error: unknown }>();
// captured insert / upsert payloads
const insertCalls: Array<{ table: string; payload: unknown }> = [];
const upsertCalls: Array<{ table: string; payload: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => buildClient()),
}));

const rateLimitedActionMock = vi.fn(
  async (_scope: string, _key: string, fn: () => Promise<unknown>) => fn()
);
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit"
  );
  return {
    ...actual,
    rateLimitedAction: (...args: unknown[]) =>
      rateLimitedActionMock(
        args[0] as string,
        args[1] as string,
        args[2] as () => Promise<unknown>
      ),
  };
});

function buildClient(): unknown {
  const tableProxy = (table: string): Record<string, unknown> => {
    // The fluent surface returns a single object whose methods all
    // return `proxy` so any chain compiles. Terminal awaits resolve
    // through the configured tableResolver.
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const resolver = tableResolvers.get(table);
        const result = resolver
          ? resolver()
          : { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "insert") {
          return (payload: unknown) => {
            insertCalls.push({ table, payload });
            return proxy;
          };
        }
        if (prop === "upsert") {
          return (payload: unknown) => {
            upsertCalls.push({ table, payload });
            return proxy;
          };
        }
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };

  return {
    auth: { getUser: getUserMock },
    from: vi.fn((table: string) => tableProxy(table)),
  };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_CANDIDATE_ID = "22222222-2222-4222-8222-222222222222";
const VALID_IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const VALID_MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";

describe("proposeDateCandidatesAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    upsertCalls.length = 0;
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("validation_failed on missing idempotency key", async () => {
    primeAuth(VALID_USER_ID);
    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-01", ends_on: "2026-06-02" },
        ],
      },
      "not-a-uuid"
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("validation_failed when ends_on < starts_on", async () => {
    primeAuth(VALID_USER_ID);
    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-02", ends_on: "2026-06-01" },
        ],
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("auth_failed when no user", async () => {
    primeAuth(null);
    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-01", ends_on: "2026-06-02" },
        ],
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("validation_failed when the cap would be exceeded", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: null,
      error: null,
      // The fluent builder is mocked but `count` would normally come
      // from the head:true call. We override the resolver to mimic
      // the supabase response shape by routing through the proxy's
      // count return — see implementation. For this test we hijack
      // the resolver so the action sees a 4-row count.
      count: 4,
    } as unknown as { data: unknown; error: unknown }));
    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-01", ends_on: "2026-06-02" },
        ],
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("happy path: inserts each candidate and returns count", async () => {
    primeAuth(VALID_USER_ID);
    let callCount = 0;
    tableResolvers.set("date_poll_candidates", () => {
      callCount += 1;
      if (callCount === 1) {
        // The COUNT pre-flight returns 0
        return {
          data: null,
          error: null,
          count: 0,
        } as unknown as { data: unknown; error: unknown };
      }
      // The INSERT + select returns the inserted rows.
      return {
        data: [{ id: "new-1" }, { id: "new-2" }],
        error: null,
      };
    });

    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-01", ends_on: "2026-06-02" },
          { label: "Y", starts_on: "2026-06-10", ends_on: "2026-06-12" },
        ],
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, created: 2 });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.table).toBe("date_poll_candidates");
  });

  it("rate_limit when limiter throws RateLimitError", async () => {
    primeAuth(VALID_USER_ID);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("createTrip", { remaining: 0, reset: 0 })
    );
    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-01", ends_on: "2026-06-02" },
        ],
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});

describe("setCelebrantMarkAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    upsertCalls.length = 0;
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("validation_failed on a bad mark value", async () => {
    primeAuth(VALID_USER_ID);
    const { setCelebrantMarkAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await setCelebrantMarkAction(
      // @ts-expect-error — deliberate
      { candidateId: VALID_CANDIDATE_ID, mark: "garbage" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("happy path: upserts the mark and returns it", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_celebrant_marks", () => ({
      data: null,
      error: null,
    }));
    const { setCelebrantMarkAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await setCelebrantMarkAction(
      { candidateId: VALID_CANDIDATE_ID, mark: "works" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, mark: "works" });
    expect(upsertCalls).toHaveLength(1);
    const payload = upsertCalls[0]?.payload as {
      candidate_id: string;
      mark: string;
    };
    expect(payload.candidate_id).toBe(VALID_CANDIDATE_ID);
    expect(payload.mark).toBe("works");
  });

  it("rls_denied on 42501", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_celebrant_marks", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const { setCelebrantMarkAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await setCelebrantMarkAction(
      { candidateId: VALID_CANDIDATE_ID, mark: "works" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});

describe("castDateVoteAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    upsertCalls.length = 0;
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("validation_failed on bad vote shape", async () => {
    primeAuth(VALID_USER_ID);
    const { castDateVoteAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await castDateVoteAction(
      // candidateId is a string — runtime zod guard rejects non-UUIDs.
      { candidateId: "not-a-uuid", vote: true },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rls_denied when the candidate lookup returns nothing", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: null,
      error: null,
    }));
    const { castDateVoteAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await castDateVoteAction(
      { candidateId: VALID_CANDIDATE_ID, vote: true },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("validation_failed when the trigger raises P0001 (vetoed candidate)", async () => {
    // Anti-enumeration: a member probing a vetoed candidate must NOT
    // see a distinct error key. P0001 collapses to validation_failed.
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: { trip_id: VALID_TRIP_ID },
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID },
      error: null,
    }));
    tableResolvers.set("date_poll_votes", () => ({
      data: null,
      error: { code: "P0001", message: "candidate is vetoed" },
    }));
    const { castDateVoteAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await castDateVoteAction(
      { candidateId: VALID_CANDIDATE_ID, vote: true },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("happy path: looks up the caller's trip_member_id and upserts the vote", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: { trip_id: VALID_TRIP_ID },
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID },
      error: null,
    }));
    tableResolvers.set("date_poll_votes", () => ({
      data: null,
      error: null,
    }));
    const { castDateVoteAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await castDateVoteAction(
      { candidateId: VALID_CANDIDATE_ID, vote: true },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, vote: true });
    expect(upsertCalls).toHaveLength(1);
    const payload = upsertCalls[0]?.payload as {
      candidate_id: string;
      trip_member_id: string;
      vote: boolean;
      idempotency_key: string;
    };
    expect(payload.candidate_id).toBe(VALID_CANDIDATE_ID);
    // CRITICAL: trip_member_id came from the trip_members lookup, NOT
    // the caller's input. This is the action-layer mirror of the RLS
    // WITH CHECK that makes vote stuffing structurally impossible.
    expect(payload.trip_member_id).toBe(VALID_MEMBER_ID);
    expect(payload.vote).toBe(true);
    expect(payload.idempotency_key).toBe(VALID_IDEMPOTENCY_KEY);
  });

  it("rate_limit when limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("castDateVote", { remaining: 0, reset: 0 })
    );
    const { castDateVoteAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await castDateVoteAction(
      { candidateId: VALID_CANDIDATE_ID, vote: true },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});
