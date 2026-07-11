/**
 * `/trips/[tripId]/announcements` — announcements feed (#79).
 *
 * Server Component. Resolves the trip by slug (the URL segment is the slug,
 * not the UUID — same pattern as the dashboard page). Fetches announcements
 * server-side for the initial render, then passes to AnnouncementsFeed
 * (composer + list) which subscribes to Realtime for live updates AND
 * (F2) folds the poster's own announcement in immediately on success.
 *
 * Organizer check is done via `is_trip_organizer` RPC, consistent with the
 * dashboard and itinerary pages. The result is passed to AnnouncementsFeed,
 * which hides the composer entirely for non-organizers.
 *
 * #390: decision polls live on this page too — PollsSection (organizer
 * composer + tap-to-vote cards, PulsePoll-backed) renders above the
 * announcements feed. RLS scopes what each viewer sees.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getTripMembers } from "@/lib/db/trips";
import { enrichAnnouncements, getAnnouncements } from "@/lib/db/announcements";
import {
  getReactionsForTrip,
  summarizeReactions,
} from "@/lib/db/announcement-reactions";
import { getPollsViewModel } from "@/lib/db/polls";
import { AnnouncementsFeed } from "@/components/trip/announcements/announcements-feed";
import { PollsSection } from "@/components/trip/polls/polls-section";
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

  // Fan out: announcements + reactions + members + organizer check in
  // parallel. Members are needed to build the memberUserMap for author
  // attribution (#239); reactions feed the per-card ack row (#389).
  const [announcements, reactions, members, organizerCheck] =
    await Promise.all([
      getAnnouncements(supabase, trip.id),
      getReactionsForTrip(supabase, trip.id),
      getTripMembers(supabase, trip.id),
      supabase.rpc("is_trip_organizer", { p_trip_id: trip.id }),
    ]);

  const isOrganizer = organizerCheck.data === true;

  // The caller's own seat (trip_members.id) — drives the "mine"
  // highlight on reaction chips. null only if the membership row is
  // missing, in which case the row renders read-only counts.
  const myMemberId =
    members.find((m) => m.user_id === user.id)?.id ?? null;
  const reactionsByAnnouncement = summarizeReactions(reactions, myMemberId);

  // #390: the viewer's own member row (for vote attribution + own-choice
  // highlight). Undefined for a non-member viewer — read-only polls.
  const viewerTripMemberId = members.find((m) => m.user_id === user.id)?.id;
  const pollViews = await getPollsViewModel(
    supabase,
    trip.id,
    viewerTripMemberId
  );

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

      <div className="mb-6">
        <PollsSection
          tripId={trip.id}
          isOrganizer={isOrganizer}
          viewerTripMemberId={viewerTripMemberId}
          initialViews={pollViews}
        />
      </div>

      <AnnouncementsFeed
        tripId={trip.id}
        isOrganizer={isOrganizer}
        initialAnnouncements={enrichedAnnouncements}
        memberUserMap={memberUserMap}
        reactionsByAnnouncement={reactionsByAnnouncement}
      />
    </section>
  );
}
