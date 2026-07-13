/**
 * DayHeadcount (#388) — organizer-only per-day going-count line for the
 * roster page. Server Component; fetches its own data so the page mount
 * stays a single line (the roster rows are being reworked in parallel —
 * this component deliberately owns everything it needs).
 *
 * Aggregate-only by design: counts, never names. Sam's late arrival is
 * a "thu 8 → fri 12" delta here, not a "Sam skipped Thursday" callout
 * (persona-edge-attendees §4 — no public attendance forensics). RLS
 * lets any member read the rows; the organizer gate is a rule-11
 * micro-affordance (members simply don't get this line), not an
 * access-denied wall.
 *
 * Renders null for non-organizers, date-less trips, and trips with no
 * day rows yet — no empty-state chrome, the line just isn't there.
 */

import { eachDayOfInterval, format } from "date-fns";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getPerDayGoingCounts } from "@/lib/db/trip-member-days";
import { MEMBER_DAYS_UI_STRINGS } from "@/lib/copy/empty-states";
import { parseDateOnly } from "@/lib/utils/date-only";
import type { TripRole } from "@/lib/db/types";

export interface DayHeadcountProps {
  tripId: string;
  /** URL slug — the counts here are edited on `/trips/[slug]/me`. */
  tripSlug: string;
  viewerRole: TripRole;
  /** ISO date — `YYYY-MM-DD` — from trips.starts_at / ends_at. */
  startsAt: string | null;
  endsAt: string | null;
}

export async function DayHeadcount({
  tripId,
  tripSlug,
  viewerRole,
  startsAt,
  endsAt,
}: DayHeadcountProps) {
  // is_trip_organizer() semantics (M2 ADR): organizer OR co_organizer.
  if (viewerRole !== "organizer" && viewerRole !== "co_organizer") {
    return null;
  }
  if (!startsAt || !endsAt) {
    return null;
  }

  const supabase = await createClient();
  const counts = await getPerDayGoingCounts(supabase, tripId);

  const days = eachDayOfInterval({
    start: parseDateOnly(startsAt),
    end: parseDateOnly(endsAt),
  }).map((d) => {
    const iso = format(d, "yyyy-MM-dd");
    return {
      iso,
      // Day-header register (#211): lowercase weekday.
      weekday: format(d, "eee").toLowerCase(),
      count: counts[iso] ?? 0,
    };
  });

  // Nothing seeded yet (e.g. everyone still pending) — skip the line
  // rather than render a row of zeroes that reads like nobody's coming.
  if (days.every((d) => d.count === 0)) {
    return null;
  }

  // Screen-reader expansion — the compact "thu 8 · fri 12" register is
  // ambiguous read aloud (a bare number could be a date).
  const spoken = days
    .map((d) =>
      MEMBER_DAYS_UI_STRINGS.memberDays_headcount_day_aria_template
        .replace("{count}", String(d.count))
        .replace("{day}", d.weekday)
    )
    .join(", ");

  return (
    <div className="border-border bg-card mb-6 rounded-md border p-4 shadow-sm">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {MEMBER_DAYS_UI_STRINGS.memberDays_headcount_heading}
      </h2>
      <p className="sr-only">{spoken}</p>
      <p aria-hidden="true" className="text-foreground mt-1 font-mono text-sm">
        {days.map((d) => `${d.weekday} ${d.count}`).join(" · ")}
      </p>
      {/* Glanceability sweep: reciprocal wayfinding to the /me day-chips
          editor these counts are fed by (each surface previously existed
          without the other knowing). */}
      <Link
        href={`/trips/${tripSlug}/me`}
        className="text-primary mt-2 inline-block text-sm underline-offset-4 hover:underline"
      >
        {MEMBER_DAYS_UI_STRINGS.memberDays_link_to_editor}
      </Link>
    </div>
  );
}
