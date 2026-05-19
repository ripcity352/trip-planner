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
vi.mock("@/lib/db/trips", () => ({
  createTrip: (...args: unknown[]) => createTripMock(...args),
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
