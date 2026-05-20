/**
 * Announcements data layer — query functions for the `announcements` table.
 *
 * Includes a Realtime channel factory (`subscribeToAnnouncements`) for the
 * announcement feed component. The table is in the `supabase_realtime`
 * publication from M3 Wave 1.
 */

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { Announcement } from "./types";

const ANNOUNCEMENT_COLUMNS =
  "id, trip_id, author_id, body, pinned, created_at, idempotency_key, visibility, created_by";

/**
 * Return all announcements for a trip, ordered by pinned DESC then
 * created_at DESC (newest first, pinned items float to the top).
 * RLS filters announcements invisible to the caller via can_see_content().
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
 * Usage:
 * ```ts
 * const channel = subscribeToAnnouncements(supabase, tripId, (announcement) => {
 *   setAnnouncements(prev => [announcement, ...prev])
 * })
 * // Cleanup:
 * supabase.removeChannel(channel)
 * ```
 *
 * @param supabase - Browser-side Supabase client (not server — Realtime
 *   requires a persistent WebSocket connection).
 * @param tripId - The trip to subscribe to.
 * @param onInsert - Called with each newly inserted announcement row.
 * @returns The Realtime channel (caller should removeChannel on cleanup).
 */
export function subscribeToAnnouncements(
  supabase: SupabaseClient,
  tripId: string,
  onInsert: (announcement: Announcement) => void
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
        onInsert(payload.new as Announcement);
      }
    )
    .subscribe();
}
