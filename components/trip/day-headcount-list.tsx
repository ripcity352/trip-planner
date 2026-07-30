"use client";

/**
 * DayHeadcountList (#524) — the interactive half of the roster
 * "Who's around when" block. One tappable token per trip day
 * ("fri 4"); tapping expands the names around that day, with everyone
 * else greyed below them. Names carry that day's travel-leg time when
 * one exists ("Carl — lands 10:30 am").
 *
 * Presentation-only: the server component (day-headcount.tsx) composes
 * the per-day view model; this component just holds the open/closed
 * state. One panel open at a time — it's a glance surface, not a table.
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { MEMBER_DAYS_UI_STRINGS } from "@/lib/copy/empty-states";

export interface DayPresenceMember {
  id: string;
  name: string;
  /** true = this member's day status is 'going'. */
  around: boolean;
  /** Pre-formatted leg annotation, e.g. "lands 10:30 am" — or null. */
  legNote: string | null;
}

export interface DayPresence {
  /** ISO date — `YYYY-MM-DD`. */
  iso: string;
  /** Day-header register (#211): lowercase weekday, e.g. "fri". */
  weekday: string;
  count: number;
  members: ReadonlyArray<DayPresenceMember>;
}

export function DayHeadcountList({
  days,
}: {
  days: ReadonlyArray<DayPresence>;
}) {
  const [openIso, setOpenIso] = React.useState<string | null>(null);

  const open = days.find((d) => d.iso === openIso) ?? null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {days.map((d) => {
          const isOpen = d.iso === openIso;
          return (
            <button
              key={d.iso}
              type="button"
              aria-expanded={isOpen}
              aria-controls={isOpen ? "whos-around-panel" : undefined}
              // Announces the count the visible "fri 4" token carries —
              // aria-expanded already signals the toggle affordance.
              aria-label={MEMBER_DAYS_UI_STRINGS.memberDays_headcount_day_aria_template
                .replace("{count}", String(d.count))
                .replace("{day}", d.weekday)}
              onClick={() => setOpenIso(isOpen ? null : d.iso)}
              className={cn(
                "focus-visible:ring-ring relative inline-flex h-9 items-center rounded-xs border px-3 font-mono text-sm transition-colors after:absolute after:-inset-y-1 after:content-[''] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                isOpen
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-foreground hover:bg-muted/80"
              )}
            >
              {d.weekday} {d.count}
            </button>
          );
        })}
      </div>
      {open ? (
        <ul id="whos-around-panel" className="flex flex-col gap-1 pt-1">
          {open.members.map((m) => (
            <li
              key={m.id}
              className={cn(
                "text-sm",
                m.around ? "text-foreground" : "text-muted-foreground/60"
              )}
            >
              {m.name}
              {m.legNote ? (
                <span className="text-muted-foreground"> — {m.legNote}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
