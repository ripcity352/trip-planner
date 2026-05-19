"use client";

/**
 * `<PulsePoll>` — reusable Supabase Realtime poll primitive (M2 #76).
 *
 * The first consumer is the celebrant-weighted date poll
 * (`app/(authed)/trips/[tripId]/dates`). Future Pulse-Poll-style
 * features (lodging vote, time-of-day vote, gear poll) follow the
 * same shape — so this component is generic on `T`, the view-model
 * payload, and takes the table-subscription config as a prop.
 *
 * Behavior (Appendix A.3 of `notes/m2-execution-plan.md`):
 *
 *   1. Initial paint uses `initialData` from the server (Server
 *      Component fetches the view-model and passes it in).
 *   2. On mount: open `supabase.channel(channelKey)`, subscribe to
 *      `postgres_changes` for every entry in `subscribeTableConfig`.
 *   3. On any change event from those tables: invoke `fetchData()`
 *      to refresh — server-action-backed, RLS-aware, single round
 *      trip. Local cache stays in sync with the server, never the
 *      other way around.
 *   4. On `CLOSED` channel state: mark `isStale`; the renderer can
 *      surface a small "syncing…" indicator if it wants.
 *   5. On `SUBSCRIBED` after a `CLOSED`: refetch once so we pick up
 *      any changes we missed during the outage.
 *
 * Aggregate-only by ADR. The `revealVoterNames` prop is reserved
 * for a future voter-opt-in surface — currently it's threaded
 * through to the renderer unchanged but not consumed by anything
 * in Wave 3.
 *
 * Cache scope: in-memory only. A page reload drops it. The server
 * idempotency check is the load-bearing guarantee — see Appendix
 * A.3 for the trade-off.
 */

import * as React from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/browser";

// =============================================================
// Types
// =============================================================

export type PulsePollSubscriptionTable = {
  /** The Postgres table name to subscribe to (in the `public` schema). */
  table: string;
  /**
   * Optional PostgREST-style filter for `postgres_changes`. Example:
   *   `"trip_id=eq.<uuid>"` to scope to one trip.
   *
   * Leaving this undefined subscribes to every row change on the
   * table — appropriate when RLS already scopes visibility (which is
   * the case for every table in this app).
   */
  filter?: string;
};

export interface PulsePollProps<T> {
  /**
   * A logical channel name. Should be unique per resource (e.g.
   * `date-poll-${tripId}`) so concurrent subscriptions on the same
   * trip dedupe across tabs.
   */
  channelKey: string;

  /**
   * Initial data, server-rendered. Used for the first paint; replaced
   * on every refetch.
   */
  initialData: T;

  /**
   * Refetch the data. Called on every realtime event and on
   * reconnect. Must be RLS-aware and stable across renders
   * (`useCallback` at the call site).
   */
  fetchData: () => Promise<T>;

  /**
   * Array of `postgres_changes` subscriptions to wire up.
   *
   * **IMPORTANT — must be stable across renders.** This value is in the
   * subscription effect's dependency array; passing an inline literal
   * `[{ table: "..." }]` will rebuild the Realtime channel on every
   * render, spamming the server. Wrap in `useMemo` at the call site
   * (see `_live-region.tsx` for the canonical example).
   *
   * As a defensive fallback we also hash this value into a stable key
   * (`JSON.stringify`) and depend on the hash inside the effect — so
   * even an unstable caller doesn't tear the channel down. The hash
   * is cheap (small array of `{ table, filter? }`) and closes the
   * footgun cleanly.
   */
  subscribeTableConfig: ReadonlyArray<PulsePollSubscriptionTable>;

  /**
   * Renderer. Receives the latest data plus an `isStale` flag (true
   * when we've seen a channel disconnect or a pending refetch).
   */
  render: (data: T, isStale: boolean) => React.ReactNode;

