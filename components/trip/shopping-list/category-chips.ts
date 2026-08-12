/**
 * CATEGORY_CHIPS — the single shopping-list category taxonomy, shared by the
 * add form (`AddItemSheet`) and the inline amend form (`ShoppingItemEditForm`).
 *
 * The `category` column is freeform text, not a DB enum — these chips are a
 * client-only convenience for the common cases. Labels come from
 * `SHOPPING_LIST_UI_STRINGS`; the `value` is what gets persisted.
 *
 * Extracted from the two live copies that previously duplicated this array
 * (issue #608). Keep it here — co-located with its only consumers — rather
 * than in `lib/copy`, which owns strings, not UI data shapes.
 */

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";

export const CATEGORY_CHIPS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "snacks", label: SHOPPING_LIST_UI_STRINGS.categorySnacks },
  { value: "booze", label: SHOPPING_LIST_UI_STRINGS.categoryBooze },
  { value: "supplies", label: SHOPPING_LIST_UI_STRINGS.categorySupplies },
  { value: "gear", label: SHOPPING_LIST_UI_STRINGS.categoryGear },
];
