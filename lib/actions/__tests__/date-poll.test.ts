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
 *   - F2/#110: every date-poll mutation action calls revalidatePath on
 *     success and never on a failure branch. castDateVoteAction was
 *     originally excluded ("already-optimistic vote UI") — #400
 *     overturned that: the optimistic chip covered the voter's chip,
 *     not the aggregate tally, which stayed frozen until reload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/cache revalidatePath for the F2/#110 assertions.
const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

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
    revalidatePathMock.mockReset();
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

  // F2 / #110 — the organizer/celebrant's own view must not depend on
  // the Realtime channel.
  it("calls revalidatePath on a successful propose (F2/#110)", async () => {
    primeAuth(VALID_USER_ID);
    let callCount = 0;
    tableResolvers.set("date_poll_candidates", () => {
      callCount += 1;
      if (callCount === 1) {
        return { data: null, error: null, count: 0 } as unknown as {
          data: unknown;
          error: unknown;
        };
      }
      return { data: [{ id: "new-1" }], error: null };
    });
    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-01", ends_on: "2026-06-02" },
        ],
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("does NOT call revalidatePath when the cap is exceeded (F2/#110)", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: null,
      error: null,
      count: 4,
    } as unknown as { data: unknown; error: unknown }));
    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-01", ends_on: "2026-06-02" },
        ],
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does NOT call revalidatePath when the rate limiter throws (F2/#110)", async () => {
    primeAuth(VALID_USER_ID);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("createTrip", { remaining: 0, reset: 0 })
    );
    const { proposeDateCandidatesAction } = await import(
      "@/lib/actions/date-poll"
    );
    await proposeDateCandidatesAction(
      {
        tripId: VALID_TRIP_ID,
        candidates: [
          { label: "X", starts_on: "2026-06-01", ends_on: "2026-06-02" },
        ],
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("setCelebrantMarkAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    upsertCalls.length = 0;
    rateLimitedActionMock.mockClear();
    revalidatePathMock.mockReset();
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

  // F2 / #110 — the celebrant's own view must not depend on Realtime.
  it("calls revalidatePath on a successful mark (F2/#110)", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_celebrant_marks", () => ({
      data: null,
      error: null,
    }));
    const { setCelebrantMarkAction } = await import(
      "@/lib/actions/date-poll"
    );
    await setCelebrantMarkAction(
      { candidateId: VALID_CANDIDATE_ID, mark: "works" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("does NOT call revalidatePath on rls_denied (F2/#110)", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_celebrant_marks", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const { setCelebrantMarkAction } = await import(
      "@/lib/actions/date-poll"
    );
    await setCelebrantMarkAction(
      { candidateId: VALID_CANDIDATE_ID, mark: "works" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does NOT call revalidatePath on validation_failed (F2/#110)", async () => {
    primeAuth(VALID_USER_ID);
    const { setCelebrantMarkAction } = await import(
      "@/lib/actions/date-poll"
    );
    await setCelebrantMarkAction(
      // @ts-expect-error — deliberate
      { candidateId: VALID_CANDIDATE_ID, mark: "garbage" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("castDateVoteAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    upsertCalls.length = 0;
    rateLimitedActionMock.mockClear();
    revalidatePathMock.mockReset();
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
    // F2 / #400 — castDateVoteAction joins the revalidatePath contract.
    // The optimistic chip only covers the voter's own chip; the
    // aggregate tally on the voter's page stayed frozen until a manual
    // reload, so the exclusion carved out by the original F2 pass is
    // overturned (see notes/decisions.md 2026-07-09 entry).
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("does NOT call revalidatePath on rls_denied (F2/#400)", async () => {
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
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does NOT call revalidatePath when the upsert fails (F2/#400)", async () => {
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
    expect(revalidatePathMock).not.toHaveBeenCalled();
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

describe("lockInCandidateAction", () => {
  // #369 wires the (previously phantom) lock-in action into /dates and
  // pulls it into the F2 revalidate contract. These tests pin the new
  // call path: a successful lock writes the trip window AND revalidates
  // so the organizer's own view swaps to the decided state; every
  // failure branch revalidates nothing.
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    upsertCalls.length = 0;
    rateLimitedActionMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const CANDIDATE_ROW = {
    trip_id: VALID_TRIP_ID,
    starts_on: "2026-07-29",
    ends_on: "2026-08-01",
  };
  const TRIP_ROW = {
    id: VALID_TRIP_ID,
    starts_at: "2026-07-29",
    ends_at: "2026-08-01",
  };

  it("validation_failed on a non-uuid candidateId (no revalidate)", async () => {
    primeAuth(VALID_USER_ID);
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    const result = await lockInCandidateAction("not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("auth_failed when there is no user (no revalidate)", async () => {
    primeAuth(null);
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    const result = await lockInCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rls_denied when the candidate lookup returns nothing (no revalidate)", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: null,
      error: null,
    }));
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    const result = await lockInCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rls_denied when the trips update returns nothing (no revalidate)", async () => {
    // A non-organizer's UPDATE is filtered out by RLS → zero rows back.
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: CANDIDATE_ROW,
      error: null,
    }));
    tableResolvers.set("trips", () => ({ data: null, error: null }));
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    const result = await lockInCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does NOT revalidate when the trips update errors", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: CANDIDATE_ROW,
      error: null,
    }));
    tableResolvers.set("trips", () => ({
      data: null,
      error: { code: "42501", message: "insufficient_privilege" },
    }));
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    const result = await lockInCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("happy path: returns the locked trip and revalidates (F2/#369)", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: CANDIDATE_ROW,
      error: null,
    }));
    tableResolvers.set("trips", () => ({ data: TRIP_ROW, error: null }));
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    const result = await lockInCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: true, trip: TRIP_ROW });
    // F2/#369: locking flips the page to the decided state — the actor's
    // own view must revalidate, not wait on a reload.
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });
});

