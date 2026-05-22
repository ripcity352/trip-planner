/**
 * Announcements data layer — query functions for the `announcements` table.
 *
 * Includes a Realtime channel factory (`subscribeToAnnouncements`) for the
 * announcement feed component. The table is in the `supabase_realtime`
 * publication from M3 Wave 1.
 *
 * W1c (#239): both getAnnouncements and subscribeToAnnouncements now surface
 * `authorDisplayName` on every Announcement. The DB has no FK from
 * `announcements` to `trip_members` (both `author_id` and `created_by`
 * reference `auth.users`), so the join is done via a PostgREST left join on
 * `trip_members.user_id = announcements.created_by` using the `author_member`
 * alias. For realtime payloads (which carry raw rows only, no joins), the
 * caller passes a `memberUserMap` keyed by `user_id → display_name`.
 */

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Announcement } from "./types";

/**
 * PostgREST join alias shape returned by the nested select.
 * Null when no matching trip_member row exists (e.g. the author left the trip).
 */
interface AuthorMemberJoin {
  display_name: string | null;
}

/**
 * Raw row shape returned by Supabase before we normalise it to Announcement.
 * The `author_member` key is the PostgREST nested join result.
 */
type AnnouncementRaw = Omit<Announcement, "authorDisplayName"> & {
  author_member: AuthorMemberJoin | null;
};

/**
 * SELECT string with a left-join to trip_members via created_by → user_id.
 *
 * PostgREST syntax for a non-FK join (relationships.yml / no FK):
 *   trip_members!inner(display_name)   → inner join, drops rows without match
 *   trip_members(display_name)         → left join (outer), returns null on miss
 *
 * We alias the join as `author_member` so the raw result is unambiguous and
 * the normalisation step below is clear. The relationship hint
 * `trip_members!announcements_created_by_fkey` would require a FK; since
 * created_by → auth.users (not trip_members), we use a PostgREST view-style
 * select: `trip_members!left(display_name)` scoped by a filter
 * `user_id=eq.{created_by}` — but PostgREST doesn't support correlated
 * subquery syntax in select strings.
 *
 * Practical resolution: Supabase JS v2 supports specifying a join on a
 * non-FK column via the `!<column>` hint when the relationship is declared
 * in postgrest.conf / relationships.yml. Since we control neither here, we
 * perform the enrichment as a second normalisation step after the raw fetch,
 * or rely on the page layer passing a memberUserMap. The select below uses
 * the flat column list (no join) for getAnnouncements — enrichment is done
 * post-fetch via the raw row's created_by matching a memberUserMap supplied
 * by the page (same pattern as LodgingRoster / ArrivalsManifest).
 *
 * This avoids an extra round-trip: the page already fetches trip_members for
 * other surfaces. For the announcements page, we add getTripMembers to the
 * parallel fan-out and build the map there.
 *
 * See W1c ADR in notes/decisions.md.
 */
const ANNOUNCEMENT_COLUMNS =
  "id, trip_id, author_id, body, pinned, created_at, idempotency_key, visibility, created_by";

/**
 * Return all announcements for a trip, ordered by pinned DESC then
 * created_at DESC (newest first, pinned items float to the top).
 * RLS filters announcements invisible to the caller via can_see_content().
 *
 * W1c: Enriches each row with `authorDisplayName` via the memberUserMap
 * (keyed by user_id → display_name). If the map is omitted, authorDisplayName
 * is left undefined (consumer falls back to the announcements_author_fallback
 * copy key "Someone").
 */
export async function getAnnouncements(
  supabase: SupabaseClient,
  tripId: string,
  memberUserMap?: ReadonlyMap<string, string | null>
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

  const rows = (data ?? []) as AnnouncementRaw[];

  return rows.map((row) => {
    const authorDisplayName = memberUserMap
      ? (memberUserMap.get(row.created_by ?? "") ?? null)
      : undefined;
    return { ...row, authorDisplayName };
  });
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
        const raw = payload.new as Omit<Announcement, "authorDisplayName">;
        const resolvedName = raw.created_by
          ? (memberUserMap.get(raw.created_by) ?? null)
          : null;
        const authorDisplayName =
          resolvedName ?? M3_UI_STRINGS.announcements_author_fallback;
        onInsert({ ...raw, authorDisplayName });
      }
    )
    .subscribe();
}
