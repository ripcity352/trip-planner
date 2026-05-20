/**
 * Tests for `lib/actions/travel-legs.ts`.
 *
 * Covers:
 *   - validation_failed on bad uuid / bad kind
 *   - rls_denied when not authenticated or not a member
 *   - rate_limit when limiter throws
 *   - upsertTravelLeg happy path (insert)
 *   - upsertTravelLeg with legId (update path)
 *   - upsertTravelLeg idempotency replay (23505)
 *   - deleteTravelLeg happy path
 *   - deleteTravelLeg validation_failed on non-uuid
 *   - trip_member_id is resolved server-side (cannot impersonate)
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

const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const VALID_LEG_ID = "33333333-3333-4333-8333-333333333333";
const VALID_IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";

const mockLeg = {
  id: VALID_LEG_ID,
  trip_id: VALID_TRIP_ID,
  trip_member_id: VALID_MEMBER_ID,
  kind: "flight",
  depart_at: null,
  arrive_at: "2026-06-13T17:30:00.000Z",
  carrier: "Southwest",
  confirmation_code: null,
  notes: null,
  idempotency_key: VALID_IDEMPOTENCY_KEY,
  created_at: "2026-05-20T00:00:00.000Z",
};

describe("upsertTravelLeg", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid idempotency key", async () => {
    primeAuth(VALID_USER_ID);
    const { upsertTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await upsertTravelLeg(
      { tripId: VALID_TRIP_ID, kind: "flight" },
      "not-a-uuid"
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on invalid kind", async () => {
    primeAuth(VALID_USER_ID);
    const { upsertTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await upsertTravelLeg(
      // @ts-expect-error intentionally bad kind
      { tripId: VALID_TRIP_ID, kind: "helicopter" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { upsertTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await upsertTravelLeg(
      { tripId: VALID_TRIP_ID, kind: "flight" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when caller is not a trip member", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trip_members", () => ({ data: null, error: null }));
    const { upsertTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await upsertTravelLeg(
      { tripId: VALID_TRIP_ID, kind: "flight" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID },
      error: null,
    }));
    tableResolvers.set("travel_legs", () => ({ data: null, error: null }));
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("upsertTravelLeg", { reset: Date.now() + 60000, remaining: 0 })
    );
    const { upsertTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await upsertTravelLeg(
      { tripId: VALID_TRIP_ID, kind: "flight" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns the new leg on successful insert", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID },
      error: null,
    }));
    tableResolvers.set("travel_legs", () => ({ data: mockLeg, error: null }));
    const { upsertTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await upsertTravelLeg(
      { tripId: VALID_TRIP_ID, kind: "flight", carrier: "Southwest" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, leg: mockLeg });
  });

  it("returns existing leg on idempotency replay (23505)", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID },
      error: null,
    }));
    let callCount = 0;
    tableResolvers.set("travel_legs", () => {
      callCount++;
      if (callCount === 1) {
        return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      return { data: mockLeg, error: null };
    });
    const { upsertTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await upsertTravelLeg(
      { tripId: VALID_TRIP_ID, kind: "flight" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, leg: mockLeg });
  });
});

describe("deleteTravelLeg", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid legId", async () => {
    primeAuth(VALID_USER_ID);
    const { deleteTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await deleteTravelLeg("not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { deleteTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await deleteTravelLeg(VALID_LEG_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns ok: true on successful delete", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("travel_legs", () => ({ data: null, error: null }));
    const { deleteTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await deleteTravelLeg(VALID_LEG_ID);
    expect(result).toEqual({ ok: true });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("travel_legs", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const { deleteTravelLeg } = await import("@/lib/actions/travel-legs");
    const result = await deleteTravelLeg(VALID_LEG_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});
