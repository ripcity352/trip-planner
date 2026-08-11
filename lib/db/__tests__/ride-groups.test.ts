/**
 * Tests for `lib/db/ride-groups.ts` (#581).
 *
 * getRideGroupsByTrip reads the flat `ride_group_manifest` view (one row per
 * rider) and assembles it into RideGroupWithRiders[], preserving group order
 * (by group_created_at) and rider order (by rider created_at).
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRideGroupsByTrip } from "../ride-groups";

function makeClient(
  tableResolvers: Record<string, () => { data: unknown; error: unknown }>
) {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const result = tableResolvers[tableName]?.() ?? { data: [], error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };
  return { from: vi.fn((table: string) => buildProxy(table)) } as unknown as SupabaseClient;
}

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

function row(overrides: Record<string, unknown> = {}) {
  return {
    ride_group_id: "ride-1",
    trip_member_id: "m-creator",
    written_by_trip_member_id: null,
    created_at: "2026-08-14T00:00:00.000Z",
    trip_id: TRIP_ID,
    airport: "PDX",
    direction: "inbound",
    visibility: "everyone",
    created_by_trip_member_id: "m-creator",
    group_created_at: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("getRideGroupsByTrip", () => {
  it("assembles flat rider rows into rides with a riders array", async () => {
    const client = makeClient({
      ride_group_manifest: () => ({
        data: [
          row({ trip_member_id: "m-creator", written_by_trip_member_id: null, created_at: "2026-08-14T00:00:00.000Z" }),
          row({ trip_member_id: "m-rob", written_by_trip_member_id: "m-creator", created_at: "2026-08-14T00:01:00.000Z" }),
        ],
        error: null,
      }),
    });
    const rides = await getRideGroupsByTrip(client, TRIP_ID);
    expect(rides).toHaveLength(1);
    expect(rides[0]).toMatchObject({
      id: "ride-1",
      trip_id: TRIP_ID,
      airport: "PDX",
      direction: "inbound",
      created_by_trip_member_id: "m-creator",
    });
    expect(rides[0].riders).toEqual([
      { trip_member_id: "m-creator", written_by_trip_member_id: null },
      { trip_member_id: "m-rob", written_by_trip_member_id: "m-creator" },
    ]);
  });

  it("groups multiple rides and orders them by group_created_at", async () => {
    const client = makeClient({
      ride_group_manifest: () => ({
        data: [
          row({ ride_group_id: "ride-late", airport: "LAX", group_created_at: "2026-08-14T02:00:00.000Z", trip_member_id: "m-a" }),
          row({ ride_group_id: "ride-early", airport: "PDX", group_created_at: "2026-08-14T01:00:00.000Z", trip_member_id: "m-b" }),
        ],
        error: null,
      }),
    });
    const rides = await getRideGroupsByTrip(client, TRIP_ID);
    expect(rides.map((r) => r.id)).toEqual(["ride-early", "ride-late"]);
  });

  it("orders riders within a ride by created_at (creator first)", async () => {
    const client = makeClient({
      ride_group_manifest: () => ({
        data: [
          row({ trip_member_id: "m-added", written_by_trip_member_id: "m-creator", created_at: "2026-08-14T00:05:00.000Z" }),
          row({ trip_member_id: "m-creator", written_by_trip_member_id: null, created_at: "2026-08-14T00:00:00.000Z" }),
        ],
        error: null,
      }),
    });
    const rides = await getRideGroupsByTrip(client, TRIP_ID);
    expect(rides[0].riders.map((r) => r.trip_member_id)).toEqual(["m-creator", "m-added"]);
  });

  it("returns an empty array when there are no rides", async () => {
    const client = makeClient({ ride_group_manifest: () => ({ data: [], error: null }) });
    expect(await getRideGroupsByTrip(client, TRIP_ID)).toEqual([]);
  });

  it("throws a descriptive error when the query errors", async () => {
    const client = makeClient({
      ride_group_manifest: () => ({ data: null, error: { message: "boom" } }),
    });
    await expect(getRideGroupsByTrip(client, TRIP_ID)).rejects.toThrow(/getRideGroupsByTrip failed: boom/);
  });
});
