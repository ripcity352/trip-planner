"use client";

/**
 * PollsSection (#390) — mounts `<PulsePoll>` (reused unchanged, per the
 * issue) for the trip's decision polls on the announcements page.
 *
 * The page (Server Component) fetches the initial view-model and the
 * viewer's role/member id; this wrapper is the realtime-aware
 * re-renderer composing the organizer composer + poll cards.
 */

import * as React from "react";

import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { getPollsViewModel } from "@/lib/db/polls";
import type { PollComment, PollView } from "@/lib/db/types";

import { PulsePoll } from "@/components/trip/pulse-poll";
import { PollComposer } from "./poll-composer";
import { PollCard } from "./poll-card";

interface PollsSectionProps {
  tripId: string;
  isOrganizer: boolean;
  /** The viewer's trip_members.id — undefined for a viewer without a
   * seat (renders read-only). */
  viewerTripMemberId: string | undefined;
  initialViews: ReadonlyArray<PollView>;
  // #620 — poll comments (part 1/3 of #616). Server-side fold, keyed by
  // poll_id — NOT threaded through PulsePoll's `fetchData` (comments
  // refresh via `router.refresh()` inside PollCommentThread, #349).
  commentsByPoll: Readonly<Record<string, readonly PollComment[]>>;
  // #621 — trip_members.id -> display_name, plain object. Rebuilt into
  // a Map here (client-side, doesn't cross the RSC boundary) for
  // getPollsViewModel's write-in attribution on every refetch.
  memberDisplayNameById: Readonly<Record<string, string | null>>;
  viewerDisplayName: string | null;
  now: Date;
}

export function PollsSection({
  tripId,
  isOrganizer,
  viewerTripMemberId,
  initialViews,
  commentsByPoll,
  memberDisplayNameById,
  viewerDisplayName,
  now,
}: PollsSectionProps) {
  // `useCallback` is essential — PulsePoll's effect depends on a stable
  // function identity.
  const fetchData = React.useCallback(async (): Promise<
    ReadonlyArray<PollView>
  > => {
    const supabase = createBrowserClient();
    const memberMap = new Map(Object.entries(memberDisplayNameById));
    return getPollsViewModel(supabase, tripId, viewerTripMemberId, memberMap);
  }, [tripId, viewerTripMemberId, memberDisplayNameById]);

  const subscribeTableConfig = React.useMemo(
    () => [
      { table: "polls", filter: `trip_id=eq.${tripId}` },
      // options/votes don't carry trip_id — broad subscription is fine
      // because RLS filters on read and the refetch is RLS-aware (same
      // shape as the date-poll live region).
      { table: "poll_options" },
      { table: "poll_votes" },
    ],
    [tripId]
  );

  return (
    <PulsePoll<ReadonlyArray<PollView>>
      channelKey={`polls-${tripId}`}
      initialData={initialViews}
      fetchData={fetchData}
      subscribeTableConfig={subscribeTableConfig}
      render={(views, _isStale, refetch) => {
        if (views.length === 0 && !isOrganizer) return null;
        return (
          <div className="flex flex-col gap-3">
            <PollComposer
              tripId={tripId}
              isOrganizer={isOrganizer}
              onCreated={refetch}
            />
            {views.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {views.map((view) => (
                  <li key={view.poll.id}>
                    <PollCard
                      view={view}
                      canVote={viewerTripMemberId !== undefined}
                      onMutated={refetch}
                      comments={commentsByPoll[view.poll.id] ?? []}
                      viewerTripMemberId={viewerTripMemberId}
                      isViewerOrganizer={isOrganizer}
                      viewerDisplayName={viewerDisplayName}
                      now={now}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      }}
    />
  );
}
