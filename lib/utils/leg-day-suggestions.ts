/**
 * deriveLegDaySuggestions (#525) — after a travel leg saves, what
 * day-chip changes does it imply?
 *
 * Pure derivation: leg + the member's own day rows → suggested
 * `trip_member_days` mutations. NOTHING here writes; the prompt UI
 * applies them via the existing `setMemberDayAction` only when the
 * member taps yes ("suggest, don't write" — brainstorm 2026-07-30).
 * Chips stay the only writer of day rows; exceptions stay free.
 *
 * Rules (trip-local dates throughout — leg instants are UTC and reduce
 * via `isoToDbDate`, same TZ-boundary handling as leg-day-note):
 *
 *   - Inbound landing day D: suggest 'going' for every unmarked
 *     (not-'going') day from D through the member's current last going
 *     day — or the trip end when they haven't marked anything after D.
 *     If their last going day is BEFORE D the chips contradict the leg;
 *     that's #526's cue, not a suggestion — return null.
 *   - Outbound departing day D: suggest clearing ('declined') every
 *     day AFTER D still marked going. Departure day itself stays
 *     around.
 *
 * Returns null when there's nothing to suggest (no trip dates, no leg
 * instant, out-of-range leg day, or no implied changes).
 */

import { eachDayOfInterval, format } from "date-fns";

import { parseDateOnly } from "@/lib/utils/date-only";
import { isoToDbDate } from "@/lib/utils/format-trip-tz";
import type { SettableMemberDayStatus } from "@/lib/actions/trip-member-days";
import type { MemberDay } from "@/lib/db/trip-member-days";
import type { TravelLeg } from "@/lib/db/types";

export interface LegDaySuggestion {
  /** ISO date — `YYYY-MM-DD`. */
  date: string;
  status: SettableMemberDayStatus;
}

export interface LegDaySuggestions {
  kind: "inbound" | "outbound";
  /** Trip-local day of the leg's instant — `YYYY-MM-DD`. */
  legDayIso: string;
  /** At least one entry — empty derivations return null instead. */
  days: LegDaySuggestion[];
}

/** ISO dates compare lexicographically — no Date parsing needed. */
function tripDays(startIso: string, endIso: string): string[] {
  return eachDayOfInterval({
    start: parseDateOnly(startIso),
    end: parseDateOnly(endIso),
  }).map((d) => format(d, "yyyy-MM-dd"));
}

export function deriveLegDaySuggestions(args: {
  leg: Pick<TravelLeg, "direction" | "arrive_at" | "depart_at">;
  /** The member's OWN day rows (getMemberDays shape). */
  memberDays: ReadonlyArray<MemberDay>;
  tripStartsAt: string | null;
  tripEndsAt: string | null;
  /** IANA trip timezone — leg instants reduce to trip-local dates. */
  timezone: string;
}): LegDaySuggestions | null {
  const { leg, memberDays, tripStartsAt, tripEndsAt, timezone } = args;

  if (!tripStartsAt || !tripEndsAt || tripStartsAt > tripEndsAt) {
    return null;
  }

  const instant = leg.direction === "inbound" ? leg.arrive_at : leg.depart_at;
  if (!instant) {
    return null;
  }
  const legDayIso = isoToDbDate(instant, timezone);
  if (!legDayIso) {
    return null;
  }

  const statusByDate = new Map(memberDays.map((d) => [d.date, d.status]));

  if (leg.direction === "inbound") {
    if (legDayIso > tripEndsAt) {
      return null;
    }
    // A pre-trip landing still implies presence from day one.
    const start = legDayIso < tripStartsAt ? tripStartsAt : legDayIso;
    const goingDates = memberDays
      .filter((d) => d.status === "going")
      .map((d) => d.date);
    const lastGoing =
      goingDates.length > 0
        ? goingDates.reduce((a, b) => (a > b ? a : b))
        : null;
    // Chips already extend past the landing → fill only up to them;
    // nothing marked after D → assume through trip end. Last going day
    // before D = contradiction (#526's territory), not a suggestion.
    if (lastGoing !== null && lastGoing < start) {
      return null;
    }
    const end = lastGoing ?? tripEndsAt;
    const days = tripDays(start, end)
      .filter((date) => statusByDate.get(date) !== "going")
      .map((date) => ({ date, status: "going" as const }));
    return days.length > 0 ? { kind: "inbound", legDayIso, days } : null;
  }

  // Outbound: clear going days strictly after the departure day.
  if (legDayIso >= tripEndsAt) {
    return null;
  }
  const days = tripDays(tripStartsAt, tripEndsAt)
    .filter((date) => date > legDayIso && statusByDate.get(date) === "going")
    .map((date) => ({ date, status: "declined" as const }));
  return days.length > 0 ? { kind: "outbound", legDayIso, days } : null;
}
