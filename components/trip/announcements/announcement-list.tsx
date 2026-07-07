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
import { createClient } from "@/lib/supabase/browser";
import { subscribeToAnnouncements } from "@/lib/db/announcements";
import { AnnouncementCard } from "./announcement-card";
import { EMPTY_STATES } from "@/lib/copy/empty-states";
import type { Announcement } from "@/lib/db/types";

interface AnnouncementListProps {
  tripId: string;
  initialAnnouncements: Announcement[];
  /**
   * Map of user_id → display_name for all trip members. Used to resolve
   * authorDisplayName on realtime INSERT payloads. Passed through directly
   * to subscribeToAnnouncements. Built server-side from getTripMembers().
   */
  memberUserMap: ReadonlyMap<string, string | null>;
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
  { tripId, initialAnnouncements, memberUserMap },
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

    const channel = subscribeToAnnouncements(
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

    return () => {
      supabase.removeChannel(channel);
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
      {announcements.map((a) => (
        <li key={a.id}>
          <AnnouncementCard
            announcement={a}
            authorDisplayName={a.authorDisplayName}
          />
        </li>
      ))}
    </ol>
  );
});
