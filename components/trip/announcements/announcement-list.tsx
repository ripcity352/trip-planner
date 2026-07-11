"use client";

/**
 * AnnouncementList — realtime-subscribing announcement feed.
 *
 * Subscribes to `announcements:{tripId}` on mount via
 * `subscribeToAnnouncements` and removes the channel on unmount.
 * Renders pinned announcements first, then chronological (newest first).
 *
 * W1c (#239): accepts `memberUserMap` (user_id → display_name) so that both
 * the initial server-rendered list and the realtime INSERT payloads surface
 * the author's name. The map is passed through to `subscribeToAnnouncements`
 * for realtime enrichment, and each initial announcement already has
 * `authorDisplayName` resolved by `getAnnouncements` at the page layer.
 *
 * F2: exposes an imperative `prepend` handle so the composer (a sibling,
 * not a parent) can fold in the poster's own announcement the instant
 * `postAnnouncement` succeeds — the actor's own view must not depend on
 * the Realtime channel landing the INSERT. See
 * `components/trip/announcements/announcements-feed.tsx`.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { ensureRealtimeAuth } from "@/lib/supabase/realtime-auth";
import { subscribeToAnnouncements } from "@/lib/db/announcements";
import { AnnouncementCard } from "./announcement-card";
import { ReactionRow } from "./reaction-row";
import { EMPTY_STATES } from "@/lib/copy/empty-states";
import type {
  Announcement,
  AnnouncementReactionSummary,
} from "@/lib/db/types";

interface AnnouncementListProps {
  tripId: string;
  initialAnnouncements: Announcement[];
  /**
   * Map of user_id → display_name for all trip members. Used to resolve
   * authorDisplayName on realtime INSERT payloads. Passed through directly
   * to subscribeToAnnouncements. Built server-side from getTripMembers().
   */
  memberUserMap: ReadonlyMap<string, string | null>;
  /**
   * Per-announcement reaction aggregates (#389), keyed by announcement id.
   * Built server-side via summarizeReactions. Announcements without an
   * entry (incl. realtime arrivals) render an empty reaction row.
   */
  reactionsByAnnouncement?: Record<string, AnnouncementReactionSummary>;
  /** #405-B — celebrant display name for the hide-from-celebrant badge. */
  celebrantName?: string | null;
}

export interface AnnouncementListHandle {
  /** Fold a locally-known announcement into the feed (F2). */
  prepend: (announcement: Announcement) => void;
}

/** Sort pinned first, then by created_at descending (newest first). */
function sortAnnouncements(items: Announcement[]): Announcement[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export const AnnouncementList = forwardRef<
  AnnouncementListHandle,
  AnnouncementListProps
>(function AnnouncementList(
  {
    tripId,
    initialAnnouncements,
    memberUserMap,
    reactionsByAnnouncement = {},
    celebrantName,
  },
  ref
) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(
    () => sortAnnouncements(initialAnnouncements)
  );

  useImperativeHandle(
    ref,
    () => ({
      prepend: (announcement: Announcement) => {
        setAnnouncements((prev) =>
          // De-dupe against a Realtime arrival that beat us here.
          prev.some((a) => a.id === announcement.id)
            ? prev
            : sortAnnouncements([announcement, ...prev])
        );
      },
    }),
    []
  );

  useEffect(() => {
    const supabase = createClient();

    // #349: the subscription must join with authenticated claims. On a
    // fresh page load supabase-js never pushes the session token to the
    // realtime connection (INITIAL_SESSION is skipped), so subscribing
    // eagerly joins with anon claims and RLS silently filters every
    // postgres_changes INSERT — the channel still reports SUBSCRIBED.
    // Await the auth upgrade, THEN join. `ensureRealtimeAuth` never
    // rejects; `cancelled` covers an unmount racing the upgrade.
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      channel = subscribeToAnnouncements(
        supabase,
        tripId,
        (newAnnouncement) => {
          setAnnouncements((prev) =>
            // Prepend then re-sort so pinned state is honoured. De-dupe
            // against our own optimistic `prepend()` (F2) landing first.
            prev.some((a) => a.id === newAnnouncement.id)
              ? prev
              : sortAnnouncements([newAnnouncement, ...prev])
          );
        },
        memberUserMap
      );
    });

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [tripId, memberUserMap]);

  if (announcements.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {EMPTY_STATES.announcements}
      </p>
    );
  }

  return (
    <ol
      className="flex flex-col gap-3"
      aria-live="polite"
      aria-relevant="additions"
    >
      {announcements.map((a) => {
        const reactions = reactionsByAnnouncement[a.id];
        return (
          <li key={a.id}>
            <AnnouncementCard
              announcement={a}
              authorDisplayName={a.authorDisplayName}
              celebrantName={celebrantName}
              reactionsSlot={
                <ReactionRow
                  announcementId={a.id}
                  initialCounts={reactions?.counts ?? {}}
                  initialMine={reactions?.mine ?? []}
                />
              }
            />
          </li>
        );
      })}
    </ol>
  );
});
