"use server";

/**
 * Server actions for shopping-item comments — the Notes thread (spec
 * §12.5, P2-T4). Clone of `postAnnouncement`'s idempotent-insert +
 * 23505-re-select pattern (`lib/actions/announcements.ts`), re-keyed by
 * `item_id` against `shopping_list_items` / `shopping_item_comments`.
 *
 * Surface contract:
 *   - `addShoppingComment({ itemId, body }, idempotencyKey)` validates,
 *     authenticates, resolves the item's trip under RLS (hidden parent ⇒
 *     rls_denied) and the caller's own trip_member_id (no seat ⇒
 *     rls_denied), rate-limits under MUTATE_SHOPPING_ITEM, and inserts.
 *     Idempotent on (item_id, author_trip_member_id, idempotency_key) — a
 *     drunk-user-on-bad-signal double-tap re-selects and returns the
 *     existing row rather than inserting a duplicate. A DIFFERENT
 *     idempotency key (a second, distinct note) always inserts a fresh
 *     row — this is the load-bearing per-logical-comment rotation the UI
 *     layer owns (spec §12.6).
 *   - `deleteShoppingComment(commentId)` — RLS-gated (author or organizer)
 *     no-op delete via the Task 3 db-layer `deleteComment`. A no-row match
 *     (already gone) converges to `{ ok: true }` rather than the shared
 *     rls_denied collapse — this mirrors `deleteShoppingItem`'s exact
 *     no-row decision in `lib/actions/shopping-list.ts` (a delete's no-row
 *     case has only one honest reading: the desired end state is already
 *     true).
 *   - I12: NO `revalidatePath`, NO `redirect()` — the caller does
 *     `router.refresh()` after `callAction` resolves.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  SHOPPING_COMMENT_COLUMNS,
  SHOPPING_COMMENT_NO_ROW,
  ShoppingCommentDbError,
  deleteComment,
} from "@/lib/db/shopping-item-comments";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { ShoppingItemComment } from "@/lib/db/types";

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();
const COMMENT_ID_SCHEMA = z.string().uuid();

const addShoppingCommentSchema = z.object({
  itemId: z.string().uuid(),
  body: z.string().trim().min(1).max(500),
});

export interface AddShoppingCommentInput {
  itemId: string;
  body: string;
}

export type AddShoppingCommentResult =
  | { ok: true; comment: ShoppingItemComment }
  | { ok: false; errorKey: ErrorKey };

export type DeleteShoppingCommentResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

type ServerSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

/**
 * Resolve the parent shopping item's trip and the caller's own member row.
 * The item select runs under RLS — a parent the caller can't see (wrong
 * trip, or hidden by visibility) resolves to null. Shared shape with
 * `resolveShoppingReactionContext` in shopping-item-reactions.ts, kept
 * as a local copy since the two files intentionally have no shared
 * import (different table, different write shape).
 */
async function resolveCommentContext(
  supabase: ServerSupabase,
  itemId: string,
  userId: string
): Promise<{ tripId: string; tripMemberId: string } | null> {
  const { data: item } = await supabase
    .from("shopping_list_items")
    .select("trip_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return null;
  const tripId = (item as { trip_id: string }).trip_id;

  const { data: member } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) return null;

  return { tripId, tripMemberId: (member as { id: string }).id };
}

type CommentErrorReason = "save_failed" | "save_rejected" | "rls_denied";

class ShoppingCommentActionError extends Error {
  readonly reason: CommentErrorReason;
  constructor(reason: CommentErrorReason) {
    super(`shopping_comment_action_error:${reason}`);
    this.name = "ShoppingCommentActionError";
    this.reason = reason;
  }
}

function commentErrorKey(reason: CommentErrorReason): ErrorKey {
  switch (reason) {
    case "rls_denied":
      return "rls_denied";
    case "save_rejected":
      return "shopping_comment_save_rejected";
    case "save_failed":
      return "shopping_comment_save_failed";
  }
}

/**
 * Add a note to a shopping item's thread. Idempotent on
 * (item_id, author_trip_member_id, idempotency_key) — a drunk double-tap
 * replays the existing row instead of inserting a duplicate.
 */
export async function addShoppingComment(
  input: AddShoppingCommentInput,
  idempotencyKey: string
): Promise<AddShoppingCommentResult> {
  if (!IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = addShoppingCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const { itemId, body } = parsed.data;

  const context = await resolveCommentContext(supabase, itemId, userId);
  if (!context) return { ok: false, errorKey: "rls_denied" };
  const { tripId, tripMemberId } = context;

  try {
    const comment = await rateLimitedAction(
      RATE_LIMIT_SCOPES.MUTATE_SHOPPING_ITEM,
      userId,
      async () => {
        const { data, error } = await supabase
          .from("shopping_item_comments")
          .insert({
            item_id: itemId,
            trip_id: tripId,
            author_trip_member_id: tripMemberId,
            body,
            idempotency_key: idempotencyKey,
          })
          .select(SHOPPING_COMMENT_COLUMNS)
          .single();

        if (error) {
          if (error.code === "23505") {
            const { data: existing, error: fetchErr } = await supabase
              .from("shopping_item_comments")
              .select(SHOPPING_COMMENT_COLUMNS)
              .eq("item_id", itemId)
              .eq("author_trip_member_id", tripMemberId)
              .eq("idempotency_key", idempotencyKey)
              .single();
            if (fetchErr || !existing) {
              throw new ShoppingCommentActionError("save_failed");
            }
            return existing as ShoppingItemComment;
          }
          if (error.code === "42501") {
            throw new ShoppingCommentActionError("rls_denied");
          }
          throw new ShoppingCommentActionError(
            error.code ? "save_rejected" : "save_failed"
          );
        }
        return data as ShoppingItemComment;
      }
    );
    return { ok: true, comment };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ShoppingCommentActionError) {
      return { ok: false, errorKey: commentErrorKey(err.reason) };
    }
    console.error("[shopping-item-comments] addShoppingComment unexpected:", err);
    return { ok: false, errorKey: "shopping_comment_save_failed" };
  }
}

/**
 * Delete a note. RLS (DELETE policy) restricts this to the comment's
 * author or an organizer. A no-row match (already gone — double-tapped
 * delete, or someone else beat the caller to it) converges to
 * `{ ok: true }` — the desired end state (gone) already holds — matching
 * `deleteShoppingItem`'s no-row precedent exactly (see module header).
 */
export async function deleteShoppingComment(
  commentId: string
): Promise<DeleteShoppingCommentResult> {
  if (!COMMENT_ID_SCHEMA.safeParse(commentId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.MUTATE_SHOPPING_ITEM, userId, () =>
      deleteComment(supabase, commentId)
    );
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    // Already gone — a double-tapped delete converges to success rather
    // than falling into the shared NO_ROW->rls_denied collapse below.
    if (
      err instanceof ShoppingCommentDbError &&
      err.code === SHOPPING_COMMENT_NO_ROW
    ) {
      return { ok: true };
    }
    if (err instanceof ShoppingCommentDbError && err.code === "42501") {
      return { ok: false, errorKey: "rls_denied" };
    }
    console.error(
      "[shopping-item-comments] deleteShoppingComment unexpected:",
      err
    );
    return { ok: false, errorKey: "shopping_comment_delete_failed" };
  }
}
