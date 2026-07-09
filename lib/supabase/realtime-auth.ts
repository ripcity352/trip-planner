/**
 * Realtime auth upgrade for browser-side subscriptions (#349).
 *
 * Root cause: supabase-js 2.108's `_handleTokenChanged` only forwards
 * SIGNED_IN / TOKEN_REFRESHED to `realtime.setAuth()` — never
 * INITIAL_SESSION. On every fresh page load the Realtime connection
 * therefore joins its channels with **anon** JWT claims; the
 * `TO authenticated` RLS on the subscribed tables fail-closed-filters
 * every `postgres_changes` frame while the channel happily reports
 * SUBSCRIBED. Silent, deterministic, and invisible to the stale badge.
 *
 * Fix contract — call `await ensureRealtimeAuth(client)` before ANY
 * `channel.subscribe()` on a browser client:
 *
 *   - The no-arg `realtime.setAuth()` pulls the current session token
 *     through the client's own accessToken callback (supabase-js wires
 *     it to `auth.getSession()`, anon-key fallback). Passing a manual
 *     token instead would PIN it and disable the callback (see
 *     RealtimeClient.setAuth docs) — no-arg keeps supabase-js's own
 *     SIGNED_IN / TOKEN_REFRESHED propagation working afterwards.
 *   - A one-time (per client) INITIAL_SESSION listener re-runs setAuth
 *     so a session that lands after subscribe still upgrades
 *     already-joined channels (Realtime accepts live `access_token`
 *     pushes).
 *   - Never throws: a failed token upgrade must not block the
 *     subscription itself — worst case is the pre-fix behavior.
 *
 * The `accessToken` client option was considered and rejected: setting
 * it makes every `supabase.auth.*` access throw (third-party-auth
 * mode), and this app's login flows live on `supabase.auth`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Clients that already have the INITIAL_SESSION listener attached.
 * `createBrowserClient` returns a singleton in the browser, so this
 * normally holds one entry; keyed per client so test fakes and any
 * future non-singleton client are wired independently, without leaks.
 */
const wiredClients = new WeakSet<SupabaseClient>();

/**
 * Ensure the Realtime connection carries the authenticated access
 * token. Await this BEFORE `channel.subscribe()` at every browser-side
 * subscription site (`subscribeToAnnouncements` callers, `PulsePoll`).
 * Safe to call repeatedly; resolves without throwing on failure.
 */
export async function ensureRealtimeAuth(
  client: SupabaseClient
): Promise<void> {
  try {
    if (!wiredClients.has(client)) {
      wiredClients.add(client);
      client.auth.onAuthStateChange((event) => {
        // Only INITIAL_SESSION: SIGNED_IN / TOKEN_REFRESHED already
        // reach realtime.setAuth via supabase-js's _handleTokenChanged,
        // and SIGNED_OUT is downgraded there too.
        if (event === "INITIAL_SESSION") {
          void client.realtime.setAuth().catch((err: unknown) => {
            console.error("[realtime-auth] setAuth failed:", err);
          });
        }
      });
    }
    await client.realtime.setAuth();
  } catch (err) {
    // Fail open: an un-upgraded subscription delivers nothing (the
    // pre-#349 status quo) but must not prevent the channel from
    // subscribing — a later INITIAL_SESSION/refresh can still fix it.
    console.error("[realtime-auth] setAuth failed:", err);
  }
}
