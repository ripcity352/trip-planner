/**
 * Poll-comments data layer — query functions for the `poll_comments`
 * table (#620, part 1/3 of #616, migration 20260813010000).
 *
 * A FLAT thread (no replies/nesting) attached to a poll. Near-direct
 * clone of `lib/db/shopping-item-comments.ts` — same DbError + enrich
 * pattern, re-keyed by `poll_id` against `polls` / `poll_comments`.
 * `author_trip_member_id` FKs `trip_members(id) ON DELETE SET NULL`
 * directly (same as the shopping precedent, unlike `announcements.
 * created_by`, which references `auth.users`), so the enrichment map
 * here is keyed by `trip_member_id → display_name`.
 *
 * Author enrichment: `authorDisplayName` is resolved **post-fetch** via
 * `enrichPollComments` and a `memberMap`. A null `author_trip_member_id`
 * or a miss against the map (member left the trip) resolves to
 * `M3_UI_STRINGS.announcements_author_fallback` ("Someone") — NOT
 * `resolveMemberName`'s "Guest", which is the wrong context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { PollComment } from "./types";

/** Flat column list — scalar author, no join. */
export const POLL_COMMENT_COLUMNS =
  "id, poll_id, trip_id, author_trip_member_id, body, idempotency_key, created_at";

/**
 * Resolves `authorDisplayName` for each comment by looking up
 * `author_trip_member_id` in `memberMap` (keyed by
 * `trip_member_id → display_name`). A null author or a map miss/null
 * display_name resolves to M3_UI_STRINGS.announcements_author_fallback
 * ("Someone") — applied here, not deferred to the render layer, so
 * every caller gets a consistent value.
 */
export function enrichPollComments(
  comments: readonly PollComment[],
  memberMap: ReadonlyMap<string, string | null>
): PollComment[] {
  return comments.map((row) => ({
    ...row,
    authorDisplayName:
      (row.author_trip_member_id
        ? memberMap.get(row.author_trip_member_id)
        : null) ?? M3_UI_STRINGS.announcements_author_fallback,
  }));
}

/**
 * Return all comments on one poll, ordered oldest-first (flat thread,
 * chronological). RLS filters via the parent poll's visibility
 * (can_see_content()).
 */
export async function getPollComments(
  supabase: SupabaseClient,
  pollId: string
): Promise<PollComment[]> {
  const { data, error } = await supabase
    .from("poll_comments")
    .select(POLL_COMMENT_COLUMNS)
    .eq("poll_id", pollId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getPollComments failed: ${error.message}`);
  }

  return (data ?? []) as PollComment[];
}

/**
 * Return all comments across every poll the caller can see for a trip,
 * ordered oldest-first — the bulk read the announcements page uses to
 * fold comments onto each `PollView` server-side (mirrors
 * `getCommentsForTrip` in the shopping precedent). RLS filters rows
 * invisible to the caller via the parent poll's visibility.
 */
export async function getCommentsForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<PollComment[]> {
  const { data, error } = await supabase
    .from("poll_comments")
    .select(POLL_COMMENT_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getCommentsForTrip failed: ${error.message}`);
  }

  return (data ?? []) as PollComment[];
}

/** Sentinel code for a write that matched no row. */
export const POLL_COMMENT_NO_ROW = "poll_comment_no_row";

/** Carries the Postgres error code so actions can map without text-matching. */
export class PollCommentDbError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "PollCommentDbError";
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
    .from("poll_comments")
    .delete({ count: "exact" })
    .eq("id", commentId);

  if (error) {
    throw new PollCommentDbError(
      `deleteComment failed: ${error.message}`,
      error.code ?? null
    );
  }
  if (!count) {
    throw new PollCommentDbError(
      "deleteComment matched no row",
      POLL_COMMENT_NO_ROW
    );
  }
}
