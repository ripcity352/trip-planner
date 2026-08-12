/**
 * Shopping-list data layer — query functions for the `shopping_list_items`
 * table (standalone page, zero expenses coupling — see
 * notes/shopping-list-exploration.md). Mirrors the announcements.ts
 * DbError sentinel + `{ count: "exact" }` setter/delete pattern (#393).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShoppingItem, ShoppingItemPatch, ShoppingItemState } from "./types";

/** Flat column list — the I1 invariant checker asserts every non-exempt
 * written column (name, category, bought, claimed_by_trip_member_id,
 * cost_cents, currency, visibility, completed_by_trip_member_id,
 * removed_by_trip_member_id, removed_at, claim_assigned_by_trip_member_id)
 * appears here. */
export const SHOPPING_ITEM_COLUMNS =
  "id, trip_id, created_by_trip_member_id, claimed_by_trip_member_id, name, category, bought, cost_cents, currency, visibility, idempotency_key, created_at, completed_by_trip_member_id, removed_by_trip_member_id, removed_at, claim_assigned_by_trip_member_id";

/**
 * Return all shopping-list items for a trip, ordered by created_at asc
 * (oldest first). RLS filters items invisible to the caller via
 * can_see_content().
 */
export async function getShoppingItems(
  supabase: SupabaseClient,
  tripId: string
): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select(SHOPPING_ITEM_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getShoppingItems failed: ${error.message}`);
  }

  return (data ?? []) as ShoppingItem[];
}

/** Sentinel code for a write that matched no row. */
export const SHOPPING_ITEM_NO_ROW = "shopping_item_no_row";

/** Carries the Postgres error code so actions can map without text-matching. */
export class ShoppingListDbError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "ShoppingListDbError";
    this.code = code;
  }
}

async function runCounted(
  query: PromiseLike<{
    error: { code?: string | null; message?: string } | null;
    count: number | null;
  }>
): Promise<void> {
  const { error, count } = await query;
  if (error) {
    throw new ShoppingListDbError(
      error.message ?? "update failed",
      error.code ?? null
    );
  }
  if (!count) {
    throw new ShoppingListDbError("matched no row", SHOPPING_ITEM_NO_ROW);
  }
}

/**
 * Partial-patch update: only the keys present in `patch` are sent.
 * `undefined` = leave unchanged (key omitted from the payload); `null`
 * (on category / cost_cents) = explicitly clear.
 */
export function amendItem(
  supabase: SupabaseClient,
  itemId: string,
  patch: ShoppingItemPatch
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if ("name" in patch && patch.name !== undefined) payload.name = patch.name;
  if ("category" in patch && patch.category !== undefined)
    payload.category = patch.category;
  if ("cost_cents" in patch && patch.cost_cents !== undefined)
    payload.cost_cents = patch.cost_cents;

  return runCounted(
    supabase
      .from("shopping_list_items")
      .update(payload, { count: "exact" })
      .eq("id", itemId)
  );
}

/**
 * Pure display-state derivation (v2 spec §2). No I/O. Precedence order
 * matters: `removed` wins over everything (even a simultaneously-bought
 * row); `completed` (bought) wins over `in_progress` (claimed).
 */
export function deriveShoppingItemState(item: ShoppingItem): ShoppingItemState {
  if (item.removed_at !== null) return "removed";
  if (item.bought) return "completed";
  if (item.claimed_by_trip_member_id !== null) return "in_progress";
  return "open";
}

/** Mark an item bought + record who completed it. */
export function setItemCompleted(
  supabase: SupabaseClient,
  itemId: string,
  completedByMemberId: string
): Promise<void> {
  return runCounted(
    supabase
      .from("shopping_list_items")
      .update(
        { bought: true, completed_by_trip_member_id: completedByMemberId },
        { count: "exact" }
      )
      .eq("id", itemId)
  );
}

/** Mark an item removed + record who removed it and when. */
export function setItemRemoved(
  supabase: SupabaseClient,
  itemId: string,
  removedByMemberId: string,
  removedAt: string
): Promise<void> {
  return runCounted(
    supabase
      .from("shopping_list_items")
      .update(
        {
          removed_by_trip_member_id: removedByMemberId,
          removed_at: removedAt,
        },
        { count: "exact" }
      )
      .eq("id", itemId)
  );
}

/**
 * Set (or clear, with both `null`) who's claimed an item and who assigned
 * that claim. Supersedes the retired v1 `setItemClaim`, which only wrote
 * claimed_by.
 * Both null = "send back to Open — no one".
 */
export function setItemAssignment(
  supabase: SupabaseClient,
  itemId: string,
  claimedByMemberId: string | null,
  claimAssignedByMemberId: string | null
): Promise<void> {
  return runCounted(
    supabase
      .from("shopping_list_items")
      .update(
        {
          claimed_by_trip_member_id: claimedByMemberId,
          claim_assigned_by_trip_member_id: claimAssignedByMemberId,
        },
        { count: "exact" }
      )
      .eq("id", itemId)
  );
}

/**
 * Re-open an item from Completed OR Removed: clears all four terminal
 * fields and sets the assignment in one idempotent update — correct for
 * both origins.
 */
export function reopenItem(
  supabase: SupabaseClient,
  itemId: string,
  claimedByMemberId: string | null,
  claimAssignedByMemberId: string | null
): Promise<void> {
  return runCounted(
    supabase
      .from("shopping_list_items")
      .update(
        {
          bought: false,
          completed_by_trip_member_id: null,
          removed_by_trip_member_id: null,
          removed_at: null,
          claimed_by_trip_member_id: claimedByMemberId,
          claim_assigned_by_trip_member_id: claimAssignedByMemberId,
        },
        { count: "exact" }
      )
      .eq("id", itemId)
  );
}

/** Delete a shopping-list item. */
export function deleteItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  return runCounted(
    supabase
      .from("shopping_list_items")
      .delete({ count: "exact" })
      .eq("id", itemId)
  );
}
