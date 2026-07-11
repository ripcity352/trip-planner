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
import type { PollView } from "@/lib/db/types";

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
}

export function PollsSection({
  tripId,
  isOrganizer,
  viewerTripMemberId,
  initialViews,
}: PollsSectionProps) {
  // `useCallback` is essential — PulsePoll's effect depends on a stable
  // function identity.
  const fetchData = React.useCallback(async (): Promise<
    ReadonlyArray<PollView>
  > => {
    const supabase = createBrowserClient();
    return getPollsViewModel(supabase, tripId, viewerTripMemberId);
  }, [tripId, viewerTripMemberId]);

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
