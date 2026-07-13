/**
 * Itinerary "when" formatting — shared by NowNextCard and the dashboard
 * Itinerary link-card context line (glanceability sweep). Extracted from
 * `components/trip/now-next-card.tsx` so the two surfaces render the
 * exact same register instead of drifting apart (#404-A day-carry rule).
 *
 * Pure functions — no DB, no Date.now(); callers pass `now` explicitly.
 */

import { format } from "date-fns";

import { parseDateOnly } from "@/lib/utils/date-only";
import type { ItineraryItem } from "@/lib/db/types";

/**
 * "Up next" when-line (#404-A). A next item on a different calendar day
 * than `now` carries its day ("Wed Jul 29 · 6:30 PM"); a same-day item
 * keeps the bare time ("6:30 PM"). A whole-day future item (no start_time)
 * renders just the day. Returns "" when there's nothing to show (same-day
 * whole-day item), which the caller treats as "render no line".
 */
export function formatNextWhen(item: ItineraryItem, now: Date): string {
  const onDifferentDay = item.day !== format(now, "yyyy-MM-dd");
  const dayLabel = onDifferentDay
    ? format(parseDateOnly(item.day), "EEE MMM d")
    : null;
  const timeLabel = item.start_time ? formatTimeShort(item.start_time) : null;

  if (dayLabel && timeLabel) return `${dayLabel} · ${timeLabel}`;
  return dayLabel ?? timeLabel ?? "";
}

/** HH:MM (24h DB string) → "6:30 PM" (NowNextCard's shipped register). */
export function formatTimeShort(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
