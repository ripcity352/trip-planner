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
 * #470 compact-top relayout (amended): the #390 decision-poll surface
 * (`PollsSection`) stays on this page — it has no other home — but now
 * sits behind a one-line `PollsDisclosure` row directly under the
 * pinned banner instead of rendering its full card stack at the top of
 * the feed. Below it, a one-line "Dates are still up for a vote →"
 * link (`DatePollLinkRow`) renders while the trip's dates are
 * undecided (`isDatePollDecided`), pointing at `/dates` — the
 * celebrant-weighted date poll's home, where the dashboard links too.
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
import { getPollsViewModel } from "@/lib/db/polls";
import {
  enrichPollComments,
  getCommentsForTrip as getPollCommentsForTrip,
} from "@/lib/db/poll-comments";
import { AnnouncementsFeed } from "@/components/trip/announcements/announcements-feed";
import { DatePollLinkRow } from "@/components/trip/announcements/date-poll-link-row";
import { PollsDisclosure } from "@/components/trip/polls/polls-disclosure";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { PollComment } from "@/lib/db/types";

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

  // Fan out: announcements + reactions + members + organizer check +
  // poll comments in parallel. Members are needed to build the
  // memberUserMap for author attribution (#239); reactions feed the
  // per-card ack row (#389); poll comments (#620) fold onto each
  // PollView server-side, same shape as the shopping-list social layer.
  const [announcements, reactions, members, organizerCheck, pollComments] =
    await Promise.all([
      getAnnouncements(supabase, trip.id),
      getReactionsForTrip(supabase, trip.id),
      getTripMembers(supabase, trip.id),
      supabase.rpc("is_trip_organizer", { p_trip_id: trip.id }),
      getPollCommentsForTrip(supabase, trip.id),
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
  // #621 — trip_members.id -> display_name, built once and reused for
  // BOTH poll comment attribution (below) and write-in option
  // attribution. Built ahead of getPollsViewModel so the initial
  // render already carries resolved "suggested by" names.
  const memberMapById = new Map<string, string | null>(
    members.map((m) => [m.id, m.display_name])
  );
  const pollViews = await getPollsViewModel(
    supabase,
    trip.id,
    viewerTripMemberId,
    memberMapById
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

  // #405-B: celebrant display name for the hide-from-celebrant badge. Derived
  // from the already-fetched members (no extra query) so organizers see
  // "Hidden from <name>" instead of the generic "Hidden from the celebrant".
  const celebrantName =
    members.find((m) => m.is_celebrant)?.display_name ?? null;

  // #405-C: the viewer's own display name, so a freshly-posted announcement
  // renders their name immediately instead of flashing "Someone".
  const viewerDisplayName =
    members.find((m) => m.user_id === user.id)?.display_name ?? null;

  // #620 — poll comments. enrichPollComments expects a memberMap keyed
  // by trip_members.id (the author_trip_member_id FK target) — NOT
  // user_id — same contract as the shopping-list comments precedent
  // (memberMapById built above, ahead of getPollsViewModel).
  const enrichedPollComments = enrichPollComments(pollComments, memberMapById);
  // Single-pass O(n) group-by (the naive `reduce` + object-spread version
  // is O(n²) — it copies every key seen so far on every comment). The
  // `Map` here is a function-scoped build accumulator, discarded once
  // converted to the plain object PollCard/PollsSection expect — not
  // shared or passed-in state, so appending to it in place doesn't run
  // afoul of the no-mutation rule.
  const commentsByPollMap = new Map<string, PollComment[]>();
  for (const comment of enrichedPollComments) {
    const existing = commentsByPollMap.get(comment.poll_id);
    if (existing) {
      existing.push(comment);
    } else {
      commentsByPollMap.set(comment.poll_id, [comment]);
    }
  }
  const commentsByPoll = Object.fromEntries(commentsByPollMap);

  const now = new Date();

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
        pollsSlot={
          <PollsDisclosure
            tripId={trip.id}
            isOrganizer={isOrganizer}
            viewerTripMemberId={viewerTripMemberId}
            initialViews={pollViews}
            commentsByPoll={commentsByPoll}
            // #621 — plain object, not a Map: Server->Client props must
            // be serializable (same reason commentsByPoll above is a
            // Record, not a Map). PollsSection rebuilds a Map from this
            // client-side for getPollsViewModel's refetch, so a
            // realtime-refetched write-in still resolves its
            // suggester's name instead of falling back to "Someone".
            memberDisplayNameById={Object.fromEntries(memberMapById)}
            viewerDisplayName={viewerDisplayName}
            now={now}
          />
        }
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
