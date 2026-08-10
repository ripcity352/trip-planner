"use client";

/**
 * DayChipButton — the shared presentational day chip used by both the
 * member's own /me editor (DayAttendanceChips) and the organizer
 * write-on-behalf editor (#550, OrganizerMemberDaysPanel). Pure display +
 * one click handler; all optimistic state lives in the parent.
 *
 * Extracted so the two editors render byte-identical chips (label register,
 * hit-slop, pressed styling) from one place — the visual contract lives
 * here, not duplicated per surface.
 */

import * as React from "react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { parseDateOnly } from "@/lib/utils/date-only";

/** Day-header register (#211): lowercase `eee d` — "fri 14". */
function dayLabel(date: string): string {
  return format(parseDateOnly(date), "eee d").toLowerCase();
}

export interface DayChipButtonProps {
  /** ISO date — `YYYY-MM-DD`. */
  date: string;
  /** Pressed = the member is marked in ('going') for this day. */
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  /**
   * #550 — render a small marker dot when this day was set by an organizer
   * on the member's behalf (provenance cue on /me). `markerAriaLabel` is
   * appended to the button's accessible name so it isn't marker-blind.
   */
  marked?: boolean;
  markerAriaLabel?: string;
}

export function DayChipButton({
  date,
  pressed,
  disabled = false,
  onClick,
  marked = false,
  markerAriaLabel,
}: DayChipButtonProps) {
  const label = dayLabel(date);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={marked && markerAriaLabel ? `${label}, ${markerAriaLabel}` : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // Hit-slop (#F4): 36px visual → 44px effective, y-only — x-slop
        // would overlap the neighbor chip in the gap-2 row. Label rides in
        // the mono day-header register.
        "focus-visible:ring-ring relative inline-flex h-9 items-center rounded-full border px-3 font-mono text-xs font-medium transition-colors after:absolute after:-inset-y-1 after:content-[''] focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        pressed
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      {label}
      {marked ? (
        // Provenance dot — a hairline ring token, not a notification badge
        // (CLAUDE.md hard-ban). Purely decorative; the label carries the
        // accessible text.
        <span
          aria-hidden
          className={cn(
            "ml-1.5 inline-block h-1.5 w-1.5 rounded-full",
            pressed ? "bg-primary-foreground/70" : "bg-foreground/40"
          )}
        />
      ) : null}
    </button>
  );
}
