/**
 * Tests for `lib/actions/item-flags.ts`.
 *
 * Covers:
 *   - validation_failed on bad input
 *   - rls_denied when not authenticated or not a member
 *   - rate_limit when limiter throws
 *   - addItemFlag happy path
 *   - addItemFlag idempotent on 23505 (returns ok: true)
 *   - removeItemFlag happy path
 *   - flag is freeform text (any non-empty string accepted)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const tableResolvers = new Map<
  string,
  () => { data: unknown; error: unknown }
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

function buildClient(): unknown {
  const tableProxy = (table: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const resolver = tableResolvers.get(table);
        const result = resolver ? resolver() : { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        return () => proxy;
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
  tableResolvers.set("itinerary_items", () => ({
    data: { trip_id: tripId },
    error: null,
  }));
  tableResolvers.set("trip_members", () => ({
    data: { id: memberId },
    error: null,
  }));
}

const VALID_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";
const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_MEMBER_ID = "44444444-4444-4444-8444-444444444444";

describe("addItemFlag", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid itemId", async () => {
    primeAuth(VALID_USER_ID);
    const { addItemFlag } = await import("@/lib/actions/item-flags");
    const result = await addItemFlag({ itemId: "not-a-uuid", flag: "vegan" });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on empty flag", async () => {
    primeAuth(VALID_USER_ID);
    const { addItemFlag } = await import("@/lib/actions/item-flags");
    const result = await addItemFlag({ itemId: VALID_ITEM_ID, flag: "" });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { addItemFlag } = await import("@/lib/actions/item-flags");
    const result = await addItemFlag({ itemId: VALID_ITEM_ID, flag: "vegan" });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when caller is not a trip member", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("itinerary_items", () => ({
      data: null,
      error: null,
    }));
    const { addItemFlag } = await import("@/lib/actions/item-flags");
    const result = await addItemFlag({ itemId: VALID_ITEM_ID, flag: "vegan" });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    primeItemAndMember(VALID_TRIP_ID, VALID_MEMBER_ID);
    tableResolvers.set("itinerary_item_member_flags", () => ({
      data: null,
      error: null,
    }));
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("setItemFlag", { reset: Date.now() + 60000, remaining: 0 })
    );
    const { addItemFlag } = await import("@/lib/actions/item-flags");
    const result = await addItemFlag({ itemId: VALID_ITEM_ID, flag: "vegan" });
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns ok: true on successful insert", async () => {
    primeAuth(VALID_USER_ID);
    primeItemAndMember(VALID_TRIP_ID, VALID_MEMBER_ID);
    tableResolvers.set("itinerary_item_member_flags", () => ({
      data: null,
      error: null,
    }));
    const { addItemFlag } = await import("@/lib/actions/item-flags");
    const result = await addItemFlag({
      itemId: VALID_ITEM_ID,
      flag: "vegan",
      note: "no dairy",
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok: true on 23505 (flag already exists — idempotent)", async () => {
    primeAuth(VALID_USER_ID);
    primeItemAndMember(VALID_TRIP_ID, VALID_MEMBER_ID);
    tableResolvers.set("itinerary_item_member_flags", () => ({
      data: null,
      error: { code: "23505", message: "duplicate" },
    }));
    const { addItemFlag } = await import("@/lib/actions/item-flags");
    const result = await addItemFlag({ itemId: VALID_ITEM_ID, flag: "vegan" });
    expect(result).toEqual({ ok: true });
  });

  it("accepts freeform flag values (no enum restriction)", async () => {
    primeAuth(VALID_USER_ID);
    primeItemAndMember(VALID_TRIP_ID, VALID_MEMBER_ID);
    tableResolvers.set("itinerary_item_member_flags", () => ({
      data: null,
      error: null,
    }));
    const { addItemFlag } = await import("@/lib/actions/item-flags");
    // Any freeform string is valid
    for (const flag of ["vegan", "sober", "late-arrival", "need-rides", "allergic-to-shellfish"]) {
      const result = await addItemFlag({ itemId: VALID_ITEM_ID, flag });
      expect(result.ok).toBe(true);
    }
  });
});

describe("removeItemFlag", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid itemId", async () => {
    primeAuth(VALID_USER_ID);
    const { removeItemFlag } = await import("@/lib/actions/item-flags");
    const result = await removeItemFlag("not-a-uuid", "vegan");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on empty flag", async () => {
    primeAuth(VALID_USER_ID);
    const { removeItemFlag } = await import("@/lib/actions/item-flags");
    const result = await removeItemFlag(VALID_ITEM_ID, "");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { removeItemFlag } = await import("@/lib/actions/item-flags");
    const result = await removeItemFlag(VALID_ITEM_ID, "vegan");
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns ok: true on successful delete", async () => {
    primeAuth(VALID_USER_ID);
    primeItemAndMember(VALID_TRIP_ID, VALID_MEMBER_ID);
    tableResolvers.set("itinerary_item_member_flags", () => ({
      data: null,
      error: null,
    }));
    const { removeItemFlag } = await import("@/lib/actions/item-flags");
    const result = await removeItemFlag(VALID_ITEM_ID, "vegan");
    expect(result).toEqual({ ok: true });
  });
});
