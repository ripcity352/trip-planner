"use client";

/**
 * PollsDisclosure — #470 compact-top relayout, amended design.
 *
 * The generic decision-poll surface (`PollsSection`, #390) stays on the
 * announcements page — it has no other home — but no longer renders its
 * full card stack at the top of the feed. It sits behind a one-line
 * collapsed disclosure row (same idiom as the composer trigger /
 * `MemberFlagPicker` #399: `aria-expanded` + `aria-controls` +
 * conditional render, chevron rotate gated by `motion-reduce`).
 *
 * Row label (copy centrally sourced, reusing the dashboard's
 * open-poll glance strings so the two surfaces can't drift):
 *   - ≥1 open poll → "1 question up for a vote" / "{n} questions up
 *     for a vote"
 *   - 0 open polls + organizer → "Put it to the crew" (the poll
 *     composer's own CTA register) so poll *creation* keeps a surface
 *   - 0 open polls + non-organizer → the row hides entirely
 *
 * "Open" mirrors `isPollClosed` (#211 date-only register): no deadline,
 * or today ≤ closes_on. The count is computed from the server-fetched
 * `initialViews` — a static label, deliberately not realtime (the
 * expanded PollsSection stays fully live via PulsePoll).
 */

import * as React from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { isPollClosed } from "@/lib/db/polls";
import {
  DASHBOARD_GLANCE_STRINGS,
  M5_UI_STRINGS,
} from "@/lib/copy/empty-states";
import type { PollView } from "@/lib/db/types";

import { PollsSection } from "./polls-section";

interface PollsDisclosureProps {
  tripId: string;
  isOrganizer: boolean;
  /** The viewer's trip_members.id — undefined renders read-only polls. */
  viewerTripMemberId: string | undefined;
  initialViews: ReadonlyArray<PollView>;
}

export function PollsDisclosure({
  tripId,
  isOrganizer,
  viewerTripMemberId,
  initialViews,
}: PollsDisclosureProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  // Date-only register (#211) — same "today" derivation as PollCard.
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const openCount = initialViews.filter(
    (v) => !isPollClosed(v.poll.closes_on, todayIso)
  ).length;

  // No open polls and nothing to compose → no row at all. Organizers
  // keep the row (poll creation has no other surface — rule 11: the
  // affordance shows for those who can use it, no gate for the rest).
  if (openCount === 0 && !isOrganizer) return null;

  const label =
    openCount === 0
      ? M5_UI_STRINGS.polls_composer_cta
      : openCount === 1
        ? DASHBOARD_GLANCE_STRINGS.glance_polls_open_one
        : DASHBOARD_GLANCE_STRINGS.glance_polls_open_other_template.replace(
            "{count}",
            String(openCount)
          );

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-3 text-left text-sm",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        <span data-testid="polls-disclosure-label" className="min-w-0 truncate">
          {label}
        </span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div id={panelId}>
          <PollsSection
            tripId={tripId}
            isOrganizer={isOrganizer}
            viewerTripMemberId={viewerTripMemberId}
            initialViews={initialViews}
          />
        </div>
      ) : null}
    </div>
  );
}
