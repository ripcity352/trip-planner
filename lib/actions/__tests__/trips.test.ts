/**
 * Tests for `lib/actions/trips.ts`.
 *
 * The `createTripAction` server action validates input with zod,
 * generates a slug from the name (with collision retry), wraps the DB
 * call in `rateLimitedAction`, then redirects to `/trips/<slug>` on
 * success.
 *
 * We mock every IO boundary:
 *   - `@/lib/db/trips` — the data-layer wrapper
 *   - `@/lib/supabase/server` — the Supabase server client factory
 *   - `@/lib/rate-limit` — partial-mock to expose `RateLimitError`
 *   - `next/navigation` — `redirect()` throws in production; we replicate
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const createTripMock = vi.fn();
const updateTripMock = vi.fn();
vi.mock("@/lib/db/trips", () => ({
  createTrip: (...args: unknown[]) => createTripMock(...args),
  updateTrip: (...args: unknown[]) => updateTripMock(...args),
}));

const getUserMock = vi.fn();
const supabaseClient = { auth: { getUser: getUserMock } };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supabaseClient),
}));

// We pass the real RateLimitError class through so the action's
// `instanceof` check still works, but override `rateLimitedAction` to
// just await the inner fn — the limiter is exercised in its own suite.
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

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

// `updateTripAction` calls `revalidatePath`, which needs a request-scope
// static-generation store outside a real Next request. No-op it here —
// the tests care about the action's return shape, not cache invalidation.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("createTripAction", () => {
  afterEach(() => {
    createTripMock.mockReset();
    getUserMock.mockReset();
    rateLimitedActionMock.mockClear();
    redirectMock.mockReset();
    // Re-prime redirect default
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  function primeAuth(userId: string | null) {
    getUserMock.mockResolvedValue(
      userId
        ? { data: { user: { id: userId } }, error: null }
        : { data: { user: null }, error: null }
    );
  }

  it("validates: returns validation_failed when name is empty", async () => {
    primeAuth("u-1");
    const { createTripAction } = await import("@/lib/actions/trips");

    const result = await createTripAction({ name: "" });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(createTripMock).not.toHaveBeenCalled();
  });

  it("validates: returns trip_dates_reversed when ends_at is before starts_at (#350/#405-D)", async () => {
    primeAuth("u-1");
    const { createTripAction } = await import("@/lib/actions/trips");

    const result = await createTripAction({
      name: "Vegas",
      starts_at: "2027-06-10",
      ends_at: "2027-06-01",
    });

    // #405-D: the specific reversed-dates key, not the generic collapse.
    expect(result).toEqual({ ok: false, errorKey: "trip_dates_reversed" });
    expect(createTripMock).not.toHaveBeenCalled();
  });

  it("validates: an empty (malformed) name still returns the generic validation_failed", async () => {
    primeAuth("u-1");
    const { createTripAction } = await import("@/lib/actions/trips");

    const result = await createTripAction({ name: "  " });

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(createTripMock).not.toHaveBeenCalled();
  });

  it("validates: accepts ends_at equal to starts_at (single-day trip)", async () => {
    primeAuth("u-1");
    createTripMock.mockResolvedValue({
      id: "trip-1",
      slug: "vegas",
      name: "Vegas",
    });
    const { createTripAction } = await import("@/lib/actions/trips");

    await expect(
      createTripAction({
        name: "Vegas",
        starts_at: "2027-06-10",
        ends_at: "2027-06-10",
      })
    ).rejects.toThrow("NEXT_REDIRECT:/trips/vegas");

    expect(createTripMock).toHaveBeenCalledTimes(1);
  });

  it("returns auth_failed when there is no signed-in user", async () => {
    primeAuth(null);
    const { createTripAction } = await import("@/lib/actions/trips");

    const result = await createTripAction({ name: "Vegas" });
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
    expect(createTripMock).not.toHaveBeenCalled();
  });

  it("calls createTrip and redirects to /trips/<slug> on success", async () => {
    primeAuth("u-1");
    createTripMock.mockResolvedValue({
      id: "trip-1",
      slug: "vegas-bach",
      name: "Vegas Bach",
    });

    const { createTripAction } = await import("@/lib/actions/trips");

    await expect(
      createTripAction({ name: "Vegas Bach" })
    ).rejects.toThrow("NEXT_REDIRECT:/trips/vegas-bach");

    expect(createTripMock).toHaveBeenCalledTimes(1);
    const [, input] = createTripMock.mock.calls[0];
    expect((input as { name: string }).name).toBe("Vegas Bach");
    // Slug should be derived from the name.
    expect((input as { slug: string }).slug).toMatch(/^vegas-bach/);

    expect(redirectMock).toHaveBeenCalledWith("/trips/vegas-bach");
  });

  it("wraps the DB call in rateLimitedAction with the CREATE_TRIP scope and the user id as key", async () => {
    primeAuth("u-1");
    createTripMock.mockResolvedValue({
      id: "trip-1",
      slug: "vegas-bach",
      name: "Vegas",
    });

    const { createTripAction } = await import("@/lib/actions/trips");

    await expect(
      createTripAction({ name: "Vegas" })
    ).rejects.toThrow("NEXT_REDIRECT:/trips/vegas-bach");

    expect(rateLimitedActionMock).toHaveBeenCalledTimes(1);
    const [scope, key] = rateLimitedActionMock.mock.calls[0];
    expect(scope).toBe("createTrip");
    expect(key).toBe("u-1");
  });

  it("returns rate_limit when the limiter throws RateLimitError", async () => {
    primeAuth("u-1");

    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("createTrip", { remaining: 0, reset: 0 })
    );

    const { createTripAction } = await import("@/lib/actions/trips");
    const result = await createTripAction({ name: "Vegas" });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns trip_create_failed on a generic DB error", async () => {
    primeAuth("u-1");
    createTripMock.mockRejectedValueOnce(new Error("boom"));

    const { createTripAction } = await import("@/lib/actions/trips");
    const result = await createTripAction({ name: "Vegas" });

    expect(result).toEqual({ ok: false, errorKey: "trip_create_failed" });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateTripAction — #476 adds an optional dates correction (both-or-
// neither) on top of the existing name/location edit.
// ---------------------------------------------------------------------------
describe("updateTripAction", () => {
  const KEY = "11111111-2222-4333-8444-555555555555";

  afterEach(() => {
    updateTripMock.mockReset();
    getUserMock.mockReset();
    rateLimitedActionMock.mockClear();
  });

  function primeAuth(userId: string | null) {
    getUserMock.mockResolvedValue(
      userId
        ? { data: { user: { id: userId } }, error: null }
        : { data: { user: null }, error: null }
    );
  }

  it("updates name + location only when no dates are supplied", async () => {
    primeAuth("u-1");
    updateTripMock.mockResolvedValue({ id: "trip-1", slug: "vegas" });

    const { updateTripAction } = await import("@/lib/actions/trips");

    const result = await updateTripAction(
      { tripId: "22222222-3333-4444-8888-999999999999", name: "Vegas v2", location: "Las Vegas" },
      KEY
    );

    expect(result).toEqual({ ok: true });
    expect(updateTripMock).toHaveBeenCalledTimes(1);
    const [, , input] = updateTripMock.mock.calls[0];
    expect(input).toEqual({
      name: "Vegas v2",
      location: "Las Vegas",
      starts_at: undefined,
      ends_at: undefined,
    });
  });

  it("forwards starts_at/ends_at when both are supplied (#476)", async () => {
    primeAuth("u-1");
    updateTripMock.mockResolvedValue({ id: "trip-1", slug: "vegas" });

    const { updateTripAction } = await import("@/lib/actions/trips");

    const result = await updateTripAction(
      {
        tripId: "22222222-3333-4444-8888-999999999999",
        name: "Vegas v2",
        location: "Las Vegas",
        starts_at: "2027-06-10",
        ends_at: "2027-06-14",
      },
      KEY
    );

    expect(result).toEqual({ ok: true });
    const [, , input] = updateTripMock.mock.calls[0];
    expect(input).toMatchObject({
      starts_at: "2027-06-10",
      ends_at: "2027-06-14",
    });
  });

  it("returns trip_dates_reversed when ends_at is before starts_at (#476, mirrors #405-D)", async () => {
    primeAuth("u-1");

    const { updateTripAction } = await import("@/lib/actions/trips");

    const result = await updateTripAction(
      {
        tripId: "22222222-3333-4444-8888-999999999999",
        name: "Vegas v2",
        starts_at: "2027-06-14",
        ends_at: "2027-06-10",
      },
      KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "trip_dates_reversed" });
    expect(updateTripMock).not.toHaveBeenCalled();
  });

  it("returns rls_denied when updateTrip returns null (undated trip guard rejects the write, or non-organizer)", async () => {
    primeAuth("u-1");
    updateTripMock.mockResolvedValue(null);

    const { updateTripAction } = await import("@/lib/actions/trips");

    const result = await updateTripAction(
      {
        tripId: "22222222-3333-4444-8888-999999999999",
        name: "Vegas v2",
        starts_at: "2027-06-10",
        ends_at: "2027-06-14",
      },
      KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns validation_failed for a malformed idempotency key", async () => {
    primeAuth("u-1");

    const { updateTripAction } = await import("@/lib/actions/trips");

    const result = await updateTripAction(
      { tripId: "22222222-3333-4444-8888-999999999999", name: "Vegas v2" },
      "not-a-uuid"
    );

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(updateTripMock).not.toHaveBeenCalled();
  });

  it("returns auth_failed when there is no signed-in user", async () => {
    primeAuth(null);

    const { updateTripAction } = await import("@/lib/actions/trips");

    const result = await updateTripAction(
      { tripId: "22222222-3333-4444-8888-999999999999", name: "Vegas v2" },
      KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
    expect(updateTripMock).not.toHaveBeenCalled();
  });
});
