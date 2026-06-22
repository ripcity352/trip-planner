/**
 * AnnouncementCard — leaf display component for a single announcement.
 *
 * Server-friendly (no "use client" needed). Renders body, author,
 * relative time, pinned badge, and non-default visibility badge.
 */

import { formatDistanceToNow } from "date-fns";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Announcement } from "@/lib/db/types";

interface AnnouncementCardProps {
  announcement: Announcement;
  /**
   * Resolved display name of the author (enriched at the data layer or page layer).
   * When absent or null, falls back to M3_UI_STRINGS.announcements_author_fallback
   * ("Someone") — NOT roster_member_fallback_name ("Guest"), which is the wrong
   * context for an anonymous announcement author.
   */
  authorDisplayName?: string | null;
}

/** Visibility labels for non-default values — sourced from `M3_UI_STRINGS`. */
const VISIBILITY_LABEL: Partial<Record<Announcement["visibility"], string>> = {
  organizers_only: M3_UI_STRINGS.announcements_badge_organizers_only,
  hide_from_celebrant: M3_UI_STRINGS.announcements_badge_hide_celebrant,
  custom: M3_UI_STRINGS.announcements_badge_custom,
};

export function AnnouncementCard({
  announcement,
  authorDisplayName,
}: AnnouncementCardProps) {
  const relativeTime = formatDistanceToNow(new Date(announcement.created_at), {
    addSuffix: true,
  });

  const visibilityLabel =
    announcement.visibility !== "everyone"
      ? VISIBILITY_LABEL[announcement.visibility]
      : null;

  return (
    <article className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3">
      {/* Top row: pinned badge + visibility badge */}
      {(announcement.pinned || visibilityLabel) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {announcement.pinned && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {M3_UI_STRINGS.announcements_badge_pinned}
            </span>
          )}
          {visibilityLabel && (
            <span
              data-testid="visibility-badge"
              className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {visibilityLabel}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <p className="text-sm leading-relaxed">{announcement.body}</p>

      {/* Footer: author + relative time */}
      <footer className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>
          {authorDisplayName ?? M3_UI_STRINGS.announcements_author_fallback}
        </span>
        <span aria-hidden>·</span>
        <time dateTime={announcement.created_at}>{relativeTime}</time>
      </footer>
    </article>
  );
}
