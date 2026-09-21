"use client";

/**
 * AddItemFormSheet — thin client shell that toggles AddItemForm visibility.
 *
 * A true bottom-sheet animation requires a library (framer-motion, etc.) which
 * is a new dependency (hard-stop per M3 constraints). We ship a simple
 * expand/collapse that is mobile-friendly at 375px and can be upgraded to an
 * animated sheet post-M3 without changing the data contract.
 *
 * The page Server Component passes tripId from the server; the form itself
 * handles the mutation + optimistic state.
 *
 * #644: `setOpen(false)` fired before `router.refresh()` — the sheet
 * unmounted first and the refresh looked like a silent failure until a
 * manual reload. Fix: reorder to `refresh()` then `setOpen(false)`, plus
 * retry the refresh via `useRefreshWithRetries` — see that hook for the
 * full root-cause writeup (a second, unrelated RSC fetch for this same
 * route can land after the explicit refresh and overwrite it with stale
 * data) and why a bundled `startTransition` was tried and rejected
 * (reproduced an intermittent *permanent* hang, worse than the original
 * bug).
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { AddItemForm } from "@/components/trip/itinerary/add-item-form";
import { useRefreshWithRetries } from "@/lib/hooks/use-refresh-with-retries";

export interface AddItemFormSheetProps {
  tripId: string;
  /** IANA timezone from `trips.timezone` — passed from the page level. */
  tripTimezone: string;
  /** #484: trip date bounds — forwarded to AddItemForm's range check. */
  tripStartsAt?: string | null;
  tripEndsAt?: string | null;
  /** Any member can add a plan; only organizers get the visibility picker
   * (non-organizer plans are always 'everyone'). */
  isOrganizer: boolean;
}

export function AddItemFormSheet({
  tripId,
  tripTimezone,
  tripStartsAt,
  tripEndsAt,
  isOrganizer,
}: AddItemFormSheetProps) {
  const [open, setOpen] = React.useState(false);
  const refreshWithRetries = useRefreshWithRetries();

  const handleSuccess = () => {
    // #644: refresh (+ retries) before close — see file header.
    refreshWithRetries();
    setOpen(false);
  };

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "focus-visible:ring-ring w-full rounded-xs border border-dashed border-border bg-muted/40 py-3 text-sm font-medium text-muted-foreground",
            "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          )}
        >
          {M3_UI_STRINGS.itinerary_addItem_cta}
        </button>
      ) : (
        <div className="rounded-md border border-border bg-card p-4 shadow-sm">
          <AddItemForm
            tripId={tripId}
            tripTimezone={tripTimezone}
            tripStartsAt={tripStartsAt}
            tripEndsAt={tripEndsAt}
            isOrganizer={isOrganizer}
            onSuccess={handleSuccess}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
