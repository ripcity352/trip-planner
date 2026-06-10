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
import { getTripBySlug, getTripMembers } from "@/lib/db/trips";
import { enrichAnnouncements, getAnnouncements } from "@/lib/db/announcements";
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

  // Fan out: announcements + members + organizer check in parallel.
  // Members are needed to build the memberUserMap for author attribution (#239).
  const [announcements, members, organizerCheck] = await Promise.all([
    getAnnouncements(supabase, trip.id),
    getTripMembers(supabase, trip.id),
    supabase.rpc("is_trip_organizer", { p_trip_id: trip.id }),
  ]);

  const isOrganizer = organizerCheck.data === true;

  // Build user_id → display_name map for author attribution.
  // Keyed by user_id (not trip_member.id) because created_by references auth.users.
  const memberUserMap = new Map<string, string | null>(
    members
      .filter((m) => m.user_id !== null)
      .map((m) => [m.user_id as string, m.display_name])
  );

  // #250: the one post-fetch enrichment path — getAnnouncements returns flat
  // rows so the fetch can run in parallel with getTripMembers (the map source).
  const enrichedAnnouncements = enrichAnnouncements(announcements, memberUserMap);

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
        initialAnnouncements={enrichedAnnouncements}
        memberUserMap={memberUserMap}
      />
    </section>
  );
}
