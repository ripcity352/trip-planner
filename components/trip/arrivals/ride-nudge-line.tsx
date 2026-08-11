"use client";

/**
 * RideNudgeLine (#581) — the quiet, actionable ride-share nudge: one line per
 * uncovered cluster ("3 of you land at PDX within an hour — split a ride?")
 * with a "start a ride" CTA that seeds the create sheet. Direction picks the
 * phrasing (inbound "land at" vs outbound "fly out of"). Shared by both the
 * inbound and outbound sections of the arrivals manifest.
 */

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { RideShareCluster } from "@/lib/utils/ride-share";
import type { TravelLegDirection } from "@/lib/db/types";

const START_CTA_CLASS =
  "text-muted-foreground hover:text-foreground self-start text-xs font-medium focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

export interface RideNudgeLineProps {
  cluster: RideShareCluster;
  direction: TravelLegDirection;
  /** Open the "start a ride" sheet seeded with this cluster. */
  onStart: (airport: string, memberIds: string[]) => void;
}

export function RideNudgeLine({ cluster, direction, onStart }: RideNudgeLineProps) {
  const template =
    direction === "outbound"
      ? M3_UI_STRINGS.arrivals_ride_share_template_outbound
      : M3_UI_STRINGS.arrivals_ride_share_template;

  return (
    <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <span>
        {template
          .replace("{count}", String(cluster.count))
          .replace("{airport}", cluster.airport)}
      </span>
      <button
        type="button"
        onClick={() => onStart(cluster.airport, cluster.memberIds)}
        className={START_CTA_CLASS}
      >
        {M3_UI_STRINGS.rideGroup_startCta}
      </button>
    </p>
  );
}
