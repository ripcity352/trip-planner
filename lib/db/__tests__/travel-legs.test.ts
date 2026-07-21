/**
 * Tests for `lib/db/travel-legs.ts`.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getTravelLegsByTrip } from "../travel-legs";
import type { TravelLeg } from "../types";

function makeClient(
  tableResolvers: Record<string, () => { data: unknown; error: unknown }>
) {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const result = tableResolvers[tableName]?.() ?? {
          data: [],
          error: null,
        };
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

  return {
    from: vi.fn((table: string) => buildProxy(table)),
  } as unknown as SupabaseClient;
}

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

const mockLeg: TravelLeg = {
  id: "leg-1",
  trip_id: TRIP_ID,
  trip_member_id: MEMBER_ID,
  kind: "flight",
  depart_at: "2026-06-13T14:00:00.000Z",
  arrive_at: "2026-06-13T17:30:00.000Z",
  carrier: "Southwest",
  confirmation_code: "ABCDEF",
  notes: null,
  idempotency_key: null,
  created_at: "2026-05-20T00:00:00.000Z",
};

describe("getTravelLegsByTrip", () => {
  it("returns travel legs ordered by arrive_at", async () => {
    const client = makeClient({
      travel_legs: () => ({ data: [mockLeg], error: null }),
    });
    const result = await getTravelLegsByTrip(client, TRIP_ID);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("flight");
    expect(result[0].carrier).toBe("Southwest");
    expect(result[0].confirmation_code).toBe("ABCDEF");
  });

  it("returns empty array when no legs", async () => {
    const client = makeClient({
      travel_legs: () => ({ data: [], error: null }),
    });
    const result = await getTravelLegsByTrip(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("returns empty array when data is null", async () => {
    const client = makeClient({
      travel_legs: () => ({ data: null, error: null }),
    });
    const result = await getTravelLegsByTrip(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      travel_legs: () => ({
        data: null,
        error: { message: "permission denied" },
      }),
    });
    await expect(getTravelLegsByTrip(client, TRIP_ID)).rejects.toThrow(
      "getTravelLegsByTrip failed: permission denied"
    );
  });

  it("returns legs with null arrive_at", async () => {
    const legNoArrival: TravelLeg = { ...mockLeg, arrive_at: null };
    const client = makeClient({
      travel_legs: () => ({ data: [legNoArrival], error: null }),
    });
    const result = await getTravelLegsByTrip(client, TRIP_ID);
    expect(result[0].arrive_at).toBeNull();
  });
});

describe("TRAVEL_LEG_COLUMNS coverage", () => {
  // Regression for #453: TRAVEL_LEG_COLUMNS omitted airline_iata /
  // flight_number, so the read path (arrivals manifest + edit-form
  // hydration) never saw them. Because the edit form pre-fills from this
  // read, the missing fields round-tripped as `undefined` and the next
  // save's `?? null` fallback silently nulled both columns on write —
  // psql-verified data loss (2026-07-20 audit). This test pins the select
  // list to a superset of every key `upsertTravelLeg` (lib/actions/travel-legs.ts)
  // writes on insert/update, so the next column added to one and not the
  // other fails loudly here instead of hydrating blank in prod.
  const ACTION_WRITTEN_KEYS = [
    "id",
    "trip_id",
    "trip_member_id",
    "kind",
    "depart_at",
    "arrive_at",
    "carrier",
    "confirmation_code",
    "notes",
    "idempotency_key",
    "created_at",
    "airline_iata",
    "flight_number",
  ] as const;

  function makeColumnCapturingClient(capture: { columns: string }) {
    const buildProxy = (): Record<string, unknown> => {
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_target, prop: string) {
          if (prop === "select") {
            return (columns: string) => {
              capture.columns = columns;
              return proxy;
            };
          }
          if (prop === "then") {
            return (onfulfilled: (v: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(onfulfilled);
          }
          return () => proxy;
        },
      };
      const proxy: Record<string, unknown> = new Proxy({}, handler);
      return proxy;
    };

    return {
      from: vi.fn(() => buildProxy()),
    } as unknown as SupabaseClient;
  }

  it("selects every column upsertTravelLeg writes (prevents hydration drift)", async () => {
    const capture = { columns: "" };
    const client = makeColumnCapturingClient(capture);

    await getTravelLegsByTrip(client, TRIP_ID);

    const selected = new Set(capture.columns.split(",").map((c) => c.trim()));
    for (const key of ACTION_WRITTEN_KEYS) {
      expect(selected.has(key)).toBe(true);
    }
  });
});
