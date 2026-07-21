/**
 * DatePollLinkRow — #470 compact-top relayout.
 *
 * Replaces the old in-feed poll embed with a one-line link to `/dates`,
 * the celebrant-weighted date poll's real home (the dashboard already
 * links there too — see `[tripId]/page.tsx`'s "Dates poll —
 * urgency-proportional placement" card). Renders nothing once the dates
 * are locked in; `isDecided` is `isDatePollDecided(trip)` computed by
 * the Server Component page, same gate the dashboard uses.
 *
 * Server-friendly (no "use client") — it's a static link, no state.
 */

import Link from "next/link";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

interface DatePollLinkRowProps {
  tripSlug: string;
  /** `isDatePollDecided(trip)` — true once starts_at/ends_at are both set. */
  isDecided: boolean;
}

export function DatePollLinkRow({ tripSlug, isDecided }: DatePollLinkRowProps) {
  if (isDecided) return null;

  return (
    <Link
      href={`/trips/${tripSlug}/dates`}
      className="block rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
    >
      {M3_UI_STRINGS.announcements_datePoll_link}
    </Link>
  );
}
