/**
 * Tests for `updateTripAction` (dashboard-header name/location edit).
 *
 * The db layer is mocked at the module boundary (its query shape has its
 * own suite in lib/db/__tests__/trips.test.ts). Here we pin the rule-9
 * idempotency-key validation, zod bounds (name 1..100, location ≤ 200,
 * empty location → null), auth, the honest rls_denied mapping when the
 * .select()-chained write comes back empty, revalidation, the rate-limit
 * scope, and error mapping. Kept in its own file (not trips.test.ts) so
 * the createTripAction suite stays focused.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitError, RATE_LIMIT_SCOPES } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const updateTripMock = vi.fn();
vi.mock("@/lib/db/trips", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/trips")>(
    "@/lib/db/trips"
  );
  return {
    ...actual,
    updateTrip: (...args: unknown[]) => updateTripMock(...(args as [])),
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

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const TRIP_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const KEY = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c99";

const VALID_INPUT = {
  tripId: TRIP_ID,
  name: "Vegas, but louder",
  location: "Las Vegas, NV",
};

function resetMocks() {
  getUserMock.mockReset();
  createClientMock.mockReset();
  updateTripMock.mockReset();
  rateLimitedActionMock.mockClear();
  revalidatePathMock.mockReset();

  createClientMock.mockResolvedValue({ auth: { getUser: getUserMock } });
  getUserMock.mockResolvedValue({
    data: { user: { id: "u-viewer" } },
    error: null,
  });
  updateTripMock.mockResolvedValue({ id: TRIP_ID, name: VALID_INPUT.name });
  vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("updateTripAction", () => {
  beforeEach(resetMocks);

  it("rejects a non-UUID idempotency key", async () => {
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(VALID_INPUT, "not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(updateTripMock).not.toHaveBeenCalled();
  });

  it("rejects an empty / whitespace-only name", async () => {
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(
      { ...VALID_INPUT, name: "   " },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(updateTripMock).not.toHaveBeenCalled();
  });

  it("rejects a location over 200 chars", async () => {
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(
      { ...VALID_INPUT, location: "x".repeat(201) },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(updateTripMock).not.toHaveBeenCalled();
  });

  it("returns auth_failed when there is no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(VALID_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
    expect(updateTripMock).not.toHaveBeenCalled();
  });

  it("writes trimmed values, converts empty location to null, and revalidates", async () => {
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(
      { tripId: TRIP_ID, name: "  Cabo  ", location: "   " },
      KEY
    );

    expect(result).toEqual({ ok: true });
    expect(updateTripMock).toHaveBeenCalledWith(expect.anything(), TRIP_ID, {
      name: "Cabo",
      location: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
    // Own rate-limit bucket — header edits must not starve other budgets.
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      RATE_LIMIT_SCOPES.UPDATE_TRIP,
      "u-viewer",
      expect.any(Function)
    );
  });

  it("accepts an omitted location (treated as clearing the field)", async () => {
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(
      { tripId: TRIP_ID, name: "Cabo" },
      KEY
    );
    expect(result).toEqual({ ok: true });
    expect(updateTripMock).toHaveBeenCalledWith(expect.anything(), TRIP_ID, {
      name: "Cabo",
      location: null,
    });
  });

  it("maps a policy-swallowed write (null row back) to rls_denied — no fake success", async () => {
    updateTripMock.mockResolvedValue(null);
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(VALID_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("maps RateLimitError to rate_limit", async () => {
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("updateTrip", { reset: 0, remaining: 0 })
    );
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(VALID_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("maps an unexpected db throw to trip_update_failed", async () => {
    updateTripMock.mockRejectedValueOnce(new Error("boom"));
    const { updateTripAction } = await import("@/lib/actions/trips");
    const result = await updateTripAction(VALID_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "trip_update_failed" });
  });
});
