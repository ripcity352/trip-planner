"use server";

/**
 * Server actions for the standalone shopping list (zero expenses coupling —
 * see notes/shopping-list-exploration.md). Mirrors the `ride-groups.ts`
 * template: one `ShoppingActionError`, one `toErrorResult`, a
 * `resolveMemberId` helper, `rateLimitedAction` wrapping, and the
 * 23505/42501 error-code split for the raw insert. The `toggleBought` /
 * `setClaim` / `amendShoppingItem` / `deleteShoppingItem` mutations route
 * through the Task 2 db layer (`lib/db/shopping-list.ts`) and map its
 * `ShoppingListDbError` (42501 / SHOPPING_ITEM_NO_ROW) to the same
 * `rls_denied` envelope — a filtered-to-zero-rows update looks identical to
 * an explicit RLS rejection from the caller's point of view.
 *
 * No `revalidatePath`, no `redirect()` — `router.refresh()` is caller-side
 * (I12).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  SHOPPING_ITEM_COLUMNS,
  SHOPPING_ITEM_NO_ROW,
  ShoppingListDbError,
  amendItem,
  deleteItem,
  setItemBought,
  setItemClaim,
} from "@/lib/db/shopping-list";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { ShoppingItem, ShoppingItemPatch } from "@/lib/db/types";

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();
const ITEM_ID_SCHEMA = z.string().uuid();

const VISIBILITY_SCHEMA = z.enum([
  "everyone",
  "organizers_only",
  "hide_from_celebrant",
  "custom",
]);

/** Resolve the caller's trip_member_id in a trip, or null if not a member. */
async function resolveMemberId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

type ShoppingErrorReason = "save_failed" | "save_rejected" | "rls_denied";

class ShoppingActionError extends Error {
  readonly reason: ShoppingErrorReason;
  constructor(reason: ShoppingErrorReason) {
    super(`shopping_action_error:${reason}`);
    this.name = "ShoppingActionError";
    this.reason = reason;
  }
}

function saveErrorKey(reason: ShoppingErrorReason): ErrorKey {
  switch (reason) {
    case "rls_denied":
      return "rls_denied";
    case "save_rejected":
      return "shopping_list_save_rejected";
    case "save_failed":
      return "shopping_list_save_failed";
  }
}

function toErrorResult(
  err: unknown,
  where: string
): { ok: false; errorKey: ErrorKey } {
  if (err instanceof RateLimitError) return { ok: false, errorKey: "rate_limit" };
  if (err instanceof ShoppingActionError) {
    return { ok: false, errorKey: saveErrorKey(err.reason) };
  }
  console.error(`[shopping-list] ${where} unexpected:`, err);
  return { ok: false, errorKey: "shopping_list_save_failed" };
}

/**
 * Maps a `ShoppingListDbError` from the Task 2 db layer to the envelope.
 * `42501` (RLS rejection) and `SHOPPING_ITEM_NO_ROW` (update/delete matched
 * zero rows — indistinguishable from RLS having filtered the row out) both
 * collapse to `rls_denied`. A coded error is a deterministic rejection; a
 * codeless one is a flaky-connection retry candidate (#474 pattern).
 */
function mapDbError(
  err: unknown,
  rejectedKey: ErrorKey,
  failedKey: ErrorKey
): { ok: false; errorKey: ErrorKey } {
  if (err instanceof RateLimitError) return { ok: false, errorKey: "rate_limit" };
  if (err instanceof ShoppingListDbError) {
    if (err.code === "42501" || err.code === SHOPPING_ITEM_NO_ROW) {
      return { ok: false, errorKey: "rls_denied" };
    }
    return { ok: false, errorKey: err.code ? rejectedKey : failedKey };
  }
  return { ok: false, errorKey: failedKey };
}

// ---- addShoppingItem -----------------------------------------

const addSchema = z.object({
  tripId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v ? v : null))
    .nullable()
    .optional(),
  costCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  visibility: VISIBILITY_SCHEMA.optional(),
});

export interface AddShoppingItemInput {
  tripId: string;
  name: string;
  category?: string | null;
  costCents?: number | null;
  visibility?: z.infer<typeof VISIBILITY_SCHEMA>;
}

export type AddShoppingItemResult =
  | { ok: true; item: ShoppingItem }
  | { ok: false; errorKey: ErrorKey };

/**
 * Add a shopping-list item. Idempotent on
 * (trip_id, created_by_trip_member_id, idempotency_key) — a drunk double-tap
 * replays the existing row instead of inserting a duplicate.
 */
