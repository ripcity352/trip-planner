/**
 * NowNextCard — dashboard "What's happening now / next" card (#77).
 *
 * Server Component. Three render states driven by the pure function
 * `whatsHappeningNow`:
 *
 *   Pre-trip: items exist but all are future → shows "Up next: <item>"
 *             (or no-items copy when the itinerary is empty).
 *   In-trip:  currently-active item + next item (if any).
 *   Post-trip: now=null, next=null, items in the past → "Trip wrapped N
 *              days ago." + recap placeholder (NOT a link — M5 territory).
 *
 * The "pre-trip" vs "post-trip" disambiguation is done by checking
 * whether the items list has any future items. When items is empty or all
 * items are in the past with next=null, we check trip.ends_at to decide
 * which state to render.
 *
 * Timezone note: uses browser-local time via `new Date()` for the `now`
 * argument passed to the pure function. Cross-timezone trips will see the
 * server's local clock at render time. Deferred to M4+ (#108).
 */

import { differenceInCalendarDays } from "date-fns";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { whatsHappeningNow } from "@/lib/utils/whats-happening-now";
import { formatNextWhen, formatTimeShort } from "@/lib/utils/itinerary-when";
import { parseDateOnly } from "@/lib/utils/date-only";
import type { ItineraryItem, Trip } from "@/lib/db/types";

interface NowNextCardProps {
  trip: Trip;
  items: ItineraryItem[];
}

export async function NowNextCard({ trip, items }: NowNextCardProps) {
  const now = new Date();
  const { now: currentItem, next: nextItem } = whatsHappeningNow(items, now);

  // No items at all — show the empty itinerary nudge
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {M3_UI_STRINGS.nowNext_no_items_yet}
        </p>
      </div>
    );
  }

  // Post-trip state: items exist, none are in progress, none are upcoming,
  // and the trip ended at least a full calendar day ago. We use
  // `differenceInCalendarDays >= 1` (not raw `< now`) so the trip-end day
  // itself doesn't render "Trip wrapped 0 days ago." — voice-test fail.
  const daysSinceEnd =
    trip.ends_at !== null
      ? differenceInCalendarDays(now, parseDateOnly(trip.ends_at))
      : -1;
  const isPostTrip =
    currentItem === null && nextItem === null && daysSinceEnd >= 1;

  if (isPostTrip) {
    const daysLabel =
      daysSinceEnd === 1 ? "1 day" : `${daysSinceEnd} days`;

    return (
      <div className="rounded-md border border-border bg-card px-4 py-3 space-y-1">
        <p className="text-sm font-medium">
          {M3_UI_STRINGS.nowNext_posttrip_template.replace("{days}", daysLabel)}
        </p>
        {/* Recap placeholder — intentionally NOT a link (M5 territory) */}
        <p className="text-muted-foreground text-sm">
          {M3_UI_STRINGS.nowNext_recap_placeholder}
        </p>
      </div>
    );
  }

  // In-trip or pre-trip: show now/next items
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 space-y-3">
      {currentItem ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {M3_UI_STRINGS.nowNext_now_heading}
          </p>
          <p className="text-sm font-medium mt-0.5">{currentItem.title}</p>
          {currentItem.start_time ? (
            <p className="text-xs text-muted-foreground">
              {formatTimeShort(currentItem.start_time)}
              {currentItem.end_time
                ? ` – ${formatTimeShort(currentItem.end_time)}`
                : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {nextItem ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {M3_UI_STRINGS.nowNext_next_heading}
          </p>
          <p className="text-sm font-medium mt-0.5">{nextItem.title}</p>
          {/* #404-A: carry the day when the next item is on a different
              calendar day than today, so a fresh member weeks out reads
              "Wed Jul 29 · 6:30 PM" — not a bare time that implies tonight. */}
          {formatNextWhen(nextItem, now) ? (
            <p className="text-xs text-muted-foreground">
              {formatNextWhen(nextItem, now)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* #404-A/B: pre-trip countdown. Shows whenever nothing is currently
          in progress and the trip hasn't started yet — the old
          `!currentItem && !nextItem` gate made this unreachable the moment
          any future item existed, silently dropping the "countdown + first
          item" half of the M3 DoD. #404-B: `parseDateOnly` (not raw
          `new Date()`) so the date-only `starts_at` parses as local
          midnight, not UTC (which counts a day short west of UTC). */}
      {!currentItem &&
      trip.starts_at &&
      parseDateOnly(trip.starts_at) > now ? (
        <p className="text-sm text-muted-foreground">
          {M3_UI_STRINGS.nowNext_pretrip_template.replace(
            "{days}",
            formatDaysUntil(parseDateOnly(trip.starts_at), now)
          )}
        </p>
      ) : null}
    </div>
  );
}

function formatDaysUntil(target: Date, now: Date): string {
  const days = differenceInCalendarDays(target, now);
  return days === 1 ? "1 day" : `${days} days`;
}
