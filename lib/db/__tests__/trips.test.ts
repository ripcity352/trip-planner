/**
 * Smoke tests for lib/db/trips.ts query shape. We mock the Supabase
 * fluent builder and assert that the M1 columns + soft-delete filter
 * are present on `listMyTrips`.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listMyTrips,
  getTripBySlug,
  createTrip,
  setMemberDisplayName,
  getTripMemberById,
  updateTripMemberRole,
  deleteTripMember,
  updateMyMemberProfile,
  setTripCelebrant,
} from "../trips";

const M1_COLUMNS = [
  "kind",
  "is_template",
  "deleted_at",
  "archived_at",
  "vibe_tags",
];

function makeBuilder(rows: unknown) {
  // Inline immutable chain tracker — captures every call argument without
  // mutating across tests. The Supabase client returns `this` for fluent
  // builders, so each chained call records the args and returns the same
  // proxy.
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const thenable: PromiseLike<{ data: unknown; error: null }> = {
    then(onfulfilled) {
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
    },
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") return thenable.then.bind(thenable);
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };

  const proxy: Record<string, unknown> = new Proxy({}, handler);

  return { calls, client: { from: vi.fn(() => proxy) } };
}

describe("lib/db/trips.ts", () => {
  it("listMyTrips selects every M1 trip column and filters soft-deleted + templates", async () => {
    const { calls, client } = makeBuilder([]);

    await listMyTrips(client as unknown as SupabaseClient);

    const selectCall = calls.find((c) => c.method === "select");
    expect(selectCall).toBeDefined();

    const selectArg = String(selectCall?.args[0]);
    for (const col of M1_COLUMNS) {
      expect(selectArg).toContain(col);
    }

    // Soft-delete + template defense-in-depth filter.
    const filterCalls = calls.filter(
      (c) => c.method === "is" || c.method === "eq"
    );
    const filterArgs = filterCalls.map((c) => `${c.args[0]}=${c.args[1]}`);
    expect(filterArgs).toContain("deleted_at=null");
    expect(filterArgs).toContain("is_template=false");
  });

  it("getTripBySlug returns null when Supabase reports no row", async () => {
    const { client } = makeBuilder(null);

    const result = await getTripBySlug(
      client as unknown as SupabaseClient,
      "missing"
    );
    expect(result).toBeNull();
  });

  // ----------------------------------------------------------------
  // M2 — createTrip now routes through the SECURITY DEFINER RPC
  // `public.create_trip_with_organizer(...)` so the trip insert and
  // organizer membership insert land in the same transaction.
  // ----------------------------------------------------------------
  describe("createTrip (M2, via RPC)", () => {
    function makeRpcClient(rpcReturn: {
      data: unknown;
      error: { message: string } | null;
    }) {
      // Explicit signature so `mock.calls[0]` is a 2-tuple, not `[]`.
      // The arguments are introspected by tests via `rpcMock.mock.calls`;
      // we don't read them inside the function body.
      const rpcMock = vi.fn<
        (name: string, args: Record<string, unknown>) => Promise<typeof rpcReturn>
      >(async () => rpcReturn);
      const client = {
        from: vi.fn(),
        rpc: rpcMock,
      } as unknown as SupabaseClient;
      return { client, rpcMock };
    }

    const insertedTrip = {
      id: "trip-1",
      slug: "vegas-bach",
      name: "Vegas",
      description: null,
      location: null,
      starts_at: null,
      ends_at: null,
      created_by: "user-1",
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
      kind: "bachelor",
      is_template: false,
      deleted_at: null,
      archived_at: null,
      vibe_tags: [],
    };

    it("calls create_trip_with_organizer RPC with the input mapped to p_ params", async () => {
      const { client, rpcMock } = makeRpcClient({
        data: insertedTrip,
        error: null,
      });

      const out = await createTrip(client, {
        slug: "vegas-bach",
        name: "Vegas",
      });

      expect(rpcMock).toHaveBeenCalledTimes(1);
      const [fnName, args] = rpcMock.mock.calls[0];
      expect(fnName).toBe("create_trip_with_organizer");
      expect(args).toMatchObject({
        p_slug: "vegas-bach",
        p_name: "Vegas",
        p_description: null,
        p_location: null,
        p_starts_at: null,
        p_ends_at: null,
        p_vibe_tags: [],
      });
      expect(out).toEqual(insertedTrip);
    });

    it("forwards optional fields (vibe_tags, dates) when set", async () => {
      const { client, rpcMock } = makeRpcClient({
        data: insertedTrip,
        error: null,
      });

      await createTrip(client, {
        slug: "vegas-bach",
        name: "Vegas",
        description: "the big one",
        location: "Vegas, NV",
        starts_at: "2026-06-15",
        ends_at: "2026-06-18",
        vibe_tags: ["low-key"],
      });

      const args = rpcMock.mock.calls[0][1];
      expect(args.p_description).toBe("the big one");
      expect(args.p_location).toBe("Vegas, NV");
      expect(args.p_starts_at).toBe("2026-06-15");
      expect(args.p_ends_at).toBe("2026-06-18");
      expect(args.p_vibe_tags).toEqual(["low-key"]);
    });

    it("unwraps a 1-element array response (some driver shapes)", async () => {
      const { client } = makeRpcClient({
        data: [insertedTrip],
        error: null,
      });

      const out = await createTrip(client, {
        slug: "vegas-bach",
        name: "Vegas",
      });
      expect(out).toEqual(insertedTrip);
    });

    it("throws with a descriptive message when the RPC errors", async () => {
      const { client } = makeRpcClient({
        data: null,
        error: { message: "duplicate slug" },
      });

      await expect(
        createTrip(client, { slug: "vegas-bach", name: "Vegas" })
      ).rejects.toThrow(/createTrip failed.*duplicate slug/);
    });

    it("throws when the RPC returns an empty array", async () => {
      const { client } = makeRpcClient({ data: [], error: null });
      await expect(
        createTrip(client, { slug: "vegas-bach", name: "Vegas" })
      ).rejects.toThrow(/empty response/);
    });
  });
});

// #348: invite-accept display-name capture — member updates their own row
describe("setMemberDisplayName", () => {
  it("updates trip_members.display_name scoped to the member row", async () => {
    const { calls, client } = makeBuilder(null);
    await setMemberDisplayName(
      client as never,
      "member-1",
      "Nate Newguy"
    );
    const update = calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ display_name: "Nate Newguy" });
    const eq = calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["id", "member-1"]);
  });
});

// #386 — organizer member management: targeted fetch + role write + delete.
describe("getTripMemberById", () => {
  it("filters by BOTH trip_id and member id (multi-tenant scoping)", async () => {
    const row = {
      id: "member-1",
      trip_id: "trip-1",
      role: "attendee",
      is_celebrant: false,
      idempotency_key: null,
    };
    const { calls, client } = makeBuilder(row);

    const result = await getTripMemberById(
      client as unknown as SupabaseClient,
      "trip-1",
      "member-1"
    );

    expect(result).toEqual(row);
    const eqCalls = calls.filter((c) => c.method === "eq");
    const args = eqCalls.map((c) => `${c.args[0]}=${c.args[1]}`);
    expect(args).toContain("trip_id=trip-1");
    expect(args).toContain("id=member-1");
  });

  it("returns null when the row is hidden or missing", async () => {
    const { client } = makeBuilder(null);
    const result = await getTripMemberById(
      client as unknown as SupabaseClient,
      "trip-1",
      "member-x"
    );
    expect(result).toBeNull();
  });
});

describe("updateTripMemberRole", () => {
  it("writes role + idempotency_key scoped to the member row and reports success", async () => {
    const { calls, client } = makeBuilder({ id: "member-1" });

    const updated = await updateTripMemberRole(
      client as unknown as SupabaseClient,
      "member-1",
      "co_organizer",
      "11111111-2222-4333-8444-555555555555"
    );

    expect(updated).toBe(true);
    const update = calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({
      role: "co_organizer",
      idempotency_key: "11111111-2222-4333-8444-555555555555",
    });
    const eq = calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["id", "member-1"]);
  });

  it("returns false when RLS swallows the update (no row comes back)", async () => {
    const { client } = makeBuilder(null);
    const updated = await updateTripMemberRole(
      client as unknown as SupabaseClient,
      "member-1",
      "attendee",
      "11111111-2222-4333-8444-555555555555"
    );
    expect(updated).toBe(false);
  });
});

describe("deleteTripMember", () => {
  it("deletes by member id and returns the deleted-row count", async () => {
    const { calls, client } = makeBuilder([{ id: "member-1" }]);

    const count = await deleteTripMember(
      client as unknown as SupabaseClient,
      "member-1"
    );

    expect(count).toBe(1);
    expect(calls.some((c) => c.method === "delete")).toBe(true);
    const eq = calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["id", "member-1"]);
  });

  it("returns 0 when nothing was deleted (already gone or RLS-hidden)", async () => {
    const { client } = makeBuilder([]);
    const count = await deleteTripMember(
      client as unknown as SupabaseClient,
      "member-1"
    );
    expect(count).toBe(0);
  });
});

// #368 / #262 — self-service /me profile write (own row only via RLS).
describe("updateMyMemberProfile", () => {
  const KEY = "11111111-2222-4333-8444-555555555555";

  /** makeBuilder variant that resolves with a Supabase-shaped error. */
  function makeFailingBuilder(error: { code: string; message: string }) {
    const thenable: PromiseLike<{ data: null; error: typeof error }> = {
      then(onfulfilled) {
        return Promise.resolve({ data: null, error }).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return { client: { from: vi.fn(() => proxy) } };
  }

  it("writes display_name + phone_e164 + idempotency_key scoped by trip AND member id", async () => {
    const { calls, client } = makeBuilder({ id: "member-1" });

    const outcome = await updateMyMemberProfile(
      client as unknown as SupabaseClient,
      "trip-1",
      "member-1",
      "Carl",
      "+14155551212",
      KEY
    );

    expect(outcome).toBe("updated");
    const update = calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({
      display_name: "Carl",
      phone_e164: "+14155551212",
      idempotency_key: KEY,
    });
    // Multi-tenant rule 6: BOTH trip_id and id must scope the write.
    const eqArgs = calls
      .filter((c) => c.method === "eq")
      .map((c) => `${c.args[0]}=${c.args[1]}`);
    expect(eqArgs).toContain("trip_id=trip-1");
    expect(eqArgs).toContain("id=member-1");
    // Honest-write chain: .select().maybeSingle() so zero rows is visible.
    expect(calls.some((c) => c.method === "select")).toBe(true);
    expect(calls.some((c) => c.method === "maybeSingle")).toBe(true);
  });

  it("passes phone null through to clear the stored number", async () => {
    const { calls, client } = makeBuilder({ id: "member-1" });

    await updateMyMemberProfile(
      client as unknown as SupabaseClient,
      "trip-1",
      "member-1",
      "Carl",
      null,
      KEY
    );

    const update = calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({
      display_name: "Carl",
      phone_e164: null,
      idempotency_key: KEY,
    });
  });

  it("returns 'missing' when RLS swallows the update (no row comes back)", async () => {
    const { client } = makeBuilder(null);
    const outcome = await updateMyMemberProfile(
      client as unknown as SupabaseClient,
      "trip-1",
      "member-x",
      "Carl",
      null,
      KEY
    );
    expect(outcome).toBe("missing");
  });

  it("maps a 23505 unique violation to 'duplicate_phone' instead of throwing", async () => {
    const { client } = makeFailingBuilder({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "trip_members_unique_phone"',
    });
    const outcome = await updateMyMemberProfile(
      client as unknown as SupabaseClient,
      "trip-1",
      "member-1",
      "Carl",
      "+14155551212",
      KEY
    );
    expect(outcome).toBe("duplicate_phone");
  });

  it("throws on any other database error", async () => {
    const { client } = makeFailingBuilder({
      code: "XX000",
      message: "boom",
    });
    await expect(
      updateMyMemberProfile(
        client as unknown as SupabaseClient,
        "trip-1",
        "member-1",
        "Carl",
        null,
        KEY
      )
    ).rejects.toThrow(/updateMyMemberProfile failed: boom/);
  });
});

