/**
 * trip_member_days data layer (#388 — day-scoped attendance).
 *
 * The table shipped fully schema'd in M1 (auto-seed trigger, own-row +
 * organizer-write-any RLS, idempotency index) with zero readers — this
 * file is its first consumer.
 *
 * Read posture (verified against the M1 migration): the SELECT policy
 * is "members can read days for their trips" — ANY member of the trip
 * can read all rows. The app deliberately narrows what it *surfaces*:
 *
 *   - `getMemberDays` feeds the /me chips with the caller's OWN rows
 *     (the caller passes their own trip_member_id).
 *   - `getMemberDaysByTrip` feeds the roster "Who's around when" block
 *     with per-member day rows for the whole trip. #524 deliberately
 *     walked back the earlier aggregate-only posture: per-day NAMES are
 *     the documented load-bearing use case ("who's around on Saturday
 *     night" — the M1 RLS SELECT policy exists for exactly this read).
 *     Coordination, not forensics — see the decisions.md ADR.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TripMemberDayStatus } from "./types";

/** One day row as the /me chips consume it. */
export interface MemberDay {
  /** ISO date — `YYYY-MM-DD`. */
  date: string;
  status: TripMemberDayStatus;
}

/**
 * The caller's own day rows for one trip membership, ordered by date.
 * Returns [] for members whose trigger never seeded rows (RSVP maybe /
 * pending) — the chips handle upsert-from-empty.
 */
export async function getMemberDays(
  supabase: SupabaseClient,
  tripMemberId: string
): Promise<MemberDay[]> {
  const { data, error } = await supabase
    .from("trip_member_days")
    .select("date, status")
    .eq("trip_member_id", tripMemberId)
    .order("date", { ascending: true });

  if (error) {
    throw new Error(`getMemberDays failed: ${error.message}`);
  }

  return (data ?? []) as MemberDay[];
}

/** One member × day row as the roster "Who's around when" block consumes it. */
export interface TripMemberDayRow {
  trip_member_id: string;
  /** ISO date — `YYYY-MM-DD`. */
  date: string;
  status: TripMemberDayStatus;
}

/**
 * All members' day rows for a trip (#524 — the per-day names view).
 * Replaces the aggregate-only `getPerDayGoingCounts`: callers derive
 * counts from these same rows, so there's one query shape to keep the
 * #475 semantics on.
 *
 * `trip_member_days` has no trip_id column, so the trip scope (rule 6)
 * goes through the `trip_members` inner-join embed. RLS on both tables
 * already limits rows to trips the caller belongs to; the explicit
 * filter keeps the query single-trip.
 *
 * #475: excludes members who declined at the TRIP level
 * (`trip_members.rsvp_status <> 'declined'`). Day rows are never
 * cleared when a member declines, so a stale 'going' row would
 * otherwise surface a departed member forever. This deliberately does
 * NOT require `rsvp_status = 'going'` — `lib/actions/trip-member-days.ts`
 * lets a trip-level 'maybe' member opt individual days 'going' via
 * their own chip (rule 8: per-item granular opt-in). A require-going
 * join would silently drop those members.
 */
export async function getMemberDaysByTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripMemberDayRow[]> {
  const { data, error } = await supabase
    .from("trip_member_days")
    .select("trip_member_id, date, status, trip_members!inner(trip_id, rsvp_status)")
    .eq("trip_members.trip_id", tripId)
    .neq("trip_members.rsvp_status", "declined")
    .order("date", { ascending: true });

  if (error) {
    throw new Error(`getMemberDaysByTrip failed: ${error.message}`);
  }

  const rows = (data ?? []) as ReadonlyArray<
    TripMemberDayRow & { trip_members: unknown }
  >;

  // Strip the join embed — callers get the flat row shape only.
  return rows.map(({ trip_member_id, date, status }) => ({
    trip_member_id,
    date,
    status,
  }));
}
