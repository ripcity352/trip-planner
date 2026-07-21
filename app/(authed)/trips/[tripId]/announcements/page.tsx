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
 * #470 compact-top relayout: the in-feed poll module (organizer composer
 * + tap-to-vote cards, previously `PollsSection`/#390) moved OUT of this
 * page — it was the single largest contributor to the newest post
 * sitting ~2 screens down. In its place, a one-line "Dates are still up
 * for a vote →" link renders only while the trip's dates are undecided
 * (`isDatePollDecided`), pointing at `/dates`, which already owns the
 * celebrant-weighted date poll and is where the dashboard links too.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getTripMembers } from "@/lib/db/trips";
import { enrichAnnouncements, getAnnouncements } from "@/lib/db/announcements";
import {
  getReactionsForTrip,
  summarizeReactions,
} from "@/lib/db/announcement-reactions";
import { isDatePollDecided } from "@/lib/db/date-poll";
import { AnnouncementsFeed } from "@/components/trip/announcements/announcements-feed";
import { DatePollLinkRow } from "@/components/trip/announcements/date-poll-link-row";
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

  // #405-B: celebrant display name for the hide-from-celebrant badge. Derived
  // from the already-fetched members (no extra query) so organizers see
  // "Hidden from <name>" instead of the generic "Hidden from the celebrant".
  const celebrantName =
    members.find((m) => m.is_celebrant)?.display_name ?? null;

  // #405-C: the viewer's own display name, so a freshly-posted announcement
  // renders their name immediately instead of flashing "Someone".
  const viewerDisplayName =
    members.find((m) => m.user_id === user.id)?.display_name ?? null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M3_UI_STRINGS.announcements_heading}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{trip.name}</p>
      </header>

      <AnnouncementsFeed
        tripId={trip.id}
        isOrganizer={isOrganizer}
        initialAnnouncements={enrichedAnnouncements}
        memberUserMap={memberUserMap}
        reactionsByAnnouncement={reactionsByAnnouncement}
        celebrantName={celebrantName}
        viewerDisplayName={viewerDisplayName}
        datePollLinkRow={
          <DatePollLinkRow
            tripSlug={trip.slug}
            isDecided={isDatePollDecided(trip)}
          />
        }
      />
    </section>
  );
}
