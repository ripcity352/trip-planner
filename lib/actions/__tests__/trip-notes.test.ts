/**
 * Tests for `lib/actions/trip-notes.ts`.
 *
 * Covers:
 *   - validation_failed on bad tripId
 *   - rls_denied when not authenticated
 *   - rate_limit when limiter throws
 *   - ok: true on success (notes set and notes: null)
 *   - rls_denied on 42501
 *   - trip_notes_save_failed on generic DB error
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const tableResolvers = new Map<
  string,
  () => { data: unknown; error: unknown }
>();
const updateCalls: Array<{ table: string; payload: unknown }> = [];

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
        if (prop === "update") {
          return (payload: unknown) => {
            updateCalls.push({ table, payload });
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

const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";

describe("setTripNotes", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    updateCalls.length = 0;
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid tripId", async () => {
    primeAuth(VALID_USER_ID);
    const { setTripNotes } = await import("@/lib/actions/trip-notes");
    const result = await setTripNotes({ tripId: "not-a-uuid", notes: "Hi" });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { setTripNotes } = await import("@/lib/actions/trip-notes");
    const result = await setTripNotes({ tripId: VALID_TRIP_ID, notes: "Hi" });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("updateTripNotes", { reset: Date.now() + 60000, remaining: 0 })
    );
    const { setTripNotes } = await import("@/lib/actions/trip-notes");
    const result = await setTripNotes({ tripId: VALID_TRIP_ID, notes: "Hi" });
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns ok: true on successful notes update", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trips", () => ({ data: null, error: null }));
    const { setTripNotes } = await import("@/lib/actions/trip-notes");
    const result = await setTripNotes({
      tripId: VALID_TRIP_ID,
      notes: "Bring sunscreen.",
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok: true when clearing notes (null)", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trips", () => ({ data: null, error: null }));
    const { setTripNotes } = await import("@/lib/actions/trip-notes");
    const result = await setTripNotes({ tripId: VALID_TRIP_ID, notes: null });
    expect(result).toEqual({ ok: true });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trips", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const { setTripNotes } = await import("@/lib/actions/trip-notes");
    const result = await setTripNotes({
      tripId: VALID_TRIP_ID,
      notes: "Hi",
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns trip_notes_save_failed on generic DB error", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trips", () => ({
      data: null,
      error: { code: "XXXXX", message: "unexpected" },
    }));
    const { setTripNotes } = await import("@/lib/actions/trip-notes");
    const result = await setTripNotes({ tripId: VALID_TRIP_ID, notes: "Hi" });
    expect(result).toEqual({ ok: false, errorKey: "trip_notes_save_failed" });
  });

  it("validates notes max length (10000 chars)", async () => {
    primeAuth(VALID_USER_ID);
    const { setTripNotes } = await import("@/lib/actions/trip-notes");
    const result = await setTripNotes({
      tripId: VALID_TRIP_ID,
      notes: "x".repeat(10_001),
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });
});
