"use client";

/**
 * ArrivalsManifest — client component that renders the list of travel legs
 * and the "Add a leg" CTA.
 *
 * "use client" because it needs to trigger router.refresh() after a
 * successful mutation (TravelLegFormSheet calls onMutated → refresh).
 * If interactive state is not needed in the future, this can be promoted
 * to a Server Component.
 *
 * Consumes:
 *   - `legs` — pre-fetched by the page Server Component via `getTravelLegsByTrip`
 *   - `myTripMemberId` — resolved by the page to gate edit affordances
 *   - `tripMembers` — for display names on each card
 *   - `tripTimezone` — IANA tz string threaded to TravelLegCard so all
 *     departure/arrival times render in trip-local time (#254), and to
 *     TravelLegFormSheet so form input parses as trip-local time (#382)
 */

import { useRouter } from "next/navigation";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { resolveMemberName } from "@/lib/utils/member-display";
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

  return (
    <div className="flex flex-col gap-4">
      {/* Leg list or empty state (heading lives on the page <h1>) */}
      {legs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {M3_UI_STRINGS.arrivals_empty}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {legs.map((leg) => (
            <TravelLegCard
              key={leg.id}
              leg={leg}
              myTripMemberId={myTripMemberId}
              ownerName={resolveMemberName(memberNameMap, leg.trip_member_id)}
              tripTimezone={tripTimezone}
            />
          ))}
        </div>
      )}

      {/* Add a leg CTA — always visible so any member can log their travel */}
      <TravelLegFormSheet
        tripId={tripId}
        tripTimezone={tripTimezone}
        onMutated={handleMutated}
      />
    </div>
  );
}
