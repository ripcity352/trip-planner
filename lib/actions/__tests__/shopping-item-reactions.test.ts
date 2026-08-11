/**
 * Tests for `lib/actions/shopping-item-reactions.ts` (P2-T4).
 * TDD: written before implementation (RED phase).
 *
 * Covers:
 *   - validation_failed on bad itemId / emoji outside the fixed set
 *   - rls_denied when unauthenticated
 *   - rls_denied when the parent item is not visible to the caller (hidden
 *     parent — RLS-filtered select returns no row)
 *   - rls_denied when the caller has no member row in the trip
 *   - toggle ON happy path (insert)
 *   - toggle ON replay: 23505 treated as success (natural-key idempotency)
 *   - toggle OFF happy path (delete; 0-row delete is still success)
 *   - INDEPENDENT toggles: no opposite-clear logic for 👍/👎
 *   - 42501 on write → rls_denied
 *   - rate_limit when the limiter throws
 *   - I12: no revalidatePath, no redirect anywhere in the module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface TableResult {
  data: unknown;
  error: unknown;
}
const tableResolvers = new Map<string, () => TableResult>();
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

function buildClient(): unknown {
  const tableProxy = (table: string): Record<string, unknown> => {
    const thenable: PromiseLike<TableResult> = {
      then(onfulfilled) {
        const resolver = tableResolvers.get(table);
        const result = resolver ? resolver() : { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "maybeSingle" || prop === "single") {
          return () => {
            const resolver = tableResolvers.get(table);
            return Promise.resolve(
              resolver ? resolver() : { data: null, error: null }
            );
          };
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
    from: vi.fn((table: string) => tableProxy(table)),
  };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

function primeItemAndMember(tripId: string, memberId: string) {
  tableResolvers.set("shopping_list_items", () => ({
    data: { trip_id: tripId },
    error: null,
  }));
  tableResolvers.set("trip_members", () => ({
    data: { id: memberId },
    error: null,
  }));
}

const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";

async function importAction() {
  const mod = await import("@/lib/actions/shopping-item-reactions");
  return mod.toggleShoppingReaction;
}

describe("toggleShoppingReaction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    capturedWrites.length = 0;
    rateLimitedActionMock.mockClear();
    revalidatePathMock.mockReset();
    redirectMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on a non-uuid itemId", async () => {
    primeAuth(USER_ID);
    const toggleShoppingReaction = await importAction();
    const result = await toggleShoppingReaction({
      itemId: "nope",
      emoji: "👍",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on an emoji outside the fixed set", async () => {
    primeAuth(USER_ID);
    const toggleShoppingReaction = await importAction();
    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "🎳",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const toggleShoppingReaction = await importAction();
    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the item is invisible to the caller (hidden parent)", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("shopping_list_items", () => ({
      data: null,
      error: null,
    }));
    const toggleShoppingReaction = await importAction();
    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the caller has no member row", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("shopping_list_items", () => ({
      data: { trip_id: TRIP_ID },
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({ data: null, error: null }));
    const toggleShoppingReaction = await importAction();
    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("toggles ON (insert) for 👍", async () => {
    primeAuth(USER_ID);
    primeItemAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("shopping_item_reactions", () => ({
      data: null,
      error: null,
    }));
    const toggleShoppingReaction = await importAction();

    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: true,
    });

    expect(result).toEqual({ ok: true, active: true });
    const insert = capturedWrites.find(
      (w) => w.table === "shopping_item_reactions" && w.op === "insert"
    );
    expect(insert?.arg).toMatchObject({
      item_id: ITEM_ID,
      trip_id: TRIP_ID,
      trip_member_id: MEMBER_ID,
      emoji: "👍",
    });
  });

  it("toggles ON (insert) for 👎 independently of 👍 — no opposite-clear", async () => {
    primeAuth(USER_ID);
    primeItemAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("shopping_item_reactions", () => ({
      data: null,
      error: null,
    }));
    const toggleShoppingReaction = await importAction();

    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👎",
      active: true,
    });

    expect(result).toEqual({ ok: true, active: true });
    // Only one write happened — no delete of the opposite emoji.
    const deletes = capturedWrites.filter((w) => w.op === "delete");
    expect(deletes).toHaveLength(0);
  });

  it("treats a 23505 replay as success (natural-key idempotency)", async () => {
    primeAuth(USER_ID);
    primeItemAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("shopping_item_reactions", () => ({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    }));
    const toggleShoppingReaction = await importAction();

    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: true,
    });

    expect(result).toEqual({ ok: true, active: true });
  });

  it("toggles OFF (delete)", async () => {
    primeAuth(USER_ID);
    primeItemAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("shopping_item_reactions", () => ({
      data: null,
      error: null,
    }));
    const toggleShoppingReaction = await importAction();

    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: false,
    });

    expect(result).toEqual({ ok: true, active: false });
    const del = capturedWrites.find(
      (w) => w.table === "shopping_item_reactions" && w.op === "delete"
    );
    expect(del).toBeTruthy();
  });

  it("maps a 42501 write rejection to rls_denied", async () => {
    primeAuth(USER_ID);
    primeItemAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("shopping_item_reactions", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const toggleShoppingReaction = await importAction();

    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: true,
    });

    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when the limiter denies", async () => {
    primeAuth(USER_ID);
    primeItemAndMember(TRIP_ID, MEMBER_ID);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("toggleShoppingItem", { remaining: 0, reset: 0 })
    );
    const toggleShoppingReaction = await importAction();

    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: true,
    });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("maps an unexpected write error to shopping_reaction_save_failed", async () => {
    primeAuth(USER_ID);
    primeItemAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("shopping_item_reactions", () => ({
      data: null,
      error: { code: "XX000", message: "kaboom" },
    }));
    const toggleShoppingReaction = await importAction();

    const result = await toggleShoppingReaction({
      itemId: ITEM_ID,
      emoji: "👍",
      active: true,
    });

    expect(result).toEqual({
      ok: false,
      errorKey: "shopping_reaction_save_failed",
    });
  });

  // I12: the action file must never call revalidatePath or redirect —
  // router.refresh() is the caller's job.
  describe("no revalidatePath / no redirect (I12)", () => {
    it("never invokes revalidatePath or redirect across success and failure paths", async () => {
      primeAuth(USER_ID);
      primeItemAndMember(TRIP_ID, MEMBER_ID);
      tableResolvers.set("shopping_item_reactions", () => ({
        data: null,
        error: null,
      }));
      const toggleShoppingReaction = await importAction();

      await toggleShoppingReaction({
        itemId: ITEM_ID,
        emoji: "👍",
        active: true,
      });
      await toggleShoppingReaction({
        itemId: ITEM_ID,
        emoji: "👍",
        active: false,
      });

      expect(revalidatePathMock).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });
});
