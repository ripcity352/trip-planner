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
import type { Trip, TripMember, TripRole } from "./types";

// Single source of truth for the trips column list. RLS will additionally
// hide rows where `deleted_at is not null` for non-organizers, but we
// also pass `.is("deleted_at", null)` on list queries as defense-in-depth
// + an explicit signal to the reader.
const TRIP_COLUMNS =
  "id, slug, name, description, location, starts_at, ends_at, created_by, created_at, updated_at, kind, is_template, deleted_at, archived_at, vibe_tags, timezone";

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

// ---------------------------------------------------------------------------
// Trip member helpers
// ---------------------------------------------------------------------------

export interface ViewerMember {
  id: string;
  role: TripRole;
  is_celebrant: boolean;
  display_name: string | null;
}

/**
 * Return the viewer's trip_member row for the given trip, or null if they
 * are not a member. Used by Server Components to determine organizer/celebrant
 * status without calling supabase.from() directly in the page.
 */
export async function getViewerMember(
  supabase: SupabaseClient,
  tripId: string,
  userId: string
): Promise<ViewerMember | null> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("id, role, is_celebrant, display_name")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getViewerMember failed: ${error.message}`);
  }

  return data as ViewerMember | null;
}

/**
 * Return the celebrant's display_name for a trip, or null if the trip has
 * no celebrant row (unlikely in production but possible in tests/staging).
 */
export async function getCelebrantName(
  supabase: SupabaseClient,
  tripId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("display_name")
    .eq("trip_id", tripId)
    .eq("is_celebrant", true)
    .maybeSingle();

  if (error) {
    throw new Error(`getCelebrantName failed: ${error.message}`);
  }

  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

/**
 * Return all trip members for a trip. Used by ItemCard/LodgingRoster to
 * display member names alongside assignments.
 */
export async function getTripMembers(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripMember[]> {
  const { data, error } = await supabase
    .from("trip_members")
    .select(
      "id, trip_id, user_id, role, rsvp_status, joined_at, is_celebrant, display_name, phone_e164, email, idempotency_key"
    )
    .eq("trip_id", tripId)
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(`getTripMembers failed: ${error.message}`);
  }

  return (data ?? []) as TripMember[];
}

/**
 * Targeted fetch of one trip_member row, scoped by BOTH trip_id and id
 * (multi-tenant rule 6 — a member id from another trip must miss). Used
 * by the #386 member-management actions to run their guards (self /
 * celebrant / founder) against the CURRENT row before mutating.
 */
export async function getTripMemberById(
  supabase: SupabaseClient,
  tripId: string,
  memberId: string
): Promise<TripMember | null> {
  const { data, error } = await supabase
    .from("trip_members")
    .select(
      "id, trip_id, user_id, role, rsvp_status, joined_at, is_celebrant, display_name, phone_e164, email, idempotency_key"
    )
    .eq("trip_id", tripId)
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(`getTripMemberById failed: ${error.message}`);
  }

  return data as TripMember | null;
}

/**
 * Write a member's role (attendee ↔ co_organizer) plus the mutation's
 * idempotency_key (#386, rule 9). RLS ("organizers can update any trip
 * member") gates WHO can run this write; as of #418 its WITH CHECK ALSO
 * constrains the role VALUE (non-founder → {attendee, co_organizer}) and
 * protects the founder/celebrant rows, so the seat invariants are now
 * DB-enforced, not app-only. The app guards in `lib/actions/members.ts`
 * remain as warm rule-explaining copy + the expense-ties check. We chain
 * `.select(...).maybeSingle()` so a policy-swallowed zero-row update is
 * detectable — returns false instead of lying about success.
 *
 * Deliberately NOT settable to 'organizer': the founder seat is assigned
 * once, by `create_trip_with_organizer`, never through this path.
 */
export async function updateTripMemberRole(
  supabase: SupabaseClient,
  memberId: string,
  role: Extract<TripRole, "attendee" | "co_organizer">,
  idempotencyKey: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("trip_members")
    .update({ role, idempotency_key: idempotencyKey })
    .eq("id", memberId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`updateTripMemberRole failed: ${error.message}`);
  }

  return data !== null;
}

/**
 * Delete a trip_member row (#386 remove-from-trip). Returns the number
 * of rows actually deleted so the action can distinguish "removed" (1)
 * from "RLS swallowed it / already gone" (0). Participation rows keyed
 * on trip_member_id (travel legs, lodging, item RSVPs, flags, votes)
 * cascade by schema design; authored content keys on auth.users and
 * survives with the resolveMemberName fallback.
 */
export async function deleteTripMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("trip_members")
    .delete()
    .eq("id", memberId)
    .select("id");

  if (error) {
    throw new Error(`deleteTripMember failed: ${error.message}`);
  }

  return (data ?? []).length;
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

/**
 * Fields the dashboard-header edit may touch. Dates are deliberately
 * NOT here — they're owned by the /dates poll flow (`decide_trip_dates`),
 * and routing them through a free-text edit would bypass the vote.
 */
export interface UpdateTripInput {
  name: string;
  location: string | null;
}

/**
 * Update a trip's name + location. RLS ("organizers can update their
 * trips", 0001_init.sql) gates WHO can write — no app-level role check
 * here, per the lib/db contract. We chain `.select(...).maybeSingle()`
 * so a policy-swallowed zero-row update is detectable: returns the
 * updated Trip, or null when RLS hid the row (non-organizer / not a
 * member / no such trip) instead of lying about success.
 */
export async function updateTrip(
  supabase: SupabaseClient,
  tripId: string,
  input: UpdateTripInput
): Promise<Trip | null> {
  const { data, error } = await supabase
    .from("trips")
    .update({ name: input.name, location: input.location })
    .eq("id", tripId)
    .select(TRIP_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`updateTrip failed: ${error.message}`);
  }

  return data as Trip | null;
}

/**
 * #348: set the caller's per-trip display name on their own membership
 * row. RLS ("users can update their own RSVP" — whole-row, user_id-
 * scoped) means this can only ever touch the caller's row; passing a
 * foreign memberId updates zero rows rather than erroring.
 */
export async function setMemberDisplayName(
  supabase: SupabaseClient,
  memberId: string,
  displayName: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_members")
    .update({ display_name: displayName })
    .eq("id", memberId);

  if (error) {
    throw new Error(`setMemberDisplayName failed: ${error.message}`);
  }
}
