/**
 * Pure function: given a list of itinerary items and a reference "now" date,
 * returns which item is currently in progress and which one is next up.
 *
 * Timezone note: all date/time comparisons use the browser-local timezone
 * (i.e. the `now` Date is in local time and `day` strings are compared to
 * the local date string). This is a known M3 limitation — cross-timezone
 * trips will see the device's local clock. A per-trip timezone is deferred
 * to M4+ (#108). See notes/m3-execution-plan.md "Explicitly out of scope".
 *
 * Item time semantics:
 *   - `day` is YYYY-MM-DD (required).
 *   - `start_time` is HH:MM (nullable). If null, the item is a whole-day
 *     item that is "now" for the entire local calendar day.
 *   - `end_time` is HH:MM (nullable). If null on a timed item (start_time
 *     present), the item is treated as ongoing indefinitely past its start.
 *   - End time is exclusive: an item ending at 12:00 is not "now" at 12:00.
 *
 * Items MUST be pre-sorted by (day ASC, start_time ASC nulls last) — this
 * matches the order returned by `getItineraryByTrip`. The function does not
 * sort internally to stay pure and allocation-cheap.
 */

import type { ItineraryItem } from "@/lib/db/types";

export interface NowNextResult {
  now: ItineraryItem | null;
  next: ItineraryItem | null;
}

/**
 * Format a Date as a local YYYY-MM-DD string (not UTC) so comparisons
 * against the `day` field (which represents a calendar date) are
 * timezone-correct from the user's perspective.
 */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Combine a YYYY-MM-DD day string and an HH:MM time string into a
 * local-timezone Date object.
 */
function toLocalDateTime(day: string, time: string): Date {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, dayOfMonth, hours, minutes, 0, 0);
}

/**
 * Determine whether a given item is in progress at `now`.
 *
 * Whole-day items (start_time === null) are active for the entire local
 * calendar day.
 *
 * Timed items:
 *   - Active if now >= start && (end_time is null OR now < end)
 */
function isInProgress(item: ItineraryItem, now: Date): boolean {
  const todayStr = toLocalDateString(now);

  if (item.start_time === null) {
    // Whole-day item: in progress iff the local date matches
    return item.day === todayStr;
  }

  const start = toLocalDateTime(item.day, item.start_time);
  if (now < start) return false;

  if (item.end_time === null) {
    // No defined end — treat as ongoing once started
    return true;
  }

  const end = toLocalDateTime(item.day, item.end_time);
  // End is exclusive
  return now < end;
}

/**
 * Determine whether a given item is in the future relative to `now`.
 *
 * Whole-day items on a future day are "next". A whole-day item on today
 * that is also "in progress" will be filtered before this is called.
 *
 * Timed items are "next" if their start_time is strictly after now.
 */
function isUpcoming(item: ItineraryItem, now: Date): boolean {
  const todayStr = toLocalDateString(now);

  if (item.start_time === null) {
    // Whole-day: future means day is strictly after today
    return item.day > todayStr;
  }

  const start = toLocalDateTime(item.day, item.start_time);
  return start > now;
}

/**
 * Given a pre-sorted list of itinerary items and the current time, return
 * the item currently in progress and the next upcoming item.
 *
 * - If nothing is in progress, `now` is null.
 * - If nothing upcoming exists after the in-progress item, `next` is null.
 * - If no items exist at all, both are null.
 */
export function whatsHappeningNow(
  items: ItineraryItem[],
  now: Date
): NowNextResult {
  if (items.length === 0) {
    return { now: null, next: null };
  }

  const inProgress = items.find((i) => isInProgress(i, now)) ?? null;
  const next = items.find((i) => isUpcoming(i, now)) ?? null;

  return { now: inProgress, next };
}
