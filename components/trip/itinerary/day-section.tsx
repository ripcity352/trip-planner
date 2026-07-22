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
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
