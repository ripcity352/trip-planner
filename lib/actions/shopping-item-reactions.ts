"use server";

/**
 * Server action for shopping-item reactions (spec §12.5, P2-T4). Clone of
 * `lib/actions/announcement-reactions.ts`, re-keyed by `item_id` against
 * `shopping_list_items` / `shopping_item_reactions`.
 *
 * Surface contract:
 *   - `toggleShoppingReaction({ itemId, emoji, active })` sets the caller's
 *     reaction to a DESIRED END STATE (react / unreact), not a blind flip —
 *     a drunk-double-tap replay converges instead of toggling back off.
 *   - Rule-9 exception: `shopping_item_reactions` has NO idempotency_key
 *     column — the natural-key unique (item_id, trip_member_id, emoji) IS
 *     the idempotency guarantee (announcement_reactions precedent).
 *   - INDEPENDENT toggles: 👍 and 👎 never clear each other. Unlike some
 *     binary-toggle patterns, a member may hold any subset of the six
 *     emoji simultaneously — this is a deliberate simplification (spec
 *     §12.1) that removes the opposite-clear race entirely. Do NOT add
 *     opposite-clear logic here.
 *   - Strictly user-scoped: trip_member_id resolves server-side from
 *     auth.uid(); callers cannot react on behalf of others (RLS backstops
 *     the same).
 *   - Visibility is inherited from the parent item: the parent lookup runs
 *     under RLS, so a hidden parent (celebrant on a surprise item, or a
 *     non-member) resolves to no row and the action returns rls_denied
 *     before any write.
 *   - I12: NO `revalidatePath`, NO `redirect()` — the caller does
 *     `router.refresh()` after `callAction` resolves. This is the one
 *     load-bearing deviation from the `announcement-reactions.ts` clone
 *     source, which still calls `revalidatePath("/trips", "layout")`.
 *   - Aggregate-only boundary (spec §12.2): this action never returns raw
 *     reaction rows or a trip_member_id — the envelope is `{ ok, active }`
 *     only.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import { SHOPPING_REACTION_EMOJI } from "@/lib/reactions/shopping-constants";
import type { ShoppingReactionEmoji } from "@/lib/reactions/shopping-constants";
import type { ErrorKey } from "@/lib/copy/errors";

const toggleShoppingReactionSchema = z.object({
  itemId: z.string().uuid(),
  emoji: z.enum(SHOPPING_REACTION_EMOJI),
  active: z.boolean(),
});

export interface ToggleShoppingReactionInput {
  itemId: string;
  /** Typed as string at the boundary; zod narrows to the fixed set. */
  emoji: string;
  /** Desired end state: true = reacted, false = not reacted. */
  active: boolean;
}

export type ToggleShoppingReactionResult =
  | { ok: true; active: boolean }
  | { ok: false; errorKey: ErrorKey };

type ServerSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

/**
 * Resolve the parent shopping item's trip and the caller's own member row.
 * The item select runs under RLS — a parent the caller can't see (wrong
 * trip, or hidden by visibility, e.g. hide_from_celebrant) resolves to
 * null.
 */
async function resolveShoppingReactionContext(
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

/**
 * Set the caller's reaction on a shopping item to the desired end state.
 * Idempotent in both directions (see module header). No opposite-clear —
 * each emoji toggles independently.
 */
export async function toggleShoppingReaction(
  input: ToggleShoppingReactionInput
): Promise<ToggleShoppingReactionResult> {
  const parsed = toggleShoppingReactionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { itemId, emoji, active } = parsed.data;

  let tripId: string;
  let tripMemberId: string;
  try {
    const context = await resolveShoppingReactionContext(
      supabase,
      itemId,
      userId
    );
    if (!context) return { ok: false, errorKey: "rls_denied" };
    tripId = context.tripId;
    tripMemberId = context.tripMemberId;
  } catch (err) {
    console.error(
      "[shopping-item-reactions] context lookup unexpected:",
      err
    );
    return { ok: false, errorKey: "shopping_reaction_save_failed" };
  }

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.TOGGLE_SHOPPING_ITEM,
      userId,
      () =>
        active
          ? insertShoppingReaction(supabase, itemId, tripId, tripMemberId, emoji)
          : deleteShoppingReaction(supabase, itemId, tripMemberId, emoji)
    );

    return { ok: true, active };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ShoppingReactionActionError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied"
            ? "rls_denied"
            : "shopping_reaction_save_failed",
      };
    }
    console.error("[shopping-item-reactions] toggle unexpected:", err);
    return { ok: false, errorKey: "shopping_reaction_save_failed" };
  }
}

async function insertShoppingReaction(
  supabase: ServerSupabase,
  itemId: string,
  tripId: string,
  tripMemberId: string,
  emoji: ShoppingReactionEmoji
): Promise<void> {
  const { error } = await supabase.from("shopping_item_reactions").insert({
    item_id: itemId,
    trip_id: tripId,
    trip_member_id: tripMemberId,
    emoji,
  });

  if (error) {
    // Natural-key replay: the reaction already exists — desired state
    // reached, treat as success (rule-9 exception, see module header).
    if (error.code === "23505") return;
    if (error.code === "42501") throw new ShoppingReactionActionError("rls_denied");
    throw new ShoppingReactionActionError("save_failed");
  }
}

async function deleteShoppingReaction(
  supabase: ServerSupabase,
  itemId: string,
  tripMemberId: string,
  emoji: ShoppingReactionEmoji
): Promise<void> {
  const { error } = await supabase
    .from("shopping_item_reactions")
    .delete()
    .eq("item_id", itemId)
    .eq("trip_member_id", tripMemberId)
    .eq("emoji", emoji);

  if (error) {
    if (error.code === "42501") throw new ShoppingReactionActionError("rls_denied");
    throw new ShoppingReactionActionError("save_failed");
  }
  // A 0-row delete is a successful no-op: desired state already holds.
}

class ShoppingReactionActionError extends Error {
  readonly reason: "save_failed" | "rls_denied";

  constructor(reason: "save_failed" | "rls_denied") {
    super(`shopping_reaction_action_error:${reason}`);
    this.name = "ShoppingReactionActionError";
    this.reason = reason;
  }
}
