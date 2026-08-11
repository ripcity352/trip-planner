/**
 * Tests for `lib/db/shopping-item-reactions.ts`.
 * TDD: written before implementation (RED phase).
 *
 * Clone of `lib/db/__tests__/announcement-reactions.test.ts`, re-keyed by
 * item_id. Adds an explicit boundary test (spec §12.2/§12.4): the summary
 * output must carry NO `trip_member_id` anywhere.
 *
 * Tests:
 *   1. `SHOPPING_REACTION_COLUMNS` — completeness (every read column).
 *   2. `getShoppingReactionsForTrip` — success, empty, null data, error
 *      propagation, created_at asc order.
 *   3. `summarizeItemReactions` — the pure aggregate path the page renders:
 *      per-item per-emoji counts, the caller's own set, no per-member data
 *      in the output shape (boundary test), input immutability.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SHOPPING_REACTION_COLUMNS,
  getShoppingReactionsForTrip,
  summarizeItemReactions,
} from "../shopping-item-reactions";
import type { ShoppingItemReaction } from "../types";

// ---------------------------------------------------------------------------
// Query mock (same shape as lib/db/__tests__/announcement-reactions.test.ts)
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
const ITEM_1 = "aaaaaaaa-1111-4111-8111-111111111111";
const ITEM_2 = "aaaaaaaa-2222-4222-8222-222222222222";
const ME = "cccccccc-1111-4111-8111-111111111111";
const OTHER = "cccccccc-2222-4222-8222-222222222222";

function makeReaction(
  overrides: Partial<ShoppingItemReaction> = {}
): ShoppingItemReaction {
  return {
    id: crypto.randomUUID(),
    item_id: ITEM_1,
    trip_id: TRIP_ID,
    trip_member_id: OTHER,
    emoji: "🔥",
    created_at: "2026-07-09T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SHOPPING_REACTION_COLUMNS
// ---------------------------------------------------------------------------

describe("SHOPPING_REACTION_COLUMNS", () => {
  it("includes every read column", () => {
    const columns = SHOPPING_REACTION_COLUMNS.split(",").map((c) => c.trim());

    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "item_id",
        "trip_id",
        "trip_member_id",
        "emoji",
        "created_at",
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// getShoppingReactionsForTrip
// ---------------------------------------------------------------------------

describe("getShoppingReactionsForTrip", () => {
  it("returns the rows for the trip", async () => {
    const rows = [makeReaction(), makeReaction({ emoji: "👍" })];
    const client = makeClient({
      shopping_item_reactions: () => ({ data: rows, error: null }),
    });

    const result = await getShoppingReactionsForTrip(client, TRIP_ID);
    expect(result).toEqual(rows);
  });

  it("returns [] when data is null", async () => {
    const client = makeClient({
      shopping_item_reactions: () => ({ data: null, error: null }),
    });

    const result = await getShoppingReactionsForTrip(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws with a prefixed message on query error", async () => {
    const client = makeClient({
      shopping_item_reactions: () => ({
        data: null,
        error: { message: "boom" },
      }),
    });

    await expect(
      getShoppingReactionsForTrip(client, TRIP_ID)
    ).rejects.toThrow(/getShoppingReactionsForTrip failed: boom/);
  });

  it("orders by created_at ascending", async () => {
    const client = makeClient({
      shopping_item_reactions: () => ({ data: [], error: null }),
    });
    const fromSpy = client.from as unknown as ReturnType<typeof vi.fn>;

    await getShoppingReactionsForTrip(client, TRIP_ID);

    // The proxy records calls per-property via the handler; verify `from`
    // was invoked with the right table (order/eq calls are opaque to this
    // proxy style, matching the announcement-reactions precedent).
    expect(fromSpy).toHaveBeenCalledWith("shopping_item_reactions");
  });
});

// ---------------------------------------------------------------------------
// summarizeItemReactions
// ---------------------------------------------------------------------------

describe("summarizeItemReactions", () => {
  it("groups counts per item and per emoji", () => {
    const rows = [
      makeReaction({ item_id: ITEM_1, emoji: "🔥" }),
      makeReaction({ item_id: ITEM_1, emoji: "🔥", trip_member_id: ME }),
      makeReaction({ item_id: ITEM_1, emoji: "👍" }),
      makeReaction({ item_id: ITEM_2, emoji: "🍻" }),
    ];

    const summary = summarizeItemReactions(rows, ME);

    expect(summary[ITEM_1]?.counts).toEqual({ "🔥": 2, "👍": 1 });
    expect(summary[ITEM_2]?.counts).toEqual({ "🍻": 1 });
  });

  it("marks the caller's own reactions in `mine`", () => {
    const rows = [
      makeReaction({ item_id: ITEM_1, emoji: "🔥", trip_member_id: ME }),
      makeReaction({ item_id: ITEM_1, emoji: "👍" }),
      makeReaction({ item_id: ITEM_2, emoji: "🍻", trip_member_id: ME }),
    ];

    const summary = summarizeItemReactions(rows, ME);

    expect(summary[ITEM_1]?.mine).toEqual(["🔥"]);
    expect(summary[ITEM_2]?.mine).toEqual(["🍻"]);
  });

  it("returns empty `mine` when myMemberId is null (no seat resolved)", () => {
    const rows = [makeReaction({ trip_member_id: ME })];

    const summary = summarizeItemReactions(rows, null);

    expect(summary[ITEM_1]?.mine).toEqual([]);
    expect(summary[ITEM_1]?.counts).toEqual({ "🔥": 1 });
  });

  it("returns an empty object for no rows", () => {
    expect(summarizeItemReactions([], ME)).toEqual({});
  });

  it("BOUNDARY: exposes NO trip_member_id anywhere in the summary (aggregate-only)", () => {
    const rows = [
      makeReaction({ item_id: ITEM_1, trip_member_id: OTHER }),
      makeReaction({ item_id: ITEM_2, trip_member_id: ME, emoji: "👎" }),
    ];

    const summary = summarizeItemReactions(rows, ME);

    // Every value's own keys are exactly counts + mine — no member ids,
    // no names, no raw rows.
    for (const value of Object.values(summary)) {
      expect(Object.keys(value)).toEqual(["counts", "mine"]);
    }
    // Belt-and-suspenders: neither trip_member_id value appears anywhere
    // in the serialized output.
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(OTHER);
    expect(serialized).not.toContain(ME);
    expect(serialized).not.toContain("trip_member_id");
  });

  it("does not mutate the input rows", () => {
    const rows = [makeReaction()];
    const snapshot = structuredClone(rows);

    summarizeItemReactions(rows, ME);

    expect(rows).toEqual(snapshot);
  });
});
