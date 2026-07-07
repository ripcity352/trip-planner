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
import type { Announcement } from "@/lib/db/types";

interface AnnouncementsFeedProps {
  tripId: string;
  isOrganizer: boolean;
  initialAnnouncements: Announcement[];
  memberUserMap: ReadonlyMap<string, string | null>;
}

export function AnnouncementsFeed({
  tripId,
  isOrganizer,
  initialAnnouncements,
  memberUserMap,
}: AnnouncementsFeedProps) {
  const listRef = useRef<AnnouncementListHandle>(null);

  return (
    <>
      <div className="mb-6">
        <AnnouncementComposer
          tripId={tripId}
          isOrganizer={isOrganizer}
          onPosted={(announcement) => listRef.current?.prepend(announcement)}
        />
      </div>

      <AnnouncementList
        ref={listRef}
        tripId={tripId}
        initialAnnouncements={initialAnnouncements}
        memberUserMap={memberUserMap}
      />
    </>
  );
}
