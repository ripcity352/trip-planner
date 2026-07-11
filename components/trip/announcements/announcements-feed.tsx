"use client";

/**
 * AnnouncementsFeed — thin client wrapper composing the composer + list.
 *
 * F2: the composer and the list are siblings fed by the same Server
 * Component page, so neither can see the other's state. This wrapper
 * holds the ref that lets a successful `postAnnouncement` fold straight
 * into the list the instant it resolves, instead of waiting on the
 * Realtime channel (which #349 already flags as unreliable on the local
 * stack, and which should never be the *only* path to the poster seeing
 * their own post).
 */

import { useRef } from "react";

import { AnnouncementComposer } from "./announcement-composer";
import {
  AnnouncementList,
  type AnnouncementListHandle,
} from "./announcement-list";
import type {
  Announcement,
  AnnouncementReactionSummary,
} from "@/lib/db/types";

interface AnnouncementsFeedProps {
  tripId: string;
  isOrganizer: boolean;
  initialAnnouncements: Announcement[];
  memberUserMap: ReadonlyMap<string, string | null>;
  /** Per-announcement reaction aggregates (#389), keyed by announcement id. */
  reactionsByAnnouncement: Record<string, AnnouncementReactionSummary>;
  /** #405-B — celebrant display name for the hide-from-celebrant badge. */
  celebrantName?: string | null;
  /**
   * #405-C — the poster's own display name. The freshly-inserted row the
   * server action returns has no `authorDisplayName` (enrichment happens at
   * the page layer, not in the action), so folding it in raw flashed
   * "Someone · less than a minute ago" until a later render resolved it.
   * The poster IS the viewer, so we optimistically stamp their own name.
   */
  viewerDisplayName?: string | null;
}

export function AnnouncementsFeed({
  tripId,
  isOrganizer,
  initialAnnouncements,
  memberUserMap,
  reactionsByAnnouncement,
  celebrantName,
  viewerDisplayName,
}: AnnouncementsFeedProps) {
  const listRef = useRef<AnnouncementListHandle>(null);

  return (
    <>
      <div className="mb-6">
        <AnnouncementComposer
          tripId={tripId}
          isOrganizer={isOrganizer}
          onPosted={(announcement) =>
            listRef.current?.prepend({
              ...announcement,
              // #405-C: stamp the poster's own name so the card never flashes
              // "Someone". A real enriched value on the payload still wins.
              authorDisplayName:
                announcement.authorDisplayName ?? viewerDisplayName ?? null,
            })
          }
        />
      </div>

      <AnnouncementList
        ref={listRef}
        tripId={tripId}
        initialAnnouncements={initialAnnouncements}
        memberUserMap={memberUserMap}
        reactionsByAnnouncement={reactionsByAnnouncement}
        celebrantName={celebrantName}
      />
    </>
  );
}
