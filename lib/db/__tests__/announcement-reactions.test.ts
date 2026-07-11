/**
 * Tests for `lib/db/announcement-reactions.ts`.
 * TDD: written before implementation (RED phase).
 *
 * Tests:
 *   1. `getReactionsForTrip` — success, empty, null data, error propagation.
 *   2. `summarizeReactions` — the pure aggregate path the page renders:
 *      per-announcement per-emoji counts, the caller's own set, no
 *      per-name data in the output shape, input immutability.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getReactionsForTrip,
  summarizeReactions,
} from "../announcement-reactions";
import type { AnnouncementReaction } from "../types";

// ---------------------------------------------------------------------------
// Query mock (same shape as lib/db/__tests__/announcements.test.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const ANN_1 = "aaaaaaaa-1111-4111-8111-111111111111";
const ANN_2 = "aaaaaaaa-2222-4222-8222-222222222222";
const ME = "cccccccc-1111-4111-8111-111111111111";
const OTHER = "cccccccc-2222-4222-8222-222222222222";

function makeReaction(
  overrides: Partial<AnnouncementReaction> = {}
): AnnouncementReaction {
  return {
    id: crypto.randomUUID(),
    announcement_id: ANN_1,
    trip_id: TRIP_ID,
    trip_member_id: OTHER,
    emoji: "🔥",
    created_at: "2026-07-09T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getReactionsForTrip
// ---------------------------------------------------------------------------

describe("getReactionsForTrip", () => {
  it("returns the rows for the trip", async () => {
    const rows = [makeReaction(), makeReaction({ emoji: "👍" })];
    const client = makeClient({
      announcement_reactions: () => ({ data: rows, error: null }),
    });

    const result = await getReactionsForTrip(client, TRIP_ID);
    expect(result).toEqual(rows);
  });

  it("returns [] when data is null", async () => {
    const client = makeClient({
      announcement_reactions: () => ({ data: null, error: null }),
    });

    const result = await getReactionsForTrip(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws with a prefixed message on query error", async () => {
    const client = makeClient({
      announcement_reactions: () => ({
        data: null,
        error: { message: "boom" },
      }),
    });

    await expect(getReactionsForTrip(client, TRIP_ID)).rejects.toThrow(
      /getReactionsForTrip failed: boom/
    );
  });
});

// ---------------------------------------------------------------------------
// summarizeReactions
// ---------------------------------------------------------------------------

describe("summarizeReactions", () => {
  it("groups counts per announcement and per emoji", () => {
    const rows = [
      makeReaction({ announcement_id: ANN_1, emoji: "🔥" }),
      makeReaction({ announcement_id: ANN_1, emoji: "🔥", trip_member_id: ME }),
      makeReaction({ announcement_id: ANN_1, emoji: "👍" }),
      makeReaction({ announcement_id: ANN_2, emoji: "🍻" }),
    ];

    const summary = summarizeReactions(rows, ME);

    expect(summary[ANN_1]?.counts).toEqual({ "🔥": 2, "👍": 1 });
    expect(summary[ANN_2]?.counts).toEqual({ "🍻": 1 });
  });

  it("marks the caller's own reactions in `mine`", () => {
    const rows = [
      makeReaction({ announcement_id: ANN_1, emoji: "🔥", trip_member_id: ME }),
      makeReaction({ announcement_id: ANN_1, emoji: "👍" }),
      makeReaction({ announcement_id: ANN_2, emoji: "🍻", trip_member_id: ME }),
    ];

    const summary = summarizeReactions(rows, ME);

    expect(summary[ANN_1]?.mine).toEqual(["🔥"]);
    expect(summary[ANN_2]?.mine).toEqual(["🍻"]);
  });

  it("returns empty `mine` when myMemberId is null (no seat resolved)", () => {
    const rows = [makeReaction({ trip_member_id: ME })];

    const summary = summarizeReactions(rows, null);

    expect(summary[ANN_1]?.mine).toEqual([]);
    expect(summary[ANN_1]?.counts).toEqual({ "🔥": 1 });
  });

  it("returns an empty object for no rows", () => {
    expect(summarizeReactions([], ME)).toEqual({});
  });

  it("exposes NO per-member data in the summary (aggregate-only)", () => {
    const rows = [makeReaction({ trip_member_id: OTHER })];

    const summary = summarizeReactions(rows, ME);

    // The only keys are counts + mine — no member ids, no names.
    expect(Object.keys(summary[ANN_1] ?? {})).toEqual(["counts", "mine"]);
    expect(JSON.stringify(summary)).not.toContain(OTHER);
  });

  it("does not mutate the input rows", () => {
    const rows = [makeReaction()];
    const snapshot = structuredClone(rows);

    summarizeReactions(rows, ME);

    expect(rows).toEqual(snapshot);
  });
});
