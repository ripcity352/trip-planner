import Link from "next/link";
import { format } from "date-fns";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listMyTrips } from "@/lib/db/trips";
import { EMPTY_STATES, EMPTY_STATE_CTAS, M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/lib/db/types";

// Defensive fallback: if the CTA palette is ever stripped down, the
// page still renders a sensible label rather than an empty button.
const TRIPS_MINE_CTA_FALLBACK = "Start a trip";

/**
 * `/trips` — list of trips the signed-in user is a member of. The
 * authed gate runs in the parent `(authed)/layout.tsx`, so by the time
 * we render here `auth.uid()` is set and RLS does the rest of the work.
 *
 * Empty state pulls from the `trips_mine` copy palette (PR-template
 * checklist item: no inline literals).
 *
 * /trips/new and /trips/<slug> ship in Wave 2a; linking to them now
 * will 404 in dev, which is expected behavior for this slice.
 */
export default async function TripsPage() {
  const supabase = await createClient();
  const trips = await listMyTrips(supabase);

  if (trips.length === 0) {
    return <EmptyState />;
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <TripsListHeader />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {trips.map((trip) => (
          <li key={trip.id}>
            <TripCard trip={trip} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Header strip for the populated trip list: page heading + "Start a trip"
 * CTA. Exported as a named component so it can be unit-tested in isolation
 * (TripsPage is an async Server Component; the header strip is sync).
 *
 * CTA placement: top of list, inline with the heading, right-aligned.
 * Matches the visual rhythm of the existing <h1> + grid pattern without
 * introducing a floating action button (FAB would require "use client" for
 * fixed positioning; overkill for a single CTA at this screen size).
 */
export function TripsListHeader() {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Your trips</h1>
      <Link
        href="/trips/new"
        className={buttonVariants({ variant: "default", size: "sm" })}
      >
        {M3_UI_STRINGS.tripsList_newTrip_cta}
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-12 text-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{EMPTY_STATES.trips_mine}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/trips/new"
            className={buttonVariants({ variant: "default", size: "lg" })}
          >
            {EMPTY_STATE_CTAS.trips_mine ?? TRIPS_MINE_CTA_FALLBACK}
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.slug}`}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
    >
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle>{trip.name}</CardTitle>
          <CardDescription>{formatTripDates(trip)}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

/**
 * "May 19 – May 22" when both dates are present, "May 19" when only a
 * start date, empty string when neither — we render nothing rather
 * than a placeholder ("TBD") because the visual void is the honest
 * signal that dates aren't picked yet.
 */
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
  return "";
}
