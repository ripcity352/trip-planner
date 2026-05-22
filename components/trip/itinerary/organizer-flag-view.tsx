"use client";

/**
 * OrganizerFlagView — organizer-only display of member flags for an item.
 *
 * Reads flags via getFlagsForItem (lib/db/itinerary-item-member-flags.ts).
 * This is a presentational component: the caller supplies the flags array
 * (fetched server-side) and a memberNames map.
 *
 * Per CLAUDE.md rule #11 (roles as micro-affordances not gates):
 * This is an organizer-visible panel, NOT a gate for members. Members
 * see only their own flags via the W0b Delta 1 self-read SELECT policy.
 *
 * Voice CRITICAL C8: NO "organizers notified" phrasing.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { resolveMemberName } from "@/lib/utils/member-display";
import type { ItineraryItemMemberFlag } from "@/lib/db/types";

export interface OrganizerFlagViewProps {
  flags: ItineraryItemMemberFlag[];
  /** Map of trip_member_id → display name. Falls back to ID if missing. */
  memberNames: Record<string, string>;
  className?: string;
}

export function OrganizerFlagView({
  flags,
  memberNames,
  className,
}: OrganizerFlagViewProps) {
  if (flags.length === 0) {
    return (
      <p className={cn("text-muted-foreground text-xs", className)}>
        {M3_UI_STRINGS.itinerary_item_flag_empty_organizer}
      </p>
    );
  }

  // Group flags by trip_member_id
  const grouped = flags.reduce<Record<string, ItineraryItemMemberFlag[]>>(
    (acc, flag) => {
      const existing = acc[flag.trip_member_id];
      return {
        ...acc,
        [flag.trip_member_id]: existing
          ? [...existing, flag]
          : [flag],
      };
    },
    {}
  );

  // Adapter: wrap the Record<string, string> in a ReadonlyMap so
  // resolveMemberName can be used consistently across all member-display
  // sites. The Record values are pre-resolved caller-supplied strings;
  // wrapping as { display_name } lets resolveMemberName apply the "Guest"
  // fallback when a key is missing. Prop type kept as Record<string,string>
  // to avoid cascading caller changes (W1a decision).
  const memberMap: ReadonlyMap<string, { display_name: string | null }> =
    new Map(
      Object.entries(memberNames).map(([id, name]) => [
        id,
        { display_name: name },
      ]),
    );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {Object.entries(grouped).map(([memberId, memberFlags]) => {
        const displayName = resolveMemberName(memberMap, memberId);
        return (
          <div key={memberId} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold">{displayName}</p>
            <div className="flex flex-wrap gap-1.5">
              {memberFlags.map((f) => (
                <div key={f.id} className="flex flex-col">
                  <span
                    className={cn(
                      "rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs",
                      "text-muted-foreground"
                    )}
                  >
                    {f.flag}
                  </span>
                  {f.note ? (
                    <span className="text-muted-foreground mt-0.5 pl-1 text-xs italic">
                      {f.note}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
