/**
 * Data layer for `announcement_reactions` (#389 — the ack loop).
 *
 * RLS summary (20260710060000_announcement_reactions.sql):
 *   SELECT / INSERT / DELETE — trip members only, and ONLY where the
 *   parent announcement passes can_see_content() for the caller
 *   (visibility is inherited — rule-7 exception documented in the
 *   migration header). Writes are own-row only (trip_member_id maps to
 *   the caller's membership). No UPDATE — a reaction toggles via
 *   insert/delete on the natural key.
 *
 * The page fetch is ONE trip-scoped query; grouping happens in
 * `summarizeReactions` (pure, tested). Bachelor-party scale — a GROUP BY
 * view/RPC would be premature (same call as the #250 author-enrichment
 * decision in lib/db/announcements.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReactionEmoji } from "@/lib/reactions/constants";
import type { AnnouncementReaction, AnnouncementReactionSummary } from "./types";

const REACTION_COLUMNS =
  "id, announcement_id, trip_id, trip_member_id, emoji, created_at";

/**
 * All reactions visible to the caller for a trip. RLS filters rows whose
 * parent announcement the caller can't see, so a celebrant never receives
 * hidden-parent reactions.
 */
export async function getReactionsForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<AnnouncementReaction[]> {
  const { data, error } = await supabase
    .from("announcement_reactions")
    .select(REACTION_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getReactionsForTrip failed: ${error.message}`);
  }

  return (data ?? []) as AnnouncementReaction[];
}

/**
 * Fold flat reaction rows into the per-announcement aggregate the UI
 * renders: emoji → count plus the caller's own set. Deliberately
 * aggregate-only — trip_member_ids do not survive into the output
 * (#389 design constraint: no per-name reaction lists).
 *
 * `myMemberId` is the caller's trip_members.id (null when the caller has
 * no seat resolved — `mine` stays empty and the row renders read-only
 * counts, which still fails safe because the action re-checks
 * membership server-side).
 */
export function summarizeReactions(
  rows: readonly AnnouncementReaction[],
  myMemberId: string | null
): Record<string, AnnouncementReactionSummary> {
  return rows.reduce<Record<string, AnnouncementReactionSummary>>(
    (acc, row) => {
      const existing = acc[row.announcement_id] ?? { counts: {}, mine: [] };
      const isMine = myMemberId !== null && row.trip_member_id === myMemberId;

      const next: AnnouncementReactionSummary = {
        counts: {
          ...existing.counts,
          [row.emoji]: (existing.counts[row.emoji] ?? 0) + 1,
        },
        mine: isMine ? [...existing.mine, row.emoji] : existing.mine,
      };

      return { ...acc, [row.announcement_id]: next };
    },
    {}
  );
}

/** Re-export for callers that render the fixed set. */
export type { ReactionEmoji };
