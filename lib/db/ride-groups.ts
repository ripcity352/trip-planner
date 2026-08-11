/**
 * Ride groups data layer — query functions for `ride_group_manifest` (#581).
 *
 * A ride group records who's sharing a car at an airport, per direction
 * (inbound = ride FROM the airport, outbound = ride TO it). The read surface
 * is the `ride_group_manifest` security-invoker view: one flat row per rider,
 * carrying its group's facts. The view exposes member ids as PLAIN scalars
 * (never an embed — ride_group_members has two FKs to trip_members, the
 * PostgREST 300 trap); names resolve app-side via resolveMemberName.
 *
 * Writes (create / add / leave / delete) are server actions in
 * lib/actions/ride-groups.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideGroupWithRiders, TravelLegDirection } from "./types";

// Columns of the ride_group_manifest view (one row per rider).
const RIDE_GROUP_MANIFEST_COLUMNS =
  "ride_group_id, trip_member_id, written_by_trip_member_id, created_at, trip_id, airport, direction, created_by_trip_member_id, group_created_at";

interface ManifestRow {
  ride_group_id: string;
  trip_member_id: string;
  written_by_trip_member_id: string | null;
  created_at: string;
  trip_id: string;
  airport: string | null;
  direction: TravelLegDirection;
  created_by_trip_member_id: string | null;
  group_created_at: string;
}

/**
 * Return all ride groups for a trip, assembled into RideGroupWithRiders[].
 * Groups are ordered by group creation instant; riders within a group are
 * ordered by their own created_at (the creator's self-join is first). RLS
 * limits rows to trips the caller belongs to.
 */
export async function getRideGroupsByTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<RideGroupWithRiders[]> {
  const { data, error } = await supabase
    .from("ride_group_manifest")
    .select(RIDE_GROUP_MANIFEST_COLUMNS)
    .eq("trip_id", tripId);

  if (error) {
    throw new Error(`getRideGroupsByTrip failed: ${error.message}`);
  }

  const rows = (data ?? []) as ManifestRow[];

  // Group flat rider rows by ride_group_id. Keep group facts (first-seen row)
  // and rider rows in separate Maps so the accumulator stays immutable-in-
  // spirit (no in-place object mutation).
  const groupFacts = new Map<string, ManifestRow>();
  const ridersByGroup = new Map<string, ManifestRow[]>();
  for (const r of rows) {
    if (!groupFacts.has(r.ride_group_id)) groupFacts.set(r.ride_group_id, r);
    ridersByGroup.set(r.ride_group_id, [
      ...(ridersByGroup.get(r.ride_group_id) ?? []),
      r,
    ]);
  }

  return [...groupFacts.values()]
    .sort((a, b) => a.group_created_at.localeCompare(b.group_created_at))
    .map((facts) => ({
      id: facts.ride_group_id,
      trip_id: facts.trip_id,
      airport: facts.airport,
      direction: facts.direction,
      created_by_trip_member_id: facts.created_by_trip_member_id,
      riders: (ridersByGroup.get(facts.ride_group_id) ?? [])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((r) => ({
          trip_member_id: r.trip_member_id,
          written_by_trip_member_id: r.written_by_trip_member_id,
        })),
    }));
}
