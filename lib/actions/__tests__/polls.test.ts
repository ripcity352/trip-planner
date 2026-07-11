/**
 * Tests for `lib/actions/polls.ts` (#390 — generic poll primitive).
 *
 * Mirrors the date-poll action tests. We assert:
 *
 *   - validation_failed on bad input (uuid key, question, option count
 *     outside 2–4, malformed/past closes_on)
 *   - auth_failed when no user
 *   - rate_limit when the limiter throws
 *   - rls_denied on 42501 from the RPC / upsert
 *   - poll_visibility_self_hidden when a celebrant-organizer picks
 *     hide_from_celebrant (#384-class deterministic rejection)
 *   - poll_closed when voting after closes_on (date-only register)
 *   - the vote action does NOT trust a caller-supplied member id — it
 *     resolves the caller's own trip_members row (H1 pattern)
 *   - F2/#400: every mutation revalidates on success, never on failure
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const tableResolvers = new Map<
  string,
  () => { data: unknown; error: unknown }
>();
const upsertCalls: Array<{
  table: string;
  payload: unknown;
  options: unknown;
}> = [];

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
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const resolver = tableResolvers.get(table);
        const result = resolver ? resolver() : { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "upsert") {
          return (payload: unknown, options: unknown) => {
            upsertCalls.push({ table, payload, options });
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
    rpc: rpcMock,
  };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const POLL_ID = "22222222-2222-4222-8222-222222222222";
const OPTION_ID = "33333333-3333-4333-8333-333333333333";
const IDEM_KEY = "44444444-4444-4444-8444-444444444444";
const MEMBER_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "66666666-6666-4666-8666-666666666666";

// Import AFTER the mocks so module-level imports resolve to them.
import { castPollVoteAction, createPollAction } from "../polls";
import type { CreatePollInput } from "../polls";

function resetAll() {
  getUserMock.mockReset();
  rpcMock.mockReset();
  revalidatePathMock.mockReset();
  rateLimitedActionMock.mockClear();
  tableResolvers.clear();
  upsertCalls.length = 0;
}

const VALID_CREATE = {
  tripId: TRIP_ID,
  question: "Steakhouse or omakase?",
  options: ["Steakhouse", "Omakase"],
};

describe("createPollAction", () => {
  beforeEach(resetAll);

  it("rejects a non-uuid idempotency key", async () => {
    primeAuth(USER_ID);
    const result = await createPollAction(VALID_CREATE, "not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  const invalidInputs: Array<[CreatePollInput, string]> = [
    [{ ...VALID_CREATE, options: ["Only one"] }, "1 option"],
    [{ ...VALID_CREATE, options: ["a", "b", "c", "d", "e"] }, "5 options"],
    [{ ...VALID_CREATE, question: "" }, "empty question"],
    [{ ...VALID_CREATE, closesOn: "not-a-date" }, "malformed closes_on"],
    [{ ...VALID_CREATE, tripId: "nope" }, "bad trip id"],
    // "custom" visibility is rejected: no content_visibility_grants join
    // exists for polls, so can_see_content('custom') falls back to
    // is_trip_member — an illusion of restriction with none. The action
    // enum excludes it (the composer never offered it).
    [
      { ...VALID_CREATE, visibility: "custom" as never },
      "custom visibility (no grants join for polls)",
    ],
  ];
  it.each(invalidInputs)("rejects invalid input (case %#)", async (input) => {
    primeAuth(USER_ID);
    const result = await createPollAction(input, IDEM_KEY);
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects a closes_on in the past — a poll born closed", async () => {
    primeAuth(USER_ID);
    const result = await createPollAction(
      { ...VALID_CREATE, closesOn: "2020-01-01" },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns auth_failed when there is no user", async () => {
    primeAuth(null);
    const result = await createPollAction(VALID_CREATE, IDEM_KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("maps a limiter throw to rate_limit", async () => {
    primeAuth(USER_ID);
    const { RateLimitError } = await vi.importActual<
      typeof import("@/lib/rate-limit")
    >("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("createPoll", { remaining: 0, reset: 0 })
    );
    const result = await createPollAction(VALID_CREATE, IDEM_KEY);
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("rejects hide_from_celebrant when the caller IS the celebrant", async () => {
    primeAuth(USER_ID);
    rpcMock.mockImplementation(async (fn: string) =>
      fn === "is_trip_celebrant"
        ? { data: true, error: null }
        : { data: POLL_ID, error: null }
    );
    const result = await createPollAction(
      { ...VALID_CREATE, visibility: "hide_from_celebrant" },
      IDEM_KEY
    );
    expect(result).toEqual({
      ok: false,
      errorKey: "poll_visibility_self_hidden",
    });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "create_poll_with_options",
      expect.anything()
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("maps RPC 42501 to rls_denied without revalidating", async () => {
    primeAuth(USER_ID);
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    const result = await createPollAction(VALID_CREATE, IDEM_KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("creates via the atomic RPC and revalidates on success", async () => {
    primeAuth(USER_ID);
    rpcMock.mockResolvedValue({ data: POLL_ID, error: null });
    const result = await createPollAction(
      { ...VALID_CREATE, visibility: "everyone" },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: true, pollId: POLL_ID });
    expect(rpcMock).toHaveBeenCalledWith("create_poll_with_options", {
      p_trip_id: TRIP_ID,
      p_question: "Steakhouse or omakase?",
      p_visibility: "everyone",
      p_closes_on: null,
      p_idempotency_key: IDEM_KEY,
      p_options: ["Steakhouse", "Omakase"],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });
});

describe("castPollVoteAction", () => {
  beforeEach(resetAll);

  function primePollAndMember(closesOn: string | null) {
    tableResolvers.set("polls", () => ({
      data: { trip_id: TRIP_ID, closes_on: closesOn },
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: { id: MEMBER_ID },
      error: null,
    }));
  }

  it("rejects a non-uuid option id", async () => {
    primeAuth(USER_ID);
    const result = await castPollVoteAction(
      { pollId: POLL_ID, optionId: "nope" },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns auth_failed when there is no user", async () => {
    primeAuth(null);
    const result = await castPollVoteAction(
      { pollId: POLL_ID, optionId: OPTION_ID },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("returns rls_denied when the poll is invisible to the caller", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("polls", () => ({ data: null, error: null }));
    const result = await castPollVoteAction(
      { pollId: POLL_ID, optionId: OPTION_ID },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(upsertCalls).toHaveLength(0);
  });

  it("returns poll_closed once closes_on has passed", async () => {
    primeAuth(USER_ID);
    primePollAndMember("2020-01-01");
    const result = await castPollVoteAction(
      { pollId: POLL_ID, optionId: OPTION_ID },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "poll_closed" });
    expect(upsertCalls).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("upserts the caller's own member row — never a caller-supplied one", async () => {
    primeAuth(USER_ID);
    primePollAndMember(null);
    const result = await castPollVoteAction(
      { pollId: POLL_ID, optionId: OPTION_ID },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: true, optionId: OPTION_ID });
    expect(upsertCalls).toHaveLength(1);
    const call = upsertCalls[0] as {
      table: string;
      payload: Record<string, unknown>;
      options: { onConflict: string };
    };
    expect(call.table).toBe("poll_votes");
    expect(call.payload.trip_member_id).toBe(MEMBER_ID);
    expect(call.payload.option_id).toBe(OPTION_ID);
    expect(call.payload.idempotency_key).toBe(IDEM_KEY);
    expect(call.options.onConflict).toBe("poll_id,trip_member_id");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("maps upsert 42501 to rls_denied without revalidating", async () => {
    primeAuth(USER_ID);
    primePollAndMember(null);
    tableResolvers.set("poll_votes", () => ({
      data: null,
      error: { code: "42501", message: "denied" },
    }));
    const result = await castPollVoteAction(
      { pollId: POLL_ID, optionId: OPTION_ID },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("maps a pair-FK violation (cross-poll option) to validation_failed", async () => {
    primeAuth(USER_ID);
    primePollAndMember(null);
    tableResolvers.set("poll_votes", () => ({
      data: null,
      error: { code: "23503", message: "fk" },
    }));
    const result = await castPollVoteAction(
      { pollId: POLL_ID, optionId: OPTION_ID },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("maps a limiter throw to rate_limit", async () => {
    primeAuth(USER_ID);
    const { RateLimitError } = await vi.importActual<
      typeof import("@/lib/rate-limit")
    >("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("castPollVote", { remaining: 0, reset: 0 })
    );
    const result = await castPollVoteAction(
      { pollId: POLL_ID, optionId: OPTION_ID },
      IDEM_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});
