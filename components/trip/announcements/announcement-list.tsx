"use client";

/**
 * AnnouncementList — realtime-subscribing announcement feed.
 *
 * Subscribes to `announcements:{tripId}` on mount via
 * `subscribeToAnnouncements` and removes the channel on unmount.
 * Renders pinned announcements first, then chronological (newest first).
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { subscribeToAnnouncements } from "@/lib/db/announcements";
import { AnnouncementCard } from "./announcement-card";
import { EMPTY_STATES } from "@/lib/copy/empty-states";
import type { Announcement } from "@/lib/db/types";

interface AnnouncementListProps {
  tripId: string;
  initialAnnouncements: Announcement[];
}

/** Sort pinned first, then by created_at descending (newest first). */
function sortAnnouncements(items: Announcement[]): Announcement[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function AnnouncementList({
  tripId,
  initialAnnouncements,
}: AnnouncementListProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(
    () => sortAnnouncements(initialAnnouncements)
  );

  useEffect(() => {
    const supabase = createClient();

    const channel = subscribeToAnnouncements(
      supabase,
      tripId,
      (newAnnouncement) => {
        setAnnouncements((prev) =>
          // Prepend then re-sort so pinned state is honoured
          sortAnnouncements([newAnnouncement, ...prev])
        );
      }
    );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

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
          <AnnouncementCard announcement={a} />
        </li>
      ))}
    </ol>
  );
}
