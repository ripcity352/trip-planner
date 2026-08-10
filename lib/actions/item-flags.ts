"use server";

/**
 * Server actions for per-item member flags (M3 #80).
 *
 * Surface contract:
 *   - `addItemFlag(input)` inserts the caller's own flag for an item.
 *   - `removeItemFlag(itemId, flag)` deletes the caller's own flag ([Remove]).
 *   - `addItemFlagOnBehalf(input)` (#171) — an ORGANIZER transcribes a flag
 *     for another member, attributed to the organizer (`written_by`). The
 *     self path stays `addItemFlag`; on-behalf is a separate, RLS-gated
 *     surface (organizer check enforced server-side AND in RLS).
 *   - `confirmItemFlag(itemId, flag)` (#171) — the target member's [Keep]:
 *     clears attribution, making the transcribed row self-owned.
 *   - SELECT is organizer-only for other members' flags; each member reads
 *     their OWN flags (M4 owner-read), which is how the confirm affordance
 *     surfaces an organizer-written row. The member-side add action still
 *     returns only "saved"/"failed".
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
import type { TripRole } from "@/lib/db/types";

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

// ─── #171 — organizer write-on-behalf + member confirm ──────────────────────

const ORGANIZER_ROLES: ReadonlySet<TripRole> = new Set([
  "organizer",
  "co_organizer",
]);

const addOnBehalfSchema = z.object({
  itemId: z.string().uuid(),
  targetTripMemberId: z.string().uuid(),
  flag: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).nullable().optional(),
});

export interface AddItemFlagOnBehalfInput {
  itemId: string;
  /** The member the flag is FOR (never the caller). */
  targetTripMemberId: string;
  flag: string;
  note?: string | null;
}

/**
 * Resolve the caller's own membership (id + role) for the trip that owns
 * `itemId`. Returns null if the item is missing or the caller isn't a
 * member. Used by the on-behalf path to (a) verify organizer server-side
 * — defense-in-depth mirroring the RLS `is_trip_organizer` clause — and
 * (b) supply the caller's own trip_member_id as `written_by`.
 */
async function resolveCallerMembership(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  itemId: string,
  userId: string
): Promise<{ id: string; role: TripRole } | null> {
  const { data: itemData } = await supabase
    .from("itinerary_items")
    .select("trip_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!itemData) return null;

  const { data: memberData } = await supabase
    .from("trip_members")
    .select("id, role")
    .eq("trip_id", (itemData as { trip_id: string }).trip_id)
    .eq("user_id", userId)
    .maybeSingle();

  return (memberData as { id: string; role: TripRole } | null) ?? null;
}

/**
 * Transcribe a participation flag on a member's behalf (#171). The
 * organizer records a fact the member volunteered out-of-band; the row is
 * attributed to the organizer (`written_by_trip_member_id`) and the member
 * confirms/removes it later. Never sets a flag as if the member wrote it.
 *
 * Authorization is enforced at THREE layers: the RLS on-behalf policy
 * (source of truth), this server-side organizer check (defense-in-depth),
 * and the Zod schema. `targetTripMemberId` must differ from the caller —
 * the self path is `addItemFlag`, and the RLS anti-forgery clause rejects
 * `trip_member_id == written_by` regardless.
 *
 * Idempotent on the (item_id, trip_member_id, flag) unique constraint —
 * re-transcribing the same flag returns ok:true (23505 treated as success).
 */
export async function addItemFlagOnBehalf(
  input: AddItemFlagOnBehalfInput
): Promise<AddItemFlagResult> {
  const parsed = addOnBehalfSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { itemId, targetTripMemberId, flag, note } = parsed.data;

  let writerMemberId: string;
  try {
    const caller = await resolveCallerMembership(supabase, itemId, userId);
    // Defense-in-depth: RLS also blocks this, but failing closed here keeps
    // a non-organizer from ever reaching the insert. (rule #11 — the gate
    // is server-side; the UI simply never renders the affordance.)
    if (!caller || !ORGANIZER_ROLES.has(caller.role)) {
      return { ok: false, errorKey: "rls_denied" };
    }
    // The anti-forgery RLS clause rejects self-targeting, but reject early
    // so the self path (addItemFlag) is used instead of a confusing denial.
    if (caller.id === targetTripMemberId) {
      return { ok: false, errorKey: "validation_failed" };
    }
    writerMemberId = caller.id;
  } catch (err) {
    console.error("[item-flags] on-behalf membership lookup unexpected:", err);
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
            trip_member_id: targetTripMemberId,
            flag,
            note: note ?? null,
            written_by_trip_member_id: writerMemberId,
          });

        if (error) {
          // Flag already exists for this member+item — idempotent success.
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
    console.error("[item-flags] addItemFlagOnBehalf unexpected:", err);
    return { ok: false, errorKey: "item_flag_save_failed" };
  }
}

/**
 * The member's [Keep] on an organizer-transcribed row (#171): clears the
 * attribution, converting the row into a normal self-owned flag. The
 * member's own action is what makes the flag authoritative. Backed by the
 * owner-confirm UPDATE policy (with-check pins the post-state to
 * written_by = NULL). [Remove] is the existing `removeItemFlag` DELETE.
 *
 * Idempotent — confirming an already-self-owned flag is a harmless no-op
 * (the UPDATE matches 0 rows or writes NULL over NULL).
 */
export async function confirmItemFlag(
  itemId: string,
  flag: string
): Promise<AddItemFlagResult> {
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
    console.error("[item-flags] confirm member lookup unexpected:", err);
    return { ok: false, errorKey: "item_flag_save_failed" };
  }

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.SET_ITEM_FLAG,
      userId,
      async () => {
        const { error } = await supabase
          .from("itinerary_item_member_flags")
          .update({ written_by_trip_member_id: null })
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
    console.error("[item-flags] confirmItemFlag unexpected:", err);
    return { ok: false, errorKey: "item_flag_save_failed" };
  }
}
