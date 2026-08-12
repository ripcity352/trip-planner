/**
 * Tests for `lib/actions/shopping-list.ts` (Task 4).
 *
 * Covers: happy-path add, idempotency replay (23505), RLS rejection
 * (42501), claim/unclaim member resolution, blank-name validation,
 * partial-patch amend (name-only leaves category/cost intact — gap-A
 * regression), and the I12 no-redirect invariant.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
// Each table maps to a queue-aware resolver: successive calls to the same
// table pop the next result (falls back to the last one), so a flow that
// hits `shopping_list_items` twice (e.g. select-then-update, or
// insert-then-re-select on replay) can return different rows.
const tableQueues = new Map<
  string,
  Array<{ data: unknown; error: unknown; count?: number | null }>
>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => buildClient()),
}));

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

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

const addShoppingCommentMock = vi.fn();
vi.mock("@/lib/actions/shopping-item-comments", () => ({
  addShoppingComment: (...args: unknown[]) => addShoppingCommentMock(...args),
}));

const capturedWrites: Array<{ table: string; op: string; arg: unknown }> = [];

function nextResult(
  table: string
): { data: unknown; error: unknown; count?: number | null } {
  const q = tableQueues.get(table);
  if (!q || q.length === 0) return { data: null, error: null };
  return q.length === 1
    ? q[0]
    : (q.shift() as { data: unknown; error: unknown; count?: number | null });
}

function buildClient(): unknown {
  const tableProxy = (table: string): Record<string, unknown> => {
    const thenable: PromiseLike<{
      data: unknown;
      error: unknown;
      count?: number | null;
    }> = {
      then(onfulfilled) {
        return Promise.resolve(nextResult(table)).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "maybeSingle" || prop === "single") {
          return () => Promise.resolve(nextResult(table));
        }
        return (...args: unknown[]) => {
          if (prop === "insert" || prop === "update" || prop === "delete") {
            capturedWrites.push({ table, op: prop, arg: args[0] });
          }
          return proxy;
        };
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };
  return {
    auth: { getUser: getUserMock },
    from: vi.fn((t: string) => tableProxy(t)),
  };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

const TRIP = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";
const OTHER_MEMBER = "66666666-6666-4666-8666-666666666666";

const mockItem = {
  id: ITEM,
  trip_id: TRIP,
  created_by_trip_member_id: MEMBER,
  claimed_by_trip_member_id: null,
  name: "Sunscreen",
  category: "toiletries",
  bought: false,
  cost_cents: 1200,
  currency: "USD",
  visibility: "everyone",
  idempotency_key: KEY,
  created_at: "2026-08-11T10:00:00.000Z",
};

let addShoppingItem: typeof import("../shopping-list").addShoppingItem;
let toggleBought: typeof import("../shopping-list").toggleBought;
let setClaim: typeof import("../shopping-list").setClaim;
let amendShoppingItem: typeof import("../shopping-list").amendShoppingItem;
let deleteShoppingItem: typeof import("../shopping-list").deleteShoppingItem;
let assignShoppingItem: typeof import("../shopping-list").assignShoppingItem;
let completeShoppingItem: typeof import("../shopping-list").completeShoppingItem;
let removeShoppingItem: typeof import("../shopping-list").removeShoppingItem;
let reopenShoppingItem: typeof import("../shopping-list").reopenShoppingItem;

beforeEach(async () => {
  getUserMock.mockReset();
  tableQueues.clear();
  capturedWrites.length = 0;
  rateLimitedActionMock.mockClear();
  redirectMock.mockClear();
  addShoppingCommentMock.mockReset();
  addShoppingCommentMock.mockResolvedValue({ ok: true, comment: {} });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const mod = await import("../shopping-list");
  addShoppingItem = mod.addShoppingItem;
  toggleBought = mod.toggleBought;
  setClaim = mod.setClaim;
  amendShoppingItem = mod.amendShoppingItem;
  deleteShoppingItem = mod.deleteShoppingItem;
  assignShoppingItem = mod.assignShoppingItem;
  completeShoppingItem = mod.completeShoppingItem;
  removeShoppingItem = mod.removeShoppingItem;
  reopenShoppingItem = mod.reopenShoppingItem;
});
afterEach(() => vi.clearAllMocks());

describe("addShoppingItem", () => {
  it("rejects a bad idempotency key", async () => {
    primeAuth(USER);
    const res = await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, "not-a-uuid");
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a blank name", async () => {
    primeAuth(USER);
    const res = await addShoppingItem({ tripId: TRIP, name: "   " }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when unauthenticated", async () => {
    primeAuth(null);
    const res = await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the caller is not a trip member", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: null, error: null }]);
    const res = await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("inserts and returns ok:true on success", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    tableQueues.set("shopping_list_items", [{ data: mockItem, error: null }]);

    const res = await addShoppingItem(
      { tripId: TRIP, name: "Sunscreen", category: "toiletries", costCents: 1200 },
      KEY
    );
    expect(res).toEqual({ ok: true, item: mockItem });

    const insert = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "insert"
    );
    expect(insert?.arg).toMatchObject({
      trip_id: TRIP,
      created_by_trip_member_id: MEMBER,
      name: "Sunscreen",
      category: "toiletries",
      cost_cents: 1200,
      currency: "USD",
      visibility: "everyone",
      idempotency_key: KEY,
    });
  });

  it("re-selects on idempotency replay (23505) and returns ok", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    tableQueues.set("shopping_list_items", [
      { data: null, error: { code: "23505", message: "dup" } },
      { data: mockItem, error: null },
    ]);

    const res = await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, KEY);
    expect(res).toEqual({ ok: true, item: mockItem });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    tableQueues.set("shopping_list_items", [
      { data: null, error: { code: "42501", message: "denied" } },
    ]);
    const res = await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns shopping_list_save_rejected on a coded error", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    tableQueues.set("shopping_list_items", [
      { data: null, error: { code: "23514", message: "check constraint" } },
    ]);
    const res = await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "shopping_list_save_rejected" });
  });

  it("returns shopping_list_save_failed on a codeless error", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    tableQueues.set("shopping_list_items", [
      { data: null, error: { code: "", message: "network hiccup" } },
    ]);
    const res = await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "shopping_list_save_failed" });
  });

  it("surfaces a rate-limit rejection", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("addShoppingItem", { reset: 0, remaining: 0 })
    );
    const res = await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});

describe("toggleBought", () => {
  it("returns ok:true on a successful toggle", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null, count: 1 }]);
    const res = await toggleBought(ITEM, true);
    expect(res).toEqual({ ok: true });
  });

  it("returns rls_denied when unauthenticated", async () => {
    primeAuth(null);
    const res = await toggleBought(ITEM, true);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the update matches no row", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null, count: 0 }]);
    const res = await toggleBought(ITEM, true);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("rejects a non-uuid item id", async () => {
    primeAuth(USER);
    const res = await toggleBought("nope", true);
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });
});

describe("setClaim", () => {
  it("resolves the acting member and writes their id when claiming", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);

    const res = await setClaim(ITEM, true);
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({ claimed_by_trip_member_id: MEMBER });
  });

  it("writes null when unclaiming", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);

    const res = await setClaim(ITEM, false);
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({ claimed_by_trip_member_id: null });
  });

  it("returns rls_denied when the item isn't visible to the caller", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null }]);
    const res = await setClaim(ITEM, true);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the caller is not a trip member", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [{ data: null, error: null }]);
    const res = await setClaim(ITEM, true);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});

describe("amendShoppingItem", () => {
  it("leaves category and cost intact when amending name only (gap-A regression)", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null, count: 1 }]);

    const res = await amendShoppingItem(ITEM, { name: "Reef-safe sunscreen" });
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({ name: "Reef-safe sunscreen" });
  });

  it("maps costCents to cost_cents and passes explicit null through category", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null, count: 1 }]);

    const res = await amendShoppingItem(ITEM, { category: null, costCents: 500 });
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({ category: null, cost_cents: 500 });
  });

  it("returns rls_denied when the update matches no row", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null, count: 0 }]);
    const res = await amendShoppingItem(ITEM, { name: "New name" });
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("rejects an invalid patch (blank name)", async () => {
    primeAuth(USER);
    const res = await amendShoppingItem(ITEM, { name: "" });
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects an empty patch before hitting the db (no-op update guard)", async () => {
    primeAuth(USER);
    const res = await amendShoppingItem(ITEM, {});
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update).toBeUndefined();
  });
});

describe("deleteShoppingItem", () => {
  it("returns ok:true on a successful delete", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null, count: 1 }]);
    const res = await deleteShoppingItem(ITEM);
    expect(res).toEqual({ ok: true });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: null, error: { code: "42501", message: "denied" } },
    ]);
    const res = await deleteShoppingItem(ITEM);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("is idempotent on double-tap: a no-row match (SHOPPING_ITEM_NO_ROW) converges to ok:true", async () => {
    primeAuth(USER);
    // count:0 drives the real db layer's runCounted() to throw
    // ShoppingListDbError(SHOPPING_ITEM_NO_ROW) — the item is already gone,
    // which is the desired end state, so a second delete is a no-op success
    // rather than the shared rls_denied collapse (rule 9).
    tableQueues.set("shopping_list_items", [{ data: null, error: null, count: 0 }]);
    const res = await deleteShoppingItem(ITEM);
    expect(res).toEqual({ ok: true });
  });
});

describe("assignShoppingItem", () => {
  it("self-claim: claim_assigned_by is null when target === actor", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: { id: MEMBER }, error: null }, // isSameTripMember(target)
    ]);

    const res = await assignShoppingItem(ITEM, MEMBER);
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({
      claimed_by_trip_member_id: MEMBER,
      claim_assigned_by_trip_member_id: null,
    });
  });

  it("assign-to-other: claim_assigned_by is the actor", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: { id: OTHER_MEMBER }, error: null }, // isSameTripMember(target)
    ]);

    const res = await assignShoppingItem(ITEM, OTHER_MEMBER);
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({
      claimed_by_trip_member_id: OTHER_MEMBER,
      claim_assigned_by_trip_member_id: MEMBER,
    });
  });

  it("Open—no one: both claim fields null when targetMemberId is null", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);

    const res = await assignShoppingItem(ITEM, null);
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({
      claimed_by_trip_member_id: null,
      claim_assigned_by_trip_member_id: null,
    });
  });

  it("rejects a cross-trip target and never calls the setter", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: null, error: null }, // isSameTripMember(target) — not found
    ]);

    const res = await assignShoppingItem(ITEM, OTHER_MEMBER);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update).toBeUndefined();
  });

  it("returns rls_denied when the item isn't visible to the caller", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null }]);
    const res = await assignShoppingItem(ITEM, MEMBER);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the actor is not a trip member", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [{ data: null, error: null }]);
    const res = await assignShoppingItem(ITEM, MEMBER);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("rejects a non-uuid target", async () => {
    primeAuth(USER);
    const res = await assignShoppingItem(ITEM, "nope");
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("I3 error split — 42501 maps to rls_denied", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: { code: "42501", message: "denied" } },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    const res = await assignShoppingItem(ITEM, null);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("I3 error split — a coded non-42501 error maps to save_rejected", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: { code: "23514", message: "check constraint" } },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    const res = await assignShoppingItem(ITEM, null);
    expect(res).toEqual({ ok: false, errorKey: "shopping_list_save_rejected" });
  });

  it("I3 error split — a codeless error maps to save_failed", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: { code: "", message: "network hiccup" } },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    const res = await assignShoppingItem(ITEM, null);
    expect(res).toEqual({ ok: false, errorKey: "shopping_list_save_failed" });
  });
});

describe("completeShoppingItem", () => {
  it("explicit same-trip completer succeeds", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: { id: MEMBER }, error: null }, // isSameTripMember(completedBy)
    ]);

    const res = await completeShoppingItem(ITEM, MEMBER);
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({
      bought: true,
      completed_by_trip_member_id: MEMBER,
    });
  });

  it("allows completing someone else's in-progress item (actor !== claimer)", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: { id: OTHER_MEMBER }, error: null }, // isSameTripMember(completedBy)
    ]);

    const res = await completeShoppingItem(ITEM, OTHER_MEMBER);
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({
      bought: true,
      completed_by_trip_member_id: OTHER_MEMBER,
    });
  });

  it("rejects a cross-trip completer and never calls the setter", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: null, error: null }, // isSameTripMember(completedBy) — not found
    ]);

    const res = await completeShoppingItem(ITEM, OTHER_MEMBER);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update).toBeUndefined();
  });

  it("returns rls_denied when the actor isn't a member", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [{ data: null, error: null }]);
    const res = await completeShoppingItem(ITEM, MEMBER);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("rejects a non-uuid completedByMemberId", async () => {
    primeAuth(USER);
    const res = await completeShoppingItem(ITEM, "nope");
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });
});

describe("removeShoppingItem", () => {
  it("calls setItemRemoved with the SERVER-resolved actor and an ISO timestamp", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);

    const res = await removeShoppingItem(ITEM);
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    const arg = update?.arg as { removed_by_trip_member_id: string; removed_at: string };
    expect(arg.removed_by_trip_member_id).toBe(MEMBER);
    expect(new Date(arg.removed_at).toISOString()).toBe(arg.removed_at);
  });

  it("returns rls_denied when the item isn't visible", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null }]);
    const res = await removeShoppingItem(ITEM);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("rejects a non-uuid item id", async () => {
    primeAuth(USER);
    const res = await removeShoppingItem("nope");
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });
});

describe("reopenShoppingItem", () => {
  it("assignTo=other member: claim_assigned_by is the actor", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: { id: OTHER_MEMBER }, error: null }, // isSameTripMember(assignTo)
    ]);

    const res = await reopenShoppingItem(ITEM, { assignTo: OTHER_MEMBER });
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toEqual({
      bought: false,
      completed_by_trip_member_id: null,
      removed_by_trip_member_id: null,
      removed_at: null,
      claimed_by_trip_member_id: OTHER_MEMBER,
      claim_assigned_by_trip_member_id: MEMBER,
    });
    expect(addShoppingCommentMock).not.toHaveBeenCalled();
  });

  it("assignTo=self: claim_assigned_by is null", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: { id: MEMBER }, error: null }, // isSameTripMember(assignTo)
    ]);

    const res = await reopenShoppingItem(ITEM, { assignTo: MEMBER });
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toMatchObject({
      claimed_by_trip_member_id: MEMBER,
      claim_assigned_by_trip_member_id: null,
    });
  });

  it("assignTo=null: both claim fields null, no isSameTripMember check needed", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);

    const res = await reopenShoppingItem(ITEM, { assignTo: null });
    expect(res).toEqual({ ok: true });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update?.arg).toMatchObject({
      claimed_by_trip_member_id: null,
      claim_assigned_by_trip_member_id: null,
    });
  });

  it("with a comment: calls addShoppingComment with itemId/body and the idempotency key", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [
      { data: { trip_id: TRIP }, error: null },
      { data: null, error: null, count: 1 },
    ]);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);

    const res = await reopenShoppingItem(
      ITEM,
      { assignTo: null, comment: "  back on the list  " },
      KEY
    );
    expect(res).toEqual({ ok: true });
    expect(addShoppingCommentMock).toHaveBeenCalledWith(
      { itemId: ITEM, body: "back on the list" },
      KEY
    );
  });

  it("comment present but no idempotency key: validation_failed, no write", async () => {
    primeAuth(USER);
    const res = await reopenShoppingItem(ITEM, { assignTo: null, comment: "note" });
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update).toBeUndefined();
    expect(addShoppingCommentMock).not.toHaveBeenCalled();
  });

  it("rejects a cross-trip assignTo target and never calls the setter", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [
      { data: { id: MEMBER }, error: null }, // actor resolve
      { data: null, error: null }, // isSameTripMember(assignTo) — not found
    ]);

    const res = await reopenShoppingItem(ITEM, { assignTo: OTHER_MEMBER });
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });

    const update = capturedWrites.find(
      (w) => w.table === "shopping_list_items" && w.op === "update"
    );
    expect(update).toBeUndefined();
    expect(addShoppingCommentMock).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid item id", async () => {
    primeAuth(USER);
    const res = await reopenShoppingItem("nope", { assignTo: null });
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });
});

// I12: no shopping-list action calls redirect() — router.refresh() is the
// caller's job, per notes on the callAction contract.
describe("no action calls redirect (I12)", () => {
  it("never invokes next/navigation redirect across the surface (all 9 mutations)", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
    tableQueues.set("shopping_list_items", [{ data: mockItem, error: null, count: 1 }]);

    await addShoppingItem({ tripId: TRIP, name: "Sunscreen" }, KEY);
    await toggleBought(ITEM, true);
    await setClaim(ITEM, true);
    await amendShoppingItem(ITEM, { name: "New name" });
    await deleteShoppingItem(ITEM);
    await assignShoppingItem(ITEM, null);
    await completeShoppingItem(ITEM, MEMBER);
    await removeShoppingItem(ITEM);
    await reopenShoppingItem(ITEM, { assignTo: null });

    expect(redirectMock).not.toHaveBeenCalled();
  });
});
