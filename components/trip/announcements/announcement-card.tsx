/**
 * AnnouncementCard — leaf display component for a single announcement.
 *
 * Server-friendly (no "use client" needed). Renders body, author,
 * relative time, pinned badge, and non-default visibility badge.
 */

import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { hideFromCelebrantBadge } from "@/lib/utils/celebrant-badge";
import { linkifyText } from "@/lib/utils/linkify-text";
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
  /**
   * #405-B — the trip celebrant's display name, threaded from the page so
   * the `hide_from_celebrant` badge names them ("Hidden from Mike Groom")
   * instead of the generic register-leak "Hidden from the celebrant".
   */
  celebrantName?: string | null;
  /**
   * Interactive reaction row (#389), rendered inside the card below the
   * footer. A slot (not a hardwired import) so this leaf stays
   * server-friendly and presentation-only.
   */
  reactionsSlot?: ReactNode;
}

/**
 * Non-celebrant visibility labels. `hide_from_celebrant` is NOT here — it
 * goes through `hideFromCelebrantBadge` so it can name the celebrant (#405-B).
 */
const VISIBILITY_LABEL: Partial<Record<Announcement["visibility"], string>> = {
  organizers_only: M3_UI_STRINGS.announcements_badge_organizers_only,
  custom: M3_UI_STRINGS.announcements_badge_custom,
};

export function AnnouncementCard({
  announcement,
  authorDisplayName,
  celebrantName,
  reactionsSlot,
}: AnnouncementCardProps) {
  const relativeTime = formatDistanceToNow(new Date(announcement.created_at), {
    addSuffix: true,
  });

  const visibilityLabel =
    announcement.visibility === "hide_from_celebrant"
      ? hideFromCelebrantBadge(celebrantName)
      : announcement.visibility !== "everyone"
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

      {/* Body — whitespace-pre-wrap preserves stored newlines (#464);
          linkifyText makes http(s)/www URLs tappable (#469). The tokenizer
          passes whitespace through untouched, so the two compose. */}
      <p
        data-testid="announcement-body"
        className="whitespace-pre-wrap text-sm leading-relaxed"
      >
        {linkifyText(announcement.body).map((token, index) =>
          token.type === "link" ? (
            <a
              // Position-keyed: the token list is derived, static per render.
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary underline underline-offset-2"
            >
              {token.value}
            </a>
          ) : (
            <span key={index}>{token.value}</span>
          )
        )}
      </p>

      {/* Footer: author + relative time */}
      <footer className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {authorDisplayName ?? M3_UI_STRINGS.announcements_author_fallback}
        </span>
        <span aria-hidden>·</span>
        <time dateTime={announcement.created_at}>{relativeTime}</time>
      </footer>

      {/* Reaction row (#389) — the ack loop. */}
      {reactionsSlot}
    </article>
  );
}
