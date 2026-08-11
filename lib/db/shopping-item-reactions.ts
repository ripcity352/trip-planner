/**
 * Data layer for `shopping_item_reactions` (spec §12.3/§12.4). Clone of
 * `lib/db/announcement-reactions.ts`, re-keyed by `item_id`.
 *
 * RLS summary (20260811020000_shopping_social.sql):
 *   SELECT / INSERT / DELETE — trip members only, and ONLY where the
 *   parent shopping item passes can_see_content() for the caller
 *   (visibility is inherited, pinned to the parent's trip_id). Writes are
 *   own-row only (trip_member_id maps to the caller's membership). No
 *   UPDATE — a reaction toggles via insert/delete on the natural key.
 *
 * The page fetch is ONE trip-scoped query; grouping happens in
 * `summarizeItemReactions` (pure, tested). Bachelor-party scale — a GROUP
 * BY view/RPC would be premature (same call as the announcement-reactions
 * precedent).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ShoppingReactionEmoji } from "@/lib/reactions/shopping-constants";
import type { ShoppingItemReaction, ShoppingItemReactionSummary } from "./types";

export const SHOPPING_REACTION_COLUMNS =
  "id, item_id, trip_id, trip_member_id, emoji, created_at";

/**
 * All reactions visible to the caller for a trip. RLS filters rows whose
 * parent item the caller can't see, so a celebrant never receives
 * hidden-parent reactions.
 */
export async function getShoppingReactionsForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<ShoppingItemReaction[]> {
  const { data, error } = await supabase
    .from("shopping_item_reactions")
    .select(SHOPPING_REACTION_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getShoppingReactionsForTrip failed: ${error.message}`);
  }

  return (data ?? []) as ShoppingItemReaction[];
}

/**
 * Fold flat reaction rows into the per-item aggregate the UI renders:
 * emoji → count plus the caller's own set. Deliberately aggregate-only —
 * trip_member_ids do not survive into the output (spec §12.2 load-bearing
 * boundary: no per-name reaction lists, raw rows never cross to a client
 * component).
 *
 * `myMemberId` is the caller's trip_members.id (null when the caller has
 * no seat resolved — `mine` stays empty and the row renders read-only
 * counts, which still fails safe because the action re-checks membership
 * server-side).
 */
export function summarizeItemReactions(
  rows: readonly ShoppingItemReaction[],
  myMemberId: string | null
): Record<string, ShoppingItemReactionSummary> {
  return rows.reduce<Record<string, ShoppingItemReactionSummary>>(
    (acc, row) => {
      const existing = acc[row.item_id] ?? { counts: {}, mine: [] };
      const isMine = myMemberId !== null && row.trip_member_id === myMemberId;

      const next: ShoppingItemReactionSummary = {
        counts: {
          ...existing.counts,
          [row.emoji]: (existing.counts[row.emoji] ?? 0) + 1,
        },
        mine: isMine ? [...existing.mine, row.emoji] : existing.mine,
      };

      return { ...acc, [row.item_id]: next };
    },
    {}
  );
}

/** Re-export for callers that render the fixed set. */
export type { ShoppingReactionEmoji };
