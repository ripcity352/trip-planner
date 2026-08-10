"use client";

/**
 * OrganizerMemberDaysPanel (#550) — the organizer-side surface for setting
 * a member's day-availability chips on their behalf (the "Rob texted me his
 * dates, let me set them" case). The row is attributed to the organizer
 * (`written_by_trip_member_id`), and the member keeps/removes it on their
 * own `/me` page — recording, not assuming (persona-edge-attendees).
 *
 * Organizer-only surface: the roster renders this only for organizers, and
 * `setMemberDayForAction` re-checks `is_trip_organizer` server-side AND in
 * RLS (rule #11 — the gate is server-side; the UI just never offers the
 * affordance to non-organizers). Targets exclude the organizer themselves
 * (self uses the normal /me chips) and trip-level decliners (#475).
 *
 * Deliberately NOT on the read-only DayHeadcount block — that stays
 * read-only for everyone. This is a separate, collapsible editor.
 */

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { MEMBER_DAYS_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { setMemberDayForAction } from "@/lib/actions/trip-member-days";
import { DayChipButton } from "@/components/trip/member-days/day-chip-button";
import type { TripMemberDayStatus } from "@/lib/db/types";

/** One day cell for a target member — stored status, null if unset. */
export interface OrganizerDayCell {
  /** ISO date — `YYYY-MM-DD`. */
  date: string;
  status: TripMemberDayStatus | null;
}

/** A member an organizer may set days for, with their current day cells. */
export interface OrganizerDayTarget {
  /** trip_member_id of the target. */
  id: string;
  name: string;
  /** One cell per trip date, in order (server-composed). */
  days: ReadonlyArray<OrganizerDayCell>;
}

export interface OrganizerMemberDaysPanelProps {
  tripId: string;
  targets: ReadonlyArray<OrganizerDayTarget>;
}

export function OrganizerMemberDaysPanel({
  tripId,
  targets,
}: OrganizerMemberDaysPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState("");

  const selected = React.useMemo(
    () => targets.find((t) => t.id === targetId) ?? null,
    [targets, targetId]
  );

  const panelId = `member-days-onbehalf-${tripId}`;

  if (targets.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          // Foreground (not muted): this is the organizer's write entry point
          // for the read-only "Who's around when" block right above it, so it
          // should read as an actionable control, not secondary chrome (#550
          // discoverability fix — the muted greyed label was being missed).
          "text-foreground flex items-center gap-1.5 self-start text-sm font-medium",
          "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {MEMBER_DAYS_UI_STRINGS.memberDays_onbehalf_trigger}
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-3">
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            aria-label={MEMBER_DAYS_UI_STRINGS.memberDays_onbehalf_pick_person}
            className={cn(
              "border-border bg-background self-start rounded-xs border px-3 py-1.5 text-sm",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            )}
          >
            <option value="">
              {MEMBER_DAYS_UI_STRINGS.memberDays_onbehalf_pick_person}
            </option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {selected ? (
            // Keyed on the target id so switching members resets the
            // optimistic state cleanly.
            <OrganizerTargetDayChips
              key={selected.id}
              tripId={tripId}
              target={selected}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Editable day chips for ONE target member. Same optimistic-with-rollback
 * pattern as the member's own DayAttendanceChips, but every write goes
 * through `setMemberDayForAction` (organizer on-behalf, attributed).
 */
function OrganizerTargetDayChips({
  tripId,
  target,
}: {
  tripId: string;
  target: OrganizerDayTarget;
}) {
  const [statuses, setStatuses] = React.useState<
    Readonly<Record<string, TripMemberDayStatus | null>>
  >(() => Object.fromEntries(target.days.map((d) => [d.date, d.status])));
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleTap = React.useCallback(
    (date: string) => {
      const current = statuses[date] ?? null;
      const next: "going" | "declined" =
        current === "going" ? "declined" : "going";

      setStatuses((prev) => ({ ...prev, [date]: next }));
      setErrorKey(null);

      const idempotencyKey = crypto.randomUUID();

      startTransition(async () => {
        try {
          const result = await setMemberDayForAction(
            { tripId, targetTripMemberId: target.id, date, status: next },
            idempotencyKey
          );

          if (!result.ok) {
            setStatuses((prev) => ({ ...prev, [date]: current }));
            setErrorKey(result.errorKey);
            return;
          }

          setStatuses((prev) => ({ ...prev, [date]: result.status }));
        } catch (err) {
          console.error(
            "[organizer-member-days] setMemberDayForAction threw:",
            err
          );
          setStatuses((prev) => ({ ...prev, [date]: current }));
          setErrorKey("network");
        }
      });
    },
    [statuses, tripId, target.id]
  );

  const heading =
    MEMBER_DAYS_UI_STRINGS.memberDays_onbehalf_heading_template.replace(
      "{name}",
      target.name
    );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm font-medium">{heading}</p>
      <div
        role="group"
        aria-label={heading}
        className="flex flex-wrap items-center gap-2"
      >
        {target.days.map((day) => (
          <DayChipButton
            key={day.date}
            date={day.date}
            pressed={statuses[day.date] === "going"}
            disabled={isPending}
            onClick={() => handleTap(day.date)}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {MEMBER_DAYS_UI_STRINGS.memberDays_onbehalf_hint}
      </p>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
