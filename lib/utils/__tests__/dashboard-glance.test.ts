/**
 * Tests for `lib/utils/dashboard-glance.ts` — the pure computations
 * behind the dashboard link-card context lines.
 *
 * The expense-net test pins the two boundaries that matter:
 *   - viewer-own-position only (peer positions are never computed)
 *   - splits of RLS-hidden expenses are dropped (visibility pairing)
 */

import { describe, expect, it } from "vitest";

import {
  computeViewerNetPosition,
  summarizeArrivals,
} from "@/lib/utils/dashboard-glance";

const NOW = new Date("2026-07-13T12:00:00Z");

describe("summarizeArrivals", () => {
  it("returns zero landed / no next for an empty list", () => {
    expect(summarizeArrivals([], NOW)).toEqual({
      landed: 0,
      nextArrival: null,
    });
  });

  it("counts arrivals at or before now as landed (inclusive boundary)", () => {
    const result = summarizeArrivals(
      ["2026-07-13T09:00:00Z", "2026-07-13T12:00:00Z"],
      NOW
    );
    expect(result.landed).toBe(2);
    expect(result.nextArrival).toBeNull();
  });

  it("picks the earliest future arrival regardless of input order", () => {
    const result = summarizeArrivals(
      ["2026-07-14T18:00:00Z", "2026-07-13T09:00:00Z", "2026-07-13T15:00:00Z"],
      NOW
    );
    expect(result.landed).toBe(1);
    expect(result.nextArrival?.toISOString()).toBe("2026-07-13T15:00:00.000Z");
  });
});

describe("computeViewerNetPosition", () => {
  const expense = (
    id: string,
    payer_id: string,
    amount_cents: number,
    currency = "USD"
  ) => ({ id, payer_id, amount_cents, currency });
  const split = (
    expense_id: string,
    trip_member_id: string,
    amount_cents: number
  ) => ({ expense_id, trip_member_id, amount_cents });

  it("returns null when there are no visible expenses", () => {
    expect(computeViewerNetPosition([], [], "m-1", "u-1")).toBeNull();
  });

  it("nets what the viewer paid against their own share", () => {
    // Viewer paid $100, owes $50 of it and $20 of someone else's spend.
    const result = computeViewerNetPosition(
      [expense("e-1", "u-1", 10_000), expense("e-2", "u-2", 4_000)],
      [
        split("e-1", "m-1", 5_000),
        split("e-1", "m-2", 5_000),
        split("e-2", "m-1", 2_000),
        split("e-2", "m-2", 2_000),
      ],
      "m-1",
      "u-1"
    );
    expect(result).toEqual({ netCents: 3_000, currency: "USD" });
  });

  it("goes negative when the viewer's share exceeds what they paid", () => {
    const result = computeViewerNetPosition(
      [expense("e-1", "u-2", 8_000)],
      [split("e-1", "m-1", 4_000), split("e-1", "m-2", 4_000)],
      "m-1",
      "u-1"
    );
    expect(result?.netCents).toBe(-4_000);
  });

  it("drops splits whose parent expense is not in the visible list", () => {
    // e-hidden was RLS-filtered from the expense read; its split row
    // (member-gated, not visibility-gated) must not leak into the math.
    const result = computeViewerNetPosition(
      [expense("e-1", "u-2", 6_000)],
      [split("e-1", "m-1", 3_000), split("e-hidden", "m-1", 99_999)],
      "m-1",
      "u-1"
    );
    expect(result?.netCents).toBe(-3_000);
  });

  it("carries the first visible expense's currency", () => {
    const result = computeViewerNetPosition(
      [expense("e-1", "u-1", 1_000, "EUR")],
      [],
      "m-1",
      "u-1"
    );
    expect(result?.currency).toBe("EUR");
  });
});
