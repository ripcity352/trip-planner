/**
 * Travel legs data layer — query functions for `travel_legs`.
 *
 * Travel legs represent per-member transport info (flights, drives, etc.).
 * The arrivals manifest is the primary read surface: all trip members can
 * see all legs, ordered by arrive_at ASC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TravelLeg } from "./types";

const TRAVEL_LEG_COLUMNS =
  "id, trip_id, trip_member_id, kind, depart_at, arrive_at, carrier, confirmation_code, notes, idempotency_key, created_at";

/**
 * Return all travel legs for a trip, ordered by arrive_at ASC (arrivals
 * manifest sort). Null arrive_at values sort last.
 * RLS: any trip member can read all legs.
 */
export async function getTravelLegsByTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<TravelLeg[]> {
  const { data, error } = await supabase
    .from("travel_legs")
    .select(TRAVEL_LEG_COLUMNS)
    .eq("trip_id", tripId)
    .order("arrive_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`getTravelLegsByTrip failed: ${error.message}`);
  }

  return (data ?? []) as TravelLeg[];
}

/**
 * Slim arrival-instants read for the dashboard Arrivals glance line —
 * one column, legs without an arrival time filtered at the DB. The
 * aggregate landed/next math lives in
 * `lib/utils/dashboard-glance.ts#summarizeArrivals`; only counts and
 * the next instant ever render (no names — no arrival forensics).
 */
export async function getArrivalTimesByTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("travel_legs")
    .select("arrive_at")
    .eq("trip_id", tripId)
    .not("arrive_at", "is", null);

  if (error) {
    throw new Error(`getArrivalTimesByTrip failed: ${error.message}`);
  }

  return ((data ?? []) as Array<{ arrive_at: string }>).map(
    (row) => row.arrive_at
  );
}
