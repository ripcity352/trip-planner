/**
 * Tests for `lib/db/shopping-list.ts`.
 *
 * Tests:
 *   1. `SHOPPING_ITEM_COLUMNS` — includes every non-exempt written column (I1).
 *   2. `getShoppingItems` — orders by created_at asc, throws on error.
 *   3. `amendItem` — sends only the keys present in the patch.
 *   4. `deleteItem` — exact-count update, SHOPPING_ITEM_NO_ROW on a
 *      zero-row match, error.code preserved. (v1 `setItemBought` /
 *      `setItemClaim` coverage retired in Task 5c along with the setters.)
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SHOPPING_ITEM_COLUMNS,
  SHOPPING_ITEM_NO_ROW,
  ShoppingListDbError,
  amendItem,
  deleteItem,
  deriveShoppingItemState,
  getShoppingItems,
  reopenItem,
  setItemAssignment,
  setItemCompleted,
  setItemRemoved,
} from "../shopping-list";
import type { ShoppingItem } from "../types";

// ---------------------------------------------------------------------------
// Query mock — mirrors announcements.test.ts's fluent-builder proxy.
// ---------------------------------------------------------------------------

function makeSequencedBuilder(
  responses: Array<{ data: unknown; error: unknown; count?: number | null }>
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const queue = [...responses];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") {
        const next = queue.shift() ?? { data: null, error: null };
        const p = Promise.resolve(next);
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

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

const mockItem: ShoppingItem = {
  id: "item-1",
  trip_id: TRIP_ID,
  created_by_trip_member_id: "tm-1",
  claimed_by_trip_member_id: null,
  name: "Handle of tequila",
  category: "booze",
  bought: false,
  cost_cents: 2500,
  currency: "USD",
  visibility: "everyone",
  idempotency_key: null,
  created_at: "2026-08-11T10:00:00.000Z",
  completed_by_trip_member_id: null,
  removed_by_trip_member_id: null,
  removed_at: null,
  claim_assigned_by_trip_member_id: null,
};

// ---------------------------------------------------------------------------
// SHOPPING_ITEM_COLUMNS
// ---------------------------------------------------------------------------

const REQUIRED_COLUMNS = [
  "name",
  "category",
  "bought",
  "claimed_by_trip_member_id",
  "cost_cents",
  "currency",
  "visibility",
  "completed_by_trip_member_id",
  "removed_by_trip_member_id",
  "removed_at",
  "claim_assigned_by_trip_member_id",
]; // the non-exempt written columns (I1)

describe("SHOPPING_ITEM_COLUMNS", () => {
  it("includes every non-exempt written column", () => {
    for (const col of REQUIRED_COLUMNS) {
      expect(SHOPPING_ITEM_COLUMNS).toContain(col);
    }
  });
});

// ---------------------------------------------------------------------------
// getShoppingItems
// ---------------------------------------------------------------------------

describe("getShoppingItems", () => {
  it("returns items ordered by created_at asc", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: [mockItem], error: null },
    ]);

    const result = await getShoppingItems(
      client as unknown as SupabaseClient,
      TRIP_ID
    );

    expect(result).toEqual([mockItem]);
    expect(calls.find((c) => c.method === "order")?.args).toEqual([
      "created_at",
      { ascending: true },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "trip_id",
      TRIP_ID,
    ]);
  });

  it("returns empty array when data is null", async () => {
    const { client } = makeSequencedBuilder([{ data: null, error: null }]);
    const result = await getShoppingItems(
      client as unknown as SupabaseClient,
      TRIP_ID
    );
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: { message: "rls denied" } },
    ]);
    await expect(
      getShoppingItems(client as unknown as SupabaseClient, TRIP_ID)
    ).rejects.toThrow("getShoppingItems failed: rls denied");
  });
});

// ---------------------------------------------------------------------------
// amendItem — partial patch
// ---------------------------------------------------------------------------

describe("amendItem partial patch", () => {
  it("sends only the keys present in the patch", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as never;
    await amendItem(supabase, "item-1", { name: "3 handles" });
    const [payload] = update.mock.calls[0];
    expect(payload).toEqual({ name: "3 handles" }); // no category/cost keys
  });

  it("includes explicit null clears (category, cost_cents)", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as never;
    await amendItem(supabase, "item-1", { category: null, cost_cents: null });
    const [payload] = update.mock.calls[0];
    expect(payload).toEqual({ category: null, cost_cents: null });
  });

  it("leaves category unchanged when the key is present but undefined", async () => {
    // Regression: a caller spreading form state (e.g. `{ category: someMaybeUndefined }`)
    // must NOT have that silently coerced into an explicit clear.
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as never;
    await amendItem(supabase, "item-1", { category: undefined });
    const [payload] = update.mock.calls[0];
    expect(payload).not.toHaveProperty("category");
    expect(payload).toEqual({});
  });

  it("clears category to null when explicitly set to null", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as never;
    await amendItem(supabase, "item-1", { category: null });
    const [payload] = update.mock.calls[0];
    expect(payload).toEqual({ category: null });
  });

  it("throws SHOPPING_ITEM_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);
    const err = await amendItem(client as unknown as SupabaseClient, "item-1", {
      name: "x",
    }).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ShoppingListDbError);
    expect((err as ShoppingListDbError).code).toBe(SHOPPING_ITEM_NO_ROW);
  });
});

// ---------------------------------------------------------------------------
// deleteItem
// ---------------------------------------------------------------------------

describe("deleteItem", () => {
  it("deletes by id with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await deleteItem(client as unknown as SupabaseClient, "item-1");
    expect(calls.find((c) => c.method === "delete")?.args[0]).toEqual({
      count: "exact",
    });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "item-1",
    ]);
  });

  it("throws SHOPPING_ITEM_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);
    const err = await deleteItem(client as unknown as SupabaseClient, "item-1").then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ShoppingListDbError);
    expect((err as ShoppingListDbError).code).toBe(SHOPPING_ITEM_NO_ROW);
  });
});

// ---------------------------------------------------------------------------
// deriveShoppingItemState — pure truth table (v2 spec §2)
// ---------------------------------------------------------------------------

describe("deriveShoppingItemState", () => {
  it("returns 'open' when not removed, not bought, unclaimed", () => {
    expect(deriveShoppingItemState({ ...mockItem })).toBe("open");
  });

  it("returns 'in_progress' when not removed, not bought, claimed", () => {
    expect(
      deriveShoppingItemState({
        ...mockItem,
        claimed_by_trip_member_id: "tm-2",
      })
    ).toBe("in_progress");
  });

  it("returns 'completed' when not removed and bought", () => {
    expect(
      deriveShoppingItemState({
        ...mockItem,
        bought: true,
        completed_by_trip_member_id: "tm-1",
      })
    ).toBe("completed");
  });

  it("returns 'removed' when removed_at is set", () => {
    expect(
      deriveShoppingItemState({
        ...mockItem,
        removed_at: "2026-08-12T00:00:00.000Z",
        removed_by_trip_member_id: "tm-1",
      })
    ).toBe("removed");
  });

  it("precedence: removed wins over bought (both set)", () => {
    expect(
      deriveShoppingItemState({
        ...mockItem,
        bought: true,
        completed_by_trip_member_id: "tm-1",
        removed_at: "2026-08-12T00:00:00.000Z",
        removed_by_trip_member_id: "tm-1",
      })
    ).toBe("removed");
  });

  it("precedence: bought wins over claimed (in_progress) when not removed", () => {
    expect(
      deriveShoppingItemState({
        ...mockItem,
        bought: true,
        completed_by_trip_member_id: "tm-1",
        claimed_by_trip_member_id: "tm-2",
      })
    ).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// setItemCompleted / setItemRemoved / setItemAssignment / reopenItem
// ---------------------------------------------------------------------------

describe("setItemCompleted", () => {
  it("updates bought + completed_by_trip_member_id with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await setItemCompleted(
      client as unknown as SupabaseClient,
      "item-1",
      "tm-1"
    );
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      { bought: true, completed_by_trip_member_id: "tm-1" },
      { count: "exact" },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "item-1",
    ]);
  });

  it("throws SHOPPING_ITEM_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);
    const err = await setItemCompleted(
      client as unknown as SupabaseClient,
      "item-1",
      "tm-1"
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ShoppingListDbError);
    expect((err as ShoppingListDbError).code).toBe(SHOPPING_ITEM_NO_ROW);
  });
});

describe("setItemRemoved", () => {
  it("updates removed_by_trip_member_id + removed_at with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await setItemRemoved(
      client as unknown as SupabaseClient,
      "item-1",
      "tm-1",
      "2026-08-12T00:00:00.000Z"
    );
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      {
        removed_by_trip_member_id: "tm-1",
        removed_at: "2026-08-12T00:00:00.000Z",
      },
      { count: "exact" },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "item-1",
    ]);
  });
});

describe("setItemAssignment", () => {
  it("updates claimed_by_trip_member_id + claim_assigned_by_trip_member_id", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await setItemAssignment(
      client as unknown as SupabaseClient,
      "item-1",
      "tm-2",
      "tm-1"
    );
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      {
        claimed_by_trip_member_id: "tm-2",
        claim_assigned_by_trip_member_id: "tm-1",
      },
      { count: "exact" },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "item-1",
    ]);
  });

  it("allows both null (send back to Open — no one)", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await setItemAssignment(
      client as unknown as SupabaseClient,
      "item-1",
      null,
      null
    );
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      {
        claimed_by_trip_member_id: null,
        claim_assigned_by_trip_member_id: null,
      },
      { count: "exact" },
    ]);
  });

  it("throws SHOPPING_ITEM_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);
    const err = await setItemAssignment(
      client as unknown as SupabaseClient,
      "item-1",
      "tm-2",
      "tm-1"
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ShoppingListDbError);
    expect((err as ShoppingListDbError).code).toBe(SHOPPING_ITEM_NO_ROW);
  });
});

describe("reopenItem", () => {
  it("clears all four terminal fields and sets the assignment in one update", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await reopenItem(
      client as unknown as SupabaseClient,
      "item-1",
      "tm-2",
      "tm-1"
    );
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      {
        bought: false,
        completed_by_trip_member_id: null,
        removed_by_trip_member_id: null,
        removed_at: null,
        claimed_by_trip_member_id: "tm-2",
        claim_assigned_by_trip_member_id: "tm-1",
      },
      { count: "exact" },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "item-1",
    ]);
  });

  it("allows both assignment ids null (reopen to unclaimed)", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await reopenItem(client as unknown as SupabaseClient, "item-1", null, null);
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      {
        bought: false,
        completed_by_trip_member_id: null,
        removed_by_trip_member_id: null,
        removed_at: null,
        claimed_by_trip_member_id: null,
        claim_assigned_by_trip_member_id: null,
      },
      { count: "exact" },
    ]);
  });

  it("throws SHOPPING_ITEM_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);
    const err = await reopenItem(
      client as unknown as SupabaseClient,
      "item-1",
      "tm-2",
      "tm-1"
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ShoppingListDbError);
    expect((err as ShoppingListDbError).code).toBe(SHOPPING_ITEM_NO_ROW);
  });
});
