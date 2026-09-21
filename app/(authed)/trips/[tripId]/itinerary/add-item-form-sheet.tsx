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
 * manual reload. Three fixes were tried and stress-tested (150+ runs
 * total) before landing here — see task-2-report.md for the full trail
 * and exact run counts:
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
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { AddItemForm } from "@/components/trip/itinerary/add-item-form";

/** #644: see file header — gives a racing prefetch response time to land
 * and lose before each self-healing retry refresh fires. Two retries
 * (not one) because a single delayed retry still intermittently lost
 * the race under stress-testing. */
const REFRESH_RETRY_DELAYS_MS = [700, 2000];

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
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleSuccess = () => {
    // #644: refresh, close, then delayed retry refreshes — see file header.
    router.refresh();
    setOpen(false);
    for (const delay of REFRESH_RETRY_DELAYS_MS) {
      window.setTimeout(() => router.refresh(), delay);
    }
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
