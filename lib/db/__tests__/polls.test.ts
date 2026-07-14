/**
 * Tests for `lib/db/polls.ts` (#390 — generic poll primitive).
 *
 * Two surfaces, mirroring the date-poll data-layer tests:
 *
 *   1. The Supabase wrapper functions (`listPolls`, `getPollsViewModel`)
 *      — mocked fluent builder; we assert shape, not RLS behavior (the
 *      SQL contract is rehearsed against the real local DB — see the
 *      migration PR body).
 *
 *   2. The pure helpers (`buildPollViews`, `isPollClosed`,
 *      `leadingOptions`) — table-driven so the aggregate/deadline
 *      semantics can't drift silently.
 *
 * Aggregate-only at the DB (#420): counts arrive from the
 * `get_poll_vote_counts` RPC (ids + counts only, no trip_member_id) and
 * the viewer's own choice from the own-row `poll_votes` read. The two
 * sources are separate on purpose — peers' votes never reach the client.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPollViews,
  countOpenPolls,
  getPollsViewModel,
  isPollClosed,
  leadingOptions,
  listPolls,
} from "../polls";
import type {
  MyPollVote,
  Poll,
  PollOption,
  PollView,
  PollVoteCount,
} from "../types";

type Resolved = { data: unknown; error: unknown };

/**
 * `tableResolvers` drives `.from(table)` reads; `rpcResolvers` drives
 * `.rpc(name)` calls (the #420 aggregate path). An unmapped table/rpc
 * resolves to an empty, error-free payload.
 */
