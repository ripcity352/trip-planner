/**
 * Tests for `lib/db/date-poll.ts`.
 *
 * Two surfaces:
 *
 *   1. The Supabase wrapper functions (`listCandidates`,
 *      `getCelebrantMarks`, `getVoteCountsByCandidate`, `getMyVote`,
 *      `getDatePollViewModel`) — mocked Supabase fluent builder;
 *      we assert shape, not RLS behavior (the SQL contract is
 *      exercised by Playwright against a real local DB).
 *
 *   2. The pure-function ranking helpers (`rankCandidates`,
 *      `filterMemberVisible`) — pinned with table-driven tests so
 *      the architect-signed comparator (Appendix A.2) can't drift
 *      silently.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  filterMemberVisible,
  getCelebrantMarks,
  getDatePollViewModel,
  getMyVote,
  getVoteCountsByCandidate,
  isDatePollDecided,
  listCandidates,
  rankCandidates,
} from "../date-poll";
import type {
  DatePollCandidate,
  DatePollCandidateView,
} from "../types";

/**
 * Lightweight Supabase mock. Each `.from(table)` returns a fresh
 * proxy that records every chained method call and resolves the
 * terminal `await` to a configurable `{ data, error }` payload.
 *
 * `tableResolvers` maps a table name to the resolver that decides
 * what to return for that table's query — letting one call site
 * drive `from("date_poll_candidates")` and `from("date_poll_votes")`
 * independently without two separate clients.
 */
type Resolved = { data: unknown; error: unknown };

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
    // #420: aggregate counts route through the get_date_poll_vote_counts RPC.
    rpc: vi.fn((name: string) =>
      Promise.resolve(rpcResolvers[name]?.() ?? { data: [], error: null })
    ),
  } as unknown as SupabaseClient;
}

const C1: DatePollCandidate = {
  id: "c1",
  trip_id: "trip-1",
  label: "Window A",
  starts_on: "2026-06-01",
  ends_on: "2026-06-03",
  created_by: "user-1",
  created_at: "2026-05-19T10:00:00.000Z",
};
const C2: DatePollCandidate = {
  id: "c2",
  trip_id: "trip-1",
  label: "Window B",
  starts_on: "2026-06-10",
  ends_on: "2026-06-12",
  created_by: "user-1",
  created_at: "2026-05-19T11:00:00.000Z",
};
const C3: DatePollCandidate = {
  id: "c3",
  trip_id: "trip-1",
  label: "Window C",
  starts_on: "2026-06-20",
  ends_on: "2026-06-22",
  created_by: "user-1",
  created_at: "2026-05-19T12:00:00.000Z",
};

