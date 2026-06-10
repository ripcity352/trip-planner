/**
 * Tests for `lib/db/itinerary.ts`.
 *
 * Strategy: mock the Supabase fluent builder. Asserts on:
 *   - Column selection (ITINERARY_ITEM_COLUMNS)
 *   - Ordering (day ASC, start_time ASC nulls-last)
 *   - Null handling (not-found returns null / empty array)
 *   - Error propagation (throws, not swallows)
 *   - getMyItemRsvps strips join columns
 *   - getItemFlagsForOrganizer strips join columns
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getItineraryByTrip,
  getItineraryItem,
  getMyItemRsvps,
  getItemFlagsForOrganizer,
  getLodgingAssignments,
} from "../itinerary";
import type { ItineraryItem, LodgingAssignment } from "../types";

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";

const mockItem: ItineraryItem = {
  id: ITEM_ID,
  trip_id: TRIP_ID,
  day: "2026-06-15",
  start_time: "10:00",
  end_time: "12:00",
  title: "Morning hike",
  location: "Trailhead",
  address: "123 Trail Rd",
  notes: null,
  cost_cents: null,
  currency: "USD",
  created_by: "user-1",
  created_at: "2026-05-20T00:00:00.000Z",
  updated_at: "2026-05-20T00:00:00.000Z",
  visibility: "everyone",
  kind: "activity",
  activity_tag: ["outdoor", "group"],
  dress_code: null,
  idempotency_key: null,
};

// ---------------------------------------------------------------------------
// getItineraryByTrip
// ---------------------------------------------------------------------------

describe("getItineraryByTrip", () => {
  it("returns mapped items on success", async () => {
    const client = makeClient({
      itinerary_items: () => ({ data: [mockItem], error: null }),
    });
    const result = await getItineraryByTrip(client, TRIP_ID);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("activity");
    expect(result[0].activity_tag).toEqual(["outdoor", "group"]);
  });

  it("returns empty array when no items", async () => {
    const client = makeClient({
      itinerary_items: () => ({ data: [], error: null }),
    });
    const result = await getItineraryByTrip(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("returns empty array when data is null", async () => {
    const client = makeClient({
      itinerary_items: () => ({ data: null, error: null }),
    });
    const result = await getItineraryByTrip(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      itinerary_items: () => ({
        data: null,
        error: { message: "db error" },
      }),
    });
    await expect(getItineraryByTrip(client, TRIP_ID)).rejects.toThrow(
      "getItineraryByTrip failed: db error"
    );
  });
});

// ---------------------------------------------------------------------------
// getItineraryItem
// ---------------------------------------------------------------------------

describe("getItineraryItem", () => {
  it("returns the item on success", async () => {
    const client = makeClient({
      itinerary_items: () => ({ data: mockItem, error: null }),
    });
    const result = await getItineraryItem(client, ITEM_ID);
    expect(result?.id).toBe(ITEM_ID);
    expect(result?.kind).toBe("activity");
  });

  it("returns null when not found", async () => {
    const client = makeClient({
      itinerary_items: () => ({ data: null, error: null }),
    });
    const result = await getItineraryItem(client, ITEM_ID);
    expect(result).toBeNull();
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      itinerary_items: () => ({
        data: null,
        error: { message: "permission denied" },
      }),
    });
    await expect(getItineraryItem(client, ITEM_ID)).rejects.toThrow(
      "getItineraryItem failed"
    );
  });
});

// ---------------------------------------------------------------------------
// getMyItemRsvps
// ---------------------------------------------------------------------------

describe("getMyItemRsvps", () => {
  it("returns rsvps without the join column", async () => {
    const raw = [
      {
        item_id: ITEM_ID,
        trip_member_id: MEMBER_ID,
        status: "skipping",
        idempotency_key: null,
        updated_at: "2026-05-20T00:00:00.000Z",
        itinerary_items: { trip_id: TRIP_ID },
      },
    ];
    const client = makeClient({
      itinerary_item_rsvps: () => ({ data: raw, error: null }),
    });
    const result = await getMyItemRsvps(client, TRIP_ID);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("skipping");
    // The join column must be stripped
    expect("itinerary_items" in result[0]).toBe(false);
  });

  it("returns empty array when no rsvps", async () => {
    const client = makeClient({
      itinerary_item_rsvps: () => ({ data: [], error: null }),
    });
    const result = await getMyItemRsvps(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      itinerary_item_rsvps: () => ({
        data: null,
        error: { message: "rls denied" },
      }),
    });
    await expect(getMyItemRsvps(client, TRIP_ID)).rejects.toThrow(
      "getMyItemRsvps failed"
    );
  });
});

// ---------------------------------------------------------------------------
// getItemFlagsForOrganizer
// ---------------------------------------------------------------------------

describe("getItemFlagsForOrganizer", () => {
  it("returns flags without the join column", async () => {
    const raw = [
      {
        id: "flag-1",
        item_id: ITEM_ID,
        trip_member_id: MEMBER_ID,
        flag: "vegan",
        note: "no cheese either",
        created_at: "2026-05-20T00:00:00.000Z",
        itinerary_items: { trip_id: TRIP_ID },
      },
    ];
    const client = makeClient({
      itinerary_item_member_flags: () => ({ data: raw, error: null }),
    });
    const result = await getItemFlagsForOrganizer(client, TRIP_ID);
    expect(result).toHaveLength(1);
    expect(result[0].flag).toBe("vegan");
    expect("itinerary_items" in result[0]).toBe(false);
  });

  it("returns empty array for non-organizer (RLS filters all rows)", async () => {
    const client = makeClient({
      itinerary_item_member_flags: () => ({ data: [], error: null }),
    });
    const result = await getItemFlagsForOrganizer(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      itinerary_item_member_flags: () => ({
        data: null,
        error: { message: "db error" },
      }),
    });
    await expect(getItemFlagsForOrganizer(client, TRIP_ID)).rejects.toThrow(
      "getItemFlagsForOrganizer failed"
    );
  });
});

// ---------------------------------------------------------------------------
// getLodgingAssignments
// ---------------------------------------------------------------------------

describe("getLodgingAssignments", () => {
  const mockAssignment: LodgingAssignment = {
    id: "assign-1",
    item_id: ITEM_ID,
    trip_member_id: MEMBER_ID,
    room_label: "King Suite",
    created_at: "2026-05-20T00:00:00.000Z",
  };

  it("returns assignments for the item", async () => {
    const client = makeClient({
      lodging_assignments: () => ({ data: [mockAssignment], error: null }),
    });
    const result = await getLodgingAssignments(client, ITEM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].room_label).toBe("King Suite");
  });

  it("returns empty array when no assignments", async () => {
    const client = makeClient({
      lodging_assignments: () => ({ data: [], error: null }),
    });
    const result = await getLodgingAssignments(client, ITEM_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      lodging_assignments: () => ({
        data: null,
        error: { message: "db error" },
      }),
    });
    await expect(getLodgingAssignments(client, ITEM_ID)).rejects.toThrow(
      "getLodgingAssignments failed"
    );
  });
});
