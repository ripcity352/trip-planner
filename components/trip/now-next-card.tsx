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
      <div className="rounded-xl border border-border bg-card px-4 py-3">
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
      ? differenceInCalendarDays(now, new Date(trip.ends_at))
      : -1;
  const isPostTrip =
    currentItem === null && nextItem === null && daysSinceEnd >= 1;

  if (isPostTrip) {
    const daysLabel =
      daysSinceEnd === 1 ? "1 day" : `${daysSinceEnd} days`;

    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-1">
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
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-3">
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
          {nextItem.start_time ? (
            <p className="text-xs text-muted-foreground">
              {formatTimeShort(nextItem.start_time)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Pre-trip with no current item — show days-until if trip hasn't started */}
      {!currentItem && !nextItem && trip.starts_at && new Date(trip.starts_at) > now ? (
        <p className="text-sm text-muted-foreground">
          {M3_UI_STRINGS.nowNext_pretrip_template.replace(
            "{days}",
            formatDaysUntil(new Date(trip.starts_at), now)
          )}
        </p>
      ) : null}
    </div>
  );
}

function formatTimeShort(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDaysUntil(target: Date, now: Date): string {
  const days = differenceInCalendarDays(target, now);
  return days === 1 ? "1 day" : `${days} days`;
}
