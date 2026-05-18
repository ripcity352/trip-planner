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
 * it for us. See `supabase/migrations/0001_init.sql`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "./types";

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
    .select(
      "id, slug, name, description, location, starts_at, ends_at, created_by, created_at, updated_at"
    )
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
    .select(
      "id, slug, name, description, location, starts_at, ends_at, created_by, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getTripById failed: ${error.message}`);
  }

  return data as Trip | null;
}

/**
 * List all trips the caller is a member of, newest first.
 */
export async function listMyTrips(supabase: SupabaseClient): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, slug, name, description, location, starts_at, ends_at, created_by, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listMyTrips failed: ${error.message}`);
  }

  return (data ?? []) as Trip[];
}

/**
 * Input shape for creating a trip. `created_by` is filled in server-side
 * from `auth.uid()` to prevent spoofing.
 */
export interface CreateTripInput {
  slug: string;
  name: string;
  description?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

/**
 * Create a trip and return the persisted row. The caller is also added
 * to `trip_members` as `organizer` via a SECURITY DEFINER function in
 * the Goal 2 migration; this stub assumes that side-effect is wired
 * separately.
 */
export async function createTrip(
  supabase: SupabaseClient,
  userId: string,
  input: CreateTripInput
): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .insert({ ...input, created_by: userId })
    .select(
      "id, slug, name, description, location, starts_at, ends_at, created_by, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(`createTrip failed: ${error.message}`);
  }

  return data as Trip;
}