describe("lib/db/date-poll.ts — Supabase wrappers", () => {
  describe("listCandidates", () => {
    it("queries date_poll_candidates filtered by trip_id, ordered ascending", async () => {
      const client = makeClient({
        date_poll_candidates: () => ({ data: [C1, C2], error: null }),
      });
      const result = await listCandidates(client, "trip-1");
      expect(result).toEqual([C1, C2]);
    });

    it("returns [] on empty result", async () => {
      const client = makeClient({
        date_poll_candidates: () => ({ data: [], error: null }),
      });
      expect(await listCandidates(client, "trip-1")).toEqual([]);
    });

    it("throws on supabase error", async () => {
      const client = makeClient({
        date_poll_candidates: () => ({
          data: null,
          error: { message: "boom" },
        }),
      });
      await expect(listCandidates(client, "trip-1")).rejects.toThrow(
        /listCandidates/
      );
    });
  });

  describe("getCelebrantMarks", () => {
    it("returns [] when there are no candidates", async () => {
      const client = makeClient({
        date_poll_candidates: () => ({ data: [], error: null }),
      });
      expect(await getCelebrantMarks(client, "trip-1")).toEqual([]);
    });

    it("fetches marks scoped to the trip's candidates", async () => {
      let candidateCall = 0;
      const client = makeClient({
        date_poll_candidates: () => {
          candidateCall += 1;
          return { data: [{ id: "c1" }, { id: "c2" }], error: null };
        },
        date_poll_celebrant_marks: () => ({
          data: [
            {
              candidate_id: "c1",
              mark: "works",
              marked_by: "u-1",
              marked_at: "2026-05-19T13:00:00.000Z",
            },
          ],
          error: null,
        }),
      });
      const marks = await getCelebrantMarks(client, "trip-1");
      expect(candidateCall).toBe(1);
      expect(marks).toHaveLength(1);
      expect(marks[0].candidate_id).toBe("c1");
    });
  });

  describe("getVoteCountsByCandidate", () => {
    it("returns an empty Map when the aggregate RPC returns no rows", async () => {
      const client = makeClient(
        {},
        { get_date_poll_vote_counts: () => ({ data: [], error: null }) }
      );
      const counts = await getVoteCountsByCandidate(client, "trip-1");
      expect(counts.size).toBe(0);
    });

    it("maps per-candidate yes/no counts from the aggregate RPC", async () => {
      const client = makeClient(
        {},
        {
          get_date_poll_vote_counts: () => ({
            data: [
              { candidate_id: "c1", yes_votes: 2, no_votes: 1 },
              { candidate_id: "c2", yes_votes: 0, no_votes: 1 },
            ],
            error: null,
          }),
        }
      );
      const counts = await getVoteCountsByCandidate(client, "trip-1");
      expect(counts.get("c1")).toEqual({ yes: 2, no: 1 });
      expect(counts.get("c2")).toEqual({ yes: 0, no: 1 });
      // Aggregates come from the RPC, never a raw all-voter votes read.
      expect(client.rpc).toHaveBeenCalledWith("get_date_poll_vote_counts", {
        p_trip_id: "trip-1",
      });
    });

    it("coerces bigint counts handed back as strings", async () => {
      const client = makeClient(
        {},
        {
          get_date_poll_vote_counts: () => ({
            data: [{ candidate_id: "c1", yes_votes: "3", no_votes: "4" }],
            error: null,
          }),
        }
      );
      const counts = await getVoteCountsByCandidate(client, "trip-1");
      expect(counts.get("c1")).toEqual({ yes: 3, no: 4 });
    });

    it("throws a scoped error when the RPC fails", async () => {
      const client = makeClient(
        {},
        {
          get_date_poll_vote_counts: () => ({
            data: null,
            error: { message: "boom" },
          }),
        }
      );
      await expect(
        getVoteCountsByCandidate(client, "trip-1")
      ).rejects.toThrow(/getVoteCountsByCandidate failed: boom/);
    });
  });

  describe("getMyVote", () => {
    it("returns null when there is no vote row", async () => {
      const client = makeClient({
        date_poll_votes: () => ({ data: null, error: null }),
      });
      expect(await getMyVote(client, "c1", "m1")).toBeNull();
    });
    it("returns the vote boolean when present", async () => {
      const client = makeClient({
        date_poll_votes: () => ({ data: { vote: true }, error: null }),
      });
      expect(await getMyVote(client, "c1", "m1")).toBe(true);
    });
  });

  describe("getDatePollViewModel", () => {
    it("composes candidates + marks + aggregate counts + own vote into per-candidate views", async () => {
      const client = makeClient(
        {
          date_poll_candidates: () => ({ data: [C1, C2], error: null }),
          date_poll_celebrant_marks: () => ({
            data: [
              {
                candidate_id: "c1",
                mark: "no-go",
                marked_by: "u-1",
                marked_at: "2026-05-19T13:00:00.000Z",
              },
            ],
            error: null,
          }),
          // The ONLY date_poll_votes read left is the own-row my-vote
          // scan — scoped to the viewer, never a peer's vote.
          date_poll_votes: () => ({
            data: [{ candidate_id: "c1", vote: true }],
            error: null,
          }),
        },
        {
          get_date_poll_vote_counts: () => ({
            data: [
              { candidate_id: "c1", yes_votes: 1, no_votes: 0 },
              { candidate_id: "c2", yes_votes: 0, no_votes: 1 },
            ],
            error: null,
          }),
        }
      );
      const rows = await getDatePollViewModel(client, "trip-1", "m1");
      expect(rows).toHaveLength(2);
      const c1 = rows.find((r) => r.candidate.id === "c1");
      expect(c1?.mark).toBe("no-go");
      expect(c1?.yes_votes).toBe(1);
      expect(c1?.my_vote).toBe(true);
      const c2 = rows.find((r) => r.candidate.id === "c2");
      expect(c2?.mark).toBeNull();
      expect(c2?.no_votes).toBe(1);
      // Aggregate counts route through the RPC.
      expect(client.rpc).toHaveBeenCalledWith("get_date_poll_vote_counts", {
        p_trip_id: "trip-1",
      });
    });
  });
});

