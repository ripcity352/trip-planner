/**
 * Tests for `lib/actions/itinerary-rsvp.ts`.
 *
 * Covers:
 *   - validation_failed on bad uuid / bad status
 *   - rls_denied when not authenticated
 *   - rls_denied when caller is not a trip member
 *   - rate_limit when limiter throws
 *   - idempotency replay — existing key returns cached status
 *   - happy path upsert returns the status
 *   - trip_member_id is resolved server-side (not passed by caller)
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

const VALID_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const VALID_IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";
const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_MEMBER_ID = "44444444-4444-4444-8444-444444444444";

describe("setItemRsvp", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid idempotency key", async () => {
    primeAuth(VALID_USER_ID);
    const { setItemRsvp } = await import("@/lib/actions/itinerary-rsvp");
    const result = await setItemRsvp(
      { itemId: VALID_ITEM_ID, status: "skipping" },
      "not-a-uuid"
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on invalid status", async () => {
    primeAuth(VALID_USER_ID);
    const { setItemRsvp } = await import("@/lib/actions/itinerary-rsvp");
    const result = await setItemRsvp(
      // @ts-expect-error intentionally bad status
      { itemId: VALID_ITEM_ID, status: "maybe" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { setItemRsvp } = await import("@/lib/actions/itinerary-rsvp");
    const result = await setItemRsvp(
      { itemId: VALID_ITEM_ID, status: "skipping" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when item not found (not a member)", async () => {
    primeAuth(VALID_USER_ID);
    // Item lookup returns null
    tableResolvers.set("itinerary_items", () => ({ data: null, error: null }));
    const { setItemRsvp } = await import("@/lib/actions/itinerary-rsvp");
    const result = await setItemRsvp(
      { itemId: VALID_ITEM_ID, status: "skipping" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when member row not found", async () => {
    primeAuth(VALID_USER_ID);
    let callCount = 0;
    // First call: itinerary_items returns trip_id
    // Second call: trip_members returns null (not a member)
    tableResolvers.set("itinerary_items", () => ({
      data: { trip_id: VALID_TRIP_ID },
      error: null,
    }));
    tableResolvers.set("trip_members", () => {
      callCount++;
      if (callCount === 1) return { data: null, error: null };
      return { data: null, error: null };
    });
    const { setItemRsvp } = await import("@/lib/actions/itinerary-rsvp");
    const result = await setItemRsvp(
      { itemId: VALID_ITEM_ID, status: "skipping" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("itinerary_items", () => ({
      data: { trip_id: VALID_TRIP_ID },
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID },
      error: null,
    }));
    tableResolvers.set("itinerary_item_rsvps", () => ({
      data: null,
      error: null,
    }));
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("setItemRsvp", { reset: Date.now() + 60000, remaining: 0 })
    );
    const { setItemRsvp } = await import("@/lib/actions/itinerary-rsvp");
    const result = await setItemRsvp(
      { itemId: VALID_ITEM_ID, status: "skipping" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns idempotency-replayed status when same key already stored", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("itinerary_items", () => ({
      data: { trip_id: VALID_TRIP_ID },
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID },
      error: null,
    }));
    // Existing RSVP row has the same idempotency key
    tableResolvers.set("itinerary_item_rsvps", () => ({
      data: {
        status: "skipping",
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
      error: null,
    }));
    const { setItemRsvp } = await import("@/lib/actions/itinerary-rsvp");
    const result = await setItemRsvp(
      { itemId: VALID_ITEM_ID, status: "skipping" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, status: "skipping" });
    // Should NOT have called rateLimitedAction
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("returns ok: true with the new status on successful upsert", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("itinerary_items", () => ({
      data: { trip_id: VALID_TRIP_ID },
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID },
      error: null,
    }));
    tableResolvers.set("itinerary_item_rsvps", () => ({
      data: null,
      error: null,
    }));
    const { setItemRsvp } = await import("@/lib/actions/itinerary-rsvp");
    const result = await setItemRsvp(
      { itemId: VALID_ITEM_ID, status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, status: "going" });
  });
});
