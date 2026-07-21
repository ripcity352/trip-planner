/**
 * Tests for `lib/utils/ride-share.ts` (#477).
 *
 * The manifest renders one quiet static line per cluster of inbound legs
 * that land at the same (non-empty) airport within 60 minutes. There is
 * NO matching engine and NO persistence (#118 stays open) — this is a
 * pure computed label.
 */

import { describe, expect, it } from "vitest";
import { computeRideShareClusters } from "../ride-share";
import type { TravelLeg } from "@/lib/db/types";

let seq = 0;
function makeLeg(overrides: Partial<TravelLeg> = {}): TravelLeg {
  seq += 1;
  return {
    id: `leg-${seq}`,
    trip_id: "trip-1",
    trip_member_id: `member-${seq}`,
    kind: "flight",
    depart_at: null,
    arrive_at: "2026-08-14T18:00:00.000Z",
    carrier: null,
    confirmation_code: null,
    notes: null,
    idempotency_key: null,
    created_at: "2026-08-01T00:00:00.000Z",
    airline_iata: null,
    flight_number: null,
    direction: "inbound",
    airport: "LAX",
    origin_label: null,
    ...overrides,
  };
}

describe("computeRideShareClusters", () => {
  it("clusters 2+ inbound legs at the same airport within 60 minutes", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ arrive_at: "2026-08-14T18:00:00.000Z" }),
      makeLeg({ arrive_at: "2026-08-14T18:45:00.000Z" }),
      makeLeg({ arrive_at: "2026-08-14T19:00:00.000Z" }),
    ]);
    expect(clusters).toEqual([{ airport: "LAX", count: 3 }]);
  });

  it("does not cluster legs at different airports even within the window", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ airport: "LAX", arrive_at: "2026-08-14T18:00:00.000Z" }),
      makeLeg({ airport: "BUR", arrive_at: "2026-08-14T18:10:00.000Z" }),
    ]);
    expect(clusters).toEqual([]);
  });

  it("does not cluster same-airport legs more than 60 minutes apart", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ arrive_at: "2026-08-14T18:00:00.000Z" }),
      makeLeg({ arrive_at: "2026-08-14T19:01:00.000Z" }),
    ]);
    expect(clusters).toEqual([]);
  });

  it("includes a leg exactly 60 minutes after the first", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ arrive_at: "2026-08-14T18:00:00.000Z" }),
      makeLeg({ arrive_at: "2026-08-14T19:00:00.000Z" }),
    ]);
    expect(clusters).toEqual([{ airport: "LAX", count: 2 }]);
  });

  it("ignores outbound legs entirely", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ direction: "outbound", depart_at: "2026-08-14T18:00:00.000Z" }),
      makeLeg({ direction: "outbound", depart_at: "2026-08-14T18:30:00.000Z" }),
      // even an outbound leg with a stray arrive_at must not count
      makeLeg({ direction: "outbound" }),
      makeLeg({ direction: "inbound" }),
    ]);
    expect(clusters).toEqual([]);
  });

  it("ignores legs with no airport or a blank airport", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ airport: null }),
      makeLeg({ airport: "   " }),
      makeLeg({ airport: "LAX" }),
    ]);
    expect(clusters).toEqual([]);
  });

  it("ignores inbound legs with no arrival time", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ arrive_at: null }),
      makeLeg({ arrive_at: null }),
    ]);
    expect(clusters).toEqual([]);
  });

  it("matches airports case-insensitively and ignores surrounding whitespace", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ airport: "lax", arrive_at: "2026-08-14T18:00:00.000Z" }),
      makeLeg({ airport: " LAX ", arrive_at: "2026-08-14T18:30:00.000Z" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
  });

  it("counts people, not legs — two legs by the same member are one person", () => {
    const clusters = computeRideShareClusters([
      makeLeg({
        trip_member_id: "member-same",
        arrive_at: "2026-08-14T18:00:00.000Z",
      }),
      makeLeg({
        trip_member_id: "member-same",
        arrive_at: "2026-08-14T18:30:00.000Z",
      }),
    ]);
    expect(clusters).toEqual([]);
  });

  it("emits one cluster per airport when both qualify", () => {
    const clusters = computeRideShareClusters([
      makeLeg({ airport: "LAX", arrive_at: "2026-08-14T18:00:00.000Z" }),
      makeLeg({ airport: "LAX", arrive_at: "2026-08-14T18:20:00.000Z" }),
      makeLeg({ airport: "BUR", arrive_at: "2026-08-14T20:00:00.000Z" }),
      makeLeg({ airport: "BUR", arrive_at: "2026-08-14T20:30:00.000Z" }),
    ]);
    expect(clusters).toHaveLength(2);
    const airports = clusters.map((c) => c.airport).sort();
    expect(airports).toEqual(["BUR", "LAX"]);
  });
});
