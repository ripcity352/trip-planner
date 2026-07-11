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
 *      semantics can't drift silently. Aggregate-only per ADR: the
 *      view-model carries counts and the viewer's own choice, never
 *      voter names.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPollViews,
  getPollsViewModel,
  isPollClosed,
  leadingOptions,
  listPolls,
} from "../polls";
import type { Poll, PollOption, PollVote, PollView } from "../types";

function makeClient(
  tableResolvers: Record<string, () => { data: unknown; error: unknown }>
) {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
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

function vote(optionId: string, memberId: string): PollVote {
  return {
    poll_id: "poll-1",
    option_id: optionId,
    trip_member_id: memberId,
    voted_at: "2026-07-09T11:00:00.000Z",
    idempotency_key: null,
  };
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
  it("aggregates votes per option and totals, marking the viewer's own choice", () => {
    const views = buildPollViews(
      [POLL],
      [OPT_A, OPT_B],
      [vote("opt-a", "m1"), vote("opt-a", "m2"), vote("opt-b", "m3")],
      "m3"
    );
    expect(views).toHaveLength(1);
    const view = views[0] as PollView;
    expect(view.total_votes).toBe(3);
    expect(view.my_option_id).toBe("opt-b");
    expect(view.options.map((o) => o.votes)).toEqual([2, 1]);
    expect(view.options.map((o) => o.is_my_vote)).toEqual([false, true]);
  });

  it("zero-buckets options with no votes and null my_option_id for non-voters", () => {
    const views = buildPollViews([POLL], [OPT_A, OPT_B], [], "m1");
    const view = views[0] as PollView;
    expect(view.total_votes).toBe(0);
    expect(view.my_option_id).toBeNull();
    expect(view.options.map((o) => o.votes)).toEqual([0, 0]);
  });

  it("orders options by position regardless of input order", () => {
    const views = buildPollViews([POLL], [OPT_B, OPT_A], [], undefined);
    const view = views[0] as PollView;
    expect(view.options.map((o) => o.option.id)).toEqual(["opt-a", "opt-b"]);
  });

  it("does not mutate its inputs", () => {
    const options = [OPT_B, OPT_A];
    buildPollViews([POLL], options, [], undefined);
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
  it("assembles polls + options + votes into views for the viewer", async () => {
    const client = makeClient({
      polls: () => ({ data: [POLL], error: null }),
      poll_options: () => ({ data: [OPT_A, OPT_B], error: null }),
      poll_votes: () => ({
        data: [vote("opt-a", "m1"), vote("opt-b", "m2")],
        error: null,
      }),
    });
    const views = await getPollsViewModel(client, "trip-1", "m2");
    expect(views).toHaveLength(1);
    expect(views[0]?.total_votes).toBe(2);
    expect(views[0]?.my_option_id).toBe("opt-b");
  });

  it("returns [] without touching options/votes when there are no polls", async () => {
    const optionsResolver = vi.fn(() => ({ data: [], error: null }));
    const client = makeClient({
      polls: () => ({ data: [], error: null }),
      poll_options: optionsResolver,
    });
    const views = await getPollsViewModel(client, "trip-1", "m1");
    expect(views).toEqual([]);
    expect(optionsResolver).not.toHaveBeenCalled();
  });

  it("throws a scoped error when the votes read fails", async () => {
    const client = makeClient({
      polls: () => ({ data: [POLL], error: null }),
      poll_options: () => ({ data: [OPT_A, OPT_B], error: null }),
      poll_votes: () => ({ data: null, error: { message: "nope" } }),
    });
    await expect(
      getPollsViewModel(client, "trip-1", "m1")
    ).rejects.toThrow(/getPollsViewModel failed: nope/);
  });
});
