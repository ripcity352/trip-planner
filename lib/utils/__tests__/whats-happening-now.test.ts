/**
 * Tests for `lib/utils/whats-happening-now.ts` — pure function unit tests.
 *
 * TDD: RED phase — these tests are written before the implementation.
 * Every scenario is driven by fixed Date objects + ItineraryItem fixtures
 * so the function is always deterministic.
 *
 * Scenarios covered:
 *   1. Empty items array
 *   2. Pre-trip — all items in the future (now=null, next=first item)
 *   3. In-progress — one item is currently active (now=item, next=following item)
 *   4. Between items — active item just ended, next is upcoming (now=null, next=item)
 *   5. Post-trip — all items in the past (now=null, next=null)
 *   6. Item with null start_time (whole-day) is "now" when day === today
 *   7. Item with null start_time on a prior day is not "now" (past whole-day)
 *   8. Concurrent items — finds the first active one
 */

import { describe, expect, it } from "vitest";
import { whatsHappeningNow } from "@/lib/utils/whats-happening-now";
import type { ItineraryItem } from "@/lib/db/types";

// Minimal fixture helper — only the fields the pure function cares about.
function item(
  id: string,
  day: string,
  start_time: string | null,
  end_time: string | null,
  title = `Item ${id}`
): ItineraryItem {
  return {
    id,
    trip_id: "trip-1",
    day,
    start_time,
    end_time,
    end_day: null,
    title,
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

describe("whatsHappeningNow", () => {
  it("returns { now: null, next: null } for an empty items array", () => {
    const result = whatsHappeningNow([], new Date("2026-06-15T12:00:00"));
    expect(result).toEqual({ now: null, next: null });
  });

  it("returns now=null, next=first item when all items are in the future (pre-trip)", () => {
    const items = [
      item("a", "2026-07-01", "10:00", "12:00"),
      item("b", "2026-07-02", "14:00", "16:00"),
    ];
    const now = new Date("2026-06-15T12:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now).toBeNull();
    expect(result.next?.id).toBe("a");
  });

  it("returns now=active item, next=following item when in-progress", () => {
    const items = [
      item("a", "2026-07-01", "09:00", "11:00"),
      item("b", "2026-07-01", "14:00", "16:00"),
    ];
    // 10:00 on 2026-07-01 — inside item "a"
    const now = new Date("2026-07-01T10:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now?.id).toBe("a");
    expect(result.next?.id).toBe("b");
  });

  it("returns now=null, next=upcoming item between items (gap)", () => {
    const items = [
      item("a", "2026-07-01", "09:00", "11:00"),
      item("b", "2026-07-01", "14:00", "16:00"),
    ];
    // 12:00 — after "a" ended, before "b" starts
    const now = new Date("2026-07-01T12:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now).toBeNull();
    expect(result.next?.id).toBe("b");
  });

  it("returns { now: null, next: null } when all items are in the past (post-trip)", () => {
    const items = [
      item("a", "2026-06-01", "10:00", "12:00"),
      item("b", "2026-06-02", "14:00", "16:00"),
    ];
    const now = new Date("2026-07-01T12:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now).toBeNull();
    expect(result.next).toBeNull();
  });

  it("whole-day item (null start_time) is 'now' when day === today", () => {
    const items = [item("a", "2026-07-01", null, null)];
    // Any time during 2026-07-01 — whole-day items span the full day
    const now = new Date("2026-07-01T15:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now?.id).toBe("a");
    expect(result.next).toBeNull();
  });

  it("whole-day item (null start_time) on a prior day is NOT 'now'", () => {
    const items = [
      item("a", "2026-06-30", null, null),
      item("b", "2026-07-01", "10:00", "12:00"),
    ];
    // Now is 2026-07-01 09:00 — "a" was yesterday, "b" hasn't started yet
    const now = new Date("2026-07-01T09:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now).toBeNull();
    expect(result.next?.id).toBe("b");
  });

  it("whole-day item (null start_time) on a future day is 'next', not 'now'", () => {
    const items = [item("a", "2026-07-02", null, null)];
    const now = new Date("2026-07-01T12:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now).toBeNull();
    expect(result.next?.id).toBe("a");
  });

  it("items are pre-sorted by day+start_time ASC; picks the first in-progress one", () => {
    // Two items: "a" is currently in-progress; "c" starts in the future.
    // "b" (12:00-14:00) has already started at 13:00, so it is also in-progress
    // but "a" (which started earlier) takes priority as the "now" item.
    // Per spec: next = first item whose start_time is strictly AFTER now.
    const items = [
      item("a", "2026-07-01", "09:00", "18:00", "All-day event"),
      item("b", "2026-07-01", "12:00", "14:00", "Lunch"),
      item("c", "2026-07-01", "16:00", "18:00", "Dinner"),
    ];
    const now = new Date("2026-07-01T13:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now?.id).toBe("a");
    expect(result.next?.id).toBe("c");
  });

  it("end_time null on a timed item means the item has no defined end — treated as ongoing past its start", () => {
    // Item has start_time but no end_time — treated as ongoing indefinitely once started
    const items = [item("a", "2026-07-01", "10:00", null)];
    const now = new Date("2026-07-01T15:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now?.id).toBe("a");
    expect(result.next).toBeNull();
  });

  it("item is not 'now' before its start_time", () => {
    const items = [item("a", "2026-07-01", "14:00", "16:00")];
    const now = new Date("2026-07-01T09:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now).toBeNull();
    expect(result.next?.id).toBe("a");
  });

  it("item is not 'now' exactly at end_time (end is exclusive)", () => {
    const items = [
      item("a", "2026-07-01", "10:00", "12:00"),
      item("b", "2026-07-01", "14:00", "16:00"),
    ];
    // exactly at 12:00 — "a" is done, "b" is next
    const now = new Date("2026-07-01T12:00:00");
    const result = whatsHappeningNow(items, now);
    expect(result.now).toBeNull();
    expect(result.next?.id).toBe("b");
  });

  // #504 end_day: the end instant is (end_day ?? day) + end_time.
  it("multi-day item (end_day) stays 'now' past its start day's end_time", () => {
    // Sun 8am → Tue 12pm; Monday afternoon is still in progress
    const multi = {
      ...item("a", "2026-06-14", "08:00", "12:00"),
      end_day: "2026-06-16",
    };
    const result = whatsHappeningNow([multi], new Date("2026-06-15T13:00:00"));
    expect(result.now?.id).toBe("a");
  });

  it("multi-day item ends (exclusive) at end_day + end_time", () => {
    const multi = {
      ...item("a", "2026-06-14", "08:00", "12:00"),
      end_day: "2026-06-16",
    };
    const result = whatsHappeningNow([multi], new Date("2026-06-16T12:00:00"));
    expect(result.now).toBeNull();
  });

  it("end_day equal to day behaves exactly like a same-day item", () => {
    const sameDay = {
      ...item("a", "2026-06-15", "08:00", "12:00"),
      end_day: "2026-06-15",
    };
    const result = whatsHappeningNow(
      [sameDay],
      new Date("2026-06-15T13:00:00")
    );
    expect(result.now).toBeNull();
  });
});
