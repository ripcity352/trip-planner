/**
 * Trip data layer — example query module. The pattern set here applies
 * to every other table in `lib/db/`:
 *
 *   1. Functions accept Supabase clients (server or browser) as args
 *      where possible, so the same function can be reused from Server
 *      Components, Route Handlers, and Server Actions.
 *   2. They map raw Supabase responses to typed objects from
 *      `./types.ts` — no `any` leaks into callers.
 *   3. They throw on unexpected errors and return `null` for "not
 *      found" — callers branch on the latter, not on error messages.
 *
 * RLS still enforces "you can only see trips you're a member of." These
 * functions don't add app-level access checks because the database does
 * it for us. See `supabase/migrations/20260519123255_m1_foundation.sql`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "./types";

// Single source of truth for the trips column list. RLS will additionally
// hide rows where `deleted_at is not null` for non-organizers, but we
// also pass `.is("deleted_at", null)` on list queries as defense-in-depth
// + an explicit signal to the reader.
const TRIP_COLUMNS =
  "id, slug, name, description, location, starts_at, ends_at, created_by, created_at, updated_at, kind, is_template, deleted_at, archived_at, vibe_tags";

/**
 * Get a trip by its URL slug. Returns null if the trip doesn't exist or
 * the caller isn't a member.
 */
export async function getTripBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<Trip | null> {
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`getTripBySlug failed: ${error.message}`);
  }

  return data as Trip | null;
}

/**
 * Get a trip by its UUID. Same access rules as `getTripBySlug`.
 */
export async function getTripById(
  supabase: SupabaseClient,
  id: string
): Promise<Trip | null> {
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getTripById failed: ${error.message}`);
  }

  return data as Trip | null;
}

/**
 * List all trips the caller is a member of, newest first. Excludes
 * soft-deleted and template trips.
 */
export async function listMyTrips(supabase: SupabaseClient): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .is("deleted_at", null)
    .eq("is_template", false)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listMyTrips failed: ${error.message}`);
  }

  return (data ?? []) as Trip[];
}

/**
 * Input shape for creating a trip. `created_by` is filled in server-side
 * from `auth.uid()` inside the RPC, so the userId argument is no longer
 * passed by the caller — the M1 stub signature is preserved here only
 * for documentation; the M2 implementation routes through
 * `public.create_trip_with_organizer(...)`.
 */
export interface CreateTripInput {
  slug: string;
  name: string;
  description?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  vibe_tags?: string[] | null;
}

/**
 * Create a trip atomically with the caller as `organizer`. Wraps
 * `public.create_trip_with_organizer(...)` (SECURITY DEFINER) so the
 * trip insert + the organizer trip_member insert run in a single
 * transaction — without this, a brief window exists where a trip has
 * no members and is therefore invisible to its own creator under RLS.
 *
 * Per the M2 DoD: creator is `organizer`, NOT `celebrant`. The
 * celebrant flag is set in a separate flow (later milestone).
 */
export async function createTrip(
  supabase: SupabaseClient,
  input: CreateTripInput
): Promise<Trip> {
  const { data, error } = await supabase.rpc("create_trip_with_organizer", {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description ?? null,
    p_location: input.location ?? null,
    p_starts_at: input.starts_at ?? null,
    p_ends_at: input.ends_at ?? null,
    p_vibe_tags: input.vibe_tags ?? [],
  });

  if (error) {
    throw new Error(`createTrip failed: ${error.message}`);
  }

  // The RPC returns a single `public.trips` row; Supabase deserializes
  // a SETOF-of-one-record return as either the bare row or a 1-element
  // array depending on the driver. Defensive: handle both.
  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error("createTrip failed: empty response");
    }
    return data[0] as Trip;
  }
  return data as Trip;
}
