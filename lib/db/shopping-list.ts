/**
 * Shopping-list data layer — query functions for the `shopping_list_items`
 * table (standalone page, zero expenses coupling — see
 * notes/shopping-list-exploration.md). Mirrors the announcements.ts
 * DbError sentinel + `{ count: "exact" }` setter/delete pattern (#393).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShoppingItem, ShoppingItemPatch } from "./types";

/** Flat column list — the I1 invariant checker asserts every non-exempt
 * written column (name, category, bought, claimed_by_trip_member_id,
 * cost_cents, currency, visibility) appears here. */
export const SHOPPING_ITEM_COLUMNS =
  "id, trip_id, created_by_trip_member_id, claimed_by_trip_member_id, name, category, bought, cost_cents, currency, visibility, idempotency_key, created_at";

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

/** Set an item's `bought` column to a desired end state. */
export function setItemBought(
  supabase: SupabaseClient,
  itemId: string,
  bought: boolean
): Promise<void> {
  return runCounted(
    supabase
      .from("shopping_list_items")
      .update({ bought }, { count: "exact" })
      .eq("id", itemId)
  );
}

/** Set (or clear, with `null`) who's claimed an item. */
export function setItemClaim(
  supabase: SupabaseClient,
  itemId: string,
  claimedByTripMemberId: string | null
): Promise<void> {
  return runCounted(
    supabase
      .from("shopping_list_items")
      .update(
        { claimed_by_trip_member_id: claimedByTripMemberId },
        { count: "exact" }
      )
      .eq("id", itemId)
  );
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