  /**
   * Reserved for the future voter-opt-in per-name visibility surface.
   * Wave 3 ships aggregate-only; the prop exists so callers can future-
   * proof their renderer signature without a breaking change later.
   */
  revealVoterNames?: boolean;

  /**
   * Injection seam for tests. Production callers should NOT pass a
   * client — the default `createClient()` (browser) is correct.
   */
  __supabaseClient?: SupabaseClient;
}

// =============================================================
// Component
// =============================================================

export function PulsePoll<T>({
  channelKey,
  initialData,
  fetchData,
  subscribeTableConfig,
  render,
  __supabaseClient,
}: PulsePollProps<T>) {
  const [data, setData] = React.useState<T>(initialData);
  const [isStale, setIsStale] = React.useState<boolean>(false);
  // Track whether we've ever seen a CLOSED → SUBSCRIBED cycle so the
  // post-reconnect refetch only fires after a real disconnect (not on
  // the first successful subscribe).
  const wasDisconnectedRef = React.useRef(false);

  // Defensive: hash the subscription config to a stable key so an
  // unstable caller doesn't rebuild the channel on every render. The
  // JSDoc on `subscribeTableConfig` already mandates `useMemo` at the
  // call site; this is the belt-and-braces backstop.
  const subscribeTableConfigKey = React.useMemo(
    () => JSON.stringify(subscribeTableConfig),
    [subscribeTableConfig]
  );

  React.useEffect(() => {
    const client = __supabaseClient ?? createClient();
    const channel: RealtimeChannel = client.channel(channelKey);

    // Refetch-on-change. We don't try to merge the payload into the
    // existing state — refetching is simpler and RLS-aware. The
    // bandwidth cost is bounded by the small view-model size.
    const refresh = async () => {
      try {
        const next = await fetchData();
        setData(next);
        setIsStale(false);
      } catch (err) {
        // Don't surface refetch errors visually — the next event will
        // try again, and the previous data is still useful.
        console.error("[pulse-poll] refetch failed:", err);
      }
    };

    // Subscribe to every configured table. `postgres_changes` with
    // event '*' covers INSERT / UPDATE / DELETE in one binding.
    for (const sub of subscribeTableConfig) {
      const filterConfig: {
        event: "*";
        schema: "public";
        table: string;
        filter?: string;
      } = {
        event: "*",
        schema: "public",
        table: sub.table,
      };
      if (sub.filter !== undefined) {
        filterConfig.filter = sub.filter;
      }
      // The Supabase types for `postgres_changes` are a wide union; the
      // narrow shape we use here is correct but the inferred parameter
      // type collides. Cast at the boundary; behavior is unchanged.
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        filterConfig,
        () => {
          // Mark stale immediately so the renderer can flicker an
          // indicator while the refetch is in flight.
          setIsStale(true);
          void refresh();
        }
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (wasDisconnectedRef.current) {
          // Post-reconnect refetch — we may have missed events while
          // the channel was down.
          wasDisconnectedRef.current = false;
          void refresh();
        }
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        wasDisconnectedRef.current = true;
        setIsStale(true);
      }
    });

    return () => {
      // Best-effort teardown. `removeChannel` is the supported API; if
      // it errors during HMR or fast-refresh we swallow it.
      try {
        client.removeChannel(channel);
      } catch (err) {
        console.error("[pulse-poll] removeChannel failed:", err);
      }
    };
    // The dependency array binds to props that genuinely affect the
    // subscription. `fetchData` is expected to be stable
    // (`useCallback` at the call site); we include it so a swap
    // re-binds. `subscribeTableConfigKey` is the hashed form of
    // `subscribeTableConfig` — depending on the hash (not the array
    // identity) means a caller that hands us a new-but-equivalent
    // array doesn't trigger an unnecessary teardown. The lint disable
    // is intentional: we explicitly want hash equality, not reference
    // equality, on the subscription config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, fetchData, subscribeTableConfigKey, __supabaseClient]);

  return <>{render(data, isStale)}</>;
}