describe("deleteDateCandidateAction (#481)", () => {
  // #481: candidate windows could never be edited or deleted. The RLS
  // policies ("candidates: organizers can delete") already existed —
  // this is action + UI only. Semantics per the DOGE review: delete is
  // only allowed while the window has no votes yet.
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    upsertCalls.length = 0;
    rateLimitedActionMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const CANDIDATE_ROW = { trip_id: VALID_TRIP_ID };
  const ORGANIZER_VIEWER = {
    id: VALID_MEMBER_ID,
    role: "organizer",
    is_celebrant: false,
    display_name: null,
    phone_e164: null,
    idempotency_key: null,
  };
  const ATTENDEE_VIEWER = {
    ...ORGANIZER_VIEWER,
    role: "attendee",
  };

  it("validation_failed on a non-uuid candidateId", async () => {
    primeAuth(VALID_USER_ID);
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction("not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("auth_failed when there is no user", async () => {
    primeAuth(null);
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rls_denied when the candidate lookup returns nothing", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: null,
      error: null,
    }));
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rls_denied when the caller is a member but not an organizer", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: CANDIDATE_ROW,
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: ATTENDEE_VIEWER,
      error: null,
    }));
    const voteResolver = vi.fn(() => ({ data: null, error: null, count: 0 }));
    tableResolvers.set(
      "date_poll_votes",
      voteResolver as unknown as () => { data: unknown; error: unknown }
    );
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    // Never even reached the vote-count check — the organizer gate
    // short-circuits first.
    expect(voteResolver).not.toHaveBeenCalled();
  });

  it("rls_denied when the caller isn't a member of the trip at all", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: CANDIDATE_ROW,
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: null,
      error: null,
    }));
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("date_candidate_has_votes when the window already has votes", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: CANDIDATE_ROW,
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: ORGANIZER_VIEWER,
      error: null,
    }));
    tableResolvers.set("date_poll_votes", () => ({
      data: null,
      error: null,
      count: 2,
    } as unknown as { data: unknown; error: unknown }));
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({
      ok: false,
      errorKey: "date_candidate_has_votes",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("date_candidate_has_mark when the window is unvoted but celebrant-marked (#495)", async () => {
    // #495: the vote guard alone let an organizer delete a window the
    // celebrant already marked — the mark cascade-deletes silently. This
    // is the RED case: zero votes, one mark, must still block.
    primeAuth(VALID_USER_ID);
    tableResolvers.set("date_poll_candidates", () => ({
      data: CANDIDATE_ROW,
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: ORGANIZER_VIEWER,
      error: null,
    }));
    tableResolvers.set("date_poll_votes", () => ({
      data: null,
      error: null,
      count: 0,
    } as unknown as { data: unknown; error: unknown }));
    const markResolver = vi.fn(() => ({ data: null, error: null, count: 1 }));
    tableResolvers.set(
      "date_poll_celebrant_marks",
      markResolver as unknown as () => { data: unknown; error: unknown }
    );
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({
      ok: false,
      errorKey: "date_candidate_has_mark",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("happy path: organizer deletes an unvoted, unmarked window and revalidates", async () => {
    primeAuth(VALID_USER_ID);
    let candidateCalls = 0;
    tableResolvers.set("date_poll_candidates", () => {
      candidateCalls += 1;
      // First call: the pre-flight select (trip_id lookup). Second
      // call: the DELETE itself, which reports how many rows matched.
      if (candidateCalls === 1) {
        return { data: CANDIDATE_ROW, error: null };
      }
      return { data: null, error: null, count: 1 } as unknown as {
        data: unknown;
        error: unknown;
      };
    });
    tableResolvers.set("trip_members", () => ({
      data: ORGANIZER_VIEWER,
      error: null,
    }));
    tableResolvers.set("date_poll_votes", () => ({
      data: null,
      error: null,
      count: 0,
    } as unknown as { data: unknown; error: unknown }));
    tableResolvers.set("date_poll_celebrant_marks", () => ({
      data: null,
      error: null,
      count: 0,
    } as unknown as { data: unknown; error: unknown }));
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("rls_denied when the delete matches no row (RLS filtered it out)", async () => {
    primeAuth(VALID_USER_ID);
    let candidateCalls = 0;
    tableResolvers.set("date_poll_candidates", () => {
      candidateCalls += 1;
      if (candidateCalls === 1) {
        return { data: CANDIDATE_ROW, error: null };
      }
      return { data: null, error: null, count: 0 } as unknown as {
        data: unknown;
        error: unknown;
      };
    });
    tableResolvers.set("trip_members", () => ({
      data: ORGANIZER_VIEWER,
      error: null,
    }));
    tableResolvers.set("date_poll_votes", () => ({
      data: null,
      error: null,
      count: 0,
    } as unknown as { data: unknown; error: unknown }));
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const result = await deleteDateCandidateAction(VALID_CANDIDATE_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
