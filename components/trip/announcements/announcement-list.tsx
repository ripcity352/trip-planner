"use client";

/**
 * AnnouncementList — realtime-subscribing announcement feed.
 *
 * Subscribes to `announcements:{tripId}` on mount via
 * `subscribeToAnnouncements` and removes the channel on unmount.
 *
 * #470 compact-top relayout: pinned announcements no longer render as
 * full cards at the top of the feed — they collapse into
 * `<PinnedAnnouncementBanner>` (one line, tap to expand) so the newest
 * *regular* post is reachable without scrolling past a pinned stack.
 * The regular feed below is chronological, newest first. The optional
 * date-poll link row (also #470) renders between the banner and the
 * feed — same slot the pinned card used to occupy.
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
 *
 * #393: also owns the organizer delete/pin mutation + optimistic
 * bookkeeping (both `handleDelete`/`handlePin` below) since this is the
 * one place that holds the `announcements` array both the pinned banner
 * and the regular feed derive from via `useMemo` — a card-local optimistic
 * update would desync the two views. The imperative handle grows a
 * `remove` method alongside `prepend` for symmetry, though delete today
 * goes through `handleDelete`, not the ref (the card triggers it inline).
 * Non-goal: the Realtime channel only wires INSERT (see
 * `lib/db/announcements.ts`), so a delete/pin by one organizer does not
 * live-update other connected viewers — they see it on next
 * fetch/revalidate. Not expanded to postgres_changes UPDATE/DELETE here.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { ensureRealtimeAuth } from "@/lib/supabase/realtime-auth";
import { subscribeToAnnouncements } from "@/lib/db/announcements";
import {
  deleteAnnouncementAction,
  pinAnnouncementAction,
} from "@/lib/actions/announcements";
import { callAction } from "@/lib/ui/call-action";
import type { ErrorKey } from "@/lib/copy/errors";
import { AnnouncementCard } from "./announcement-card";
import { AnnouncementCardActions } from "./announcement-card-actions";
import { ReactionRow } from "./reaction-row";
import { PinnedAnnouncementBanner } from "./pinned-announcement-banner";
import { EMPTY_STATES } from "@/lib/copy/empty-states";
import type {
  Announcement,
  AnnouncementReactionSummary,
} from "@/lib/db/types";

interface AnnouncementListProps {
  tripId: string;
  /** #393 — gates the per-card overflow menu (delete + pin/unpin). */
  isOrganizer: boolean;
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
  /**
   * #470 (amended) — the decision-poll disclosure row
   * (`PollsDisclosure`, #390 surface), slotted directly under the
   * pinned banner. `null`/undefined renders nothing.
   */
  pollsSlot?: ReactNode;
  /**
   * #470 — server-computed date-poll "still open" link row, slotted
   * between the polls row and the regular feed. `null` when there's
   * nothing to show (no live date poll).
   */
  datePollLinkRow?: ReactNode;
}

export interface AnnouncementListHandle {
  /** Fold a locally-known announcement into the feed (F2). */
  prepend: (announcement: Announcement) => void;
  /** Drop a locally-known announcement from the feed (#393). */
  remove: (announcementId: string) => void;
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
    isOrganizer,
    initialAnnouncements,
    memberUserMap,
    reactionsByAnnouncement = {},
    celebrantName,
    pollsSlot = null,
    datePollLinkRow = null,
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
      remove: (announcementId: string) => {
        setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
      },
    }),
    []
  );

  // #393 — organizer delete: optimistic removal, rollback on failure.
  // `announcements` is captured per-call so the rollback restores the
  // exact pre-mutation snapshot even if other updates land in between.
  const handleDelete = useCallback(
    async (announcementId: string): Promise<ErrorKey | null> => {
      const snapshot = announcements;
      setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
      const result = await callAction(() =>
        deleteAnnouncementAction(
          { tripId, announcementId },
          crypto.randomUUID()
        )
      );
      if (!result.ok) {
        setAnnouncements(snapshot);
        return result.errorKey;
      }
      return null;
    },
    [announcements, tripId]
  );

  // #393 — organizer pin/unpin: desired-end-state action, optimistic
  // flip + re-sort, rollback on failure.
  const handlePin = useCallback(
    async (announcementId: string, pinned: boolean): Promise<ErrorKey | null> => {
      const snapshot = announcements;
      setAnnouncements((prev) =>
        sortAnnouncements(
          prev.map((a) => (a.id === announcementId ? { ...a, pinned } : a))
        )
      );
      const result = await callAction(() =>
        pinAnnouncementAction({ announcementId, pinned }, crypto.randomUUID())
      );
      if (!result.ok) {
        setAnnouncements(snapshot);
        return result.errorKey;
      }
      return null;
    },
    [announcements]
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

  // #470: split once per render — pinned float into the banner, the rest
  // stay in the chronological (already newest-first, per sortAnnouncements)
  // feed below.
  const { pinned, regular } = useMemo(() => {
    const pinnedItems = announcements.filter((a) => a.pinned);
    const regularItems = announcements.filter((a) => !a.pinned);
    return { pinned: pinnedItems, regular: regularItems };
  }, [announcements]);

  const reactionsSlotFor = (announcementId: string) => {
    const reactions = reactionsByAnnouncement[announcementId];
    return (
      <ReactionRow
        announcementId={announcementId}
        initialCounts={reactions?.counts ?? {}}
        initialMine={reactions?.mine ?? []}
      />
    );
  };

  // #393 — organizer-only; must cover BOTH the regular feed and the
  // pinned banner's expanded cards (the exact bug the issue names).
  const actionsSlotFor = (announcementId: string, pinned: boolean) => {
    if (!isOrganizer) return null;
    return (
      <AnnouncementCardActions
        pinned={pinned}
        onPin={(next) => handlePin(announcementId, next)}
        onDelete={() => handleDelete(announcementId)}
      />
    );
  };

  if (announcements.length === 0) {
    // The polls row + date-poll link still render on an empty feed —
    // an unanswered poll is exactly why someone opens an empty page.
    return (
      <div className="flex flex-col gap-3">
        {pollsSlot}
        {datePollLinkRow}
        <p className="text-muted-foreground text-sm">
          {EMPTY_STATES.announcements}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PinnedAnnouncementBanner
        pinned={pinned}
        celebrantName={celebrantName}
        reactionsSlotFor={reactionsSlotFor}
        actionsSlotFor={actionsSlotFor}
      />

      {pollsSlot}

      {datePollLinkRow}

      {regular.length > 0 ? (
        <ol
          className="flex flex-col gap-3"
          aria-live="polite"
          aria-relevant="additions"
        >
          {regular.map((a) => (
            <li key={a.id}>
              <AnnouncementCard
                announcement={a}
                authorDisplayName={a.authorDisplayName}
                celebrantName={celebrantName}
                reactionsSlot={reactionsSlotFor(a.id)}
                actionsSlot={actionsSlotFor(a.id, a.pinned)}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
});
