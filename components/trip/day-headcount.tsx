/**
 * DayHeadcount — the roster "Who's around when" block (#388, reworked
 * in #524). Server Component; fetches its own data so the page mount
 * stays a single mount line.
 *
 * #524 walk-back (see the decisions.md ADR): this block was
 * organizer-only and aggregate-only (counts, never names), which left
 * the documented load-bearing use case — "who's around on Saturday
 * night" — unbuilt and the /me "See who's around when" link dead. Now:
 *
 *   - visible to ALL members (RLS always allowed the read; the gate
 *     was app-side only)
 *   - day tokens are tappable → expand to the names around that day,
 *     with everyone else greyed (coordination, not forensics — the
 *     grey row is "not that night", not a callout)
 *   - names carry that day's travel-leg time when one exists
 *     ("Carl — lands 10:30 am")
 *   - always renders when the trip has dates — empty state instead of
 *     null, so the /me link never lands on nothing (`id="whos-around"`
 *     is the link's anchor)
 *
 * Date-less trips still render nothing — there are no days to show.
 */

import { eachDayOfInterval, format } from "date-fns";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getMemberDaysByTrip } from "@/lib/db/trip-member-days";
import { getTripMembers } from "@/lib/db/trips";
import { getTravelLegsByTrip } from "@/lib/db/travel-legs";
import { MEMBER_DAYS_UI_STRINGS } from "@/lib/copy/empty-states";
import { parseDateOnly } from "@/lib/utils/date-only";
import { legNoteForDay } from "@/lib/utils/leg-day-note";
import { resolveMemberName } from "@/lib/utils/member-display";
import {
  DayHeadcountList,
  type DayPresence,
  type DayPresenceMember,
} from "@/components/trip/day-headcount-list";
import type { TravelLeg } from "@/lib/db/types";

export interface DayHeadcountProps {
  tripId: string;
  /** URL slug — the day statuses here are edited on `/trips/[slug]/me`. */
  tripSlug: string;
  /** ISO date — `YYYY-MM-DD` — from trips.starts_at / ends_at. */
  startsAt: string | null;
  endsAt: string | null;
  /** IANA timezone from trips.timezone — leg times render trip-local. */
  timezone: string;
}

export async function DayHeadcount({
  tripId,
  tripSlug,
  startsAt,
  endsAt,
  timezone,
}: DayHeadcountProps) {
  if (!startsAt || !endsAt) {
    return null;
  }

  const supabase = await createClient();
  const [dayRows, members, legs] = await Promise.all([
    getMemberDaysByTrip(supabase, tripId),
    getTripMembers(supabase, tripId),
    getTravelLegsByTrip(supabase, tripId),
  ]);

  // Member surface mirrors the day-rows read: trip-level decliners are
  // out (#475 semantics), everyone else appears (grey when not around).
  const visibleMembers = members.filter((m) => m.rsvp_status !== "declined");
  const memberMap = new Map(visibleMembers.map((m) => [m.id, m]));

  const legsByMember = new Map<string, TravelLeg[]>();
  for (const leg of legs) {
    legsByMember.set(leg.trip_member_id, [
      ...(legsByMember.get(leg.trip_member_id) ?? []),
      leg,
    ]);
  }

  const goingByDate = new Map<string, Set<string>>();
  for (const row of dayRows) {
    if (row.status !== "going") continue;
    goingByDate.set(
      row.date,
      new Set([...(goingByDate.get(row.date) ?? []), row.trip_member_id])
    );
  }

  const days: DayPresence[] = eachDayOfInterval({
    start: parseDateOnly(startsAt),
    end: parseDateOnly(endsAt),
  }).map((d) => {
    const iso = format(d, "yyyy-MM-dd");
    const goingSet = goingByDate.get(iso) ?? new Set<string>();
    const dayMembers: DayPresenceMember[] = visibleMembers.map((m) => {
      const around = goingSet.has(m.id);
      return {
        id: m.id,
        name: resolveMemberName(memberMap, m.id),
        around,
        // Around rows only: a leg time on a greyed row would publicly
        // surface the member's leg↔chip contradiction — that cue is
        // self-only by design (#526 "no calling people out").
        legNote: around
          ? legNoteForDay(legsByMember.get(m.id) ?? [], iso, timezone)
          : null,
      };
    });
    // Around first, greyed rest after — both keep roster (joined_at) order.
    const ordered = [
      ...dayMembers.filter((m) => m.around),
      ...dayMembers.filter((m) => !m.around),
    ];
    return {
      iso,
      // Day-header register (#211): lowercase weekday.
      weekday: format(d, "eee").toLowerCase(),
      count: goingSet.size,
      members: ordered,
    };
  });

  const nothingSeeded = dayRows.length === 0;

  return (
    <div
      id="whos-around"
      className="border-border bg-card mb-6 scroll-mt-20 rounded-md border p-4 shadow-sm"
    >
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {MEMBER_DAYS_UI_STRINGS.memberDays_headcount_heading}
      </h2>
      {nothingSeeded ? (
        <p className="text-muted-foreground mt-1 text-sm">
          {MEMBER_DAYS_UI_STRINGS.memberDays_headcount_empty}
        </p>
      ) : (
        // No separate sr-only counts line: each day token is a button
        // whose aria-label carries "{count} in on {day}" (the compact
        // "fri 4" register is ambiguous read aloud).
        <DayHeadcountList days={days} />
      )}
      {/* Reciprocal wayfinding to the /me day-chips editor these
          statuses are fed by. */}
      <Link
        href={`/trips/${tripSlug}/me`}
        className="text-primary mt-2 inline-block text-sm underline-offset-4 hover:underline"
      >
        {MEMBER_DAYS_UI_STRINGS.memberDays_link_to_editor}
      </Link>
    </div>
  );
}
