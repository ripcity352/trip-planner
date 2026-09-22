"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * #644: a single `router.refresh()` fired before the form sheet closes.
 *
 * History: on Next 16.2 an explicit refresh could lose a race against a
 * second, unrelated RSC fetch for the same route (the bottom-nav "plans"
 * tab's own `<Link>` prefetch landing in the client Router Cache after the
 * refresh and overwriting it with stale data). The original fix paired
 * `prefetch={false}` on the exactly-current bottom-nav tab (see
 * `BottomTabBar`) with a 700/2000ms retry hedge here. On Next 16.3.3 the
 * hedge is no longer needed — the router's default `staleTimes.dynamic`
 * is 0 and an 18× back-to-back prod-build stress loop of the #644
 * regression test passes without the retries (evidence on #644). The
 * refresh-before-close ordering and the `prefetch={false}` guard are
 * still load-bearing; this hook remains the single seam for both call
 * sites (`AddItemFormSheet`/`EditItemFormSheet`) should a hedge ever be
 * needed again.
 */
export function useRefreshWithRetries(): () => void {
  const router = useRouter();
  return React.useCallback(() => {
    router.refresh();
  }, [router]);
}
