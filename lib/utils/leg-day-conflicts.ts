/**
 * deriveLegDayConflicts (#526) — reverse direction of the #525
 * leg↔chip reflection: when the member's day chips contradict their
 * own saved travel legs, surface a quiet cue.
 *
 * **Chips win — the chip is the exception.** This helper derives; it
 * never writes, never prompts, and there is no stored nag state. The
 * cue renders only to the member about their OWN legs (no calling
 * people out).
 *
 * Hard contradictions only (trip-local dates via `isoToDbDate`, same
 * TZ reduction as leg-day-note / leg-day-suggestions):
 *
 *   - inbound leg lands on a day the member hasn't marked 'going'
 *   - outbound leg departs on a day the member hasn't marked 'going'
 *     (you're around the day you leave — #525's model keeps the
 *     departure day)
 *   - days AFTER an outbound departure still marked 'going'
 *
 * Soft mismatches (maybe vs going, gaps the member never marked when
 * no leg touches them) are not conflicts. Leg days outside the trip
 * range are skipped — there are no chips to contradict.
 */

import { format } from "date-fns";

import { LEG_DAY_CONFLICT_UI_STRINGS } from "@/lib/copy/empty-states";
import { parseDateOnly } from "@/lib/utils/date-only";
import { isoToDbDate } from "@/lib/utils/format-trip-tz";
import type { MemberDay } from "@/lib/db/trip-member-days";
import type { TravelLeg } from "@/lib/db/types";

export type LegForConflict = Pick<
  TravelLeg,
  "direction" | "arrive_at" | "depart_at"
>;

export type LegDayConflict =
  | { kind: "lands_not_around"; date: string }
  | { kind: "leaves_not_around"; date: string }
  | {
      kind: "around_after_leaving";
      /** Trip-local departure day. */
      departDate: string;
      /** Going days after the departure, ascending. */
      dates: string[];
    };

export function deriveLegDayConflicts(args: {
  /** The member's OWN legs only — never render this for peers. */
  legs: ReadonlyArray<LegForConflict>;
  memberDays: ReadonlyArray<MemberDay>;
  tripStartsAt: string | null;
  tripEndsAt: string | null;
  timezone: string;
}): LegDayConflict[] {
  const { legs, memberDays, tripStartsAt, tripEndsAt, timezone } = args;

  if (!tripStartsAt || !tripEndsAt || tripStartsAt > tripEndsAt) {
    return [];
  }

  const statusByDate = new Map(memberDays.map((d) => [d.date, d.status]));
  const inRange = (date: string): boolean =>
    date >= tripStartsAt && date <= tripEndsAt;
  const isGoing = (date: string): boolean =>
    statusByDate.get(date) === "going";

  return legs.flatMap<LegDayConflict>((leg) => {
    if (leg.direction === "inbound") {
      if (!leg.arrive_at) return [];
      const date = isoToDbDate(leg.arrive_at, timezone);
      if (!date || !inRange(date) || isGoing(date)) return [];
      return [{ kind: "lands_not_around", date }];
    }

    // Outbound.
    if (!leg.depart_at) return [];
    const departDate = isoToDbDate(leg.depart_at, timezone);
    if (!departDate) return [];

    const conflicts: LegDayConflict[] = [];
    if (inRange(departDate) && !isGoing(departDate)) {
      conflicts.push({ kind: "leaves_not_around", date: departDate });
    }
    const after = memberDays
      .filter((d) => d.status === "going" && d.date > departDate)
      .map((d) => d.date)
      .sort();
    if (after.length > 0) {
      conflicts.push({ kind: "around_after_leaving", departDate, dates: after });
    }
    return conflicts;
  });
}

/**
 * One cue line per conflict — shared by the /me chips card and the
 * member's own leg card so the two surfaces never phrase it
 * differently. Day-header register (#211): lowercase "fri 14".
 */
export function legDayConflictLine(conflict: LegDayConflict): string {
  const dayLabel = (iso: string): string =>
    format(parseDateOnly(iso), "eee d").toLowerCase();

  switch (conflict.kind) {
    case "lands_not_around":
      return LEG_DAY_CONFLICT_UI_STRINGS.legDayConflict_lands_template.replace(
        "{day}",
        dayLabel(conflict.date)
      );
    case "leaves_not_around":
      return LEG_DAY_CONFLICT_UI_STRINGS.legDayConflict_leaves_template.replace(
        "{day}",
        dayLabel(conflict.date)
      );
    case "around_after_leaving":
      return LEG_DAY_CONFLICT_UI_STRINGS.legDayConflict_after_template.replace(
        "{day}",
        dayLabel(conflict.departDate)
      );
  }
}
