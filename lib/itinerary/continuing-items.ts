import type { ItineraryItem } from "@/lib/db/types";

/**
 * Multi-day "continues" marker source (#508, builds on #504 `end_day`).
 *
 * Given every itinerary item and a `YYYY-MM-DD` day string, return the
 * items that *pass through* that day: multi-day items whose span starts
 * strictly before `day` and ends on or after it. These render as a light
 * "continues" line under the day heading (see DaySection) so a booking
 * that spans several nights doesn't appear to vanish after its start day.
 *
 * Boundary semantics (all comparisons are lexicographic on the
 * zero-padded `YYYY-MM-DD` strings — NEVER `new Date(...)`, which parses
 * as UTC midnight and shifts a day in western timezones):
 *   - start day (`day === item.day`)      → excluded (the card renders there)
 *   - between days (`item.day < day`)      → included
 *   - end day (`day === item.end_day`)     → included (spans through it)
 *   - after end (`day > item.end_day`)     → excluded
 *   - single-day items (`end_day === null`) → never continue
 *
 * Visibility is not re-checked here: `allItems` is already RLS-filtered
 * per viewer at the page, so an item the viewer can't see never reaches
 * this helper and therefore never produces a marker.
 */
export function continuingItemsForDay(
  allItems: ItineraryItem[],
  day: string
): ItineraryItem[] {
  return allItems.filter(
    (item) =>
      item.end_day !== null && day > item.day && day <= item.end_day
  );
}