export async function addShoppingItem(
  input: AddShoppingItemInput,
  idempotencyKey: string
): Promise<AddShoppingItemResult> {
  if (!IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const { tripId, name, category, costCents, visibility } = parsed.data;

  const creatorId = await resolveMemberId(supabase, tripId, userId);
  if (!creatorId) return { ok: false, errorKey: "rls_denied" };

  try {
    const item = await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_SHOPPING_ITEM,
      userId,
      async () => {
        const { data, error } = await supabase
          .from("shopping_list_items")
          .insert({
            trip_id: tripId,
            created_by_trip_member_id: creatorId,
            name,
            category: category ?? null,
            cost_cents: costCents ?? null,
            currency: "USD",
            visibility: visibility ?? "everyone",
            idempotency_key: idempotencyKey,
          })
          .select(SHOPPING_ITEM_COLUMNS)
          .single();

        if (error) {
          if (error.code === "23505") {
            const { data: existing, error: fetchErr } = await supabase
              .from("shopping_list_items")
              .select(SHOPPING_ITEM_COLUMNS)
              .eq("trip_id", tripId)
              .eq("created_by_trip_member_id", creatorId)
              .eq("idempotency_key", idempotencyKey)
              .single();
            if (fetchErr || !existing) {
              throw new ShoppingActionError("save_failed");
            }
            return existing as ShoppingItem;
          }
          if (error.code === "42501") {
            throw new ShoppingActionError("rls_denied");
          }
          throw new ShoppingActionError(
            error.code ? "save_rejected" : "save_failed"
          );
        }
        return data as ShoppingItem;
      }
    );
    return { ok: true, item };
  } catch (err) {
    return toErrorResult(err, "addShoppingItem");
  }
}

// ---- toggleBought ----------------------------------------------

export type ToggleShoppingItemResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

/** Set an item's `bought` state to a desired end state (idempotent). */
export async function toggleBought(
  itemId: string,
  bought: boolean
): Promise<ToggleShoppingItemResult> {
  if (!ITEM_ID_SCHEMA.safeParse(itemId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.TOGGLE_SHOPPING_ITEM, userId, () =>
      setItemBought(supabase, itemId, bought)
    );
    return { ok: true };
  } catch (err) {
    return mapDbError(err, "shopping_list_save_rejected", "shopping_list_save_failed");
  }
}

// ---- setClaim ----------------------------------------------------

/**
 * Claim (or unclaim, `claimed:false`) an item on the acting member's own
 * behalf. Resolves the caller's own `trip_member_id` server-side — the
 * client never supplies a member id directly.
 */
export async function setClaim(
  itemId: string,
  claimed: boolean
): Promise<ToggleShoppingItemResult> {
  if (!ITEM_ID_SCHEMA.safeParse(itemId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  // RLS SELECT allows any member who can see the item, so resolving its
  // trip is safe even before we know the caller's own membership.
  const { data: item, error: itemErr } = await supabase
    .from("shopping_list_items")
    .select("trip_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr || !item) return { ok: false, errorKey: "rls_denied" };

  const memberId = await resolveMemberId(
    supabase,
    (item as { trip_id: string }).trip_id,
    userId
  );
  if (!memberId) return { ok: false, errorKey: "rls_denied" };

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.TOGGLE_SHOPPING_ITEM, userId, () =>
      setItemClaim(supabase, itemId, claimed ? memberId : null)
    );
    return { ok: true };
  } catch (err) {
    return mapDbError(err, "shopping_list_save_rejected", "shopping_list_save_failed");
  }
}

// ---- amendShoppingItem --------------------------------------------

const amendSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v ? v : null))
    .nullable()
    .optional(),
  costCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
});

export interface AmendShoppingItemInput {
  name?: string;
  category?: string | null;
  costCents?: number | null;
}

/**
 * Partial-patch amend. Build the db-layer patch from only the keys present
 * in the validated input — `undefined` (key absent) means "leave
 * unchanged"; `null` (on category/costCents) means "explicitly clear".
 * Never forward an `undefined` field, or amending just the name would null
 * out category/cost (gap-A).
 */
export async function amendShoppingItem(
  itemId: string,
  patch: AmendShoppingItemInput
): Promise<ToggleShoppingItemResult> {
  if (!ITEM_ID_SCHEMA.safeParse(itemId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = amendSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const dbPatch: ShoppingItemPatch = {};
  if ("name" in parsed.data && parsed.data.name !== undefined) {
    dbPatch.name = parsed.data.name;
  }
  if ("category" in parsed.data) {
    dbPatch.category = parsed.data.category ?? null;
  }
  if ("costCents" in parsed.data) {
    dbPatch.cost_cents = parsed.data.costCents ?? null;
  }

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.MUTATE_SHOPPING_ITEM, userId, () =>
      amendItem(supabase, itemId, dbPatch)
    );
    return { ok: true };
  } catch (err) {
    return mapDbError(err, "shopping_list_save_rejected", "shopping_list_save_failed");
  }
}

// ---- deleteShoppingItem --------------------------------------------

/** Delete a shopping-list item. RLS-gated no-op delete for a stale target. */
export async function deleteShoppingItem(
  itemId: string
): Promise<ToggleShoppingItemResult> {
  if (!ITEM_ID_SCHEMA.safeParse(itemId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.MUTATE_SHOPPING_ITEM, userId, () =>
      deleteItem(supabase, itemId)
    );
    return { ok: true };
  } catch (err) {
    return mapDbError(
      err,
      "shopping_list_delete_failed",
      "shopping_list_delete_failed"
    );
  }
}
