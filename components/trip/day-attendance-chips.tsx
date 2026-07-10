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
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { MEMBER_DAYS_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { parseDateOnly } from "@/lib/utils/date-only";
import { setMemberDayAction } from "@/lib/actions/trip-member-days";
import type { TripMemberDayStatus } from "@/lib/db/types";

export interface DayChip {
  /** ISO date — `YYYY-MM-DD`. */
  date: string;
  /** Stored status, or null when the trigger never seeded this member. */
  status: TripMemberDayStatus | null;
}

export interface DayAttendanceChipsProps {
  tripId: string;
  /** One entry per trip date, in order (server-composed on /me). */
  days: ReadonlyArray<DayChip>;
}

/** Day-header register (#211): lowercase `eee d` — "fri 14". */
function dayLabel(date: string): string {
  return format(parseDateOnly(date), "eee d").toLowerCase();
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
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleTap = React.useCallback(
    (date: string) => {
      const current = statuses[date] ?? null;
      // Opt-in toggle: un-pressed (null / maybe / declined) → going;
      // pressed (going) → declined.
      const next: "going" | "declined" =
        current === "going" ? "declined" : "going";

      setStatuses((prev) => ({ ...prev, [date]: next }));
      setErrorKey(null);

      const idempotencyKey = crypto.randomUUID();

      startTransition(async () => {
        try {
          const result = await setMemberDayAction(
            { tripId, date, status: next },
            idempotencyKey
          );

          if (!result.ok) {
            // Roll back to the pre-tap value; `confirmed` untouched.
            setStatuses((prev) => ({ ...prev, [date]: current }));
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
          setErrorKey("network");
        }
      });
    },
    [statuses, tripId]
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={MEMBER_DAYS_UI_STRINGS.memberDays_group_aria}
        className="flex flex-wrap items-center gap-2"
      >
        {days.map((day) => {
          const isIn = statuses[day.date] === "going";
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={isIn}
              disabled={isPending}
              onClick={() => handleTap(day.date)}
              className={cn(
                // Hit-slop (#F4): 36px visual → 44px effective, y-only —
                // x-slop would overlap the neighbor chip in the gap-2 row
                // (same trade as rsvp-toggle). Label is the day-header
                // register, so it rides in mono caption.
                "focus-visible:ring-ring relative inline-flex h-9 items-center rounded-full border px-3 font-mono text-xs font-medium transition-colors after:absolute after:-inset-y-1 after:content-[''] focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                isIn
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {dayLabel(day.date)}
            </button>
          );
        })}
      </div>
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
