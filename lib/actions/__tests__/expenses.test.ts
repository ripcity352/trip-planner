/**
 * Tests for `lib/actions/expenses.ts` (#372).
 *
 * `createExpenseWithSplits` is mocked at the module boundary — the db
 * flow has its own suite (lib/db/__tests__/expenses.test.ts). Here we
 * pin validation, auth, rate-limit scope, split math threading, and
 * error mapping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const createExpenseWithSplitsMock = vi.fn();
vi.mock("@/lib/db/expenses", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/expenses")>(
    "@/lib/db/expenses"
  );
  return {
    ...actual,
    createExpenseWithSplits: (...args: unknown[]) =>
      createExpenseWithSplitsMock(...(args as [])),
  };
});

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

const VALID_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const KEY = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c99";
const MEMBER_A = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01";
const MEMBER_B = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02";
const MEMBER_C = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03";

const BASE_INPUT = {
  tripId: VALID_UUID,
  description: "Boat deposit",
  amountCents: 1000,
  visibility: "everyone" as const,
  splitMemberIds: [MEMBER_A, MEMBER_B, MEMBER_C],
};

describe("addExpenseAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    createClientMock.mockReset();
    createExpenseWithSplitsMock.mockReset();
    rateLimitedActionMock.mockClear();
    createClientMock.mockResolvedValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({
      data: { user: { id: "u-1" } },
      error: null,
    });
    createExpenseWithSplitsMock.mockResolvedValue({ id: "e-1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("threads a deterministic even split that sums to the amount", async () => {
    const { addExpenseAction } = await import("@/lib/actions/expenses");
    const result = await addExpenseAction(BASE_INPUT, KEY);

    expect(result.ok).toBe(true);
    const [, expenseInput, splits] = createExpenseWithSplitsMock.mock
      .calls[0] as [unknown, Record<string, unknown>, Array<{ amount_cents: number }>];
    expect(expenseInput).toMatchObject({
      trip_id: VALID_UUID,
      payer_id: "u-1",
      amount_cents: 1000,
      visibility: "everyone",
      idempotency_key: KEY,
    });
    expect(splits).toHaveLength(3);
    expect(splits.reduce((sum, s) => sum + s.amount_cents, 0)).toBe(1000);
  });

  it("rate-limits under the dedicated ADD_EXPENSE scope", async () => {
    const { addExpenseAction } = await import("@/lib/actions/expenses");
    await addExpenseAction(BASE_INPUT, KEY);
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "addExpense",
      "u-1",
      expect.any(Function)
    );
  });

  it("rejects a malformed idempotency key", async () => {
    const { addExpenseAction } = await import("@/lib/actions/expenses");
    const result = await addExpenseAction(BASE_INPUT, "nope");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(createExpenseWithSplitsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["zero amount", { ...BASE_INPUT, amountCents: 0 }],
    ["over cap", { ...BASE_INPUT, amountCents: 10_000_001 }],
    ["empty description", { ...BASE_INPUT, description: "   " }],
    ["no split members", { ...BASE_INPUT, splitMemberIds: [] }],
    [
      "timestamp instead of date-only",
      { ...BASE_INPUT, occurredOn: "2026-07-08T00:00:00Z" },
    ],
  ])("returns validation_failed for %s", async (_label, input) => {
    const { addExpenseAction } = await import("@/lib/actions/expenses");
    const result = await addExpenseAction(
      input as typeof BASE_INPUT,
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns auth_failed when signed out", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { addExpenseAction } = await import("@/lib/actions/expenses");
    const result = await addExpenseAction(BASE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("maps RLS rejection to rls_denied", async () => {
    createExpenseWithSplitsMock.mockRejectedValueOnce(
      new Error("insert failed: 42501 RLS")
    );
    const { addExpenseAction } = await import("@/lib/actions/expenses");
    const result = await addExpenseAction(BASE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("maps unexpected failures to expense_add_failed", async () => {
    createExpenseWithSplitsMock.mockRejectedValueOnce(new Error("boom"));
    const { addExpenseAction } = await import("@/lib/actions/expenses");
    const result = await addExpenseAction(BASE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "expense_add_failed" });
  });
});
