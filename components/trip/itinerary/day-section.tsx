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
import { ItemCard } from "./item-card";
import type { ItineraryItem, ItineraryItemRsvpStatus } from "@/lib/db/types";

export interface DaySectionProps {
  day: string; // ISO YYYY-MM-DD
  items: ItineraryItem[];
  /** Map of itemId → caller's RSVP status (null = inherited). */
  myRsvpMap: Record<string, ItineraryItemRsvpStatus>;
  isOrganizer: boolean;
  isCelebrant: boolean;
  celebrantName?: string;
}

export function DaySection({
  day,
  items,
  myRsvpMap,
  isOrganizer,
  isCelebrant,
  celebrantName,
}: DaySectionProps) {
  // parseISO treats the string as local midnight — keeps the weekday
  // consistent with what you'd expect for the trip date.
  const date = parseISO(day);
  const heading = M3_UI_STRINGS.itinerary_day_section_template
    .replace("{weekday}", format(date, "EEEE"))
    .replace("{date}", format(date, "MMM d"));

  return (
    <section>
      <h2 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">
        {heading}
      </h2>
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard
              item={item}
              myRsvpStatus={myRsvpMap[item.id] ?? null}
              isOrganizer={isOrganizer}
              isCelebrant={isCelebrant}
              celebrantName={celebrantName}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
