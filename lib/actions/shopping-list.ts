"use server";

/**
 * Server actions for the standalone shopping list (zero expenses coupling —
 * see notes/shopping-list-exploration.md). Mirrors the `ride-groups.ts`
 * template: one `ShoppingActionError`, one `toErrorResult`, a
 * `resolveMemberId` helper, `rateLimitedAction` wrapping, and the
 * 23505/42501 error-code split for the raw insert. The `amendShoppingItem` /
 * `deleteShoppingItem` mutations route through the Task 2 db layer
 * (`lib/db/shopping-list.ts`) and map its `ShoppingListDbError` (42501 /
 * SHOPPING_ITEM_NO_ROW) to the same `rls_denied` envelope — a
 * filtered-to-zero-rows update looks identical to an explicit RLS rejection
 * from the caller's point of view.
 *
 * `toggleBought` and `setClaim` (the v1 mutations) were retired in Task 5c —
 * v2 folds them into the lifecycle actions below (`assignShoppingItem` /
 * `completeShoppingItem` / `removeShoppingItem` / `reopenShoppingItem`).
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
  reopenItem,
  setItemAssignment,
  setItemCompleted,
  setItemRemoved,
} from "@/lib/db/shopping-list";
import { addShoppingComment } from "@/lib/actions/shopping-item-comments";
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

/**
 * Resolve the parent item's trip and the caller's own member row — the
 * shared context resolver for the v2 lifecycle actions (assign / complete /
 * remove / reopen). Same shape as `resolveCommentContext` in
 * shopping-item-comments.ts: the item select runs under RLS (unseeable
 * item ⇒ null), then the caller's own trip_member_id is resolved (no seat
 * ⇒ null).
 */
async function resolveItemContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  userId: string
): Promise<{ tripId: string; actorMemberId: string } | null> {
  const { data: item } = await supabase
    .from("shopping_list_items")
    .select("trip_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return null;
  const tripId = (item as { trip_id: string }).trip_id;

  const actorMemberId = await resolveMemberId(supabase, tripId, userId);
  if (!actorMemberId) return null;

  return { tripId, actorMemberId };
}

/**
 * SECURITY: RLS lets any member who can see an item UPDATE its mutable
 * columns, including a client-supplied `trip_members.id` attribution
 * column — even one belonging to ANOTHER trip. This is the load-bearing
 * check that rejects a cross-trip target before any setter is called.
 */
async function isSameTripMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  memberId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("trip_members")
    .select("id")
    .eq("id", memberId)
    .eq("trip_id", tripId)
    .maybeSingle();
  return !!data;
}

/**
 * Resolve the (claimed_by, claim_assigned_by) pair for an assignment.
 * `claim_assigned_by` is null on a self-claim (target === actor) or an
 * "Open — no one" clear (target null), and the SERVER-resolved actor member id
 * on an on-behalf assign. This rule is load-bearing (self vs on-behalf
 * provenance) and shared by assign + reopen — keep it in ONE place.
 */
