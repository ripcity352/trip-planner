/**
 * Itinerary-item-comments data layer — query functions for the
 * `itinerary_item_comments` table (migration 20260815010000).
 *
 * A FLAT thread (no replies/nesting) attached to an itinerary item.
 * Near-direct clone of `lib/db/poll-comments.ts`, re-keyed by
 * `item_id` against `itinerary_items` / `itinerary_item_comments`.
 * `author_trip_member_id` FKs `trip_members(id) ON DELETE SET NULL`
 * directly, so the enrichment map here is keyed by
 * `trip_member_id → display_name`.
 *
 * Author enrichment: `authorDisplayName` is resolved **post-fetch** via
 * `enrichItemComments` and a `memberMap`. A null `author_trip_member_id`
 * or a miss against the map (member left the trip) resolves to
 * `M3_UI_STRINGS.announcements_author_fallback` ("Someone") — NOT
 * `resolveMemberName`'s "Guest", which is the wrong context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ItemComment } from "./types";

/** Flat column list — scalar author, no join. */
export const ITEM_COMMENT_COLUMNS =
  "id, item_id, trip_id, author_trip_member_id, body, idempotency_key, created_at";

/**
 * Resolves `authorDisplayName` for each comment by looking up
 * `author_trip_member_id` in `memberMap` (keyed by
 * `trip_member_id → display_name`). A null author or a map miss/null
 * display_name resolves to M3_UI_STRINGS.announcements_author_fallback
 * ("Someone") — applied here, not deferred to the render layer, so
 * every caller gets a consistent value.
 */
export function enrichItemComments(
  comments: readonly ItemComment[],
  memberMap: ReadonlyMap<string, string | null>
): ItemComment[] {
  return comments.map((row) => ({
    ...row,
    authorDisplayName:
      (row.author_trip_member_id
        ? memberMap.get(row.author_trip_member_id)
        : null) ?? M3_UI_STRINGS.announcements_author_fallback,
  }));
}

/**
 * Return all comments on one itinerary item, ordered oldest-first
 * (flat thread, chronological). RLS filters via the parent item's
 * visibility (can_see_content()).
 */
export async function getItemComments(
  supabase: SupabaseClient,
  itemId: string
): Promise<ItemComment[]> {
  const { data, error } = await supabase
    .from("itinerary_item_comments")
    .select(ITEM_COMMENT_COLUMNS)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getItemComments failed: ${error.message}`);
  }

  return (data ?? []) as ItemComment[];
}

/**
 * Return all comments across every itinerary item the caller can see
 * for a trip, ordered oldest-first — the bulk read the itinerary page
 * uses to fold comments onto each item server-side (mirrors
 * `getCommentsForTrip` in the poll-comments precedent). RLS filters
 * rows invisible to the caller via the parent item's visibility.
 */
export async function getCommentsForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<ItemComment[]> {
  const { data, error } = await supabase
    .from("itinerary_item_comments")
    .select(ITEM_COMMENT_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getCommentsForTrip failed: ${error.message}`);
  }

  return (data ?? []) as ItemComment[];
}

/** Sentinel code for a write that matched no row. */
export const ITEM_COMMENT_NO_ROW = "item_comment_no_row";

/** Carries the Postgres error code so actions can map without text-matching. */
export class ItemCommentDbError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "ItemCommentDbError";
    this.code = code;
  }
}

/**
 * Delete a comment. RLS (DELETE policy) restricts this to the comment's
 * author or an organizer — this function trusts the caller's action
 * layer to have authenticated; the actual gate is the RLS policy itself
 * (rule 5). No UPDATE policy exists on this table — comments are
 * immutable.
 */
export async function deleteComment(
  supabase: SupabaseClient,
  commentId: string
): Promise<void> {
  const { error, count } = await supabase
    .from("itinerary_item_comments")
    .delete({ count: "exact" })
    .eq("id", commentId);

  if (error) {
    throw new ItemCommentDbError(
      `deleteComment failed: ${error.message}`,
      error.code ?? null
    );
  }
  if (!count) {
    throw new ItemCommentDbError(
      "deleteComment matched no row",
      ITEM_COMMENT_NO_ROW
    );
  }
}
