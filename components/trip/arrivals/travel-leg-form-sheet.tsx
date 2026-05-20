"use client";

/**
 * TravelLegFormSheet — toggle wrapper around TravelLegForm.
 *
 * Add mode (no `leg` prop): renders an "Add a leg" CTA that expands into
 * the form inline. No actual Sheet primitive needed — inline expansion
 * at 375px is cleaner than a bottom sheet for this surface.
 *
 * Edit mode (`leg` prop present): renders an "Edit" button per-leg that
 * expands the form pre-populated with the existing leg data.
 *
 * Server Component wrapping is impossible here because we need useState
 * for the open/closed toggle — this is a leaf client component.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { TravelLegForm } from "./travel-leg-form";
import type { TravelLeg } from "@/lib/db/types";

export interface TravelLegFormSheetProps {
  tripId: string;
  /** Present for edit mode; omit for add mode. */
  leg?: TravelLeg;
  /** Called after a successful save or delete to trigger a page refresh. */
  onMutated?: () => void;
}

export function TravelLegFormSheet({
  tripId,
  leg,
  onMutated,
}: TravelLegFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const isEditMode = !!leg;

  const handleSuccess = () => {
    setIsOpen(false);
    onMutated?.();
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  if (isOpen) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-4">
        <TravelLegForm
          tripId={tripId}
          leg={leg}
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
        onClick={() => setIsOpen(true)}
        className={cn(
          "focus-visible:ring-ring h-8 rounded-full border border-border bg-muted px-3 text-xs font-medium text-muted-foreground",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {M3_UI_STRINGS.arrivals_edit_cta}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className={cn(
        "focus-visible:ring-ring h-11 w-full rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground",
        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        "hover:bg-primary/90"
      )}
    >
      {M3_UI_STRINGS.arrivals_addLeg_cta}
    </button>
  );
}
