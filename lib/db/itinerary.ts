/**
 * Itinerary data layer — query functions for itinerary_items and
 * related M3 tables (lodging_assignments, itinerary_item_rsvps,
 * itinerary_item_member_flags).
 *
 * Pattern follows lib/db/trips.ts:
 *   - Functions accept SupabaseClient as first arg (usable from Server
 *     Components, Route Handlers, Server Actions).
 *   - Map raw Supabase responses to typed objects from ./types.ts.
 *   - Throw on unexpected errors; return null for "not found."
 *   - RLS enforces access control — app-layer checks are defense-in-depth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ItineraryItem,
  ItineraryItemMemberFlag,
  ItineraryItemRsvp,
  LodgingAssignment,
} from "./types";

const ITINERARY_ITEM_COLUMNS =
  "id, trip_id, day, start_time, end_time, title, location, address, notes, cost_cents, currency, created_by, created_at, updated_at, visibility, kind, activity_tag, dress_code, idempotency_key";

/**
 * Return all itinerary items for a trip, ordered by day ASC then
 * start_time ASC (nulls last). RLS filters out items invisible to the
 * caller (e.g. hide_from_celebrant items are invisible to the celebrant).
 */
export async function getItineraryByTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<ItineraryItem[]> {
  const { data, error } = await supabase
    .from("itinerary_items")
    .select(ITINERARY_ITEM_COLUMNS)
    .eq("trip_id", tripId)
    .order("day", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`getItineraryByTrip failed: ${error.message}`);
  }

  return (data ?? []) as ItineraryItem[];
}

/**
 * Return a single itinerary item by id. Returns null if not found or
 * not visible to the caller (RLS).
 */
export async function getItineraryItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<ItineraryItem | null> {
  const { data, error } = await supabase
    .from("itinerary_items")
    .select(ITINERARY_ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    throw new Error(`getItineraryItem failed: ${error.message}`);
  }

  return data as ItineraryItem | null;
}

/**
 * Return the next upcoming itinerary item for a trip — the earliest item
 * whose `day` is >= today (in the DB timezone, UTC). Returns null if no
 * upcoming items exist (all in the past or the itinerary is empty).
 *
 * Used by the dashboard "now/next" card to show the first upcoming event.
 */
export async function getNextUpcomingItem(
  supabase: SupabaseClient,
  tripId: string
): Promise<ItineraryItem | null> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  const { data, error } = await supabase
    .from("itinerary_items")
    .select(ITINERARY_ITEM_COLUMNS)
    .eq("trip_id", tripId)
    .gte("day", today)
    .order("day", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getNextUpcomingItem failed: ${error.message}`);
  }

  return data as ItineraryItem | null;
}

/**
 * Return all per-item RSVPs for the calling member across a trip.
 * Absence of a row for an item means the member inherits the day-level RSVP.
 * RLS: trip members can read all RSVPs for items in their trip.
 */
export async function getMyItemRsvps(
  supabase: SupabaseClient,
  tripId: string
): Promise<ItineraryItemRsvp[]> {
  // We join through itinerary_items to scope by trip_id, since
  // itinerary_item_rsvps only has item_id.
  const { data, error } = await supabase
    .from("itinerary_item_rsvps")
    .select(
      "item_id, trip_member_id, status, idempotency_key, updated_at, itinerary_items!inner(trip_id)"
    )
    .eq("itinerary_items.trip_id", tripId);

  if (error) {
    throw new Error(`getMyItemRsvps failed: ${error.message}`);
  }

  // Strip the join columns before returning
  return (data ?? []).map(({ itinerary_items: _join, ...rest }) => rest) as ItineraryItemRsvp[];
}

/**
 * Return all per-item member flags for a trip. Organizer-only via RLS —
 * non-organizers receive an empty array (RLS filters all rows).
 */
export async function getItemFlagsForOrganizer(
  supabase: SupabaseClient,
  tripId: string
): Promise<ItineraryItemMemberFlag[]> {
  const { data, error } = await supabase
    .from("itinerary_item_member_flags")
    .select(
      "id, item_id, trip_member_id, flag, note, created_at, itinerary_items!inner(trip_id)"
    )
    .eq("itinerary_items.trip_id", tripId);

  if (error) {
    throw new Error(`getItemFlagsForOrganizer failed: ${error.message}`);
  }

  return (data ?? []).map(({ itinerary_items: _join, ...rest }) => rest) as ItineraryItemMemberFlag[];
}

/**
 * Return all lodging assignments for a specific lodging item.
 * RLS: any trip member can read assignments (for the room roster view).
 */
export async function getLodgingAssignments(
  supabase: SupabaseClient,
  itemId: string
): Promise<LodgingAssignment[]> {
  const { data, error } = await supabase
    .from("lodging_assignments")
    .select("id, item_id, trip_member_id, room_label, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getLodgingAssignments failed: ${error.message}`);
  }

  return (data ?? []) as LodgingAssignment[];
}
