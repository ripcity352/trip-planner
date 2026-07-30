/**
 * legNoteForDay (#524) — "lands 10:30 am" / "leaves 3:00 pm" annotation
 * for one member's travel legs against one trip day.
 *
 * Pure function, extracted from day-headcount.tsx because the
 * TZ-boundary matching is the one non-obvious step: `iso` is a
 * trip-local calendar date (from eachDayOfInterval over starts_at /
 * ends_at) and leg instants are UTC, so the leg is reduced to a
 * trip-local date via `isoToDbDate` before comparing. A red-eye that
 * lands 00:30 trip-local annotates the local landing day, not the UTC
 * date of the instant.
 *
 * Direction gating: inbound legs annotate their ARRIVE instant
 * ("lands"), outbound legs their DEPART instant ("leaves") — mirrors
 * the #477 two-section travel model. Legs missing that instant are
 * skipped. Multiple matches join with " · " (same-day land + leave).
 */

import { MEMBER_DAYS_UI_STRINGS } from "@/lib/copy/empty-states";
import { isoToDbDate, formatTripTime } from "@/lib/utils/format-trip-tz";
import type { TravelLeg } from "@/lib/db/types";

type LegForNote = Pick<TravelLeg, "direction" | "arrive_at" | "depart_at">;

export function legNoteForDay(
  legs: ReadonlyArray<LegForNote>,
  iso: string,
  timezone: string
): string | null {
  const notes = legs.flatMap((leg) => {
    if (
      leg.direction === "inbound" &&
      leg.arrive_at &&
      isoToDbDate(leg.arrive_at, timezone) === iso
    ) {
      return [
        MEMBER_DAYS_UI_STRINGS.memberDays_leg_lands_template.replace(
          "{time}",
          formatTripTime(leg.arrive_at, timezone)
        ),
      ];
    }
    if (
      leg.direction === "outbound" &&
      leg.depart_at &&
      isoToDbDate(leg.depart_at, timezone) === iso
    ) {
      return [
        MEMBER_DAYS_UI_STRINGS.memberDays_leg_leaves_template.replace(
          "{time}",
          formatTripTime(leg.depart_at, timezone)
        ),
      ];
    }
    return [];
  });

  return notes.length > 0 ? notes.join(" · ") : null;
}
