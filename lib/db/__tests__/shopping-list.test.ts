/**
 * Tests for `lib/db/shopping-list.ts`.
 *
 * Tests:
 *   1. `SHOPPING_ITEM_COLUMNS` — includes every non-exempt written column (I1).
 *   2. `getShoppingItems` — orders by created_at asc, throws on error.
 *   3. `amendItem` — sends only the keys present in the patch.
 *   4. `setItemBought` / `setItemClaim` / `deleteItem` — exact-count update,
 *      SHOPPING_ITEM_NO_ROW on a zero-row match, error.code preserved.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SHOPPING_ITEM_COLUMNS,
  SHOPPING_ITEM_NO_ROW,
  ShoppingListDbError,
  amendItem,
  deleteItem,
  getShoppingItems,
  setItemBought,
  setItemClaim,
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
// setItemBought / setItemClaim / deleteItem
// ---------------------------------------------------------------------------

describe("setItemBought no-row", () => {
  it("throws SHOPPING_ITEM_NO_ROW when nothing matched", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null, count: 0 }),
        }),
      }),
    } as never;
    await expect(setItemBought(supabase, "missing", true)).rejects.toMatchObject({
      code: SHOPPING_ITEM_NO_ROW,
    });
  });
});

describe("setItemBought", () => {
  it("updates bought with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await setItemBought(client as unknown as SupabaseClient, "item-1", true);
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      { bought: true },
      { count: "exact" },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "item-1",
    ]);
  });

  it("preserves error.code on failure", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: { code: "42501", message: "rls" }, count: null },
    ]);
    const err = await setItemBought(
      client as unknown as SupabaseClient,
      "item-1",
      true
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ShoppingListDbError);
    expect((err as ShoppingListDbError).code).toBe("42501");
  });
});

describe("setItemClaim", () => {
  it("updates claimed_by_trip_member_id with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await setItemClaim(client as unknown as SupabaseClient, "item-1", "tm-2");
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      { claimed_by_trip_member_id: "tm-2" },
      { count: "exact" },
    ]);
  });

  it("allows clearing the claim to null", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);
    await setItemClaim(client as unknown as SupabaseClient, "item-1", null);
    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      { claimed_by_trip_member_id: null },
      { count: "exact" },
    ]);
  });

  it("throws SHOPPING_ITEM_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);
    const err = await setItemClaim(
      client as unknown as SupabaseClient,
      "item-1",
      "tm-2"
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ShoppingListDbError);
    expect((err as ShoppingListDbError).code).toBe(SHOPPING_ITEM_NO_ROW);
  });
});

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
