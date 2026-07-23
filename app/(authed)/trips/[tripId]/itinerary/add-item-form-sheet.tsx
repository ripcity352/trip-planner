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
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { AddItemForm } from "@/components/trip/itinerary/add-item-form";

export interface AddItemFormSheetProps {
  tripId: string;
  /** IANA timezone from `trips.timezone` — passed from the page level. */
  tripTimezone: string;
  /** #484: trip date bounds — forwarded to AddItemForm's range check. */
  tripStartsAt?: string | null;
  tripEndsAt?: string | null;
}

export function AddItemFormSheet({
  tripId,
  tripTimezone,
  tripStartsAt,
  tripEndsAt,
}: AddItemFormSheetProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleSuccess = () => {
    setOpen(false);
    // Trigger a route refresh so the new item appears in the server-rendered
    // DaySection list without a full page reload.
    router.refresh();
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
            onSuccess={handleSuccess}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
