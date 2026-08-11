/**
 * Tests for `lib/actions/shopping-item-comments.ts` (P2-T4).
 * TDD: written before implementation (RED phase).
 *
 * Covers `addShoppingComment` (idempotent insert; 23505 re-select; two
 * different idempotency keys → two rows; validation; 42501/other/codeless
 * error split; hidden-parent rls_denied) and `deleteShoppingComment`
 * (success envelope; 42501 → rls_denied; no-row → ok:true, matching
 * `deleteShoppingItem`'s precedent). Also asserts I12 (no revalidatePath,
 * no redirect).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

// Queue-aware resolver, cloned from shopping-list.test.ts: successive calls
// to the same table pop the next queued result (falls back to the last),
// so a flow that hits `shopping_item_comments` twice (insert-then-re-select
// on a 23505 replay) can return different rows.
const tableQueues = new Map<
  string,
  Array<{ data: unknown; error: unknown; count?: number | null }>
>();
const capturedWrites: Array<{ table: string; op: string; arg: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => buildClient()),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
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
          if (prop === "insert" || prop === "delete") {
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
const KEY2 = "66666666-6666-4666-8666-666666666666";
const USER = "55555555-5555-4555-8555-555555555555";
const COMMENT_ID = "77777777-7777-4777-8777-777777777777";

const mockComment = {
  id: COMMENT_ID,
  item_id: ITEM,
  trip_id: TRIP,
  author_trip_member_id: MEMBER,
  body: "Grab the good tequila",
  idempotency_key: KEY,
  created_at: "2026-08-11T10:00:00.000Z",
};

/** Primes the item-lookup + member-lookup pair every action resolves first. */
function primeItemAndMember() {
  tableQueues.set("shopping_list_items", [{ data: { trip_id: TRIP }, error: null }]);
  tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
}

let addShoppingComment: typeof import("../shopping-item-comments").addShoppingComment;
let deleteShoppingComment: typeof import("../shopping-item-comments").deleteShoppingComment;

beforeEach(async () => {
  getUserMock.mockReset();
  tableQueues.clear();
  capturedWrites.length = 0;
  rateLimitedActionMock.mockClear();
  revalidatePathMock.mockReset();
  redirectMock.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const mod = await import("../shopping-item-comments");
  addShoppingComment = mod.addShoppingComment;
  deleteShoppingComment = mod.deleteShoppingComment;
});
afterEach(() => vi.resetModules());

describe("addShoppingComment", () => {
  it("rejects a bad idempotency key", async () => {
    primeAuth(USER);
    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, "not-a-uuid");
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a blank/whitespace-only body", async () => {
    primeAuth(USER);
    const res = await addShoppingComment({ itemId: ITEM, body: "   " }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a body over 500 chars", async () => {
    primeAuth(USER);
    const res = await addShoppingComment(
      { itemId: ITEM, body: "x".repeat(501) },
      KEY
    );
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when unauthenticated", async () => {
    primeAuth(null);
    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the parent item is invisible (hidden parent)", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: null, error: null }]);
    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the caller has no member row", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_list_items", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [{ data: null, error: null }]);
    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("inserts and returns ok:true on a fresh add", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("shopping_item_comments", [{ data: mockComment, error: null }]);

    const res = await addShoppingComment(
      { itemId: ITEM, body: "Grab the good tequila" },
      KEY
    );
    expect(res).toEqual({ ok: true, comment: mockComment });

    const insert = capturedWrites.find(
      (w) => w.table === "shopping_item_comments" && w.op === "insert"
    );
    expect(insert?.arg).toMatchObject({
      item_id: ITEM,
      trip_id: TRIP,
      author_trip_member_id: MEMBER,
      body: "Grab the good tequila",
      idempotency_key: KEY,
    });
  });

  it("re-selects on idempotency replay (23505) and returns the existing row", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("shopping_item_comments", [
      { data: null, error: { code: "23505", message: "dup" } },
      { data: mockComment, error: null },
    ]);

    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: true, comment: mockComment });
  });

  it("two sequential adds with DIFFERENT idempotency keys insert two separate rows", async () => {
    primeAuth(USER);
    primeItemAndMember();
    const secondComment = { ...mockComment, id: "88888888-8888-4888-8888-888888888888", idempotency_key: KEY2 };
    tableQueues.set("shopping_item_comments", [
      { data: mockComment, error: null },
      { data: secondComment, error: null },
    ]);

    const first = await addShoppingComment({ itemId: ITEM, body: "First note" }, KEY);
    // Re-prime member/item lookups for the second call (fresh action invocation).
    primeItemAndMember();
    const second = await addShoppingComment({ itemId: ITEM, body: "Second note" }, KEY2);

    expect(first).toEqual({ ok: true, comment: mockComment });
    expect(second).toEqual({ ok: true, comment: secondComment });

    const inserts = capturedWrites.filter(
      (w) => w.table === "shopping_item_comments" && w.op === "insert"
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.arg).toMatchObject({ idempotency_key: KEY });
    expect(inserts[1]?.arg).toMatchObject({ idempotency_key: KEY2 });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("shopping_item_comments", [
      { data: null, error: { code: "42501", message: "denied" } },
    ]);
    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns shopping_comment_save_rejected on a coded error", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("shopping_item_comments", [
      { data: null, error: { code: "23514", message: "check constraint" } },
    ]);
    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "shopping_comment_save_rejected" });
  });

  it("returns shopping_comment_save_failed on a codeless error", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("shopping_item_comments", [
      { data: null, error: { code: "", message: "network hiccup" } },
    ]);
    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "shopping_comment_save_failed" });
  });

  it("surfaces a rate-limit rejection", async () => {
    primeAuth(USER);
    primeItemAndMember();
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("mutateShoppingItem", { reset: 0, remaining: 0 })
    );
    const res = await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});

describe("deleteShoppingComment", () => {
  it("returns ok:true on a successful delete", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_item_comments", [{ data: null, error: null, count: 1 }]);
    const res = await deleteShoppingComment(COMMENT_ID);
    expect(res).toEqual({ ok: true });
  });

  it("rejects a non-uuid comment id", async () => {
    primeAuth(USER);
    const res = await deleteShoppingComment("nope");
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_item_comments", [
      { data: null, error: { code: "42501", message: "denied" } },
    ]);
    const res = await deleteShoppingComment(COMMENT_ID);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  // Matches deleteShoppingItem's precedent (lib/actions/shopping-list.ts):
  // a no-row match on delete has only one honest reading — the desired end
  // state (gone) is already true — so it converges to ok:true rather than
  // the shared rls_denied collapse.
  it("is idempotent on double-tap: a no-row match converges to ok:true", async () => {
    primeAuth(USER);
    tableQueues.set("shopping_item_comments", [{ data: null, error: null, count: 0 }]);
    const res = await deleteShoppingComment(COMMENT_ID);
    expect(res).toEqual({ ok: true });
  });
});

// I12: neither action calls revalidatePath or redirect — router.refresh()
// is the caller's job.
describe("no revalidatePath / no redirect (I12)", () => {
  it("never invokes revalidatePath or redirect across the surface", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("shopping_item_comments", [
      { data: mockComment, error: null, count: 1 },
    ]);

    await addShoppingComment({ itemId: ITEM, body: "hi" }, KEY);
    await deleteShoppingComment(COMMENT_ID);

    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
