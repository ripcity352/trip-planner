/**
 * Tests for `lib/actions/rsvp.ts`.
 *
 * `setRsvpAction({ tripId, status }, idempotencyKey)` updates the
 * caller's own trip_member row. The action returns a discriminated
 * union — never redirects, never throws (the UI handles
 * optimistic-rollback on its own). We assert:
 *
 *   - happy path returns { ok: true, status }
 *   - missing user → rls_denied
 *   - non-member (no trip_member row) → rls_denied
 *   - zod-validation failure (bad status / bad uuid) → validation_failed
 *   - idempotency-replay: same key on the existing row → ok without
 *     a second UPDATE
 *   - rate-limit error → rate_limit
 *   - DB error on update → rsvp_save_failed
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test surface: replay control is what matters most. We track update
// invocations and the auth.uid() lookup against an in-memory rowset.
type MemberRow = {
  id: string;
  user_id: string | null;
  trip_id: string;
  rsvp_status: string;
  idempotency_key: string | null;
};

const getUserMock = vi.fn();
const memberSelectMock = vi.fn();
const memberUpdateMock = vi.fn();

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
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

/**
 * Builds a Supabase client double that:
 *   - `auth.getUser()` returns whatever getUserMock yields
 *   - `from("trip_members").select(...).eq(...).eq(...).maybeSingle()`
 *      returns memberSelectMock's resolved value
 *   - `from("trip_members").update(...).eq(...).select(...).maybeSingle()`
 *      returns memberUpdateMock's resolved value
 */
function buildClient(): unknown {
  const tripMembers = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: () => memberSelectMock(),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: () => memberUpdateMock(),
        }),
      }),
    }),
  };
  return {
    auth: { getUser: getUserMock },
    from: vi.fn((tableName: string) => {
      if (tableName === "trip_members") return tripMembers;
      throw new Error(`unexpected table: ${tableName}`);
    }),
  };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

function primeMember(row: MemberRow | null, error: unknown = null) {
  memberSelectMock.mockResolvedValue({ data: row, error });
}

function primeUpdate(row: Partial<MemberRow> | null, error: unknown = null) {
  memberUpdateMock.mockResolvedValue({ data: row, error });
}

// UUID v4 shape — zod's `.uuid()` is strict about the version nibble.
const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";

describe("setRsvpAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    memberSelectMock.mockReset();
    memberUpdateMock.mockReset();
    rateLimitedActionMock.mockClear();
    createClientMock.mockReset();
    createClientMock.mockResolvedValue(buildClient());
    // Suppress deliberate console.error noise from failure-path tests.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns rls_denied when no user is signed in", async () => {
    primeAuth(null);
    const { setRsvpAction } = await import("@/lib/actions/rsvp");

    const result = await setRsvpAction(
      { tripId: VALID_TRIP_ID, status: "going" },
      VALID_IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(memberUpdateMock).not.toHaveBeenCalled();
  });

  it("returns validation_failed on a bad status value", async () => {
    primeAuth("u-1");
    const { setRsvpAction } = await import("@/lib/actions/rsvp");

    const result = await setRsvpAction(
      // @ts-expect-error — deliberate to exercise the runtime guard.
      { tripId: VALID_TRIP_ID, status: "garbage" },
      VALID_IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(memberUpdateMock).not.toHaveBeenCalled();
  });

  it("returns validation_failed when tripId isn't a uuid", async () => {
    primeAuth("u-1");
    const { setRsvpAction } = await import("@/lib/actions/rsvp");

    const result = await setRsvpAction(
      { tripId: "not-a-uuid", status: "going" },
      VALID_IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when there is no trip_member row for the caller", async () => {
    primeAuth("u-1");
    primeMember(null);
    const { setRsvpAction } = await import("@/lib/actions/rsvp");

    const result = await setRsvpAction(
      { tripId: VALID_TRIP_ID, status: "going" },
      VALID_IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(memberUpdateMock).not.toHaveBeenCalled();
  });

  it("happy path: updates the member row and returns { ok: true, status }", async () => {
    primeAuth("u-1");
    primeMember({
      id: "tm-1",
      user_id: "u-1",
      trip_id: VALID_TRIP_ID,
      rsvp_status: "pending",
      idempotency_key: null,
    });
    primeUpdate({ id: "tm-1", rsvp_status: "going" });

    const { setRsvpAction } = await import("@/lib/actions/rsvp");

    const result = await setRsvpAction(
      { tripId: VALID_TRIP_ID, status: "going" },
      VALID_IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: true, status: "going" });
    expect(memberUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("replay (same idempotency_key) is a no-op and still returns ok with the current status", async () => {
    primeAuth("u-1");
    // The trip_member row already carries the incoming idempotency_key
    // (the previous tap landed). The action MUST NOT issue a second
    // UPDATE — drunk-user-double-tap-on-bad-signal must be a no-op,
    // not a race condition.
    primeMember({
      id: "tm-1",
      user_id: "u-1",
      trip_id: VALID_TRIP_ID,
      rsvp_status: "maybe",
      idempotency_key: VALID_IDEMPOTENCY_KEY,
    });

    const { setRsvpAction } = await import("@/lib/actions/rsvp");

    const result = await setRsvpAction(
      { tripId: VALID_TRIP_ID, status: "going" },
      VALID_IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: true, status: "maybe" });
    expect(memberUpdateMock).not.toHaveBeenCalled();
  });

  it("returns rate_limit when the limiter throws", async () => {
    primeAuth("u-1");
    primeMember({
      id: "tm-1",
      user_id: "u-1",
      trip_id: VALID_TRIP_ID,
      rsvp_status: "pending",
      idempotency_key: null,
    });

    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("setRsvp", { remaining: 0, reset: 0 })
    );

    const { setRsvpAction } = await import("@/lib/actions/rsvp");

    const result = await setRsvpAction(
      { tripId: VALID_TRIP_ID, status: "going" },
      VALID_IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
    expect(memberUpdateMock).not.toHaveBeenCalled();
  });

  it("returns rsvp_save_failed when the UPDATE errors", async () => {
    primeAuth("u-1");
    primeMember({
      id: "tm-1",
      user_id: "u-1",
      trip_id: VALID_TRIP_ID,
      rsvp_status: "pending",
      idempotency_key: null,
    });
    primeUpdate(null, { message: "constraint", code: "23505" });

    const { setRsvpAction } = await import("@/lib/actions/rsvp");

    const result = await setRsvpAction(
      { tripId: VALID_TRIP_ID, status: "going" },
      VALID_IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "rsvp_save_failed" });
  });
});
