"use client";

/**
 * PinnedAnnouncementBanner — #470 compact-top relayout.
 *
 * Pinned posts used to render as full `<AnnouncementCard>`s at the top of
 * the feed, pushing the newest regular post ~2 screens down. This
 * collapses them into a single one-line banner (pin glyph + first line of
 * the most recent pin, truncated with the #488 min-w-0/truncate guard so
 * a long body can't force horizontal scroll) directly under the composer
 * trigger. Tapping it expands every pinned post in place — same
 * disclosure idiom as `MemberFlagPicker` (#399): `aria-expanded` +
 * `aria-controls` + conditional render, no animation.
 *
 * Multiple pins are rare (this is a banner, not a second feed) but not
 * disallowed — the collapsed line shows the most recent pin's text plus
 * a count when there's more than one; expanding reveals the full set,
 * newest first.
 */

import { useId, useState, type ReactNode } from "react";
import { Pin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { AnnouncementCard } from "./announcement-card";
import type { Announcement } from "@/lib/db/types";

interface PinnedAnnouncementBannerProps {
  /** Pinned announcements, newest first. Renders nothing when empty. */
  pinned: ReadonlyArray<Announcement>;
  celebrantName?: string | null;
  /** Per-announcement reaction row, keyed by announcement id (#389). */
  reactionsSlotFor: (announcementId: string) => ReactNode;
}

export function PinnedAnnouncementBanner({
  pinned,
  celebrantName,
  reactionsSlotFor,
}: PinnedAnnouncementBannerProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (pinned.length === 0) return null;

  const headline = pinned[0].body.split("\n")[0];
  const expandAria = open
    ? M3_UI_STRINGS.announcements_pinned_banner_collapse_aria
    : M3_UI_STRINGS.announcements_pinned_banner_expand_aria;

  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={expandAria}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-left",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        <Pin aria-hidden strokeWidth={1.75} className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <span data-testid="pinned-banner-headline" className="min-w-0 flex-1 truncate text-sm">
          {headline}
        </span>
        {pinned.length > 1 ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {M3_UI_STRINGS.announcements_pinned_banner_count_template.replace(
              "{count}",
              String(pinned.length)
            )}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-3 border-t border-border px-4 py-3">
          {pinned.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              authorDisplayName={announcement.authorDisplayName}
              celebrantName={celebrantName}
              reactionsSlot={reactionsSlotFor(announcement.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
