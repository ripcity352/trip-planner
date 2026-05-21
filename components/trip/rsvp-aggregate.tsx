/**
 * RsvpAggregate — glanceable count display for trip RSVP state (#45).
 *
 * Renders one row per RSVP bucket (going / maybe / no-response, and
 * optionally declined for organizers). Each row pairs the same lucide
 * icon vocabulary as RsvpChip with the count integer and an aria-label
 * so color is never the only signal.
 *
 * Layout: inline icon + bold count + muted label, stacked vertically in
 * a compact flex column — legible at 375px without wrapping.
 *
 * `declinedCount` is organizer-only per the declining-whispers ADR; the
 * prop is optional and the row is omitted when absent.
 */

import { Check, HelpCircle, MinusCircle, X } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";

export interface RsvpCounts {
  going: number;
  maybe: number;
  /** Invited-but-not-responded count, shown as "no answer yet". */
  invited: number;
}

export interface RsvpAggregateProps {
  counts: RsvpCounts;
  /**
   * Organizer-only. When provided, renders the declined bucket row.
   * Omit (undefined) for non-organizer views.
   */
  declinedCount?: number;
  className?: string;
}

interface BucketDef {
  count: number;
  ariaLabel: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClass: string;
}

export function RsvpAggregate({
  counts,
  declinedCount,
  className,
}: RsvpAggregateProps) {
  const buckets: BucketDef[] = [
    {
      count: counts.going,
      ariaLabel: M4_UI_STRINGS.rsvp_aggregate_aria_going,
      Icon: Check,
      iconClass: "text-green-600 dark:text-green-400",
    },
    {
      count: counts.maybe,
      ariaLabel: M4_UI_STRINGS.rsvp_aggregate_aria_maybe,
      Icon: HelpCircle,
      iconClass: "text-amber-500 dark:text-amber-400",
    },
    {
      count: counts.invited,
      ariaLabel: M4_UI_STRINGS.rsvp_aggregate_aria_no_response,
      Icon: MinusCircle,
      iconClass: "text-muted-foreground",
    },
  ];

  // Organizer-only: append declined row only when the prop is present.
  if (declinedCount !== undefined) {
    buckets.push({
      count: declinedCount,
      ariaLabel: M4_UI_STRINGS.rsvp_aggregate_aria_declined,
      Icon: X,
      iconClass: "text-red-500 dark:text-red-400",
    });
  }

  return (
    <div
      className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}
    >
      {buckets.map(({ count, ariaLabel, Icon, iconClass }) => (
        <span
          key={ariaLabel}
          aria-label={`${count} ${ariaLabel}`}
          className="inline-flex items-center gap-1.5 text-sm"
        >
          {/* aria-hidden — the aria-label on the parent carries the meaning */}
          <Icon
            className={cn("h-3.5 w-3.5 shrink-0", iconClass)}
            aria-hidden={true}
          />
          <span className="font-semibold tabular-nums">{count}</span>
          <span className="text-muted-foreground">{ariaLabel}</span>
        </span>
      ))}
    </div>
  );
}
