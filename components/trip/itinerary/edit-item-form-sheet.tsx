"use client";

/**
 * EditItemFormSheet — organizer-only client shell that toggles EditItemForm.
 *
 * Renders an "Edit" button in the ItemCard header (top-right corner).
 * On click, replaces the card content inline with the EditItemForm.
 * On success or delete, calls `onUpdated`/`onDeleted` which triggers
 * router.refresh() in the parent ItemCardShell so the server-rendered
 * list stays in sync.
 *
 * No animation library needed — simple show/hide, matches AddItemFormSheet.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { EditItemForm } from "./edit-item-form";
import type { ItineraryItem } from "@/lib/db/types";

export interface EditItemFormSheetProps {
  item: ItineraryItem;
  className?: string;
}

export function EditItemFormSheet({ item, className }: EditItemFormSheetProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleSuccess = (_item: ItineraryItem) => {
    setOpen(false);
    router.refresh();
  };

  const handleDeleted = () => {
    setOpen(false);
    router.refresh();
  };

  if (open) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
        <EditItemForm
          item={item}
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
        "focus-visible:ring-ring rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground",
        "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        className
      )}
    >
      {M3_UI_STRINGS.itinerary_edit_item_cta}
    </button>
  );
}
