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
 *   - `getPerDayGoingCounts` feeds the organizer roster line with
 *     AGGREGATE counts only — no names, no per-member day pattern.
 *     Sam's late arrival shows up as "thu 8" vs "fri 9", never as
 *     "Sam skipped Thursday" (persona-edge-attendees §4: no public
 *     attendance forensics).
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

/**
 * Per-day 'going' headcounts for a trip, as a `date → count` record.
 *
 * `trip_member_days` has no trip_id column, so the trip scope (rule 6)
 * goes through the `trip_members` inner-join embed. RLS on both tables
 * already limits rows to trips the caller belongs to; the explicit
 * filter keeps the query single-trip.
 *
 * #475: excludes members who declined at the TRIP level
 * (`trip_members.rsvp_status <> 'declined'`). Day rows are never
 * cleared when a member declines, so a stale 'going' row would
 * otherwise inflate the count forever. This deliberately does NOT
 * require `rsvp_status = 'going'` — `lib/actions/trip-member-days.ts`
 * lets a trip-level 'maybe' member opt individual days 'going' via
 * their own chip (rule 8: per-item granular opt-in). A require-going
 * join would silently undercount those members.
 *
 * Client-side aggregation on purpose (same rationale as
 * `getRsvpCountsForTrip`): the row count is tiny (members × days) and
 * a SQL aggregate would need its own SECURITY DEFINER surface.
 */
export async function getPerDayGoingCounts(
  supabase: SupabaseClient,
  tripId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("trip_member_days")
    .select("date, status, trip_members!inner(trip_id, rsvp_status)")
    .eq("trip_members.trip_id", tripId)
    .eq("status", "going")
    .neq("trip_members.rsvp_status", "declined");

  if (error) {
    throw new Error(`getPerDayGoingCounts failed: ${error.message}`);
  }

  const rows = (data ?? []) as ReadonlyArray<{ date: string }>;

  // Reduce into a fresh record — no mutation of the rows we read.
  return rows.reduce<Record<string, number>>(
    (acc, row) => ({ ...acc, [row.date]: (acc[row.date] ?? 0) + 1 }),
    {}
  );
}