// =============================================================
// rankCandidates + filterMemberVisible — pure-function tests
// =============================================================

function viewFor(
  candidate: DatePollCandidate,
  partial: Partial<Omit<DatePollCandidateView, "candidate">> = {}
): DatePollCandidateView {
  return {
    candidate,
    mark: partial.mark ?? null,
    yes_votes: partial.yes_votes ?? 0,
    no_votes: partial.no_votes ?? 0,
    my_vote: partial.my_vote ?? null,
  };
}

describe("rankCandidates", () => {
  it("sorts by celebrant mark priority first: works > works-with-effort > null > no-go", () => {
    const rows: DatePollCandidateView[] = [
      viewFor(C1, { mark: "no-go" }),
      viewFor(C2, { mark: "works" }),
      viewFor(C3, { mark: "works-with-effort" }),
    ];
    const ranked = rankCandidates(rows);
    expect(ranked.map((r) => r.candidate.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("for equal marks, sorts by yes_votes descending", () => {
    const rows: DatePollCandidateView[] = [
      viewFor(C1, { mark: "works", yes_votes: 1 }),
      viewFor(C2, { mark: "works", yes_votes: 5 }),
      viewFor(C3, { mark: "works", yes_votes: 3 }),
    ];
    expect(rankCandidates(rows).map((r) => r.candidate.id)).toEqual([
      "c2",
      "c3",
      "c1",
    ]);
  });

  it("breaks votes ties by created_at ascending (oldest first wins ties)", () => {
    // C1 (10:00) and C2 (11:00) both `works` with 3 yes votes — the
    // earlier-proposed window should rank first.
    const rows: DatePollCandidateView[] = [
      viewFor(C2, { mark: "works", yes_votes: 3 }),
      viewFor(C1, { mark: "works", yes_votes: 3 }),
    ];
    expect(rankCandidates(rows).map((r) => r.candidate.id)).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("treats null mark as ranking above no-go but below explicit marks", () => {
    const rows: DatePollCandidateView[] = [
      viewFor(C1, { mark: null }),
      viewFor(C2, { mark: "no-go" }),
      viewFor(C3, { mark: "works-with-effort" }),
    ];
    expect(rankCandidates(rows).map((r) => r.candidate.id)).toEqual([
      "c3",
      "c1",
      "c2",
    ]);
  });

  it("does not mutate its input (immutability)", () => {
    const rows: DatePollCandidateView[] = [
      viewFor(C2, { mark: "works", yes_votes: 1 }),
      viewFor(C1, { mark: "works", yes_votes: 5 }),
    ];
    const before = rows.map((r) => r.candidate.id);
    rankCandidates(rows);
    expect(rows.map((r) => r.candidate.id)).toEqual(before);
  });
});

describe("filterMemberVisible", () => {
  it("drops vetoed (no-go) candidates", () => {
    const rows: DatePollCandidateView[] = [
      viewFor(C1, { mark: "no-go" }),
      viewFor(C2, { mark: "works" }),
      viewFor(C3, { mark: null }),
    ];
    expect(filterMemberVisible(rows).map((r) => r.candidate.id)).toEqual([
      "c2",
      "c3",
    ]);
  });

  it("keeps `works-with-effort` and null marks visible to members", () => {
    const rows: DatePollCandidateView[] = [
      viewFor(C1, { mark: "works-with-effort" }),
      viewFor(C2, { mark: null }),
    ];
    expect(filterMemberVisible(rows)).toHaveLength(2);
  });
});

describe("isDatePollDecided", () => {
  // #369: the presence of BOTH trip bounds is the single source of
  // truth for "dates locked". Anything less is still an open poll.
  it("is decided only when both starts_at and ends_at are set", () => {
    expect(
      isDatePollDecided({ starts_at: "2026-07-29", ends_at: "2026-08-01" })
    ).toBe(true);
  });

  it("is not decided when either bound is null", () => {
    expect(isDatePollDecided({ starts_at: "2026-07-29", ends_at: null })).toBe(
      false
    );
    expect(isDatePollDecided({ starts_at: null, ends_at: "2026-08-01" })).toBe(
      false
    );
    expect(isDatePollDecided({ starts_at: null, ends_at: null })).toBe(false);
  });
});