// Celebrant assignment — founder-only write through the
// `set_trip_celebrant` SECURITY DEFINER RPC (the #418 WITH CHECK pins
// make is_celebrant unwritable through the base table by design).
describe("setTripCelebrant", () => {
  function makeRpcClient(rpcReturn: {
    data: unknown;
    error: { message: string } | null;
  }) {
    const rpcMock = vi.fn<
      (name: string, args: Record<string, unknown>) => Promise<typeof rpcReturn>
    >(async () => rpcReturn);
    const client = {
      from: vi.fn(),
      rpc: rpcMock,
    } as unknown as SupabaseClient;
    return { client, rpcMock };
  }

  it("calls set_trip_celebrant with the trip and member ids", async () => {
    const { client, rpcMock } = makeRpcClient({ data: null, error: null });

    await setTripCelebrant(client, "trip-1", "member-1");

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpcMock.mock.calls[0];
    expect(fnName).toBe("set_trip_celebrant");
    expect(args).toEqual({ p_trip_id: "trip-1", p_member_id: "member-1" });
  });

  it("passes null through for the clear-the-seat path", async () => {
    const { client, rpcMock } = makeRpcClient({ data: null, error: null });

    await setTripCelebrant(client, "trip-1", null);

    expect(rpcMock.mock.calls[0][1]).toEqual({
      p_trip_id: "trip-1",
      p_member_id: null,
    });
  });

  it("throws with the RPC's message so the action can map founder/member denials", async () => {
    const { client } = makeRpcClient({
      data: null,
      error: { message: "set_trip_celebrant: caller is not the trip founder" },
    });

    await expect(
      setTripCelebrant(client, "trip-1", "member-1")
    ).rejects.toThrow(/setTripCelebrant failed.*not the trip founder/);
  });
});
