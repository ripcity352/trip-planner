/**
 * Tests for `lib/actions/itinerary.ts`.
 *
 * Covers:
 *   - validation_failed on bad uuid / missing required fields
 *   - rls_denied when not authenticated
 *   - rate_limit when limiter throws
 *   - happy path addItineraryItem returns the new item
 *   - idempotency replay (23505) fetches and returns existing row
 *   - updateItineraryItem happy path
 *   - deleteItineraryItem happy path
 *   - deleteItineraryItem — validation_failed on non-uuid itemId
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const getUserMock = vi.fn();
const tableResolvers = new Map<
  string,
  () => { data: unknown; error: unknown }
>();
const insertCalls: Array<{ table: string; payload: unknown }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];
const deleteCalls: Array<{ table: string }> = [];

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
        const result = resolver
          ? resolver()
          : { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "insert") {
          return (payload: unknown) => {
            insertCalls.push({ table, payload });
            return proxy;
          };
        }
        if (prop === "update") {
          return (payload: unknown) => {
            updateCalls.push({ table, payload });
            return proxy;
          };
        }
        if (prop === "delete") {
          return () => {
            deleteCalls.push({ table });
            return proxy;
          };
        }
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const VALID_IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";

const mockItem = {
  id: VALID_ITEM_ID,
  trip_id: VALID_TRIP_ID,
  day: "2026-06-15",
  start_time: null,
  end_time: null,
  title: "Dinner",
  location: null,
  address: null,
  notes: null,
  cost_cents: null,
  currency: "USD",
  created_by: VALID_USER_ID,
  created_at: "2026-05-20T00:00:00.000Z",
  updated_at: "2026-05-20T00:00:00.000Z",
  visibility: "everyone",
  kind: "meal",
  activity_tag: [],
  dress_code: null,
  idempotency_key: VALID_IDEMPOTENCY_KEY,
};

// ---------------------------------------------------------------------------
// addItineraryItem
// ---------------------------------------------------------------------------

describe("addItineraryItem", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    updateCalls.length = 0;
    deleteCalls.length = 0;
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid idempotency key", async () => {
    primeAuth(VALID_USER_ID);
    const { addItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await addItineraryItem(
      { tripId: VALID_TRIP_ID, title: "Dinner", kind: "meal", day: "2026-06-15" },
      "not-a-uuid"
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed when title is missing", async () => {
    primeAuth(VALID_USER_ID);
    const { addItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await addItineraryItem(
      // @ts-expect-error intentionally missing title
      { tripId: VALID_TRIP_ID, kind: "meal", day: "2026-06-15" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed when day is not YYYY-MM-DD", async () => {
    primeAuth(VALID_USER_ID);
    const { addItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await addItineraryItem(
      { tripId: VALID_TRIP_ID, title: "Dinner", kind: "meal", day: "June 15" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { addItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await addItineraryItem(
      { tripId: VALID_TRIP_ID, title: "Dinner", kind: "meal", day: "2026-06-15" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("createItineraryItem", { reset: Date.now() + 60000, remaining: 0 })
    );
    const { addItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await addItineraryItem(
      { tripId: VALID_TRIP_ID, title: "Dinner", kind: "meal", day: "2026-06-15" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns the new item on success", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("itinerary_items", () => ({
      data: mockItem,
      error: null,
    }));
    const { addItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await addItineraryItem(
      { tripId: VALID_TRIP_ID, title: "Dinner", kind: "meal", day: "2026-06-15" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, item: mockItem });
  });

  it("returns existing item on idempotency replay (23505)", async () => {
    primeAuth(VALID_USER_ID);
    let callCount = 0;
    tableResolvers.set("itinerary_items", () => {
      callCount++;
      if (callCount === 1) {
        // First call: insert fails with unique constraint
        return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      // Second call: fetch existing returns the item
      return { data: mockItem, error: null };
    });
    const { addItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await addItineraryItem(
      { tripId: VALID_TRIP_ID, title: "Dinner", kind: "meal", day: "2026-06-15" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, item: mockItem });
  });

  it("returns itinerary_save_failed on generic DB error", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("itinerary_items", () => ({
      data: null,
      error: { code: "XXXXX", message: "unexpected" },
    }));
    const { addItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await addItineraryItem(
      { tripId: VALID_TRIP_ID, title: "Dinner", kind: "meal", day: "2026-06-15" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "itinerary_save_failed" });
  });
});

// ---------------------------------------------------------------------------
// updateItineraryItem — W2a address place_id fields
// ---------------------------------------------------------------------------

describe("updateItineraryItem — address place fields", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    updateCalls.length = 0;
    deleteCalls.length = 0;
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("persists addressPlaceId and addressProvider when both are set (autocomplete selection)", async () => {
    primeAuth(VALID_USER_ID);
    const mockItemWithPlace = {
      ...mockItem,
      address: "123 Main St, Las Vegas, NV",
      address_place_id: "place-abc",
      address_provider: "google",
    };
    tableResolvers.set("itinerary_items", () => ({
      data: mockItemWithPlace,
      error: null,
    }));
    const { updateItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await updateItineraryItem(
      {
        itemId: VALID_ITEM_ID,
        address: "123 Main St, Las Vegas, NV",
        addressPlaceId: "place-abc",
        addressProvider: "google",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, item: mockItemWithPlace });
    // Verify the update payload includes place fields
    const payload = updateCalls[0]?.payload as Record<string, unknown>;
    expect(payload.address_place_id).toBe("place-abc");
    expect(payload.address_provider).toBe("google");
  });

  it("persists address only when addressPlaceId and addressProvider are null (freeform)", async () => {
    primeAuth(VALID_USER_ID);
    const mockItemFreeform = {
      ...mockItem,
      address: "Somewhere cool",
      address_place_id: null,
      address_provider: null,
    };
    tableResolvers.set("itinerary_items", () => ({
      data: mockItemFreeform,
      error: null,
    }));
    const { updateItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await updateItineraryItem(
      {
        itemId: VALID_ITEM_ID,
        address: "Somewhere cool",
        addressPlaceId: null,
        addressProvider: null,
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, item: mockItemFreeform });
    const payload = updateCalls[0]?.payload as Record<string, unknown>;
    expect(payload.address_place_id).toBeNull();
    expect(payload.address_provider).toBeNull();
  });

  it("returns validation_failed when addressPlaceId exceeds 255 chars", async () => {
    primeAuth(VALID_USER_ID);
    const { updateItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await updateItineraryItem(
      {
        itemId: VALID_ITEM_ID,
        addressPlaceId: "x".repeat(256),
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed when addressProvider is not 'google'", async () => {
    primeAuth(VALID_USER_ID);
    const { updateItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await updateItineraryItem(
      {
        itemId: VALID_ITEM_ID,
        // @ts-expect-error intentionally invalid provider
        addressProvider: "bing",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });
});

// ---------------------------------------------------------------------------
// deleteItineraryItem
// ---------------------------------------------------------------------------

describe("deleteItineraryItem", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    deleteCalls.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid itemId", async () => {
    primeAuth(VALID_USER_ID);
    const { deleteItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await deleteItineraryItem("not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { deleteItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await deleteItineraryItem(VALID_ITEM_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns ok: true on successful delete", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("itinerary_items", () => ({ data: null, error: null }));
    const { deleteItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await deleteItineraryItem(VALID_ITEM_ID);
    expect(result).toEqual({ ok: true });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("itinerary_items", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const { deleteItineraryItem } = await import("@/lib/actions/itinerary");
    const result = await deleteItineraryItem(VALID_ITEM_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});
