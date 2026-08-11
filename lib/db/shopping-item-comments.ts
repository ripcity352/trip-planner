/**
 * Shopping-item comments data layer — query functions for the
 * `shopping_item_comments` table (P2-T3, migration 20260811020000).
 *
 * A FLAT thread (no replies/nesting) attached to a shopping list item.
 * Cloned from `lib/db/announcements.ts`'s DbError + enrich pattern, with
 * one load-bearing difference: `author_trip_member_id` FKs
 * `trip_members(id) ON DELETE SET NULL` directly (unlike
 * `announcements.created_by`, which references `auth.users`). So the
 * enrichment map here is keyed by `trip_member_id → display_name`, not
 * `user_id → display_name`.
 *
 * Author enrichment: `authorDisplayName` is resolved **post-fetch** via
 * `enrichComments` and a `memberMap`. A null `author_trip_member_id` (row
 * inserted with no member context — shouldn't happen but defensively
 * handled) or a miss against the map (member left the trip; the FK's
 * ON DELETE SET NULL already nulled the column, but a stale/pre-cache map
 * lookup could also miss) resolves to
 * `M3_UI_STRINGS.announcements_author_fallback` ("Someone") — NOT
 * `resolveMemberName`'s "Guest" (roster_member_fallback_name), which is
 * the wrong context per spec §12.4.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ShoppingItemComment } from "./types";

/** Flat column list — scalar author, no join. */
export const SHOPPING_COMMENT_COLUMNS =
  "id, item_id, trip_id, author_trip_member_id, body, idempotency_key, created_at";

/**
 * Resolves `authorDisplayName` for each comment by looking up
 * `author_trip_member_id` in `memberMap` (keyed by
 * `trip_member_id → display_name`). A null author or a map miss/null
 * display_name resolves to M3_UI_STRINGS.announcements_author_fallback
 * ("Someone") — applied here, not deferred to the render layer, so every
 * caller (page + any realtime path) gets a consistent value.
 */
export function enrichComments(
  comments: readonly ShoppingItemComment[],
  memberMap: ReadonlyMap<string, string | null>
): ShoppingItemComment[] {
  return comments.map((row) => ({
    ...row,
    authorDisplayName:
      (row.author_trip_member_id
        ? memberMap.get(row.author_trip_member_id)
        : null) ?? M3_UI_STRINGS.announcements_author_fallback,
  }));
}

/**
 * Return all comments for a trip's shopping items, ordered oldest-first
 * (flat thread, chronological). RLS filters rows invisible to the caller
 * via the parent item's visibility (can_see_content()).
 */
export async function getCommentsForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<ShoppingItemComment[]> {
  const { data, error } = await supabase
    .from("shopping_item_comments")
    .select(SHOPPING_COMMENT_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getCommentsForTrip failed: ${error.message}`);
  }

  return (data ?? []) as ShoppingItemComment[];
}

/** Sentinel code for a write that matched no row. */
export const SHOPPING_COMMENT_NO_ROW = "shopping_comment_no_row";

/** Carries the Postgres error code so actions can map without text-matching. */
export class ShoppingCommentDbError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "ShoppingCommentDbError";
    this.code = code;
  }
}

/**
 * Delete a comment. RLS (DELETE policy) restricts this to the comment's
 * author or an organizer — this function trusts the caller's action layer
 * to have authenticated; the actual gate is the RLS policy itself (rule 5).
 * No UPDATE policy exists on this table — comments are immutable.
 */
export async function deleteComment(
  supabase: SupabaseClient,
  commentId: string
): Promise<void> {
  const { error, count } = await supabase
    .from("shopping_item_comments")
    .delete({ count: "exact" })
    .eq("id", commentId);

  if (error) {
    throw new ShoppingCommentDbError(
      `deleteComment failed: ${error.message}`,
      error.code ?? null
    );
  }
  if (!count) {
    throw new ShoppingCommentDbError(
      "deleteComment matched no row",
      SHOPPING_COMMENT_NO_ROW
    );
  }
}
