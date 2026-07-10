/**
 * Tests for lib/db/expenses.ts (#372, #383, #384). Shape-level: we mock
 * the Supabase fluent builder / rpc and assert query construction;
 * RLS/visibility behavior is exercised against a real local DB (see the
 * migration validation transcript in PR).
 *
 * Create goes through the `create_expense_with_splits` RPC (#383) — the
 * atomicity + no-RETURNING + replay semantics live in SQL; here we pin
 * that the TS layer threads args, preserves error.code (#384 — mapping
 * by code, not message text), and re-selects the id the RPC returns
 * (which on an idempotency replay is the ORIGINAL expense id).
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EXPENSE_NO_ROW,
  ExpenseDbError,
  createExpenseWithSplits,
  deleteExpense,
  getExpensesByTrip,
  getSplitsByTrip,
  updateExpenseWithSplits,
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

/**
 * Each awaited chain consumes the next queued response. Responses may
 * carry `count` for the head-count mutations (update/delete).
 */
function makeSequencedBuilder(
  responses: Array<{ data: unknown; error: unknown; count?: number | null }>,
  rpcResponses: Array<{ data: unknown; error: unknown }> = []
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const queue = [...responses];
  const rpcQueue = [...rpcResponses];

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

  const rpc = vi.fn(() => {
    const next = rpcQueue.shift() ?? { data: null, error: null };
    return Promise.resolve(next);
  });

  return { calls, rpc, client: { from: vi.fn(() => proxy), rpc } };
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
    it("calls the atomic RPC and re-selects the returned id", async () => {
      const { calls, rpc, client } = makeSequencedBuilder(
        [{ data: EXPENSE_ROW, error: null }], // re-select by id
        [{ data: "e-1", error: null }] // rpc → new expense uuid
      );

      const out = await createExpenseWithSplits(
        client as unknown as SupabaseClient,
        INPUT,
        SPLITS
      );

      expect(out).toEqual(EXPENSE_ROW);
      expect(rpc).toHaveBeenCalledWith("create_expense_with_splits", {
        p_trip_id: "trip-1",
        p_amount_cents: 4500,
        p_description: "Boat deposit",
        p_occurred_on: null,
        p_visibility: "everyone",
        p_idempotency_key: INPUT.idempotency_key,
        p_splits: SPLITS,
      });
      expect(calls.find((c) => c.method === "eq")?.args).toEqual([
        "id",
        "e-1",
      ]);
      // No direct inserts from the TS layer — atomicity lives in SQL.
      expect(calls.filter((c) => c.method === "insert")).toHaveLength(0);
    });

    it("threads occurred_on when provided", async () => {
      const { rpc, client } = makeSequencedBuilder(
        [{ data: EXPENSE_ROW, error: null }],
        [{ data: "e-1", error: null }]
      );

      await createExpenseWithSplits(
        client as unknown as SupabaseClient,
        { ...INPUT, occurred_on: "2026-07-04" },
        SPLITS
      );

      expect(rpc).toHaveBeenCalledWith(
        "create_expense_with_splits",
        expect.objectContaining({ p_occurred_on: "2026-07-04" })
      );
    });

    it("replay: returns the ORIGINAL row for whatever id the RPC hands back", async () => {
      const original = { ...EXPENSE_ROW, id: "e-original" };
      const { calls, client } = makeSequencedBuilder(
        [{ data: original, error: null }],
        [{ data: "e-original", error: null }] // RPC resolved the 23505 replay internally
      );

      const out = await createExpenseWithSplits(
        client as unknown as SupabaseClient,
        INPUT,
        SPLITS
      );

      expect(out).toEqual(original);
      expect(calls.find((c) => c.method === "eq")?.args).toEqual([
        "id",
        "e-original",
      ]);
    });

    it("preserves error.code on RPC failure (#384 — map by code, not text)", async () => {
      const { client } = makeSequencedBuilder(
        [],
        [
          {
            data: null,
            error: {
              code: "42501",
              message:
                'new row violates row-level security policy for table "expenses"',
            },
          },
        ]
      );

      const err = await createExpenseWithSplits(
        client as unknown as SupabaseClient,
        INPUT,
        SPLITS
      ).then(
        () => null,
        (e: unknown) => e
      );

      expect(err).toBeInstanceOf(ExpenseDbError);
      expect((err as ExpenseDbError).code).toBe("42501");
    });
  });

  describe("updateExpenseWithSplits", () => {
    const UPDATE_INPUT = {
      expense_id: "e-1",
      amount_cents: 6000,
      description: "Boat deposit (actual)",
      visibility: "everyone" as const,
      idempotency_key: "11111111-2222-4333-8444-555555555556",
    };
    // Real-shaped UUIDs: updateExpenseWithSplits re-asserts uuid shape
    // before building the PostgREST prune filter.
    const MEMBER_A = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01";
    const MEMBER_C = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03";
    const NEW_SPLITS = [
      { trip_member_id: MEMBER_A, amount_cents: 3000 },
      { trip_member_id: MEMBER_C, amount_cents: 3000 },
    ];

    it("updates the row, upserts splits, then drops stale members (never splitless mid-flight)", async () => {
      const { calls, client } = makeSequencedBuilder([
        { data: null, error: null, count: 1 }, // expenses update
        { data: null, error: null }, // splits upsert
        { data: null, error: null }, // stale splits delete
      ]);

      await updateExpenseWithSplits(
        client as unknown as SupabaseClient,
        UPDATE_INPUT,
        NEW_SPLITS
      );

      const update = calls.find((c) => c.method === "update");
      expect(update?.args[0]).toMatchObject({
        amount_cents: 6000,
        description: "Boat deposit (actual)",
        visibility: "everyone",
        idempotency_key: UPDATE_INPUT.idempotency_key,
      });
      // No occurred_on key unless provided — leave the stored date alone.
      expect(update?.args[0]).not.toHaveProperty("occurred_on");
      expect(update?.args[1]).toEqual({ count: "exact" });

      const upsert = calls.find((c) => c.method === "upsert");
      expect(upsert?.args[0]).toEqual([
        { expense_id: "e-1", trip_member_id: MEMBER_A, amount_cents: 3000 },
        { expense_id: "e-1", trip_member_id: MEMBER_C, amount_cents: 3000 },
      ]);
      expect(upsert?.args[1]).toEqual({
        onConflict: "expense_id,trip_member_id",
      });

      const not = calls.find((c) => c.method === "not");
      expect(not?.args).toEqual([
        "trip_member_id",
        "in",
        `(${MEMBER_A},${MEMBER_C})`,
      ]);
    });

    it("threads occurred_on when provided", async () => {
      const { calls, client } = makeSequencedBuilder([
        { data: null, error: null, count: 1 },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await updateExpenseWithSplits(
        client as unknown as SupabaseClient,
        { ...UPDATE_INPUT, occurred_on: "2026-07-04" },
        NEW_SPLITS
      );

      expect(calls.find((c) => c.method === "update")?.args[0]).toMatchObject({
        occurred_on: "2026-07-04",
      });
    });

    it("throws EXPENSE_NO_ROW when the update matches nothing (RLS-filtered)", async () => {
      const { client } = makeSequencedBuilder([
        { data: null, error: null, count: 0 },
      ]);

      const err = await updateExpenseWithSplits(
        client as unknown as SupabaseClient,
        UPDATE_INPUT,
        NEW_SPLITS
      ).then(
        () => null,
        (e: unknown) => e
      );

      expect(err).toBeInstanceOf(ExpenseDbError);
      expect((err as ExpenseDbError).code).toBe(EXPENSE_NO_ROW);
    });

    it("refuses non-uuid member ids before ANY write (prune-filter grammar guard)", async () => {
      const { calls, client } = makeSequencedBuilder([]);

      await expect(
        updateExpenseWithSplits(client as unknown as SupabaseClient, UPDATE_INPUT, [
          { trip_member_id: "x),expense_id.eq.other", amount_cents: 6000 },
        ])
      ).rejects.toThrow(/non-uuid trip_member_id/);
      expect(calls.filter((c) => c.method === "update")).toHaveLength(0);
      expect(calls.filter((c) => c.method === "upsert")).toHaveLength(0);
    });

    it("preserves error.code from the splits rewrite", async () => {
      const { client } = makeSequencedBuilder([
        { data: null, error: null, count: 1 },
        { data: null, error: { code: "42501", message: "nope" } },
      ]);

      const err = await updateExpenseWithSplits(
        client as unknown as SupabaseClient,
        UPDATE_INPUT,
        NEW_SPLITS
      ).then(
        () => null,
        (e: unknown) => e
      );

      expect(err).toBeInstanceOf(ExpenseDbError);
      expect((err as ExpenseDbError).code).toBe("42501");
    });
  });

  describe("deleteExpense", () => {
    it("deletes by id with an exact count (splits follow via FK cascade)", async () => {
      const { calls, client } = makeSequencedBuilder([
        { data: null, error: null, count: 1 },
      ]);

      await deleteExpense(client as unknown as SupabaseClient, "e-1");

      expect(calls.find((c) => c.method === "delete")?.args[0]).toEqual({
        count: "exact",
      });
      expect(calls.find((c) => c.method === "eq")?.args).toEqual([
        "id",
        "e-1",
      ]);
    });

    it("throws EXPENSE_NO_ROW when nothing matched", async () => {
      const { client } = makeSequencedBuilder([
        { data: null, error: null, count: 0 },
      ]);

      const err = await deleteExpense(
        client as unknown as SupabaseClient,
        "e-1"
      ).then(
        () => null,
        (e: unknown) => e
      );

      expect(err).toBeInstanceOf(ExpenseDbError);
      expect((err as ExpenseDbError).code).toBe(EXPENSE_NO_ROW);
    });

    it("preserves error.code on failure", async () => {
      const { client } = makeSequencedBuilder([
        { data: null, error: { code: "42501", message: "nope" }, count: null },
      ]);

      const err = await deleteExpense(
        client as unknown as SupabaseClient,
        "e-1"
      ).then(
        () => null,
        (e: unknown) => e
      );

      expect(err).toBeInstanceOf(ExpenseDbError);
      expect((err as ExpenseDbError).code).toBe("42501");
    });
  });
});
