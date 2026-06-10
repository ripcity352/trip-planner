/**
 * Announcements data layer — query functions for the `announcements` table.
 *
 * Includes a Realtime channel factory (`subscribeToAnnouncements`) for the
 * announcement feed component. The table is in the `supabase_realtime`
 * publication from M3 Wave 1.
 *
 * Author enrichment (#250, settled): `authorDisplayName` is resolved
 * **post-fetch** via `enrichAnnouncements` and a `memberUserMap` keyed by
 * `user_id → display_name`. The DB has no FK from `announcements` to
 * `trip_members` (`created_by` references `auth.users`), so a PostgREST
 * nested-select join isn't available; a SQL view
 * (`v_announcements_with_author`) was considered and rejected for the 2-dev
 * MVP — it adds a view + RLS surface for no felt win at bachelor-party
 * scale. Revisit only if the post-fetch map produces real N+1 pain.
 *
 * The one coherent path:
 *   - `getAnnouncements` fetches flat rows (no `authorDisplayName`).
 *   - The page builds `memberUserMap` from its existing `getTripMembers`
 *     fan-out and calls `enrichAnnouncements` (same pattern as
 *     LodgingRoster / ArrivalsManifest).
 *   - `subscribeToAnnouncements` reuses `enrichAnnouncements` per realtime
 *     payload (raw rows only, no joins), with the "Someone" fallback
 *     applied eagerly because the payload bypasses the page layer.
 */

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Announcement } from "./types";

/** Flat column list — no join; see the author-enrichment note above. */
const ANNOUNCEMENT_COLUMNS =
  "id, trip_id, author_id, body, pinned, created_at, idempotency_key, visibility, created_by";

/**
 * The single post-fetch author-enrichment path (#250).
 *
 * Resolves `authorDisplayName` for each row by looking up `created_by` in
 * `memberUserMap` (keyed by `user_id → display_name`). Misses resolve to
 * `null` — the rendering layer (AnnouncementCard) falls back to
 * M3_UI_STRINGS.announcements_author_fallback ("Someone").
 */
export function enrichAnnouncements(
  announcements: readonly Announcement[],
  memberUserMap: ReadonlyMap<string, string | null>
): Announcement[] {
  return announcements.map((row) => ({
    ...row,
    authorDisplayName: row.created_by
      ? (memberUserMap.get(row.created_by) ?? null)
      : null,
  }));
}

/**
 * Return all announcements for a trip, ordered by pinned DESC then
 * created_at DESC (newest first, pinned items float to the top).
 * RLS filters announcements invisible to the caller via can_see_content().
 *
 * #250: returns flat rows — `authorDisplayName` is left undefined. Callers
 * that render authors pass the result through `enrichAnnouncements`. This
 * keeps the fetch parallelizable with `getTripMembers` (the map source).
 */
export async function getAnnouncements(
  supabase: SupabaseClient,
  tripId: string
): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("trip_id", tripId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAnnouncements failed: ${error.message}`);
  }

  return (data ?? []) as Announcement[];
}

/**
 * Realtime channel factory for the announcements feed.
 *
 * Creates a Postgres changes channel scoped to `trip_id` so the subscriber
 * only receives events for their trip. RLS is honored at the DB level —
 * rows invisible to the subscriber are not broadcast.
 *
 * W1c (#239): accepts a `memberUserMap` (keyed by user_id → display_name)
 * to enrich each INSERT payload with `authorDisplayName` before invoking
 * onInsert. The map is captured at subscription time — if member list changes
 * mid-session, the parent should re-subscribe or use the initial map
 * (acceptable for the bachelor-party scale).
 *
 * When `created_by` is absent or not found in the map, falls back to
 * M3_UI_STRINGS.announcements_author_fallback ("Someone") — NOT
 * roster_member_fallback_name ("Guest"), which is the wrong context.
 *
 * Usage:
 * ```ts
 * const channel = subscribeToAnnouncements(supabase, tripId, onInsert, memberUserMap)
 * // Cleanup:
 * supabase.removeChannel(channel)
 * ```
 *
 * @param supabase - Browser-side Supabase client (Realtime requires WebSocket).
 * @param tripId - The trip to subscribe to.
 * @param onInsert - Called with each newly inserted announcement row (enriched).
 * @param memberUserMap - Map of user_id → display_name for author resolution.
 * @returns The Realtime channel (caller should removeChannel on cleanup).
 */
export function subscribeToAnnouncements(
  supabase: SupabaseClient,
  tripId: string,
  onInsert: (announcement: Announcement) => void,
  memberUserMap: ReadonlyMap<string, string | null> = new Map()
): RealtimeChannel {
  return supabase
    .channel(`announcements:${tripId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "announcements",
        filter: `trip_id=eq.${tripId}`,
      },
      (payload) => {
        const raw = payload.new as Announcement;
        // Same lookup as the page path (#250); the "Someone" fallback is
        // applied eagerly here because the payload bypasses the page layer.
        const [enriched] = enrichAnnouncements([raw], memberUserMap);
        onInsert({
          ...enriched,
          authorDisplayName:
            enriched.authorDisplayName ??
            M3_UI_STRINGS.announcements_author_fallback,
        });
      }
    )
    .subscribe();
}
