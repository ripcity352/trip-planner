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
 */

import { useRouter } from "next/navigation";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { TravelLegCard } from "./travel-leg-card";
import { TravelLegFormSheet } from "./travel-leg-form-sheet";
import type { TravelLeg, TripMember } from "@/lib/db/types";

export interface ArrivalsManifestProps {
  tripId: string;
  legs: TravelLeg[];
  myTripMemberId: string;
  tripMembers: TripMember[];
}

export function ArrivalsManifest({
  tripId,
  legs,
  myTripMemberId,
  tripMembers,
}: ArrivalsManifestProps) {
  const router = useRouter();

  const handleMutated = () => {
    router.refresh();
  };

  // Build a lookup: trip_member_id → display name.
  // Fallback chain mirrors lodging-roster.tsx: display_name → email → id.
  // "Someone" was the M3 placeholder; real trips need something grounded (#162).
  const memberNameMap = new Map<string, string>();
  for (const m of tripMembers) {
    memberNameMap.set(m.id, m.display_name ?? m.email ?? m.id);
  }

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
              ownerName={memberNameMap.get(leg.trip_member_id) ?? leg.trip_member_id}
            />
          ))}
        </div>
      )}

      {/* Add a leg CTA — always visible so any member can log their travel */}
      <TravelLegFormSheet tripId={tripId} onMutated={handleMutated} />
    </div>
  );
}
