/**
 * RideGroupRow — the compact, read-only ride line (#581).
 *
 * One scannable line per ride in the Compact view:
 *
 *     ride · PDX · You, Rob +2
 *
 * - A literal `ride` token in the mono register (NEVER an emoji/car glyph —
 *   a glyph clashes with the compact mono/hairline language, a vibecoded
 *   anti-tell). Then the airport (mono), then the riders.
 * - Riders lead with the viewer ("You") and cap at two names + a `+N`
 *   overflow; the name list is the disambiguator when two rides share an
 *   airport, so it truncates rather than the airport.
 * - Read-only: every ride action lives on the Full-view RideGroupCard.
 *
 * Server Component — no state, no effects.
 */

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { resolveMemberName } from "@/lib/utils/member-display";
import type { RideGroupWithRiders, TripMember } from "@/lib/db/types";

const MAX_NAMES = 2;

export interface RideGroupRowProps {
  ride: RideGroupWithRiders;
  myTripMemberId: string;
  memberNameMap: Map<string, TripMember>;
}

export function RideGroupRow({
  ride,
  myTripMemberId,
  memberNameMap,
}: RideGroupRowProps) {
  const airport = ride.airport?.trim() || null;

  // Viewer first ("You" — so you find your own ride at a glance and never get
  // pushed past the +N cap), then everyone else in DB (created_at) order.
  const ordered = [
    ...ride.riders.filter((r) => r.trip_member_id === myTripMemberId),
    ...ride.riders.filter((r) => r.trip_member_id !== myTripMemberId),
  ];
  const names = ordered.map((r) =>
    r.trip_member_id === myTripMemberId
      ? M3_UI_STRINGS.rideGroup_self_label
      : resolveMemberName(memberNameMap, r.trip_member_id)
  );
  const shown = names.slice(0, MAX_NAMES).join(", ");
  const overflow = names.length - MAX_NAMES;
  const riderLabel = overflow > 0 ? `${shown} +${overflow}` : shown;

  const sep = M3_UI_STRINGS.arrivals_compact_separator;

  return (
    <li className="flex items-baseline gap-1.5 py-1.5 text-sm">
      <span className="text-muted-foreground shrink-0 font-mono">
        {M3_UI_STRINGS.rideGroup_compact_token}
      </span>
      {airport ? (
        <>
          <span aria-hidden className="text-muted-foreground shrink-0">
            {sep}
          </span>
          <span className="text-muted-foreground shrink-0 font-mono">
            {airport}
          </span>
        </>
      ) : null}
      <span aria-hidden className="text-muted-foreground shrink-0">
        {sep}
      </span>
      <span className="min-w-0 truncate">{riderLabel}</span>
    </li>
  );
}