function computeClaimAttribution(
  target: string | null,
  actorMemberId: string
): { claimedBy: string | null; claimAssignedBy: string | null } {
  const claimAssignedBy =
    target === null || target === actorMemberId ? null : actorMemberId;
  return { claimedBy: target, claimAssignedBy };
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
  console.error("[shopping-list] mapDbError unexpected:", err);
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

// ---- shared result type ----------------------------------------------

export type ToggleShoppingItemResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

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
 *
 * NOTE: shipped (action + db + tests) but NOT yet wired to any UI affordance
 * as of PR2. Neither PR1's ShoppingItemCard (claim/got-it/delete only, spec §7)
 * nor PR2's ShoppingItemSheet (§12.6) surfaces an edit gesture — the plan's card
 * spec omitted amend, and the sheet shipped without it. The capability is
 * correct and callable; the edit UI is a tracked follow-up (issue #604). See
 * notes/decisions.md "Shopping list — amend deferral + row-👍" ADR. Do not
 * treat as dead code.
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

  // An empty patch (no keys survived validation) has nothing to write —
  // reject before hitting the db rather than issuing a no-op `update({})`.
  if (Object.keys(dbPatch).length === 0) {
    return { ok: false, errorKey: "validation_failed" };
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

/**
 * Delete a shopping-list item. RLS-gated no-op delete for a stale target.
 *
 * Idempotent on double-tap (rule 9 — drunk-user-on-bad-signal): a second
 * delete of an already-deleted row hits `SHOPPING_ITEM_NO_ROW` in the Task 2
 * db layer. Unlike `amendShoppingItem` (where a no-row match is genuinely
 * ambiguous between "already handled" and "you can't see this"), a
 * delete's no-row case has only one honest reading —
 * the desired end state (gone) is already true — so it's treated as
 * success, not folded into `mapDbError`'s shared `rls_denied` collapse.
 */
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
    // Already gone — a double-tapped delete converges to success rather
    // than falling into mapDbError's shared NO_ROW->rls_denied collapse.
    if (err instanceof ShoppingListDbError && err.code === SHOPPING_ITEM_NO_ROW) {
      return { ok: true };
    }
    return mapDbError(
      err,
      "shopping_list_delete_failed",
      "shopping_list_delete_failed"
    );
  }
}

// ---- v2 lifecycle actions: assign / complete / remove / reopen ------
//
// SECURITY CARRY-FORWARD (Task 1 review): RLS lets any member who can see
// an item UPDATE its mutable columns, including writing an arbitrary
// trip_members.id (even one from ANOTHER trip) into the attribution
// columns. The *assigner* / *remover* is always the SERVER-resolved actor
// member id — never accepted from the client. Only the *target* (assign
// target, completed-by) is client-supplied, and every client-supplied
// target is validated same-trip via `isSameTripMember` before any setter
// runs. See the module report for the per-column breakdown.

const TARGET_MEMBER_SCHEMA = z.string().uuid().nullable();

// ---- assignShoppingItem --------------------------------------------

/**
 * Assign (or unassign, `targetMemberId: null`) an item's claim. Serves both
 * "I'll complete" (client passes its own viewerMemberId as target) and
 * Assign/Re-assign to someone else. `claimAssignedBy` is null on a
 * self-claim (no attribution needed for claiming your own work) and the
 * SERVER-resolved actor on an on-behalf assignment — never the client.
 */
export async function assignShoppingItem(
  itemId: string,
  targetMemberId: string | null
): Promise<ToggleShoppingItemResult> {
  if (!ITEM_ID_SCHEMA.safeParse(itemId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  if (!TARGET_MEMBER_SCHEMA.safeParse(targetMemberId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const context = await resolveItemContext(supabase, itemId, userId);
  if (!context) return { ok: false, errorKey: "rls_denied" };
  const { tripId, actorMemberId } = context;

  if (targetMemberId !== null) {
    const validTarget = await isSameTripMember(supabase, tripId, targetMemberId);
    if (!validTarget) return { ok: false, errorKey: "rls_denied" };
  }

  const { claimedBy, claimAssignedBy } = computeClaimAttribution(
    targetMemberId,
    actorMemberId
  );

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.TOGGLE_SHOPPING_ITEM, userId, () =>
      setItemAssignment(supabase, itemId, claimedBy, claimAssignedBy)
    );
    return { ok: true };
  } catch (err) {
    return mapDbError(err, "shopping_list_save_rejected", "shopping_list_save_failed");
  }
}

// ---- completeShoppingItem --------------------------------------------

/**
 * Mark an item complete. Anyone who can see the item may complete it —
 * including someone else's in-progress item; the actor does not need to
 * be the claimer. `completedByMemberId` is client-supplied and must be
 * validated same-trip before the setter runs.
 */
export async function completeShoppingItem(
  itemId: string,
  completedByMemberId: string
): Promise<ToggleShoppingItemResult> {
  if (!ITEM_ID_SCHEMA.safeParse(itemId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  if (!ITEM_ID_SCHEMA.safeParse(completedByMemberId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const context = await resolveItemContext(supabase, itemId, userId);
  if (!context) return { ok: false, errorKey: "rls_denied" };
  const { tripId } = context;

  const validTarget = await isSameTripMember(supabase, tripId, completedByMemberId);
  if (!validTarget) return { ok: false, errorKey: "rls_denied" };

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.TOGGLE_SHOPPING_ITEM, userId, () =>
      setItemCompleted(supabase, itemId, completedByMemberId)
    );
    return { ok: true };
  } catch (err) {
    return mapDbError(err, "shopping_list_save_rejected", "shopping_list_save_failed");
  }
}

// ---- removeShoppingItem --------------------------------------------

/**
 * Soft-close an item (undoable via reopen). The remover is always the
 * SERVER-resolved actor member id — never accepted from the client.
 */
export async function removeShoppingItem(
  itemId: string
): Promise<ToggleShoppingItemResult> {
  if (!ITEM_ID_SCHEMA.safeParse(itemId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const context = await resolveItemContext(supabase, itemId, userId);
  if (!context) return { ok: false, errorKey: "rls_denied" };
  const { actorMemberId } = context;

  const removedAt = new Date().toISOString();

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.TOGGLE_SHOPPING_ITEM, userId, () =>
      setItemRemoved(supabase, itemId, actorMemberId, removedAt)
    );
    return { ok: true };
  } catch (err) {
    return mapDbError(err, "shopping_list_save_rejected", "shopping_list_save_failed");
  }
}

// ---- reopenShoppingItem --------------------------------------------

export interface ReopenShoppingItemOptions {
  assignTo: string | null;
  comment?: string;
}

/**
 * Re-open an item from Completed or Removed, optionally re-assigning it
 * and/or leaving a note. `reopenItem` is a fixed-target update (idempotent
 * on retry) and runs first as the primary action; a supplied comment posts
 * after, via `addShoppingComment`. A present-but-blank comment (after
 * trim) is treated as "no comment" and ignored. A non-blank comment
 * requires a valid idempotency key — validated BEFORE any write.
 */
export async function reopenShoppingItem(
  itemId: string,
  opts: ReopenShoppingItemOptions,
  idempotencyKey?: string
): Promise<ToggleShoppingItemResult> {
  if (!ITEM_ID_SCHEMA.safeParse(itemId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  if (!TARGET_MEMBER_SCHEMA.safeParse(opts.assignTo).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const trimmedComment = opts.comment?.trim();
  const hasComment = !!trimmedComment;
  if (hasComment && !IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const context = await resolveItemContext(supabase, itemId, userId);
  if (!context) return { ok: false, errorKey: "rls_denied" };
  const { tripId, actorMemberId } = context;

  if (opts.assignTo !== null) {
    const validTarget = await isSameTripMember(supabase, tripId, opts.assignTo);
    if (!validTarget) return { ok: false, errorKey: "rls_denied" };
  }

  const { claimedBy, claimAssignedBy } = computeClaimAttribution(
    opts.assignTo,
    actorMemberId
  );

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.TOGGLE_SHOPPING_ITEM, userId, () =>
      reopenItem(supabase, itemId, claimedBy, claimAssignedBy)
    );
  } catch (err) {
    return mapDbError(err, "shopping_list_save_rejected", "shopping_list_save_failed");
  }

  if (hasComment) {
    // reopenItem is idempotent (fixed-target update), so on a comment-post
    // failure a retry safely replays the comment by idempotency key and
    // re-runs the (idempotent) reopen — do not swallow the failure here.
    const commentResult = await addShoppingComment(
      { itemId, body: trimmedComment! },
      idempotencyKey!
    );
    if (!commentResult.ok) return commentResult;
  }

  return { ok: true };
}
