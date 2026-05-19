/**
 * `/trips/[tripId]` — trip dashboard skeleton.
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
 * Wave 2a ships the skeleton + invite-link area. Glanceable RSVP
 * counts wire up in Wave 2b.
 */

import { format } from "date-fns";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTripBySlug } from "@/lib/db/trips";
import { createClient } from "@/lib/supabase/server";
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
            <CardTitle>Who&apos;s in</CardTitle>
            <CardDescription>
              {/* Wave 2b wires the live count. The placeholder is a
                  voice-tested holding string, not "Loading…" or
                  "Coming soon" — neither would land at dinner. */}
              RSVPs roll in here.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Share the link</CardTitle>
            <CardDescription>
              Pop a link in the group chat. People click it, they&apos;re in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Invite issuance UI ships in the next slice — for now you can
              mint links from the database directly.
            </p>
          </CardContent>
        </Card>
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
  return "Dates not locked in yet.";
}
