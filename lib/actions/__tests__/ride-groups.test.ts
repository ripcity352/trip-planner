/**
 * Tests for `lib/actions/ride-groups.ts` (#581).
 *
 * Covers validation, auth gating, the fan-out payload shape (self-join =
 * written_by NULL, others = written_by creator), duplicate-rider drop,
 * rate-limit surfacing, and the idempotent + self-healing create replay.
 * RLS forgery-proofing is proven separately in the psql harness.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
// Each table maps to a queue-aware resolver: successive calls to the same
// table pop the next result (falls back to the last one), so a flow that
// hits `ride_groups` twice (insert then re-select) can return different rows.
const tableQueues = new Map<string, Array<{ data: unknown; error: unknown }>>();

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

const capturedInserts: Array<{ table: string; arg: unknown }> = [];

function nextResult(table: string): { data: unknown; error: unknown } {
  const q = tableQueues.get(table);
  if (!q || q.length === 0) return { data: null, error: null };
  return q.length === 1 ? q[0] : (q.shift() as { data: unknown; error: unknown });
}

function buildClient(): unknown {
  const tableProxy = (table: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        return Promise.resolve(nextResult(table)).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "maybeSingle" || prop === "single") {
          return () => Promise.resolve(nextResult(table));
        }
        return (...args: unknown[]) => {
          if (prop === "insert") capturedInserts.push({ table, arg: args[0] });
          return proxy;
        };
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };
  return { auth: { getUser: getUserMock }, from: vi.fn((t: string) => tableProxy(t)) };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

const TRIP = "11111111-1111-4111-8111-111111111111";
const CREATOR = "22222222-2222-4222-8222-222222222222";
const ROB = "33333333-3333-4333-8333-333333333333";
const DAVE = "44444444-4444-4444-8444-444444444444";
const RIDE = "55555555-5555-4555-8555-555555555555";
const KEY = "66666666-6666-4666-8666-666666666666";
const USER = "77777777-7777-4777-8777-777777777777";

let createRideGroupWithRiders: typeof import("../ride-groups").createRideGroupWithRiders;
let addRidersToRide: typeof import("../ride-groups").addRidersToRide;
let leaveRide: typeof import("../ride-groups").leaveRide;
let deleteRideGroup: typeof import("../ride-groups").deleteRideGroup;

beforeEach(async () => {
  getUserMock.mockReset();
  tableQueues.clear();
  capturedInserts.length = 0;
  rateLimitedActionMock.mockClear();
  const mod = await import("../ride-groups");
  createRideGroupWithRiders = mod.createRideGroupWithRiders;
  addRidersToRide = mod.addRidersToRide;
  leaveRide = mod.leaveRide;
  deleteRideGroup = mod.deleteRideGroup;
});
afterEach(() => vi.clearAllMocks());

describe("createRideGroupWithRiders", () => {
  it("rejects a bad idempotency key", async () => {
    primeAuth(USER);
    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", riderTripMemberIds: [CREATOR] },
      "not-a-uuid"
    );
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects an empty rider set", async () => {
    primeAuth(USER);
    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", riderTripMemberIds: [] },
      KEY
    );
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when unauthenticated", async () => {
    primeAuth(null);
    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", riderTripMemberIds: [CREATOR] },
      KEY
    );
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the caller is not a trip member", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: null, error: null }]);
    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", riderTripMemberIds: [CREATOR] },
      KEY
    );
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("creates a ride and fans out riders — self-join is written_by NULL, others carry the creator", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: CREATOR }, error: null }]);
    tableQueues.set("ride_groups", [{ data: { id: RIDE }, error: null }]);
    tableQueues.set("ride_group_members", [{ data: null, error: null }]);

    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", airport: "PDX", riderTripMemberIds: [CREATOR, ROB, DAVE] },
      KEY
    );
    expect(res).toEqual({ ok: true, rideGroupId: RIDE, riders: 3 });

    const groupInsert = capturedInserts.find((c) => c.table === "ride_groups");
    expect(groupInsert?.arg).toMatchObject({
      trip_id: TRIP,
      created_by_trip_member_id: CREATOR,
      airport: "PDX",
      direction: "inbound",
      idempotency_key: KEY,
    });

    const memberInserts = capturedInserts
      .filter((c) => c.table === "ride_group_members")
      .map((c) => c.arg as Record<string, unknown>);
    expect(memberInserts).toHaveLength(3);
    // creator self-joins → written_by NULL
    expect(memberInserts.find((m) => m.trip_member_id === CREATOR)).toMatchObject({
      ride_group_id: RIDE,
      written_by_trip_member_id: null,
    });
    // added riders carry the creator as provenance
    expect(memberInserts.find((m) => m.trip_member_id === ROB)).toMatchObject({
      written_by_trip_member_id: CREATOR,
    });
    expect(memberInserts.find((m) => m.trip_member_id === DAVE)).toMatchObject({
      written_by_trip_member_id: CREATOR,
    });
  });

  it("drops duplicate riders before the fan-out", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: CREATOR }, error: null }]);
    tableQueues.set("ride_groups", [{ data: { id: RIDE }, error: null }]);
    tableQueues.set("ride_group_members", [{ data: null, error: null }]);
    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", riderTripMemberIds: [ROB, ROB, DAVE] },
      KEY
    );
    expect(res).toEqual({ ok: true, rideGroupId: RIDE, riders: 2 });
    expect(capturedInserts.filter((c) => c.table === "ride_group_members")).toHaveLength(2);
  });

  it("self-heals on a parent idempotency replay (23505 → re-select group, still fan out)", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: CREATOR }, error: null }]);
    // first ride_groups call = insert → 23505; second = re-select → existing id
    tableQueues.set("ride_groups", [
      { data: null, error: { code: "23505", message: "dup" } },
      { data: { id: RIDE }, error: null },
    ]);
    // rider already present → 23505 counts as done (idempotent)
    tableQueues.set("ride_group_members", [
      { data: null, error: { code: "23505", message: "dup" } },
    ]);
    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", riderTripMemberIds: [CREATOR, ROB] },
      KEY
    );
    expect(res).toEqual({ ok: true, rideGroupId: RIDE, riders: 2 });
  });

  it("skips a per-rider RLS rejection (42501) instead of failing the batch", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: CREATOR }, error: null }]);
    tableQueues.set("ride_groups", [{ data: { id: RIDE }, error: null }]);
    tableQueues.set("ride_group_members", [
      { data: null, error: { code: "42501", message: "denied" } },
    ]);
    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", riderTripMemberIds: [ROB, DAVE] },
      KEY
    );
    expect(res).toEqual({ ok: true, rideGroupId: RIDE, riders: 0 });
  });

  it("surfaces a rate-limit rejection", async () => {
    primeAuth(USER);
    tableQueues.set("trip_members", [{ data: { id: CREATOR }, error: null }]);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("createRideGroup", { reset: 0, remaining: 0 })
    );
    const res = await createRideGroupWithRiders(
      { tripId: TRIP, direction: "inbound", riderTripMemberIds: [CREATOR] },
      KEY
    );
    expect(res).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});

describe("addRidersToRide", () => {
  it("resolves the group's trip and binds the caller as written_by", async () => {
    primeAuth(USER);
    tableQueues.set("ride_groups", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [{ data: { id: CREATOR }, error: null }]);
    tableQueues.set("ride_group_members", [{ data: null, error: null }]);
    const res = await addRidersToRide(RIDE, [ROB, DAVE], KEY);
    expect(res).toEqual({ ok: true, added: 2 });
    const inserts = capturedInserts
      .filter((c) => c.table === "ride_group_members")
      .map((c) => c.arg as Record<string, unknown>);
    expect(inserts.every((m) => m.written_by_trip_member_id === CREATOR)).toBe(true);
    expect(inserts.every((m) => m.ride_group_id === RIDE)).toBe(true);
  });

  it("returns rls_denied when the group is not visible to the caller", async () => {
    primeAuth(USER);
    tableQueues.set("ride_groups", [{ data: null, error: null }]);
    const res = await addRidersToRide(RIDE, [ROB], KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});

describe("leaveRide", () => {
  it("deletes the caller's own rider row", async () => {
    primeAuth(USER);
    tableQueues.set("ride_group_members", [{ data: null, error: null }]);
    expect(await leaveRide(RIDE)).toEqual({ ok: true });
  });

  it("rejects a non-uuid ride id", async () => {
    primeAuth(USER);
    expect(await leaveRide("nope")).toEqual({ ok: false, errorKey: "validation_failed" });
  });
});

describe("deleteRideGroup", () => {
  it("deletes the ride (RLS gates creator/organizer)", async () => {
    primeAuth(USER);
    tableQueues.set("ride_groups", [{ data: null, error: null }]);
    expect(await deleteRideGroup(RIDE)).toEqual({ ok: true });
  });

  it("maps an RLS delete rejection to rls_denied", async () => {
    primeAuth(USER);
    tableQueues.set("ride_groups", [{ data: null, error: { code: "42501", message: "denied" } }]);
    expect(await deleteRideGroup(RIDE)).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});
