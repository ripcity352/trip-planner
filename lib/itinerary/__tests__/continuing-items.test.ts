/**
 * Unit tests for continuingItemsForDay (#508) — pure helper selecting the
 * multi-day items that pass THROUGH a given day (start excluded, end
 * included). Lexicographic YYYY-MM-DD comparison only. TDD: written first.
 */

import { describe, it, expect } from "vitest";
import { continuingItemsForDay } from "../continuing-items";
import type { ItineraryItem } from "@/lib/db/types";

const makeItem = (overrides: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: "item-1",
  trip_id: "trip-1",
  title: "Beach villa",
  kind: "lodging",
  day: "2026-08-01",
  start_time: null,
  end_time: null,
  end_day: "2026-08-04",
  location: null,
  address: null,
  notes: null,
  cost_cents: null,
  currency: "USD",
  created_by: "user-1",
  created_at: "2026-05-20T00:00:00Z",
  updated_at: "2026-05-20T00:00:00Z",
  visibility: "everyone",
  activity_tag: [],
  dress_code: null,
  idempotency_key: null,
  ...overrides,
});

describe("continuingItemsForDay", () => {
  it("excludes the start day (the card renders there)", () => {
    const item = makeItem({ day: "2026-08-01", end_day: "2026-08-04" });
    expect(continuingItemsForDay([item], "2026-08-01")).toEqual([]);
  });

  it("includes a between day", () => {
    const item = makeItem({ id: "v", day: "2026-08-01", end_day: "2026-08-04" });
    expect(continuingItemsForDay([item], "2026-08-02")).toEqual([item]);
  });

  it("includes the end day (spans through it)", () => {
    const item = makeItem({ id: "v", day: "2026-08-01", end_day: "2026-08-04" });
    expect(continuingItemsForDay([item], "2026-08-04")).toEqual([item]);
  });

  it("excludes days after the end day", () => {
    const item = makeItem({ day: "2026-08-01", end_day: "2026-08-04" });
    expect(continuingItemsForDay([item], "2026-08-05")).toEqual([]);
  });

  it("never returns an item with a null end_day (single-day item)", () => {
    const item = makeItem({ day: "2026-08-01", end_day: null });
    expect(continuingItemsForDay([item], "2026-08-02")).toEqual([]);
  });

  it("returns an item that spans the whole trip on every interior day", () => {
    const item = makeItem({ id: "pass", day: "2026-08-01", end_day: "2026-08-05" });
    expect(continuingItemsForDay([item], "2026-08-02")).toEqual([item]);
    expect(continuingItemsForDay([item], "2026-08-03")).toEqual([item]);
    expect(continuingItemsForDay([item], "2026-08-04")).toEqual([item]);
  });

  it("never returns a same-day item (end_day equals day)", () => {
    const item = makeItem({ day: "2026-08-01", end_day: "2026-08-01" });
    expect(continuingItemsForDay([item], "2026-08-01")).toEqual([]);
    expect(continuingItemsForDay([item], "2026-08-02")).toEqual([]);
  });

  it("filters a mixed list to only the items passing through the day", () => {
    const spanning = makeItem({ id: "span", day: "2026-08-01", end_day: "2026-08-04" });
    const singleToday = makeItem({ id: "single", day: "2026-08-02", end_day: null });
    const alreadyEnded = makeItem({ id: "past", day: "2026-07-30", end_day: "2026-08-01" });
    expect(
      continuingItemsForDay([spanning, singleToday, alreadyEnded], "2026-08-02")
    ).toEqual([spanning]);
  });
});
