/**
 * TravelLegRow — the compact, read-only arrivals row (#579).
 *
 * One scannable line per leg in the Compact view of the arrivals manifest:
 *
 *     9:50 pm · Rob (PDX)
 *
 * - Time (mono, absolute-time tier via `formatTripTime` — lowercase am/pm)
 *   leads; it's the scan axis and the sort key. Inbound rows show
 *   `arrive_at`, outbound rows show `depart_at`. A leg with no relevant
 *   instant (the "Landing time TBD" bucket) renders without a time.
 * - Owner name is the only shrinkable element (`min-w-0 truncate`); the
 *   time and the airport code are fixed so the coordination fact (which
 *   airport) never truncates.
 * - Airport code renders in mono, in parens — it's a code, like the time.
 *
 * Read-only by design. Flight number, origin, notes, and the owner-only
 * confirmation code (PNR, #505) are NOT rendered here — to act on a leg or
 * see its detail, the user flips to the Full view (`TravelLegCard`). Keeping
 * PNR out of this component entirely means there is no redaction surface to
 * get wrong in the compact path.
 *
 * Server Component — no state, no effects.
 */

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { formatTripTime } from "@/lib/utils/format-trip-tz";
import type { TravelLeg } from "@/lib/db/types";

export interface TravelLegRowProps {
  leg: TravelLeg;
  /** Display name of the member who owns this leg (via resolveMemberName). */
  ownerName: string;
  /** IANA timezone string for the trip; times render in trip-local time. */
  tripTimezone: string;
}

export function TravelLegRow({ leg, ownerName, tripTimezone }: TravelLegRowProps) {
  // Inbound is a landing (arrive_at); outbound is a departure (depart_at).
  const instant = leg.direction === "outbound" ? leg.depart_at : leg.arrive_at;
  const timeLabel = instant ? formatTripTime(instant, tripTimezone) : null;
  const airport = leg.airport?.trim() || null;

  return (
    <li className="flex items-baseline gap-1.5 py-1.5 text-sm">
      {timeLabel ? (
        <>
          <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
            {timeLabel}
          </span>
          <span aria-hidden className="text-muted-foreground shrink-0">
            {M3_UI_STRINGS.arrivals_compact_separator}
          </span>
        </>
      ) : null}
      <span className="min-w-0 truncate">{ownerName}</span>
      {airport ? (
        <span className="text-muted-foreground shrink-0 font-mono">
          ({airport})
        </span>
      ) : null}
    </li>
  );
}
