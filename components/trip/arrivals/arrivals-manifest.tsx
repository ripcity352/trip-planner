"use client";

/**
 * ArrivalsManifest — client component that renders the two travel
 * sections (#477) and the add CTAs.
 *
 * Inbound ("Who's landing when" — the page <h1>): legs grouped by
 * trip-local landing day, plus a quiet computed ride-share line when 2+
 * people land at the same airport within an hour (no matching engine —
 * #118 stays open). Outbound: a quieter "Heading home" section, only
 * rendered when someone has logged a leg home.
 *
 * "use client" because it needs to trigger router.refresh() after a
 * successful mutation (TravelLegFormSheet calls onMutated → refresh).
 *
 * Consumes:
 *   - `legs` — pre-fetched by the page Server Component via `getTravelLegsByTrip`
 *   - `myTripMemberId` — resolved by the page to gate edit affordances
 *   - `tripMembers` — for display names on each card
 *   - `tripTimezone` — IANA tz string threaded to TravelLegCard so times
 *     render in trip-local time (#254), used here for day grouping, and
 *     threaded to TravelLegFormSheet so form input parses as trip-local
 *     time (#382)
 */

import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO } from "date-fns";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { resolveMemberName } from "@/lib/utils/member-display";
import { computeRideShareClusters } from "@/lib/utils/ride-share";
import { TravelLegCard } from "./travel-leg-card";
import { TravelLegFormSheet } from "./travel-leg-form-sheet";
import type { TravelLeg, TripMember } from "@/lib/db/types";

export interface ArrivalsManifestProps {
  tripId: string;
  legs: TravelLeg[];
  myTripMemberId: string;
  tripMembers: TripMember[];
  /** IANA timezone string for the trip (e.g. `"America/New_York"`). */
  tripTimezone: string;
}

interface DayGroup {
  key: string;
  label: string;
  legs: TravelLeg[];
}

/**
 * Group inbound legs by trip-local landing day, preserving the incoming
 * arrive_at ASC sort. Legacy inbound rows without a landing time group
 * under a trailing "Landing time TBD" bucket.
 */
function groupInboundByDay(
  legs: TravelLeg[],
  tripTimezone: string
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const leg of legs) {
    let key = "tbd";
    let label: string = M3_UI_STRINGS.arrivals_inbound_time_tbd;
    if (leg.arrive_at) {
      const date = parseISO(leg.arrive_at);
      try {
        key = formatInTimeZone(date, tripTimezone, "yyyy-MM-dd");
        // Design-system date register: weekday + month + day, no year.
        label = formatInTimeZone(date, tripTimezone, "EEE, MMM d");
      } catch {
        // Unparseable stored timestamp — fall through to the TBD bucket.
      }
    }
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.legs = [...existing.legs, leg];
    } else {
      groups.push({ key, label, legs: [leg] });
    }
  }
  return groups;
}

export function ArrivalsManifest({
  tripId,
  legs,
  myTripMemberId,
  tripMembers,
  tripTimezone,
}: ArrivalsManifestProps) {
  const router = useRouter();

  const handleMutated = () => {
    router.refresh();
  };

  // Build a lookup: trip_member_id → TripMember. resolveMemberName reads
  // display_name and falls back to "Guest" — email/id never surface in the UI.
  const memberNameMap = new Map(tripMembers.map((m) => [m.id, m]));

  // #477: split the manifest by direction. `legs` arrives sorted by
  // arrive_at ASC (nulls last), which is the right order for inbound;
  // outbound is re-sorted by depart_at.
  const inboundLegs = legs.filter((leg) => leg.direction === "inbound");
  const outboundLegs = [
    ...legs.filter((leg) => leg.direction === "outbound"),
  ].sort((a, b) => (a.depart_at ?? "").localeCompare(b.depart_at ?? ""));

  const dayGroups = groupInboundByDay(inboundLegs, tripTimezone);
  const rideShareClusters = computeRideShareClusters(inboundLegs);

  const renderCard = (leg: TravelLeg) => (
    <TravelLegCard
      key={leg.id}
      leg={leg}
      myTripMemberId={myTripMemberId}
      ownerName={resolveMemberName(memberNameMap, leg.trip_member_id)}
      tripTimezone={tripTimezone}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Inbound — "Who's landing when" is the page <h1> */}
      <div className="flex flex-col gap-4">
        {/* Ride-share nudge: one quiet static line per cluster (#477) */}
        {rideShareClusters.map((cluster, i) => (
          <p
            // Same airport can emit multiple time-window clusters — index disambiguates
            key={`${cluster.airport}-${i}`}
            className="text-muted-foreground text-sm"
          >
            {M3_UI_STRINGS.arrivals_ride_share_template
              .replace("{count}", String(cluster.count))
              .replace("{airport}", cluster.airport)}
          </p>
        ))}

        {inboundLegs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {M3_UI_STRINGS.arrivals_empty}
          </p>
        ) : (
          dayGroups.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {group.label}
              </h2>
              {group.legs.map(renderCard)}
            </section>
          ))
        )}
      </div>

      {/* Outbound — quieter section, only when someone's logged a leg home */}
      {outboundLegs.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">
            {M3_UI_STRINGS.arrivals_section_outbound_heading}
          </h2>
          {outboundLegs.map(renderCard)}
        </section>
      ) : null}

      {/* Add CTAs — always visible so any member can log their travel */}
      <TravelLegFormSheet
        tripId={tripId}
        tripTimezone={tripTimezone}
        onMutated={handleMutated}
      />
    </div>
  );
}
