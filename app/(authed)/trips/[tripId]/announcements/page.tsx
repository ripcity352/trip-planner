/**
 * `/trips/[tripId]/announcements` — announcements feed (#79).
 *
 * Server Component. Resolves the trip by slug (the URL segment is the slug,
 * not the UUID — same pattern as the dashboard page). Fetches announcements
 * server-side for the initial render, then passes to AnnouncementList which
 * subscribes to Realtime for live updates.
 *
 * Organizer check is done via `is_trip_organizer` RPC, consistent with the
 * dashboard and itinerary pages. The result is passed to AnnouncementComposer,
 * which hides itself entirely for non-organizers.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug } from "@/lib/db/trips";
import { getAnnouncements } from "@/lib/db/announcements";
import { AnnouncementList } from "@/components/trip/announcements/announcement-list";
import { AnnouncementComposer } from "@/components/trip/announcements/announcement-composer";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

type PageProps = {
  // Next.js 16 — dynamic segment params are async.
  params: Promise<{ tripId: string }>;
};

export default async function AnnouncementsPage({ params }: PageProps) {
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

  // Fan out: announcements + organizer check in parallel
  const [announcements, organizerCheck] = await Promise.all([
    getAnnouncements(supabase, trip.id),
    supabase.rpc("is_trip_organizer", { p_trip_id: trip.id }),
  ]);

  const isOrganizer = organizerCheck.data === true;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M3_UI_STRINGS.announcements_heading}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{trip.name}</p>
      </header>

      {/* Organizer composer sits above the feed */}
      <div className="mb-6">
        <AnnouncementComposer tripId={trip.id} isOrganizer={isOrganizer} />
      </div>

      <AnnouncementList
        tripId={trip.id}
        initialAnnouncements={announcements}
      />
    </section>
  );
}
