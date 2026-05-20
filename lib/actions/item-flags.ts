"use server";

/**
 * Server actions for per-item member flags (M3 #80).
 *
 * Surface contract:
 *   - `addItemFlag(input)` inserts the caller's own flag for an item.
 *   - `removeItemFlag(itemId, flag)` deletes the caller's own flag.
 *   - Strictly user-scoped: `trip_member_id` is resolved server-side
 *     from auth.uid() — callers cannot set flags on behalf of others.
 *   - SELECT is organizer-only (RLS). The member-side action intentionally
 *     does not confirm the saved flag back to the UI — the flag is
 *     organizer-read-only. The member only sees "saved" (ok: true) or
 *     "failed" (ok: false).
 *   - `flag` is freeform text — no enum per CLAUDE.md rule #8.
 *   - Idempotency: the unique constraint on (item_id, trip_member_id, flag)
 *     makes addItemFlag naturally idempotent for the same flag value.
 *     The action returns ok: true on a conflict (flag already exists).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";

const addFlagSchema = z.object({
  itemId: z.string().uuid(),
  flag: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).nullable().optional(),
});

export interface AddItemFlagInput {
  itemId: string;
  flag: string;
  note?: string | null;
}

export type AddItemFlagResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

export type RemoveItemFlagResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

/**
 * Resolve the calling user's trip_member_id for the given item's trip.
 * Returns null if the caller is not a member (RLS will also catch this).
 */
async function resolveTripMemberId(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  itemId: string,
  userId: string
): Promise<string | null> {
  const { data: itemData } = await supabase
    .from("itinerary_items")
    .select("trip_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!itemData) return null;

  const { data: memberData } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", itemData.trip_id)
    .eq("user_id", userId)
    .maybeSingle();

  return (memberData as { id: string } | null)?.id ?? null;
}

/**
 * Add a participation flag for the caller on a specific item.
 * Idempotent on (item_id, trip_member_id, flag) — calling again with
 * the same flag is a no-op that returns ok: true.
 */
export async function addItemFlag(
  input: AddItemFlagInput
): Promise<AddItemFlagResult> {
  const parsed = addFlagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { itemId, flag, note } = parsed.data;

  let tripMemberId: string;
  try {
    const memberId = await resolveTripMemberId(supabase, itemId, userId);
    if (!memberId) return { ok: false, errorKey: "rls_denied" };
    tripMemberId = memberId;
  } catch (err) {
    console.error("[item-flags] member lookup unexpected:", err);
    return { ok: false, errorKey: "item_flag_save_failed" };
  }

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.SET_ITEM_FLAG,
      userId,
      async () => {
        const { error } = await supabase
          .from("itinerary_item_member_flags")
          .insert({
            item_id: itemId,
            trip_member_id: tripMemberId,
            flag,
            note: note ?? null,
          });

        if (error) {
          // Unique constraint on (item_id, trip_member_id, flag) —
          // flag already exists, treat as success (idempotent).
          if (error.code === "23505") return;
          if (error.code === "42501") {
            throw new ItemFlagError("rls_denied");
          }
          throw new ItemFlagError("save_failed");
        }
      }
    );

    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ItemFlagError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied" ? "rls_denied" : "item_flag_save_failed",
      };
    }
    console.error("[item-flags] addItemFlag unexpected:", err);
    return { ok: false, errorKey: "item_flag_save_failed" };
  }
}

/**
 * Remove the caller's participation flag on a specific item.
 * Idempotent — if the flag doesn't exist, returns ok: true.
 */
export async function removeItemFlag(
  itemId: string,
  flag: string
): Promise<RemoveItemFlagResult> {
  const itemIdParse = z.string().uuid().safeParse(itemId);
  const flagParse = z.string().trim().min(1).max(100).safeParse(flag);
  if (!itemIdParse.success || !flagParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  let tripMemberId: string;
  try {
    const memberId = await resolveTripMemberId(supabase, itemId, userId);
    if (!memberId) return { ok: false, errorKey: "rls_denied" };
    tripMemberId = memberId;
  } catch (err) {
    console.error("[item-flags] member lookup unexpected:", err);
    return { ok: false, errorKey: "item_flag_save_failed" };
  }

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.SET_ITEM_FLAG,
      userId,
      async () => {
        const { error } = await supabase
          .from("itinerary_item_member_flags")
          .delete()
          .eq("item_id", itemId)
          .eq("trip_member_id", tripMemberId)
          .eq("flag", flagParse.data);

        if (error) {
          if (error.code === "42501") {
            throw new ItemFlagError("rls_denied");
          }
          throw new ItemFlagError("save_failed");
        }
      }
    );

    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ItemFlagError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied" ? "rls_denied" : "item_flag_save_failed",
      };
    }
    console.error("[item-flags] removeItemFlag unexpected:", err);
    return { ok: false, errorKey: "item_flag_save_failed" };
  }
}

class ItemFlagError extends Error {
  readonly reason: "save_failed" | "rls_denied";

  constructor(reason: "save_failed" | "rls_denied") {
    super(`item_flag_error:${reason}`);
    this.name = "ItemFlagError";
    this.reason = reason;
  }
}
