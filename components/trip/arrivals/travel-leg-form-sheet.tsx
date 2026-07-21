"use client";

/**
 * TravelLegFormSheet — toggle wrapper around TravelLegForm.
 *
 * Add mode (no `leg` prop): renders TWO CTAs (#477) — "Getting there"
 * (inbound) and "Heading home" (outbound). Tapping one expands the form
 * inline for that section. No actual Sheet primitive needed — inline
 * expansion at 375px is cleaner than a bottom sheet for this surface.
 *
 * Edit mode (`leg` prop present): renders an "Edit" button per-leg that
 * expands the form pre-populated with the existing leg data; the section
 * is derived from `leg.direction` inside TravelLegForm.
 *
 * Server Component wrapping is impossible here because we need useState
 * for the open/closed toggle — this is a leaf client component.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { TravelLegForm } from "./travel-leg-form";
import type { TravelLeg, TravelLegDirection } from "@/lib/db/types";

export interface TravelLegFormSheetProps {
  tripId: string;
  /** Present for edit mode; omit for add mode. */
  leg?: TravelLeg;
  /** IANA timezone from `trips.timezone` — forwarded to TravelLegForm (#382). */
  tripTimezone: string;
  /** Called after a successful save or delete to trigger a page refresh. */
  onMutated?: () => void;
}

export function TravelLegFormSheet({
  tripId,
  leg,
  tripTimezone,
  onMutated,
}: TravelLegFormSheetProps) {
  // Add mode: which section's CTA opened the form; null = closed.
  // Edit mode: any non-null value opens (direction comes from the leg).
  const [openDirection, setOpenDirection] =
    React.useState<TravelLegDirection | null>(null);
  const isEditMode = !!leg;

  const handleSuccess = () => {
    setOpenDirection(null);
    onMutated?.();
  };

  const handleCancel = () => {
    setOpenDirection(null);
  };

  if (openDirection) {
    return (
      <div className="rounded-md border border-border bg-card px-4 py-4">
        <TravelLegForm
          tripId={tripId}
          leg={leg}
          direction={openDirection}
          tripTimezone={tripTimezone}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  if (isEditMode) {
    return (
      <button
        type="button"
        onClick={() => setOpenDirection(leg.direction)}
        className={cn(
          "focus-visible:ring-ring h-8 rounded-xs border border-border bg-muted px-3 text-xs font-medium text-muted-foreground",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {M3_UI_STRINGS.arrivals_edit_cta}
      </button>
    );
  }

  // #477: the add flow starts from two section CTAs.
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => setOpenDirection("inbound")}
        className={cn(
          "focus-visible:ring-ring h-11 flex-1 rounded-xs bg-primary px-4 text-sm font-medium text-primary-foreground",
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "hover:bg-primary/90"
        )}
      >
        {M3_UI_STRINGS.arrivals_add_inbound_cta}
      </button>
      <button
        type="button"
        onClick={() => setOpenDirection("outbound")}
        className={cn(
          "focus-visible:ring-ring h-11 flex-1 rounded-xs border border-border bg-muted px-4 text-sm font-medium text-muted-foreground",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {M3_UI_STRINGS.arrivals_add_outbound_cta}
      </button>
    </div>
  );
}
