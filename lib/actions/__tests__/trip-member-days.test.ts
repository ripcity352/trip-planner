/**
 * Tests for `lib/actions/trip-member-days.ts` (#388).
 *
 * `setMemberDayAction({ tripId, date, status }, idempotencyKey)` upserts
 * the CALLER's own trip_member_days row for one date. Covers:
 *
 *   - validation_failed on bad idempotency key / bad status / bad date shape
 *   - rls_denied when not authenticated
 *   - rls_denied when the trip is invisible to the caller (non-member)
 *   - validation_failed when the date is outside the trip range, or the
 *     trip has no dates yet
 *   - rls_denied when the caller has no trip_members row
 *   - rate_limit when the limiter throws
 *   - idempotency replay — same key on the existing row returns the
 *     stored status without a second write
 *   - happy path upsert-from-empty (rsvp maybe/pending member with no
 *     seeded rows) returns the status and revalidates
 *   - the rate-limit bucket is the dedicated setMemberDay scope
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const getUserMock = vi.fn();
const tableResolvers = new Map<
  string,
  () => { data: unknown; error: unknown }
>();
// Captures the last payload passed to `.upsert(...)` per table so tests can
// assert on-behalf attribution (#550). Backward-compatible: existing tests
// that never read it are unaffected.
const lastUpsert = new Map<string, unknown>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => buildClient()),
}));

const rateLimitedActionMock = vi.fn(
  async (_scope: string, _key: string, fn: () => Promise<unknown>) => fn()
);
vi.mock("@/lib/rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/rate-limit")>(
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
        if (prop === "upsert") {
          return (payload: unknown) => {
            lastUpsert.set(table, payload);
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
const VALID_IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";
const VALID_MEMBER_ID = "44444444-4444-4444-8444-444444444444";

/** Trip in range 2026-08-13 → 2026-08-16. */
function primeTrip(
  startsAt: string | null = "2026-08-13",
  endsAt: string | null = "2026-08-16"
) {
  tableResolvers.set("trips", () => ({
    data: { starts_at: startsAt, ends_at: endsAt },
    error: null,
  }));
}

function primeMember() {
  tableResolvers.set("trip_members", () => ({
    data: { id: VALID_MEMBER_ID },
    error: null,
  }));
}

describe("setMemberDayAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    lastUpsert.clear();
    rateLimitedActionMock.mockClear();
    revalidatePathMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid idempotency key", async () => {
    primeAuth(VALID_USER_ID);
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      "not-a-uuid"
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on invalid status", async () => {
    primeAuth(VALID_USER_ID);
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      // @ts-expect-error intentionally bad status — 'maybe' is not settable
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "maybe" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on a non-date-shaped string", async () => {
    primeAuth(VALID_USER_ID);
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "Aug 14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the trip is not visible (non-member probe)", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("trips", () => ({ data: null, error: null }));
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns validation_failed when the date is outside the trip range", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeMember();
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-20", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("returns validation_failed when the trip has no dates yet", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip(null, null);
    primeMember();
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when the caller has no trip_members row", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    tableResolvers.set("trip_members", () => ({ data: null, error: null }));
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when the limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeMember();
    tableResolvers.set("trip_member_days", () => ({
      data: null,
      error: null,
    }));
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("setMemberDay", {
        reset: Date.now() + 60_000,
        remaining: 0,
      })
    );
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns the stored status on idempotency replay without a second write", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeMember();
    tableResolvers.set("trip_member_days", () => ({
      data: { status: "declined", idempotency_key: VALID_IDEMPOTENCY_KEY },
      error: null,
    }));
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "declined" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, status: "declined" });
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("upserts-from-empty and returns ok (member with no seeded rows)", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeMember();
    // No existing day row — the maybe/pending-RSVP member whose trigger
    // never seeded anything. The action must upsert, not update.
    tableResolvers.set("trip_member_days", () => ({
      data: null,
      error: null,
    }));
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, status: "going" });
    // F2: revalidate on success so the organizer headcount stays fresh.
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("uses the dedicated setMemberDay rate-limit scope keyed by user id", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeMember();
    tableResolvers.set("trip_member_days", () => ({
      data: null,
      error: null,
    }));
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "setMemberDay",
      VALID_USER_ID,
      expect.any(Function)
    );
  });

  it("accepts the range boundary dates (inclusive)", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeMember();
    tableResolvers.set("trip_member_days", () => ({
      data: null,
      error: null,
    }));
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    const first = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-13", status: "declined" },
      VALID_IDEMPOTENCY_KEY
    );
    const last = await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-16", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(first).toEqual({ ok: true, status: "declined" });
    expect(last).toEqual({ ok: true, status: "going" });
  });

  it("#550: a member self-write clears attribution (written_by NULL)", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeMember();
    tableResolvers.set("trip_member_days", () => ({ data: null, error: null }));
    const { setMemberDayAction } =
      await import("@/lib/actions/trip-member-days");
    await setMemberDayAction(
      { tripId: VALID_TRIP_ID, date: "2026-08-14", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );
    // The upsert must set written_by NULL so a member re-tap on an
    // organizer-written row satisfies the tightened "members write own
    // days" WITH CHECK (and doubles as the [Keep] confirm).
    expect(lastUpsert.get("trip_member_days")).toMatchObject({
      trip_member_id: VALID_MEMBER_ID,
      written_by_trip_member_id: null,
    });
  });
});

