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
import { EMPTY_STATES } from "@/lib/copy/empty-states";
import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/lib/db/types";

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
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Your trips</h1>
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
            Start a trip
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
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
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
