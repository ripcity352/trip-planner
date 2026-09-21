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
 * saved, list didn't update) until a manual reload. Three fixes were
 * tried and stress-tested (150+ runs total) before landing here — see
 * task-2-report.md for the full trail and exact run counts:
 *   1. Bundling both calls in one `startTransition` — reproduced an
 *      intermittent *permanent* hang (worse than the original bug).
 *   2. Just reordering (`refresh()` then `setOpen(false)`, no
 *      transition) — reduced the failure rate a lot but still dropped
 *      the refresh intermittently.
 *   3. `startTransition` around `refresh()` only, closing on an effect
 *      gated by `isPending` — still dropped it intermittently.
 * All three share a root cause outside this component's control: a
 * second, unrelated RSC fetch for this same route — the bottom-nav
 * "plans" tab's own `<Link>` prefetch, since it points at the page the
 * viewer is already on — sometimes lands in the client Router Cache
 * AFTER the explicit refresh and overwrites it with stale data (see the
 * `prefetch={false}` fix on the active tab in `BottomTabBar.tsx`, which
 * removes the race's source but isn't fully sufficient on its own).
 * The fix here is belt-and-suspenders: close the sheet right after the
 * first `refresh()` (simple, always reliable), then fire a second,
 * delayed `refresh()` ~600ms later as a self-healing retry — by then any
 * competing prefetch response has already landed and lost the race, so
 * the second refresh is guaranteed to be the last write.
 *
 * No animation library needed — simple show/hide, matches AddItemFormSheet.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { EditItemForm } from "./edit-item-form";
import type { ItineraryItem } from "@/lib/db/types";

/** #644: see file header — gives a racing prefetch response time to land
 * and lose before each self-healing retry refresh fires. Two retries
 * (not one) because a single delayed retry still intermittently lost
 * the race under stress-testing. */
const REFRESH_RETRY_DELAYS_MS = [700, 2000];

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
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleSuccess = (_item: ItineraryItem) => {
    // #644: refresh, close, then delayed retry refreshes — see file header.
    router.refresh();
    setOpen(false);
    for (const delay of REFRESH_RETRY_DELAYS_MS) {
      window.setTimeout(() => router.refresh(), delay);
    }
  };

  const handleDeleted = () => {
    router.refresh();
    setOpen(false);
    for (const delay of REFRESH_RETRY_DELAYS_MS) {
      window.setTimeout(() => router.refresh(), delay);
    }
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
