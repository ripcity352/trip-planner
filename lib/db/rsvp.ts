/**
 * RSVP data layer (M2 Wave 2b).
 *
 * The read path is the load-bearing piece here: glanceable counts MUST
 * source from `trip_members_visible_rsvp(viewer_id)`, NEVER the raw
 * `trip_members` table. That view is the schema-level enforcement of
 * the "declining whispers" ADR (notes/decisions.md, 2026-05-19):
 * a non-organizer viewer sees the declined member as a null
 * `rsvp_status`, which we fold into the `invited` bucket here. Querying
 * the raw table from app code would leak per-name decline data and
 * sidestep the redaction in SQL.
 *
 * For the organizer-only parenthetical ("(N can't make it)") we do
 * query the raw table — that path is gated at the page level by
 * `is_trip_organizer()`, and RLS still enforces "you can only read
 * your own trip's members." The combination is defense-in-depth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RsvpStatus } from "./types";

/**
 * Public, viewer-aware count shape. Three buckets — `going`, `maybe`,
 * `invited` — never `declined`. Declines roll into `invited` for
 * non-organizers (the view redacts them to null) AND for organizers
 * (we keep the public shape stable and surface the organizer-only
 * detail through a separate gated suffix in the UI).
 */
export interface RsvpCounts {
  going: number;
  maybe: number;
  /**
   * Everyone the caller can see who isn't going or maybe yet. Includes
   * pending invitations, redacted-declines (non-organizer viewer), and
   * the literal "declined" rows the organizer can see — all collapsed
   * because the public count surface is "X going, Y maybe, Z invited".
   */
  invited: number;
}

/**
 * Aggregate RSVP counts for a trip from the visible-rsvp view. RLS +
 * the view's case-when together enforce the "declining whispers"
 * contract — see notes/decisions.md.
 *
 * We do client-side aggregation (not a SQL aggregate) on purpose:
 * `trip_members_visible_rsvp` is `security_invoker = true`, so the
 * caller's RLS is applied first; we then group the small number of
 * rows we got back. A SQL count(*) here would need to ship as another
 * SECURITY DEFINER function with its own audit trail.
 */
export async function getRsvpCountsForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<RsvpCounts> {
  const { data, error } = await supabase
    .from("trip_members_visible_rsvp")
    .select("rsvp_status")
    .eq("trip_id", tripId);

  if (error) {
    throw new Error(`getRsvpCountsForTrip failed: ${error.message}`);
  }

  const rows = (data ?? []) as ReadonlyArray<{
    rsvp_status: RsvpStatus | null;
  }>;

  // Reduce-into-fresh-object — no mutation of the rows we read.
  return rows.reduce<RsvpCounts>(
    (acc, row) => {
      if (row.rsvp_status === "going") {
        return { ...acc, going: acc.going + 1 };
      }
      if (row.rsvp_status === "maybe") {
        return { ...acc, maybe: acc.maybe + 1 };
      }
      // pending, null (redacted decline), and literal "declined" all
      // collapse into the `invited` bucket. The public shape is the
      // glanceable count; per-name decline detail is a separate,
      // organizer-only render path that does NOT live in this fn.
      return { ...acc, invited: acc.invited + 1 };
    },
    { going: 0, maybe: 0, invited: 0 }
  );
}

/**
 * Caller-self RSVP lookup. Returns the caller's `trip_members` row
 * status + id, or null if they aren't a member of the trip.
 *
 * We read the raw `trip_members` table (NOT the view) because the
 * view's case-when redacts the caller's own row if rsvp_status was
 * 'declined' for non-organizers — and the caller always needs to see
 * their own status. The view does guard against that
 * (`tm.user_id is distinct from auth.uid()`), but we prefer the raw
 * table so a future view tweak can't silently starve the toggle.
 *
 * Explicit `eq("user_id", authUid)` filter: an organizer (who can
 * see all members of the trip via RLS) needs to narrow to their
 * own row; without it, .maybeSingle() throws on the multi-row return.
 * The caller passes the auth.uid() explicitly so the data layer
 * stays a thin typed wrapper (auth lookup lives in the action layer).
 *
 * RLS additionally enforces "you can only see members of trips you
 * belong to" — see M1 migration.
 */
export async function getMyRsvp(
  supabase: SupabaseClient,
  tripId: string,
  userId: string
): Promise<{ tripMemberId: string; status: RsvpStatus } | null> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("id, rsvp_status")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getMyRsvp failed: ${error.message}`);
  }

  if (!data) return null;

  const row = data as { id: string; rsvp_status: RsvpStatus };
  return { tripMemberId: row.id, status: row.rsvp_status };
}

/**
 * Organizer-only count of declined members for the trip. Renders the
 * "(N can't make it)" suffix on the dashboard glanceable count, gated
 * at the call site by an `is_trip_organizer` RPC check. RLS additionally
 * enforces that only organizers can read declined rows by name.
 *
 * Returning 0 is the safe default when the caller isn't authorized
 * (RLS hides the rows) — but the caller MUST still gate rendering on
 * the organizer check; never trust a 0 to mean "no declines."
 */
export async function getOrganizerDeclinedCount(
  supabase: SupabaseClient,
  tripId: string
): Promise<number> {
  // head: true skips the row payload entirely; count: "exact" returns the
  // precise count from PostgreSQL. This avoids transferring full rows over
  // the wire when we only need the number.
  const { count, error } = await supabase
    .from("trip_members")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("rsvp_status", "declined");

  if (error) {
    throw new Error(`getOrganizerDeclinedCount failed: ${error.message}`);
  }

  // Supabase returns null when the head query matches zero rows.
  return count ?? 0;
}
