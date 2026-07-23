/**
 * DaySection — renders one day's items in the itinerary timeline.
 *
 * Server Component. Heading is "Weekday · Date" per M3_UI_STRINGS template.
 * Items are ordered by start_time (already sorted from the DB query).
 *
 * The `day` prop is ISO `YYYY-MM-DD`. We parse it as a local date so
 * the weekday label matches the trip date (see notes/m3-execution-plan.md
 * §"Explicitly out of scope" — trip-local TZ rendering is deferred to #108).
 */

import { format, parseISO } from "date-fns";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { isCelebrantGapDay } from "@/lib/itinerary/celebrant-day-gap";
import { celebrantGapDayNote } from "@/lib/utils/celebrant-badge";
import { ItemCard } from "./item-card";
import type { ItineraryItem, ItineraryItemMemberFlag, ItineraryItemRsvpStatus, LodgingAssignment, TripMember } from "@/lib/db/types";

export interface DaySectionProps {
  day: string; // ISO YYYY-MM-DD
  items: ItineraryItem[];
  /** Map of itemId → caller's RSVP status (null = inherited). */
  myRsvpMap: Record<string, ItineraryItemRsvpStatus>;
  isOrganizer: boolean;
  isCelebrant: boolean;
  celebrantName?: string;
  /** Map of itemId → lodging assignments. Populated only for lodging items. */
  lodgingAssignmentsMap: Map<string, LodgingAssignment[]>;
  /** All trip members — used by LodgingRoster to display names. */
  tripMembers: TripMember[];
  /** IANA timezone from `trips.timezone` — forwarded to ItemCard → EditItemFormSheet. */
  tripTimezone: string;
  /** #365: itemId → member flags (organizer: all members; member: own). */
  itemFlagsMap: Map<string, ItineraryItemMemberFlag[]>;
  /** #394: trip-level "going" RSVP count — the per-head cost denominator. */
  inCount: number;
  /** #508: multi-day items that pass THROUGH this day (start day excluded,
   * end day included). Already RLS-filtered upstream. Rendered as light
   * "continues" markers under the heading — never as cards here. */
  continuingItems: ItineraryItem[];
  /** #484: id of the currently-in-progress item (or null) — flags the
   * matching card's "Now" chip. */
  nowItemId: string | null;
  /** #484: id of the next upcoming item (or null) — flags the matching
   * card's "Up next" chip. */
  nextItemId: string | null;
}

export function DaySection({
  day,
  items,
  myRsvpMap,
  isOrganizer,
  isCelebrant,
  celebrantName,
  lodgingAssignmentsMap,
  tripMembers,
  tripTimezone,
  itemFlagsMap,
  inCount,
  continuingItems,
  nowItemId,
  nextItemId,
}: DaySectionProps) {
  // parseISO treats the string as local midnight — keeps the weekday
  // consistent with what you'd expect for the trip date.
  const date = parseISO(day);
  const heading = M3_UI_STRINGS.itinerary_day_section_template
    .replace("{weekday}", format(date, "EEEE"))
    .replace("{date}", format(date, "MMM d"));

  // #480 gap-day note. The `!isCelebrant` leg is LOAD-BEARING (2026-05-20
  // decoy-item ADR): a celebrant who is also an organizer must never see
  // it — the note's existence would leak that this day hides content from
  // them. Guard lives here (not the page) so the one component that can
  // render the note also enforces who may see it.
  //
  // #508 interplay: this gap-day check reads only THIS day's own `items`,
  // never `continuingItems`. That is intentional — a day whose own items
  // are all hidden from the celebrant is still a gap for them even if a
  // multi-day booking happens to pass through it. The continues marker is
  // a display convenience, not a visibility-bearing item, so it must not
  // rescue the day out of gap status.
  const showGapNote =
    isOrganizer && !isCelebrant && isCelebrantGapDay(items);

  return (
    <section>
      <h2 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">
        {heading}
      </h2>
      {/* Organizer micro-affordance, same amber register as the per-item
          "Hidden from {name}" badge — a heads-up, never a gate. */}
      {showGapNote ? (
        <p
          data-testid="celebrant-gap-note"
          className="-mt-2 mb-3 text-xs text-amber-700 dark:text-amber-300"
        >
          {celebrantGapDayNote(celebrantName)}
        </p>
      ) : null}
      {/* #508: multi-day items passing through this day. Light one-liner
          each, above the cards — a heads-up that something spans this day
          without duplicating the full card from its start day. */}
      {continuingItems.length > 0 ? (
        <ul className="-mt-1 mb-3 flex flex-col gap-0.5">
          {continuingItems.map((item) => {
            // end_day is non-null by construction (continuingItemsForDay
            // filters nulls); this guard narrows the type without a
            // non-null assertion.
            if (item.end_day === null) return null;
            return (
              <li
                key={item.id}
                data-testid="continues-marker"
                className="text-muted-foreground text-xs"
              >
                {M3_UI_STRINGS.itinerary_continues_marker_template
                  .replace("{title}", item.title)
                  .replace("{date}", formatEndDayLabel(item.end_day))}
              </li>
            );
          })}
        </ul>
      ) : null}
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard
              item={item}
              myRsvpStatus={myRsvpMap[item.id] ?? null}
              isOrganizer={isOrganizer}
              isCelebrant={isCelebrant}
              celebrantName={celebrantName}
              lodgingAssignments={lodgingAssignmentsMap.get(item.id) ?? []}
              tripMembers={tripMembers}
              tripTimezone={tripTimezone}
              itemFlags={itemFlagsMap.get(item.id) ?? []}
              inCount={inCount}
              isNow={item.id === nowItemId}
              isNext={item.id === nextItemId}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Format a `YYYY-MM-DD` end-day string as `Mmm d`. Parses the parts
 * manually and builds a *local* Date — `new Date("YYYY-MM-DD")` parses as
 * UTC midnight and shifts a day in western timezones (same guard as
 * item-card.tsx's cross-day range label). `end_day` is non-null for every
 * item that reaches this helper (continuingItemsForDay filters nulls).
 */
function formatEndDayLabel(endDay: string): string {
  const [y, mo, d] = endDay.split("-").map(Number);
  return format(new Date(y, mo - 1, d), "MMM d");
}
