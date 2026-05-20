/**
 * `/trips/[tripId]` — trip dashboard.
 *
 * IMPORTANT: the URL segment is the trip's `slug`, not its UUID. We
 * keep the parameter named `tripId` because the file lives at
 * `[tripId]/` and renaming the segment would churn the route group.
 * The trade-off is documented here so a future reader doesn't go hunt
 * for a uuid mapping that doesn't exist.
 *
 * The page reads the trip via `getTripBySlug`. RLS gates visibility to
 * members; non-member access returns `null` from the DB layer, which
 * we surface as a `notFound()` — identical 404 for "doesn't exist" and
 * "not your trip" so a hostile prober can't enumerate slugs.
 *
 * Wave 2a shipped the skeleton + invite-link area. Wave 2b (this slice)
 * wires the glanceable RSVP counts + the 3-state RSVP toggle, sourcing
 * counts from `trip_members_visible_rsvp` (NOT raw `trip_members`) per
 * the declining-whispers ADR. The organizer-only "(N can't make it)"
 * suffix is gated by an `is_trip_organizer()` RPC check; RLS does the
 * same gating at the row level as defense-in-depth.
 */

import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RsvpToggle } from "@/components/trip/rsvp-toggle";
import { getTripBySlug } from "@/lib/db/trips";
import {
  getMyRsvp,
  getOrganizerDeclinedCount,
  getRsvpCountsForTrip,
} from "@/lib/db/rsvp";
import { createClient } from "@/lib/supabase/server";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Trip } from "@/lib/db/types";

type PageProps = {
  // Next.js 16 — dynamic segment params are async.
  params: Promise<{ tripId: string }>;
};

export default async function TripDashboardPage({ params }: PageProps) {
  const { tripId } = await params;

  const supabase = await createClient();
  const trip = await getTripBySlug(supabase, tripId);

  if (!trip) {
    notFound();
  }

  // The auth gate above (`app/(authed)/layout.tsx`) guarantees a user
  // is present, but the data-layer call wants the explicit uid for the
  // self-RSVP narrow. We read it once and pass it in — cheaper than
  // re-resolving auth inside getMyRsvp.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Defensive: layout guard should have redirected already. If we
    // somehow got here, redirect to a 404 so we don't leak the trip
    // existence to an unauthenticated caller.
    notFound();
  }

  // Glanceable counts always source from the view — see file docstring.
  // We fan out the three reads in parallel; they're independent.
  const [counts, myRsvp, organizerCheck] = await Promise.all([
    getRsvpCountsForTrip(supabase, trip.id),
    getMyRsvp(supabase, trip.id, user.id),
    supabase.rpc("is_trip_organizer", { p_trip_id: trip.id }),
  ]);

  const isOrganizer = organizerCheck.data === true;

  // Organizer-only declined count is gated TWICE: the page won't issue
  // the read unless `isOrganizer` is true, AND RLS on `trip_members`
  // hides the rows from non-organizers regardless. The double-gate is
  // intentional defense-in-depth.
  const declinedCount = isOrganizer
    ? await getOrganizerDeclinedCount(supabase, trip.id)
    : 0;

  const countLine = formatRsvpCountLine({
    counts,
    isOrganizer,
    declinedCount,
  });

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatTripDates(trip)}
          {trip.location ? ` · ${trip.location}` : null}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{M2_UI_STRINGS.dashboard_section_rsvp_heading}</CardTitle>
            <CardDescription>{countLine}</CardDescription>
          </CardHeader>
          <CardContent>
            <RsvpToggle
              tripId={trip.id}
              initialStatus={myRsvp?.status ?? "pending"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {M2_UI_STRINGS.dashboard_section_invite_heading}
            </CardTitle>
            <CardDescription>
              {M2_UI_STRINGS.dashboard_section_invite_body}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {M2_UI_STRINGS.dashboard_invite_placeholder}
            </p>
          </CardContent>
        </Card>

        {/* Wave 3 link — drops the date-poll surface one click away
            from the dashboard. Server Component, no client behavior. */}
        <Link
          href={`/trips/${trip.slug}/dates`}
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          {M2_UI_STRINGS.dashboard_dates_link_label}
        </Link>
      </div>
    </section>
  );
}

function formatTripDates(trip: Trip): string {
  if (trip.starts_at && trip.ends_at) {
    return `${format(new Date(trip.starts_at), "MMM d")} – ${format(
      new Date(trip.ends_at),
      "MMM d"
    )}`;
  }
  if (trip.starts_at) {
    return format(new Date(trip.starts_at), "MMM d");
  }
  return M2_UI_STRINGS.dashboard_dates_unset;
}

/**
 * Render the glanceable count line, e.g. "3 going, 1 maybe, 4 invited".
 * For organizers we append "(N can't make it)" — non-organizers never
 * see per-name decline data per the declining-whispers ADR, and the
 * count is gated at the same boundary.
 */
function formatRsvpCountLine(args: {
  counts: { going: number; maybe: number; invited: number };
  isOrganizer: boolean;
  declinedCount: number;
}): string {
  const { counts, isOrganizer, declinedCount } = args;
  const base = M2_UI_STRINGS.dashboard_rsvp_count_template
    .replace("{going}", String(counts.going))
    .replace("{maybe}", String(counts.maybe))
    .replace("{invited}", String(counts.invited));

  if (isOrganizer && declinedCount > 0) {
    return (
      base +
      M2_UI_STRINGS.dashboard_rsvp_count_declined_suffix.replace(
        "{count}",
        String(declinedCount)
      )
    );
  }
  return base;
}
