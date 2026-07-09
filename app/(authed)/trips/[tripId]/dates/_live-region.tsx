"use client";

/**
 * Client wrapper that mounts `<PulsePoll>` for the date-poll
 * resource. Composes the celebrant view OR the member view based
 * on `isCelebrant`, and the organizer-only add-window form below.
 *
 * The page (Server Component) is responsible for fetching the
 * initial view-model and the viewer's role; this wrapper is the
 * realtime-aware re-renderer.
 */

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import {
  filterMemberVisible,
  getDatePollViewModel,
  rankCandidates,
} from "@/lib/db/date-poll";
import { MAX_CANDIDATES_PER_TRIP } from "@/lib/actions/date-poll-constants";
import type { DatePollCandidateView } from "@/lib/db/types";

import { PulsePoll } from "@/components/trip/pulse-poll";
import { CelebrantView } from "./_celebrant-view";
import { MemberView } from "./_member-view";
import { AddWindowForm } from "./_add-window-form";

interface LiveRegionProps {
  tripId: string;
  isCelebrant: boolean;
  isOrganizer: boolean;
  viewerTripMemberId: string;
  initialRows: ReadonlyArray<DatePollCandidateView>;
}

export function LiveRegion({
  tripId,
  isCelebrant,
  isOrganizer,
  viewerTripMemberId,
  initialRows,
}: LiveRegionProps) {
  // The fetch is RLS-aware via the browser Supabase client.
  // `useCallback` is essential — PulsePoll's effect depends on a
  // stable function identity.
  const fetchData = React.useCallback(async (): Promise<
    ReadonlyArray<DatePollCandidateView>
  > => {
    const supabase = createBrowserClient();
    const rows = await getDatePollViewModel(
      supabase,
      tripId,
      viewerTripMemberId
    );
    return rows;
  }, [tripId, viewerTripMemberId]);

  const subscribeTableConfig = React.useMemo(
    () => [
      { table: "date_poll_candidates", filter: `trip_id=eq.${tripId}` },
      // celebrant_marks doesn't carry trip_id directly — broad
      // subscription is fine because RLS filters on read and the
      // refetch is RLS-aware.
      { table: "date_poll_celebrant_marks" },
      { table: "date_poll_votes" },
    ],
    [tripId]
  );

  return (
    <PulsePoll<ReadonlyArray<DatePollCandidateView>>
      channelKey={`date-poll-${tripId}`}
      initialData={initialRows}
      fetchData={fetchData}
      subscribeTableConfig={subscribeTableConfig}
      render={(rows, isStale, refetch) => {
        const ranked = rankCandidates(rows);
        const visible = isCelebrant ? ranked : filterMemberVisible(ranked);
        return (
          <div className="flex flex-col gap-4">
            {isStale ? (
              <Badge variant="outline">
                {M2_UI_STRINGS.datePoll_unsynced_badge}
              </Badge>
            ) : null}
            {isCelebrant ? (
              <CelebrantView candidates={visible} onMutated={refetch} />
            ) : (
              <MemberView candidates={visible} onMutated={refetch} />
            )}
            {isOrganizer || isCelebrant ? (
              <AddWindowForm
                tripId={tripId}
                atCap={rows.length >= MAX_CANDIDATES_PER_TRIP}
                onMutated={refetch}
              />
            ) : null}
          </div>
        );
      }}
    />
  );
}
