"use client";

/**
 * EditItemFormSheet — client shell that toggles EditItemForm. Rendered by
 * ItemCard for an organizer (any item) or a member on their OWN item
 * (isOrganizer controls the visibility picker inside EditItemForm).
 *
 * Renders an "Edit" button in the ItemCard header (top-right corner).
 * On click, replaces the card content inline with the EditItemForm.
 * On success or delete, calls `onUpdated`/`onDeleted` which triggers
 * router.refresh() in the parent ItemCardShell so the server-rendered
 * list stays in sync.
 *
 * #644: `setOpen(false)` fired before `router.refresh()` — the sheet
 * unmounted first and the refresh looked like a silent failure (row was
 * saved, list didn't update) until a manual reload. Fix: reorder to
 * `refresh()` then `setOpen(false)` via `useRefreshWithRetries` (a
 * single refresh since Next 16.3 — see that hook for the history of the
 * retry hedge and the full root-cause writeup) and why a
 * bundled `startTransition` was tried and rejected (reproduced an
 * intermittent *permanent* hang, worse than the original bug).
 *
 * No animation library needed — simple show/hide, matches AddItemFormSheet.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { EditItemForm } from "./edit-item-form";
import type { ItineraryItem } from "@/lib/db/types";
import { useRefreshWithRetries } from "@/lib/hooks/use-refresh-with-retries";

export interface EditItemFormSheetProps {
  item: ItineraryItem;
  /** IANA timezone from `trips.timezone` — passed from the page level. */
  tripTimezone: string;
  /** Only organizers get the visibility picker in the mounted form. */
  isOrganizer?: boolean;
  className?: string;
}

export function EditItemFormSheet({
  item,
  tripTimezone,
  isOrganizer = false,
  className,
}: EditItemFormSheetProps) {
  const [open, setOpen] = React.useState(false);
  const refreshWithRetries = useRefreshWithRetries();

  const handleSuccess = (_item: ItineraryItem) => {
    // #644: refresh before close — see file header.
    refreshWithRetries();
    setOpen(false);
  };

  const handleDeleted = () => {
    refreshWithRetries();
    setOpen(false);
  };

  if (open) {
    return (
      <div className={cn("rounded-md border border-border bg-card p-4 shadow-sm", className)}>
        <EditItemForm
          item={item}
          tripTimezone={tripTimezone}
          isOrganizer={isOrganizer}
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
          onDeleted={handleDeleted}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "focus-visible:ring-ring rounded-xs border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground",
        "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        className
      )}
    >
      {M3_UI_STRINGS.itinerary_edit_item_cta}
    </button>
  );
}