// ─── #550 — organizer write-on-behalf ───────────────────────────────────────

const VALID_TARGET_ID = "66666666-6666-4666-8666-666666666666";

/**
 * trip_members resolver that returns a sequence of results across calls
 * (setMemberDayForAction queries the table twice: caller, then target).
 */
function primeMembersSequence(
  results: ReadonlyArray<{ data: unknown; error: unknown }>
) {
  let call = 0;
  tableResolvers.set("trip_members", () => {
    const r = results[Math.min(call, results.length - 1)];
    call += 1;
    return r;
  });
}

/** Caller = organizer (id VALID_MEMBER_ID), target exists in-trip. */
function primeOrganizerAndTarget() {
  primeMembersSequence([
    { data: { id: VALID_MEMBER_ID, role: "organizer" }, error: null },
    { data: { id: VALID_TARGET_ID }, error: null },
  ]);
}

describe("setMemberDayForAction (organizer on-behalf)", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    lastUpsert.clear();
    rateLimitedActionMock.mockClear();
    revalidatePathMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on a non-uuid idempotency key", async () => {
    primeAuth(VALID_USER_ID);
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayForAction(
      {
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_TARGET_ID,
        date: "2026-08-14",
        status: "going",
      },
      "not-a-uuid"
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayForAction(
      {
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_TARGET_ID,
        date: "2026-08-14",
        status: "going",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the caller is not an organizer", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    // Caller is a plain attendee — the server-side gate (defense-in-depth
    // over RLS) must fail closed before any write.
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID, role: "attendee" },
      error: null,
    }));
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayForAction(
      {
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_TARGET_ID,
        date: "2026-08-14",
        status: "going",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("returns validation_failed when the organizer targets themselves", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    tableResolvers.set("trip_members", () => ({
      data: { id: VALID_MEMBER_ID, role: "organizer" },
      error: null,
    }));
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayForAction(
      {
        // Self-target — the self path is setMemberDayAction; RLS anti-forgery
        // also rejects target == writer.
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_MEMBER_ID,
        date: "2026-08-14",
        status: "going",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("returns rls_denied when the target is not in the trip (cross-tenant)", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    // Caller is an organizer, but the target lookup finds no row in THIS
    // trip — an organizer of trip A cannot set days for a trip-B member.
    primeMembersSequence([
      { data: { id: VALID_MEMBER_ID, role: "organizer" }, error: null },
      { data: null, error: null },
    ]);
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayForAction(
      {
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_TARGET_ID,
        date: "2026-08-14",
        status: "going",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("returns validation_failed when the date is outside the trip range", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeOrganizerAndTarget();
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayForAction(
      {
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_TARGET_ID,
        date: "2026-08-20",
        status: "going",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("writes the day attributed to the caller and returns ok", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeOrganizerAndTarget();
    tableResolvers.set("trip_member_days", () => ({ data: null, error: null }));
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayForAction(
      {
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_TARGET_ID,
        date: "2026-08-14",
        status: "going",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, status: "going" });
    // Attribution is the crux: the row targets the member but is written_by
    // the caller's own membership (RLS anti-forgery enforces target<>writer).
    expect(lastUpsert.get("trip_member_days")).toMatchObject({
      trip_member_id: VALID_TARGET_ID,
      status: "going",
      written_by_trip_member_id: VALID_MEMBER_ID,
    });
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("uses the dedicated setMemberDay rate-limit scope keyed by user id", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeOrganizerAndTarget();
    tableResolvers.set("trip_member_days", () => ({ data: null, error: null }));
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    await setMemberDayForAction(
      {
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_TARGET_ID,
        date: "2026-08-14",
        status: "going",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "setMemberDay",
      VALID_USER_ID,
      expect.any(Function)
    );
  });

  it("returns rate_limit when the limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    primeTrip();
    primeOrganizerAndTarget();
    tableResolvers.set("trip_member_days", () => ({ data: null, error: null }));
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("setMemberDay", {
        reset: Date.now() + 60_000,
        remaining: 0,
      })
    );
    const { setMemberDayForAction } =
      await import("@/lib/actions/trip-member-days");
    const result = await setMemberDayForAction(
      {
        tripId: VALID_TRIP_ID,
        targetTripMemberId: VALID_TARGET_ID,
        date: "2026-08-14",
        status: "going",
      },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});