function makeClient(
  tableResolvers: Record<string, () => Resolved>,
  rpcResolvers: Record<string, () => Resolved> = {}
) {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const thenable: PromiseLike<Resolved> = {
      then(onfulfilled) {
        const result = tableResolvers[tableName]?.() ?? {
          data: [],
          error: null,
        };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };

  return {
    from: vi.fn((table: string) => buildProxy(table)),
    rpc: vi.fn((name: string) =>
      Promise.resolve(rpcResolvers[name]?.() ?? { data: [], error: null })
    ),
  } as unknown as SupabaseClient;
}

const POLL: Poll = {
  id: "poll-1",
  trip_id: "trip-1",
  question: "Steakhouse or omakase?",
  visibility: "everyone",
  closes_on: null,
  created_by: "member-org",
  idempotency_key: null,
  created_at: "2026-07-09T10:00:00.000Z",
};

const OPT_A: PollOption = {
  id: "opt-a",
  poll_id: "poll-1",
  label: "Steakhouse",
  position: 0,
};
const OPT_B: PollOption = {
  id: "opt-b",
  poll_id: "poll-1",
  label: "Omakase",
  position: 1,
};

function count(optionId: string, votes: number): PollVoteCount {
  return { poll_id: "poll-1", option_id: optionId, votes };
}
function myVote(optionId: string): MyPollVote {
  return { poll_id: "poll-1", option_id: optionId };
}

describe("listPolls", () => {
  it("returns rows from the polls table", async () => {
    const client = makeClient({
      polls: () => ({ data: [POLL], error: null }),
    });
    const rows = await listPolls(client, "trip-1");
    expect(rows).toEqual([POLL]);
  });

  it("throws with a scoped message on error", async () => {
    const client = makeClient({
      polls: () => ({ data: null, error: { message: "boom" } }),
    });
    await expect(listPolls(client, "trip-1")).rejects.toThrow(
      /listPolls failed: boom/
    );
  });
});

describe("buildPollViews (pure)", () => {
  it("maps aggregate counts + own choice onto the view-model", () => {
    const views = buildPollViews(
      [POLL],
      [OPT_A, OPT_B],
      [count("opt-a", 2), count("opt-b", 1)],
      [myVote("opt-b")]
    );
    expect(views).toHaveLength(1);
    const view = views[0] as PollView;
    expect(view.total_votes).toBe(3);
    expect(view.my_option_id).toBe("opt-b");
    expect(view.options.map((o) => o.votes)).toEqual([2, 1]);
    expect(view.options.map((o) => o.is_my_vote)).toEqual([false, true]);
  });

  it("zero-buckets options with no counts and null my_option_id for non-voters", () => {
    const views = buildPollViews([POLL], [OPT_A, OPT_B], [], []);
    const view = views[0] as PollView;
    expect(view.total_votes).toBe(0);
    expect(view.my_option_id).toBeNull();
    expect(view.options.map((o) => o.votes)).toEqual([0, 0]);
  });

  it("orders options by position regardless of input order", () => {
    const views = buildPollViews([POLL], [OPT_B, OPT_A], [], []);
    const view = views[0] as PollView;
    expect(view.options.map((o) => o.option.id)).toEqual(["opt-a", "opt-b"]);
  });

  it("does not mutate its inputs", () => {
    const options = [OPT_B, OPT_A];
    buildPollViews([POLL], options, [], []);
    expect(options).toEqual([OPT_B, OPT_A]);
  });
});

describe("isPollClosed (pure, date-only register)", () => {
  it("is never closed without a deadline", () => {
    expect(isPollClosed(null, "2026-07-10")).toBe(false);
  });
  it("stays open through the close date (inclusive)", () => {
    expect(isPollClosed("2026-07-10", "2026-07-10")).toBe(false);
  });
  it("closes the day after", () => {
    expect(isPollClosed("2026-07-10", "2026-07-11")).toBe(true);
  });
});

describe("leadingOptions (pure)", () => {
  const withVotes = (votesA: number, votesB: number): PollView => ({
    poll: POLL,
    options: [
      { option: OPT_A, votes: votesA, is_my_vote: false },
      { option: OPT_B, votes: votesB, is_my_vote: false },
    ],
    total_votes: votesA + votesB,
    my_option_id: null,
  });

  it("returns the single leader", () => {
    expect(leadingOptions(withVotes(3, 1)).map((o) => o.option.id)).toEqual([
      "opt-a",
    ]);
  });

  it("returns all tied leaders", () => {
    expect(leadingOptions(withVotes(2, 2)).map((o) => o.option.id)).toEqual([
      "opt-a",
      "opt-b",
    ]);
  });

  it("returns nothing when no one voted", () => {
    expect(leadingOptions(withVotes(0, 0))).toEqual([]);
  });
});

describe("getPollsViewModel", () => {
  it("assembles polls + options + aggregate counts + own vote into views", async () => {
    const client = makeClient(
      {
        polls: () => ({ data: [POLL], error: null }),
        poll_options: () => ({ data: [OPT_A, OPT_B], error: null }),
        // Own-row read: only the viewer's own vote comes back.
        poll_votes: () => ({ data: [myVote("opt-b")], error: null }),
      },
      {
        get_poll_vote_counts: () => ({
          data: [count("opt-a", 1), count("opt-b", 1)],
          error: null,
        }),
      }
    );
    const views = await getPollsViewModel(client, "trip-1", "m2");
    expect(views).toHaveLength(1);
    expect(views[0]?.total_votes).toBe(2);
    expect(views[0]?.my_option_id).toBe("opt-b");
    // Aggregate counts must come from the RPC, never a raw all-voter read.
    expect(client.rpc).toHaveBeenCalledWith("get_poll_vote_counts", {
      p_trip_id: "trip-1",
    });
  });

  it("skips the own-vote read for a viewer without a member row", async () => {
    const client = makeClient(
      {
        polls: () => ({ data: [POLL], error: null }),
        poll_options: () => ({ data: [OPT_A, OPT_B], error: null }),
      },
      {
        get_poll_vote_counts: () => ({
          data: [count("opt-a", 2), count("opt-b", 0)],
          error: null,
        }),
      }
    );
    const views = await getPollsViewModel(client, "trip-1", undefined);
    expect(views[0]?.total_votes).toBe(2);
    expect(views[0]?.my_option_id).toBeNull();
    // No member row → we never touch the votes table at all.
    expect(client.from).not.toHaveBeenCalledWith("poll_votes");
  });

  it("returns [] without touching options/counts when there are no polls", async () => {
    const optionsResolver = vi.fn(() => ({ data: [], error: null }));
    const countsResolver = vi.fn(() => ({ data: [], error: null }));
    const client = makeClient(
      {
        polls: () => ({ data: [], error: null }),
        poll_options: optionsResolver,
      },
      { get_poll_vote_counts: countsResolver }
    );
    const views = await getPollsViewModel(client, "trip-1", "m1");
    expect(views).toEqual([]);
    expect(optionsResolver).not.toHaveBeenCalled();
    expect(countsResolver).not.toHaveBeenCalled();
  });

  it("throws a scoped error when the counts RPC fails", async () => {
    const client = makeClient(
      {
        polls: () => ({ data: [POLL], error: null }),
        poll_options: () => ({ data: [OPT_A, OPT_B], error: null }),
        poll_votes: () => ({ data: [], error: null }),
      },
      {
        get_poll_vote_counts: () => ({
          data: null,
          error: { message: "nope" },
        }),
      }
    );
    await expect(
      getPollsViewModel(client, "trip-1", "m1")
    ).rejects.toThrow(/getPollsViewModel failed: nope/);
  });
});

// -------------------------------------------------------------------
// countOpenPolls — the dashboard discoverability head count. We assert
// the openness predicate mirrors `isPollClosed` (open through closes_on
// inclusive: null deadline OR closes_on >= today).
// -------------------------------------------------------------------
describe("countOpenPolls", () => {
  function makeCountBuilder(count: number | null, error: unknown = null) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === "then") {
          const p = Promise.resolve({ count, error });
          return p.then.bind(p);
        }
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return proxy;
        };
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return { calls, client: { from: vi.fn(() => proxy) } };
  }

  it("returns the head count with the inclusive-openness predicate", async () => {
    const { calls, client } = makeCountBuilder(2);
    const result = await countOpenPolls(
      client as unknown as SupabaseClient,
      "trip-1",
      "2026-07-13"
    );
    expect(result).toBe(2);

    const orCall = calls.find((c) => c.method === "or");
    expect(orCall?.args[0]).toBe("closes_on.is.null,closes_on.gte.2026-07-13");
    const selectCall = calls.find((c) => c.method === "select");
    expect(selectCall?.args[1]).toEqual({ count: "exact", head: true });
  });

  it("returns 0 when the count comes back null", async () => {
    const { client } = makeCountBuilder(null);
    await expect(
      countOpenPolls(client as unknown as SupabaseClient, "trip-1", "2026-07-13")
    ).resolves.toBe(0);
  });

  it("throws with context on error", async () => {
    const { client } = makeCountBuilder(null, { message: "boom" });
    await expect(
      countOpenPolls(client as unknown as SupabaseClient, "trip-1", "2026-07-13")
    ).rejects.toThrow(/countOpenPolls failed: boom/);
  });
});
