/**
 * Tests for lib/db/expenses.ts (#372). Shape-level: we mock the Supabase
 * fluent builder and assert query construction + the idempotent
 * create-with-splits flow; RLS/visibility behavior is exercised by the
 * e2e suite against a real local DB.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createExpenseWithSplits,
  getExpensesByTrip,
  getSplitsByTrip,
} from "../expenses";

/** Single-response fluent-builder mock (invites.test.ts pattern). */
function makeBuilder(rows: unknown, error: unknown = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
    then(onfulfilled) {
      return Promise.resolve({ data: rows, error }).then(onfulfilled);
    },
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") return thenable.then.bind(thenable);
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy: Record<string, unknown> = new Proxy({}, handler);

  return { calls, client: { from: vi.fn(() => proxy) } };
}

/** Each awaited chain consumes the next queued response (replay flows). */
function makeSequencedBuilder(
  responses: Array<{ data: unknown; error: unknown }>
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

const EXPENSE_ROW = {
  id: "e-1",
  trip_id: "trip-1",
  payer_id: "u-1",
  amount_cents: 4500,
  currency: "USD",
  description: "Boat deposit",
  occurred_on: "2026-07-08",
  created_at: "2026-07-08T00:00:00Z",
  idempotency_key: "11111111-2222-4333-8444-555555555555",
  visibility: "everyone",
};

const INPUT = {
  trip_id: "trip-1",
  payer_id: "u-1",
  amount_cents: 4500,
  description: "Boat deposit",
  visibility: "everyone" as const,
  idempotency_key: "11111111-2222-4333-8444-555555555555",
};

const SPLITS = [
  { trip_member_id: "m-a", amount_cents: 2250 },
  { trip_member_id: "m-b", amount_cents: 2250 },
];

describe("lib/db/expenses.ts", () => {
  describe("getExpensesByTrip", () => {
    it("selects by trip_id ordered newest spend first", async () => {
      const { calls, client } = makeBuilder([EXPENSE_ROW]);
      const out = await getExpensesByTrip(
        client as unknown as SupabaseClient,
        "trip-1"
      );
      expect(out).toEqual([EXPENSE_ROW]);
      expect(calls.find((c) => c.method === "eq")?.args).toEqual([
        "trip_id",
        "trip-1",
      ]);
      const orders = calls.filter((c) => c.method === "order");
      expect(orders[0]?.args[0]).toBe("occurred_on");
      expect(orders[1]?.args[0]).toBe("created_at");
    });

    it("throws on error", async () => {
      const { client } = makeBuilder(null, { message: "boom" });
      await expect(
        getExpensesByTrip(client as unknown as SupabaseClient, "t")
      ).rejects.toThrow(/getExpensesByTrip/);
    });
  });

  describe("getSplitsByTrip", () => {
    it("join-filters through the parent expense and strips the join", async () => {
      const { calls, client } = makeBuilder([
        {
          expense_id: "e-1",
          trip_member_id: "m-a",
          amount_cents: 2250,
          currency: "USD",
          expenses: { trip_id: "trip-1" },
        },
      ]);
      const out = await getSplitsByTrip(
        client as unknown as SupabaseClient,
        "trip-1"
      );
      expect(out).toEqual([
        {
          expense_id: "e-1",
          trip_member_id: "m-a",
          amount_cents: 2250,
          currency: "USD",
        },
      ]);
      expect(calls.find((c) => c.method === "eq")?.args).toEqual([
        "expenses.trip_id",
        "trip-1",
      ]);
    });
  });

  describe("createExpenseWithSplits", () => {
    it("inserts the expense then the splits (fresh path)", async () => {
      const { calls, client } = makeSequencedBuilder([
        { data: EXPENSE_ROW, error: null }, // expense insert
        { data: [], error: null }, // splits existence check → none
        { data: null, error: null }, // splits insert
      ]);

      const out = await createExpenseWithSplits(
        client as unknown as SupabaseClient,
        INPUT,
        SPLITS
      );

      expect(out).toEqual(EXPENSE_ROW);
      const inserts = calls.filter((c) => c.method === "insert");
      expect(inserts).toHaveLength(2);
      expect(inserts[0]?.args[0]).toMatchObject({
        trip_id: "trip-1",
        payer_id: "u-1",
        amount_cents: 4500,
        idempotency_key: INPUT.idempotency_key,
        visibility: "everyone",
      });
      expect(inserts[1]?.args[0]).toEqual([
        { expense_id: "e-1", trip_member_id: "m-a", amount_cents: 2250 },
        { expense_id: "e-1", trip_member_id: "m-b", amount_cents: 2250 },
      ]);
    });

    it("replays via re-select on 23505 and skips split insert when splits exist", async () => {
      const { calls, client } = makeSequencedBuilder([
        { data: null, error: { code: "23505", message: "dup" } }, // insert trips idempotency index
        { data: EXPENSE_ROW, error: null }, // re-select original
        { data: [{ expense_id: "e-1" }], error: null }, // splits already there
      ]);

      const out = await createExpenseWithSplits(
        client as unknown as SupabaseClient,
        INPUT,
        SPLITS
      );

      expect(out).toEqual(EXPENSE_ROW);
      expect(calls.filter((c) => c.method === "insert")).toHaveLength(1);
    });

    it("self-heals a torn first attempt: replay inserts the missing splits", async () => {
      const { calls, client } = makeSequencedBuilder([
        { data: null, error: { code: "23505", message: "dup" } },
        { data: EXPENSE_ROW, error: null },
        { data: [], error: null }, // splits missing — first attempt died early
        { data: null, error: null }, // heal insert
      ]);

      await createExpenseWithSplits(
        client as unknown as SupabaseClient,
        INPUT,
        SPLITS
      );

      const inserts = calls.filter((c) => c.method === "insert");
      expect(inserts).toHaveLength(2);
      expect(inserts[1]?.args[0]).toHaveLength(2);
    });

    it("throws on a non-replay insert error", async () => {
      const { client } = makeSequencedBuilder([
        { data: null, error: { code: "42501", message: "RLS" } },
      ]);
      await expect(
        createExpenseWithSplits(
          client as unknown as SupabaseClient,
          INPUT,
          SPLITS
        )
      ).rejects.toThrow(/createExpenseWithSplits insert failed/);
    });
  });
});
