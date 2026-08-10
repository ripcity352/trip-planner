"use client";

/**
 * DayAttendanceChips (#388) — the /me "Which days are you around?" row.
 * One chip per trip date; tap toggles the caller in ('going') or out
 * ('declined'), save-on-tap.
 *
 * Rule-8 framing: a chip reads pressed ONLY when the stored status is
 * 'going'. Unseeded (null — rsvp maybe/pending members the trigger never
 * seeded) and 'maybe'/'declined' all render un-pressed; the member opts
 * INTO the days they're actually there. The trigger's seeded
 * all-days-'going' default is just a starting state — every chip is
 * correctable.
 *
 * Optimistic local state with rollback — same pattern as rsvp-toggle:
 *   1. Tap → flip local state immediately
 *   2. Fresh crypto.randomUUID() idempotency key (rule 9)
 *   3. Call setMemberDayAction
 *   4. On error → roll back + inline `<p role="alert">` (no toast infra)
 *
 * Peer privacy: this component only ever renders the caller's own rows;
 * per-day counts for organizers are aggregate-only (day-headcount.tsx).
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { MEMBER_DAYS_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { setMemberDayAction } from "@/lib/actions/trip-member-days";
import { DayChipButton } from "@/components/trip/member-days/day-chip-button";
import type { TripMemberDayStatus } from "@/lib/db/types";

export interface DayChip {
  /** ISO date — `YYYY-MM-DD`. */
  date: string;
  /** Stored status, or null when the trigger never seeded this member. */
  status: TripMemberDayStatus | null;
  /**
   * #550 — true when an organizer set this day on the member's behalf. Marks
   * the chip with a provenance dot + surfaces the cue line. The member's own
   * tap clears the attribution (setMemberDayAction writes written_by NULL),
   * so the marker disappears on any change.
   */
  writtenByOther?: boolean;
}

export interface DayAttendanceChipsProps {
  tripId: string;
  /** One entry per trip date, in order (server-composed on /me). */
  days: ReadonlyArray<DayChip>;
}

type StatusMap = Readonly<Record<string, TripMemberDayStatus | null>>;

function toStatusMap(days: ReadonlyArray<DayChip>): StatusMap {
  return days.reduce<Record<string, TripMemberDayStatus | null>>(
    (acc, d) => ({ ...acc, [d.date]: d.status }),
    {}
  );
}

export function DayAttendanceChips({ tripId, days }: DayAttendanceChipsProps) {
  // Optimistic view of each day's status. Unlike rsvp-toggle there is
  // no `confirmed` twin: a toggle always flips (no same-state
  // short-circuit to guard), so a rolled-back tap is retry-able by
  // construction.
  const [statuses, setStatuses] = React.useState<StatusMap>(() =>
    toStatusMap(days)
  );
  // #550 — dates an organizer set on this member's behalf. A member tap
  // clears the row's attribution (setMemberDayAction writes written_by
  // NULL), so drop the date from the marked set optimistically on tap.
  const [markedDates, setMarkedDates] = React.useState<ReadonlySet<string>>(
    () => new Set(days.filter((d) => d.writtenByOther).map((d) => d.date))
  );
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleTap = React.useCallback(
    (date: string) => {
      const current = statuses[date] ?? null;
      // Opt-in toggle: un-pressed (null / maybe / declined) → going;
      // pressed (going) → declined.
      const next: "going" | "declined" =
        current === "going" ? "declined" : "going";

      const wasMarked = markedDates.has(date);
      const restoreMarker = () => {
        if (!wasMarked) return;
        setMarkedDates((prev) => {
          if (prev.has(date)) return prev;
          const nextSet = new Set(prev);
          nextSet.add(date);
          return nextSet;
        });
      };

      setStatuses((prev) => ({ ...prev, [date]: next }));
      setMarkedDates((prev) => {
        if (!prev.has(date)) return prev;
        const nextSet = new Set(prev);
        nextSet.delete(date);
        return nextSet;
      });
      setErrorKey(null);

      const idempotencyKey = crypto.randomUUID();

      startTransition(async () => {
        try {
          const result = await setMemberDayAction(
            { tripId, date, status: next },
            idempotencyKey
          );

          if (!result.ok) {
            // Roll back to the pre-tap value + marker.
            setStatuses((prev) => ({ ...prev, [date]: current }));
            restoreMarker();
            setErrorKey(result.errorKey);
            return;
          }

          // Server is authoritative (idempotency replay may echo a
          // different stored value than the optimistic guess).
          setStatuses((prev) => ({ ...prev, [date]: result.status }));
        } catch (err) {
          // Action contract is "never throws" — but the network
          // boundary still needs a rollback path.
          console.error("[day-attendance] setMemberDayAction threw:", err);
          setStatuses((prev) => ({ ...prev, [date]: current }));
          restoreMarker();
          setErrorKey("network");
        }
      });
    },
    [statuses, markedDates, tripId]
  );

  const hasMarked = markedDates.size > 0;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={MEMBER_DAYS_UI_STRINGS.memberDays_group_aria}
        className="flex flex-wrap items-center gap-2"
      >
        {days.map((day) => (
          <DayChipButton
            key={day.date}
            date={day.date}
            pressed={statuses[day.date] === "going"}
            disabled={isPending}
            onClick={() => handleTap(day.date)}
            marked={markedDates.has(day.date)}
            markerAriaLabel={
              MEMBER_DAYS_UI_STRINGS.memberDays_organizer_set_marker_aria
            }
          />
        ))}
      </div>
      {/* #550 — provenance cue when an organizer set some of these days.
          Muted fact, not a nag; disappears as the member re-taps. */}
      {hasMarked ? (
        <p className="text-muted-foreground text-sm">
          {MEMBER_DAYS_UI_STRINGS.memberDays_organizer_set_cue}
        </p>
      ) : null}
      {errorKey ? (
        <p
          role="alert"
          // #209 error-surface contract: calm ink, never a red flood.
          className={cn(ERROR_LINE_CLASS, "text-sm")}
        >
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
