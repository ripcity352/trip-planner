/**
 * Tests for `lib/utils/itinerary-when.ts` — the when-line formatting
 * extracted from NowNextCard (#404-A day-carry rule) so the dashboard
 * Itinerary glance line and the card share one register.
 */

import { describe, expect, it } from "vitest";

import {
  formatEndWhen,
  formatNextWhen,
  formatTimeShort,
} from "@/lib/utils/itinerary-when";
import type { ItineraryItem } from "@/lib/db/types";

// Minimal fixture — only day / start_time matter to formatNextWhen.
function item(
  day: string,
  start_time: string | null,
  end_time: string | null = null
): ItineraryItem {
  return {
    id: "i-1",
    trip_id: "trip-1",
    day,
    start_time,
    end_time,
    end_day: null,
    title: "Dinner",
    location: null,
    address: null,
    notes: null,
    cost_cents: null,
    currency: "USD",
    created_by: "u-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    visibility: "everyone",
    kind: "activity",
    activity_tag: [],
    dress_code: null,
    idempotency_key: null,
  };
}

describe("formatNextWhen", () => {
  const now = new Date("2026-07-25T10:00:00"); // local Sat Jul 25

  it("carries the day for an item on a different calendar day", () => {
    expect(formatNextWhen(item("2026-07-29", "18:30"), now)).toBe(
      "Wed Jul 29 · 6:30 PM"
    );
  });

  it("keeps the bare time for a same-day item", () => {
    expect(formatNextWhen(item("2026-07-25", "18:30"), now)).toBe("6:30 PM");
  });

  it("renders just the day for a whole-day item on a future day", () => {
    expect(formatNextWhen(item("2026-07-29", null), now)).toBe("Wed Jul 29");
  });

  it("returns empty string for a same-day whole-day item", () => {
    expect(formatNextWhen(item("2026-07-25", null), now)).toBe("");
  });
});

describe("formatEndWhen", () => {
  it("carries the end day for a cross-day item (#504)", () => {
    const crossDay = {
      ...item("2026-08-16", "08:00", "12:00"),
      end_day: "2026-08-18",
    };
    expect(formatEndWhen(crossDay)).toBe("Tue Aug 18 · 12:00 PM");
  });

  it("keeps the bare time when end_day equals day", () => {
    const sameDay = {
      ...item("2026-08-16", "18:00", "21:00"),
      end_day: "2026-08-16",
    };
    expect(formatEndWhen(sameDay)).toBe("9:00 PM");
  });

  it("keeps the bare time when end_day is null (pre-#504 rows)", () => {
    expect(formatEndWhen(item("2026-08-16", "18:00", "21:00"))).toBe("9:00 PM");
  });

  it("returns null when the item has no end_time", () => {
    expect(formatEndWhen(item("2026-08-16", "18:00"))).toBeNull();
  });
});

describe("formatTimeShort", () => {
  it("formats afternoon times as PM", () => {
    expect(formatTimeShort("18:30")).toBe("6:30 PM");
  });

  it("formats morning times as AM with padded minutes", () => {
    expect(formatTimeShort("09:05")).toBe("9:05 AM");
  });

  it("maps midnight and noon to 12", () => {
    expect(formatTimeShort("00:00")).toBe("12:00 AM");
    expect(formatTimeShort("12:00")).toBe("12:00 PM");
  });
});
