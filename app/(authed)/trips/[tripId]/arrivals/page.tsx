/**
 * `/trips/[tripId]/arrivals` — arrivals manifest page (#37).
 *
 * Server Component. Resolves the trip, fetches all travel legs via
 * `getTravelLegsByTrip`, resolves the viewer's `trip_member_id` so the
 * UI can gate edit affordances to the leg owner, then hands off to
 * `<ArrivalsManifest>`.
 *
 * Access: any authenticated trip member. Non-members → 404 (RLS
 * returns empty on trip lookup; `notFound()` fires).
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getViewerMember, getTripMembers } from "@/lib/db/trips";
import { getTravelLegsByTrip } from "@/lib/db/travel-legs";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ArrivalsManifest } from "@/components/trip/arrivals/arrivals-manifest";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function ArrivalsPage({ params }: PageProps) {
  const { tripId: slug } = await params;
  const supabase = await createClient();

  const trip = await getTripBySlug(supabase, slug);
  if (!trip) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const viewer = await getViewerMember(supabase, trip.id, user.id);
  if (!viewer) {
    notFound();
  }

  // Fan out: legs + all trip members in parallel
  const [legs, tripMembers] = await Promise.all([
    getTravelLegsByTrip(supabase, trip.id),
    getTripMembers(supabase, trip.id),
  ]);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M3_UI_STRINGS.arrivals_heading}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{trip.name}</p>
      </header>

      <ArrivalsManifest
        tripId={trip.id}
        legs={legs}
        myTripMemberId={viewer.id}
        tripMembers={tripMembers}
      />
    </section>
  );
}
