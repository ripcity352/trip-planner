"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * #644: `router.refresh()` can lose a race against a second, unrelated RSC
 * fetch for the same route — on the itinerary page specifically, the
 * bottom-nav "plans" tab's own `<Link>` prefetch (it points at the page the
 * viewer is already on) can land in the client Router Cache AFTER an
 * explicit refresh and overwrite it with stale data. See
 * `AddItemFormSheet`/`EditItemFormSheet` for the call sites and
 * `BottomTabBar`'s `prefetch={false}` on the active tab, which removes that
 * specific race source but isn't sufficient alone. Retrying the refresh
 * after a short delay lets any competing fetch land and lose first — by
 * the second retry, the explicit refresh is guaranteed to be the last
 * write. Two delays (not one) because a single retry still intermittently
 * lost the race under stress-testing.
 *
 * Centralizes the retry-timer bookkeeping so call sites don't each
 * reimplement (and leak) it:
 *   - pending timer ids live in a ref, cleared on unmount
 *   - calling the returned function again clears any timers the previous
 *     call scheduled, so a rapid double-submit can't stack retries and
 *     fire a stray refresh of whatever route the user has since navigated
 *     to (router.refresh() is app-scoped, not tied to this component)
 */
const REFRESH_RETRY_DELAYS_MS = [700, 2000];

export function useRefreshWithRetries(): () => void {
  const router = useRouter();
  const timeoutIdsRef = React.useRef<number[]>([]);

  const clearPending = React.useCallback(() => {
    for (const id of timeoutIdsRef.current) {
      window.clearTimeout(id);
    }
    timeoutIdsRef.current = [];
  }, []);

  React.useEffect(() => clearPending, [clearPending]);

  return React.useCallback(() => {
    clearPending();
    router.refresh();
    timeoutIdsRef.current = REFRESH_RETRY_DELAYS_MS.map((delay) =>
      window.setTimeout(() => router.refresh(), delay)
    );
  }, [router, clearPending]);
}
