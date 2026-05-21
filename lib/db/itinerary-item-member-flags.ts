/**
 * Data layer for `itinerary_item_member_flags`.
 *
 * RLS summary (as of M4 Delta 1):
 *   SELECT:
 *     - "item flags: organizers read" (M3)  — organizer of the trip sees ALL flags
 *     - "item flags: owner reads own"  (M4) — member sees only their OWN flags
 *     Both policies stack via OR (additive). Coverage C4 validates this triad.
 *   INSERT:  owner-only (trip_member_id maps to caller's membership)
 *   DELETE:  owner-only (trip_member_id maps to caller's membership)
 *   UPDATE:  none — flag mutation is delete + re-insert
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ItineraryItemMemberFlag } from "./types";

const FLAG_COLUMNS = "id, item_id, trip_member_id, flag, note, created_at";

/**
 * Returns all flags for a given item. Under organizer RLS this returns
 * every member's flags; under member RLS this is filtered to empty (use
 * `getMyFlagsForItem` instead for member-owned reads).
 *
 * Sorted by `created_at` ascending so organizers see flags in
 * submission order (useful for kitchen/logistics planning).
 */
export async function getFlagsForItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<ItineraryItemMemberFlag[]> {
  const { data, error } = await supabase
    .from("itinerary_item_member_flags")
    .select(FLAG_COLUMNS)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getFlagsForItem failed: ${error.message}`);
  }

  return (data ?? []) as ItineraryItemMemberFlag[];
}

/**
 * Returns flags for a specific item scoped to the caller's own
 * `trip_member_id`. This is the member-facing read — the M4 "owner
 * reads own" SELECT policy allows this; organizer policy is irrelevant
 * here because we additionally filter by `trip_member_id`.
 *
 * Passing `memberId` explicitly keeps this function testable without
 * auth mocks; the action layer supplies `auth.uid()` → member lookup.
 */
export async function getMyFlagsForItem(
  supabase: SupabaseClient,
  itemId: string,
  memberId: string
): Promise<ItineraryItemMemberFlag[]> {
  const { data, error } = await supabase
    .from("itinerary_item_member_flags")
    .select(FLAG_COLUMNS)
    .eq("item_id", itemId)
    .eq("trip_member_id", memberId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getMyFlagsForItem failed: ${error.message}`);
  }

  return (data ?? []) as ItineraryItemMemberFlag[];
}
