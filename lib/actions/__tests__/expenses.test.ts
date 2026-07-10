/**
 * Tests for `lib/actions/expenses.ts` (#372, #383, #384).
 *
 * The db layer is mocked at the module boundary — the db flow has its
 * own suite (lib/db/__tests__/expenses.test.ts). Here we pin
 * validation, auth, rate-limit scope, split math threading, the
 * author-unreadable visibility guard (#384 backstop), and error mapping
 * by `error.code` — NOT message text (#384's mapper bug).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXPENSE_NO_ROW, ExpenseDbError } from "@/lib/db/expenses";

const getUserMock = vi.fn();
const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const createExpenseWithSplitsMock = vi.fn();
const updateExpenseWithSplitsMock = vi.fn();
const deleteExpenseMock = vi.fn();
vi.mock("@/lib/db/expenses", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/expenses")>(
    "@/lib/db/expenses"
  );
  return {
    ...actual,
    createExpenseWithSplits: (...args: unknown[]) =>
      createExpenseWithSplitsMock(...(args as [])),
    updateExpenseWithSplits: (...args: unknown[]) =>
      updateExpenseWithSplitsMock(...(args as [])),
    deleteExpense: (...args: unknown[]) =>
      deleteExpenseMock(...(args as [])),
  };
});

const getViewerMemberMock = vi.fn();
vi.mock("@/lib/db/trips", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/trips")>(
    "@/lib/db/trips"
  );
  return {
    ...actual,
    getViewerMember: (...args: unknown[]) =>
      getViewerMemberMock(...(args as [])),
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
const EXPENSE_ID = "c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c77";
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

const ORGANIZER_VIEWER = {
  id: MEMBER_A,
  role: "organizer",
  is_celebrant: false,
  display_name: "Dave",
};
const PLAIN_VIEWER = {
  id: MEMBER_B,
  role: "attendee",
  is_celebrant: false,
  display_name: "Pete",
};
const CELEBRANT_VIEWER = {
  id: MEMBER_C,
  role: "attendee",
  is_celebrant: true,
  display_name: "Mike",
};

function resetMocks() {
  getUserMock.mockReset();
  createClientMock.mockReset();
  createExpenseWithSplitsMock.mockReset();
  updateExpenseWithSplitsMock.mockReset();
  deleteExpenseMock.mockReset();
  getViewerMemberMock.mockReset();
  rateLimitedActionMock.mockClear();
  createClientMock.mockResolvedValue({ auth: { getUser: getUserMock } });
  getUserMock.mockResolvedValue({
    data: { user: { id: "u-1" } },
    error: null,
  });
  createExpenseWithSplitsMock.mockResolvedValue({ id: "e-1" });
  updateExpenseWithSplitsMock.mockResolvedValue(undefined);
  deleteExpenseMock.mockResolvedValue(undefined);
  getViewerMemberMock.mockResolvedValue(ORGANIZER_VIEWER);
  vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("addExpenseAction", () => {
  beforeEach(resetMocks);
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

  it("maps a 42501 by error.code — not message text (#384)", async () => {
    createExpenseWithSplitsMock.mockRejectedValueOnce(
      new ExpenseDbError(
        // Deliberately contains neither "RLS" nor "42501" — the exact
        // prod failure text from the audit.
        'new row violates row-level security policy for table "expenses"',
        "42501"
      )
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

  describe("author-unreadable visibility guard (#384 backstop)", () => {
    it.each([
      ["celebrant + hide_from_celebrant", CELEBRANT_VIEWER, "hide_from_celebrant"],
      ["celebrant + organizers_only", CELEBRANT_VIEWER, "organizers_only"],
      ["plain member + organizers_only", PLAIN_VIEWER, "organizers_only"],
    ] as const)("rejects %s without touching the db", async (_label, viewer, visibility) => {
      getViewerMemberMock.mockResolvedValue(viewer);
      const { addExpenseAction } = await import("@/lib/actions/expenses");
      const result = await addExpenseAction(
        { ...BASE_INPUT, visibility },
        KEY
      );
      expect(result).toEqual({
        ok: false,
        errorKey: "expense_visibility_self_hidden",
      });
      expect(createExpenseWithSplitsMock).not.toHaveBeenCalled();
    });

    it("allows a plain member to hide from the celebrant", async () => {
      getViewerMemberMock.mockResolvedValue(PLAIN_VIEWER);
      const { addExpenseAction } = await import("@/lib/actions/expenses");
      const result = await addExpenseAction(
        { ...BASE_INPUT, visibility: "hide_from_celebrant" },
        KEY
      );
      expect(result.ok).toBe(true);
    });

    it("skips the member lookup entirely for 'everyone'", async () => {
      const { addExpenseAction } = await import("@/lib/actions/expenses");
      await addExpenseAction(BASE_INPUT, KEY);
      expect(getViewerMemberMock).not.toHaveBeenCalled();
    });

    it("returns rls_denied when the caller isn't a member", async () => {
      getViewerMemberMock.mockResolvedValue(null);
      const { addExpenseAction } = await import("@/lib/actions/expenses");
      const result = await addExpenseAction(
        { ...BASE_INPUT, visibility: "organizers_only" },
        KEY
      );
      expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    });
  });
});

describe("updateExpenseAction", () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.resetModules();
  });

  const UPDATE_INPUT = {
    ...BASE_INPUT,
    expenseId: EXPENSE_ID,
    amountCents: 6000,
    description: "Boat deposit (actual)",
  };

  it("threads the recomputed split and update payload to the db layer", async () => {
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    const result = await updateExpenseAction(UPDATE_INPUT, KEY);

    expect(result).toEqual({ ok: true });
    const [, input, splits] = updateExpenseWithSplitsMock.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Array<{ amount_cents: number }>,
    ];
    expect(input).toMatchObject({
      expense_id: EXPENSE_ID,
      amount_cents: 6000,
      description: "Boat deposit (actual)",
      visibility: "everyone",
      idempotency_key: KEY,
    });
    expect(splits).toHaveLength(3);
    expect(splits.reduce((sum, s) => sum + s.amount_cents, 0)).toBe(6000);
  });

  it("omits occurred_on when the date isn't provided — the stored date stays", async () => {
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    await updateExpenseAction(UPDATE_INPUT, KEY);
    const [, input] = updateExpenseWithSplitsMock.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(input).not.toHaveProperty("occurred_on");
  });

  it("rate-limits under the dedicated UPDATE_EXPENSE scope", async () => {
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    await updateExpenseAction(UPDATE_INPUT, KEY);
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "updateExpense",
      "u-1",
      expect.any(Function)
    );
  });

  it("returns validation_failed for a malformed expense id", async () => {
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    const result = await updateExpenseAction(
      { ...UPDATE_INPUT, expenseId: "nope" },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(updateExpenseWithSplitsMock).not.toHaveBeenCalled();
  });

  it("returns auth_failed when signed out", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    const result = await updateExpenseAction(UPDATE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("rejects an actor-unreadable visibility with the warm backstop copy", async () => {
    getViewerMemberMock.mockResolvedValue(PLAIN_VIEWER);
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    const result = await updateExpenseAction(
      { ...UPDATE_INPUT, visibility: "organizers_only" },
      KEY
    );
    expect(result).toEqual({
      ok: false,
      errorKey: "expense_visibility_self_hidden",
    });
    expect(updateExpenseWithSplitsMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to rls_denied by error.code", async () => {
    updateExpenseWithSplitsMock.mockRejectedValueOnce(
      new ExpenseDbError("permission denied", "42501")
    );
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    const result = await updateExpenseAction(UPDATE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("maps a zero-row update (RLS-filtered) to rls_denied", async () => {
    updateExpenseWithSplitsMock.mockRejectedValueOnce(
      new ExpenseDbError("matched no row", EXPENSE_NO_ROW)
    );
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    const result = await updateExpenseAction(UPDATE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("maps unexpected failures to expense_update_failed", async () => {
    updateExpenseWithSplitsMock.mockRejectedValueOnce(new Error("boom"));
    const { updateExpenseAction } = await import("@/lib/actions/expenses");
    const result = await updateExpenseAction(UPDATE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "expense_update_failed" });
  });
});

describe("deleteExpenseAction", () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.resetModules();
  });

  const DELETE_INPUT = { tripId: VALID_UUID, expenseId: EXPENSE_ID };

  it("deletes through the db layer", async () => {
    const { deleteExpenseAction } = await import("@/lib/actions/expenses");
    const result = await deleteExpenseAction(DELETE_INPUT, KEY);
    expect(result).toEqual({ ok: true });
    expect(deleteExpenseMock).toHaveBeenCalledWith(
      expect.anything(),
      EXPENSE_ID
    );
  });

  it("rate-limits under the dedicated DELETE_EXPENSE scope", async () => {
    const { deleteExpenseAction } = await import("@/lib/actions/expenses");
    await deleteExpenseAction(DELETE_INPUT, KEY);
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "deleteExpense",
      "u-1",
      expect.any(Function)
    );
  });

  it("rejects a malformed idempotency key", async () => {
    const { deleteExpenseAction } = await import("@/lib/actions/expenses");
    const result = await deleteExpenseAction(DELETE_INPUT, "nope");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(deleteExpenseMock).not.toHaveBeenCalled();
  });

  it("returns auth_failed when signed out", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { deleteExpenseAction } = await import("@/lib/actions/expenses");
    const result = await deleteExpenseAction(DELETE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("maps 42501 and zero-row deletes to rls_denied by error.code", async () => {
    deleteExpenseMock.mockRejectedValueOnce(
      new ExpenseDbError("permission denied", "42501")
    );
    const { deleteExpenseAction } = await import("@/lib/actions/expenses");
    expect(await deleteExpenseAction(DELETE_INPUT, KEY)).toEqual({
      ok: false,
      errorKey: "rls_denied",
    });

    deleteExpenseMock.mockRejectedValueOnce(
      new ExpenseDbError("matched no row", EXPENSE_NO_ROW)
    );
    expect(await deleteExpenseAction(DELETE_INPUT, KEY)).toEqual({
      ok: false,
      errorKey: "rls_denied",
    });
  });

  it("maps unexpected failures to expense_delete_failed", async () => {
    deleteExpenseMock.mockRejectedValueOnce(new Error("boom"));
    const { deleteExpenseAction } = await import("@/lib/actions/expenses");
    const result = await deleteExpenseAction(DELETE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "expense_delete_failed" });
  });
});
