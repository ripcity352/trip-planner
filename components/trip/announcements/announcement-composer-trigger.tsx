"use client";

/**
 * AnnouncementComposerTrigger — #470 compact-top relayout.
 *
 * The composer defaults to a one-line "Post an update" prompt (Partiful
 * input-trigger voice, not a SaaS placeholder) instead of the full form.
 * Tapping it expands `<AnnouncementComposer>` in place — same disclosure
 * idiom as `MemberFlagPicker` (#399): `aria-expanded` + `aria-controls` +
 * conditional render, no animation (reduced-motion safe by construction).
 *
 * The composer itself is untouched — only its default presentation
 * changes here. A successful post collapses the trigger back down so the
 * freshly-posted card is immediately visible below without the full form
 * eating the top of the viewport.
 */

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { AnnouncementComposer } from "./announcement-composer";
import type { Announcement } from "@/lib/db/types";

interface AnnouncementComposerTriggerProps {
  tripId: string;
  isOrganizer: boolean;
  onPosted?: (announcement: Announcement) => void;
}

export function AnnouncementComposerTrigger({
  tripId,
  isOrganizer,
  onPosted,
}: AnnouncementComposerTriggerProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Non-organizers never see a composer, collapsed or expanded — same
  // rule as AnnouncementComposer itself. Rule 11: an affordance, not a
  // gate — they get a quiet reader line in its place, not nothing.
  if (!isOrganizer) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {M3_UI_STRINGS.announcements_reader_only_caption}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className={cn(
          "w-full rounded-md border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {M3_UI_STRINGS.announcements_compose_cta}
      </button>
    );
  }

  return (
    <div id={panelId} className="flex flex-col gap-2">
      <AnnouncementComposer
        tripId={tripId}
        isOrganizer={isOrganizer}
        onPosted={(announcement) => {
          onPosted?.(announcement);
          setOpen(false);
        }}
      />
      <button
        type="button"
        aria-expanded={true}
        aria-controls={panelId}
        onClick={() => setOpen(false)}
        className="self-start text-sm text-muted-foreground underline underline-offset-2"
      >
        {M3_UI_STRINGS.announcements_compose_cancel}
      </button>
    </div>
  );
}
